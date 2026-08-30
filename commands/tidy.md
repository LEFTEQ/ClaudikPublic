---
disable-model-invocation: true
name: tidy
description: User wants leftovers resolved ("clean up branches", "tidy this repo", "what's still hanging around", "delete the merged branches") — audit branches + worktrees + compose stacks, then resolve each item — merge the mergeable, delete the provably merged (local AND remote), tear down orphan stacks.
argument-hint: "[slug|all] [--dry-run]"
---

# /tidy — resolve everything left hanging

One pass: audit every branch, worktree, and compose stack, then resolve what the
audit proved — merge the mergeable, delete the merged (local branch, remote branch,
worktree, stacks), tear down orphan compose projects. The audit is the evidence;
nothing is deleted without it.

**Never touches:** the current branch, the default branch, anything unmerged (unless
the user picks its merge action), anything dirty, anything with an open PR, anything
on the keep-list.

## 1. Audit — always, never skipped

1. `git rev-parse --is-inside-work-tree` — non-zero → stop with `(not a git repo)`.
2. `$DEFAULT`: `git symbolic-ref --quiet refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'`;
   empty → prefer `main`, else `master`, else AskUserQuestion. Never guess.
3. `git fetch --prune --quiet`; report `pruned N refs` in the footer.
4. Inventory:
   ```bash
   git branch -vv
   git branch -r --no-color | sed 's/^[[:space:]]*//' | grep -v '^origin/HEAD'
   git worktree list --porcelain
   docker compose ls -a --format json      # running AND stopped
   ```
5. Keep-list: `.claude/tidy-keep` (one branch/worktree path per line, `#` comments)
   marks parked work — excluded from candidacy and probes; report as one line
   (`kept: 3 listed`). Offer `keep` as a §2 action — choosing it appends here.

### Classify each branch (skip `$DEFAULT` and keep-listed)

- **Merged by reachability:** `git branch --merged "$DEFAULT"` (and `-r`) → `DELETABLE`.
- **Squash-merged** (only if not already merged) — `git cherry "$DEFAULT" "$BRANCH"`:
  all `-` → `DELETABLE`; all `+` → inconclusive: a squash commit's patch equals the
  branch's ENTIRE diff from its merge base, so compare patch-ids from the merge base
  (diffing from `$DEFAULT` instead also counts everything `$DEFAULT` gained since the
  fork):
  ```bash
  MB=$(git merge-base "$DEFAULT" "$BRANCH")
  ID=$(git diff $MB "$BRANCH" | git patch-id --stable | cut -d' ' -f1)
  git log -p --format=%H "$MB..$DEFAULT" | git patch-id --stable | grep "^$ID "
  ```
  Match → `DELETABLE (squash)`, corroborated by the PR's `mergeCommit.oid` when `gh`
  is up. No match → unmerged: NOT a deletion candidate no matter what — false
  positives destroy work; false negatives just leave a branch lying around.
- **Merge probe** (unmerged only, git ≥ 2.38; older → `probe n/a`):
  `git merge-tree --write-tree "$DEFAULT" "$BRANCH"` (read-only). Exit 0 →
  `MERGEABLE`; exit 1 → `CONFLICTS ×N` (count `CONFLICT` lines). Record
  `git rev-list --left-right --count "$DEFAULT...$BRANCH"` for the report.
- **PR state** (skip if `gh auth status` fails — note it; local detection still works):
  `gh pr list --head "$BRANCH" --state all --limit 5 --json number,state,title,url,mergedAt`.
  `OPEN` → never a deletion candidate (resolution path `/prm`). `MERGED` →
  corroborates. `CLOSED` → closed-without-merge, not deletable.
- **Staleness:** last commit `<30d` unlabelled · `30–90d` `stale` · `>90d` `very stale`.

### Classify each worktree (every one gets a status, not just candidates)

- Dirtiness with numbers (`status --porcelain` count, `diff HEAD --shortstat`,
  untracked count) · disk (`du -sh`) · holders (`lsof +D <path>` — listed in the
  report; audit only lists, never kills).
- Classes by priority: **REMOVABLE** (branch DELETABLE + clean) · **BLOCKED-dirty**
  (DELETABLE + uncommitted, show counts) · **MERGEABLE** (unmerged, clean, probe
  clean → `merge → remove`) · **CONFLICTS ×N** · **DIRTY** (unmerged + uncommitted)
  · **BLOCKED-open-PR** (→ `/prm`) · `⚠ branch gone`.
- **STRAY DIR** — under `.worktrees/` but unknown to git
  (`comm -23 <(ls -1 .worktrees | sort) <(git worktree list --porcelain | awk '/^worktree /{print $2}' | xargs -n1 basename | sort)`);
  candidate only after `find <dir> -type f | head` + `du -sh` show build artifacts alone.

### Classify each compose stack

From `docker compose ls -a`, keep this repo's projects: `wt-<slug>` / `wk-<slug>`
(+ `-e2e` twins) and the repo's own name. Cross-reference worktree existence:
**LIVE** (worktree exists → keep) · **ORPHAN running** (→ offer `down`) · **ORPHAN
stopped** (→ offer full removal; `down -v` only under §3's carve-out; count volumes
+ size).

### Print the report

Tables ≤ 55 columns (must fit a ~350px pane); one item spans as many rows as needed —
a `┌` path row, then `│` detail rows; never widen a column.

