// Ingestion: turn a live website (and/or hand-supplied facts) into a
// BusinessProfile. Dependency-free extraction — good enough to seed a profile,
// and intentionally honest about what it could and couldn't find (see sources).

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { BusinessProfile, FAQ, Service } from "./types.ts";
import { collapseWhitespace, decodeEntities } from "./util.ts";

export interface LoadedPage {
  ref: string; // url or file path the page came from
  html: string;
}

export interface IngestResult {
  profile: Partial<BusinessProfile>;
  notes: string[]; // what we found / couldn't find — surfaced to the operator
}

// Fetch a URL's HTML. Returns null on any failure (network gated, 4xx/5xx,
// timeout). Also accepts file:// URLs and local file paths so an operator can
// point Beacon at a saved page when crawling isn't possible. Callers degrade
// gracefully — Beacon never depends on the network to produce a bundle.
export async function fetchHtml(url: string, timeoutMs = 10000): Promise<string | null> {
  // Local file or file:// — read from disk instead of the network.
  if (url.startsWith("file://") || (!/^https?:\/\//i.test(url) && /\.html?$/i.test(url))) {
    try {
      const { readFile } = await import("node:fs/promises");
      const path = url.startsWith("file://") ? new URL(url).pathname : url;
      return await readFile(path, "utf8");
    } catch {
      return null;
    }
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": "BeaconBot/0.1 (+agent-first site generator)" },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function firstMatch(html: string, re: RegExp): string | undefined {
  const m = html.match(re);
  return m ? collapseWhitespace(decodeEntities(m[1])) : undefined;
}

function metaContent(html: string, name: string): string | undefined {
  // Matches <meta name="..." content="..."> and property="og:..." in any order.
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, "i"),
  ];
  for (const re of patterns) {
    const v = firstMatch(html, re);
    if (v) return v;
  }
  return undefined;
}

// Pull any existing JSON-LD blocks — many sites already ship some structured
// data, and it's the highest-quality signal we can find.
export function extractJsonLd(html: string): any[] {
  const out: any[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) out.push(...parsed);
      else if (parsed["@graph"]) out.push(...parsed["@graph"]);
      else out.push(parsed);
    } catch {
      // ignore malformed blocks
    }
  }
  return out;
}

function pickHeadings(html: string, tag: string, limit: number): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < limit) {
    const text = collapseWhitespace(decodeEntities(m[1].replace(/<[^>]+>/g, " ")));
    if (text) out.push(text);
  }
  return out;
}

