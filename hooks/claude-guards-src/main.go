// claude-guards — single-binary PreToolUse enforcement for the hard bans in
// ~/.claude/CLAUDE.md, replacing guard-destructive.sh, guard-commit-secrets.sh
// and the inline /e2e screenshot guards.
//
// CLAUDE.md is context, not enforcement: Claude reads it and *usually*
// complies. These bans are incident-born and must hold unconditionally,
// including under bypassPermissions and inside subagents (where skills don't
// even load). One compiled process per Bash call keeps the cost at single-digit
// milliseconds regardless of system load — no jq/grep fork storms.
//
// Failure contract: fail OPEN on malformed input (a guard that blocks
// everything on a parse error bricks the session), fail CLOSED only on a
// positive rule match. Exit 2 blocks; stderr becomes the reason Claude sees.
package main

import (
	"fmt"
	"os"
)

const version = "1.1.0"

func usage() {
	fmt.Fprintln(os.Stderr, `claude-guards — fast PreToolUse guard hooks for Claude Code

Usage:
  claude-guards bash                          PreToolUse:Bash — destructive + e2e-screenshot + commit-secrets
  claude-guards read                          PreToolUse:Read — block raw .e2e PNG reads
  claude-guards refresh-visibility <dir> <cache-file>
                                              internal: background repo-visibility refresh
  claude-guards version`)
}

func main() {
	args := os.Args[1:]
	if len(args) == 0 {
		usage()
		os.Exit(2)
	}
	switch args[0] {
	case "-h", "--help", "help":
		usage()
	case "-v", "--version", "version":
		fmt.Println("claude-guards", version)
	case "bash":
		in, err := readInput(os.Stdin)
		if err != nil {
			return // fail open: malformed payload
		}
		// Cheapest first; commit-secrets last (it may do git/network IO).
		guardDestructive(in)
		guardEnvDump(in)
		guardE2EScreenshot(in)
		guardCommitSecrets(in)
	case "read":
		in, err := readInput(os.Stdin)
		if err != nil {
			return
		}
		guardE2ERead(in)
	case "refresh-visibility":
		if len(args) == 3 {
			refreshVisibility(args[1], args[2])
		}
	default:
		usage()
		os.Exit(2)
	}
}

// deny prints the block reason for Claude and exits 2.
func deny(source, msg, escapeHatch string) {
	fmt.Fprintf(os.Stderr, "🚨 BLOCKED by ~/.claude/hooks/claude-guards (%s)\n\n%s\n\n%s\n", source, msg, escapeHatch)
	os.Exit(2)
}
