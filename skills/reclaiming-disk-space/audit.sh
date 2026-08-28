#!/usr/bin/env bash
# reclaim-audit — READ-ONLY disk reclamation audit for a macOS dev machine.
#
# Prints what is safely reclaimable (tool caches, build artifacts, Xcode
# DerivedData/simulators, and ORPHANED Docker/OrbStack images, build cache,
# compose stacks, and named volumes left by deleted git worktrees) and the
# exact commands you could run.
#
# THIS SCRIPT NEVER DELETES ANYTHING. It only reads + reports.
# Run under bash (NOT zsh) — orphan classification relies on word-splitting
# that zsh does not perform on unquoted vars (see SKILL.md "zsh trap").
#
# Usage: audit.sh [deep]
#   (no arg)  default audit
#   deep      also scan ~/Work/Projects for stale projects' build artifacts
#             and classify wt-* worktree volumes as MERGED / stale via gh
# Emergency deletion is a separate script: fast.sh (the only one that deletes).
set -uo pipefail

MODE="${1:-default}"
STALE_DAYS="${STALE_DAYS:-7}"
# Recency window kept on media caches. Purging these wholesale is a false win: the
# recent slice is what makes Messages scroll fast, and it re-fetches from iCloud.
KEEP_DAYS="${KEEP_DAYS:-60}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
hr()   { printf '%s\n' "------------------------------------------------------------"; }
have() { command -v "$1" >/dev/null 2>&1; }

# Live worktree slugs (used by docker + simulator sections to tell "belongs to
# a live worktree" from "orphan"). Two sources, because the script may run from
# ANY cwd: the current repo's worktrees AND a global ~/Work/Projects scan.
# Keyed by BOTH dir basename and sanitized branch name — compose projects and
# sim names are usually branch-derived (wt-feat-x for .worktrees/x on feat/x).
# Cwd-only classification once mislabeled live-worktree sims STALE (2026-07-29).
declare -A LIVE_SLUG
while read -r p; do
  [ -n "$p" ] && LIVE_SLUG["$(basename "$p")"]=1
done < <(git worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2}')
for w in ~/Work/Projects/*/.worktrees/*/ ~/Work/Projects/*/*/.worktrees/*/; do
  [ -e "$w/.git" ] || continue
  LIVE_SLUG["$(basename "${w%/}")"]=1
  br="$(git -C "$w" branch --show-current 2>/dev/null | tr '/' '-')"
  [ -n "$br" ] && LIVE_SLUG["$br"]=1
done

# Live compose project NAMES. A project's identity is its NAME, not the path it
# was last started from: volumes are <project>_<volume>. A repo that moved on
# disk keeps the old working_dir label while a live checkout still resolves to
# the same name and WILL reattach the same volumes.
declare -A LIVE_PROJ
for d in ~/Work/Projects/*/ ~/Work/Projects/*/*/ \
         ~/Work/Projects/*/.worktrees/*/ ~/Work/Projects/*/*/.worktrees/*/; do
  [ -d "$d" ] || continue
  while IFS= read -r f; do
    n="$(sed -n 's/^name:[[:space:]]*//p' "$f" 2>/dev/null | head -1)"; n="${n%\"}"; n="${n#\"}"
    case "$n" in *':-'*) n="${n##*:-}"; n="${n%\}}" ;; esac     # ${VAR:-default}
    [ -z "$n" ] && n="$(basename "$(dirname "$f")" | tr 'A-Z' 'a-z' | tr -cd 'a-z0-9_-')"
    [ -n "$n" ] && LIVE_PROJ["$n"]=1
  done < <(find "$d" -maxdepth 3 \( -name 'docker-compose*.y*ml' -o -name 'compose*.y*ml' \) 2>/dev/null)
done

# ---------------------------------------------------------------------------
bold "DISK"
df -h /System/Volumes/Data 2>/dev/null | awk 'NR==1||/Data/{print}'
hr

