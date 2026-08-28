package main

import (
	"os"
	"path/filepath"
	"testing"
)

const (
	personalPath = "/Users/u/.claude/projects/-Users-u-Work-x/memory/project-note.md"
	teamPath     = "/Users/u/Work/x/.claude/memory/project-note.md"
)

func levels(issues []issue) map[string]string {
	out := map[string]string{}
	for _, i := range issues {
		out[i.Code+"/"+i.Message] = i.Level
	}
	return out
}

func maxLevel(issues []issue, code string) string {
	lvl := ""
	for _, i := range issues {
		if i.Code == code && (lvl == "" || i.Level == "ERROR") {
			lvl = i.Level
		}
	}
	return lvl
}

func TestPersonalHome(t *testing.T) {
	if !personalHome(personalPath) {
		t.Error("personal home not detected")
	}
	if personalHome(teamPath) {
		t.Error("team home misdetected as personal")
	}
}

func TestSecretPolicyByLocation(t *testing.T) {
	text := "wg peer at 10.8.0.10 and docker at 172.18.0.2\npublic box 203.0.113.10\nPASSWORD=pwfadmin1\ncontact lukas@example.io\ntoken ghp_abcdefghijklmnopqrstuv1234"

	// Personal home: private IPs vanish, public IP / creds / email warn, real tokens still ERROR.
	p := secretIssues(personalPath, text, builtinAllow)
	for k, lvl := range levels(p) {
		t.Logf("personal: %s = %s", k, lvl)
	}
	for _, i := range p {
		if i.Message == "raw IPv4 address: 10.8.0.10" || i.Message == "raw IPv4 address: 172.18.0.2" {
			t.Errorf("private IP flagged in personal home: %s", i.Message)
		}
	}
	if got := maxLevel(p, "security.secret"); got != "ERROR" {
		t.Errorf("GitHub token must stay ERROR in personal home (max level %q)", got)
	}
	warned := map[string]bool{}
	for _, i := range p {
		if i.Level == "WARN" {
			warned[i.Message] = true
		}
	}
	for _, want := range []string{"raw IPv4 address: 203.0.113.10", "credential assignment: PASSWORD=pwfadmin1", "email address: lukas@example.io"} {
		if !warned[want] {
			t.Errorf("expected WARN in personal home for %q", want)
		}
	}

	// Team home: everything is ERROR, private IPs included.
	tm := secretIssues(teamPath, text, builtinAllow)
	sawPrivate := false
	for _, i := range tm {
		if i.Level != "ERROR" {
			t.Errorf("team home finding not ERROR: %s", i.String())
		}
		if i.Message == "raw IPv4 address: 10.8.0.10" {
			sawPrivate = true
		}
	}
	if !sawPrivate {
		t.Error("team home must still flag private IPs")
	}
}

func TestMetadataFallbackAndPersonalLint(t *testing.T) {
	dir := t.TempDir()
	// Simulate a personal home path shape.
	home := filepath.Join(dir, ".claude", "projects", "-slug", "memory")
	if err := os.MkdirAll(home, 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(home, "project-x.md")
	long := ""
	for i := 0; i < 200; i++ {
		long += "line\n"
	}
	content := "---\nname: project-x\ndescription: harness-format note\nmetadata:\n  node_type: memory\n  type: project\n  status: active\n---\n\n" + long
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	n, err := parseNote(path)
	if err != nil {
		t.Fatal(err)
	}
	if n.Props.Type != "project" || n.Props.Status != "active" {
		t.Fatalf("metadata fallback failed: type=%q status=%q", n.Props.Type, n.Props.Status)
	}
	issues := lintNote(n, map[string]bool{"project-x": true})
	for _, i := range issues {
		if i.Code == "schema.type" || i.Code == "schema.status" {
			t.Errorf("harness-format schema should validate: %s", i.String())
		}
		if i.Code == "size.note" && i.Level != "WARN" {
			t.Errorf("oversize personal note should WARN, got %s", i.Level)
		}
	}

	// Missing status entirely (harness files often omit it) → fine in personal home.
	path2 := filepath.Join(home, "project-y.md")
	content2 := "---\nname: project-y\ndescription: d\nmetadata:\n  type: reference\n---\nbody\n"
	if err := os.WriteFile(path2, []byte(content2), 0o644); err != nil {
		t.Fatal(err)
	}
	n2, err := parseNote(path2)
	if err != nil {
		t.Fatal(err)
	}
	for _, i := range lintNote(n2, map[string]bool{"project-y": true}) {
		if i.Code == "schema.status" {
			t.Errorf("missing status must be tolerated in personal home: %s", i.String())
		}
	}
}
