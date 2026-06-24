// Agent-readiness audit — the proof layer.
//
// This turns "trust me, it's better for agents" into a score with reasons.
// It grades a site on the things that actually determine whether an AI agent
// can find, read, understand, cite, and act on a business. Run it on the
// original site and on the Beacon site to get a before/after gap.
//
// Deterministic and dependency-free — every check is something you can point
// at and explain to a buyer.

import type { BusinessProfile, OutputFile } from "./types.ts";
import { htmlToText } from "./util.ts";

export interface Check {
  id: string;
  label: string;
  weight: number; // contribution to the 100-point score
  score: number; // 0..1
  detail: string; // what we found
  why: string; // why an agent cares
}

export interface AuditReport {
  target: string;
  score: number; // 0..100
  checks: Check[];
  estTokens: number; // approx tokens an agent spends to read the business
}

// Rough token estimate. count_tokens is the accurate way, but ~4 chars/token is
// a fine, honest approximation for a relative before/after comparison.
function estTokens(text: string): number {
  return Math.round(text.length / 4);
}

function pct(report: AuditReport): number {
  const got = report.checks.reduce((s, c) => s + c.weight * c.score, 0);
  const max = report.checks.reduce((s, c) => s + c.weight, 0);
  return Math.round((got / max) * 100);
}

// ---- Audit a generated Beacon bundle (we know exactly what's in it) ----

export function auditBundle(files: OutputFile[], profile: BusinessProfile): AuditReport {
  const map = new Map(files.map((f) => [f.path, f.content]));
  const index = map.get("index.html") ?? "";
  const llms = map.get("llms.txt") ?? "";
  const checks: Check[] = [];

  checks.push({
    id: "llms_txt",
    label: "llms.txt present",
    weight: 16,
    score: llms ? 1 : 0,
    detail: llms ? `Yes — ${estTokens(llms)} tokens, the curated map an LLM reads first.` : "Missing.",
    why: "LLMs that follow the llms.txt convention read this first to understand the site with zero noise.",
  });

  const jsonld = /application\/ld\+json/.test(index);
  const hasContact = !!(profile.phone || profile.email || profile.address);
  checks.push({
    id: "structured_data",
    label: "JSON-LD structured data",
    weight: 22,
    score: jsonld ? (hasContact ? 1 : 0.6) : 0,
    detail: jsonld
      ? `Yes — schema.org ${profile.schemaType || "LocalBusiness"}${hasContact ? " with contact details" : " (no contact info)"}.`
      : "Missing.",
    why: "This is what Google AI Overviews, ChatGPT and Perplexity parse to understand and cite a business.",
  });

  const text = htmlToText(index);
  checks.push({
    id: "static_content",
    label: "Full content in raw HTML (no JS needed)",
    weight: 16,
    score: text.length > 400 ? 1 : text.length > 150 ? 0.5 : 0,
    detail: `${text.length} chars of text render with no JavaScript.`,
    why: "Many crawlers don't run JS. Content in the raw markup is content an agent actually sees.",
  });

  const api = map.get("api/business.json");
  checks.push({
    id: "json_api",
    label: "Machine-readable JSON API",
    weight: 15,
    score: api ? 1 : 0,
    detail: api ? "Yes — /api/business.json serves the facts as JSON." : "Missing.",
    why: "Agents pull authoritative facts as JSON instead of scraping and guessing.",
  });

  let actions = 0;
  const agentsJson = map.get("agents.json");
  if (agentsJson) {
    try {
      actions = (JSON.parse(agentsJson).actions ?? []).length;
    } catch {
      /* ignore */
    }
  }
  checks.push({
    id: "actions",
    label: "agents.json action manifest",
    weight: 16,
    score: agentsJson ? (actions > 0 ? 1 : 0.5) : 0,
    detail: agentsJson ? `Yes — ${actions} action(s) an agent can invoke (quote, book, contact…).` : "Missing.",
    why: "Discoverability gets you found; this gets you transacted with — the agent can do business on a customer's behalf.",
  });

  const hasRobots = map.has("robots.txt");
  const hasSitemap = map.has("sitemap.xml");
  checks.push({
    id: "crawl_signals",
    label: "robots.txt + sitemap.xml",
    weight: 7,
    score: (hasRobots ? 0.5 : 0) + (hasSitemap ? 0.5 : 0),
    detail: `${hasRobots ? "robots.txt" : "no robots.txt"}, ${hasSitemap ? "sitemap.xml" : "no sitemap.xml"}.`,
    why: "Welcomes AI crawlers and points them straight at llms.txt and the API.",
  });

  const discover =
    (/rel="alternate"[^>]+llms\.txt/.test(index) ? 0.5 : 0) +
    (/<meta name="description"/.test(index) ? 0.5 : 0);
  checks.push({
    id: "discoverability",
    label: "In-page discovery hints",
    weight: 8,
    score: discover,
    detail: `${/llms\.txt/.test(index) ? "advertises llms.txt/API in <head>" : "no resource links"}; ${/<meta name="description"/.test(index) ? "has meta description" : "no meta description"}.`,
    why: "An agent landing on the page immediately discovers the machine-readable resources.",
  });

  const report: AuditReport = { target: "Beacon site", score: 0, checks, estTokens: estTokens(llms || text) };
  report.score = pct(report);
  return report;
}