export function extractFromHtml(html: string, url: string): IngestResult {
  const notes: string[] = [];
  const profile: Partial<BusinessProfile> = { url, sources: [`crawl:${url}`] };

  const jsonld = extractJsonLd(html);
  const org = jsonld.find((n) =>
    /Organization|LocalBusiness|Store|Restaurant|ProfessionalService/i.test(String(n?.["@type"])),
  );
  if (org) {
    notes.push(`Found existing JSON-LD (${org["@type"]}) — using it as the strongest signal.`);
    if (org.name) profile.name = org.name;
    if (org.description) profile.description = org.description;
    if (org.telephone) profile.phone = org.telephone;
    if (org.email) profile.email = org.email;
    if (org.priceRange) profile.priceRange = org.priceRange;
    if (typeof org["@type"] === "string") profile.schemaType = org["@type"];
    if (org.address && typeof org.address === "object") {
      profile.address = {
        street: org.address.streetAddress,
        city: org.address.addressLocality,
        region: org.address.addressRegion,
        postalCode: org.address.postalCode,
        country: org.address.addressCountry,
      };
    }
  } else {
    notes.push("No business JSON-LD found — extracting from page metadata and headings.");
  }

  // Fill gaps from <title>, meta, og:* and headings.
  profile.name ||= metaContent(html, "og:site_name") || firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  profile.description ||=
    metaContent(html, "description") || metaContent(html, "og:description");
  profile.tagline ||= metaContent(html, "og:title");
  profile.logo ||= metaContent(html, "og:image");
  const kw = metaContent(html, "keywords");
  if (kw) profile.keywords = kw.split(",").map((k) => k.trim()).filter(Boolean);

  // Contact details lurking in the page body.
  const email = firstMatch(html, /mailto:([^"'?]+)/i) || firstMatch(html, /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
  if (email && !profile.email) profile.email = email;
  const tel = firstMatch(html, /tel:([+\d().\-\s]{7,})/i);
  if (tel && !profile.phone) profile.phone = collapseWhitespace(tel);

  // Headings give us a rough sense of services offered. Filter out headings
  // that are clearly navigational/boilerplate rather than offerings — this is
  // best-effort, so anything that slips through is flagged for human review.
  const NON_SERVICE =
    /^(home|about( us)?|who we are|our (team|story|story so far)|contact( us)?|get in touch|testimonials?|reviews?|faqs?|frequently asked|blog|news|gallery|why (choose|us)|meet the team|careers|privacy|terms|sitemap|menu|search|sign in|log ?in|subscribe|newsletter|follow us)\b/i;
  const h2 = pickHeadings(html, "h2", 12).filter((h) => !NON_SERVICE.test(h));
  if (h2.length) {
    notes.push(`Captured ${h2.length} section heading(s) as candidate services — review before publishing.`);
    profile.services = h2.map((name) => ({ name }));
  }

  if (!profile.name) notes.push("WARNING: could not determine business name — supply it via --facts.");

  return { profile, notes };
}

// Load one or more pages from whatever the operator dropped in:
//   - a folder of a saved/exported website (every .html page is read)
//   - a single .html file or file:// URL
//   - a live http(s) URL (crawled, unless doFetch is false)
// This is the "drop the website into the tool" path — reading the real files is
// far more reliable than crawling, and works with no network at all.
export async function loadPages(
  input: string,
  doFetch: boolean,
): Promise<{ pages: LoadedPage[]; notes: string[] }> {
  const notes: string[] = [];
  const isHttp = /^https?:\/\//i.test(input);

  // Local path that exists on disk — could be a folder (whole site) or a file.
  if (!isHttp && !input.startsWith("file://")) {
    let info: Awaited<ReturnType<typeof stat>> | null = null;
    try {
      info = await stat(input);
    } catch {
      info = null;
    }
    if (info?.isDirectory()) {
      const entries = await readdir(input, { recursive: true });
      const htmlFiles = entries
        .map((e) => String(e))
        .filter((f) => /\.html?$/i.test(f))
        // Home page first so its facts take precedence during combining.
        .sort((a, b) => homeRank(b) - homeRank(a));
      const pages: LoadedPage[] = [];
      for (const f of htmlFiles) {
        try {
          pages.push({ ref: f, html: await readFile(join(input, f), "utf8") });
        } catch {
          /* skip unreadable file */
        }
      }
      notes.push(`Loaded ${pages.length} page(s) from folder "${input}".`);
      return { pages, notes };
    }
  }

  // Single file, file:// URL, or a live URL we're allowed to fetch.
  if (!isHttp || doFetch) {
    const html = await fetchHtml(input);
    if (html) return { pages: [{ ref: input, html }], notes };
    notes.push(`Could not load ${input} (network gated or path missing). Building from facts only.`);
  }
  return { pages: [], notes };
}

function homeRank(path: string): number {
  return /(^|\/)index\.html?$/i.test(path) ? 1 : 0;
}

// Combine extractions from many pages of one site into a single profile.
// Scalars: first non-empty wins (home page is processed first, so it leads).
// Collections (services, FAQs, products): unioned across pages, de-duplicated.
export function combineExtractions(results: IngestResult[], canonicalUrl?: string): IngestResult {
  const profile: Partial<BusinessProfile> = {};
  const notes: string[] = [];
  const services = new Map<string, Service>();
  const faqs = new Map<string, FAQ>();
  const sources: string[] = [];

  const scalarKeys = [
    "name",
    "description",
    "tagline",
    "email",
    "phone",
    "priceRange",
    "schemaType",
    "logo",
  ] as const;

  for (const r of results) {
    const p = r.profile;
    for (const k of scalarKeys) if (!profile[k] && p[k]) (profile as any)[k] = p[k];
    if (!profile.address && p.address) profile.address = p.address;
    if (!profile.keywords && p.keywords) profile.keywords = p.keywords;
    for (const s of p.services ?? []) {
      const key = s.name.toLowerCase();
      if (!services.has(key)) services.set(key, s);
    }
    for (const f of p.faqs ?? []) {
      const key = f.question.toLowerCase();
      if (!faqs.has(key)) faqs.set(key, f);
    }
    sources.push(...(p.sources ?? []));
    notes.push(...r.notes);
  }

  if (services.size) profile.services = [...services.values()];
  if (faqs.size) profile.faqs = [...faqs.values()];
  profile.sources = [...new Set(sources)];
  if (canonicalUrl) profile.url = canonicalUrl;
  return { profile, notes };
}

// Merge a partial crawl result with operator-supplied facts. Facts win, because
// a human asserting a fact outranks a best-effort extraction.
export function mergeProfiles(
  base: Partial<BusinessProfile>,
  facts: Partial<BusinessProfile>,
): Partial<BusinessProfile> {
  const merged: Partial<BusinessProfile> = { ...base, ...facts };
  // Concatenate provenance from both sides.
  merged.sources = [...(base.sources ?? []), ...(facts.sources ?? []), facts ? "facts:supplied" : ""].filter(Boolean);
  // Prefer richer arrays from facts when present, else keep base.
  for (const key of ["services", "products", "faqs", "actions", "hours", "keywords"] as const) {
    if (facts[key] && (facts[key] as unknown[]).length) (merged as any)[key] = facts[key];
  }
  if (facts.address) merged.address = { ...base.address, ...facts.address };
  if (facts.socials) merged.socials = { ...base.socials, ...facts.socials };
  return merged;
}
