package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// ---------------------------------------------------------------------------
// /e2e skill guards (previously inline bash in ~/.claude/settings.json):
//   - Bash: block raw `xcrun simctl io … screenshot` and `screencapture` when
//     the session dir is an /e2e workspace (has a .e2e dir) — screenshots must
//     go through `snap`, which downsizes to JPEG.
//   - Read: block reading raw PNGs under .e2e/ — huge, context-hostile.
// ---------------------------------------------------------------------------

var (
	reRawSimShot    = regexp.MustCompile(`(^|[;&|][[:space:]]*)xcrun simctl io [^|;&]*screenshot`)
	reScreencapture = regexp.MustCompile(`(^|[;&|][[:space:]]*)screencapture([[:space:]]|$)`)
)

func guardE2EScreenshot(in *HookInput) {
	dir := in.CWD
	if dir == "" {
		dir, _ = os.Getwd()
	}
	if st, err := os.Stat(filepath.Join(dir, ".e2e")); err != nil || !st.IsDir() {
		return
	}
	cmd := strings.TrimLeft(in.ToolInput.Command, " \t\r\n")
	if reRawSimShot.MatchString(cmd) && !strings.Contains(cmd, "sips -Z") && !strings.Contains(cmd, "snap ") {
		fmt.Fprintln(os.Stderr, "BLOCKED: raw xcrun screenshot — use: source ~/.claude/skills/e2e/references/snap.sh && snap <label>")
		os.Exit(2)
	}
	if reScreencapture.MatchString(cmd) {
		fmt.Fprintln(os.Stderr, "BLOCKED: screencapture is banned by /e2e — use snap")
		os.Exit(2)
	}
}

func containsE2E(p string) bool { return strings.Contains(p, ".e2e") }
func hasPNG(p string) bool      { return strings.HasSuffix(p, ".png") }

func guardE2ERead(in *HookInput) {
	path := in.ToolInput.FilePath
	if containsE2E(path) && hasPNG(path) {
		fmt.Fprintln(os.Stderr, "BLOCKED: do not Read raw PNG screenshots under .e2e/ — use snap to make a JPEG first")
		os.Exit(2)
	}
}
