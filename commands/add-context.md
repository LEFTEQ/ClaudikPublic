---
disable-model-invocation: true
description: Enrich a handoff/plan doc with session-verified context before the next session works from it
argument-hint: [path or handoff slug]
---

Target: $ARGUMENTS — a path, or a bare slug resolved against `~/.claude/handoffs/*/<slug>.md`. Empty → the doc most recently referenced this session; none → ask.

Read the doc, then collect what this session knows that its next reader won't: per repo the doc touches — current branch @ HEAD, what's merged vs. deliberately unmerged (and why), open PR state; plus decisions made, gotchas hit, assumptions disproved. Verify every state fact live (`git fetch` + status/log, `gh`) before writing — never trust session recall.

Fold each fact into the doc's matching section (handoffs follow the `/handoff` runbook shape: Intent / Affected / Prerequisites / Phases / Context / Out of scope). Facts with no home go under `## Context added <YYYY-MM-DD HH:MM>`. Where existing content is wrong in a way that would cause a wrong first move, correct it in place and list the correction in that section. Never restructure the plan, change scope, or reorder phases or their gates except to correct a stale fact inside them. Keep the doc ≤200 lines — cut additions, not the original.

Only add facts the next session would otherwise act wrongly without; skip anything derivable from the repo, CLAUDE.md, or committed docs.
