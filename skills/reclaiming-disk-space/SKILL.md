---
name: reclaiming-disk-space
description: "Use when a Mac is low on disk or macOS 'System Data' is huge: find safely-reclaimable space in tool caches, build artifacts, Xcode DerivedData/simulators, app-sandbox temp, abandoned screen recordings, app logs, and orphaned Docker/OrbStack images, build cache, and volumes left behind by deleted git worktrees."
---

# Reclaiming Disk Space

## Overview

Find and clear reclaimable space on a dev Mac without destroying anything live. The
dangerous part is Docker: a deleted git worktree leaves behind its compose stack,
images, and **named DB volumes** — and the blunt cleanup commands also delete the
volumes of worktrees you still use. **Core principle: a volume's owner is a
compose project NAME, not a path — prove the name is dead before deleting by
name; never blanket-prune.**

The other half is finding it at all. A named-bucket list reports only what it names,
so the biggest offenders on a real Mac — an abandoned 80G screen recording, 20G+ of
app-sandbox temp media, 100G+ of crashed-tool temp — stay invisible however often you
run it. **Second principle: every scan mode ranks every root by SIZE before it consults
any allowlist — home (dotdirs included), `~/Library`, `~/Work`, the per-user temp root
`/private/var/folders/<id>/{T,C,X}` (`getconf DARWIN_USER_TEMP_DIR`), the shared temp
roots `/private/tmp` + `/private/var/tmp`, and every other top-level tree of
`/System/Volumes/Data`. The pass is complete only when the ranked total reaches the Data
volume's used space (`df -k /System/Volumes/Data`). Big and unclassified means user data
until proven otherwise — report it, never script it.**

Agent sessions are the fastest-growing owner: run scratch in `/private/tmp`, raw perf and
verification evidence parked untracked in `~/Exports`, per-worktree simulators, and the
Claude/Codex transcripts themselves. No cache ladder owns any of it, so every audit sizes
and ages it, and the user picks what goes.

**Third principle: a warm cache is not garbage.** Media caches (Messages previews,
app-sandbox temp) are offered only as the slice older than `KEEP_DAYS` (default 60),
with the retained size printed next to it — the recent slice is what keeps the app
fast and costs an iCloud re-fetch to rebuild.

## Modes

| Mode | Invocation | What it does |
|---|---|---|
| **fast** | `reclaim` (the tools repo applet; `--until 100G`, `--tier N`, `--dry-run`, `--list`) | EMERGENCY. No scan, no prompt: a fixed ladder of regenerating caches deleted biggest-first, steps in a tier run concurrently, df printed after every step so wins land while slow steps (Docker prune) still run; `--until` stops as soon as enough is free. Tier 1 build/package caches (go-build, Docker build cache + images, bun tarballs + manifests but never `~/.bun/install/cache/links`, npm, DerivedData, gradle…) · 2 tool/app caches + crashed-tool temp (`tmp-instruments`, `tmp-browser-clones`, `tmp-bun`) · 3 aggressive-but-reversible (DeviceSupport, device-less sim runtimes, aged Messages/sandbox tmp, Trash). Never volumes, containers, recordings. Ends with by-hand notes. Spec: `toolbox` `docs/reclaim.md`. |
| **default** | `bash audit.sh` | The audit + confirm-then-delete workflow below. Adds a generic `>1G` giant-file sweep of `~/Library` + the per-user temp root (finds by size, not by name), screen-recording staging, app-sandbox temp over 1G, the Messages preview cache, and the top log dirs. A **session-residue** report: shared-temp scratch (idle = hours since its newest file changed, `IN USE` when a process holds a file inside), `~/Exports` untracked bytes by run and file type, `~/Backups`, Claude/Codex history against `cleanupPeriodDays`. Also reports device-less iOS runtimes (often 8GB each), sims not booted in `STALE_DAYS`+, and per-sim diagnostics-log stores (~2GB/sim, deletable keeping apps + data). |
| **deep** | `bash audit.sh deep` | Default audit PLUS a **full-disk pass** ranking every top-level tree of every root in the second principle (anything big with no row in the sections above is UNCLASSIFIED — drill in by hand); stale checkouts (every repo and worktree under `~/Work/Projects` per `git worktree list`; no git activity for 7+ days — reports node_modules/.next/.turbo/dist/Pods/vendor/target sizes) and wt-* worktree volume classification (PR merged + idle + clean → reclaimable; merged but recent or dirty → MERGED-ACTIVE; 7+ days idle unmerged → REVIEW-STALE; no worktree claims it → GONE unless a live or unresolved compose name may own it → REVIEW). Thresholds: `STALE_DAYS`, `KEEP_DAYS` env. May take minutes. |

