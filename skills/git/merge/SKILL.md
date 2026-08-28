---
name: merge
description: "Manual only: use when explicitly invoked as `/merge`. Fully autonomous: drives the git commands to make the current PR mergeable, merges it (merge commit), removes the worktree + branch, then pulls the main clone (never switches it)."
---

# git:merge — finish the feature: merge + teardown + come home

The user opted in via the slash command. **Fully autonomous, no confirmation gate** — the pre-check gates ARE the safety. For the current branch's PR (worktree-safe): run pre-checks; if a gate fails, drive the relevant `git:` skill to fix it; once all gates pass, merge, tear down the worktree + branch, and pull the main clone (which is always on the default branch — never switch it).

Composes `~/.claude/skills/git/_shared/output.md` (full clickable links), plus `/commit-all`, `/prm`, `/actions`.

## Usage

`/merge [PR] [--admin]` — empty PR = this checkout's PR (current branch / worktree). `--admin` allows an admin merge over branch protection (only when you pass it).

## Procedure

1. **Pre-check (read-only):** `node ~/.claude/skills/git/_shared/bin/merge-precheck.ts <PR?> --repo <ABS path of the CHECKOUT you are merging FROM>` (LITERAL absolute path — never `$(git rev-parse --show-toplevel)`). **When the feature lives in a worktree, that is the WORKTREE path (`…/.worktrees/<name>`), NOT the main clone.** `--repo` anchors the ENTIRE resolution — anchoring at the main clone flips `isWorktree:false`/`onDefaultBranch:true` (a wrong-reason STOP) and, worse, resolves `slug`/`resolvedAfterMergeCmd` against the main clone, aiming the teardown hook at the primary checkout (e.g. `/wk:cleanup <project> --remove`). **Cross-check before proceeding:** if you know you're in a worktree but the envelope says `isWorktree:false` (or `slug` equals the main clone's basename), the anchor is wrong — re-run with the worktree path; never act on that envelope. → JSON: `{owner, repo, pr, url, title, branch, defaultBranch, onDefaultBranch, worktree, mainClone, isWorktree, slug, checks, gates, botApproval, requiredBotReviewers, afterMergeCmd, resolvedAfterMergeCmd, raw}`. `botApproval = {ok, required[], pending[]}` is the required-bot-reviewer gate (any configured/auto-detected bot); `gates.botApprovalOk` mirrors `botApproval.ok` and surfaces as the `botReview` failed-gate.
2. **Hard guards — STOP immediately if:**
   - `onDefaultBranch` → "On the default branch — nothing to merge here. Run `/merge` from the feature's worktree, or pass the PR number explicitly." **Do NOT tell the user to switch this checkout to a feature branch** — the primary checkout stays on the default branch, and isolation is what `/wk:create` is for.
   - `raw.state !== "OPEN"` → already merged/closed.
