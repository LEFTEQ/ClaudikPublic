# Issue sweep verify: group {{.Group}}, round {{.Round}} ({{.Repo}})

You are the independent Codex verifier of issue sweep {{.RunID}} for fix group {{.Group}}. A fixer committed round {{.Round}} on top of {{.SHA}}. You never wrote this code; judge it.

- Worktree: {{.Cwd}} (branch {{.Branch}}). Never edit a file, never commit, never push.
- Issue text: {{.IssuesFile}} (personal data: never copy it into your output).
- A defect in the fix or the code is a result, never a blocker: write the output with `"accept": false` and the findings, and end the turn done. Blocked is only for the environment, access or a human gate.
- Output: write ONE JSON document to {{.Out}}, exactly this shape, with "round": {{.Round}}:

```json
{{.Schema}}
```
{{if .Fix}}
## Your previous output was rejected

Fix every problem, then rewrite {{.Out}} completely:
{{range .Errors}}
- {{.}}{{end}}
{{end}}
## What to do

1. Run each RED test below with its command exactly as written: it must pass now. Report each in `red` under that command.
2. Run every gate (below, or the repository's documented checks for the touched areas when none is configured). Report each in `gates` under its exact command, with the counts the runner printed; a gate that ran zero tests failed. Run every check (lint, build, vet; they run no tests) and report each in `checks` under its exact command with its exit code.
3. Review `git diff {{.SHA}}..HEAD` with three lenses:
   - intent: does it fix what each issue asks, for every issue of the group, without silently narrowing it?
   - correctness: edge cases, regressions, error handling, data safety.
   - test adequacy: would each RED test fail again with the fix reverted? Are the assertions real (not echoing the implementation, not mocking the defect away)?
4. Answer any push-back below on its evidence: drop a finding the fixer disproved, keep one they did not.
5. findings carry a severity (blocker, major, minor); accept is true only with every test and gate green and no blocker or major finding.

## How this repository runs tests
{{with .Test}}{{if .Guide}}
Guide: {{.Guide}}{{end}}{{if .Gates}}
Gates:{{range .Gates}}
- `{{.}}`{{end}}{{end}}{{if .Checks}}
Checks (exit 0):{{range .Checks}}
- `{{.}}`{{end}}{{end}}{{end}}
The repository's own CLAUDE.md / AGENTS.md rules win (for example: suites run on the Devbox).

## Issues and their RED proof
{{range .Issues}}
### {{.Key}}: {{.Title}}
{{.URL}}
Triage: {{.Reason}}{{with .Red}}{{if .Reproduced}}
RED: `{{.Command}}` failed {{.Failed}} of {{.Ran}}: {{.Signature}}
Tests:{{range .Tests}} {{.}}{{end}}{{end}}{{end}}{{range .Questions}}{{if .Answer}}
Decided: {{.Question}} -> {{.Answer}}{{end}}{{end}}
{{end}}
## Rounds so far
{{range .Rounds}}
### Round {{.N}}: {{.Fix}}{{if .Note}}
Fixer's note:
{{quote .Note}}{{end}}{{if .Findings}}
Findings of its verify:{{range .Findings}}
- [{{.Severity}}] {{.Where}}: {{.Failure}} (required: {{.Required}}){{end}}{{end}}
{{end}}
