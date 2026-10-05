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
# Emergency deletion is the `reclaim` applet (the tools repo) — the only thing that deletes.
set -uo pipefail

# The liveness maps are associative arrays: bash 4+. macOS /bin/bash is 3.2, which
# reads string subscripts as arithmetic and would mislabel live volumes.
if [ "${BASH_VERSINFO[0]:-0}" -lt 4 ]; then
  echo "audit.sh needs bash 4+ (this is ${BASH_VERSION:-unknown}): run it as /opt/homebrew/bin/bash audit.sh" >&2
  exit 2
fi

MODE="${1:-default}"
STALE_DAYS="${STALE_DAYS:-7}"
# Recency window kept on media caches. Purging these wholesale is a false win: the
# recent slice is what makes Messages scroll fast, and it re-fetches from iCloud.
KEEP_DAYS="${KEEP_DAYS:-60}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
hr()   { printf '%s\n' "------------------------------------------------------------"; }
have() { command -v "$1" >/dev/null 2>&1; }

# Every worktree of every repo under ~/Work/Projects, asked of git itself (main
# clones are the .git DIRECTORIES; linked worktrees carry a .git file). A glob of
# fixed .worktrees depths missed nested repos and called their volumes GONE.
mapfile -t ALL_WT < <(
  { git worktree list --porcelain 2>/dev/null
    find ~/Work/Projects -maxdepth 4 -name .git -type d -prune 2>/dev/null | while IFS= read -r g; do
      git -C "${g%/.git}" worktree list --porcelain 2>/dev/null
    done
  } | awk '/^worktree /{ print substr($0, 10) }' | sort -u)

# Live worktree slugs (used by docker + simulator sections to tell "belongs to
# a live worktree" from "orphan"). Keyed by BOTH dir basename and sanitized
# branch name — compose projects and sim names are usually branch-derived
# (wt-feat-x for .worktrees/x on feat/x).
declare -A LIVE_SLUG
for w in "${ALL_WT[@]}"; do
  LIVE_SLUG["$(basename "$w")"]=1
  br="$(git -C "$w" branch --show-current 2>/dev/null | tr '/' '-')"
  [ -n "$br" ] && LIVE_SLUG["$br"]=1
done

# Live compose project NAMES. A project's identity is its NAME, not the path it
# was last started from: volumes are <project>_<volume>. A repo that moved on
# disk keeps the old working_dir label while a live checkout still resolves to
# the same name and WILL reattach the same volumes. ${VAR:-default} resolves to
# its default; a name still holding interpolation after that (`${VAR:?…}`,
# `fixit-${ENV}`) cannot be resolved here. It is kept as a glob (`fixit-*`, or
# `*`) with the top-level volume keys its file declares, and a project or volume
# it could own is REVIEW, never ORPHAN.
declare -A LIVE_PROJ UNRESOLVED
for d in ~/Work/Projects/*/ ~/Work/Projects/*/*/ "${ALL_WT[@]/%//}"; do
  [ -d "$d" ] || continue
  while IFS= read -r f; do
    n="$(sed -n 's/^name:[[:space:]]*//p' "$f" 2>/dev/null | head -1)"
    n="${n%\"}"; n="${n#\"}"; n="${n%\'}"; n="${n#\'}"
    case "$n" in
      *'$'*)
        n="$(printf '%s' "$n" | sed -E 's/\$\{[A-Za-z_][A-Za-z0-9_]*:-([^}]*)\}/\1/g')"
        case "$n" in *'$'*)
          g="$(printf '%s' "$n" | sed -E 's/\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*/*/g')"
          # Top-level volume keys at whatever indent the file uses (the first
          # key under volumes: sets it). None parsed => "?" = ownership unknown.
          vols="$(awk '/^volumes:/ { f = 1; ind = 0; next } /^[^[:space:]#]/ { f = 0 }
                       f && /^[[:space:]]+[A-Za-z0-9_.-]+:/ {
                         match($0, /^[[:space:]]+/); if (!ind) ind = RLENGTH
                         if (RLENGTH == ind) { k = substr($0, ind + 1); sub(/:.*/, "", k); printf "%s ", k } }' "$f")"
          [ -n "$vols" ] || vols="? "
          UNRESOLVED["$g"$'\t'" $vols"]=1
          n="" ;;
        esac ;;
      '') n="$(basename "$(dirname "$f")" | tr 'A-Z' 'a-z' | tr -cd 'a-z0-9_-')" ;;
    esac
    [ -n "$n" ] && LIVE_PROJ["$n"]=1
  done < <(find "$d" -maxdepth 3 \( -name 'docker-compose*.y*ml' -o -name 'compose*.y*ml' \) 2>/dev/null)
