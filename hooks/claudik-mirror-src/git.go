package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func git(dir string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

func gitTrackedFiles(repo string) ([]string, error) {
	out, err := git(repo, "ls-files", "-z")
	if err != nil {
		return nil, err
	}
	var files []string
	for _, p := range strings.Split(out, "\x00") {
		if p != "" {
			files = append(files, p)
		}
	}
	return files, nil
}

func gitShortSHA(repo string) string {
	out, err := git(repo, "rev-parse", "--short", "HEAD")
	if err != nil {
		return "unknown"
	}
	return strings.TrimSpace(out)
}

// ensureRepo initialises the mirror as its own repository. The public history is
// deliberately independent — private history is never imported, only file state.
func ensureRepo(target string) error {
	if err := os.MkdirAll(target, 0o755); err != nil {
		return err
	}
	if _, err := os.Stat(filepath.Join(target, ".git")); err == nil {
		return nil
	}
	if _, err := git(target, "init", "-b", "main"); err != nil {
		return err
	}
	return nil
}

func hasChanges(target string) (bool, error) {
	out, err := git(target, "status", "--porcelain")
	if err != nil {
		return false, err
	}
	return strings.TrimSpace(out) != "", nil
}

func commitAll(target, message string) error {
	if _, err := git(target, "add", "-A"); err != nil {
		return err
	}
	_, err := git(target, "commit", "-m", message)
	return err
}

func hasRemote(target string) bool {
	out, err := git(target, "remote")
	return err == nil && strings.TrimSpace(out) != ""
}
