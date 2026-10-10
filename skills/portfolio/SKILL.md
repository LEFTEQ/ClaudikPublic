---
name: portfolio
description: "Use when asked what remains for a feature epic — its gates, blockers, next action, decisions owed — or to run its closure check: 'portfolio <project>/<epic id>', 'what's left on this feature', 'can this epic close'."
argument-hint: "[close] <project>/<epic id>"
---

# Portfolio — the feature ledger, read and closed

The epic is the feature. Its `fields` are the truth: `outcome`, `non_goals`, `gates[]{name, done, evidence}`, `decisions[]{name, done, evidence}`, `ledger_state`, `waiting_on`, `next_action`. Their shapes, meanings and writers are in `references/ledger.md`. Refs carry the evidence: handoffs (`file` refs with `meta.kind = handoff`), PRs, boards, runs.

## `portfolio <project>/<id>` — what remains

Read the epic with `get {kind: "task", id, include: ["refs", "comments"]}` and its children with `list {kind: "task", project, parent: <id>}`. Load a ref through `read_task_ref` only when its index line is not enough. For every PR ref, check the live state (`gh pr view`). Report in this order, one line each: open gates · what it waits on · next action · decisions owed by the task owner · stale handoffs (open, no session in 7 days). Invent nothing: a gate without evidence stays open.

## `portfolio close <project>/<id>` — the closure check

Do the same read, then write with `update {kind: "task", id, fields}`. A gate whose evidence exists (merged PR, done child, archived handoff) gets `done: true` plus that evidence. When every gate is done and no decision is unanswered, set `ledger_state: closed`. Otherwise write `ledger_state: active` (`waiting` with `waiting_on` when an unmet prerequisite holds it) together with `next_action` = the first open gate or the unanswered decision — fields merge by key, so a stale `closed` from an earlier check is never left standing. A checklist is one field value, so send the whole `gates` array back, never only the ticked item. Post one comment with the delta: `create {kind: "comment", id, body}`. Never close over an unanswered decision. That is the escalation, and the hand-back names it.

## Never

- Never create epics, workstreams or workers from here — this verb reads and closes.
- Never mark a gate done without a URL or task id as evidence.
- Never summarise routine progress to the user. Report only decisions, blockers, irreversible choices and conflicting evidence.
