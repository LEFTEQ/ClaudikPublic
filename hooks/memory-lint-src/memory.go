package main

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"fmt"
	"net/netip"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

const (
	maxIndexLines = 100
	maxIndexBytes = 25_000
	maxNoteLines  = 150
)

var validTypes = map[string]bool{"user": true, "feedback": true, "project": true, "reference": true}
var validStatuses = map[string]bool{"active": true, "superseded": true}

type properties struct {
	Name         string   `yaml:"name"`
	Description  string   `yaml:"description"`
	Type         string   `yaml:"type"`
	Status       string   `yaml:"status"`
	Tags         []string `yaml:"tags,omitempty"`
	Aliases      []string `yaml:"aliases,omitempty"`
	LastVerified string   `yaml:"last-verified,omitempty"`
	// Harness-native format nests type/status under metadata; accepted as a
	// fallback so both schemas validate.
	Metadata struct {
		Type   string `yaml:"type"`
		Status string `yaml:"status"`
	} `yaml:"metadata,omitempty"`
}

// personalHome reports whether path lives in a local-only personal memory home
// (~/.claude/projects/<slug>/memory/) as opposed to a committed team home
// (<repo>/.claude/memory/). Personal homes never leave the machine, so private
// infra addresses and dev credentials are hygiene warnings there, not leaks.
func personalHome(path string) bool {
	return strings.Contains(filepath.ToSlash(path), "/.claude/projects/")
}

type note struct {
	Path  string
	File  string
	Dir   string
	Props properties
	Body  string
	Raw   []byte
}

type issue struct {
	Level   string
	Path    string
	Line    int
	Code    string
	Message string
}

func (i issue) String() string {
	where := i.Path
	if i.Line > 0 {
		where = fmt.Sprintf("%s:%d", where, i.Line)
	}
	return fmt.Sprintf("%s %s [%s] %s", i.Level, where, i.Code, i.Message)
}

var frontmatterRE = regexp.MustCompile(`(?s)\A---\r?\n(.*?)\r?\n---\r?\n?`)
var markdownLinkRE = regexp.MustCompile(`\[[^\]]+\]\(([^)#?]+\.md)(?:#[^)]*)?\)`)
var wikiLinkRE = regexp.MustCompile(`\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]`)
var wordRE = regexp.MustCompile(`[a-z0-9]{3,}`)

func countLines(b []byte) int {
	if len(b) == 0 {
		return 0
	}
	n := bytes.Count(b, []byte("\n"))
	if b[len(b)-1] != '\n' {
		n++
	}
	return n
}

func parseNote(path string) (*note, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	m := frontmatterRE.FindSubmatchIndex(raw)
	if m == nil {
		return &note{Path: path, File: filepath.Base(path), Dir: filepath.Dir(path), Raw: raw, Body: string(raw)}, fmt.Errorf("missing YAML frontmatter")
	}
	var p properties
	if err := yaml.Unmarshal(raw[m[2]:m[3]], &p); err != nil {
		return nil, fmt.Errorf("invalid YAML: %w", err)
	}
	if p.Type == "" {
		p.Type = p.Metadata.Type
	}
	if p.Status == "" {
		p.Status = p.Metadata.Status
	}
	return &note{Path: path, File: filepath.Base(path), Dir: filepath.Dir(path), Props: p, Body: string(raw[m[1]:]), Raw: raw}, nil
}

func renderNote(n *note) ([]byte, error) {
	front, err := yaml.Marshal(n.Props)
	if err != nil {
		return nil, err
	}
	body := strings.TrimLeft(n.Body, "\r\n")
	return []byte("---\n" + string(front) + "---\n\n" + strings.TrimRight(body, "\r\n") + "\n"), nil
}

func atomicWrite(path string, data []byte) error {
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".memorylint-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if _, err = tmp.Write(data); err == nil {
		err = tmp.Sync()
	}
	if closeErr := tmp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	if err = os.Chmod(tmpName, info.Mode()); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}

func markdownFiles(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var out []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if strings.HasSuffix(e.Name(), ".md") && e.Name() != "MEMORY.md" {
			out = append(out, filepath.Join(dir, e.Name()))
		}
	}
	sort.Strings(out)
	return out, nil
}