done
# True when project $1 — and, when given, Docker volume $2 — could belong to a
# compose file whose name did not resolve. The volume's logical key comes from
# its com.docker.compose.volume label (an explicit `name:` makes the volume name
# lie); no label, or a file whose keys did not parse, keeps it ambiguous (true).
name_unresolved() {
  local k g vols key=""
  [ -n "${2:-}" ] && key="$(docker volume inspect "$2" --format '{{ index .Labels "com.docker.compose.volume" }}' 2>/dev/null)"
  for k in "${!UNRESOLVED[@]}"; do
    g="${k%%$'\t'*}"; vols="${k#*$'\t'}"
    # shellcheck disable=SC2053  # $g is a glob on purpose
    [[ "$1" == $g ]] || continue
    [ -z "${2:-}" ] || [ -z "$key" ] && return 0
    case "$vols" in *" $key "*|*" ? "*) return 0 ;; esac
  done
  return 1
}

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
# CONSTRUCTION — every file over 1G under ~/Library and the per-user temp root,
# whoever owns it. Abandoned screen recordings, app-sandbox temp media and
# Instruments raw traces live here and are invisible to every allowlist above.
TMPROOT="$(getconf DARWIN_USER_TEMP_DIR)"
bold "GIANT FILES IN ~/Library + \$TMPDIR (>1G, any owner)"
find ~/Library "$TMPROOT" -type f -size +1G -print0 2>/dev/null \
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
  # xargs splits a big file list into several du batches, each with its own
  # "total" line: sum them all (tail -1 kept only the last batch, under-reporting
  # an 8.4G aged slice as 1.8G).
  old="$(find "$dir" -type f -mtime +"${KEEP_DAYS}" -print0 2>/dev/null \
        | xargs -0 du -cm 2>/dev/null | awk '$2 == "total" { s += $1 } END { print s + 0 }')"
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
# Where agent sessions leave gigabytes no cache ladder owns: run scratch in the
# shared temp roots, raw evidence parked untracked in ~/Exports, the backup home,
# and the transcripts themselves. User data until the user says otherwise —
# sized and aged here, never deleted by a script.
bold "SESSION RESIDUE & ARCHIVES (report only)"
NOW=$(date +%s)
sum_g() { awk '{ s += $1 } END { printf "%.1fG", s / 1048576 }'; }
# Hours since the newest FILE inside changed. Directory mtimes lie: nightly
# jobs touch them, so a 3-day-idle tree reads as "modified today".
newest_h() {
  local m; m="$(find "$1" -type f -print0 2>/dev/null | xargs -0 stat -f %m 2>/dev/null | sort -n | tail -1)"
  if [ -n "$m" ]; then echo $(( (NOW - m) / 3600 )); else echo "-"; fi
}
OPEN_TMP="$(mktemp)"
lsof -Fn 2>/dev/null | sed -n 's#^n/tmp/#/private/tmp/#p; s#^n/private/tmp/#/private/tmp/#p; s#^n/private/var/tmp/#/private/var/tmp/#p' \
  | sort -u >"$OPEN_TMP"
