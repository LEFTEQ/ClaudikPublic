---
disable-model-invocation: true
name: dirty
description: "Bring a checkout to latest origin/<branch> and clean the tree — discard regenerable artifacts, propose .gitignore lines, commit real work, pull."
argument-hint: "[branch] [--dry-run]"
---

Bring `$ARGUMENTS` (branch; empty = current) to `origin/<branch>`, tree clean. Engine: Read `~/.claude/skills/sync/SKILL.md`; this command replaces its §2 with the triage below and aligns with `origin/<branch>` only (default-branch merge stays `/sync`'s); everything else applies.

## Where

Never switch a checkout. `git worktree list` → the checkout on `<branch>` is the target, its absolute path `<ABS>` for every `git -C`. None → `git worktree add .worktrees/<branch> <branch>` tracking `origin/<branch>`, and that worktree is `<ABS>`; under `WORKTREE_POLICY=never` (`.claude/.claude.git.config`) the primary checkout must already be on `<branch>`, else stop and say so.

## Triage the dirt — every path into exactly one bucket

`node ~/.claude/lib/git/bin/sync-context.ts --repo <ABS>` (generatedPaths, regenCmd, lockfiles) + `node ~/.claude/lib/git/bin/classify-paths.ts --repo <ABS>` (secrets, artifacts); read the diff of the rest. The repo's CLAUDE.md and `.claude/.claude.git.config` win over built-ins.

- **DISCARD** — `artifacts[]`, `generatedPaths` matches, build/regen output, lockfile churn without manifest change, formatter-only churn, screenshots/reports outside `.vitrinka/`. Tracked → `git -C <ABS> restore -- <paths>`; untracked → delete per path. Never `restore .`, `checkout .`, or `clean` without explicit paths.
- **IGNORE** — every regenerable untracked DISCARD path → one `.gitignore` proposal: narrowest pattern per group, one-line reason per group, ONE AskUserQuestion; on approval apply + commit `chore(gitignore): …`. A tracked generated file churning every run → report as `git rm --cached` + ignore candidate, never do it unasked.
- **SECRET** — `secrets[]`: leave in place, never stage, name loudly.
- **COMMIT** — hand-written source, tests, docs, config → path-scoped Conventional Commits per `~/.claude/skills/push-all/SKILL.md` §2, then push. In the primary checkout list every swept path per commit and flag paths that look like another session's WIP.
- **ASK** — ambiguous (hand-edited generated file, large binary, moved fixture) → batched AskUserQuestion, recommended bucket first; never guess toward DISCARD.

`--dry-run` → print buckets and pull plan, touch nothing.

## Then

sync §1 guards → §4 step 1 align with `origin/<branch>` (ff-only; diverged → merge, conflicts per §4.1–4.2, never rebase) → §5 shared tail → §6 report + triage table (bucket · paths · action) + accepted/declined `.gitignore` lines.
