---
name: prc
description: Ensure an open PR exists for the current branch (create it if needed, idempotent if one already exists), print its URL, then hand off to prm — which works the watch/resolve loop INLINE in this session by default (`--bg` delegates rounds to ephemeral subagents), until merged. `--auto` forwards prm's auto mode — open to merged with no further prompt once precheck gates pass; add `--audit` for the opt-in pre-merge regression audit.
argument-hint: "[--base <branch>] [--title <text>] [--body <text>] [--draft] [--auto] [--audit] [--bg] [--once] [--every 5m] [--fable]"
---

Read the file `~/.claude/skills/git/prc/SKILL.md` and follow it exactly (resolve its relative paths against that skill directory). Pass `$ARGUMENTS` as the input.
