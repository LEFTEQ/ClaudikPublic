---
name: actions
description: Detect the repo's GitHub Actions, watch the run for the current branch, and on failure diagnose → fix → push → re-watch until green.
argument-hint: "[--once] [--workflow <name>]"
---

Read the file `~/.claude/skills/git/actions/SKILL.md` and follow it exactly (resolve its relative paths against that skill directory). Pass `$ARGUMENTS` as the input.
