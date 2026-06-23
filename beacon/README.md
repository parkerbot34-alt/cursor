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

The input can be a **whole website folder** (most reliable — you "drop the site
in"), a single saved HTML file, or a live URL to crawl:

```bash
# Drop in a whole exported website folder and rebuild it agent-friendly
node src/cli.ts ./acme-website-export --mode upgrade --out out/acme

# Drop in the folder + add extra facts, build a separate agent-only site
node src/cli.ts ./acme-website-export --facts facts.json --mode companion --out out/acme

# Or crawl a live URL
node src/cli.ts https://acme.example --mode companion --out out/acme

# Or build purely from facts, no website at all
node src/cli.ts --facts examples/sample-business.json --no-fetch --out out/demo
```

### Optional: `--enrich` (Claude clean-up pass)

Raw HTML extraction captures headings and meta tags but can't *write*. The
`--enrich` flag hands the crawled facts + page text to Claude (`claude-opus-4-8`)
and gets back a polished description, a clean service list, and an FAQ — turning a
messy real website into a finished agent-ready profile.

```bash
npm install   # one-time: pulls @anthropic-ai/sdk (optional dependency)
export ANTHROPIC_API_KEY=sk-ant-...
node src/cli.ts ./acme-website-export --mode companion --enrich --out out/acme
```

- **Optional & non-blocking.** Beacon's core stays zero-dependency. If the SDK
  isn't installed or `ANTHROPIC_API_KEY` is unset, enrichment is skipped and the
  deterministic output stands — the build never fails for lack of it.
- **Honest by construction.** The model is instructed to reorganize only facts
  present on the site and never invent details (prices, phone numbers, claims).
- **Facts still win.** Enrichment runs on the crawl *before* your `--facts` are
  merged, so anything you assert overrides the model.

**Why drop the site in instead of giving a link?** A bare link forces a crawl,
which can fail or be blocked. Handing Beacon the actual files (a saved page or an
exported site folder) is reliable and needs no network — it reads every `.html`
page, aggregates the facts across them into one profile, then rewrites. A live
`http(s)` URL still works when crawling is available; a `file://` path works too.

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
- ~~LLM-assisted content enrichment~~ — done, see `--enrich` above
- A live MCP server per business so agents can call actions directly
- `agents.json` execution layer (actually perform quotes/bookings)
- Deploy command (push the bundle to Vercel/Netlify/S3)
- Validation against Google Rich Results / Schema.org
