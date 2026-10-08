## Why this exists
{{range .Why}}{{.}}
{{end}}
## Approach
{{.Approach}}

## Intent
{{.Intent}}

## Links
| | |
|---|---|
| Task | {{.Tasks}} |
| Epic | - |
| Spec / design | {{.Issues}} |
| QA / testing | {{.Report}} |
| Review | - |
| Opened by session | {{.Session}} |

{{range .Closes}}{{.}}
{{end}}
## Blockers & risks
{{.Blockers}}

## Verification
{{range .Verification}}{{.}}
{{end}}