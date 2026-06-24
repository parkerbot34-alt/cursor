// A/B agent eval — the outcome demo.
//
// The audit (audit.ts) proves *capability*: the Beacon site has the things
// agents need. This proves *outcome*: an AI actually answers a customer's
// questions better, and cheaper, from the Beacon site than from the original.
//
// How it works:
//   1. Derive buyer questions from the known business facts (so we have ground
//      truth to grade against).
//   2. Have a model answer each question from ONLY the original site, then from
//      ONLY the Beacon site (llms.txt). It must say NOT FOUND when the source
//      doesn't contain the answer — no guessing.
//   3. A judge model grades both answer sets against the ground truth.
//   4. Report accuracy before/after and the real input-token cost of each.
//
// Optional & honest, like enrichment: dynamically imports the Anthropic SDK,
// degrades gracefully without it or an API key, and never fabricates results.

import type { BusinessProfile } from "./types.ts";

export interface QA {
  question: string;
  truth: string;
}

export interface Graded {
  question: string;
  truth: string;
  beforeAnswer: string;
  afterAnswer: string;
  beforeScore: number; // 0 | 0.5 | 1
  afterScore: number;
}

export interface EvalReport {
  graded: Graded[];
  beforeAccuracy: number; // 0..100
  afterAccuracy: number;
  beforeContextTokens: number; // real input tokens the model spent reading the source
  afterContextTokens: number;
}

// Build ground-truth questions from the profile. Deterministic — covers the
// things a customer actually asks an AI before choosing a business.
export function buildQuestions(p: BusinessProfile): QA[] {
  const qs: QA[] = [];
  const name = p.name;
  if (p.phone) qs.push({ question: `What is ${name}'s phone number?`, truth: p.phone });
  if (p.email) qs.push({ question: `What's the email address to contact ${name}?`, truth: p.email });
  if (p.address?.city)
    qs.push({ question: `What city is ${name} in?`, truth: p.address.city });
  if (p.areaServed?.length)
    qs.push({
      question: `Does ${name} serve ${p.areaServed[0]}?`,
      truth: `Yes — areas served: ${p.areaServed.join(", ")}`,
    });
  const sat = p.hours?.find((h) => h.days.some((d) => /sat/i.test(d)));
  if (sat) qs.push({ question: `Is ${name} open on Saturday, and what hours?`, truth: `${sat.opens}–${sat.closes}` });
  for (const s of (p.services ?? []).slice(0, 2)) {
    qs.push({
      question: `Does ${name} do ${s.name.toLowerCase()}?`,
      truth: `Yes${s.price ? ` (${s.price})` : ""}`,
    });
    if (s.price)
      qs.push({ question: `Roughly what does ${s.name.toLowerCase()} cost at ${name}?`, truth: s.price });
  }
  if (p.faqs?.length) qs.push({ question: p.faqs[0].question, truth: p.faqs[0].answer });
  return qs;
}

function estTokens(text: string): number {
  return Math.round(text.length / 4);
}

// ---- The live run (needs the SDK + ANTHROPIC_API_KEY) ----

export interface RunResult {
  report?: EvalReport;
  notes: string[];
}

