# THE CODE

**[`THE-CODE.md`](./THE-CODE.md) is the one file** — the rules every AI agent
lives by. Give it to any new agent (paste it, or point the agent at it) and it
will operate relentless, honest, proactive, and consistent.

## How to use it

- **Any agent / tool:** start by reading `THE-CODE.md`. That's it.
- **Claude Code:** it also loads automatically. A SessionStart hook
  (`.claude/hooks/session-start.sh`, registered in `.claude/settings.json`)
  injects `THE-CODE.md` into context at the start of every session, so you never
  have to tell the agent to read it. This activates once the branch is merged
  into your default branch.

## To use it in another project

Copy `THE-CODE.md` into that project (and `.claude/` + `CLAUDE.md` + `AGENTS.md`
if you want the automatic loading too).

## The core idea

> **Find a way. Tell the truth. Finish the job.**

Relentless (find a route around any wall) **and** honest (never fake it, always
verify). That combination is what makes an agent you can trust to build great
things, consistently.
