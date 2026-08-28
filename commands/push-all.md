---
disable-model-invocation: true
name: push-all
description: User wants everything committed AND pushed in one go ("push all", "commit and push everything") — sweep the whole working tree into Conventional Commits, then push the current branch.
argument-hint: ""
---

# /push-all — sweep the tree into commits, then push

`/commit-all` then `git push`. The user opted in by invoking the command; don't
re-ask before committing.

## Procedure

1. **Commit** — read `~/.claude/skills/git/commit-all/SKILL.md` and follow it
   exactly (resolve its relative paths against that skill directory). Every hard
   rule there still applies: explicit paths only, never `-A`/`.`, never
   `--amend`, never `--no-verify`, secrets and artifacts skipped and reported.
2. **Refuse to push from the default branch** — UNLESS the repo is a
   commit-to-main-by-design repo. Those are:
   - the deploy-from-main infra repos (`prod-infra`, `devops-infra`)
   - config/dotfiles repos with no PR workflow (`~/.claude` and the like)
   - any repo whose history is main-only — check it, don't assume:
     `git log --oneline --first-parent -20` shows no merge commits AND
     `gh pr list --state all --limit 1` is empty.

   Anywhere else, on `main`/`master`: stop after the commits, report them, and
   say a branch is needed. The guard exists to stop feature work landing on main
   in a PR-based repo — it is not meant to block a repo that has never used PRs.
3. **Push** — `git push`. No upstream → `git push -u origin <branch>`.
   Rejected (remote ahead) → STOP and report ahead/behind. Never force, never
   `--force-with-lease`, never rebase to make it fit. Hand off to `/sync`.
4. **Report** — the commits from step 1 (including the skipped 🔒 secrets and
   🗑 artifacts block), then the push result with the branch and remote.

## Hard rules

- **Never force-push.** A rejected push is a signal to look, not to overpower.
- **Never open a PR** — that's `/prc`.
- **Nothing to commit** → still push if the branch has unpushed commits; say so.
- **Pre-commit hook fails** → fix the cause and make a new commit; never bypass.

## Related
`/commit-all` (commit only) · `/commit` (one change-set) · `/prc` (open the PR) · `/sync` (when the push is rejected)
