# merge — gates, the merge itself, teardown

prm's merge terminus engine. Fully autonomous — the pre-check gates ARE the safety.
Drive the gates green, merge (merge commit), tear down the worktree + branch, pull the
main clone (never switch it).

## Pre-check

`node ~/.claude/lib/git/bin/merge-precheck.ts <PR?> --repo <ABS path of the CHECKOUT you are merging FROM>`
(LITERAL absolute path — never `$(git rev-parse --show-toplevel)`). **When the feature
lives in a worktree, that is the WORKTREE path (`…/.worktrees/<name>`), NOT the main
clone** — anchoring at the main clone flips `isWorktree:false`/`onDefaultBranch:true`
(a wrong-reason STOP) and resolves `slug`/`resolvedAfterMergeCmd` against the main
clone, aiming the teardown hook at the primary checkout. Cross-check: envelope says
`isWorktree:false` (or `slug` equals the main clone's basename) while you know you're
in a worktree → the anchor is wrong; re-run, never act on that envelope.

→ JSON: `{owner, repo, pr, url, title, branch, defaultBranch, onDefaultBranch,
worktree, mainClone, isWorktree, slug, checks, gates, botApproval,
requiredBotReviewers, afterMergeCmd, resolvedAfterMergeCmd, raw}`.
`botApproval = {ok, required[], pending[]}`; `gates.botApprovalOk` mirrors it as the
`botReview` gate.

Hard guards — STOP immediately:
- `onDefaultBranch` → "On the default branch — nothing to merge here." Never tell the
  user to switch this checkout to a feature branch.
- `raw.state !== "OPEN"` → already merged/closed.

## Drive to green (bounded loop, max 6 iterations)

While `gates.allPass === false`, act per failed gate, then re-run merge-precheck:

| failed gate | action |
|---|---|
| `clean` (dirty worktree) | commit the whole tree per `~/.claude/skills/push-all/SKILL.md` commit doctrine, then `git push` |
| `ci` / `ci-absent` | the CI fix loop below |
| `review` + `CHANGES_REQUESTED` | a round (resolve comments + push). Still not `APPROVED` → **STOP: "blocked on human approval"** |
| `review` + `REVIEW_REQUIRED` | solo-owner carve-out applies (below) → `--admin` merge, not a STOP. Otherwise **STOP: "blocked on human approval"** — never self-approve (`--admin` does NOT fake an approval) |
| `botReview` (`botApproval.pending` names which) | bot has open threads → a round (resolve + push); the bot re-reviews on the push. Still pending → **STOP: "blocked on bot review (`<bot>` pending)"** — never self-approve, dismiss, or `--admin` past a required bot |
| `conflict` | `gh pr update-branch <pr>`, re-check. Still conflicting → **STOP: "conflicts need manual resolution"** |
| `draft` | `gh pr ready <pr>`, re-check |

A STOP prints the blocker + PR URL and stops. 6 iterations still red → STOP and report.

### CI fix loop

1. `node ~/.claude/lib/git/bin/github-io.ts find-run --sha <headSha>` → the run;
   none yet → wait for the watcher's next `ci` event.
2. `github-io.ts watch-run --runId <id>` (blocks; `--exit-status`). Green → done.
3. Red → `github-io.ts failed-logs --runId <id>`; diagnose the ROOT cause from the
   logs — never pattern-match the first error line, never push a speculative fix.
4. Fix (failing test first when the failure is a test), run local checks, push, re-watch.
5. Caps: 3 fix attempts on the same failing job → STOP with the run URL. Infra/flaky
   failure (timeout, runner error, network) → `github-io.ts rerun-failed --runId <id>`
   once; still red → STOP.

## Merge

`gh pr merge <pr> --merge --delete-branch` — append `--admin` only when the user passed
it or the carve-out applies. Merge commit; remote branch deleted.

## Solo-owner carve-out — unsatisfiable review gate

Some orgs (known: `acme-org`) enforce PRs-for-everyone plus an
owner-approval review requirement the user alone bypasses as org owner. On the user's
OWN PRs that gate is structurally unsatisfiable — GitHub forbids self-approval, and
bot approvals never count toward a code-owner review — so it is NOT a
"blocked on human approval" STOP. When ALL of:

1. PR author == the authenticated `gh` user (`gh api user` vs `gh pr view --json author`), and
2. the ONLY failing gate is `review` (`REVIEW_REQUIRED`): CI green, no conflicts,
   required bots approved, audit PASS where one applies, and
3. a plain merge is refused by branch policy ("base branch policy prohibits the merge"),

merge with `--admin` — the normal completion, not an escalation: the server enforces
the ruleset bypass identity; nothing is faked. Never for PRs authored by anyone else
(human OR bot), a pending required-bot review, a BLOCK/stale audit, or red CI.

## Teardown

Two non-negotiables: (a) every git op runs from the main clone via `git -C <mainClone>`;
(b) MOVE the session shell out of the worktree FIRST.

0. **Stop this PR's watcher FIRST**: `TaskStop` the recorded Monitor task id NOW —
   its self-exit on merged lags a full poll cycle and only covers merges that happen
   outside the session. Id not recorded → find it in the task list by its
   `pr-events.ts <pr>` command line; "already exited" is fine, a still-running watcher
   after merge is not.
1. **Leave the worktree before removing it**: if `isWorktree`, `cd <mainClone>` as its
   own command BEFORE any removal. `git -C <mainClone>` alone does NOT move the shell.
2. **Self-occupant triage** — this session sits in the worktree it is tearing down
   (the cwd-holders are our own `claude`, its MCP servers and shells, nothing else):
   - **Entered via `EnterWorktree`** → after the dev-server kill + scoped Docker
     teardown, call `ExitWorktree(action: "remove")` INSTEAD of `cd` + `worktree
     remove` + `branch -d`. The clean gate already passed, so `discard_changes` must
     not be needed; if the tool refuses and lists changes, STOP and report — never
     pass `discard_changes: true` on your own initiative.
   - **Launched inside the worktree** (no `EnterWorktree` this session) → ONE one-shot
     Bash call:
     ```bash
     cd <mainClone> && git worktree remove <worktree> && git branch -d <branch>
     ```
     (`git worktree unlock <worktree> &&` first if locked.) The harness re-pins the
     shell to the primary working directory when it finds the anchored dir gone. The
     `cd … &&` prefix must be ON the removal command itself — a `cd` in an earlier
     call does not persist. If the harness demonstrably does NOT re-pin (next command
     dies in the deleted dir): `EnterWorktree(name: "teardown-hop")` → BARE
     `git worktree remove <worktree>` + `git branch -d <branch>` from the hop (not
     `git -C <mainClone>` — an isolation guard refuses main-clone redirects while
     entered; main-clone ops wait until after the exit) → `ExitWorktree(action:
     "remove")`, which parks the session in the hop; a later session sweeps the
     leftover hop under `.claude/worktrees/`. Both unavailable → KEEP: do everything
     else and END the summary with the deferred one-liner
     `git worktree remove <worktree> && git branch -d <branch>`.
   - Holders belonging to **another** session → report `pid + command`, skip removal,
     never kill them.
3. **`resolvedAfterMergeCmd` non-null** → run IT (after the `cd <mainClone>`) and skip
   the generic teardown — the hook owns the richer cleanup (worktree, Docker volumes,
   persona sims, branch, remote); tokens are already substituted.
4. **Else, generic auto-cleanup** — map this worktree's resources FIRST, while
   `<worktree>` still exists:
   - dev servers: `lsof -a -d cwd +D <worktree> -t 2>/dev/null`, then MANDATORY
     intersection with dev-server command lines (`ps -o command= -p <pid>` matching
     `next dev|expo|metro|nx|nest|vite|webpack|tsx watch|ng serve|bun run .*dev`, or
     an orphaned `node` dev process). The lsof list ALONE is a trap — it routinely
     includes other live Claude sessions. **NEVER kill:** `claude`, `tmux`, any
     `*mcp*`, `zsh|bash|sh`, editors, `$SELF`/its subtree — regardless of cwd.
   - Docker: compose projects whose `working_dir` label is inside `<worktree>`:
     `docker ps -a --filter label=com.docker.compose.project --format '{{.Label "com.docker.compose.project"}}\t{{.Label "com.docker.compose.project.working_dir"}}'`.
   Then: `kill -TERM` the FILTERED PIDs only, `sleep 3`, `kill -KILL` stragglers
   (re-filtered) — scoped to `<worktree>`, never machine-wide. Non-dev holders remain
   → report `pid + command`, skip `worktree remove`.
   Then `git -C <mainClone> worktree remove <worktree>` (clean by gate; no `--force` —
   acceptable ONLY after an interrupted previous attempt, because the clean gate had
   passed). Removal is SLOW on bootstrapped worktrees (`node_modules`) — generous
   timeout; 30–60s is NOT failure. Then `git -C <mainClone> branch -d <branch>`
   (ignore "not found"). Then scoped Docker teardown per mapped project `P`:
   - `P` starts with `wt-` → `docker compose -p "$P" down -v --remove-orphans` —
     re-verify the `wt-` prefix on `P` AND on each volume's
     `com.docker.compose.project` label immediately before removal; REFUSE any volume
     whose label is not `wt-*`.
   - otherwise → `docker compose -p "$P" down` (NO `-v` — volumes preserved).
   Never a machine-wide `wt-*` sweep — that stays the interactive `/me:cleanup:processes`.
5. `git -C <mainClone> fetch --prune` (always, after either path).
6. **Pull the main clone — never switch it.** It is ALWAYS on the default branch (the
   standing arrangement, not something to verify-then-correct): `status --porcelain`
   empty → `git -C <mainClone> pull --ff-only`; dirty → SKIP and warn. Not on the
   default branch → report and skip the pull, never correct it. Never `git switch`/
   `checkout` the main clone — it is the user's seat and the guard hard-blocks it.
7. **Summary** (`output.md`): full clickable URLs (merged PR, base branch). The shell
   may sit in the removed worktree — END with an explicit `cd <mainClone>` line.

## `.claude/.claude.git.config` keys

Same `KEY=value` file `/sync` reads, in `<repo>/.claude/`:

```
# Runs INSTEAD of the generic worktree-remove + branch -d after a successful merge.
# Tokens substituted by merge-precheck.ts: {slug} {branch} {worktree} {pr}
AFTER_MERGE_CMD=/wk:cleanup {slug} --remove --yes --delete-remote

# Runs when prm ENTERS the review loop, and again at the start of each round.
# Same tokens. Must be idempotent and cheap. Stops processes we own (dev servers,
# bundlers, emulators) — never databases/containers, which stay warm.
BEFORE_REVIEW_CMD=/wk:pause {slug}

# Only for machine-user bots (ordinary account/PAT, __typename == "User") that can't
# be auto-detected. GitHub-App bots (__typename == "Bot") are auto-detected and
# required whenever on the PR — most repos need no config. [bot] suffix optional.
# Absent → defaults to review-bot[bot]. A listed bot only gates when actually
# on the PR (vacuously satisfied otherwise).
REQUIRED_BOT_REVIEWERS=review-bot[bot], my-ci-machine-user
```

`BEFORE_REVIEW_CMD` is resolved by `lib/git/bin/before-review.ts` (git-only — no `gh`
call, no PR required, so the create path can quiesce before the PR exists) and also
emitted as `resolvedBeforeReviewCmd` by `merge-precheck.ts`. Per-round contract:
`round.md` §0.5. A required bot is approved only when its LATEST review is `APPROVED`.

## Hard rules

- Never merge from the default branch; never `--admin` unless the user passed it or
  the carve-out applies; never self-approve, dismiss, or `--admin` past a pending
  required bot.
- Never `--force` a worktree removal; never switch or pull a dirty main clone.
- Dev-server kills and `down -v` stay surgically scoped as specified above.
- Gates needing a human (approval, unresolvable conflict, repeated CI failure) STOP
  with a link-bearing report — autonomous ≠ overriding protections.
