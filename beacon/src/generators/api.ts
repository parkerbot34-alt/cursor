// Machine-readable JSON API. Instead of forcing an agent to scrape HTML, we
// publish the facts as flat JSON it can fetch and use directly. Static files,
// so they deploy anywhere — no server required.

import type { BusinessProfile, OutputFile } from "../types.ts";
import { prune } from "../util.ts";

export function buildApiFiles(p: BusinessProfile): OutputFile[] {
  const files: OutputFile[] = [];

  files.push({
    path: "api/business.json",
    content: JSON.stringify(prune({ ...p }), null, 2),
  });

  if (p.services?.length) {
    files.push({
      path: "api/services.json",
      content: JSON.stringify(prune({ services: p.services }), null, 2),
    });
  }

  if (p.products?.length) {
    files.push({
      path: "api/products.json",
      content: JSON.stringify(prune({ products: p.products }), null, 2),
    });
  }

  if (p.faqs?.length) {
    files.push({
      path: "api/faqs.json",
      content: JSON.stringify(prune({ faqs: p.faqs }), null, 2),
    });
  }

  return files;
}