func lintNote(n *note, names map[string]bool) []issue {
	var out []issue
	add := func(level, code, message string) { out = append(out, issue{level, n.Path, 0, code, message}) }
	stem := strings.TrimSuffix(n.File, ".md")
	if n.Props.Name == "" {
		add("ERROR", "schema.name", "missing top-level name")
	} else if n.Props.Name != stem {
		add("ERROR", "schema.name", fmt.Sprintf("name %q must match filename %q", n.Props.Name, stem))
	}
	if strings.TrimSpace(n.Props.Description) == "" {
		add("ERROR", "schema.description", "missing top-level description")
	}
	personal := personalHome(n.Path)
	if !validTypes[n.Props.Type] {
		add("ERROR", "schema.type", "type must be user, feedback, project, or reference")
	}
	if !validStatuses[n.Props.Status] {
		// Harness-native notes carry no status; local-only homes default to active.
		if !(personal && n.Props.Status == "") {
			add("ERROR", "schema.status", "status must be active or superseded")
		}
	}
	if n.Props.Status == "superseded" && !strings.Contains(strings.ToLower(n.Body), "supersed") && !strings.Contains(n.Body, "[[") {
		add("ERROR", "schema.replacement", "superseded note must identify its replacement")
	}
	if n.Props.LastVerified != "" {
		if _, err := time.Parse("2006-01-02", n.Props.LastVerified); err != nil {
			add("ERROR", "schema.last-verified", "last-verified must be YYYY-MM-DD")
		}
	}
	if countLines(n.Raw) > maxNoteLines {
		// Local-only developer notes may legitimately run long; committed team
		// notes stay hard-capped (they load into every teammate's recall).
		level := "ERROR"
		if personal {
			level = "WARN"
		}
		add(level, "size.note", fmt.Sprintf("%d lines exceeds %d", countLines(n.Raw), maxNoteLines))
	}
	for _, m := range wikiLinkRE.FindAllStringSubmatch(n.Body, -1) {
		target := strings.TrimSpace(m[1])
		if strings.Contains(target, "/") {
			target = filepath.Base(target)
		}
		if !names[strings.TrimSuffix(target, ".md")] {
			add("WARN", "link.wiki", fmt.Sprintf("unresolved wikilink [[%s]]", m[1]))
		}
	}
	return out
}

type secretPattern struct {
	re  *regexp.Regexp
	why string
	// localLevel is the finding level in a personal (local-only) home; "" keeps
	// ERROR everywhere. Real token material blocks unconditionally — that
	// belongs in the onyx vault, never in a note. Addresses, emails and dev
	// credential assignments are hygiene warnings locally: the file never
	// leaves the machine, and the risk is only a later copy into a repo.
	localLevel string
	ipv4       bool // hit is an IPv4 literal: private/loopback ranges are skipped in personal homes
}

var secretPatterns = []secretPattern{
	{re: regexp.MustCompile(`\bvk[asl]_[A-Za-z0-9]{8,}`), why: "vitrinka token"},
	{re: regexp.MustCompile(`\bvinv_[A-Za-z0-9]{8,}`), why: "invite token"},
	{re: regexp.MustCompile(`\bsk_(?:live|test)_[A-Za-z0-9]{8,}`), why: "provider secret key"},
	{re: regexp.MustCompile(`\bsk-[A-Za-z0-9-]{24,}`), why: "API secret key"},
	{re: regexp.MustCompile(`\bAKIA[0-9A-Z]{16}\b`), why: "AWS access key"},
	{re: regexp.MustCompile(`\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}`), why: "GitHub token"},
	{re: regexp.MustCompile(`\bgithub_pat_[A-Za-z0-9_]{20,}`), why: "GitHub token"},
	{re: regexp.MustCompile(`AGE-SECRET-KEY-1[A-Z0-9]{20,}`), why: "age secret key"},
	{re: regexp.MustCompile(`-----BEGIN [A-Z ]*PRIVATE KEY-----`), why: "private key"},
	{re: regexp.MustCompile(`(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{20,}`), why: "bearer token"},
	{re: regexp.MustCompile(`(?i)\b(?:password|passwd|api[_-]?key|client[_-]?secret)\s*[:=]\s*['\"]?[A-Za-z0-9!@#%^&*_+/-]{8,}`), why: "credential assignment", localLevel: "WARN"},
	{re: regexp.MustCompile(`\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b`), why: "raw IPv4 address", localLevel: "WARN", ipv4: true},
	{re: regexp.MustCompile(`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`), why: "email address", localLevel: "WARN"},
}

