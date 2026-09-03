---
disable-model-invocation: true
argument-hint: [slug] [workflow] [auto]
---

# /handoff — Executable Session Handoff

Package the in-flight work as a self-sufficient handoff a fresh session resumes with `/continue <slug>`. The artifact carries everything — intent, affected apps, prerequisites, phased steps. No memory writes; durable knowledge is the auto-memory system's job.

## Arguments — $ARGUMENTS

- `<slug>` — kebab-case name; else derive from the branch (strip `feature/`-style prefixes, slugify); on main/detached: `handoff-YYYYMMDD-HHMM`.
- `workflow` — force the workflow-script form.
- `auto` — workflow form only: PR merges run unattended once their gates are green.

## Form and layout

Default is a markdown runbook. When the work spans repos or chains dependent features with clear mechanical steps, propose the workflow form before writing.

One file: `~/.claude/handoffs/<project-slug>/<slug>.md` (project-slug = repo dir name, slugified). Split into a `<slug>/` directory — `handoff.md` + per-app context files, plus `workflow.mjs` in workflow form — only when one file would cramp multi-app context. Same slug → overwrite the live file; `<project-slug>/archive/` holds finished handoffs and is never written by /handoff.

## Frontmatter

Every handoff (`<slug>.md` or `<slug>/handoff.md`) opens with:

```yaml
---
name: <slug>
description: <one line — what a reader resumes here>
status: open                       # open · in-progress · done · abandoned — /continue advances it
created: YYYY-MM-DD
created-by: <this session's id>    # printenv CLAUDE_CODE_SESSION_ID
sessions:                          # every session that wrote, enriched or drove it — creator first
  - <this session's id>
---
```

`memorylint` refuses a write that breaks this shape (the same hook that guards memory); `memorylint check ~/.claude/handoffs` audits the tree.

## Runbook shape

Header (branch @ sha, tree state), then:

- **Intent** — why the feature exists, the user-facing goal; 2–4 sentences.
- **Affected** — each app/repo with the key paths and what changes there.
- **Prerequisites** — checkbox gates verified BEFORE phase 1, each with its verify command (`gh pr view N` merged, migration applied on dev, "confirm X still holds before implementing").
- **Phases** — dependency-ordered; each states what to do and `Done when: <observable check>`. PRs go through /prm.
- **Context** — decisions with their why, gotchas hit, facts not derivable from the repos. Secrets stay redacted (`<see onyx://…>`).
- **Out of scope** — explicitly punted work the next session must not finish.

Synthesize — never paste git diff/log output or transcript. ≤200 lines; a directory split beats padding.

## Workflow form

`workflow.mjs` (Workflow-tool script) beside `handoff.md` (intent + context). Phases mirror the runbook: a prerequisite-gate phase first, then implementation phases, then merge phases via /prm. With `auto`, a merge fires as soon as its gate's checks are green; without it, the workflow stops and asks before each merge. Keep agents coarse — one per repo/feature, ≤4 per phase.

## Hand back

Verify every state fact live (git, gh) — never from session recall. Then print exactly:

```
Handoff written: <path>   (<form>, N phases, M prerequisites)

In a fresh session run:
  /continue <slug>
```
