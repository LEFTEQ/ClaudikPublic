package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNormalizeLegacyFrontmatter(t *testing.T) {
	d := t.TempDir()
	p := filepath.Join(d, "test-note.md")
	raw := []byte("---\nname: old\ndescription: Use when testing migration.\nmetadata:\n  type: reference\n  modified: 2026-08-20\n---\n# Test\n")
	if err := os.WriteFile(p, raw, 0644); err != nil {
		t.Fatal(err)
	}
	got, changed, err := normalize(p)
	if err != nil {
		t.Fatal(err)
	}
	if !changed {
		t.Fatal("expected change")
	}
	normalized := string(got)
	for _, want := range []string{"name: test-note", "type: reference", "status: active", "last-verified: \"2026-08-20\""} {
		if !strings.Contains(normalized, want) {
			t.Errorf("missing %q in:\n%s", want, normalized)
		}
	}
}

func TestHookTargetsCodexPatch(t *testing.T) {
	p := hookPayload{HookEventName: "PreToolUse", ToolName: "apply_patch", Cwd: "/repo"}
	p.ToolInput.Command = "*** Begin Patch\n*** Update File: .claude/memory/foo.md\n@@\n"
	got := hookTargets(p)
	if len(got) != 1 || got[0] != "/repo/.claude/memory/foo.md" {
		t.Fatalf("unexpected targets %#v", got)
	}
}

func TestHookPayloadJSONShape(t *testing.T) {
	raw := []byte(`{"hook_event_name":"PreToolUse","tool_name":"Write","cwd":"/repo","tool_input":{"file_path":"/repo/.claude/memory/x.md","content":"safe"}}`)
	var p hookPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		t.Fatal(err)
	}
	if len(hookTargets(p)) != 1 {
		t.Fatal("target not found")
	}
}

func TestAddedPatchTextIgnoresRemovedSecrets(t *testing.T) {
	patch := "*** Begin Patch\n*** Update File: .claude/memory/x.md\n@@\n-ghp_removedsecret123456789012345\n+safe replacement\n*** End Patch"
	got := addedPatchText(patch)
	if strings.Contains(got, "ghp_") || got != "safe replacement" {
		t.Fatalf("unexpected added patch text %q", got)
	}
}

func TestSecretScannerAllowsFixtures(t *testing.T) {
	if got := secretIssues("x", "person@fixit.test and demo@example.com", builtinAllow); len(got) != 0 {
		t.Fatalf("fixture flagged: %#v", got)
	}
	if got := secretIssues("x", "real.person@company.cz", builtinAllow); len(got) != 1 {
		t.Fatalf("real email not flagged: %#v", got)
	}
}

func TestRenderRoundTrip(t *testing.T) {
	n := &note{Props: properties{Name: "x", Description: "Use when x.", Type: "project", Status: "active"}, Body: "# X\n\nBody\n"}
	b, err := renderNote(n)
	if err != nil {
		t.Fatal(err)
	}
	p := filepath.Join(t.TempDir(), "x.md")
	if err := os.WriteFile(p, b, 0644); err != nil {
		t.Fatal(err)
	}
	got, err := parseNote(p)
	if err != nil {
		t.Fatal(err)
	}
	if got.Props.Name != n.Props.Name || got.Props.Description != n.Props.Description || got.Props.Type != n.Props.Type || got.Props.Status != n.Props.Status {
		t.Fatalf("roundtrip mismatch %#v %#v", got.Props, n.Props)
	}
}
