#!/usr/bin/env bash
# reclaim-fast — EMERGENCY disk clear. Deletes a FROZEN zero-risk set, nothing else.
#
# Everything here regenerates on next use (caches, build products, prunable Docker
# layers). No scans, no prompts, no judgment calls: when the disk is critically full
# this must finish in seconds. Anything that needs classification (volumes, sims
# with data, stale projects) belongs to audit.sh + a human decision, NEVER here.
set -uo pipefail

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

bold "BEFORE"
df -h /System/Volumes/Data | tail -1

# ---- Tool & app caches (regenerate on next use) ---------------------------
# dotslash pins its cached binaries read-only — unlock before removing.
[ -d ~/Library/Caches/dotslash ] && chmod -R u+w ~/Library/Caches/dotslash 2>/dev/null
rm -rf \
  ~/Library/Caches/ms-playwright-mcp \
  ~/Library/Caches/CocoaPods \
  ~/Library/Caches/pnpm \
  ~/Library/Caches/dotslash \
  ~/Library/Caches/claude-cli-nodejs \
  ~/Library/Caches/com.openai.codex \
  ~/Library/Caches/copilot \
  ~/Library/Caches/composer \
  ~/Library/Caches/BraveSoftware \
  ~/Library/Caches/Google \
  ~/Library/Caches/com.spotify.client \
  ~/Library/Caches/JetBrains \
  ~/Library/Caches/com.todesktop.230313mzl4w4u92.ShipIt \
  2>/dev/null

# ---- Playwright browsers (NOT a blind rm) ---------------------------------
# ms-playwright is deliberately absent from the list above. Wiping it frees
# ~150MB-1GB and then charges every parallel session a re-download, which they
# serialize on Playwright's silent __dirlock — that is a wedge, not a reclaim.
# `pwmcp prune` deletes only revisions no installed pin still needs.
if have pwmcp; then
  pwmcp prune 2>/dev/null | tail -1
fi

have brew && brew cleanup -s >/dev/null 2>&1

# ---- Xcode build products (rebuilt on next build) -------------------------
rm -rf ~/Library/Developer/Xcode/DerivedData/* 2>/dev/null
have xcrun && xcrun simctl delete unavailable >/dev/null 2>&1   # orphaned-runtime sims only

# ---- Docker: build cache + unreferenced images (re-pull/rebuild) ----------
# NEVER volumes, NEVER containers — those need audit.sh's orphan classification.
if have docker && docker info >/dev/null 2>&1; then
  docker builder prune -af >/dev/null 2>&1
  docker image prune -af >/dev/null 2>&1
fi

# ---- REPORT ONLY: the biggest non-cache offenders on a Mac ----------------
# An allowlist deletes only what it names, so a single abandoned 80G screen
# recording survives every pass above. These two fixed paths are cheap to stat
# and hold user data / need an app quit — surface them, never delete them here.
bold "NOT DELETED — check these by hand (biggest wins are usually here)"
SCAP=~/Library/"Group Containers"/group.com.apple.screencapture/ScreenRecordings
if [ -d "$SCAP" ] && [ -n "$(ls -A "$SCAP" 2>/dev/null)" ]; then
  echo "  UNSAVED SCREEN RECORDINGS  $(du -sh "$SCAP" 2>/dev/null | cut -f1)"
  find "$SCAP" -type f -print0 2>/dev/null | xargs -0 du -h 2>/dev/null | sort -rh | sed 's/^/    /'
  echo "    open \"$SCAP\"   # play, then trash by hand — user data"
fi
find ~/Library/Containers/*/Data/tmp -maxdepth 0 -type d -print0 2>/dev/null \
  | xargs -0 du -sm 2>/dev/null | awk '$1>=1024 {printf "  APP SANDBOX TMP  %dG  %s\n", $1/1024, $2}'
echo "  (quit the owning app, then delete the AGED SLICE only —"
echo "   find <that tmp> -type f -mtime +60 -delete — never the whole tree)"
echo

bold "AFTER"
df -h /System/Volumes/Data | tail -1
echo
echo "NOTE: OrbStack/Docker sparse image reclaims host space ~1 min after the prune —"
echo "re-check df shortly. For more space, run the full audit: bash audit.sh [deep]"