When invoked with an argument (`/reclaiming-disk-space fast|deep`), run that mode.
In fast mode, run `reclaim` (`~/.local/bin/reclaim` links the Homebrew `toolbox` cask: a ladder step missing from `reclaim --list` ships with the next the tools repo release, `brew upgrade --cask toolbox`) and report its AFTER line plus the NOT DELETED block — that is the whole flow, streamed per "Stream every mode" below. Fast mode sizes nothing outside its ladder: "what else / what is big" is deep. Its `--dry-run` doubles as a sizing pass when the disk is not yet critical.

Deep-mode staleness is a DOUBLE signal (last commit AND last working-tree change);
`gh pr list --state merged --head <branch>` is the merge proof because squash-merged
branches never show merged in local `git branch --merged`.

## Stream every mode — a silent wait is a bug in how you launched it

**Every mode here runs for minutes and prints progressively; none of them should be
launched in a way that hides that.** `reclaim` emits one line per finished step
(`[tier] title  size  seconds  free <df>`), `audit.sh` emits one section at a time —
but a foreground Bash call shows nothing until the process exits, and piping through
`tail`/`head`/`$(…)` buffers it even then. The user sits watching a blank terminal
while a Docker prune or a `find ~/Library` sweep grinds. Never do that to them.

Launch detached into a private log, arm a filter, relay lines as they land. Mint the
log first (`mktemp -t reclaim` prints a unique path only you can write: parallel
sessions never share or clobber one), then put that LITERAL path in both calls, since
shell state does not survive between tool calls:

```bash
mktemp -t reclaim                                 # → e.g. /var/folders/…/T/reclaim.Xa1b
reclaim > <log> 2>&1                              # run_in_background: true
/opt/homebrew/bin/bash audit.sh deep > <log> 2>&1 # same, per mode
```

Then watch it with the native `Monitor` tool (`persistent: false`, each stdout line
becomes a notification) — NOT a polling loop — and delete the log once the run is
summarized:

| Mode | Monitor command |
|---|---|
| fast | `tail -f <log> \| grep -E --line-buffered '^\[\|AFTER\|FAILED\|target \|NOT DELETED'` |
| default / deep | `tail -f <log> \| grep -E --line-buffered 'DISK\|OFFENDERS\|CACHES\|GIANT\|STAGING\|DOCKER\|SIM \|RESIDUE\|DEEP —\|SUGGESTED\|ORPHAN\|MOVED\|REVIEW\|DB!'` |

The verdict tokens belong in the audit filter: the section headers prove it is alive,
the `ORPHAN`/`MOVED`/`REVIEW`/`DB!` lines are the payload you are waiting for.

`--line-buffered` on every `grep` stage is load-bearing; `head` cannot flush at all, so
never put one in the pipeline. Relay a one-line update per tier (fast) or per section
(default/deep) — biggest wins so far plus current free — so the wait is legible instead
of blank. `reclaim --dry-run` and a `--only <step>` run are quick enough for the
foreground.

## Workflow (default + deep)

