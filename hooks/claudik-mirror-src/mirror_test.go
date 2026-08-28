package main

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

func TestMatchGlob(t *testing.T) {
	cases := []struct {
		pattern, path string
		want          bool
	}{
		{"skills/**", "skills/inner-tool/SKILL.md", true},
		{"skills/**", "commands/inner-tool.md", false},
		{"skills/inner-tool/**", "skills/inner-tool/SKILL.md", true},
		{"skills/inner-tool/**", "skills/inner-tool", true},
		{"skills/inner-tool/**", "skills/inner-tool-extra/SKILL.md", false},
		{"skills/inner-tool", "skills/inner-tool/references/a.md", true},
		{"commands/me/private-cmd/**", "commands/me/private-cmd/backfill.md", true},
		{"commands/me/private-cmd.md", "commands/me/private-cmd.md", true},
		{"commands/me/private-cmd.md", "commands/me/private-cmd/backfill.md", false},
		{"skills/vendor-*/**", "skills/vendor-mcp/SKILL.md", true},
		{"CLAUDE.md", "CLAUDE.md", true},
		{"CLAUDE.md", "docs/CLAUDE.md", false},
	}
	for _, c := range cases {
		if got := matchGlob(c.pattern, c.path); got != c.want {
			t.Errorf("matchGlob(%q, %q) = %v, want %v", c.pattern, c.path, got, c.want)
		}
	}
}

func TestSelectedExcludeWins(t *testing.T) {
	m := &Manifest{
		Include: []string{"skills/**", "CLAUDE.md"},
		Exclude: []Rule{{Path: "skills/inner-tool/**", Why: "private agent"}},
	}
	if ok, _ := m.Selected("skills/git/commit/SKILL.md"); !ok {
		t.Error("included skill was dropped")
	}
	if ok, rule := m.Selected("skills/inner-tool/SKILL.md"); ok || rule.Why != "private agent" {
		t.Errorf("excluded skill survived: ok=%v rule=%+v", ok, rule)
	}
	if ok, _ := m.Selected("projects/x/memory/note.md"); ok {
		t.Error("memory note must never be selected")
	}
}

func denyRule(name, pattern string) Deny {
	return Deny{Name: name, Pattern: pattern, re: regexp.MustCompile(pattern)}
}

func TestScanFindsAndAllowsScoped(t *testing.T) {
	m := &Manifest{
		Deny:  []Deny{denyRule("client", "(?i)globex"), denyRule("credential", "AKIA[0-9A-Z]{16}")},
		Allow: []Allow{{Path: "hooks/claude-guards-src/**", Deny: "credential"}},
	}

	hits := scan(m, File{Path: "skills/x/SKILL.md", Content: []byte("line one\nthe Globex deal\n")})
	if len(hits) != 1 || hits[0].Line != 2 || hits[0].Deny != "client" {
		t.Fatalf("expected one client hit on line 2, got %+v", hits)
	}

	guard := File{Path: "hooks/claude-guards-src/commitsecrets.go", Content: []byte("AKIA0123456789ABCDEF\n")}
	if hits := scan(m, guard); len(hits) != 0 {
		t.Errorf("scoped allow ignored: %+v", hits)
	}
	other := File{Path: "skills/x/SKILL.md", Content: []byte("AKIA0123456789ABCDEF\n")}
	if hits := scan(m, other); len(hits) != 1 {
		t.Errorf("allow must be scoped to its path, got %+v", hits)
	}
}

func TestScanChecksThePathToo(t *testing.T) {
	m := &Manifest{Deny: []Deny{denyRule("client", "(?i)globex")}}
	hits := scan(m, File{Path: "skills/globex-pricing/SKILL.md", Content: []byte("nothing here\n")})
	if len(hits) != 1 || hits[0].Line != 0 {
		t.Fatalf("expected a path hit, got %+v", hits)
	}
}

func TestWriteRemovesDeselectedFiles(t *testing.T) {
	target := t.TempDir()
	stale := filepath.Join(target, "skills", "gone", "SKILL.md")
	if err := os.MkdirAll(filepath.Dir(stale), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(stale, []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	keepMe := filepath.Join(target, "README.md")
	if err := os.WriteFile(keepMe, []byte("hand written"), 0o644); err != nil {
		t.Fatal(err)
	}

	rep := &Report{Files: []File{{Path: "skills/kept/SKILL.md", Content: []byte("new"), Mode: 0o644}}}
	added, _, removed, err := Write(target, rep, []string{"README.md"})
	if err != nil {
		t.Fatal(err)
	}
	if added != 1 || removed != 1 {
		t.Errorf("added=%d removed=%d, want 1/1", added, removed)
	}
	if _, err := os.Stat(stale); !os.IsNotExist(err) {
		t.Error("stale mirrored file survived")
	}
	if _, err := os.Stat(filepath.Join(target, "skills", "gone")); !os.IsNotExist(err) {
		t.Error("empty directory not pruned")
	}
	if b, _ := os.ReadFile(keepMe); string(b) != "hand written" {
		t.Error("kept file was clobbered")
	}
}

func TestDenyFromStrings(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "private-strings.txt")
	if err := os.WriteFile(p, []byte("# comment\n203.0.113.7\n\n198.51.100.9\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	rule, err := denyFromStrings(p)
	if err != nil {
		t.Fatal(err)
	}
	if !rule.re.MatchString("host 203.0.113.7 is here") {
		t.Error("literal string not matched")
	}
	if rule.re.MatchString("203x0y113z7") {
		t.Error("dots must be escaped")
	}
}