var cgnatPrefix = netip.MustParsePrefix("100.64.0.0/10")

// localIP reports whether an address can only ever point inside the user's own
// networks: RFC1918/ULA, loopback, link-local, unspecified, or CGNAT (the
// WireGuard-mesh range). These carry zero secrecy in a machine-local note.
func localIP(addr netip.Addr) bool {
	return addr.IsPrivate() || addr.IsLoopback() || addr.IsLinkLocalUnicast() ||
		addr.IsUnspecified() || cgnatPrefix.Contains(addr)
}

var builtinAllow = []*regexp.Regexp{
	regexp.MustCompile(`(?i)^[^@\s]+@(?:example\.(?:com|org)|fixit\.test|e2e-fixit\.test)$`),
	regexp.MustCompile(`^(?:127\.0\.0\.1|0\.0\.0\.0)$`),
}
var ipv6Candidate = regexp.MustCompile(`[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{0,4}){2,8}`)

func loadAllow(dir string) ([]*regexp.Regexp, error) {
	out := append([]*regexp.Regexp{}, builtinAllow...)
	f, err := os.Open(filepath.Join(dir, ".memory-lint-allow"))
	if os.IsNotExist(err) {
		return out, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()
	s := bufio.NewScanner(f)
	for s.Scan() {
		line := strings.TrimSpace(s.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		re, err := regexp.Compile(line)
		if err != nil {
			return nil, fmt.Errorf("bad allowlist regex %q: %w", line, err)
		}
		out = append(out, re)
	}
	return out, s.Err()
}

func allowed(hit string, allow []*regexp.Regexp) bool {
	for _, re := range allow {
		if re.MatchString(hit) {
			return true
		}
	}
	return false
}

func secretIssues(path, text string, allow []*regexp.Regexp) []issue {
	personal := personalHome(path)
	var out []issue
	for _, p := range secretPatterns {
		for _, loc := range p.re.FindAllStringIndex(text, -1) {
			hit := text[loc[0]:loc[1]]
			if allowed(hit, allow) {
				continue
			}
			if personal && p.ipv4 {
				if addr, err := netip.ParseAddr(hit); err == nil && localIP(addr) {
					continue
				}
			}
			level := "ERROR"
			if personal && p.localLevel != "" {
				level = p.localLevel
			}
			if len(hit) > 32 {
				hit = hit[:32] + "…"
			}
			out = append(out, issue{level, path, strings.Count(text[:loc[0]], "\n") + 1, "security.secret", p.why + ": " + hit})
		}
	}
	for _, loc := range ipv6Candidate.FindAllStringIndex(text, -1) {
		hit := text[loc[0]:loc[1]]
		addr, err := netip.ParseAddr(hit)
		if err != nil || !addr.Is6() || addr.IsLoopback() || addr.IsUnspecified() || allowed(hit, allow) {
			continue
		}
		if personal && localIP(addr) {
			continue
		}
		level := "ERROR"
		if personal {
			level = "WARN"
		}
		out = append(out, issue{level, path, strings.Count(text[:loc[0]], "\n") + 1, "security.address", "raw IPv6 address: " + hit})
	}
	return out
}

func tokens(n *note) map[string]bool {
	text := strings.ToLower(n.Props.Name + " " + n.Props.Description + " " + strings.Join(n.Props.Tags, " "))
	out := map[string]bool{}
	for _, w := range wordRE.FindAllString(text, -1) {
		out[w] = true
	}
	return out
}

func jaccard(a, b map[string]bool) float64 {
	inter, union := 0, len(a)
	for k := range b {
		if a[k] {
			inter++
		} else {
			union++
		}
	}
	if union == 0 {
		return 0
	}
	return float64(inter) / float64(union)
}

func digest(data []byte) string { return fmt.Sprintf("%x", sha256.Sum256(data))[:12] }
