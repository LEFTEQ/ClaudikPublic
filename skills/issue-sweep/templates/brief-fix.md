# Issue sweep fix: group {{.Group}}, round {{.Round}} ({{.Repo}})

You author the fix for issue sweep {{.RunID}}, group {{.Group}}. Codex proved each issue below with a failing RED test; make them pass with the smallest correct change.

- Worktree: {{.Cwd}} (branch {{.Branch}}, base {{.SHA}}). Work only there, following the repository's CLAUDE.md / AGENTS.md.
- Round 1: first commit the RED test files exactly as written, path-scoped: `git add <those paths>` and `git commit -m "test: reproduce <key>"`.
- Never edit a RED test file (the sweep checks its hash). A test you believe is wrong is a push-back, not an edit.
- Then fix and commit path-scoped (`fix: <what> (<key>)`). You may run the focused RED commands below to iterate; the independent verify runs the full gates.
- Never push, never open a PR, never touch another worktree.
- Finish by writing your note (what you changed and why; for push-back, the evidence per disputed finding) to {{.Note}}, then run:
  `{{.Self}} fix record --run {{.RunID}} --group {{.Group}} --state fixed|pushback|blocked --note {{.Note}} --json`
  - fixed: committed, tree clean.
  - pushback: you dispute verify findings; commits optional, tree clean.
  - blocked: a human-only or infrastructure gate stops you; the note's first line names it.

## How this repository runs tests
{{with .Test}}{{if .Guide}}
Guide: {{.Guide}}{{end}}{{if .Focus}}
Focused-test examples:{{range .Focus}}
- `{{.}}`{{end}}{{end}}{{if .Gates}}
Gates verify will run:{{range .Gates}}
- `{{.}}`{{end}}{{end}}{{if .Checks}}
Checks verify will run (exit 0):{{range .Checks}}
- `{{.}}`{{end}}{{end}}{{end}}

## Issues
{{range .Issues}}
### {{.Key}}: {{.Title}}
{{.URL}}
Triage: {{.Reason}}
Evidence:{{range .Evidence}}
- {{.}}{{end}}{{range .Questions}}{{if .Answer}}
Decided: {{.Question}} -> {{.Answer}}{{end}}{{end}}{{with .Red}}{{if .Reproduced}}
RED: `{{.Command}}` failed {{.Failed}} of {{.Ran}}: {{.Signature}}
Tests:{{range .Tests}} {{.}}{{end}}{{end}}{{end}}
{{end}}{{if .Rounds}}
## Earlier rounds
{{range .Rounds}}
### Round {{.N}}: {{.Fix}}{{if .Note}}
Your note:
{{quote .Note}}{{end}}{{if .Findings}}
Verify findings to answer:{{range .Findings}}
- [{{.Severity}}] {{.Where}}: {{.Failure}} (required: {{.Required}}){{end}}{{end}}
{{end}}{{end}}
