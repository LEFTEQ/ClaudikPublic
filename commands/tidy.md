---
disable-model-invocation: true
name: tidy
description: User wants leftovers resolved ("clean up branches", "tidy this repo", "what's still hanging around", "delete the merged branches") — audit branches + worktrees + compose stacks, then resolve each item — merge the mergeable, delete the provably merged (local AND remote), tear down orphan stacks.
argument-hint: "[slug|all] [--dry-run]"
---

# /tidy — resolve everything left hanging

One pass: audit every branch, worktree, and compose stack, then resolve what
the audit proved — merge branches that can merge, delete what's merged (local
branch, remote branch, worktree, stacks), tear down orphan compose projects.
The audit is the evidence; nothing is deleted without it.

Single repo (cwd) by default; `all` sweeps every repo (see Arguments).
**Never touches:** the current branch, the default branch, anything unmerged
(unless the user picks its merge action), anything dirty, anything with an
open PR, anything on the keep-list.

## 1. Audit — always, never skipped

### 1.1 Sanity

`git rev-parse --is-inside-work-tree` — non-zero → stop with `(not a git repo)`.

### 1.2 Default branch → `$DEFAULT`

```bash
git symbolic-ref --quiet refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'
```
Empty → prefer `main`, else `master`, else ask via AskUserQuestion. Never guess.

### 1.3 Refresh

```bash
git fetch --prune --quiet
```
Deletes stale tracking refs only. Report `pruned N refs` in the footer.

### 1.4 Inventory

```bash
git branch -vv                          # locals + upstream + ahead/behind
git branch -r --no-color | sed 's/^[[:space:]]*//' | grep -v '^origin/HEAD'
git worktree list --porcelain
docker compose ls -a --format json      # running AND stopped projects
```

### 1.5 Keep-list

`.claude/tidy-keep` (one branch or worktree path per line, `#` comments) marks
intentionally parked work. Listed items are excluded from candidacy and merge
probes entirely; the report shows them as one summary line (`kept: 3 listed`).
Offer `keep` as an action in §2 — choosing it appends the item to this file.

### 1.6 Classify each branch (skip `$DEFAULT` and keep-listed — never candidates)

**Merged by reachability:** `git branch --merged "$DEFAULT"` (locals) and
`git branch -r --merged "$DEFAULT"` (remotes) → `DELETABLE`.

**Squash-merged** (only if not already merged) — `git cherry "$DEFAULT" "$BRANCH"`:
- all lines `-` → `DELETABLE`
- all lines `+` → inconclusive. A squash commit's patch equals the branch's
  ENTIRE diff from its merge base, so compare patch-ids in one streamed pass —
  diffing from `"$DEFAULT"` instead also counts everything `$DEFAULT` gained
  since the fork, which makes a long-merged branch read as hundreds of changed
  files:
  ```bash
  MB=$(git merge-base "$DEFAULT" "$BRANCH")
  ID=$(git diff $MB "$BRANCH" | git patch-id --stable | cut -d' ' -f1)
  git log -p --format=%H "$MB..$DEFAULT" | git patch-id --stable | grep "^$ID "
  ```
  A match → `DELETABLE (squash)`, corroborated by the PR's `mergeCommit.oid`
  when `gh` is up. No match → unmerged — continue to the merge probe below; it
  is **not** a deletion candidate no matter what. False positives destroy
  work; false negatives just leave a branch lying around.

**Merge probe** (unmerged branches only, git ≥ 2.38; older → `probe n/a`):
```bash
git merge-tree --write-tree "$DEFAULT" "$BRANCH"
```
Read-only, no checkout. Exit 0 → `MERGEABLE`. Exit 1 → `CONFLICTS ×N`
(count the `CONFLICT` lines). Record ahead/behind for the report:
```bash
git rev-list --left-right --count "$DEFAULT...$BRANCH"   # behind<TAB>ahead
```

**PR state** (skip entirely if `command -v gh` + `gh auth status` fails — note it
in the footer, local merge detection still works):
```bash
gh pr list --head "$BRANCH" --state all --limit 5 --json number,state,title,url,mergedAt
```
`OPEN` → never a deletion candidate (its resolution path is `/prm`, note the
PR number). `MERGED` → corroborates `DELETABLE`. `CLOSED` → report as
closed-without-merge, not deletable.

**Staleness:** `git log -1 --format=%ct "$BRANCH"` → `<30d` unlabelled, `30–90d`
`stale`, `>90d` `very stale`.

### 1.7 Classify each worktree

Every worktree gets a resolution status, not just deletion candidates:

- **Dirtiness with numbers:** `git -C <path> status --porcelain` — count files;
  `git -C <path> diff HEAD --shortstat` for `+ins/−del` (staged + unstaged);
  count untracked separately.
