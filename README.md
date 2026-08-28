# Claudik (public)

My Claude Code home — the shareable half of it.

This repository is a **generated, sanitized mirror** of a private `~/.claude`.
A manifest in the private repo decides what ships; a deny scan over the rendered
tree fails the sync if anything private survives (client names, internal hosts,
personal contact details, absolute home paths, credential-shaped values).
Nothing here is hand-edited — edits happen in the private original.

## What's inside

| Path | What it is |
|---|---|
| `CLAUDE.md` | The always-loaded global context: working style, output conventions, hard safety rules |
| `skills/` | Intent-triggered skills — git/PR flow, e2e, diagnosis, design, research, cleanup |
| `commands/` | Slash commands, mostly thin entry points into the skills |
| `agents/` | Subagent definitions |
| `docs/` | Long-form references the lean `CLAUDE.md` points at |
| `rules/` | `paths:`-scoped rules that load only when matching files are touched |
| `hooks/*-src/` | Go sources for the guard and lint hooks (`claude-guards`, `memorylint`) |

## What's deliberately missing

Personal and team memory, session transcripts, anything naming a client or an
internal host, and the skills that only work against private infrastructure
(servers, self-hosted Sentry/Plane, private CLIs). Some documents therefore
reference a skill or doc that isn't here — that's the scrub, not a bug.

## Using it

Clone into `~/.claude` (or copy the parts you want). The hook binaries build
with `go build -o ~/.local/bin/<name> .` inside each `hooks/*-src/` directory;
`settings.json` shows how they're wired.