# ---------------------------------------------------------------------------
bold "TOP HOME OFFENDERS (du, may take a moment)"
# Known big buckets on a dev Mac. Missing dirs are silently skipped.
du -sh \
  ~/Library/Caches \
  ~/Library/Developer/Xcode/DerivedData \
  ~/Library/Developer/CoreSimulator/Devices \
  ~/Library/Developer/Xcode/Archives \
  ~/Library/"Group Containers"/*orbstack* \
  ~/Library/"Group Containers"/*docker* \
  ~/Library/pnpm \
  ~/Library/Android \
  2>/dev/null | sort -rh
hr

bold "LARGEST CACHES (top 12)"
du -sh ~/Library/Caches/* 2>/dev/null | sort -rh | head -12
hr

# ---------------------------------------------------------------------------
# A named-bucket list can only find what it names. This pass finds the rest BY
# CONSTRUCTION — every file over 1G under ~/Library, whoever owns it. Abandoned
# screen recordings and app-sandbox temp media live here and are invisible to
# every allowlist above.
bold "GIANT FILES IN ~/Library (>1G, any owner)"
find ~/Library -type f -size +1G -print0 2>/dev/null \
  | xargs -0 du -h 2>/dev/null | sort -rh | head -20
hr

# ---------------------------------------------------------------------------
# Fixed paths holding big NON-cache junk that belongs to no dev tool: recordings
# the capture UI abandoned (never saved, never cleaned) and app sandbox temp.
# Routinely tens of GB.
bold "MEDIA & APP STAGING"
SCAP=~/Library/"Group Containers"/group.com.apple.screencapture/ScreenRecordings
if [ -d "$SCAP" ] && [ -n "$(ls -A "$SCAP" 2>/dev/null)" ]; then
  echo "screen-recording staging  $(du -sh "$SCAP" 2>/dev/null | cut -f1)  $SCAP"
  find "$SCAP" -type f -print0 2>/dev/null | xargs -0 du -h 2>/dev/null | sort -rh \
    | sed 's/^/      /'
  echo "      ^ UNSAVED recordings = user data. Play each, then trash BY HAND. Never auto-delete."
fi
# Split every media cache into "older than KEEP_DAYS" (the real offer) and the
# recent slice that must SURVIVE. The totals lie: a cache can be 8G with only
# 1.6G actually stale, so quoting the total as reclaimable buys a slow app.
aged() {  # label, path  -> "<total> total | <old> reclaimable (>${KEEP_DAYS}d) | <keep> kept"
  local label="$1" dir="$2" tot old
  [ -d "$dir" ] || return
  tot="$(du -sm "$dir" 2>/dev/null | cut -f1)"; tot="${tot:-0}"
  [ "$tot" -ge 512 ] || return
  old="$(find "$dir" -type f -mtime +"${KEEP_DAYS}" -print0 2>/dev/null \
        | xargs -0 du -cm 2>/dev/null | tail -1 | cut -f1)"; old="${old:-0}"
  printf '%-26s %5s MB total | %5s MB reclaimable (>%sd) | %5s MB KEPT\n' \
    "$label" "$tot" "$old" "$KEEP_DAYS" "$((tot - old))"
  printf '      %s\n' "$dir"
}
for t in ~/Library/Containers/*/Data/tmp; do
  aged "app sandbox tmp" "$t"