```
=== tidy · <repo> · main · fetched HH:MM ===

LOCAL BRANCHES
┌ feat/foo          merged · DELETABLE
┌ feat/bar          open PR #123 → /prm
┌ feat/baz          2↑ 14↓ · MERGEABLE · 47d

REMOTE BRANCHES
┌ origin/feat/foo   merged · DELETABLE

WORKTREES
┌ .worktrees/foo        feat/foo · 1.2G
│  merged · clean · REMOVABLE (+ wt-foo)
┌ .worktrees/wip        feat/wip · 2.1G
│  DIRTY 3 files · +47/−12 · CONFLICTS ×2
│  holder: node (vite) pid 4242

COMPOSE STACKS
┌ wt-foo    orphan · running → down
┌ wt-wip    live · running · keep

SUMMARY
  deletable: 3 local · 2 remote
  removable worktrees: 1 · mergeable: 1
  orphan stacks: 2 · blocked: 1 · kept: 3 listed
  reclaimable: ~3.6 GB
fetch --prune: pruned 0 · gh OK
```

## 2. Confirm — ONE batched question

AskUserQuestion, `multiSelect`, one option per resolvable item carrying its action
and everything that goes with it (`remove: feat/foo — local + remote + worktree +
wt-foo stack` · `merge → remove: feat/bar` · `down: wt-old stack (orphan, 2 vols)` ·
`keep: feat/baz → tidy-keep`). Never one prompt per item.

`--dry-run` → print the report, stop. Nothing resolvable → `(nothing to tidy)`, stop.

## 3. Execute — per item, in this order

The audit expires: parallel sessions merge PRs and move worktrees mid-sweep, so
before the first deletion re-run `git fetch --prune --all` and re-confirm every
selected item still classifies the same and every selected worktree is still clean.
Whatever changed — and any branch that appeared after the inventory — drops out of
the batch and is reported, never acted on with older evidence.

0. **Merges first.** Each `merge → remove` item: `/prm --auto` from its worktree,
   sequentially. Conflicts or a red gate abort THAT item only; the rest continues.
   Once merged it re-classifies `DELETABLE` and flows into teardown.
1. **Free cwd-holders — kill discipline is LAW.** `lsof +D <path>` (plain `+D`;
   `-d cwd` misses a process sitting in the dir itself). Kill ONLY dev servers
   matching `next dev|expo|metro|nest|vite|webpack|tsx watch|bun run .*dev|node .*(dev|serve)|playwright.*test`.
   **NEVER kill** `claude`, `tmux`, any `*mcp*`, shells, or editors — live sessions,
   often someone else's. Non-dev holders remaining → skip that item, report
   `pid + command`, move on. Blocked is the safe outcome.
2. **Project-native teardown wins.** Repo declares one (`AFTER_MERGE_CMD` in
   `.claude/.claude.git.config` — see `~/.claude/skills/prm/references/merge.md` —
   or a `worktree:cleanup` script) → run its dry-run then the real thing.
3. **Generic fallback.** `docker compose -p wt-<slug> down` — and `wt-<slug>-e2e`,
   the separately-orphaned twin; same for selected ORPHAN stacks. `down -v` ONLY when
   the worktree is gone or being removed AND each volume's
   `com.docker.compose.project` label starts with `wt-`/`wk-` — verify per volume,
   refuse anything else.
4. **Worktree:** `git worktree remove <path>` with a generous timeout — deleting
   `node_modules` takes minutes; slow ≠ failed. Stray dirs: `rm -rf` (git refuses
   paths it doesn't track).
5. **Local branch:** `git branch -d` only. Refusal → report verbatim, never `-D`.
6. **Remote branch — EVERY remote carrying it, not just `origin`** (FixIt also has
   `devbox`, the `/rt` bare cache — deleting only from `origin` leaves the copy
   pinned forever and §1's `git branch -r` keeps listing it). Only branches the audit
   marked `DELETABLE` and the user selected; never unmerged, never an open PR, never
   `$DEFAULT`. Carry the approved set as a FILE (one branch per line — feeds `comm`
   and a `grep -vxF` deny-list of `$DEFAULT` + open-PR + newly-appeared branches as
   the last guard), then ONE round-trip per REMOTE, not per branch:
   ```bash
   for R in $(git remote); do
     git ls-remote --heads "$R" | sed 's@.*refs/heads/@@' | sort > "/tmp/heads-$R"
     comm -12 approved.txt "/tmp/heads-$R" | sed 's@^@:refs/heads/@' > "/tmp/del-$R"
     [ -s "/tmp/del-$R" ] && xargs git push "$R" < "/tmp/del-$R"
   done
   git fetch --prune --all
   ```
   Report each deletion. `git branch -r` lists `devbox/*` alongside `origin/*` —
   strip the remote prefix before classifying; never feed `devbox/feat/foo` to a
   `push --delete origin`.
7. **Keep actions:** append each selected `keep` to `.claude/tidy-keep`.
8. **Re-check the path** — a dev server that outlived the teardown recreates it as
   build output; files newer than the teardown give it away.

## Arguments

Bare word → restrict to that slug/branch. Empty → whole repo (cwd). `all` →
cross-repo sweep: discover via `find ~/Work/Projects -maxdepth 4 -type d -name
.worktrees` plus any repo a `wt-*`/`wk-*` compose project's `working_dir` label
points at; audit per repo (subagents fine, ≤ 4 at a time), one consolidated report,
ONE batched confirmation, execute per repo under the same rules.

## Report

Resolved (merged · removed local/remote/worktrees/stacks) · disk reclaimed ·
kept-and-why · holders refused · merge items aborted-and-why.

## Related
`/prm` (open-PR resolution and post-merge teardown) · `/wk:cleanup` (FixIt's engine) · `/me:cleanup:processes` (machine-wide)