3. **Drive to green (bounded loop, max 6 iterations):** while `gates.allPass === false`, act on each entry of `gates.failed`, then **re-run merge-precheck**:

   | failed gate | action |
   |---|---|
   | `clean` (dirty worktree) | invoke `/commit-all` (commits the whole tree), then `git push` |
   | `ci` | invoke `/actions` (diagnose → fix → push → re-watch until green) |
   | `review` + `raw.reviewDecision == CHANGES_REQUESTED` | invoke `/prm --once` (resolve comments + push). If still not `APPROVED` afterwards → **STOP: "blocked on human approval"** |
   | `review` + `REVIEW_REQUIRED` | If the **solo-owner carve-out** applies (see below: our own PR, review is the ONLY blocker, policy refuses plain merge) → merge with `--admin`, not a STOP. Otherwise **STOP: "blocked on human approval"** — never self-approve (`--admin` does NOT fake an approval) |
   | `botReview` (a required bot hasn't approved; `botApproval.pending` names which) | The bot's latest review isn't `APPROVED`. If it has open threads, invoke `/prm --once` (resolve them + push) and re-check — the bot re-reviews on the new push. Still pending → **STOP: "blocked on bot review (`<bot>` pending)"** — never self-approve, dismiss, or `--admin` past a required bot. |
   | `conflict` | `gh pr update-branch <pr>` (merge base in), re-check. Still conflicting → **STOP: "conflicts need manual resolution"** |
   | `draft` | `gh pr ready <pr>`, re-check |

   If a STOP fires, print the blocker + PR URL and stop. If the loop hits 6 iterations still not all-green, STOP and report what's still red.
4. **Merge (gates all green):** `gh pr merge <pr> --merge --delete-branch` (append `--admin` only if the user passed it, or via the solo-owner carve-out below). → merge commit + remote branch deleted.
5. **Teardown — `AFTER_MERGE_CMD` hook OR generic. Two non-negotiables: (a) run EVERY git op from the main clone via `git -C <mainClone>`; (b) MOVE the session shell out of the worktree FIRST.**
   - **Stop this PR's watcher FIRST (before anything else in teardown):** if this session has a `Monitor` running `pr-events.ts <pr>` (started by `/prm` — it recorded the task id when arming it), `TaskStop` that task id NOW. The watcher's self-exit on merged is a safety net for merges that happen OUTSIDE the session; it lags a full poll cycle (60s+ plus backoff), so an in-session merge must never rely on it. No config knob — this is unconditional. If the task id wasn't recorded, find it in the task list by its `pr-events.ts <pr>` command line; "already exited" is a fine outcome, a still-running watcher after merge is not.
   - **Leave the worktree before removing it (cwd guard):** if `isWorktree`, run **`cd <mainClone>` as its own command BEFORE any removal step** (both the hook and the generic path below). If the session shell's cwd is still inside `<worktree>` when that directory is deleted, the *next* command risks `posix_spawn '/bin/sh' ENOENT` / "Working directory … was deleted" — though current harness builds re-pin the shell to the primary working directory instead (verified 2026-08-18; see the LAUNCHED-inside case below, which relies on it). `git -C <mainClone>` alone does NOT move the shell — it sets git's working dir, not the shell's cwd.
   - **Self-occupant triage — when THIS session sits in the worktree it is tearing down** (the cwd-holders mapped below are our own `claude` binary, its MCP servers and shells, and nothing else — no dev servers, no other sessions). Which of two cases decides everything (verified live, vitrinka PR #278, 2026-08-14):
     - **Session ENTERED the worktree via the `EnterWorktree` tool** → after the dev-server kill + scoped Docker teardown below, call **`ExitWorktree(action: "remove")`** INSTEAD of `cd <mainClone>` + `worktree remove` + `branch -d` — it re-anchors the session's PWD to the original directory and deletes worktree + branch natively. The clean gate already passed, so `discard_changes` must not be needed; if the tool refuses and lists changes, STOP and report — never pass `discard_changes: true` on your own initiative.
     - **Session was LAUNCHED inside the worktree** (no `EnterWorktree` this session) → run the removal as **ONE one-shot Bash call prefixed with `cd <mainClone> &&`** and let the harness re-pin catch the session (verified live 2026-08-18):
       ```bash
       cd <mainClone> && git worktree remove <worktree> && git branch -d <branch>
       ```
       (`git worktree unlock <worktree> &&` first if it's locked.) The cleanup runs FROM the main clone, so it is not itself a cwd-holder in the directory it deletes; macOS removes the directory fine even though this session's own processes still hold it as their OS-level cwd. When the next Bash call finds the anchored directory gone, the harness **falls back to the primary working directory** (`Shell cwd was reset to <mainClone>`) — the session continues healthy, no `posix_spawn '/bin/sh' ENOENT`. The `cd … &&` prefix must be ON the removal command itself: a `cd` in an earlier Bash call does not persist (the re-pin undoes it between calls).
       **Fallback — the worktree hop** (only if the harness demonstrably does NOT re-pin — the next command after removal dies/lands back in the deleted dir; observed on some harness builds, vitrinka 2026-08-15): `EnterWorktree(name: "teardown-hop")` to re-anchor the PWD into a fresh temp worktree → BARE `git worktree remove <worktree>` + `git branch -d <branch>` from the hop (NOT `git -C <mainClone>` — while entered, an isolation guard refuses main-clone git redirects, so main-clone ops like the final pull must wait until after the exit) → `ExitWorktree(action: "remove")`, which with the original directory gone keeps the hop and parks the session there. Costs, so prefer the one-shot path: the leftover hop lives under `.claude/worktrees/` (EnterWorktree's hardcoded home — NOT the project `.worktrees/` convention) on a `worktree-teardown-hop` branch that a later session must sweep, and the guard blocks step 6's pull until exited.
       If both are unavailable, fall back to KEEP: do everything else (remote branch delete, `fetch --prune`, pull the main clone) and END the summary with the deferred one-liner `git worktree remove <worktree> && git branch -d <branch>` for a later session.
     - Holders belonging to **another** session → the existing rule below: report `pid + command`, skip removal, never kill them.
   - **If `resolvedAfterMergeCmd` is non-null** (the project registered `AFTER_MERGE_CMD` in `<mainClone>/.claude/.claude.git.config`): run it **INSTEAD** of the generic steps below — it owns the richer teardown (worktree + Docker volumes + persona sims + branch + remote), e.g. FixIt's `/wk:cleanup <slug> --remove --yes --delete-remote`. The `{slug}`/`{branch}`/`{worktree}`/`{pr}` tokens are already substituted by `merge-precheck.ts` (`resolvedAfterMergeCmd` is ready to run). Run it AFTER the `cd <mainClone>` above (the hook removes the worktree too); do NOT also run the generic worktree-remove/branch-delete.
   - **Else (generic auto-cleanup — worktree + branch + dev clients + scoped Docker, no prompt):**
     - **Map this worktree's resources FIRST, while `<worktree>` still exists:**
       - dev servers — PIDs whose cwd is inside the worktree: `lsof -a -d cwd +D <worktree> -t 2>/dev/null`, **then MANDATORY intersection** with dev-server command lines (`ps -o command= -p <pid>` matching `next dev|expo|metro|nx|nest|vite|webpack|tsx watch|ng serve|bun run .*dev`, or an orphaned `node` dev process). The lsof list ALONE is a trap: a worktree's cwd-holders routinely include **other live Claude Code sessions** — `claude` binaries, `tmux`, MCP servers (`@playwright/mcp`, `chrome-devtools-mcp`, `*mcp*`), shells. A blanket TERM of all holders has killed sibling agent sessions mid-flight (FixIt, 2026-07-06). **NEVER kill:** `claude`, `tmux`, any `*mcp*` process, `zsh|bash|sh`, editors, `$SELF`/its subtree — regardless of cwd.
       - Docker — compose projects whose `working_dir` label is inside `<worktree>`: `docker ps -a --filter label=com.docker.compose.project --format '{{.Label "com.docker.compose.project"}}\t{{.Label "com.docker.compose.project.working_dir"}}'` → keep rows whose working_dir is under `<worktree>`. Record the project names (skip if `docker` absent / daemon down).
     - **Kill this worktree's dev servers** — `kill -TERM` the FILTERED PIDs only, `sleep 3`, `kill -KILL` stragglers (re-filtered). Scoped to `<worktree>` only; NEVER machine-wide, NEVER `$SELF`/its subtree. If NON-dev processes (another session's `claude`/`tmux`/MCP) still hold the cwd afterwards, **do not kill them — report `pid + command` and skip `worktree remove`** (it would fail on the live cwd anyway); the user closes those sessions.
     - if `isWorktree`: `git -C <mainClone> worktree remove <worktree>` — clean (the gate guaranteed it); do NOT `--force`. (You already `cd <mainClone>`'d, so the shell isn't standing in the dir being removed.) **Removal is SLOW on bootstrapped worktrees** (deleting `node_modules` can take minutes) — run it with a generous timeout / in the background; a 30–60s timeout is NOT failure. If a previous attempt was interrupted mid-delete and git now refuses, `--force` is acceptable ONLY because the porcelain-clean gate already passed before the first attempt.
     - `git -C <mainClone> branch -d <branch>` if it still exists (it's merged; ignore "not found" — `gh` may have already deleted it).
     - **Scoped Docker teardown** (the worktree is now gone — this satisfies the carve-out's "worktree gone" precondition). For each mapped compose project `P`:
       - `P` starts with **`wt-`** → `docker compose -p "$P" down -v --remove-orphans` (full teardown incl. volumes). **Re-verify the `wt-` prefix on `P` AND on each volume's `com.docker.compose.project` label immediately before removal — REFUSE any volume whose project label is not `wt-*`.**
       - otherwise → `docker compose -p "$P" down` (containers/networks only; **NO `-v`** — volumes preserved).
       - Only projects mapped to THIS worktree (above). **NEVER a machine-wide `wt-*` sweep** — that stays the interactive `/me:cleanup:processes`.
   - `git -C <mainClone> fetch --prune` (always, after either path).
6. **Pull (main clone) — never switch it.** The main clone is ALWAYS on the default branch; that is the standing arrangement, not something to verify-then-correct. So: if `git -C <mainClone> status --porcelain` is empty → `git -C <mainClone> pull --ff-only`. If it is dirty → SKIP and warn (don't disturb its WIP).

   **Never `git switch`/`checkout` the main clone**, not even to "put it back" — it is the user's seat (uncommitted work, running dev servers bound to the branch, IDE state), `guard-destructive.sh` hard-blocks it, and FixIt's `CLAUDE.md` makes it a LAW. If the main clone is somehow NOT on the default branch, that is a signal something else is going on: **report it and skip the pull**, never correct it yourself.
7. **Summary + land home (`output.md`):** print full clickable URLs (the merged PR, the base branch). Because your shell may be sitting in the now-removed worktree, END the summary with an explicit line:

   ```
   cd <mainClone>
   ```

## `.claude/.claude.git.config` — `AFTER_MERGE_CMD` (per-project teardown hook)

A project may delegate post-merge teardown to its own capability-aware command instead of
the generic worktree-remove. Add to `<repo>/.claude/.claude.git.config` (same `KEY=value`
format `/sync` already reads):

```
# Runs INSTEAD of git:merge's generic `worktree remove + branch -d` after a successful merge.
# Tokens substituted by merge-precheck.ts: {slug} (worktree basename) {branch} {worktree} {pr}
AFTER_MERGE_CMD=/wk:cleanup {slug} --remove --yes --delete-remote
```

When set, `resolvedAfterMergeCmd` in the pre-check envelope is the ready-to-run command;
step 5 runs it and skips the generic teardown. When unset, generic teardown applies. The
hook owns whatever only the project knows (Docker `down -v`, persona sims) — `git:` stays
project-agnostic.

### `BEFORE_REVIEW_CMD` — the symmetric pre-review hook

The same config file may register the *opening* half of the lifecycle:

```
# Runs when /prc and /prm ENTER the review loop, and again at the start of each round.
# Same token substitution. Must be idempotent and cheap — it re-runs every round.
BEFORE_REVIEW_CMD=/wk:pause {slug}
```

Entering a review loop invalidates whatever the checkout has RUNNING: the loop's own
merges, installs and codegen thrash the disk while dev servers, bundlers and emulators do
work that is already stale (and clients like Expo's dev client must be restarted
afterwards regardless). The hook stops those *processes*; it deliberately leaves project
services (databases, containers) warm so a mid-loop verification restart stays cheap.

Resolved by `bin/before-review.ts` (git-only — no `gh` call, no PR required, so `/prc` can
run it before the PR exists) and also emitted as `resolvedBeforeReviewCmd` by
`merge-precheck.ts`. Rationale + per-round contract: `_shared/round.md` §0.5 Quiesce.

### `REQUIRED_BOT_REVIEWERS` — required bot approvers (per-project, optional)

**GitHub-App bots (`review-bot`, …) are auto-detected** — `merge-precheck.ts`
identifies them by GraphQL `__typename == "Bot"` (NOT the `[bot]` login suffix, which GraphQL
strips) and requires them whenever they're on the PR. So **most repos need no config at all**.
Use this key only to require a **machine-user bot** (an ordinary account / PAT used as a bot —
`__typename == "User"`, no `[bot]` suffix) that can't be auto-detected:

```
# Comma/space separated. Absent → defaults to review-bot[bot]. The [bot] suffix is
# optional (matched either way). A listed bot only gates when it is actually on the PR.
REQUIRED_BOT_REVIEWERS=review-bot[bot], my-ci-machine-user
```

How `merge-precheck.ts` evaluates the `botReview` gate (`botApproval = {ok, required[], pending[]}`):
- **Required set** = this config list ∪ any **auto-detected GitHub-App bot** (`__typename == "Bot"`, login canonicalized to the `[bot]` form) that is a requested reviewer or has reviewed. Machine-user bots aren't auto-detectable — list them above.
- **Every required bot** is approved only when its **latest review is `APPROVED`**.
- A required bot **not present on the PR does not block** — vacuously satisfied when no required bot is a reviewer (the "if it is in the reviewers" rule).

## Solo-owner carve-out — unsatisfiable review gate

Some orgs (known: `acme-org`, since 2026-08-14) enforce a ruleset pair on main: PRs mandatory for everyone (no bypass), plus an "outside changes need owner approval" review requirement (1 approval + CODEOWNERS `* @<org-owner>`) that the user alone bypasses as org owner. On the user's OWN PRs that review gate is **structurally unsatisfiable** — GitHub forbids self-approval, and bot approvals (eve-bot, CodeRabbit) never count toward a code-owner review. Waiting on it is pointless by construction, so it is NOT a "blocked on human approval" STOP.

The carve-out — when **all** of:
1. PR author == the authenticated `gh` user (`gh api user` vs `gh pr view --json author`), and
2. the ONLY failing gate is `review` (`REVIEW_REQUIRED`): CI green, no conflicts, required bots approved, audit PASS where one applies, and
3. a plain merge is refused by branch policy ("base branch policy prohibits the merge"),

then merge with `gh pr merge <pr> --merge --delete-branch --admin` — this is the **normal completion**, not an escalation: the server enforces the ruleset bypass identity; nothing is faked, no approval is dismissed. Verified live 2026-08-14. The carve-out never extends to PRs authored by anyone else (humans OR bots/eve), a pending required-bot review, a BLOCK/stale audit, or red CI — those STOPs still STOP.

## Hard rules / safety

- **Never** merge from the default branch; **never** `--admin` unless the user passed it **or the solo-owner carve-out applies**; **never** self-approve.
- **Bot-review gate (`botReview`) STOPs like human approval.** Never self-approve, dismiss, or `--admin` past a required bot whose review is pending. It clears only when the bot itself leaves an `APPROVED` review — resolving its threads and pushing (`/prm --once`) is what earns that, not a substitute for it.
- **Never** `--force` a worktree removal, and **never** switch/pull a dirty main clone — report instead.
- Run all teardown git ops via `git -C <mainClone>`, and **`cd <mainClone>` BEFORE removing the worktree** — never `cd` into or operate from (or leave the shell standing in) the worktree being removed.
- **Auto-cleanup is surgically scoped.** Dev-server kills hit only PIDs whose cwd is inside the removed `<worktree>` (never `$SELF`/its subtree, never machine-wide). The auto `docker compose down -v` (volume destruction) is permitted ONLY for a `wt-*` project mapped to THAT worktree, with the `wt-` prefix re-verified on the project AND each volume immediately before deletion — every non-`wt-*` stack keeps the full global "never `down -v`" prohibition. A machine-wide sweep is never auto; it stays the interactive `/me:cleanup:processes`.
- Gates that need a human (approval, unresolvable conflict, repeated CI failure) **STOP** with a clear, link-bearing report — autonomous ≠ overriding protections.
- Subagents spawned by the driven skills run on Opus.
- Summaries use full clickable links (`output.md`) — never bare `#N`.
