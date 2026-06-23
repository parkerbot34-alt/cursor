#!/usr/bin/env node
// Beacon web UI — a tiny local interface to build one site without the CLI.
//
//   node src/server.ts            # then open http://localhost:4173
//   node src/server.ts --port 8080
//
// Zero dependencies (Node's built-in HTTP). Pick a mode, paste the website (or
// give a URL), optionally add facts, hit Build, and get the agent-readiness
// score plus clickable links to the generated site.

import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { parse as parseQuery } from "node:querystring";
import { buildSite } from "./pipeline.ts";
import { renderReport } from "./audit.ts";
import { escapeHtml } from "./util.ts";
import type { BuildMode } from "./types.ts";

const PORT = (() => {
  const i = process.argv.indexOf("--port");
  return i >= 0 ? Number(process.argv[i + 1]) : Number(process.env.PORT) || 4173;
})();

const RUNS_DIR = join(process.cwd(), "out", "ui-runs");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const PAGE_CSS = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font: 15px/1.5 system-ui, sans-serif; max-width: 820px; margin: 2rem auto; padding: 0 1rem; }
  h1 { margin-bottom: .25rem; } .sub { color: #888; margin-top: 0; }
  fieldset { border: 1px solid #ccc4; border-radius: 8px; margin: 1rem 0; padding: 1rem; }
  legend { font-weight: 600; padding: 0 .4rem; }
  label { display: block; margin: .5rem 0 .2rem; font-weight: 500; }
  textarea, input[type=text] { width: 100%; padding: .5rem; border: 1px solid #8884; border-radius: 6px; font: inherit; background: transparent; color: inherit; }
  textarea { min-height: 8rem; font-family: ui-monospace, monospace; font-size: 13px; }
  .modes label { display: inline-flex; align-items: center; gap: .4rem; font-weight: 500; margin-right: 1.5rem; }
  button { background: #2563eb; color: #fff; border: 0; border-radius: 6px; padding: .6rem 1.2rem; font: inherit; font-weight: 600; cursor: pointer; }
  .score { font-size: 2.2rem; font-weight: 700; }
  .err { background: #ef44441a; border: 1px solid #ef4444; border-radius: 6px; padding: .75rem 1rem; }
  a { color: #2563eb; } .files a { display: inline-block; margin: .15rem .5rem .15rem 0; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { border-bottom: 1px solid #8883; padding: .4rem .5rem; text-align: left; }
  pre { background: #8881; padding: 1rem; border-radius: 6px; overflow: auto; }
`;

function layout(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title><style>${PAGE_CSS}</style></head><body>${body}</body></html>`;
}

function formPage(): string {
  return layout(
    "Beacon — build an AI-readable site",
    `<h1>Beacon</h1>
<p class="sub">Build a website an AI agent can actually read — and act on.</p>
<form method="POST" action="/build">
  <fieldset>
    <legend>1. Mode</legend>
    <div class="modes">
      <label><input type="radio" name="mode" value="companion" checked> Companion — a separate agent-only site alongside the human one</label>
      <label><input type="radio" name="mode" value="upgrade"> Upgrade — rebuild the existing site to be agent-friendly</label>
    </div>
  </fieldset>
  <fieldset>
    <legend>2. The website</legend>
    <label for="url">Live URL to crawl (optional)</label>
    <input type="text" id="url" name="url" placeholder="https://theirbusiness.com">
    <label for="html">…or paste the website's HTML</label>
    <textarea id="html" name="html" placeholder="&lt;!DOCTYPE html&gt;&lt;html&gt;…"></textarea>
  </fieldset>
  <fieldset>
    <legend>3. Facts (optional, JSON — always wins over the crawl)</legend>
    <label for="facts">e.g. { "name": "Acme Co.", "phone": "+1-555-0100", "services": [{ "name": "Repairs" }] }</label>
    <textarea id="facts" name="facts" placeholder='{ "name": "Acme Co." }'></textarea>
  </fieldset>
  <button type="submit">Build the AI-ready site →</button>
</form>`,
  );
}

function resultPage(id: string, out: Awaited<ReturnType<typeof buildSite>>): string {
  const scoreLine = out.before
    ? `<p><span class="score">${out.before.score} → ${out.beacon.score}</span> / 100 agent-readiness</p>`
    : `<p><span class="score">${out.beacon.score}</span> / 100 agent-readiness</p>`;
  const fileLinks = out.files
    .map((f) => `<a href="/runs/${id}/${f.path}">${escapeHtml(f.path)}</a>`)
    .join("");
  const reportMd = renderReport(out.beacon, out.before);
  const notes = out.notes.length
    ? `<details><summary>Build notes (${out.notes.length})</summary><ul>${out.notes
        .map((n) => `<li>${escapeHtml(n)}</li>`)
        .join("")}</ul></details>`
    : "";
  return layout(
    `Built: ${out.profile.name}`,
    `<p><a href="/">← build another</a></p>
<h1>${escapeHtml(out.profile.name)}</h1>
${scoreLine}
<p><a href="/runs/${id}/index.html">▶ Preview the generated site</a></p>
<fieldset><legend>Generated files</legend><div class="files">${fileLinks}</div></fieldset>
${notes}
<fieldset><legend>Agent-readiness report</legend><pre>${escapeHtml(reportMd)}</pre></fieldset>`,
  );
}

function errorPage(message: string): string {
  return layout(
    "Beacon — error",
    `<p><a href="/">← back</a></p><h1>Couldn't build</h1><div class="err">${escapeHtml(message)}</div>`,
  );
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 5_000_000) reject(new Error("Request too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function handleBuild(body: string): Promise<string> {
  const form = parseQuery(body);
  const mode = (form.mode === "upgrade" ? "upgrade" : "companion") as BuildMode;
  const html = typeof form.html === "string" ? form.html : "";
  const url = typeof form.url === "string" ? form.url : "";
  let facts: Record<string, unknown> = {};
  if (typeof form.facts === "string" && form.facts.trim()) {
    try {
      facts = JSON.parse(form.facts);
    } catch (e) {
      return errorPage(`Facts must be valid JSON. ${(e as Error).message}`);
    }
  }
  if (!html.trim() && !url.trim() && !Object.keys(facts).length) {
    return errorPage("Give me something to work with: a URL, pasted HTML, or facts.");
  }

  let out;
  try {
    out = await buildSite({ mode, html, url, facts });
  } catch (e) {
    return errorPage((e as Error).message);
  }

  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const dir = join(RUNS_DIR, id);
  for (const f of out.files) {
    const full = join(dir, f.path);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, f.content, "utf8");
  }
  await writeFile(join(dir, "beacon-report.md"), renderReport(out.beacon, out.before), "utf8");
  return resultPage(id, out);
}

// Serve a generated run file. Rewrites the preview's absolute /links so the
// in-page nav works under /runs/<id>/.
async function serveRunFile(id: string, rel: string): Promise<{ body: Buffer | string; type: string } | null> {
  const safe = normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const full = join(RUNS_DIR, id, safe);
  if (!full.startsWith(join(RUNS_DIR, id))) return null; // path traversal guard
  try {
    const ext = extname(full) || ".html";
    let body: Buffer | string = await readFile(full);
    if (ext === ".html") {
      body = body.toString("utf8").replace(/(href|src)="\/(?!\/)/g, `$1="/runs/${id}/`);
    }
    return { body, type: CONTENT_TYPES[ext] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(formPage());
    }
    if (req.method === "POST" && url.pathname === "/build") {
      const page = await handleBuild(await readBody(req));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(page);
    }
    const runMatch = url.pathname.match(/^\/runs\/([^/]+)\/(.*)$/);
    if (req.method === "GET" && runMatch) {
      const file = await serveRunFile(runMatch[1], runMatch[2] || "index.html");
      if (!file) {
        res.writeHead(404);
        return res.end("Not found");
      }
      res.writeHead(200, { "content-type": file.type });
      return res.end(file.body);
    }
    res.writeHead(404);
    res.end("Not found");
  } catch (e) {
    res.writeHead(500, { "content-type": "text/html; charset=utf-8" });
    res.end(errorPage((e as Error).message));
  }
});

server.listen(PORT, () => {
  process.stderr.write(`\n  Beacon UI → http://localhost:${PORT}\n  (Ctrl+C to stop)\n\n`);
});
