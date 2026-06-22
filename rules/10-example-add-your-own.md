# 10 — (Example) Add Your Own Rule Files Here

> This is an EXAMPLE file showing how to add more always-read rules.
> Copy this pattern. Rename it. Replace the content. Delete this one when ready.

## How the numbering works

Files in this folder are read **in order, every time**, lowest number first:

- `00-` → read first (the core operating manual — don't move it)
- `10-`, `20-`, `30-` → your own rule files, in the order you want them read

Leaving gaps (10, 20, 30 instead of 1, 2, 3) lets you slot a new file in
between later without renaming everything.

## How to add a new always-read file

1. Create a new `.md` file in this `rules/` folder.
2. Give it a number prefix to set its read order (e.g. `20-coding-style.md`).
3. Write your rules in plain language. Agents will read it before every task.

That's it. No other setup. Drop it in, it's live.

## Example rules you might want to add

- **`20-coding-style.md`** — your preferred languages, frameworks, formatting,
  naming conventions, "always do X / never do Y."
- **`30-project-facts.md`** — what your product is, who it's for, key terms, the
  goal, so agents have context every time.
- **`40-do-not.md`** — hard no-gos: things agents must never touch, change, or do
  without asking you first.
- **`50-voice-and-tone.md`** — how you want agents to talk to you and in any
  output they produce.

Keep each file focused on one topic. Short and clear beats long and vague.
