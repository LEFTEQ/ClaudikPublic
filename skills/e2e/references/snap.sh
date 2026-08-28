#!/usr/bin/env bash
# /e2e — `snap` helpers (vision-cost-optimized capture pipeline)
# Source this once per session, then call:
#   snap              <label> [tier]                       — full-frame capture (mobile)
#   snap_post         <raw_path> <label> [tier]            — post-process an MCP-produced raw file
#   snap_region       <label> <x,y,w,h> [tier]             — full capture + crop to region (mobile)
#   snap_post_region  <raw_path> <label> <x,y,w,h> [tier]  — post-process MCP raw + crop
#
# Env:
#   E2E_PLATFORM = ios | android         (default: ios)
#   E2E_UDID     = iOS UUID, or Android `adb -s` serial (empty = single device)
#   E2E_DIR      = /e2e base dir         (default: .e2e). Output is written to
#                  <E2E_DIR>/.screenshots/<label>.jpg
#
# Tier table (text-mode first; screenshots are evidence only — see SKILL.md):
#   micro                                                                         → 600px  / q40
#   lo · nav                                                                      → 800px  / q45
#   default · alignment · spacing · icon · overflow · finding · fix · darkmode    → 1200px / q55
#   hi · color · contrast · shadow · radius · typography · audit · regression     → 1500px / q75
#
# Element/selector cropping is a documented recipe (not a bash helper):
#   1. Resolve bbox via mcp__playwright__browser_evaluate `el.getBoundingClientRect()`
#      or Appium/WebdriverIO element `getRect()`.
#   2. Call `snap_region <label> "<x>,<y>,<w>,<h>" [tier]`.

# --- internal: tier → dim, q ------------------------------------------------
__snap_resolve_tier() {
  case "$1" in
    micro)      __SNAP_DIM=600;  __SNAP_Q=40 ;;
    lo|nav)     __SNAP_DIM=800;  __SNAP_Q=45 ;;
    hi|color|contrast|shadow|radius|typography|audit|regression)
                __SNAP_DIM=1500; __SNAP_Q=75 ;;
    default|alignment|spacing|icon|overflow|finding|fix|darkmode)
                __SNAP_DIM=1200; __SNAP_Q=55 ;;
    *)          echo "snap: unknown tier '$1' — using default (1200/q55)" >&2
                __SNAP_DIM=1200; __SNAP_Q=55 ;;
  esac
}

# --- internal: resolve session output dir + path ----------------------------
__snap_out_path() {
  local label="$1"
  local out_dir="${E2E_DIR:-.e2e}/.screenshots"
  mkdir -p "$out_dir"
  echo "$out_dir/${label}.jpg"
}

# --- internal: capture full frame to a raw PNG path (caller passes target) --
__snap_capture_raw() {
  local target="$1"
  local platform="${E2E_PLATFORM:-ios}"
  local udid="${E2E_UDID}"
  case "$platform" in
    ios)
      xcrun simctl io "$udid" screenshot "$target" >/dev/null 2>&1
      ;;
    android)
      if [ -n "$udid" ]; then
        adb -s "$udid" exec-out screencap -p > "$target" 2>/dev/null
      else
        adb exec-out screencap -p > "$target" 2>/dev/null
      fi
      ;;
    *)
      echo "snap: unknown E2E_PLATFORM '$platform' — set to 'ios' or 'android'" >&2
      return 1 ;;
  esac
  [ -s "$target" ] || { echo "snap: capture failed on $platform (no bytes) — check device connection" >&2; return 1; }
}

# --- snap: full-frame capture ----------------------------------------------
snap() {
  local label="$1"
  local tier="${2:-default}"
  __snap_resolve_tier "$tier"
  local out; out=$(__snap_out_path "$label")
  local tmp; tmp=$(mktemp -t snap-raw).png
  if ! __snap_capture_raw "$tmp"; then rm -f "$tmp"; return 1; fi
  sips -Z "$__SNAP_DIM" -s format jpeg -s formatOptions "$__SNAP_Q" "$tmp" --out "$out" >/dev/null
  rm -f "$tmp"
  echo "$out"
}

