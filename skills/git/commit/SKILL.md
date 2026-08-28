---
name: commit
description: "Manual only: use when explicitly invoked as `/commit`. Commits ONLY the current task's coherent change-set; leaves unrelated working-tree changes untouched."
---

# git:commit — surgical, feature-scoped Conventional Commit

The user opted in via the slash command. Commit **only the one coherent change-set** that belongs to the work at hand — not the whole tree. Unrelated edits, other sessions' WIP, and stray changes are LEFT in place and reported. To sweep everything, that's `/commit-all`.

## When to bind

ONLY when the user just invoked `/commit`. Without that explicit slash command, the global CLAUDE.md commit policy ("NEVER commit changes unless the user explicitly asks") applies — defer to it.

## Procedure

1. **Scan** — `git status --short` + `git diff` + `git diff --staged`. If the tree is clean, say so and stop.
2. **Classify & exclude** — `node ~/.claude/skills/git/_shared/bin/classify-paths.ts --repo <ABS repo path>` → `{ commit[], secrets[], artifacts[] }`. **Always pass `--repo` as a LITERAL absolute path** (the repo/worktree you are committing in) — never `$(git rev-parse --show-toplevel)`, which re-inherits the drifted cwd it is meant to defend against. Without it the classifier reads whatever repo the persistent shell is parked in and you stage from the wrong tree. Never stage `secrets[]` (env/keys/creds) or `artifacts[]` (node_modules, allure/playwright/coverage, `.DS_Store`, `*.log`, …). Only `commit[]` is eligible.
3. **Select the focused change-set (the surgical step):**
   - If anything is **staged**, that IS the selection — the user already chose it. Commit exactly the staged paths (split into multiple Conventional Commits if they span topics). Do NOT add unstaged/untracked files.
   - If nothing is staged, pick the **single most coherent bundle** from `commit[]` — same module/directory/feature, tests folded in with their code, a manifest + its lockfile together. Commit just that bundle; leave every other `commit[]` path uncommitted.
   - If several unrelated bundles are equally plausible and none dominates, commit the one tied to the current branch/task context and report the rest.
4. **Draft Conventional Commit messages** — `type(scope): subject` (`feat`/`fix`/`chore`/`docs`/`refactor`/`test`/`perf`/`style`; scope = leading dir/feature; imperative ≤72 chars, no trailing period; body only when the WHY isn't obvious).
5. **Commit serially** — `git add <explicit-paths>` then commit via HEREDOC. Never `-A`/`.`. Never `--amend`. Never `--no-verify`. Pre-commit hook fails → fix the cause, new commit.
6. **Verify & report** — print what was **committed**, then explicitly LIST what was **deliberately left uncommitted**: related-but-other bundles, plus skipped `secrets[]` (🔒) and `artifacts[]` (🗑). Nothing is silently dropped. End by noting `/commit` again (next bundle) or `/commit-all` (sweep the rest).

## Hard rules

- **Surgical by default** — never sweep the whole tree; that's `/commit-all`.
- **Respect staging** — if the user staged something, commit exactly that, nothing more.
- **Never** stage `secrets[]` / `artifacts[]` (classify-paths skips them); report them.
- **Never** `git add -A`/`.` · **never** `--amend` · **never** `--no-verify` · **never** push.
- **Never** silently omit a left-behind path — every uncommitted change appears in the report.

## `/commit` vs `/commit-all`

| Command | Scope |
|---|---|
| `/commit` | one coherent change-set (staged, or the dominant feature bundle); leaves the rest |
| `/commit-all` | the ENTIRE working tree — all bundles, incl. other sessions' work |
