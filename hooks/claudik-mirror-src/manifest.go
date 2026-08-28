package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// Manifest is the single source of truth for what the public mirror contains.
// Every exclusion, override and deny rule carries a `why` so the file doubles
// as the scrub record.
type Manifest struct {
	Target string `json:"target"`
	Remote string `json:"remote"`
	// DenyStringsFile reuses the commit guard's literal deny list (infra IPs)
	// rather than copying those values into a second place.
	DenyStringsFile string     `json:"denyStringsFile"`
	Include         []string   `json:"include"`
	Exclude         []Rule     `json:"exclude"`
	Overrides       []Override `json:"overrides"`
	Rewrite         []Rewrite  `json:"rewrite"`
	Deny            []Deny     `json:"deny"`
	Allow           []Allow    `json:"allow"`
}

type Rule struct {
	Path string `json:"path"`
	Why  string `json:"why"`
}

type Override struct {
	Path string `json:"path"`
	From string `json:"from"`
	Why  string `json:"why"`
}

type Rewrite struct {
	From string `json:"from"`
	To   string `json:"to"`
	Why  string `json:"why"`
}

type Deny struct {
	Name    string `json:"name"`
	Pattern string `json:"pattern"`
	Why     string `json:"why"`
	// Skip discards a match whose own text matches one of these patterns —
	// how a broad rule ("any IPv4") stays broad while documentation ranges and
	// loopback addresses pass. Scoped Allow exempts a PATH; Skip exempts a VALUE.
	Skip []string `json:"skip"`

	re   *regexp.Regexp
	skip []*regexp.Regexp
}

func (d Deny) skipped(match string) bool {
	for _, re := range d.skip {
		if re.MatchString(match) {
			return true
		}
	}
	return false
}

// Allow exempts one deny rule inside one path glob — a scoped escape hatch so a
// single legitimate hit never forces the whole rule off.
type Allow struct {
	Path string `json:"path"`
	Deny string `json:"deny"`
	Why  string `json:"why"`
}

// LoadManifest reads the manifest and, when denyStringsFile is set, folds that
// file's literal strings in as an extra deny rule (resolved against the repo
// root, i.e. the manifest's grandparent directory).
func LoadManifest(path string) (*Manifest, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var m Manifest
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&m); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	if strings.TrimSpace(m.Target) == "" {
		return nil, fmt.Errorf("%s: target is required", path)
	}
	m.Target = expandHome(m.Target)
	for i := range m.Deny {
		re, err := regexp.Compile(m.Deny[i].Pattern)
		if err != nil {
			return nil, fmt.Errorf("deny %q: %w", m.Deny[i].Name, err)
		}
		if m.Deny[i].Name == "" {
			return nil, fmt.Errorf("deny rule %q needs a name", m.Deny[i].Pattern)
		}
		m.Deny[i].re = re
		for _, s := range m.Deny[i].Skip {
			sre, err := regexp.Compile(s)
			if err != nil {
				return nil, fmt.Errorf("deny %q skip %q: %w", m.Deny[i].Name, s, err)
			}
			m.Deny[i].skip = append(m.Deny[i].skip, sre)
		}
	}
	if m.DenyStringsFile != "" {
		repoRoot := filepath.Dir(filepath.Dir(path))
		rule, err := denyFromStrings(filepath.Join(repoRoot, m.DenyStringsFile))
		if err != nil {
			return nil, err
		}
		if rule != nil {
			m.Deny = append(m.Deny, *rule)
		}
	}
	return &m, nil
}

func denyFromStrings(path string) (*Deny, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("denyStringsFile %s: %w", path, err)
	}
	var quoted []string
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		quoted = append(quoted, regexp.QuoteMeta(line))
	}
	if len(quoted) == 0 {
		return nil, nil
	}
	pattern := strings.Join(quoted, "|")
	return &Deny{
		Name:    "private-strings",
		Pattern: pattern,
		Why:     "literal string from hooks/private-strings.txt (infra IPs the commit guard already blocks)",
		re:      regexp.MustCompile(pattern),
	}, nil
}

func expandHome(p string) string {
	if p == "~" || strings.HasPrefix(p, "~/") {
		home, err := os.UserHomeDir()
		if err == nil {
			return filepath.Join(home, strings.TrimPrefix(strings.TrimPrefix(p, "~"), "/"))
		}
	}
	return p
}

// Selected reports whether a repo-relative path belongs in the mirror, and when
// it does not, which exclusion rule dropped it.
func (m *Manifest) Selected(path string) (bool, Rule) {
	included := false
	for _, g := range m.Include {
		if matchGlob(g, path) {
			included = true
			break
		}
	}
	if !included {
		return false, Rule{Why: "not in include list"}
	}
	for _, r := range m.Exclude {
		if matchGlob(r.Path, path) {
			return false, r
		}
	}
	return true, Rule{}
}

func (m *Manifest) OverrideFor(path string) (Override, bool) {
	for _, o := range m.Overrides {
		if o.Path == path {
			return o, true
		}
	}
	return Override{}, false
}

func (m *Manifest) allowed(path, denyName string) bool {
	for _, a := range m.Allow {
		if a.Deny == denyName && matchGlob(a.Path, path) {
			return true
		}
	}
	return false
}

// matchGlob supports `**` (any depth, may span separators), `*` and `?` within a
// single segment, and plain literals. A bare directory pattern matches the whole
// subtree, so "skills/foo" and "skills/foo/**" behave the same.
func matchGlob(pattern, path string) bool {
	if pattern == path {
		return true
	}
	if !strings.ContainsAny(pattern, "*?") && strings.HasPrefix(path, strings.TrimSuffix(pattern, "/")+"/") {
		return true
	}
	return globRegexp(pattern).MatchString(path)
}

var globCache = map[string]*regexp.Regexp{}

func globRegexp(pattern string) *regexp.Regexp {
	if re, ok := globCache[pattern]; ok {
		return re
	}
	var b strings.Builder
	b.WriteString("^")
	for i := 0; i < len(pattern); i++ {
		// `/**` is optional, so "skills/foo/**" also matches "skills/foo" — a
		// directory pattern covers the directory itself and everything under it.
		if pattern[i] == '/' && strings.HasPrefix(pattern[i:], "/**") {
			b.WriteString("(?:/.*)?")
			i += 2
			continue
		}
		switch c := pattern[i]; c {
		case '*':
			if i+1 < len(pattern) && pattern[i+1] == '*' {
				i++
				b.WriteString(".*")
			} else {
				b.WriteString("[^/]*")
			}
		case '?':
			b.WriteString("[^/]")
		default:
			b.WriteString(regexp.QuoteMeta(string(c)))
		}
	}
	b.WriteString("$")
	re := regexp.MustCompile(b.String())
	globCache[pattern] = re
	return re
}
