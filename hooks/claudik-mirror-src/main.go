// claudik-mirror renders the public subset of the private ~/.claude repo into a
// standalone mirror repository. The manifest is the source of truth; a deny scan
// over the RENDERED tree is the contract that keeps private material out.
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const usage = `claudik-mirror — render the public subset of ~/.claude into a mirror repo

Usage:
  claudik-mirror check                 render + deny-scan, write nothing (exit 1 on violation)
  claudik-mirror build                 render into the target directory
  claudik-mirror sync [--push]         build, commit in the mirror, optionally push
  claudik-mirror status                what the manifest selects, and the mirror's last commit
  claudik-mirror install-hook          install the private repo's pre-push hook
  claudik-mirror uninstall-hook        remove it

Flags:
  --repo <path>       private source repo (default: $CLAUDE_HOME or ~/.claude)
  --manifest <path>   manifest file (default: <repo>/mirror/manifest.json)
  --target <path>     override the manifest's target directory
  --verbose           list every selected and skipped file
`

func main() {
	if len(os.Args) < 2 {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}
	cmd := os.Args[1]

	fs := flag.NewFlagSet(cmd, flag.ExitOnError)
	repo := fs.String("repo", defaultRepo(), "private source repo")
	manifestPath := fs.String("manifest", "", "manifest path")
	target := fs.String("target", "", "override target directory")
	push := fs.Bool("push", false, "push the mirror after committing")
	verbose := fs.Bool("verbose", false, "list every file")
	fs.Usage = func() { fmt.Fprint(os.Stderr, usage) }
	_ = fs.Parse(os.Args[2:])

	if *manifestPath == "" {
		*manifestPath = filepath.Join(*repo, "mirror", "manifest.json")
	}

	switch cmd {
	case "check", "build", "sync", "status":
		os.Exit(run(cmd, *repo, *manifestPath, *target, *push, *verbose))
	case "install-hook":
		os.Exit(installHook(*repo, true))
	case "uninstall-hook":
		os.Exit(installHook(*repo, false))
	case "-h", "--help", "help":
		fmt.Print(usage)
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n\n%s", cmd, usage)
		os.Exit(2)
	}
}

func defaultRepo() string {
	if v := os.Getenv("CLAUDE_HOME"); v != "" {
		return v
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".claude")
}

func run(cmd, repo, manifestPath, targetOverride string, push, verbose bool) int {
	m, err := LoadManifest(manifestPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "manifest: %v\n", err)
		return 1
	}
	if targetOverride != "" {
		m.Target = expandHome(targetOverride)
	}

	rep, err := Render(repo, m)
	if err != nil {
		fmt.Fprintf(os.Stderr, "render: %v\n", err)
		return 1
	}

	printSummary(rep, m, verbose)

	if len(rep.Unreadable) > 0 {
		fmt.Println()
		fmt.Println("⚠️  selected but not renderable — fix the manifest:")
		for _, s := range rep.Unreadable {
			fmt.Printf("   %s — %s\n", s.Path, s.Why)
		}
		return 1
	}

	if len(rep.Violations) > 0 {
		printViolations(rep)
		fmt.Printf("\n🚨 %d deny hit(s) in %d file(s) — nothing written.\n", len(rep.Violations), countPaths(rep.Violations))
		fmt.Println("   Resolve each one: exclude the file, write an override, or add a scoped allow.")
		return 1
	}
	fmt.Println("\n✅ deny scan clean.")

	if cmd == "check" {
		return 0
	}
	if cmd == "status" {
		fmt.Printf("\nTarget: %s\n", m.Target)
		if out, err := git(m.Target, "log", "-1", "--oneline"); err == nil {
			fmt.Printf("Last mirror commit: %s", out)
		} else {
			fmt.Println("Mirror repo not initialised yet (run `claudik-mirror sync`).")
		}
		return 0
	}

	if err := ensureRepo(m.Target); err != nil {
		fmt.Fprintf(os.Stderr, "init mirror: %v\n", err)
		return 1
	}
	added, changed, removed, err := Write(m.Target, rep, []string{".gitignore", "README.md", "LICENSE"})
	if err != nil {
		fmt.Fprintf(os.Stderr, "write: %v\n", err)
		return 1
	}
	fmt.Printf("\n📦 %s — %d added, %d changed, %d removed\n", m.Target, added, changed, removed)

	if cmd == "build" {
		return 0
	}

	dirty, err := hasChanges(m.Target)
	if err != nil {
		fmt.Fprintf(os.Stderr, "status: %v\n", err)
		return 1
	}
	if !dirty {
		fmt.Println("Mirror already up to date — nothing to commit.")
		return 0
	}
	msg := fmt.Sprintf("sync: mirror %s", gitShortSHA(repo))
	if err := commitAll(m.Target, msg); err != nil {
		fmt.Fprintf(os.Stderr, "commit: %v\n", err)
		return 1
	}
	fmt.Printf("Committed in mirror: %s\n", msg)

	if push {
		if !hasRemote(m.Target) {
			fmt.Println("⚠️  no remote configured on the mirror — commit kept local.")
			return 0
		}
		if out, err := git(m.Target, "push", "-u", "origin", "HEAD"); err != nil {
			fmt.Fprintf(os.Stderr, "push: %v\n%s\n", err, out)
			return 1
		}
		fmt.Println("Pushed.")
	}
	return 0
}

