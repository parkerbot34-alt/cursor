// llms.txt — the emerging convention (llmstxt.org) for handing an LLM a clean,
// curated, markdown map of a site with zero nav/ads/JS noise. We emit both:
//   /llms.txt       — concise index an agent reads first
//   /llms-full.txt  — the full business facts inlined, for deep questions

import type { BusinessProfile } from "../types.ts";

function line(label: string, value?: string): string | null {
  return value ? `- **${label}:** ${value}` : null;
}

function formatAddress(p: BusinessProfile): string | undefined {
  const a = p.address;
  if (!a) return undefined;
  return [a.street, a.city, a.region, a.postalCode, a.country].filter(Boolean).join(", ");
}

function formatHours(p: BusinessProfile): string[] {
  if (!p.hours?.length) return [];
  return p.hours.map((h) => `- ${h.days.join(", ")}: ${h.opens}–${h.closes}`);
}

export function buildLlmsTxt(p: BusinessProfile): string {
  const out: string[] = [];
  out.push(`# ${p.name}`);
  out.push("");
  if (p.tagline || p.description) {
    out.push(`> ${p.tagline || p.description}`);
    out.push("");
  }
  if (p.tagline && p.description) {
    out.push(p.description!);
    out.push("");
  }

  const facts = [
    line("Website", p.url),
    line("Phone", p.phone),
    line("Email", p.email),
    line("Address", formatAddress(p)),
    line("Price range", p.priceRange),
    line("Areas served", p.areaServed?.join(", ")),
  ].filter(Boolean) as string[];
  if (facts.length) {
    out.push("## Contact & details");
    out.push(...facts);
    out.push("");
  }

  const hours = formatHours(p);
  if (hours.length) {
    out.push("## Hours");
    out.push(...hours);
    out.push("");
  }

  if (p.services?.length) {
    out.push("## Services");
    for (const s of p.services) {
      const price = s.price ? ` — ${s.price}` : "";
      const desc = s.description ? `: ${s.description}` : "";
      out.push(`- **${s.name}**${price}${desc}`);
    }
    out.push("");
  }

  if (p.products?.length) {
    out.push("## Products");
    for (const pr of p.products) {
      const price = pr.price ? ` — ${pr.price}` : "";
      out.push(`- **${pr.name}**${price}${pr.description ? `: ${pr.description}` : ""}`);
    }
    out.push("");
  }

  if (p.actions?.length) {
    out.push("## What an agent can do here");
    for (const a of p.actions) {
      out.push(`- **${a.name}** (${a.kind}): ${a.description}`);
    }
    out.push("See `/agents.json` for machine-readable action definitions.");
    out.push("");
  }

  if (p.faqs?.length) {
    out.push("## FAQ");
    for (const f of p.faqs) {
      out.push(`**Q: ${f.question}**`);
      out.push(`A: ${f.answer}`);
      out.push("");
    }
  }

  out.push("## Machine-readable resources");
  out.push("- [Structured business data](/api/business.json): full profile as JSON");
  if (p.services?.length) out.push("- [Services](/api/services.json): list of services as JSON");
  out.push("- [Agent actions](/agents.json): actions an AI agent can perform");
  out.push("- [Full details](/llms-full.txt): everything inlined for deep questions");
  out.push("");

  return out.join("\n");
}

// The "full" variant inlines FAQ answers and service descriptions in prose so an
// agent answering a detailed question never needs another fetch.
export function buildLlmsFullTxt(p: BusinessProfile): string {
  const out: string[] = [buildLlmsTxt(p)];
  out.push("---");
  out.push("");
  out.push("## Full reference");
  out.push("");
  if (p.description) {
    out.push("### About");
    out.push(p.description);
    out.push("");
  }
  if (p.services?.length) {
    out.push("### Services in detail");
    for (const s of p.services) {
      out.push(`#### ${s.name}`);
      if (s.price) out.push(`Price: ${s.price}`);
      if (s.description) out.push(s.description);
      out.push("");
    }
  }
  if (p.sources?.length) {
    out.push("### Data provenance");
    out.push("This profile was assembled from:");
    for (const s of p.sources) out.push(`- ${s}`);
    out.push("");
  }
  return out.join("\n");
}
