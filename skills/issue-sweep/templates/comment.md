{{.Marker}}
**Issue sweep `{{.RunID}}`: verdict `{{.Verdict}}`** (confidence {{.Confidence}}{{if .LowConfidence}}, below 0.70: read it as a lead, not proof{{end}})

{{.Reason}}
{{if .Evidence}}
**Evidence**{{if .AuditedSHA}} at `{{.AuditedSHA}}`{{end}}:
{{range .Evidence}}- {{.}}
{{end}}{{end}}{{if .DuplicateOf}}
Duplicate of {{.DuplicateOf}}.
{{end}}{{if .Skeptic}}
**Independent check:** {{if .Skeptic.Upheld}}upheld{{else}}overturned{{end}}. {{.Skeptic.Rationale}}
{{end}}{{if .LinkedPRs}}
**Linked pull requests:**
{{range .LinkedPRs}}- {{.Repo}}#{{.Number}} ({{.State}}) {{.Title}}
{{end}}{{end}}
{{if .Closing}}Closing: the maintainer reviewed this evidence and approved the close at the sweep's decision gate. Reopen with new evidence if it is wrong.{{else}}Leaving this open: the maintainer chose to keep it at the sweep's decision gate.{{end}}
