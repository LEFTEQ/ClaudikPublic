package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

func lintDir(dir string) []issue {
	dir, _ = filepath.Abs(dir)
	files, err := markdownFiles(dir)
	if err != nil {
		return []issue{{"ERROR", dir, 0, "io.directory", err.Error()}}
	}
	allow, err := loadAllow(dir)
	if err != nil {
		return []issue{{"ERROR", dir, 0, "config.allowlist", err.Error()}}
	}
	names := map[string]bool{}
	for _, p := range files {
		names[strings.TrimSuffix(filepath.Base(p), ".md")] = true
	}
	indexPath := filepath.Join(dir, "MEMORY.md")
	indexRaw, err := os.ReadFile(indexPath)
	if err != nil {
		return []issue{{"ERROR", indexPath, 0, "index.missing", "MEMORY.md is required"}}
	}
	var out []issue
	if n := countLines(indexRaw); n > maxIndexLines {
		out = append(out, issue{"ERROR", indexPath, 0, "size.index-lines", fmt.Sprintf("%d lines exceeds %d", n, maxIndexLines)})
	}
	if len(indexRaw) > maxIndexBytes {
		out = append(out, issue{"ERROR", indexPath, 0, "size.index-bytes", fmt.Sprintf("%d bytes exceeds %d", len(indexRaw), maxIndexBytes)})
	}
	out = append(out, secretIssues(indexPath, string(indexRaw), allow)...)
	indexed := map[string]int{}
	for _, m := range markdownLinkRE.FindAllStringSubmatch(string(indexRaw), -1) {
		base := filepath.Base(m[1])
		indexed[base]++
		if _, err := os.Stat(filepath.Join(dir, base)); err != nil {
			out = append(out, issue{"ERROR", indexPath, 0, "index.dangling", "links missing file " + base})
		}
	}
	for _, path := range files {
		n, err := parseNote(path)
		if err != nil {
			out = append(out, issue{"ERROR", path, 0, "schema.frontmatter", err.Error()})
			continue
		}
		out = append(out, lintNote(n, names)...)
		out = append(out, secretIssues(path, string(n.Raw), allow)...)
		if indexed[n.File] == 0 {
			out = append(out, issue{"ERROR", path, 0, "index.orphan", "not linked from MEMORY.md"})
		}
		if indexed[n.File] > 1 {
			out = append(out, issue{"WARN", path, 0, "index.duplicate", "linked more than once from MEMORY.md"})
		}
	}
	return out
}

func printIssues(issues []issue) (errors, warnings int) {
	sort.Slice(issues, func(i, j int) bool {
		if issues[i].Path == issues[j].Path {
			return issues[i].Line < issues[j].Line
		}
		return issues[i].Path < issues[j].Path
	})
	for _, i := range issues {
		fmt.Println(i.String())
		if i.Level == "ERROR" {
			errors++
		} else {
			warnings++
		}
	}
	return
}

func runCheck(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "check requires at least one memory directory")
		return 2
	}
	totalE, totalW := 0, 0
	for _, dir := range args {
		e, w := printIssues(lintDir(dir))
		totalE += e
		totalW += w
	}
	fmt.Printf("memorylint: %d error(s), %d warning(s)\n", totalE, totalW)
	if totalE > 0 {
		return 1
	}
	return 0
}

type legacyEnvelope struct {
	Name         string   `yaml:"name"`
	Description  string   `yaml:"description"`
	Type         string   `yaml:"type"`
	Status       string   `yaml:"status"`
	Tags         []string `yaml:"tags"`
	Aliases      []string `yaml:"aliases"`
	LastVerified string   `yaml:"last-verified"`
	Metadata     struct {
		Type     string `yaml:"type"`
		NodeType string `yaml:"node_type"`
		Modified string `yaml:"modified"`
	} `yaml:"metadata"`
}

