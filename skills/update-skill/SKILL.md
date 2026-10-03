---
name: update-skill
description: "Use when a skill or slash command used this session showed a weakpoint — its instructions caused, permitted or nearly permitted a failure, or the work revealed a missing step, stale fact or better path it should carry — or the user asks to fix, harden, refine or update a skill or command — 'the skill told you wrong', 'update the skill', 'fix the command', 'harden X'. A new skill is to-skill; a preference about how to work is update-character."
---

Refine instruction surfaces so a weakpoint observed this session cannot recur. `$ARGUMENTS` = skill/command name (bare names resolve against `~/.claude/skills/` and `~/.claude/commands/`, then the current repo's `.claude/`). Empty → find the weakpoint in this session — which surface's instructions caused, permitted or nearly permitted a failure, or lacked what the work had to learn — propose target + one-liner, confirm before proceeding. Self-raised, it waits until the task at hand is done, never mid-flow.

## 1. Root-cause the weakpoint

From session evidence: what happened, its CLASS (not the instance), which instruction was wrong, missing, stale or ambiguous.

## 2. Refine — never append

Rewrite the relevant instruction(s) in place so the failure class is excluded: adjust the command pattern, add the constraint where the action is described, delete the misleading wording. No dated gotcha blocks, no "Note:"/"Warning:" appendices, no incident narrative — the skill must read as if written correctly the first time. Apply the doctrine in `~/.claude/commands/distill.md` — including its frontmatter rule when the incident touches a description (`description` is the TRIGGER, when-to-invoke only); the edit usually leaves the skill shorter or equal.

## 3. Best home wins

- environmental fact (shell, harness, OS) → `dev-env-troubleshooting` — check it FIRST; if the rule exists, the failing skill needs only its concrete fix
- shared by a family → the family's `_shared` doc; members get the minimal fix
- specific to this skill → in place
Never duplicate the same sentence across surfaces.

## 4. Propagate to siblings

Search `skills/` + `commands/` for the same failure surface (same command shape or pattern); prepare the same generalized fix for each hit.

## 5. Confirm, write, commit

ONE batched confirmation: incident + root cause, per-file diffs (target, rule home, siblings). AskUserQuestion: approve all / pick files / tweak. Never write unconfirmed. On approve: write, commit path-scoped (`fix(skills): harden <name> — <weakpoint class>`). Skills in a project repo follow that repo's worktree policy.
