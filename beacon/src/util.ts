// Small shared helpers. No dependencies on purpose.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Drop undefined/null/empty values so generated JSON-LD and APIs stay clean.
export function prune<T>(obj: T): T {
  if (Array.isArray(obj)) {
    const arr = obj
      .map((v) => prune(v))
      .filter((v) => v !== undefined && v !== null && !(typeof v === "string" && v === ""));
    return arr as unknown as T;
  }
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const pv = prune(v);
      const empty =
        pv === undefined ||
        pv === null ||
        (typeof pv === "string" && pv === "") ||
        (Array.isArray(pv) && pv.length === 0) ||
        (typeof pv === "object" && !Array.isArray(pv) && Object.keys(pv as object).length === 0);
      if (!empty) out[k] = pv;
    }
    return out as unknown as T;
  }
  return obj;
}

// Decode a small set of common HTML entities found during extraction.
export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
