// Ingestion: turn a live website (and/or hand-supplied facts) into a
// BusinessProfile. Dependency-free extraction — good enough to seed a profile,
// and intentionally honest about what it could and couldn't find (see sources).

import type { BusinessProfile } from "./types.ts";
import { collapseWhitespace, decodeEntities } from "./util.ts";

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

  // Headings give us a rough sense of services offered.
  const h2 = pickHeadings(html, "h2", 12);
  if (h2.length) {
    notes.push(`Captured ${h2.length} section heading(s) as candidate services — review before publishing.`);
    profile.services = h2.map((name) => ({ name }));
  }

  if (!profile.name) notes.push("WARNING: could not determine business name — supply it via --facts.");

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
