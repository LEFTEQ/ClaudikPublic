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
app-sandbox temp media — stay invisible however often you run it. **Second principle:
every mode ranks by SIZE generically before it consults any allowlist. Big and
unclassified means user data until proven otherwise — report it, never script it.**

**Third principle: a warm cache is not garbage.** Media caches (Messages previews,
app-sandbox temp) are offered only as the slice older than `KEEP_DAYS` (default 60),
with the retained size printed next to it — the recent slice is what keeps the app
fast and costs an iCloud re-fetch to rebuild.

## Modes

| Mode | Invocation | What it does |
|---|---|---|
| **fast** | `bash fast.sh` | EMERGENCY. Deletes a frozen zero-risk set immediately — tool caches, DerivedData, brew, docker builder/image prune. No scans, no prompts, seconds to run. Use when the disk is critically full (hundreds of MB free). Never touches volumes, sims, or anything needing judgment. Then **reports, without deleting**, the two fixed paths that hold the biggest non-cache junk: abandoned screen recordings and oversized app-sandbox temp. |
| **default** | `bash audit.sh` | The audit + confirm-then-delete workflow below. Adds a generic `>1G` giant-file sweep of `~/Library` (finds by size, not by name), screen-recording staging, app-sandbox temp over 1G, the Messages preview cache, and the top log dirs. Also reports device-less iOS runtimes (often 8GB each) and per-sim diagnostics-log stores (~2GB/sim, deletable keeping apps + data). |
| **deep** | `bash audit.sh deep` | Default audit PLUS a **full `~/Library` pass** ranking every top-level tree (anything big with no row in the sections above is UNCLASSIFIED — drill in by hand); stale `~/Work/Projects` projects (no git activity for 7+ days — reports node_modules/.next/.turbo/dist/Pods/vendor/target sizes) and wt-* worktree volume classification (PR merged via `gh` → reclaimable; 7+ days idle → REVIEW-STALE). Thresholds: `STALE_DAYS`, `KEEP_DAYS` env. May take minutes. |

When invoked with an argument (`/reclaiming-disk-space fast|deep`), run that mode.
In fast mode, run `fast.sh` and report the before/after plus its NOT-DELETED block —
that's the whole flow; the by-hand items there are usually the largest single wins.
Deep-mode staleness is a DOUBLE signal (last commit AND last working-tree change);
`gh pr list --state merged --head <branch>` is the merge proof because squash-merged
branches never show merged in local `git branch --merged`.

## Workflow (default + deep)

1. **Audit (read-only).** Run the bundled script — it deletes nothing, just reports:
   ```bash
   bash ~/.claude/skills/reclaiming-disk-space/audit.sh        # or: audit.sh deep
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
   logical size, show both (`~15 G physical (~50 G logical)`) and say why: pnpm/bun
   node_modules are hardlinks/APFS clones into the global store (deleting frees only
   uniquely-owned blocks — `pnpm store prune` collects the rest), simulator device
   trees are APFS clones of the shared runtime image (`du` shows ~3 G each; erasing
   frees ~nothing), and Docker/OrbStack sparse images reclaim ~1 min late. **Never
   quote a `du` figure as reclaimable space for a clone/hardlink-shared tree — confirm
   against `df` before offering it as an option.** Types to group by: sim runtimes, simulators,
   caches, Xcode build products, Docker images/build cache, Docker volumes, stale
   project artifacts. fast.sh prints its own before/after df — that IS its summary.

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
| Unused sim runtime | `xcrun simctl runtime delete <UUID>` (0-device runtimes from report) | none (re-downloads via Xcode) |
| Sim log spam | shutdown all, then `rm -rf .../Devices/*/data/var/db/diagnostics/*` | none (logs only; apps + data survive) |
| Stale project artifacts (deep) | `rm -rf <proj>/node_modules <proj>/.next …` by path from report | low (reinstall on next use) |
| Merged wt-* stack (deep) | `docker compose -p <proj> down` then `docker volume rm <vols>` | safe IF MERGED verdict |
| Docker cache+images | `docker builder prune -af` && `docker image prune -af` | none (re-pull/rebuild) |
| Orphan stack | `docker compose -p <proj> down` then `docker volume rm <vols>` | safe IF `ORPHAN` (never `MOVED`) |
| Stale sim | `xcrun simctl delete <udid>` | safe IF deleted worktree |

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
| Auditing only the named dev-tool buckets | 82G of abandoned screen recordings and 22G of Messages sandbox temp scored **zero rows**. Rank generically by size first, classify second. |
| Summing `Group Containers` **and** `GroupContainersAlias` | The Alias is a symlink to the same tree — double-counts 100G+. Enumerate with `find ~/Library -maxdepth 1 -type d`. |
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
- Classifying orphans in a shell loop without bash word-splitting → re-run the script.
- Concluding "freeing space didn't work" within a minute of a Docker prune → wait & re-check.
- `ORPHAN` on a plain repo-shaped name (`fixit-services`, `acmeback`) → confirm no
  live compose file resolves to it; `MOVED` exists for exactly this case.
- Sizing an option from `du` on simulators or node_modules → measure with `df` first.
- A script about to `rm` a `.mov` under `ScreenRecordings/` → that's an unsaved capture;
  the user plays it and trashes it by hand, always.
- Offering a media cache's full size after seeing only `du` → split it by `KEEP_DAYS` first.
- Reporting "nothing left to reclaim" from allowlist sections alone → run the giant-file
  sweep (default) or the full `~/Library` pass (deep) before saying the disk is clean.
