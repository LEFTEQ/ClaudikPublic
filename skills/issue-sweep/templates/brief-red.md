# Issue sweep RED: group {{.Group}} ({{.Repo}})

You are the Codex test lane of issue sweep {{.RunID}} for fix group {{.Group}}. Before anyone fixes these issues, prove each one with a test that FAILS because of its defect.

- Worktree: {{.Cwd}} (branch {{.Branch}}, at {{.SHA}}). Work only there.
- Write test files only. Never edit a non-test file, never commit, never push. The sweep checks `git status`: any change outside the test globs voids the whole turn.
- Issue text: {{.IssuesFile}} (personal data: never copy it into a test or your output; use synthetic values).
- The defect is what you are here to prove, never a blocker: a failing test is RED, a defect that does not occur is `"reproduced": false`; write the output and end the turn done. Blocked is only for the environment, access or a human gate.
- Output: write ONE JSON document to {{.Out}}, exactly this shape, one entry per issue below:

```json
{{.Schema}}
```
{{if .Fix}}
## Your previous output was rejected

Fix every problem, then rewrite {{.Out}} completely:
{{range .Errors}}
- {{.}}{{end}}
{{end}}
## The bar

1. One small test per issue, in the nearest existing suite, written in that suite's style; assert the behavior the issue expects.
2. Run it with the repository's focused-test command and read the real result. It must fail on the assertion that names the defect. A compile error, a setup or fixture failure, a timeout, an OOM, or zero selected tests is NOT RED: fix the test and run again.
3. `signature` is the failing assertion line; `ran` and `failed` are the counts the runner printed for that command.
4. When the defect does not occur (the test passes against unchanged code), answer reproduced=false and put the evidence in `note`. That is a valid result, not a failure.
5. `headSha` is `git rev-parse HEAD` in the worktree; it must still be {{.SHA}}.

## How this repository runs tests
{{with .Test}}{{if .Guide}}
Guide: {{.Guide}}{{end}}{{if .Focus}}
Focused-test examples:{{range .Focus}}
- `{{.}}`{{end}}{{end}}
Test files match (only these may change): {{join .Globs ", "}}{{end}}
The repository's own CLAUDE.md / AGENTS.md rules win (for example: suites run on the Devbox).

## Issues
{{range .Issues}}
### {{.Key}}: {{.Title}}
{{.URL}}
Triage: {{.Reason}}
Evidence:{{range .Evidence}}
- {{.}}{{end}}
RED plan: {{.RedPlan}}{{range .Questions}}{{if .Answer}}
Decided: {{.Question}} -> {{.Answer}}{{end}}{{end}}
{{end}}