echo "shared temp scratch (>=500M; idle = hours since its newest file changed):"
find /private/tmp /private/var/tmp -mindepth 1 -maxdepth 1 -print0 2>/dev/null \
  | xargs -0 -P 8 -n 1 du -skx 2>/dev/null | awk '$1 >= 512000' | sort -rn | head -20 \
  | while IFS=$'\t' read -r kb d; do
      if grep -qF -- "$d/" "$OPEN_TMP"; then st="IN USE"; else st="idle $(newest_h "$d")h"; fi
      printf '      %6.1fG  %-11s %s\n' "$(echo "$kb / 1048576" | bc -l)" "$st" "$d"
    done
echo "      ^ delete BY NAME once the user picks: idle 24h+ AND not IN USE (re-check at delete time)."
rm -f "$OPEN_TMP"
if [ -d ~/Exports/.git ]; then
  EXP_LIST="$(mktemp)"
  (cd ~/Exports && git ls-files -z --others | xargs -0 stat -f '%z %N' 2>/dev/null) >"$EXP_LIST"
  echo "~/Exports untracked (never committed — this disk holds the only copy): $(awk '{ s += $1 } END { printf "%.1fG", s / 1073741824 }' "$EXP_LIST")"
  awk '{ sz = $1; $1 = ""; n = split(substr($0, 2), a, "/"); k = a[1]
         for (i = 2; i <= 3 && i < n; i++) k = k "/" a[i]; s[k] += sz }
       END { for (k in s) printf "%d\t%s\n", s[k], k }' "$EXP_LIST" \
    | sort -rn | head -6 | awk -F'\t' '{ printf "      %6.1fG  %s\n", $1 / 1073741824, $2 }'
  printf '      by type: '
  awk '{ sz = $1; $1 = ""; e = substr($0, 2); sub(/.*\//, "", e)
         if (e ~ /\./) sub(/.*\./, "", e); else e = "(noext)"; s[e] += sz; c[e]++ }
       END { for (k in s) printf "%d\t%s\t%d\n", s[k], k, c[k] }' "$EXP_LIST" \
    | sort -rn | head -4 | awk -F'\t' '{ printf "%.1fG .%s (%d)  ", $1 / 1073741824, $2, $3 }'
  echo
  rm -f "$EXP_LIST"
fi
# One directory on case-insensitive APFS, whatever the spelling.
if [ -d ~/Backups ]; then
  echo "~/Backups $(du -shx ~/Backups 2>/dev/null | cut -f1) (local insurance — pruned by hand):"
  find ~/Backups -mindepth 1 -maxdepth 1 -print0 2>/dev/null | xargs -0 du -skx 2>/dev/null \
    | sort -rn | head -5 | while IFS=$'\t' read -r kb d; do
        printf '      %6.1fG  idle %sh  %s\n' "$(echo "$kb / 1048576" | bc -l)" "$(newest_h "$d")" "$d"
      done
fi
CPD="$(jq -r '.cleanupPeriodDays // 30' ~/.claude/settings.json 2>/dev/null)"
echo "session history:"
printf '      claude transcripts  %s total | %s older than 14d | cleanupPeriodDays=%s\n' \
  "$(find ~/.claude/projects -type f -print0 2>/dev/null | xargs -0 du -k 2>/dev/null | sum_g)" \
  "$(find ~/.claude/projects -type f -mtime +14 -print0 2>/dev/null | xargs -0 du -k 2>/dev/null | sum_g)" \
  "${CPD:-30}"
if [ -d ~/.codex ]; then
  printf '      codex sessions      %s total | %s older than 14d | databases %s\n' \
    "$(find ~/.codex/sessions -type f -print0 2>/dev/null | xargs -0 du -k 2>/dev/null | sum_g)" \
    "$(find ~/.codex/sessions -type f -mtime +14 -print0 2>/dev/null | xargs -0 du -k 2>/dev/null | sum_g)" \
    "$(du -k ~/.codex/*.sqlite* 2>/dev/null | sum_g)"