- **Disk:** `du -sh <path>` — feeds the reclaim estimate.
- **Holders:** `lsof +D <path>` — list dev servers / simulators sitting in it
  now, in the report, not only at deletion time (same match/never-kill rules
  as §3.1; audit only lists, never kills).
- Status classes, by priority:
  - **REMOVABLE** — branch `DELETABLE` AND clean
  - **BLOCKED-dirty** — branch `DELETABLE` but uncommitted changes (show counts)
  - **MERGEABLE** — unmerged, clean, merge probe clean → action `merge → remove`
  - **CONFLICTS** — unmerged, merge probe conflicts (show `×N`)
  - **DIRTY** — unmerged + uncommitted changes (show counts + merge probe of
    the committed part)
  - **BLOCKED-open-PR** — resolution path is `/prm`, note the PR
  - `⚠ branch gone` — worktree whose branch was deleted externally
- **STRAY DIR** — under `.worktrees/` but unknown to git:
  ```bash
  comm -23 <(ls -1 .worktrees | sort) \
           <(git worktree list --porcelain | awk '/^worktree /{print $2}' \
             | xargs -n1 basename | sort)
  ```
  Candidate only after `find <dir> -type f | head` + `du -sh <dir>` show build
  artifacts alone.

### 1.8 Classify each compose stack

From `docker compose ls -a`, keep projects belonging to this repo: `wt-<slug>`
/ `wk-<slug>` (+ their `-e2e` twins) and the repo's own project name.
Cross-reference with worktree existence:

- **LIVE** — worktree exists → keep; note `running` or `stopped`
- **ORPHAN running** — worktree gone → offer `down`
- **ORPHAN stopped** — worktree gone, containers/volumes remain → offer full
  removal; `down -v` allowed ONLY under the wt-* carve-out in §3.3. Count its
  volumes and their size for the reclaim estimate.

### 1.9 Print the report

Tables are **≤ 55 columns wide** (must fit a ~350px pane); one item spans as
many rows as it needs — a `┌` path row, then `│` detail rows. Never widen a
column to fit on one line.

```
=== tidy · <repo> · main · fetched HH:MM ===

LOCAL BRANCHES
┌ feat/foo          merged · DELETABLE
┌ feat/bar          open PR #123 → /prm
┌ feat/baz          2↑ 14↓ · MERGEABLE · 47d

REMOTE BRANCHES
┌ origin/feat/foo   merged · DELETABLE
┌ devbox/feat/foo   merged · DELETABLE

WORKTREES
┌ .worktrees/foo        feat/foo · 1.2G
│  merged · clean · REMOVABLE (+ wt-foo)
┌ .worktrees/bar        feat/bar · 890M
│  4↑ 0↓ · MERGEABLE clean → merge
┌ .worktrees/wip        feat/wip · 2.1G
│  DIRTY 3 files · +47/−12 · CONFLICTS ×2
│  holder: node (vite) pid 4242

COMPOSE STACKS
┌ wt-foo    orphan · running → down
┌ wt-old    orphan · stopped · 2 vols 1.4G
┌ wt-wip    live · running · keep

SUMMARY
  deletable: 3 local · 2 remote
  removable worktrees: 1 · mergeable: 1
  orphan stacks: 2 · blocked: 1 · kept: 3 listed
  reclaimable: ~3.6 GB
fetch --prune: pruned 0 · gh OK
```

## 2. Confirm — ONE batched question

AskUserQuestion, `multiSelect`, one option per resolvable item, each carrying
its **action** and everything that goes with it:

- `remove: feat/foo — local + remote + worktree + wt-foo stack` (REMOVABLE)
- `merge → remove: feat/bar` (MERGEABLE — /prc --auto, then teardown)
- `down: wt-old stack (orphan, 2 vols)` (orphan stacks)
- `keep: feat/baz → tidy-keep` (silence it in future audits)

Never one prompt per item.

- `--dry-run` → print the report, stop.
- Nothing resolvable → `(nothing to tidy)`, stop.

## 3. Execute — per item, in this order

The audit expires. Parallel sessions in the same repo merge PRs, remove
worktrees and create branches mid-sweep, so before the first deletion re-run
`git fetch --prune --all` and re-confirm every selected item still classifies
the same and every selected worktree is still clean. Whatever changed — and
any branch that appeared after §1.4 — drops out of the batch and is reported,
never acted on with older evidence.

0. **Merges first.** Each selected `merge → remove` item: run `/prc --auto`
   from its worktree, sequentially, one at a time. A merge that hits conflicts
   or a red gate aborts THAT item only (report it, leave everything intact);
   the rest of the batch continues. Once merged, the item re-classifies
   `DELETABLE` and flows into the teardown below.
