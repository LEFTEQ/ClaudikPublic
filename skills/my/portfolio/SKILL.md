---
name: portfolio
description: "Portfolio lead over the vitrinka feature ledger — `portfolio <project>/<epic id>` says what remains for a feature (gates, blocked-on, next action, decisions owed); `portfolio close <project>/<epic id>` runs the closure check a merge would. Escalates decisions only."
---

# Portfolio — the feature ledger, read and closed

The epic is the feature. Its `fields` (contract: `~/.claude/docs/specs/2026-09-05-portfolio-ledger-decisions.md`) are the truth: `outcome`, `non_goals`, `gates[]{name, done, evidence}`, `decisions[]{name, done, evidence}`, `ledger_state`, `waiting_on`, `next_action`. Refs carry the evidence: handoffs (`file` refs with `meta.kind = handoff`), PRs, boards, runs.

## `portfolio <project>/<id>` — what remains

`get_task` the epic and its children (`list_tasks {parent}`), read refs and the last comments. For every PR ref check live state (`gh pr view`). Report in this order, one line each: open gates · what it waits on · next action · decisions owed by Lukáš · stale handoffs (open, no session in 7 days). Nothing invented: a gate with no evidence stays open.

## `portfolio close <project>/<id>` — the closure check

Same read, then write: gates whose evidence exists (merged PR, done child, archived handoff) get `done: true` with that evidence; every gate done → `ledger_state: closed`, else `next_action` = first open gate. One `create_comment` with the delta. Never closes over an unanswered decision — that is the escalation, named in the hand-back.

## Never

- Never create epics, workstreams or workers from here — this verb reads and closes.
- Never mark a gate done without a URL or task id as evidence.
- Never summarise routine progress to Lukáš; only decisions, blockers, irreversible choices and conflicting evidence.
