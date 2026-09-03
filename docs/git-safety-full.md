# Git Safety — full law

The primary checkout is the user's seat: never switch its branch, never stash, never restore over it. ANY change, however small, happens in an in-repo worktree — main branches are push-protected and uncommitted changes in the primary checkout block pulls.

## Worktrees

- `git worktree add .worktrees/<name> -b <branch>` — in-repo, never sibling directories; ensure `.worktrees/` is gitignored first. Create directly — the repo's `WORKTREE_POLICY` (`<repo>/.claude/.claude.git.config`) is the only gate: `always` (default when absent) · `feature` (worktree only for new-feature work) · `never`.
- The worktree rule is about the primary checkout, not about review: `MERGE_POLICY=self` in the same config file (see `~/.claude/skills/prm/references/merge.md`) keeps the worktree + PR and drops the review loop — the PR is labelled `eve-ignore` and admin-merged the moment its gate is green.
- A worktree already holds the branch you need (`git worktree list`) → use it; never create a spare per task.
- The user may say "work in the current branch" — then commit in place.
- Commit only your own change-set, path-scoped; unrelated parallel-session changes are never stashed, reverted, or bundled in.
- Subagents: prefer `isolation: "worktree"` on the Agent tool.
- Never `cd` into a worktree from a long-lived/background shell — a process whose cwd is inside `.worktrees/<name>` blocks `git worktree remove` with a cryptic macOS EPERM. Recovery: `lsof -a -d cwd +D <dir>` → kill holders → `git worktree remove --force`.

## Exemption — deploy-from-main repos (`WORKTREE_POLICY=never`)

Infra repos (`devops-infra`, `prod-infra`, `web-infra`), `~/.claude` itself, and `~/Exports` (a deliverables dump — extractions, PDFs, documents; nothing there is code under review): work directly on main in the primary checkout — the deploy/consumption unit is committed main-state. Infra sequencing: commit + push BEFORE any scp/deploy, never ship a dirty file. No-switch/no-stash still apply in full. See the `infra-ops` skill.

## Forbidden without explicit user approval

Enforced by `~/.claude/hooks/claude-guards` (PreToolUse → Bash; inactive inside `.worktrees/`, `/tmp`). Genuine exceptions: ask, then re-run with `CLAUDE_ALLOW_DANGEROUS=1`.

- `git checkout <branch>` / `git switch` in the primary checkout — even when the tree looks clean.
- `git checkout .` / `git restore .` — destroys uncommitted work.
- `git stash` in ANY form — parallel sessions share the tree and misread reverting files as user edits. Need committed-HEAD state? `git show HEAD:<file>`, or `git archive HEAD <paths> | tar -x -C <scratchpad>`.
- Not guard-enforced but same rule: `git checkout <ref> -- <path>` and detached-HEAD inspection — use a worktree, `git show`, or `git log -p`.

## Primary checkout position

Always on the default branch (standing arrangement 2026-08-08): after a merge, pull it — never switch it. Found on another branch → another session or the user is mid-something: report and skip.

Related: `~/.claude/docs/orchestration-full.md` (worktree base-commit verification), `~/.claude/skills/prm/SKILL.md` (the PR verb: create → review → merge → teardown).