1. **Free cwd-holders — kill discipline is LAW.** `lsof +D <path>` (plain `+D`;
   `-d cwd` misses a process sitting in the dir itself). Kill ONLY dev servers
   matching `next dev|expo|metro|nest|vite|webpack|tsx watch|bun run .*dev|node .*(dev|serve)|playwright.*test`.
   **NEVER kill** `claude`, `tmux`, any `*mcp*`, shells, or editors — those are
   live sessions, often someone else's. Non-dev holders remaining → skip that
   item, report `pid + command`, move on. Blocked is the safe outcome.
2. **Project-native teardown wins.** If the repo declares one (`AFTER_MERGE_CMD`
   in `.claude/.claude.git.config`, or a `worktree:cleanup` script), run its
   dry-run then the real thing. It knows the repo's stacks, DBs and simulators;
   the generic path doesn't.
3. **Generic fallback.** `docker compose -p wt-<slug> down` — and `wt-<slug>-e2e`,
   the separately-orphaned twin. Same for selected ORPHAN stacks (running or
   stopped). `down -v` ONLY when the worktree is gone or being removed AND each
   volume's `com.docker.compose.project` label starts with `wt-`/`wk-`; verify
   per volume, refuse anything else.
4. **Worktree:** `git worktree remove <path>` with a generous timeout — it deletes
   `node_modules`, so minutes are normal and slow ≠ failed. Stray dirs: `rm -rf`
   (git refuses paths it doesn't track).
5. **Local branch:** `git branch -d` only. Refusal → report verbatim, never `-D`.
6. **Remote branch — EVERY remote carrying it, not just `origin`.** Only for
   branches the audit marked `DELETABLE` and the user selected. Never for
   `unmerged`, never for an open PR, never for `$DEFAULT`. Report each deletion.

   A repo often pushes feature branches to more than one remote — FixIt has
   `origin` (GitHub) plus `devbox`, the `/rt` remote-test bare cache at
   `devops:/opt/devbox/_cache/local/<repo>.git`. Deleting only from `origin`
   leaves the other copy behind forever, pinned at whatever commit the last
   remote test ran; `git fetch --prune origin` never sees it, and §1.4's
   `git branch -r` keeps listing it as `devbox/<branch>` long after the work
   merged. So:

   Carry the approved set as a FILE, one branch per line: it feeds `comm` and
   `grep -xF` directly, and `grep -vxF` against a deny-list of `$DEFAULT` plus
   every open-PR and newly-appeared branch is the last guard before anything
   irreversible. Then take one round-trip per REMOTE, not per branch — probing
   each branch on each remote is `branches × remotes` SSH connections and stalls
   partway through a large sweep, leaving it half-deleted.

   ```bash
   for R in $(git remote); do
     git ls-remote --heads "$R" | sed 's@.*refs/heads/@@' | sort > "/tmp/heads-$R"
     comm -12 approved.txt "/tmp/heads-$R" | sed 's@^@:refs/heads/@' > "/tmp/del-$R"
     [ -s "/tmp/del-$R" ] && xargs git push "$R" < "/tmp/del-$R"
   done
   git fetch --prune --all
   ```

   Intersecting with `ls-remote` first skips remotes that never saw a branch
   instead of printing push failures, and no single remote's failure aborts the
   rest of the teardown.

   **Also mind §1.4:** `git branch -r` lists `devbox/*` alongside `origin/*`, so
   strip the remote prefix before classifying — never feed `devbox/feat/foo` to
   a `push --delete origin` as if it were a branch name.
7. **Keep actions:** append each selected `keep` item to `.claude/tidy-keep`.
8. **Re-check the path** — a dev server that outlived the teardown recreates it as
   build output. Files newer than the teardown give it away.

## Arguments

`$ARGUMENTS` — a bare word restricts the sweep to that slug/branch; `--dry-run`
plans only. Empty = whole repo (cwd).

`all` = cross-repo sweep: discover repos via
`find ~/Work/Projects -maxdepth 4 -type d -name .worktrees` plus any repo a
`wt-*`/`wk-*` compose project points at (its
`com.docker.compose.project.working_dir` label). Run the audit per repo
(subagents fine, ≤ 4 at a time), print one consolidated report (repo header
per section), ONE batched confirmation across all repos, then execute per
repo. The per-repo safety rules apply unchanged.

## Report

Resolved (merged · removed local/remote/worktrees/stacks) · disk reclaimed ·
kept-and-why · holders refused · merge items aborted-and-why.

## Related
`/merge` (post-merge teardown of one PR) · `/prm` (open-PR resolution) · `/wk:cleanup` (FixIt's own engine) · `/me:cleanup:processes` (machine-wide)