func printSummary(rep *Report, m *Manifest, verbose bool) {
	fmt.Printf("Selected %d file(s); skipped %d.\n", len(rep.Files), len(rep.Skipped))
	if !verbose {
		byReason := map[string]int{}
		for _, s := range rep.Skipped {
			byReason[s.Why]++
		}
		reasons := make([]string, 0, len(byReason))
		for r := range byReason {
			reasons = append(reasons, r)
		}
		sort.Slice(reasons, func(i, j int) bool { return byReason[reasons[i]] > byReason[reasons[j]] })
		for _, r := range reasons {
			fmt.Printf("   %4d  %s\n", byReason[r], r)
		}
		return
	}
	fmt.Println("\n-- selected --")
	for _, f := range rep.Files {
		note := ""
		if f.Override != "" {
			note = "  [override " + f.Override + "]"
		}
		if len(f.Rewrites) > 0 {
			note += "  [rewrite " + strings.Join(f.Rewrites, ", ") + "]"
		}
		fmt.Printf("   %s%s\n", f.Path, note)
	}
	fmt.Println("\n-- skipped --")
	for _, s := range rep.Skipped {
		fmt.Printf("   %s — %s\n", s.Path, s.Why)
	}
}

func printViolations(rep *Report) {
	fmt.Println("\n-- deny hits --")
	current := ""
	for _, v := range rep.Violations {
		if v.Path != current {
			current = v.Path
			fmt.Printf("\n%s\n", current)
		}
		fmt.Printf("   L%-4d [%s] %q  %s\n", v.Line, v.Deny, v.Match, v.Text)
	}
}

func countPaths(vs []Violation) int {
	seen := map[string]bool{}
	for _, v := range vs {
		seen[v.Path] = true
	}
	return len(seen)
}

const hookMarker = "# claudik-mirror pre-push"

func installHook(repo string, install bool) int {
	path := filepath.Join(repo, ".git", "hooks", "pre-push")
	if !install {
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			fmt.Fprintf(os.Stderr, "remove hook: %v\n", err)
			return 1
		}
		fmt.Println("pre-push hook removed.")
		return 0
	}
	if existing, err := os.ReadFile(path); err == nil && !strings.Contains(string(existing), hookMarker) {
		fmt.Fprintf(os.Stderr, "🚨 %s exists and is not ours — merge by hand.\n", path)
		return 1
	}
	body := fmt.Sprintf(`#!/bin/sh
%s
# Mirrors the public subset to the public repo on every push of the private one.
# Skip once with CLAUDIK_MIRROR_SKIP=1; the push itself never fails on a mirror
# error, but the deny-scan output is printed loudly.
[ "${CLAUDIK_MIRROR_SKIP:-0}" = "1" ] && exit 0
BIN="$HOME/.local/bin/claudik-mirror"
[ -x "$BIN" ] || exit 0
if ! "$BIN" sync --push; then
  echo "⚠️  claudik-mirror sync failed — the public mirror is NOT updated." >&2
fi
exit 0
`, hookMarker)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "install hook: %v\n", err)
		return 1
	}
	if err := os.WriteFile(path, []byte(body), 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "install hook: %v\n", err)
		return 1
	}
	fmt.Printf("Installed %s\n", path)
	return 0
}
