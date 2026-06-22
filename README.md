# Agent Operating Manual

This repo holds **the rules your AI agents read before they work** — so every
agent behaves the same way: proactive, relentless, honest, and consistent.

## How it works

Two entry-point files tell agents what to do, and they're picked up
automatically:

- **`CLAUDE.md`** — read automatically by Claude Code.
- **`AGENTS.md`** — read automatically by many other agent tools.

Both say the same thing: **read every file in the [`rules/`](./rules/) folder,
in order, before doing any work.**

So the actual rules live in `rules/`, and you can have as many as you want.

## The `rules/` folder

Files are read **in order, every time**, lowest number first:

| File | What it is |
|------|------------|
| `00-operating-manual.md` | The core rulebook. The "book" agents read to learn how things are done. Keep this first. |
| `10-example-add-your-own.md` | An example showing how to add your own rule files. |

## Adding your own always-read files

This is the whole point — you can have a few (or many) files that agents read
every time:

1. Create a new `.md` file inside `rules/`.
2. Prefix it with a number to set its read order, e.g. `20-coding-style.md`.
   (Leave gaps — 10, 20, 30 — so you can slot new ones in between later.)
3. Write your rules in plain language.

That's it. Drop it in, it's live. No other setup.

## The core idea

> **Find a way. Tell the truth. Finish the job.**

Agents that are *relentless* (find a way around any wall) **and** *honest* (never
fake it, always verify) are the ones you can trust to build great things
consistently. That's what these rules train them to be.
