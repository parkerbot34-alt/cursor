# Agent Operating Manual

This repo holds **the rulebook your AI agents read before they work** — so every
agent behaves the same way: proactive, relentless, honest, and consistent.

## The files

| File | What it is |
|------|------------|
| **[`AGENTS.md`](./AGENTS.md)** | The full operating manual. The "book" agents read to learn how things are done here. This is the real one. |
| **[`CLAUDE.md`](./CLAUDE.md)** | A short pointer that Claude Code reads automatically at session start. It tells the agent to go read `AGENTS.md`. |

## How to use it

1. **Drop these files in the root of any project** you want your agents to work
   on. Claude Code picks up `CLAUDE.md` automatically; many other agent tools
   pick up `AGENTS.md` automatically.
2. **Point your agents at it.** When you kick off an agent, you can also just say:
   *"Read AGENTS.md and follow it."*
3. **Edit it as you learn.** This is a living document. When you discover a rule
   that makes your agents better, add it. When one isn't working, change it.
   The more specific to *your* way of working it gets, the better your agents get.

## The core idea

> **Find a way. Tell the truth. Finish the job.**

Agents that are *relentless* (find a way around any wall) **and** *honest* (never
fake it, always verify) are the ones you can trust to build great things
consistently. That's what this rulebook trains them to be.
