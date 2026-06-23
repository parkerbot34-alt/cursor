# Beacon

**Build a website that an AI agent can actually read — and act on.**

Everyone is racing to make the *agents* smarter. Beacon comes at the problem
from the other side: make the **destination** legible. A Beacon site treats an AI
agent as the primary reader and a human as the secondary one — so a business gets
found in AI searches, understood correctly, cited, and *transacted with*.

> Name is a placeholder — easy to change.

## Why this is different

A normal website hides its facts behind navigation, JavaScript, ads, and layout.
An agent has to scrape, guess, and often gets it wrong. Beacon emits the same
business as clean, structured, machine-first artifacts that today's AI systems
already know how to consume:

| Artifact | What it does | Who reads it |
| --- | --- | --- |
| `llms.txt` / `llms-full.txt` | Curated markdown map of the business, zero noise | LLMs (the [llmstxt.org](https://llmstxt.org) convention) |
| JSON-LD (Schema.org) | Structured facts embedded in the page | Google AI Overviews, ChatGPT, Perplexity |
| Semantic no-JS HTML | Full content in the raw markup | Any crawler/agent |
| `/api/*.json` | Facts as flat JSON, no scraping needed | Agents, integrations |
| `agents.json` | **What an agent can DO** — quote, book, order, contact | Acting agents |
| `robots.txt` + `sitemap.xml` | Welcomes AI crawlers, points to `llms.txt` | Crawlers |

Discoverability tells an AI the business exists. The `agents.json` **actions
manifest** is the transactability layer — it lets an agent do business on a
customer's behalf. That's the "make money from AI" half of the pitch.

## Two modes

- **`companion`** *(default)* — point Beacon at a business's existing site (plus any
  extra facts) and it builds a **separate, agent-only site** that lives alongside
  the human one. The business keeps its current site untouched; the Beacon site is
  the machine-facing front door.
- **`upgrade`** — point Beacon at the existing site and it rebuilds **that** site
  into an agent-friendly version that still works for humans but is now fully
  legible and transactable for AI.

## Usage

Requires **Node ≥ 22.6** (runs TypeScript natively — no install, no build step).

```bash
# Companion site from a live URL, enriched with asserted facts
node src/cli.ts https://acme.example --mode companion --facts facts.json --out out/acme

# Upgrade an existing site (crawl + rebuild)
node src/cli.ts https://acme.example --mode upgrade --out out/acme

# Build purely from facts, no network
node src/cli.ts --facts examples/sample-business.json --no-fetch --out out/demo
```

The `<url>` may be a live `http(s)` URL or a local/`file://` HTML path (handy when
crawling is blocked — just save the page first).

### Facts file

A JSON file matching [`src/types.ts`](src/types.ts) `BusinessProfile`. Asserted
facts always win over crawled data, because a human asserting a fact outranks a
best-effort extraction. See [`examples/sample-business.json`](examples/sample-business.json).

## How it fits together

```
URL ──▶ ingest.ts ──┐
                    ├─▶ BusinessProfile ──▶ generators ──▶ bundle ──▶ out/
facts.json ─────────┘   (the one model)      (llms, jsonld,
                                              html, api, agents)
```

Everything funnels through one normalized `BusinessProfile`. Ingestion fills it
in (and records provenance in `sources`); each generator reads from it. To
support a new business type or a new artifact, you touch the model or add one
generator — never the whole pipeline.

## Status

Working MVP, **zero dependencies**. Both modes generate a complete, deployable,
statically-hostable bundle. Verified end-to-end on the bundled examples.

### Roadmap ideas

- Smarter extraction (cheerio/readability) and richer service/product detection
- LLM-assisted content enrichment (write the `description`/FAQ from sparse facts)
- A live MCP server per business so agents can call actions directly
- `agents.json` execution layer (actually perform quotes/bookings)
- Deploy command (push the bundle to Vercel/Netlify/S3)
- Validation against Google Rich Results / Schema.org
