// Orchestrator: given a finished BusinessProfile and a mode, assemble the full
// agent-first bundle and write it to disk.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BuildMode, BusinessProfile, OutputFile } from "./types.ts";
import { buildHtml } from "./generators/html.ts";
import { buildLlmsFullTxt, buildLlmsTxt } from "./generators/llms.ts";
import { buildAgentsJson } from "./generators/agents.ts";
import { buildApiFiles } from "./generators/api.ts";

function robotsTxt(p: BusinessProfile): string {
  // Explicitly welcome AI crawlers and point them at llms.txt.
  return [
    "# This site is built to be read by AI agents.",
    "User-agent: *",
    "Allow: /",
    "",
    "# Curated map for LLMs:",
    "# /llms.txt",
    "# /agents.json",
    p.agentUrl || p.url ? `Sitemap: ${(p.agentUrl || p.url)!.replace(/\/$/, "")}/sitemap.xml` : "",
    "",
  ]
    .filter((l) => l !== undefined)
    .join("\n");
}

function sitemapXml(p: BusinessProfile): string {
  const base = (p.agentUrl || p.url || "").replace(/\/$/, "");
  const url = base ? `${base}/` : "/";
  // <lastmod> is a freshness signal — crawlers and AI search favor (and cite
  // more confidently) content they can see is current.
  const lastmod = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">
  <url><loc>${url}</loc><lastmod>${lastmod}</lastmod></url>
</urlset>
`;
}

export function assembleBundle(p: BusinessProfile, mode: BuildMode): OutputFile[] {
  const files: OutputFile[] = [];
  const agentsJson = JSON.stringify(buildAgentsJson(p), null, 2);
  files.push({ path: "index.html", content: buildHtml(p, mode) });
  files.push({ path: "llms.txt", content: buildLlmsTxt(p) });
  files.push({ path: "llms-full.txt", content: buildLlmsFullTxt(p) });
  files.push({ path: "agents.json", content: agentsJson });
  // Mirror at the IETF .well-known location (RFC 8615) — a standard path agents
  // and tools probe to auto-discover what they can do, without being told.
  files.push({ path: ".well-known/agents.json", content: agentsJson });
  files.push({ path: "robots.txt", content: robotsTxt(p) });
  files.push({ path: "sitemap.xml", content: sitemapXml(p) });
  files.push(...buildApiFiles(p));
  return files;
}

export async function writeBundle(files: OutputFile[], outDir: string): Promise<void> {
  for (const f of files) {
    const full = join(outDir, f.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, f.content, "utf8");
  }
}