done
aged "messages preview cache" ~/Library/Messages/Caches/Previews
echo "      Delete the aged slice ONLY (find -mtime +${KEEP_DAYS} -delete), app quit first."
echo "logs (top 5):"
du -sh ~/Library/Logs/* 2>/dev/null | sort -rh | head -5 | sed 's/^/      /'
hr

# ---------------------------------------------------------------------------
if have docker && docker info >/dev/null 2>&1; then
  bold "DOCKER / ORBSTACK"
  docker system df 2>/dev/null
  echo

  # --- Map compose project -> working_dir (from ALL containers) -------------
  # A dead path whose components name a LIVE worktree slug means the repo moved,
  # not died — catches projects whose name came from -p/COMPOSE_PROJECT_NAME and
  # is therefore invisible to a compose-file scan.
  moved_by_path() {
    local d="$1" c; local IFS=/
    for c in $d; do
      [ -n "$c" ] && [ -n "${LIVE_SLUG[$c]:-}" ] && return 0
    done
    return 1
  }

  # A missing working_dir alone proves nothing — it only records where the stack
  # was last started. ORPHANED needs BOTH: working_dir gone AND no live compose
  # file resolving to that project name (LIVE_PROJ). Name alive => MOVED.
  declare -A PROJ_DIR
  while IFS=$'\t' read -r proj dir; do
    [ -n "$proj" ] || continue
    PROJ_DIR["$proj"]="$dir"
  done < <(docker ps -a --format '{{.Label "com.docker.compose.project"}}	{{.Label "com.docker.compose.project.working_dir"}}' 2>/dev/null)

  # --- Per-volume sizes (parse the `VOLUME NAME / LINKS / SIZE` table) -------
  declare -A VOL_SIZE
  while read -r name links size; do
    [ -n "$name" ] && VOL_SIZE["$name"]="$size"
  done < <(docker system df -v 2>/dev/null | awk '
    /^VOLUME NAME/ {grab=1; next}
    grab && $2 ~ /^[0-9]+$/ {print $1, $2, $NF; next}
    grab {grab=0}')

  # --- Dangling volumes (not referenced by ANY container) -------------------
  declare -A DANGLING
  while read -r v; do [ -n "$v" ] && DANGLING["$v"]=1; done \
    < <(docker volume ls -qf dangling=true 2>/dev/null)

  bold "  Compose stacks:"
  for proj in "${!PROJ_DIR[@]}"; do
    dir="${PROJ_DIR[$proj]}"
    if [ -n "$dir" ] && [ ! -d "$dir" ]; then
      if [ -n "${LIVE_PROJ[$proj]:-}" ] || moved_by_path "$dir"; then
        printf "    MOVED   %-44s (name still live; volumes WILL be reused)\n" "$proj"
      else
        printf "    ORPHAN  %-44s (source gone: %s)\n" "$proj" "$dir"
      fi
    fi
  done | sort
  echo "    (stacks whose source dir still exists are live — not shown)"
  echo

  bold "  Named volumes — orphan candidates:"
  printf "    %-9s %-9s %s\n" "VERDICT" "SIZE" "VOLUME"
  is_db() { case "$1" in *postgres*|*pgdata*|*_db_data*|*mysql*|*mariadb*|*mongo*) return 0;; *) return 1;; esac; }
  while read -r v; do
    [ -n "$v" ] || continue
    proj="$(docker volume inspect "$v" --format '{{ index .Labels "com.docker.compose.project" }}' 2>/dev/null)"
    size="${VOL_SIZE[$v]:-?}"
    verdict=""
    if [ -n "$proj" ] && [ -n "${PROJ_DIR[$proj]:-}" ] && [ ! -d "${PROJ_DIR[$proj]}" ]; then
      if [ -n "${LIVE_PROJ[$proj]:-}" ] || moved_by_path "${PROJ_DIR[$proj]}"; then
        verdict="MOVED"                                          # repo moved — still alive
      else verdict="ORPHAN"; fi                                  # name dead too
    elif [ -n "${DANGLING[$v]:-}" ]; then
      # No container references it. Safe unless we can confirm it is live.
      slug="${proj#wt-}"; slug="${slug%-e2e}"
      if [ -n "$proj" ] && [ -n "${LIVE_SLUG[$slug]:-}" ]; then
        verdict=""                           # belongs to a live worktree
      else
        verdict="REVIEW"
      fi
    fi
    [ -z "$verdict" ] && continue
    # Drop trivial (0B) REVIEW volumes: deleting them frees nothing and the
    # REVIEW heuristic can't see other repos' live worktrees (cross-repo false
    # positives). ORPHAN/DB verdicts are kept regardless of size.
    [ "$verdict" = "REVIEW" ] && { [ "$size" = "0B" ] || [ "$size" = "0" ]; } && continue
    is_db "$v" && verdict="DB!$verdict"
    printf "    %-9s %-9s %s\n" "$verdict" "$size" "$v"
  done < <(docker volume ls -q 2>/dev/null) | sort
  echo "    ORPHAN  = source dir gone AND name dead, safe to delete"
  echo "    MOVED   = source dir gone but a live compose file resolves to this name — NEVER delete"
  echo "    REVIEW  = dangling (no container); confirm it is not a paused stack you want"
  echo "    DB!...  = database volume — DOUBLE-CHECK before deleting (irreversible data loss)"
  hr
else
  bold "DOCKER / ORBSTACK"
  echo "  docker not running — start it to audit images/volumes/stacks."
  hr
fi

# ---------------------------------------------------------------------------
# Simulators tied to deleted worktrees (naming convention: "<app> wt <slug> ...")
if have xcrun; then
  bold "STALE SIMULATORS (name contains 'wt <slug>' for a deleted worktree)"
  xcrun simctl list devices available 2>/dev/null \
    | grep -oE '[A-Za-z]+ wt [a-z0-9][a-z0-9-]* (customer|worker)?' \
    | while read -r line; do
        slug="$(printf '%s' "$line" | sed -E 's/^[A-Za-z]+ wt ([a-z0-9-]+).*/\1/')"
        if [ -z "${LIVE_SLUG[$slug]:-}" ]; then echo "    STALE  $line"; fi
      done | sort -u
  echo "    (list full state with: xcrun simctl list devices)"
  hr

  # --- Runtimes no device uses (whole disk images, often the single biggest win)
  bold "SIM RUNTIMES WITHOUT DEVICES (disk image deletable via: xcrun simctl runtime delete <UUID>)"
  RT_JSON="$(mktemp)"; DEV_JSON="$(mktemp)"
  xcrun simctl runtime list -j >"$RT_JSON" 2>/dev/null
  xcrun simctl list devices -j >"$DEV_JSON" 2>/dev/null
  python3 - "$RT_JSON" "$DEV_JSON" <<'PY' 2>/dev/null || echo "    (python3/simctl json unavailable)"