# --- snap_post: post-process an already-captured raw file -------------------
# Use after mcp__playwright__browser_take_screenshot wrote a raw file to disk.
# Downscales + JPEG-encodes, deletes the raw, echoes final path.
snap_post() {
  local raw="$1"
  local label="$2"
  local tier="${3:-default}"
  if [ -z "$raw" ] || [ -z "$label" ]; then
    echo "snap_post: usage: snap_post <raw_path> <label> [tier]" >&2
    return 1
  fi
  if [ ! -s "$raw" ]; then
    echo "snap_post: raw missing or empty: $raw" >&2
    return 1
  fi
  __snap_resolve_tier "$tier"
  local out; out=$(__snap_out_path "$label")
  sips -Z "$__SNAP_DIM" -s format jpeg -s formatOptions "$__SNAP_Q" "$raw" --out "$out" >/dev/null
  rm -f "$raw"
  echo "$out"
}

# --- snap_region: capture + crop to x,y,w,h, then downscale -----------------
# bbox format: "x,y,w,h" (CSS-style: x=left, y=top, w=width, h=height).
# Requires ImageMagick (`magick`). sips's --cropOffset is broken — verified empirically.
snap_region() {
  local label="$1"
  local bbox="$2"
  local tier="${3:-default}"
  if [ -z "$label" ] || [ -z "$bbox" ]; then
    echo "snap_region: usage: snap_region <label> <x,y,w,h> [tier]" >&2
    return 1
  fi
  local x y w h
  IFS=',' read -r x y w h <<< "$bbox"
  if [ -z "$x" ] || [ -z "$y" ] || [ -z "$w" ] || [ -z "$h" ]; then
    echo "snap_region: bbox must be 'x,y,w,h' (got '$bbox')" >&2
    return 1
  fi
  if ! command -v magick >/dev/null 2>&1; then
    echo "snap_region: ImageMagick (\`magick\`) not found. Install with: brew install imagemagick" >&2
    return 1
  fi
  __snap_resolve_tier "$tier"
  local out; out=$(__snap_out_path "$label")
  local tmp; tmp=$(mktemp -t snap-raw).png
  if ! __snap_capture_raw "$tmp"; then rm -f "$tmp"; return 1; fi
  # magick: crop to exact region (x,y,w,h), reset page geometry, downscale to fit
  # max dim while preserving aspect, encode JPEG at the tier quality.
  magick "$tmp" -crop "${w}x${h}+${x}+${y}" +repage \
    -resize "${__SNAP_DIM}x${__SNAP_DIM}>" \
    -quality "$__SNAP_Q" "$out"
  rm -f "$tmp"
  echo "$out"
}

# --- snap_post_region: post-process an MCP-captured raw with crop ----------
# Same shape as snap_post, plus a bbox. Use when an MCP screenshot already
# wrote a full frame to disk and you want a cropped + downscaled JPEG.
snap_post_region() {
  local raw="$1"
  local label="$2"
  local bbox="$3"
  local tier="${4:-default}"
  if [ -z "$raw" ] || [ -z "$label" ] || [ -z "$bbox" ]; then
    echo "snap_post_region: usage: snap_post_region <raw_path> <label> <x,y,w,h> [tier]" >&2
    return 1
  fi
  if [ ! -s "$raw" ]; then
    echo "snap_post_region: raw missing or empty: $raw" >&2
    return 1
  fi
  local x y w h
  IFS=',' read -r x y w h <<< "$bbox"
  if [ -z "$x" ] || [ -z "$y" ] || [ -z "$w" ] || [ -z "$h" ]; then
    echo "snap_post_region: bbox must be 'x,y,w,h' (got '$bbox')" >&2
    return 1
  fi
  if ! command -v magick >/dev/null 2>&1; then
    echo "snap_post_region: ImageMagick (\`magick\`) not found. Install with: brew install imagemagick" >&2
    return 1
  fi
  __snap_resolve_tier "$tier"
  local out; out=$(__snap_out_path "$label")
  magick "$raw" -crop "${w}x${h}+${x}+${y}" +repage \
    -resize "${__SNAP_DIM}x${__SNAP_DIM}>" \
    -quality "$__SNAP_Q" "$out"
  rm -f "$raw"
  echo "$out"
}
