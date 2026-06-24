// Semantic, server-rendered, no-JS HTML. The goal: any crawler or agent gets
// the complete content from the raw markup — no client-side rendering, no
// hidden-behind-JavaScript facts. Carries the JSON-LD inline and advertises the
// machine-readable resources in <head> so an agent discovers them immediately.

import type { BuildMode, BusinessProfile } from "../types.ts";
import { escapeHtml } from "../util.ts";
import { jsonLdScript } from "./jsonld.ts";

function section(title: string, body: string): string {
  return `    <section>\n      <h2>${escapeHtml(title)}</h2>\n${body}\n    </section>`;
}

function addressBlock(p: BusinessProfile): string {
  const a = p.address;
  if (!a) return "";
  const parts = [a.street, a.city, a.region, a.postalCode, a.country].filter(Boolean).map(escapeHtml);
  return `      <address>${parts.join(", ")}</address>`;
}

export function buildHtml(p: BusinessProfile, mode: BuildMode): string {
  const sections: string[] = [];

  if (p.description) {
    sections.push(section("About", `      <p>${escapeHtml(p.description)}</p>`));
  }

  const contact: string[] = [];
  if (p.phone) contact.push(`      <p>Phone: <a href="tel:${escapeHtml(p.phone)}">${escapeHtml(p.phone)}</a></p>`);
  if (p.email) contact.push(`      <p>Email: <a href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a></p>`);
  const addr = addressBlock(p);
  if (addr) contact.push(addr);
  if (contact.length) sections.push(section("Contact", contact.join("\n")));

  if (p.hours?.length) {
    const rows = p.hours
      .map((h) => `        <li>${escapeHtml(h.days.join(", "))}: ${escapeHtml(h.opens)}–${escapeHtml(h.closes)}</li>`)
      .join("\n");
    sections.push(section("Hours", `      <ul>\n${rows}\n      </ul>`));
  }

  if (p.services?.length) {
    const items = p.services
      .map((s) => {
        const price = s.price ? ` — ${escapeHtml(s.price)}` : "";
        const desc = s.description ? `<br><small>${escapeHtml(s.description)}</small>` : "";
        return `        <li><strong>${escapeHtml(s.name)}</strong>${price}${desc}</li>`;
      })
      .join("\n");
    sections.push(section("Services", `      <ul>\n${items}\n      </ul>`));
  }

  if (p.products?.length) {
    const items = p.products
      .map((pr) => {
        const price = pr.price ? ` — ${escapeHtml(pr.price)}` : "";
        return `        <li><strong>${escapeHtml(pr.name)}</strong>${price}</li>`;
      })
      .join("\n");
    sections.push(section("Products", `      <ul>\n${items}\n      </ul>`));
  }

  if (p.faqs?.length) {
    const items = p.faqs
      .map(
        (f) =>
          `      <details>\n        <summary>${escapeHtml(f.question)}</summary>\n        <p>${escapeHtml(f.answer)}</p>\n      </details>`,
      )
      .join("\n");
    sections.push(section("FAQ", items));
  }

  if (p.actions?.length) {
    const items = p.actions
      .map((a) => `        <li><strong>${escapeHtml(a.name)}</strong>: ${escapeHtml(a.description)}</li>`)
      .join("\n");
    sections.push(
      section(
        "For AI agents",
        `      <p>Machine-readable action definitions are at <a href="/agents.json">/agents.json</a>.</p>\n      <ul>\n${items}\n      </ul>`,
      ),
    );
  }

  const modeNote =
    mode === "companion"
      ? `<!-- Beacon companion site: an agent-first front door alongside ${escapeHtml(p.url || "the primary site")}. -->`
      : `<!-- Beacon upgrade: agent-friendly rebuild of ${escapeHtml(p.url || "the original site")}. -->`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${modeNote}
  <title>${escapeHtml(p.name)}${p.tagline ? " — " + escapeHtml(p.tagline) : ""}</title>
  <meta name="description" content="${escapeHtml(p.description || p.tagline || p.name)}">
  <!-- Advertise machine-readable resources to crawlers and agents -->
  <link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt">
  <link rel="alternate" type="application/json" href="/api/business.json" title="Structured business data">
  <link rel="alternate" type="application/json" href="/agents.json" title="Agent actions">
  ${jsonLdScript(p)}
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(p.name)}</h1>
      ${p.tagline ? `<p><em>${escapeHtml(p.tagline)}</em></p>` : ""}
    </header>
${sections.join("\n")}
    <footer>
      <p>Structured data: <a href="/api/business.json">business.json</a> ·
         <a href="/llms.txt">llms.txt</a> ·
         <a href="/agents.json">agents.json</a></p>
    </footer>
  </main>
</body>
</html>
`;
}
