package main

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf8"
)

// File is one rendered mirror entry: source path, final bytes, and how it got
// there (verbatim copy, override, or rewritten).
type File struct {
	Path     string
	Content  []byte
	Mode     os.FileMode
	Override string
	Rewrites []string
	Binary   bool
}

// Violation is a deny-rule hit that survived into the rendered tree. Any
// violation fails the build — the operator must exclude the file, write an
// override, or add a scoped allow.
type Violation struct {
	Path  string
	Deny  string
	Why   string
	Line  int
	Match string
	Text  string
}

type Report struct {
	Files      []File
	Skipped    []SkipRecord
	Violations []Violation
	Unreadable []SkipRecord
}

type SkipRecord struct {
	Path string
	Why  string
}

// Render walks every tracked file in the source repo and produces the mirror
// tree in memory. Nothing is written until the caller is satisfied with the
// report, so `check` and `build` share one code path.
func Render(repo string, m *Manifest) (*Report, error) {
	tracked, err := gitTrackedFiles(repo)
	if err != nil {
		return nil, err
	}
	rep := &Report{}
	for _, rel := range tracked {
		ok, rule := m.Selected(rel)
		if !ok {
			why := rule.Why
			if rule.Path != "" && why != "" {
				why = fmt.Sprintf("%s (%s)", why, rule.Path)
			}
			rep.Skipped = append(rep.Skipped, SkipRecord{Path: rel, Why: why})
			continue
		}

		src := filepath.Join(repo, rel)
		f := File{Path: rel, Mode: 0o644}

		if ov, has := m.OverrideFor(rel); has {
			data, err := os.ReadFile(filepath.Join(repo, ov.From))
			if err != nil {
				return nil, fmt.Errorf("override %s: %w", ov.From, err)
			}
			f.Content = data
			f.Override = ov.From
		} else {
			info, err := os.Lstat(src)
			if err != nil {
				rep.Unreadable = append(rep.Unreadable, SkipRecord{Path: rel, Why: err.Error()})
				continue
			}
			if info.Mode()&os.ModeSymlink != 0 {
				// A symlink in the mirror would point at a private absolute path
				// on this Mac. Selecting one is always a manifest bug.
				rep.Unreadable = append(rep.Unreadable, SkipRecord{Path: rel, Why: "symlink — exclude it or add an override"})
				continue
			}
			data, err := os.ReadFile(src)
			if err != nil {
				rep.Unreadable = append(rep.Unreadable, SkipRecord{Path: rel, Why: err.Error()})
				continue
			}
			f.Content = data
			if info.Mode()&0o111 != 0 {
				f.Mode = 0o755
			}
		}

		f.Binary = !utf8.Valid(f.Content) || bytes.IndexByte(f.Content, 0) >= 0
		if !f.Binary {
			for _, rw := range m.Rewrite {
				if bytes.Contains(f.Content, []byte(rw.From)) {
					f.Content = bytes.ReplaceAll(f.Content, []byte(rw.From), []byte(rw.To))
					f.Rewrites = append(f.Rewrites, rw.From+" → "+rw.To)
				}
			}
			rep.Violations = append(rep.Violations, scan(m, f)...)
		}
		rep.Files = append(rep.Files, f)
	}
	sort.Slice(rep.Files, func(i, j int) bool { return rep.Files[i].Path < rep.Files[j].Path })
	sort.Slice(rep.Violations, func(i, j int) bool {
		if rep.Violations[i].Path != rep.Violations[j].Path {
			return rep.Violations[i].Path < rep.Violations[j].Path
		}
		return rep.Violations[i].Line < rep.Violations[j].Line
	})
	return rep, nil
}

// scan applies every deny rule to a rendered file, honouring scoped allows.
func scan(m *Manifest, f File) []Violation {
	var out []Violation
	lines := strings.Split(string(f.Content), "\n")
	for _, d := range m.Deny {
		if m.allowed(f.Path, d.Name) {
			continue
		}
		if m := d.re.FindString(f.Path); m != "" && !d.skipped(m) {
			out = append(out, Violation{Path: f.Path, Deny: d.Name, Why: d.Why, Line: 0, Match: m, Text: "(in the file path)"})
		}
		for i, line := range lines {
			for _, m := range d.re.FindAllString(line, -1) {
				if d.skipped(m) {
					continue
				}
				out = append(out, Violation{
					Path:  f.Path,
					Deny:  d.Name,
					Why:   d.Why,
					Line:  i + 1,
					Match: m,
					Text:  trim(line),
				})
				break
			}
		}
	}
	return out
}

func trim(s string) string {
	s = strings.TrimSpace(s)
	if len(s) > 120 {
		return s[:117] + "…"
	}
	return s
}

// Write materialises the rendered tree into the target directory, deleting any
// previously mirrored file that is no longer selected. `.git` and anything
// listed in keep is never touched.
func Write(target string, rep *Report, keep []string) (added, changed, removed int, err error) {
	want := map[string]bool{}
	for _, f := range rep.Files {
		want[f.Path] = true
	}
	kept := map[string]bool{}
	for _, k := range keep {
		kept[k] = true
	}

	existing, err := walkTree(target)
	if err != nil {
		return 0, 0, 0, err
	}
	for _, rel := range existing {
		if want[rel] || kept[rel] {
			continue
		}
		if err := os.Remove(filepath.Join(target, rel)); err != nil {
			return added, changed, removed, err
		}
		removed++
	}

	for _, f := range rep.Files {
		dst := filepath.Join(target, f.Path)
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			return added, changed, removed, err
		}
		old, readErr := os.ReadFile(dst)
		switch {
		case readErr != nil:
			added++
		case bytes.Equal(old, f.Content):
			continue
		default:
			changed++
		}
		if err := os.WriteFile(dst, f.Content, f.Mode); err != nil {
			return added, changed, removed, err
		}
	}
	pruneEmptyDirs(target)
	return added, changed, removed, nil
}

func walkTree(root string) ([]string, error) {
	var out []string
	err := filepath.Walk(root, func(p string, info os.FileInfo, err error) error {
		if err != nil {
			if os.IsNotExist(err) {
				return nil
			}
			return err
		}
		rel, relErr := filepath.Rel(root, p)
		if relErr != nil {
			return relErr
		}
		if rel == "." {
			return nil
		}
		if info.IsDir() {
			if rel == ".git" {
				return filepath.SkipDir
			}
			return nil
		}
		out = append(out, rel)
		return nil
	})
	return out, err
}

func pruneEmptyDirs(root string) {
	for i := 0; i < 8; i++ {
		pruned := false
		_ = filepath.Walk(root, func(p string, info os.FileInfo, err error) error {
			if err != nil || !info.IsDir() || p == root {
				return nil
			}
			if rel, _ := filepath.Rel(root, p); rel == ".git" || strings.HasPrefix(rel, ".git/") {
				return filepath.SkipDir
			}
			entries, err := os.ReadDir(p)
			if err == nil && len(entries) == 0 {
				if os.Remove(p) == nil {
					pruned = true
				}
			}
			return nil
		})
		if !pruned {
			return
		}
	}
}
