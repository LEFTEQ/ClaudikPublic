---
name: sync
description: Bring this checkout up to date, whichever branch it's on. On the default branch — commit, pull ff-only, push. On any other branch — align with origin/<branch>, commit, push, merge origin/<default> with triaged conflict resolution (generated files regenerated, easy merges auto, hard ones asked about), then deps → backup+migrate → regen → verify → restart. Self-populates .claude/.claude.git.config so later runs need no discovery. Absorbs the retired /to-latest and /pull.
argument-hint: "[--dry-run] [--continue]"
---

Read the file `~/.claude/skills/git/sync/SKILL.md` and follow it exactly (resolve its relative paths against that skill directory). Pass `$ARGUMENTS` as the input.
