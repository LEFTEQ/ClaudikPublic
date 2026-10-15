---
name: handoff
disable-model-invocation: true
argument-hint: "[slug] [workflow] [auto]"
description: "Prepare a resumable handoff for major unfinished work or an explicit user-requested transfer."
---

# /handoff — Executable Session Handoff

Use a resumable handoff for major unfinished work too large for this session or an explicit user-requested transfer; ordinary delegation uses subagents, not handoff files or fleet sessions. Follow the shared size-routing rule. Package the work for `/continue <slug>` with intent, affected apps, prerequisites and phased steps. No memory writes; durable knowledge goes through the `memo` ledger.

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
feature: <project>/<epic id>        # vitrinka epic this work parents to; `none` for chores
---
```

`memorylint` refuses a write that breaks this shape (the same hook that guards memory); `memorylint check ~/.claude/handoffs` audits the tree.

## Ledger

A feature epic is handed back through `/vitrinka-pm:handoff` (`hand_back`); the file runbook is written only for chores and repos without vitrinka. Otherwise a `feature` epic gets the handoff attached and its state set in the same pass: `add_task_ref {kind: file, ref: <path>, meta: {kind: handoff, slug, status}}`, then `update_task {fields: {ledger_state, waiting_on?, next_action}}` — `waiting` (name what) when a prerequisite is unmet, else `scheduled`. Feature work with no epic yet: `create_task {type: epic}` first (the `portfolio` skill reads these fields).

## Runbook shape

Header (branch @ sha, tree state), then:

- **Intent** — why the feature exists, the user-facing goal; 2–4 sentences.
- **Affected** — each app/repo with the key paths and what changes there.
- **Prerequisites** — checkbox gates verified BEFORE phase 1, each with its verify command (`gh pr view N` merged, migration applied on dev, "confirm X still holds before implementing").
- **Phases** — dependency-ordered; each states what to do and `Done when: <observable check>`. PRs go through /prm.
- **Context** — preserve, exactly: problems hit and how they were resolved; options tried or set aside and why; everything decided, agreed, ruled out, or stated as a preference or constraint, in the user's own words; where things stand; what is still open or promised; hard-to-reconstruct specifics (names, numbers, exact wording, links). The session's own reasoning condenses to its conclusions. Secrets stay redacted (`<see onyx://…>`).
- **Out of scope** — explicitly punted work the next session must not finish.

Synthesize — never paste git diff/log output or transcript. ≤200 lines; a directory split beats padding.

## Workflow form

`workflow.mjs` (Workflow-tool script) beside `handoff.md` (intent + context). Phases mirror the runbook: a prerequisite-gate phase first, then implementation phases, then merge phases via /prm. With `auto`, a merge fires as soon as its gate's checks are green; without it, the workflow stops and asks before each merge. Keep agents coarse — one per repo/feature, ≤4 per phase.

## Hand back

Verify every state fact live (git, gh) — never from session recall; `where` is the main checkout's absolute root (`git rev-parse --path-format=absolute --git-common-dir`, minus `/.git`), never a worktree path, since /continue keys on that dir's name. Then print exactly:

```
Handoff written: <path>   (<form>, N phases, M prerequisites)

In a fresh session:
  where:     <absolute main-checkout path>
  continue:  /continue <slug>
```

When the user picked a fresh session, run `toolbox fleet continue <slug> <where> --why "<why this needs a separate session>"` instead, adding `--gate <kind>:<condition>:<ref>` for what its completion waits on (`pr:merged:owner/repo#N`). It runs `/continue <slug>` in another Auto tab beside the caller in the same cmux window, journals the spawn and wakes this session when the child settles (`docs/fleet.md`, Jobs). Apply the shared plain-tab and single-owner rules (`~/.claude/docs/toolbox/orchestration.md`); no `--team`, grouping, portals or window moves unless explicitly requested. The session command, launch and focus are the person's `~/.config/toolbox/config.json` — never pass `--focus` or wrap it in `sh -c`. Exit 0 → print its receipt in place of the `In a fresh session` block; non-zero or not found → print the fallback block.

A session `fleet continue` started (`$TOOLBOX_JOB` is set) ends its hand back with `toolbox fleet signal handed-back --url <handoff path>`, so its parent is woken now rather than when the session ends.