1. **Audit (read-only).** Run the bundled script — it deletes nothing, just reports.
   It needs bash 4+ (Homebrew; it exits 2 on macOS's own 3.2). Launch it detached and
   stream it per the section above (the `>1G` sweep and the deep `~/Library` pass each
   take minutes of silence otherwise):
   ```bash
   /opt/homebrew/bin/bash ~/.claude/skills/reclaiming-disk-space/audit.sh   # or: … deep · Codex: ~/.codex/skills/…
   ```
   It prints: disk free, top home offenders, largest caches, `docker system df`,
   **orphan compose stacks** (source dir gone), **orphan/review/DB volumes** with
   sizes, **stale simulators**, and a ready-to-run command block.

2. **Read the verdicts.** `ORPHAN` = source dir gone **and** no live compose file
   resolves to that project name → safe. `MOVED` = source dir gone but the name is
   still live (the repo moved) — the volumes get reattached on the next `up`, so
   **never delete**. `REVIEW` = dangling (no container) but origin unconfirmed →
   eyeball it. `DB!…` = a database volume → confirm you don't want that data first.

3. **Delete, safest first** (see Quick Reference). Caches & build cache & DerivedData
   are zero-risk. Orphan volumes go **by name** after their stack's containers are
   removed. If `rm` is blocked by the permission sandbox, hand the exact commands to
   the user to run (`! <cmd>` in-session, or their terminal).

4. **Re-check when idle.** `df` reads low while sims/Metro/builds write; OrbStack &
   Docker Desktop keep data in a sparse image that **auto-reclaims a minute after a
   prune** — host free space lags the logical reclaim. Don't conclude "it didn't work."

5. **End with a summary table.** Every reclamation session (any mode) closes with:
   the headline `X Gi → Y Gi free = ~Z Gi reclaimed`, then a table grouped by type,
   ordered by size:

   | Type | What / where | Freed |
   |---|---|---|

   Rules: record `df` at the START and after each group — the df deltas are the
   ground truth for "Freed". Where a group's physical reclaim differs from its
   logical size, show both (`~15 G physical (~50 G logical)`) and say why: any tree
   built by clonefile or hardlinks — pnpm/bun `node_modules` (into the global store;
   `pnpm store prune` collects the rest), simulator devices (clones of the runtime
   image), browser `*.code_sign_clone` copies (clones of the installed app) — frees
   only its uniquely-owned blocks, and Docker/OrbStack sparse images reclaim ~1 min
   late. **A clone/hardlink tree's physical size is unknown: offer it as "logical X,
   physical unknown" and quote only the measured `df` delta — never a `du` figure,
   nor one reasoned from version mismatch.** Types to group by: sim runtimes, simulators,
   caches, Xcode build products, Docker images/build cache, Docker volumes, stale
   project artifacts. `reclaim` prints its own BEFORE/AFTER df — that IS its summary.

## Quick Reference

| Target | Command | Risk |
|---|---|---|
| Tool caches | `rm -rf ~/Library/Caches/{ms-playwright-mcp,CocoaPods,pnpm,...}` | none (re-downloads) |
| Playwright browsers | `pwmcp prune` — **never** `rm -rf ~/Library/Caches/ms-playwright` | targeted: safe. Blind wipe: 150MB-1GB re-download per session, serialized on a silent `__dirlock` |
| Abandoned screen recording | `open ~/Library/"Group Containers"/group.com.apple.screencapture/ScreenRecordings` — play, then trash by hand | user data — never scripted |
| Media caches (Messages previews, sandbox tmp) | quit the app, then `find <dir> -type f -mtime +60 -delete` — aged slice only | none — never `Attachments/`, never the whole tree |
| App logs | `rm -rf ~/Library/Logs/{JetBrains,CreativeCloud}/*` && `rm -f ~/Library/Logs/*.log.old.*` | none |
| Homebrew | `brew cleanup -s` | none |
| Xcode build | `rm -rf ~/Library/Developer/Xcode/DerivedData/*` | none (rebuilds) |
| Sim data | `xcrun simctl delete unavailable` / `erase all` | low, frees ~0 — APFS clones of the runtime |
| Unused sim runtime | `xcrun simctl runtime delete <UUID>` (0-device runtimes from report; the report never offers Xcode's own SDK runtime) | none (re-downloads via Xcode); never a runtime its devices still name — they turn unavailable |
| Sim log spam | shutdown all, then `rm -rf .../Devices/*/data/var/db/diagnostics/*` | none (logs only; apps + data survive) |
| Crashed-tool temp (Instruments `*.ktrace` > 12 h, orphaned browser `*.code_sign_clone`, bun install extracts > 24 h) | `reclaim --only tmp-instruments,tmp-browser-clones,tmp-bun` | none: a clone a running browser may own stays; clones free far less than listed |
| Session scratch in `/private/tmp` (perf/e2e runs: traces, APKs, frame dumps) | `rm -rf /private/tmp/<name>` for the names the user picks, re-checked at delete time: newest file 24 h+ old (`find -type f` + `stat -f %m`, never the dir mtime) and no process holding a file inside (one `lsof -Fn` pass) | low: scratch, but a paused campaign may still want it |
| Raw evidence in `~/Exports` (untracked `.pftrace`, frames, recordings) · `~/Backups` | by hand, after the user confirms each run was read or each backup superseded | user data: untracked = the only copy |
| Claude / Codex transcripts | lower `cleanupPeriodDays` in `~/.claude/settings.json`; never `rm` the jsonl by hand | none |
| Stale project artifacts (deep) | `rm -rf <proj>/node_modules <proj>/.next …` by path from report | low (reinstall on next use) |
| Stale bun `.bun` entries in a live checkout | `reclaim bun-prune <checkout>` (dry run: unreachable dirs + `.old_modules-*`, sizes), then `--apply` | none: deletes only what nothing resolves to; keeps entries an `ios/Podfile.lock` names, anything under 24 h, and `links/` |
| Merged wt-* stack (deep) | `docker compose -p <proj> down` then `docker volume rm <vols>` | safe IF MERGED verdict |
| Docker cache+images | `docker builder prune -af` && `docker image prune -af` | none (re-pull/rebuild) |
| Orphan stack | `docker compose -p <proj> down` then `docker volume rm <vols>` | safe IF `ORPHAN` (never `MOVED`) |
| Stale sim | `xcrun simctl delete <udid>` | safe IF deleted worktree; an `IDLE` sim (not booted in `STALE_DAYS`+) only once the user confirms it — QA sets are kept on purpose |

## How orphans are classified (and why it's safe)

Volume names are `<compose-project>_<volume>`, so the **project name** owns the data;
the `com.docker.compose.project.working_dir` label only records where the stack was
last started. A missing working_dir proves nothing on its own — a repo that moved on
disk keeps the stale label while a live checkout still resolves to the same name and
reattaches the same volumes. `ORPHAN` needs the dead path **and** two
liveness checks to come back empty: no compose file under `~/Work/Projects` resolving
to that name (explicit `name:` key, else the lowercased dir basename), and no component
of the dead path naming a live worktree — which is what catches projects named via
`-p`/`COMPOSE_PROJECT_NAME`, invisible to a file scan. Either check hits → `MOVED`,
never deletable. Volumes
are also cross-checked against live `git worktree list` so a paused-but-live worktree's
DB is never flagged. The cross-check only knows the **current repo's** worktrees, so a
dangling volume from *another* live repo can surface as `REVIEW` — that's why `REVIEW`
means "confirm by hand", never "auto-delete" (trivial 0B ones are suppressed).

## Common Mistakes (all observed live)

| Mistake | Reality / Fix |
|---|---|
| Running any mode in the foreground, or through `\| tail` | Both hide every progress line until exit — two blank minutes on `reclaim`, more on `audit.sh deep`. The user asked for progress, not a verdict. Detach into a log + `Monitor`. |
| Auditing only the named dev-tool buckets | 82G of abandoned screen recordings and 22G of Messages sandbox temp scored **zero rows**. Rank generically by size first, classify second. |
| Summing one tree twice through an alias or mount | `GroupContainersAlias` is a symlink to `Group Containers` (100G+ double count); `~/OrbStack` is a live view into the VM whose disk image already counts under `Group Containers/*orbstack`. Enumerate with `find ~/Library -maxdepth 1 -type d`; skip `~/OrbStack`. |
| Sizing a `find` list with `xargs du -c … \| tail -1` | xargs runs du in batches; `tail` keeps one batch's subtotal (40G read as 1.2G). Sum every line: `xargs -0 du -k \| awk '{s+=$1}'`. |
| `rm -rf ~/Library/Messages/*` to clear its 22G | `Attachments/` **is** the conversation media. Only `Caches/Previews` and the sandbox tmp regenerate. |
| Quoting a media cache's TOTAL as reclaimable | Purging all of `Caches/Previews` "freed" 8.5G — but only 1.6G was older than 60d, so 7G of hot cache re-fetched from iCloud and the app got slow. Offer the **aged slice** (`-mtime +KEEP_DAYS`, default 60), and always print what stays. |
| Deleting an app's sandbox `tmp` while the app runs | Quit it first (`osascript -e 'quit app "Messages"'`), else it rewrites the files. |
| `docker volume prune` / `docker system prune -a --volumes` | Deletes **paused-but-live** worktree DBs too. Delete orphans **by name** only. |
| Hand-rolling the orphan classifier in **zsh** | Unquoted `$active` does **not** word-split in zsh → every active worktree mislabeled ORPHAN → would delete live DBs. Run the script under **bash**; never trust a zsh loop here. |
| `docker volume rm` fails "volume is in use" | A stopped container still holds it. `docker compose -p <proj> down` (or `docker rm -f <ids>`) first, then remove volumes. |
| Expecting `image prune -a` to free the full "reclaimable" | It only removes images **no container** (running *or stopped*) references. Prune stopped containers first to free more. |
| Trusting `df` right after deleting | Active writers + sparse-image lag. Re-measure idle; check OrbStack footprint at `~/Library/Group Containers/*orbstack*`. |
| Forcing `rm` when the sandbox denies it | Don't escalate. Print the exact command; the user runs it. |
| Deleting a `DB!` volume to save a few MB | Irreversible data loss for tiny gain. Skip unless certain. |

## Red Flags — STOP

- About to type `prune --volumes` or `prune -a --volumes` → **don't**; delete by name.
- About to `rm -rf ~/.bun/install/cache` (or anything in `links/`) → **don't**: with
  `globalStore` every checkout's `node_modules/.bun` symlinks into `links/`, so one
  wipe dangles them all and the repair is a `bun install` per checkout. Use
  `reclaim --only bun` (keeps `links/`) or `reclaim bun-prune <checkout>`.
- Classifying orphans in a shell loop without bash word-splitting → re-run the script.
- Concluding "freeing space didn't work" within a minute of a Docker prune → wait & re-check.
- `ORPHAN` on a plain repo-shaped name (`fixit-services`, `acmeback`) → confirm no
  live compose file resolves to it; `MOVED` exists for exactly this case.
- Sizing an option from `du` on simulators or node_modules → measure with `df` first.
- A script about to `rm` a `.mov` under `ScreenRecordings/` → that's an unsaved capture;
  the user plays it and trashes it by hand, always.
- Offering a media cache's full size after seeing only `du` → split it by `KEEP_DAYS` first.
- Reporting "nothing left to reclaim" from allowlist sections or a fast run → run the
  full-disk pass (deep) before saying the disk is clean.
