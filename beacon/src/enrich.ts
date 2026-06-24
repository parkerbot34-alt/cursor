// Optional LLM enrichment pass.
//
// Raw HTML extraction is *extraction*, not *understanding* — it captures
// headings and meta tags but can't write a clean description or turn a page
// into a tidy service list and FAQ. This pass hands the crawled facts + the
// page text to Claude and gets back polished, structured fields.
//
// Design constraints that matter here:
//   • OPTIONAL — Beacon's core is zero-dependency. This module dynamically
//     imports the official Anthropic SDK; if it (or the API key) is missing,
//     enrichment is skipped and the deterministic output stands. The tool
//     never hard-fails for lack of enrichment.
//   • HONEST — the model is instructed to reorganize only facts present in the
//     supplied content and never to invent details (phone numbers, prices,
//     claims). Enrichment improves legibility, it does not fabricate a business.
//   • Enrichment runs on the *crawl* result, BEFORE operator facts are merged,
//     so hand-asserted facts always win over anything the model produced.

import type { BusinessProfile, FAQ, Service } from "./types.ts";

export interface EnrichResult {
  profile: Partial<BusinessProfile>;
  notes: string[];
}

// The shape we ask Claude to return. Structured outputs guarantee it parses.
// Every field is required (a strict-schema requirement); the model returns
// empty strings / arrays when the site doesn't support a value, and prune()
// drops those downstream.
const ENRICH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    description: { type: "string" },
    tagline: { type: "string" },
    schemaType: {
      type: "string",
      description: "schema.org type, e.g. LocalBusiness, Restaurant, Plumber, AccountingService",
    },
    keywords: { type: "array", items: { type: "string" } },
    services: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          price: { type: "string" },
        },
        required: ["name", "description", "price"],
      },
    },
    faqs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { question: { type: "string" }, answer: { type: "string" } },
        required: ["question", "answer"],
      },
    },
  },
  required: ["description", "tagline", "schemaType", "keywords", "services", "faqs"],
} as const;

const SYSTEM = `You turn a small business's existing website content into clean, structured data for an AI-readable site.

Strict rules:
- Use ONLY information present in the provided content. Do NOT invent or guess facts — no made-up prices, phone numbers, certifications, hours, or claims.
- If a field isn't supported by the content, return an empty string (or empty array). Empty is correct; fabrication is not.
- Write the description as 1-3 plain, factual sentences an AI could quote when recommending the business.
- Derive services from what the business actually offers. Give each a short factual description; include price ONLY if the content states one.
- Only include FAQs whose answers are grounded in the content.
- Choose the most specific accurate schema.org type.`;

// Trim the page text we send so we stay well within a sane request size.
const MAX_TEXT_CHARS = 24000;

export async function enrichProfile(
  crawl: Partial<BusinessProfile>,
  pageText: string,
  model = "claude-opus-4-8",
): Promise<EnrichResult> {
  const notes: string[] = [];

  if (!process.env.ANTHROPIC_API_KEY) {
    notes.push("Enrichment skipped: ANTHROPIC_API_KEY is not set. Built deterministic output instead.");
    return { profile: crawl, notes };
  }

  let Anthropic: any;
  try {
    Anthropic = (await import("@anthropic-ai/sdk")).default;
  } catch {
    notes.push(
      "Enrichment skipped: @anthropic-ai/sdk is not installed (run `npm install` in beacon/). Built deterministic output instead.",
    );
    return { profile: crawl, notes };
  }

  const client = new Anthropic();
  const text = pageText.length > MAX_TEXT_CHARS ? pageText.slice(0, MAX_TEXT_CHARS) : pageText;
  const prompt = `Business name: ${crawl.name ?? "(unknown)"}
Website: ${crawl.url ?? "(unknown)"}

Roughly extracted so far (may be noisy/incomplete):
${JSON.stringify(
  {
    description: crawl.description,
    services: crawl.services?.map((s) => s.name),
    keywords: crawl.keywords,
  },
  null,
  2,
)}

Full visible text from the business's website:
"""
${text}
"""

Produce the cleaned, structured fields. Remember: only use facts present above.`;

  let data: any;
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
      output_config: { format: { type: "json_schema", schema: ENRICH_SCHEMA } },
    });
    if (res.stop_reason === "refusal") {
      notes.push("Enrichment skipped: the model declined this request. Built deterministic output instead.");
      return { profile: crawl, notes };
    }
    const block = res.content.find((b: any) => b.type === "text");
    data = JSON.parse(block.text);
  } catch (err) {
    notes.push(`Enrichment failed (${(err as Error).message}). Built deterministic output instead.`);
    return { profile: crawl, notes };
  }

  // Merge enriched prose over the crawl. Keep all verified contact/factual
  // fields from the crawl untouched — the model only improves the soft fields.
  const enriched: Partial<BusinessProfile> = { ...crawl };
  if (data.description) enriched.description = data.description;
  if (data.tagline) enriched.tagline = data.tagline;
  if (data.schemaType) enriched.schemaType = data.schemaType;
  if (Array.isArray(data.keywords) && data.keywords.length) enriched.keywords = data.keywords;
  if (Array.isArray(data.services) && data.services.length) {
    enriched.services = data.services
      .filter((s: Service) => s.name)
      .map((s: Service) => ({ name: s.name, description: s.description || undefined, price: s.price || undefined }));
  }
  if (Array.isArray(data.faqs) && data.faqs.length) {
    enriched.faqs = data.faqs.filter((f: FAQ) => f.question && f.answer);
  }
  enriched.sources = [...(crawl.sources ?? []), `enriched:${model}`];

  notes.push(`Enriched with ${model}: cleaned description, ${enriched.services?.length ?? 0} service(s), ${enriched.faqs?.length ?? 0} FAQ(s).`);
  return { profile: enriched, notes };
}
