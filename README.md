# The Warband Code

The rules your AI agents live by — **loaded automatically, every session**, so
every agent is relentless, honest, proactive, and consistent without you ever
having to remind them.

## It loads itself

A **SessionStart hook** (`.claude/hooks/session-start.sh`) injects every rule
file into the agent's context at the start of each Claude Code session. You don't
tell the agent to read anything — the rules are just there, every time.

Two backup entry points cover other tools:
- **`CLAUDE.md`** — read by Claude Code.
- **`AGENTS.md`** — read by many other agent tools.

Both also say: if the hook didn't run, read everything in `rules/` first.

## The rules (`rules/`, read in number order)

| File | What it is |
|------|------------|
| `00-operating-manual.md` | **THE CODE** — the prime laws (find a way / tell the truth / finish). |
| `10-proactive-and-smart.md` | How to be maximally proactive and smart. |
| `20-execution-standards.md` | How the work gets done, and verified. |
| `30-communication.md` | How agents report — honest, with receipts. |
| `40-forbidden.md` | The hard no-gos. Lines never crossed. |

## Adding your own always-read rules

1. Drop a new `.md` into `rules/` (e.g. `25-coding-style.md`, `35-project-facts.md`).
2. Number it to set read order. Leave gaps (10, 20, 30) so you can slot new files
   in between later.
3. Write it in plain language.

The hook reads the whole folder, so anything you add is auto-loaded next session.
No other setup.

## The core idea

> **Find a way. Tell the truth. Finish the job.**

Relentless (find a route around any wall) **and** honest (never fake it, always
verify). That combination is what makes agents you can actually trust to build
great things, consistently.

## To activate it in a project

Copy this repo's `rules/`, `.claude/`, `CLAUDE.md`, and `AGENTS.md` into the
project root. Once the SessionStart hook is on your default branch, every future
Claude Code session loads the code automatically.