export async function runEval(
  profile: BusinessProfile,
  beforeContext: string,
  afterContext: string,
  model = "claude-opus-4-8",
): Promise<RunResult> {
  const notes: string[] = [];
  const questions = buildQuestions(profile);
  if (!questions.length) {
    notes.push("No ground-truth questions could be derived from the profile — nothing to evaluate.");
    return { notes };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    notes.push("Eval skipped: ANTHROPIC_API_KEY is not set.");
    return { notes };
  }
  let Anthropic: any;
  try {
    Anthropic = (await import("@anthropic-ai/sdk")).default;
  } catch {
    notes.push("Eval skipped: @anthropic-ai/sdk is not installed (run `npm install` in beacon/).");
    return { notes };
  }
  const client = new Anthropic();

  const numbered = questions.map((q, i) => `${i + 1}. ${q.question}`).join("\n");
  const answerSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      answers: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: { n: { type: "integer" }, answer: { type: "string" } },
          required: ["n", "answer"],
        },
      },
    },
    required: ["answers"],
  };

  async function answerFrom(context: string): Promise<{ answers: string[]; inputTokens: number }> {
    const res = await client.messages.create({
      model,
      max_tokens: 4000,
      system:
        "You answer a customer's questions about a business using ONLY the provided source text. If the source does not contain the answer, reply with exactly \"NOT FOUND\". Never guess or use outside knowledge.",
      messages: [
        {
          role: "user",
          content: `SOURCE:\n"""\n${context}\n"""\n\nQUESTIONS:\n${numbered}\n\nAnswer each by its number.`,
        },
      ],
      output_config: { format: { type: "json_schema", schema: answerSchema } },
    });
    const data = JSON.parse(res.content.find((b: any) => b.type === "text").text);
    const byN = new Map<number, string>(data.answers.map((a: any) => [a.n, a.answer]));
    return {
      answers: questions.map((_, i) => byN.get(i + 1) ?? "NOT FOUND"),
      inputTokens: res.usage.input_tokens,
    };
  }

  let before: { answers: string[]; inputTokens: number };
  let after: { answers: string[]; inputTokens: number };
  try {
    before = await answerFrom(beforeContext);
    after = await answerFrom(afterContext);
  } catch (err) {
    notes.push(`Eval failed during answering (${(err as Error).message}).`);
    return { notes };
  }

  // Judge both answer sets against ground truth in one call.
  const judgeSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      grades: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            n: { type: "integer" },
            before: { type: "string", enum: ["correct", "partial", "incorrect"] },
            after: { type: "string", enum: ["correct", "partial", "incorrect"] },
          },
          required: ["n", "before", "after"],
        },
      },
    },
    required: ["grades"],
  };
  const judgeInput = questions
    .map(
      (q, i) =>
        `${i + 1}. Q: ${q.question}\n   Ground truth: ${q.truth}\n   ANSWER A (before): ${before.answers[i]}\n   ANSWER B (after): ${after.answers[i]}`,
    )
    .join("\n\n");

  let grades: Map<number, { before: string; after: string }>;
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 4000,
      system:
        'You grade answers against a ground truth. "correct" = matches the ground truth. "partial" = right idea but missing/imprecise. "incorrect" = wrong, or "NOT FOUND" when the ground truth has a real answer. Be strict and fair.',
      messages: [{ role: "user", content: judgeInput }],
      output_config: { format: { type: "json_schema", schema: judgeSchema } },
    });
    const data = JSON.parse(res.content.find((b: any) => b.type === "text").text);
    grades = new Map(data.grades.map((g: any) => [g.n, { before: g.before, after: g.after }]));
  } catch (err) {
    notes.push(`Eval failed during grading (${(err as Error).message}).`);
    return { notes };
  }

  const toScore = (g?: string) => (g === "correct" ? 1 : g === "partial" ? 0.5 : 0);
  const graded: Graded[] = questions.map((q, i) => {
    const g = grades.get(i + 1);
    return {
      question: q.question,
      truth: q.truth,
      beforeAnswer: before.answers[i],
      afterAnswer: after.answers[i],
      beforeScore: toScore(g?.before),
      afterScore: toScore(g?.after),
    };
  });

  const acc = (sel: (x: Graded) => number) =>
    Math.round((graded.reduce((s, x) => s + sel(x), 0) / graded.length) * 100);

  return {
    notes,
    report: {
      graded,
      beforeAccuracy: acc((x) => x.beforeScore),
      afterAccuracy: acc((x) => x.afterScore),
      beforeContextTokens: before.inputTokens,
      afterContextTokens: after.inputTokens,
    },
  };
}

// ---- Render ----

export function renderEvalReport(r: EvalReport, name: string): string {
  const out: string[] = [];
  out.push(`# AI Answer Quality: ${name}`);
  out.push("");
  out.push("Can an AI correctly answer a customer's questions about this business?");
  out.push("Each question was answered from ONLY the current site, then from ONLY the Beacon site.");
  out.push("");
  out.push(`## Buyer questions answered correctly: ${r.beforeAccuracy}% → **${r.afterAccuracy}%**`);
  out.push("");
  const saved = r.beforeContextTokens - r.afterContextTokens;
  const pctSaved = r.beforeContextTokens ? Math.round((saved / r.beforeContextTokens) * 100) : 0;
  out.push(
    `**Tokens the AI spent reading the business:** ${r.beforeContextTokens} (current site) → ${r.afterContextTokens} (Beacon)` +
      (saved > 0 ? ` — **${pctSaved}% cheaper**.` : "."),
  );
  out.push("");
  out.push("| Buyer question | Current site | Beacon site |");
  out.push("| --- | :---: | :---: |");
  for (const g of r.graded) {
    out.push(`| ${g.question} | ${mark(g.beforeScore)} | ${mark(g.afterScore)} |`);
  }
  out.push("");
  return out.join("\n");
}

function mark(s: number): string {
  return s >= 1 ? "✅" : s >= 0.5 ? "🟡" : "❌";
}
