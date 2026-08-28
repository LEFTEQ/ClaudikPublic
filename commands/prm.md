---
name: prm
description: Watch a PR (or `all` your open PRs needing action) with a native Monitor per PR that self-terminates on merge/close; rounds run INLINE in this session by default (warm cache — cheapest; `--bg` or `all` delegates to fresh ephemeral subagents), grounding every reviewer comment against the PR's distilled intent brief (per-PR state file: brief + seen-set), then fixing (+ failing test) or pushing back with evidence; this session owns every merge terminus. On merge it auto-cleans the worktree + dev clients (clean worktree only) — no prompt. `--auto` merges without asking once ready; the pre-merge regression audit runs ONLY when `--audit` is also passed; it never self-approves; `--admin` only via git:merge's solo-owner carve-out.
argument-hint: "[all | PR] [--auto] [--audit] [--bg] [--once] [--every 5m] [--cap 2] [--include-resolved] [--fable]"
---

Read the file `~/.claude/skills/git/prm/SKILL.md` and follow it exactly (resolve its relative paths against that skill directory). Pass `$ARGUMENTS` as the input.