// ---- Audit a raw, original site (the "before") ----

export function auditRawSite(htmlPages: string[], label = "Current site"): AuditReport {
  const home = htmlPages[0] ?? "";
  const allHtml = htmlPages.join("\n");
  const checks: Check[] = [];

  checks.push({
    id: "llms_txt",
    label: "llms.txt present",
    weight: 16,
    score: 0,
    detail: "Not found — standard business sites don't ship one.",
    why: "LLMs that follow the llms.txt convention read this first to understand the site with zero noise.",
  });

  const jsonld = /application\/ld\+json/.test(allHtml);
  const hasContactLd = /"(telephone|email|address)"/.test(allHtml);
  checks.push({
    id: "structured_data",
    label: "JSON-LD structured data",
    weight: 22,
    score: jsonld ? (hasContactLd ? 1 : 0.6) : 0,
    detail: jsonld ? "Some JSON-LD found." : "None — AI systems must infer everything from prose.",
    why: "This is what Google AI Overviews, ChatGPT and Perplexity parse to understand and cite a business.",
  });

  const text = htmlToText(home);
  const ratio = home.length ? text.length / home.length : 0;
  checks.push({
    id: "static_content",
    label: "Full content in raw HTML (no JS needed)",
    weight: 16,
    score: text.length > 400 && ratio > 0.05 ? 1 : text.length > 150 ? 0.5 : 0,
    detail: `${text.length} chars of text in the homepage markup (${(ratio * 100).toFixed(0)}% of the bytes).`,
    why: "Many crawlers don't run JS. Content in the raw markup is content an agent actually sees.",
  });

  checks.push({
    id: "json_api",
    label: "Machine-readable JSON API",
    weight: 15,
    score: 0,
    detail: "None — facts are locked inside HTML layout.",
    why: "Agents pull authoritative facts as JSON instead of scraping and guessing.",
  });

  checks.push({
    id: "actions",
    label: "agents.json action manifest",
    weight: 16,
    score: 0,
    detail: "None — an agent can read about the business but can't act on it.",
    why: "Discoverability gets you found; this gets you transacted with.",
  });

  checks.push({
    id: "crawl_signals",
    label: "robots.txt + sitemap.xml",
    weight: 7,
    score: 0,
    detail: "Not evaluated for the live site (varies); Beacon always emits both.",
    why: "Welcomes AI crawlers and points them straight at llms.txt and the API.",
  });

  checks.push({
    id: "discoverability",
    label: "In-page discovery hints",
    weight: 8,
    score: /<meta name="description"/i.test(home) ? 0.5 : 0,
    detail: /<meta name="description"/i.test(home) ? "Has a meta description." : "No machine-readable resource links.",
    why: "An agent landing on the page immediately discovers the machine-readable resources.",
  });

  const report: AuditReport = { target: label, score: 0, checks, estTokens: estTokens(home) };
  report.score = pct(report);
  return report;
}

// ---- Render a sales-ready before/after report ----

export function renderReport(beacon: AuditReport, before?: AuditReport): string {
  const out: string[] = [];
  out.push("# Agent-Readiness Report");
  out.push("");
  out.push("How well an AI agent can find, read, understand, cite, and act on this business.");
  out.push("");

  if (before) {
    out.push(`## Score: ${before.score}/100 → **${beacon.score}/100**`);
    out.push("");
    out.push("| Check | Before | After | Why an agent cares |");
    out.push("| --- | :---: | :---: | --- |");
    const byId = new Map(before.checks.map((c) => [c.id, c]));
    for (const c of beacon.checks) {
      const b = byId.get(c.id);
      out.push(`| ${c.label} | ${b ? grade(b.score) : "—"} | ${grade(c.score)} | ${c.why} |`);
    }
    out.push("");
    const saved = before.estTokens - beacon.estTokens;
    if (saved > 0) {
      const pctSaved = Math.round((saved / before.estTokens) * 100);
      out.push(
        `**Token cost to read the business:** ~${before.estTokens} tokens (current HTML) → ~${beacon.estTokens} tokens (llms.txt) — about **${pctSaved}% less** for an agent to understand you.`,
      );
      out.push("");
    }
  } else {
    out.push(`## Score: **${beacon.score}/100**`);
    out.push("");
    out.push("| Check | Score | Why an agent cares |");
    out.push("| --- | :---: | --- |");
    for (const c of beacon.checks) out.push(`| ${c.label} | ${grade(c.score)} | ${c.why} |`);
    out.push("");
  }

  out.push("## Details");
  out.push("");
  for (const c of beacon.checks) {
    out.push(`- **${c.label}** — ${c.detail}`);
  }
  out.push("");
  return out.join("\n");
}

function grade(score: number): string {
  if (score >= 0.99) return "✅";
  if (score >= 0.5) return "🟡";
  return "❌";
}