func normalize(path string) ([]byte, bool, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, false, err
	}
	m := frontmatterRE.FindSubmatchIndex(raw)
	if m == nil {
		return nil, false, fmt.Errorf("missing frontmatter")
	}
	var old legacyEnvelope
	if err := yaml.Unmarshal(raw[m[2]:m[3]], &old); err != nil {
		// Some legacy files contain plain scalars with ':' or leading backticks.
		// Recover only the known scalar fields; the output is always strict YAML.
		front := string(raw[m[2]:m[3]])
		old.Name = looseField(front, "name")
		old.Description = looseField(front, "description")
		old.Type = looseField(front, "type")
		old.Status = looseField(front, "status")
		old.LastVerified = looseField(front, "last-verified")
		old.Metadata.Modified = looseField(front, "modified")
	}
	typeName := old.Type
	if typeName == "" {
		typeName = old.Metadata.Type
	}
	if !validTypes[typeName] {
		switch strings.ToLower(old.Metadata.NodeType) {
		case "preference", "identity":
			typeName = "user"
		case "feedback":
			typeName = "feedback"
		default:
			typeName = "project"
		}
	}
	status := old.Status
	if status == "" {
		status = "active"
	}
	verified := old.LastVerified
	if verified == "" && len(old.Metadata.Modified) >= 10 {
		verified = old.Metadata.Modified[:10]
	}
	n := &note{Path: path, File: filepath.Base(path), Dir: filepath.Dir(path), Body: string(raw[m[1]:]), Props: properties{
		Name: strings.TrimSuffix(filepath.Base(path), ".md"), Description: strings.TrimSpace(old.Description), Type: typeName, Status: status,
		Tags: old.Tags, Aliases: old.Aliases, LastVerified: verified,
	}}
	if n.Props.Description == "" {
		return nil, false, fmt.Errorf("missing description")
	}
	data, err := renderNote(n)
	if err != nil {
		return nil, false, err
	}
	return data, !bytesEqual(raw, data), nil
}

func looseField(front, key string) string {
	for _, line := range strings.Split(front, "\n") {
		trimmed := strings.TrimSpace(line)
		prefix := key + ":"
		if strings.HasPrefix(trimmed, prefix) {
			return strings.TrimSpace(strings.TrimPrefix(trimmed, prefix))
		}
	}
	return ""
}

func bytesEqual(a, b []byte) bool { return string(a) == string(b) }

func runFix(args []string) int {
	fs := flag.NewFlagSet("fix", flag.ContinueOnError)
	dry := fs.Bool("dry-run", false, "report without writing")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if fs.NArg() == 0 {
		fmt.Fprintln(os.Stderr, "fix requires a directory")
		return 2
	}
	changed, failed := 0, 0
	for _, dir := range fs.Args() {
		files, err := markdownFiles(dir)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			failed++
			continue
		}
		for _, path := range files {
			data, diff, err := normalize(path)
			if err != nil {
				fmt.Fprintf(os.Stderr, "ERROR %s: %v\n", path, err)
				failed++
				continue
			}
			if !diff {
				continue
			}
			changed++
			fmt.Printf("%s %s\n", map[bool]string{true: "WOULD_FIX", false: "FIXED"}[*dry], path)
			if !*dry {
				if err := atomicWrite(path, data); err != nil {
					fmt.Fprintln(os.Stderr, err)
					failed++
				}
			}
		}
	}
	fmt.Printf("memorylint: %d note(s) %s, %d failure(s)\n", changed, map[bool]string{true: "would change", false: "changed"}[*dry], failed)
	if failed > 0 {
		return 1
	}
	return 0
}

func runNew(args []string) int {
	fs := flag.NewFlagSet("new", flag.ContinueOnError)
	home := fs.String("home", "", "memory directory")
	kind := fs.String("type", "", "memory type")
	name := fs.String("name", "", "kebab-case filename stem")
	desc := fs.String("description", "", "recall trigger description")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if *home == "" || *name == "" || *desc == "" || !validTypes[*kind] {
		fmt.Fprintln(os.Stderr, "new requires --home, valid --type, --name, and --description")
		return 2
	}
	if !regexpSlug.MatchString(*name) {
		fmt.Fprintln(os.Stderr, "name must be lowercase kebab-case")
		return 2
	}
	path := filepath.Join(*home, *name+".md")
	if _, err := os.Stat(path); err == nil {
		fmt.Fprintln(os.Stderr, "note already exists:", path)
		return 1
	}
	n := &note{Path: path, File: filepath.Base(path), Dir: *home, Props: properties{Name: *name, Description: *desc, Type: *kind, Status: "active"}, Body: "# " + titleCase(*name) + "\n\n- Add concise, durable guidance here.\n"}
	data, err := renderNote(n)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	fmt.Println(path)
	return 0
}

