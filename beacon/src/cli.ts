#!/usr/bin/env node
// Beacon CLI — generate an agent-first website for a business.
//
//   node src/cli.ts <url> [options]
//
// Modes:
//   --mode companion   build a SEPARATE agent-only site alongside the human site (default)
//   --mode upgrade     rebuild the EXISTING site into an agent-friendly version
//
// Options:
//   --facts <file>     JSON file of asserted business facts (merged over the crawl; facts win)
//   --out <dir>        output directory (default: ./out)
//   --no-fetch         skip crawling; build purely from --facts
//
// Either a <url> or --facts (or both) is required.

import { readFile } from "node:fs/promises";
import type { BuildMode, BusinessProfile } from "./types.ts";
import { extractFromHtml, fetchHtml, mergeProfiles } from "./ingest.ts";
import { assembleBundle, writeBundle } from "./build.ts";

interface Args {
  url?: string;
  mode: BuildMode;
  facts?: string;
  out: string;
  fetch: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { mode: "companion", out: "out", fetch: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mode") args.mode = argv[++i] as BuildMode;
    else if (a === "--facts") args.facts = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--no-fetch") args.fetch = false;
    else if (a === "-h" || a === "--help") {
      printHelp();
      process.exit(0);
    } else if (!a.startsWith("-")) args.url = a;
    else {
      console.error(`Unknown option: ${a}`);
      process.exit(1);
    }
  }
  if (args.mode !== "companion" && args.mode !== "upgrade") {
    console.error(`--mode must be "companion" or "upgrade"`);
    process.exit(1);
  }
  return args;
}

function printHelp(): void {
  console.log(`Beacon — build a website that an AI agent can actually read and act on.

Usage:
  node src/cli.ts <url> [--mode companion|upgrade] [--facts facts.json] [--out dir] [--no-fetch]

Modes:
  companion  Separate agent-only site alongside the existing human site (default)
  upgrade    Rebuild the existing site into an agent-friendly version

Examples:
  node src/cli.ts https://acme.example --mode companion --out out/acme
  node src/cli.ts --facts examples/sample-business.json --no-fetch --out out/demo
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.url && !args.facts) {
    console.error("Error: provide a <url>, --facts <file>, or both.\n");
    printHelp();
    process.exit(1);
  }

  let profile: Partial<BusinessProfile> = {};
  const notes: string[] = [];

  if (args.url && args.fetch) {
    process.stderr.write(`Crawling ${args.url} …\n`);
    const html = await fetchHtml(args.url);
    if (html) {
      const res = extractFromHtml(html, args.url);
      profile = res.profile;
      notes.push(...res.notes);
    } else {
      notes.push(
        `Could not fetch ${args.url} (network gated or site unavailable). Building from facts only.`,
      );
      profile = { url: args.url, sources: [`crawl-failed:${args.url}`] };
    }
  } else if (args.url) {
    profile = { url: args.url, sources: [`url:${args.url}`] };
  }

  if (args.facts) {
    const raw = await readFile(args.facts, "utf8");
    const facts = JSON.parse(raw) as Partial<BusinessProfile>;
    profile = mergeProfiles(profile, facts);
    notes.push(`Merged asserted facts from ${args.facts}.`);
  }

  if (!profile.name) {
    console.error(
      "\nError: no business name could be determined. Supply --facts with at least { \"name\": \"…\" }.",
    );
    process.exit(1);
  }

  const final = profile as BusinessProfile;
  if (args.mode === "companion" && final.url) final.agentUrl ||= undefined;

  const files = assembleBundle(final, args.mode);
  await writeBundle(files, args.out);

  process.stderr.write("\n");
  for (const n of notes) process.stderr.write(`  • ${n}\n`);
  process.stderr.write(`\n✓ Built ${files.length} files (mode: ${args.mode}) → ${args.out}/\n`);
  for (const f of files) process.stderr.write(`    ${args.out}/${f.path}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