fi
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
      elif name_unresolved "$proj"; then
        printf "    REVIEW  %-44s (a compose name here did not resolve; may be live)\n" "$proj"
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
      elif name_unresolved "$proj" "$v"; then verdict="REVIEW"  # name unresolvable here
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
  bold "STALE SIMULATORS ('wt <slug>' of a deleted worktree; IDLE = not booted in ${STALE_DAYS}+ days)"
  xcrun simctl list devices available 2>/dev/null \
    | grep -oE '[A-Za-z]+ wt [a-z0-9][a-z0-9-]* (customer|worker)?' \
    | while read -r line; do
        slug="$(printf '%s' "$line" | sed -E 's/^[A-Za-z]+ wt ([a-z0-9-]+).*/\1/')"
        if [ -z "${LIVE_SLUG[$slug]:-}" ]; then echo "    STALE  $line"; fi
      done | sort -u
  # Each device holds 3-4G of installed apps + data; sizes are logical (clones
  # share blocks), so only df after a delete is the truth.
  SIM_CUT="$(date -v-"${STALE_DAYS}"d +%Y-%m-%d)"
  xcrun simctl list devices -j 2>/dev/null \
    | jq -r --arg cut "$SIM_CUT" '.devices[][] | select(.state != "Booted"
        and ((.lastBootedAt // "0000") | .[0:10]) < $cut)
        | [.udid, ((.lastBootedAt // "never") | .[0:10]), .name] | @tsv' 2>/dev/null \
    | while IFS=$'\t' read -r udid lb name; do
        printf '    IDLE  %5s  last boot %-10s  %s  %s\n' \
          "$(du -sh ~/Library/Developer/CoreSimulator/Devices/"$udid" 2>/dev/null | cut -f1)" "$lb" "$udid" "$name"
      done
  echo "    (list full state with: xcrun simctl list devices)"
  hr

  # --- Runtimes no device uses (whole disk images, often the single biggest win)
  bold "SIM RUNTIMES WITHOUT DEVICES (disk image deletable via: xcrun simctl runtime delete <UUID>)"
  RT_JSON="$(mktemp)"; DEV_JSON="$(mktemp)"; SDK_JSON="$(mktemp)"
  xcrun simctl runtime list -j >"$RT_JSON" 2>/dev/null
  xcrun simctl list devices -j >"$DEV_JSON" 2>/dev/null
  xcodebuild -showsdks -json >"$SDK_JSON" 2>/dev/null
  python3 - "$RT_JSON" "$DEV_JSON" "$SDK_JSON" <<'PY' 2>/dev/null || echo "    (python3/simctl json unavailable)"
import json, sys
rts = json.load(open(sys.argv[1]))
devs = json.load(open(sys.argv[2])).get('devices', {})
counts = {rt: len(ds) for rt, ds in devs.items()}
# The installed Xcode builds against its own simulator SDK runtime: never offer it.
xcode = {f"com.apple.platform.{s['platform']} {s['sdkVersion']}" for s in json.load(open(sys.argv[3]))}
for uuid, info in rts.items():
    ident = info.get('runtimeIdentifier', '')
    n = counts.get(ident, 0)
    if not ident or f"{info.get('platformIdentifier')} {info.get('version')}" in xcode:
        continue
    size = info.get('sizeBytes')
    gb = f"{size/1e9:.1f}GB" if size else "?"
    tag = "UNUSED" if n == 0 else f"in use ({n} devices)"
    if n == 0:
        print(f"    UNUSED  {gb:>8}  {info.get('name', ident)}  {uuid}")
print("    (runtimes with devices and Xcode's own SDK runtime are not shown; a UNUSED runtime is safe to delete —")
print("     it re-downloads via Xcode if ever needed again)")
PY
  rm -f "$RT_JSON" "$DEV_JSON" "$SDK_JSON"
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
  # Rank EVERY top-level tree of every root, not a chosen few — this is the pass
  # that surfaces whole categories nobody thought to name. -type d skips symlinks
  # (GroupContainersAlias would double-count Group Containers). VF/X holds the
  # browsers' *.code_sign_clone dirs, so it is ranked one level deeper.
  VF="${TMPROOT%/T/}"
  bold "DEEP — FULL-DISK PASS (every top-level tree of the Data volume, ranked; minutes)"
  RANKED="$(mktemp)"
  { find ~ -maxdepth 1 -mindepth 1 -type d ! -path ~/Library ! -path ~/Work ! -path ~/OrbStack -print0
    find ~/Library ~/Work/Projects "$VF/X" -maxdepth 1 -mindepth 1 -type d -print0
    find ~/Work "$VF" -maxdepth 1 -mindepth 1 -type d ! -path ~/Work/Projects ! -path "$VF/X" -print0
    find /private/tmp /private/var/tmp -maxdepth 1 -mindepth 1 -print0
    # The rest of Users/private: other accounts + Shared, /private/var (log, db, vm…),
    # other users' temp roots — each subtree measured once, none of the above twice.
    find /Users -maxdepth 1 -mindepth 1 -type d ! -path "$HOME" -print0
    find /private -maxdepth 1 -mindepth 1 -type d ! -name var ! -name tmp -print0
    find /private/var -maxdepth 1 -mindepth 1 -type d ! -name folders ! -name tmp -print0
    find /private/var/folders -maxdepth 2 -mindepth 2 -type d ! -path "$(cd "$VF" && pwd -P)" -print0
    # home + Volumes are mount points (autofs, external disks), not Data-volume bytes
    find /System/Volumes/Data -maxdepth 1 -mindepth 1 -type d ! -name Users ! -name private \
      ! -name home ! -name Volumes -print0
  } 2>/dev/null | xargs -0 -P 8 -n 1 du -skx 2>/dev/null | sort -rn >"$RANKED"
  awk 'NR <= 25 { s = $1; sub(/^[0-9]+\t/, ""); printf "%7.1fG  %s\n", s / 1048576, $0 }' "$RANKED"
  awk -v used="$(df -k /System/Volumes/Data | awk 'NR == 2 { print $3 }')" \
    '{ s += $1 } END { printf "    coverage: ranked %.0fG of %.0fG used on the Data volume; under ~90%% means a root is missing, over 100%% is clones/hardlinks counted twice\n", s / 1048576, used / 1048576 }' "$RANKED"
  rm -f "$RANKED"
  echo "    Anything big here with no row in the sections above is UNCLASSIFIED —"
  echo "    drill in by hand before deleting; assume user data until proven cache."
  hr

  bold "DEEP — STALE WORK PROJECTS (no git activity for ${STALE_DAYS}+ days; may take minutes)"
  echo "    Stale = last commit AND last working-tree change both older than ${STALE_DAYS}d."
  printf "    %-9s %s\n" "TOTAL" "PROJECT  (artifact breakdown)"
  ARTIFACTS=(node_modules .next .turbo dist build .expo Pods ios/Pods .gradle android/.gradle vendor target)
  NOW=$(date +%s)
  CUTOFF=$(( NOW - STALE_DAYS * 86400 ))
  # A non-artifact working-tree file changed within the window (signal 2 of staleness).
  recent_edit() {
    [ -n "$(find "$1" -maxdepth 4 -type f -mtime -"${STALE_DAYS}" \
      -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/.next/*' \
      -not -path '*/.turbo/*' -not -path '*/dist/*' -not -path '*/build/*' \
      -not -path '*/Pods/*' -not -path '*/.gradle/*' -not -path '*/vendor/*' \
      -not -path '*/target/*' -not -path '*/.expo/*' \
      -print -quit 2>/dev/null)" ]
  }
  for d in "${ALL_WT[@]}"; do
    # Signal 1: last commit older than cutoff
    ct="$(git -C "$d" log -1 --format=%ct 2>/dev/null)" || continue
    [ -n "$ct" ] && [ "$ct" -gt "$CUTOFF" ] && continue
    # Signal 2: no non-artifact working-tree file changed within the window
    recent_edit "$d" && continue
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
    printf "    %-9s %s\n" "$(( total / 1024 ))M" "${d#"$HOME"/Work/Projects/} ${parts# }"
  done | sort -rh
  echo "    (delete the artifact dirs BY PATH after confirming; a stale project's"
  echo "     node_modules etc. reinstall with one command when the project wakes up)"
  hr

  if have docker && docker info >/dev/null 2>&1; then
    bold "DEEP — wt-* WORKTREE VOLUMES (merged-PR / stale classification)"
    # Map worktree -> path across ALL Work repos, keyed by BOTH the dir basename
    # and the sanitized branch name: compose projects are usually named after the
    # branch (wt-feat-memberships-ux for .worktrees/memberships-ux on branch
    # feat/memberships-ux), so basename alone yields false GONE verdicts. Two
    # checkouts can claim one slug (every repo's main clone on `main`): such a
    # slug has no single owner to judge, so it is REVIEW — never one repo's
    # merge history and activity standing in for another's.
    declare -A WT_PATH WT_CLAIMS
    claim() { [ "${WT_PATH[$1]:-}" = "$2" ] && return; WT_PATH["$1"]="$2"; WT_CLAIMS["$1"]=$(( ${WT_CLAIMS[$1]:-0} + 1 )); }
    for w in "${ALL_WT[@]}"; do
      claim "$(basename "$w")" "$w"
      br="$(git -C "$w" branch --show-current 2>/dev/null | tr '/' '-')"
      [ -n "$br" ] && claim "$br" "$w"
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
      if [ "${WT_CLAIMS[$slug]:-0}" -gt 1 ]; then
        verdict="REVIEW (${WT_CLAIMS[$slug]} checkouts claim '$slug' — owner ambiguous, confirm by hand)"
      elif [ -z "$wt" ]; then
        # No worktree of any repo claims the slug. A live compose name (or one
        # that did not resolve) can still own the project: REVIEW, never GONE.
        owned=""
        [ -n "${LIVE_PROJ[$proj]:-}" ] && owned=1
        for v in ${WT_PROJ[$proj]}; do name_unresolved "$proj" "$v" && owned=1; done
        if [ -n "$owned" ]; then
          verdict="REVIEW (no worktree found, but a live or unresolved compose name may own it)"
        else
          verdict="GONE (no worktree of any repo claims it — orphan, safe)"
        fi
      else
        branch="$(git -C "$wt" branch --show-current 2>/dev/null)"
        merged=""
        if have gh && [ -n "$branch" ]; then
          merged="$(cd "$wt" && gh pr list --state merged --head "$branch" --json number --jq 'length' 2>/dev/null)"
        fi
        if [ "${merged:-0}" -ge 1 ] 2>/dev/null; then
          # A merged PR is NOT enough: work can continue in the worktree after
          # merge (caught live 2026-07-29 — merged branch, commit 6h old, live
          # bun processes). Require the double signal — no recent commit AND no
          # uncommitted or recent working-tree change — and hold an unreadable one.
          ct="$(git -C "$wt" log -1 --format=%ct 2>/dev/null)"
          if [ -z "$ct" ]; then
            verdict="REVIEW (PR merged, last commit unreadable — confirm by hand)"
          elif [ "$ct" -gt "$CUTOFF" ] || [ -n "$(git -C "$wt" status --porcelain 2>/dev/null)" ] \
               || recent_edit "$wt"; then
            verdict="MERGED-ACTIVE (PR merged BUT recent commits, uncommitted or recent edits — session may be live, SKIP)"
          else
            verdict="MERGED (PR merged, idle ${STALE_DAYS}+ days, clean — stack + volumes reclaimable, tear down worktree too)"
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

  # ---- Session residue: BY NAME, after the user picks from the report ----
  # rm -rf /private/tmp/<name>             # idle 24h+ AND not IN USE, re-checked now
  # xcrun simctl delete <udid>             # IDLE sims the user no longer needs
  # ~/Exports untracked runs, ~/Backups: user data — prune by hand, never scripted
  # transcripts: lower cleanupPeriodDays in ~/.claude/settings.json, never rm the jsonl

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