var regexpSlug = regexpMust(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

func regexpMust(s string) *regexp.Regexp { return regexp.MustCompile(s) }
func titleCase(s string) string {
	p := strings.Split(s, "-")
	for i := range p {
		if p[i] != "" {
			p[i] = strings.ToUpper(p[i][:1]) + p[i][1:]
		}
	}
	return strings.Join(p, " ")
}

func buildIndex(dir, teamIndex string) ([]byte, error) {
	files, err := markdownFiles(dir)
	if err != nil {
		return nil, err
	}
	groups := map[string][]*note{"user": {}, "feedback": {}, "project": {}, "reference": {}}
	for _, path := range files {
		n, err := parseNote(path)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", path, err)
		}
		if n.Props.Status == "active" {
			groups[n.Props.Type] = append(groups[n.Props.Type], n)
		}
	}
	var b strings.Builder
	b.WriteString("# Memory Index\n\nOpen only the notes whose descriptions match the current task.\n")
	if teamIndex != "" {
		fmt.Fprintf(&b, "\nTeam memory: `%s` — open it when the task touches project code.\n", teamIndex)
	}
	for _, kind := range []string{"user", "feedback", "project", "reference"} {
		if len(groups[kind]) == 0 {
			continue
		}
		b.WriteString("\n## " + titleCase(kind) + "\n\n")
		sort.Slice(groups[kind], func(i, j int) bool { return groups[kind][i].Props.Name < groups[kind][j].Props.Name })
		for _, n := range groups[kind] {
			fmt.Fprintf(&b, "- [%s](%s) — %s\n", n.Props.Name, n.File, n.Props.Description)
		}
	}
	return []byte(b.String()), nil
}

func runReindex(args []string) int {
	fs := flag.NewFlagSet("reindex", flag.ContinueOnError)
	write := fs.Bool("write", false, "write MEMORY.md")
	teamIndex := fs.String("team-index", "", "plain-text path to the project's team MEMORY.md")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "reindex requires one directory")
		return 2
	}
	data, err := buildIndex(fs.Arg(0), *teamIndex)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	path := filepath.Join(fs.Arg(0), "MEMORY.md")
	if !*write {
		os.Stdout.Write(data)
		return 0
	}
	if _, err := os.Stat(path); os.IsNotExist(err) {
		if err = os.WriteFile(path, data, 0644); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
	} else if err := atomicWrite(path, data); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	fmt.Printf("REINDEXED %s (%dB, %d lines)\n", path, len(data), countLines(data))
	return 0
}

func runGraph(args []string) int {
	fs := flag.NewFlagSet("graph", flag.ContinueOnError)
	similar := fs.Bool("similar", false, "report likely duplicates")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if fs.NArg() == 0 {
		fmt.Fprintln(os.Stderr, "graph requires a directory")
		return 2
	}
	var notes []*note
	for _, dir := range fs.Args() {
		files, err := markdownFiles(dir)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		for _, p := range files {
			n, err := parseNote(p)
			if err == nil {
				notes = append(notes, n)
			}
		}
	}
	if *similar {
		for i := 0; i < len(notes); i++ {
			for j := i + 1; j < len(notes); j++ {
				score := jaccard(tokens(notes[i]), tokens(notes[j]))
				if score >= 0.42 {
					fmt.Printf("%.2f\t%s\t%s\n", score, notes[i].Path, notes[j].Path)
				}
			}
		}
		return 0
	}
	fmt.Println("digraph memory {")
	for _, n := range notes {
		fmt.Printf("  %q [label=%q];\n", n.Props.Name, n.Props.Name)
		for _, m := range wikiLinkRE.FindAllStringSubmatch(n.Body, -1) {
			fmt.Printf("  %q -> %q;\n", n.Props.Name, strings.TrimSuffix(filepath.Base(m[1]), ".md"))
		}
	}
	fmt.Println("}")
	return 0
}
