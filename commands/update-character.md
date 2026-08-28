---
disable-model-invocation: true
name: update-character
description: "Integrate a standing behavioral preference into the right surface — CLAUDE.md only past the T1 gate; skills, rules, memories, or hooks otherwise."
---

Turn a preference — `$ARGUMENTS`, or the correction the user just gave — into a durable standing rule. An optional leading scope word pins the home: `user` → `~/.claude/CLAUDE.md` and personal surfaces; `project` → the current repo's `CLAUDE.md` / `.claude/`. Without it, scope follows the preference's reach.

## 1. Generalize

State the rule as the CLASS of behavior wanted — goal + constraint in few words, no step-by-step choreography, no restating default model behavior (doctrine: `~/.claude/commands/distill.md`).

## 2. Route — T1 gate first

- Fresh session would make a wrong move in its first few actions without this line → CLAUDE.md at the pinned/derived scope.
- Behavior of one workflow or skill family → that skill, with `/update-skill` semantics (refine in place, propagate to siblings).
- File-triggered rule → `~/.claude/rules/` WITH `paths:` frontmatter (never without — pathless rules load every session).
- Must be harness-enforced (an "every time X" Claude cannot guarantee) → hook via the update-config skill.
- Otherwise → feedback memory per `~/.claude/skills/my/memory/SKILL.md`.

Supersede any existing memory or line already covering it — never duplicate.

## 3. Integrate — never append

Rewrite the target section so the rule reads as if always there; fold into an existing bullet when one covers the area. CLAUDE.md edits keep the file's structure and register.

## 4. Confirm, write, commit

Show home + exact diff + what it supersedes. AskUserQuestion: approve / tweak / different home. Never write unconfirmed. Commit path-scoped; project surfaces follow that repo's worktree policy.
