#!/usr/bin/env node
// Beacon A/B eval CLI — prove the outcome, not just the capability.
//
//   node src/eval-cli.ts <original-site> <beacon-out-dir> [--model <id>]
//
// <original-site>   the business's current site (URL, .html file, or folder)
// <beacon-out-dir>  a directory Beacon already built (must contain llms.txt
//                   and api/business.json)
//
// Writes <beacon-out-dir>/agent-eval.md. Needs ANTHROPIC_API_KEY + the SDK
// (npm install); degrades gracefully and never fabricates a result.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BusinessProfile } from "./types.ts";
import { loadPages } from "./ingest.ts";
import { htmlToText } from "./util.ts";
import { renderEvalReport, runEval } from "./eval.ts";

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let model = "claude-opus-4-8";
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--model") model = argv[++i];
    else if (argv[i] === "-h" || argv[i] === "--help") {
      console.log("Usage: node src/eval-cli.ts <original-site> <beacon-out-dir> [--model <id>]");
      process.exit(0);
    } else positional.push(argv[i]);
  }
  const [original, beaconDir] = positional;
  if (!original || !beaconDir) {
    fail("Usage: node src/eval-cli.ts <original-site> <beacon-out-dir> [--model <id>]");
  }

  // Load the Beacon side.
  let profile: BusinessProfile;
  let afterContext: string;
  try {
    profile = JSON.parse(await readFile(join(beaconDir, "api/business.json"), "utf8"));
    afterContext = await readFile(join(beaconDir, "llms.txt"), "utf8");
  } catch {
    fail(`Could not read ${beaconDir}/api/business.json and ${beaconDir}/llms.txt — build the site first.`);
  }

  // Load the original side.
  const { pages, notes: loadNotes } = await loadPages(original, true);
  for (const n of loadNotes) process.stderr.write(`  • ${n}\n`);
  if (!pages.length) fail(`Could not read the original site at ${original}.`);
  const beforeContext = pages.map((p) => htmlToText(p.html)).join("\n\n");

  process.stderr.write("Running A/B agent eval …\n");
  const { report, notes } = await runEval(profile, beforeContext, afterContext, model);
  for (const n of notes) process.stderr.write(`  • ${n}\n`);

  if (!report) {
    process.stderr.write("\nNo report produced (see notes above).\n");
    process.exit(1);
  }

  const md = renderEvalReport(report, profile.name);
  const outPath = join(beaconDir, "agent-eval.md");
  await writeFile(outPath, md, "utf8");
  process.stderr.write(
    `\n✓ ${report.beforeAccuracy}% → ${report.afterAccuracy}% of buyer questions answered correctly\n` +
      `  Tokens to read the business: ${report.beforeContextTokens} → ${report.afterContextTokens}\n` +
      `  Report → ${outPath}\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