import json, sys
rts = json.load(open(sys.argv[1]))
devs = json.load(open(sys.argv[2])).get('devices', {})
counts = {rt: len(ds) for rt, ds in devs.items()}
for uuid, info in rts.items():
    ident = info.get('runtimeIdentifier', '')
    n = counts.get(ident, 0)
    size = info.get('sizeBytes')
    gb = f"{size/1e9:.1f}GB" if size else "?"
    tag = "UNUSED" if n == 0 else f"in use ({n} devices)"
    if n == 0:
        print(f"    UNUSED  {gb:>8}  {info.get('name', ident)}  {uuid}")
print("    (runtimes with devices are not shown; a UNUSED runtime is safe to delete —")
print("     it re-downloads via Xcode if ever needed again)")
PY
  rm -f "$RT_JSON" "$DEV_JSON"
  hr

  # --- Per-sim unified-log stores: pure log spam, deletable WITHOUT losing
  #     installed apps, logins, or app data (unlike `simctl erase`).
  bold "SIMULATOR DIAGNOSTICS LOGS (deletable while sim is shut down; keeps apps + data)"
  du -sh ~/Library/Developer/CoreSimulator/Devices/*/data/var/db/diagnostics 2>/dev/null \
    | sort -rh | head -8 | sed 's/^/    /'
  hr
fi

# ---------------------------------------------------------------------------
# DEEP MODE — full Library pass + stale Work projects + wt-* volume classification.
if [ "$MODE" = "deep" ]; then
  # Rank EVERY top-level Library tree, not a chosen few — this is the pass that
  # surfaces whole categories nobody thought to name. -type d skips the
  # GroupContainersAlias symlink, which otherwise double-counts Group Containers.
  bold "DEEP — FULL ~/Library PASS (every top-level tree, ranked; minutes)"
  find ~/Library -maxdepth 1 -type d -mindepth 1 -print0 2>/dev/null \
    | xargs -0 du -sh 2>/dev/null | sort -rh | head -20
  echo "    Anything big here with no row in the sections above is UNCLASSIFIED —"
  echo "    drill in by hand before deleting; assume user data until proven cache."
  hr

  bold "DEEP — STALE WORK PROJECTS (no git activity for ${STALE_DAYS}+ days; may take minutes)"
  echo "    Stale = last commit AND last working-tree change both older than ${STALE_DAYS}d."
  printf "    %-9s %s\n" "TOTAL" "PROJECT  (artifact breakdown)"
  ARTIFACTS=(node_modules .next .turbo dist build .expo Pods ios/Pods .gradle android/.gradle vendor target)
  NOW=$(date +%s)
  CUTOFF=$(( NOW - STALE_DAYS * 86400 ))
  for d in ~/Work/Projects/*/ ~/Work/Projects/*/*/ \
           ~/Work/Projects/*/.worktrees/*/ ~/Work/Projects/*/*/.worktrees/*/; do
    [ -e "$d/.git" ] || continue
    # Signal 1: last commit older than cutoff
    ct="$(git -C "$d" log -1 --format=%ct 2>/dev/null)" || continue
    [ -n "$ct" ] && [ "$ct" -gt "$CUTOFF" ] && continue
    # Signal 2: no non-artifact working-tree file changed within the window
    recent="$(find "$d" -maxdepth 4 -type f -mtime -"${STALE_DAYS}" \
      -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/.next/*' \
      -not -path '*/.turbo/*' -not -path '*/dist/*' -not -path '*/build/*' \
      -not -path '*/Pods/*' -not -path '*/.gradle/*' -not -path '*/vendor/*' \
      -not -path '*/target/*' -not -path '*/.expo/*' \
      -print -quit 2>/dev/null)"
    [ -n "$recent" ] && continue
    # Stale: sum reclaimable artifact dirs
    total=0; parts=""
    for a in "${ARTIFACTS[@]}"; do
      [ -d "$d/$a" ] || continue
      kb="$(du -sk "$d/$a" 2>/dev/null | awk '{print $1}')"
      [ -n "$kb" ] && [ "$kb" -gt 0 ] || continue
      total=$(( total + kb ))
      parts="$parts $a=$(( kb / 1024 ))M"
    done
    [ "$total" -gt 51200 ] || continue   # skip projects under ~50MB reclaimable
    printf "    %-9s %s\n" "$(( total / 1024 ))M" "${d#"$HOME"/Documents/Work/} ${parts# }"
  done | sort -rh
  echo "    (delete the artifact dirs BY PATH after confirming; a stale project's"
  echo "     node_modules etc. reinstall with one command when the project wakes up)"
  hr

  if have docker && docker info >/dev/null 2>&1; then
    bold "DEEP — wt-* WORKTREE VOLUMES (merged-PR / stale classification)"
    # Map worktree -> path across ALL Work repos, keyed by BOTH the dir basename
    # and the sanitized branch name: compose projects are usually named after the
    # branch (wt-feat-memberships-ux for .worktrees/memberships-ux on branch
    # feat/memberships-ux), so basename alone yields false GONE verdicts.
    declare -A WT_PATH
    for w in ~/Work/Projects/*/.worktrees/*/ ~/Work/Projects/*/*/.worktrees/*/; do
      [ -e "$w/.git" ] || continue
      WT_PATH["$(basename "$w")"]="${w%/}"
      br="$(git -C "$w" branch --show-current 2>/dev/null | tr '/' '-')"
      [ -n "$br" ] && WT_PATH["$br"]="${w%/}"
    done
    # Unique wt-* compose projects that own volumes
    declare -A WT_PROJ
    while read -r v; do
      [ -n "$v" ] || continue
      p="$(docker volume inspect "$v" --format '{{ index .Labels "com.docker.compose.project" }}' 2>/dev/null)"
      case "$p" in wt-*) WT_PROJ["$p"]="${WT_PROJ[$p]:-}$v " ;; esac
    done < <(docker volume ls -q 2>/dev/null)
    for proj in $(printf '%s\n' "${!WT_PROJ[@]}" | sort); do
      slug="${proj#wt-}"; slug="${slug%-e2e}"
      wt="${WT_PATH[$slug]:-}"
      verdict=""
      if [ -z "$wt" ]; then
        verdict="GONE (worktree deleted — orphan, safe)"
      else
        branch="$(git -C "$wt" branch --show-current 2>/dev/null)"
        merged=""
        if have gh && [ -n "$branch" ]; then
          merged="$(cd "$wt" && gh pr list --state merged --head "$branch" --json number --jq 'length' 2>/dev/null)"
        fi
        if [ "${merged:-0}" -ge 1 ] 2>/dev/null; then
          # A merged PR is NOT enough: work can continue in the worktree after
          # merge (caught live 2026-07-29 — merged branch, commit 6h old, live
          # bun processes). Require inactivity too.
          ct="$(git -C "$wt" log -1 --format=%ct 2>/dev/null)"
          if [ -n "$ct" ] && [ "$ct" -gt "$CUTOFF" ]; then
            verdict="MERGED-ACTIVE (PR merged BUT commits within ${STALE_DAYS}d — session may be live, SKIP)"
          else
            verdict="MERGED (PR merged, no recent commits — stack + volumes reclaimable, tear down worktree too)"
          fi
        else
          ct="$(git -C "$wt" log -1 --format=%ct 2>/dev/null)"
          if [ -n "$ct" ] && [ "$ct" -le "$CUTOFF" ]; then
            verdict="REVIEW-STALE (no commits for ${STALE_DAYS}+ days, merge state unproven — confirm by hand)"
          fi
        fi
      fi
      [ -n "$verdict" ] || continue          # live + active worktrees: not shown
      echo "    $proj — $verdict"
      for v in ${WT_PROJ[$proj]}; do
        printf "        %-9s %s\n" "${VOL_SIZE[$v]:-?}" "$v"
      done
    done
    echo "    (MERGED/GONE: docker compose -p <proj> down, then docker volume rm by name."
    echo "     REVIEW-STALE and every DB volume: user confirms first — never auto-delete)"
    hr
  fi
fi

# ---------------------------------------------------------------------------
bold "SUGGESTED RECLAMATION COMMANDS  (review, then run yourself — nothing was deleted)"
cat <<'CMDS'

  # ---- Caches (regenerate on next use; safe) ----
  rm -rf ~/Library/Caches/ms-playwright-mcp \
         ~/Library/Caches/CocoaPods ~/Library/Caches/pnpm
  brew cleanup -s

  # ---- Playwright browsers (targeted; NEVER rm the whole registry) ----
  # A blind wipe frees ~150MB-1GB, then charges every parallel agent session a
  # re-download that serializes on Playwright's silent __dirlock. Prune instead:
  pwmcp prune                              # drops revisions no pin still needs
  pwmcp status                             # names any registry bypassing the pin

  # ---- Xcode (regenerated on next build; safe) ----
  rm -rf ~/Library/Developer/Xcode/DerivedData/*
  xcrun simctl delete unavailable          # orphaned-runtime sims only
  # xcrun simctl runtime delete <UUID>     # UNUSED runtimes from the report (often 8GB each)
  # xcrun simctl shutdown all && \
  #   rm -rf ~/Library/Developer/CoreSimulator/Devices/*/data/var/db/diagnostics/*
  #                                        # log spam only — keeps apps, logins, app data
  # xcrun simctl shutdown all && xcrun simctl erase all   # wipe sim data, keep devices

  # ---- Media caches: delete the AGED SLICE ONLY, never the whole tree ----
  # The recent slice is what keeps the app fast and re-costs an iCloud fetch.
  # osascript -e 'quit app "Messages"'
  # find ~/Library/Containers/com.apple.MobileSMS/Data/tmp \
  #      ~/Library/Messages/Caches/Previews \
  #      -type f -mtime +60 -delete
  # find ~/Library/Containers/com.apple.MobileSMS/Data/tmp -type d -empty -delete
  # NEVER ~/Library/Messages/Attachments — that IS the conversation media.

  # ---- Logs (app logs only; nothing here is needed to run anything) ----
  # rm -rf ~/Library/Logs/JetBrains/* ~/Library/Logs/CreativeCloud/*
  # rm -f  ~/Library/Logs/*.log.old.*

  # ---- Abandoned screen recordings: BY HAND, never scripted ----
  # open ~/Library/"Group Containers"/group.com.apple.screencapture/ScreenRecordings
  # Play each .mov, then drag to Trash. These are unsaved captures = user data.

  # ---- Docker: build cache + unused images (re-pull/rebuild; safe) ----
  docker builder prune -af
  docker image prune -af                   # only removes images no container holds

  # ---- Docker ORPHAN volumes: delete BY NAME from the report above. ----
  # NEVER `docker volume prune` / `docker system prune --volumes` here:
  # that also nukes paused-but-live worktree DBs. Remove the dead stack's
  # containers first, then its named volumes:
  #   docker compose -p <orphan-project> down        # or: docker rm -f <ids>
  #   docker volume rm <orphan-vol-1> <orphan-vol-2> ...

  # Delete stale simulators by UDID (from `xcrun simctl list devices`):
  #   xcrun simctl delete <udid> <udid> ...
CMDS
echo
echo "NOTE: OrbStack/Docker store data in a sparse disk image that auto-reclaims"
echo "AFTER a prune — host free space lags by a minute. \`df\` also reads low while"
echo "sims/Metro/builds are writing; re-check when idle."
