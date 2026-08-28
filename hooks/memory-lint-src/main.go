package main

import (
	"fmt"
	"os"
)

const version = "2.1.0"

func usage() {
	fmt.Fprintln(os.Stderr, `memorylint — fast Obsidian memory hygiene for Claude Code and Codex

Usage:
  memorylint check <memory-dir> [<memory-dir>...]
  memorylint fix [--dry-run] <memory-dir> [<memory-dir>...]
  memorylint new --home <dir> --type <type> --name <slug> --description <text>
  memorylint reindex [--write] [--team-index <path>] <memory-dir>
  memorylint graph [--similar] <memory-dir> [<memory-dir>...]
  memorylint hook

Compatibility:
  memorylint <memory-dir>
  memorylint --hook`)
}

func main() {
	args := os.Args[1:]
	if len(args) == 0 {
		usage()
		os.Exit(2)
	}
	var code int
	switch args[0] {
	case "-h", "--help", "help":
		usage()
		return
	case "-v", "--version", "version":
		fmt.Println("memorylint", version)
		return
	case "check":
		code = runCheck(args[1:])
	case "fix":
		code = runFix(args[1:])
	case "new":
		code = runNew(args[1:])
	case "reindex":
		code = runReindex(args[1:])
	case "graph":
		code = runGraph(args[1:])
	case "hook", "--hook":
		code = runHook()
	default:
		code = runCheck(args)
	}
	os.Exit(code)
}
