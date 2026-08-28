package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type hookPayload struct {
	HookEventName string `json:"hook_event_name"`
	ToolName      string `json:"tool_name"`
	Cwd           string `json:"cwd"`
	ToolInput     struct {
		FilePath  string `json:"file_path"`
		Path      string `json:"path"`
		Content   string `json:"content"`
		NewString string `json:"new_string"`
		Command   string `json:"command"`
	} `json:"tool_input"`
}

var patchPathRE = regexp.MustCompile(`(?m)^\*\*\* (?:Add|Update|Delete) File: (.+\.md)\s*$`)

func memoryPath(path, cwd string) (string, bool) {
	path = strings.TrimSpace(path)
	if path == "" || !strings.HasSuffix(strings.ToLower(path), ".md") {
		return "", false
	}
	if !filepath.IsAbs(path) && cwd != "" {
		path = filepath.Join(cwd, path)
	}
	path = filepath.Clean(path)
	slash := filepath.ToSlash(path)
	return path, strings.Contains(slash, "/memory/") || strings.HasSuffix(slash, "/memory")
}

func hookTargets(p hookPayload) []string {
	seen := map[string]bool{}
	var out []string
	for _, candidate := range []string{p.ToolInput.FilePath, p.ToolInput.Path} {
		if path, ok := memoryPath(candidate, p.Cwd); ok && !seen[path] {
			seen[path] = true
			out = append(out, path)
		}
	}
	for _, m := range patchPathRE.FindAllStringSubmatch(p.ToolInput.Command, -1) {
		if path, ok := memoryPath(m[1], p.Cwd); ok && !seen[path] {
			seen[path] = true
			out = append(out, path)
		}
	}
	return out
}

func addedPatchText(command string) string {
	var added []string
	for _, line := range strings.Split(command, "\n") {
		if strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++") {
			added = append(added, strings.TrimPrefix(line, "+"))
		}
	}
	return strings.Join(added, "\n")
}

func runHook() int {
	raw, err := io.ReadAll(os.Stdin)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 0
	}
	var p hookPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return 0
	}
	targets := hookTargets(p)
	if len(targets) == 0 {
		return 0
	}
	// Pre-write checks operate on proposed content or the entire Codex patch.
	if p.HookEventName == "PreToolUse" || p.HookEventName == "" {
		content := p.ToolInput.Content + "\n" + p.ToolInput.NewString + "\n" + addedPatchText(p.ToolInput.Command)
		allow := builtinAllow
		if len(targets) > 0 {
			if loaded, e := loadAllow(filepath.Dir(targets[0])); e == nil {
				allow = loaded
			}
		}
		for _, f := range secretIssues(targets[0], content, allow) {
			if f.Level == "ERROR" {
				fmt.Fprintln(os.Stderr, "memorylint blocked write:", f.String())
				return 2
			}
		}
		return 0
	}
	// Post-write checks validate each existing changed note. Full-home recall checks stay in CI/check.
	failed := false
	for _, path := range targets {
		if filepath.Base(path) == "MEMORY.md" {
			continue
		}
		if _, err := os.Stat(path); os.IsNotExist(err) {
			continue
		}
		n, err := parseNote(path)
		if err != nil {
			fmt.Fprintf(os.Stderr, "memorylint: %s: %v\n", path, err)
			failed = true
			continue
		}
		names := map[string]bool{strings.TrimSuffix(n.File, ".md"): true}
		issues := lintNote(n, names)
		allow, _ := loadAllow(filepath.Dir(path))
		issues = append(issues, secretIssues(path, string(n.Raw), allow)...)
		for _, i := range issues {
			if i.Level == "ERROR" {
				fmt.Fprintln(os.Stderr, i.String())
				failed = true
			}
		}
	}
	if failed {
		return 2
	}
	return 0
}
