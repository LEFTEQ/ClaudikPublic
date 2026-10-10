---
name: update-skill
description: "Use when a skill or command used this session caused, permitted or nearly permitted a failure, or the work revealed a missing step, stale fact or better path it should carry — or the user asks to fix, harden or update one: 'the skill told you wrong', 'harden X'. Working preferences go to update-character."
codex-ignore: true
---

Refine instruction surfaces so a weakpoint observed this session cannot recur. `$ARGUMENTS` = skill/command name (bare names resolve against the user-level Claude Code `skills/` and `commands/`, then the current repo's `.claude/`). Empty → find the weakpoint in this session — which surface's instructions caused, permitted or nearly permitted a failure, or lacked what the work had to learn — propose target + one-liner, confirm before proceeding. Self-raised, it waits until the task at hand is done, never mid-flow.

Edit only the CANONICAL source: an installed copy carrying `.toolbox-package.json` is the tools repo's — edit `skills/<item_id>/` in the the tools repo repo; a symlink → its target; a plugin/marketplace clone is read-only — propose the diff to its upstream.

## 1. Root-cause the weakpoint

From session evidence: what happened, its CLASS (not the instance), which instruction was wrong, missing, stale or ambiguous.

## 2. Refine — never append

Rewrite the relevant instruction(s) in place so the failure class is excluded: adjust the command pattern, add the constraint where the action is described, delete the misleading wording. No dated gotcha blocks, no "Note:"/"Warning:" appendices, no incident narrative — the skill must read as if written correctly the first time. Apply the distill skill's doctrine — including its frontmatter rule when the incident touches a description (`description` is the TRIGGER, when-to-invoke only); the edit usually leaves the skill shorter or equal.

## 3. Best home wins

- environmental fact (shell, harness, OS) → the dev-env-troubleshooting skill when installed — check it FIRST; if the rule exists, the failing skill needs only its concrete fix
- shared by a family → the family's `_shared` doc; members get the minimal fix
- a standing preference about how to work, not this skill's behavior → update-character
- specific to this skill → in place
Never duplicate the same sentence across surfaces.

## 4. Propagate to siblings

Search `skills/` + `commands/` (user-level, the current repo's, the canonical source repo's) for the same failure surface (same command shape or pattern); prepare the same generalized fix for each hit, in its canonical source.

## 5. Confirm, write, commit

ONE batched confirmation: incident + root cause, per-file diffs (target, rule home, siblings). AskUserQuestion: approve all / pick files / tweak. Never write unconfirmed. On approve: write in a worktree of each canonical source's repo — private repos too, unless that repo's own worktree policy says otherwise — never an installed copy; commit path-scoped (`fix(skills): harden <name> — <weakpoint class>`).
