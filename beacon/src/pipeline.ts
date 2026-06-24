// One reusable build pipeline, shared by the CLI and the web UI.
//
// Takes raw inputs (pasted HTML and/or a URL, optional facts, a mode) and
// returns the generated bundle plus the agent-readiness audit. No I/O of its
// own beyond fetching a URL — callers decide where to write.

import type { AuditReport } from "./audit.ts";
import type { BusinessProfile, BuildMode, OutputFile } from "./types.ts";
import { combineExtractions, extractFromHtml, loadPages, mergeProfiles } from "./ingest.ts";
import { enrichProfile } from "./enrich.ts";
import { assembleBundle } from "./build.ts";
import { auditBundle, auditRawSite } from "./audit.ts";
import { htmlToText } from "./util.ts";

export interface BuildInput {
  mode: BuildMode;
  html?: string; // pasted single-page HTML
  url?: string; // live URL, local file, or folder
  facts?: Partial<BusinessProfile>;
  enrich?: boolean;
}

export interface BuildOutput {
  files: OutputFile[];
  profile: BusinessProfile;
  beacon: AuditReport;
  before?: AuditReport;
  notes: string[];
}

export async function buildSite(input: BuildInput): Promise<BuildOutput> {
  const notes: string[] = [];
  let profile: Partial<BusinessProfile> = {};
  let sourceHtml: string[] = [];

  // 1. Gather source pages (pasted HTML wins; otherwise crawl the URL).
  if (input.html && input.html.trim()) {
    sourceHtml = [input.html];
    const res = extractFromHtml(input.html, input.url || "pasted-html");
    profile = res.profile;
    notes.push(...res.notes);
  } else if (input.url && input.url.trim()) {
    const { pages, notes: loadNotes } = await loadPages(input.url, true);
    notes.push(...loadNotes);
    sourceHtml = pages.map((p) => p.html);
    if (pages.length) {
      const isHttp = /^https?:\/\//i.test(input.url);
      const combined = combineExtractions(
        pages.map((p) => extractFromHtml(p.html, p.ref)),
        isHttp ? input.url : undefined,
      );
      profile = combined.profile;
      notes.push(...combined.notes);
    }
  }

  // 2. Optional enrichment on the crawl, before facts win.
  if (input.enrich && sourceHtml.length) {
    const { profile: enriched, notes: enrichNotes } = await enrichProfile(
      profile,
      sourceHtml.map(htmlToText).join("\n\n"),
    );
    profile = enriched;
    notes.push(...enrichNotes);
  }

  // 3. Operator facts override everything.
  if (input.facts && Object.keys(input.facts).length) {
    profile = mergeProfiles(profile, input.facts);
    notes.push("Merged supplied facts.");
  }

  if (!profile.name) {
    throw new Error(
      "Couldn't determine the business name. Add it in the Facts box, e.g. { \"name\": \"Acme Co.\" }.",
    );
  }

  // 4. Build + audit.
  const final = profile as BusinessProfile;
  const files = assembleBundle(final, input.mode);
  const beacon = auditBundle(files, final);
  const before = sourceHtml.length ? auditRawSite(sourceHtml) : undefined;

  return { files, profile: final, beacon, before, notes };
}
