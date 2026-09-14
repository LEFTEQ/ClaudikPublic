---
disable-model-invocation: true
name: fresh-session
description: "User wants to continue this work in a fresh session — compose a ready-to-paste initial prompt."
---

Compose the initial prompt for a fresh session that continues this one's work. Scope from $ARGUMENTS if given (one thread of the session), else the session's main thread. The deliverable is PROMPT TEXT in one fenced code block the user copies — not a file (a resumable, gated handoff is /handoff). Write it for a Claude with ZERO context — no session shorthand, no "as discussed".

## Bound vitrinka task — the task is the context

A task is bound when the branch, worktree or HEAD trailer carries `vt-<id>`, or this session claimed one. Then decisions, read-first refs, next steps and omissions live on the task, never in the prompt: land anything still unfiled with `hand_back` (vitrinka handoff skill) first. The prompt is ≤ 10 lines:

1. **Where** — the repo/worktree directory to open in.
2. **Before starting** — a gate the pickup cannot know (a PR to wait on, a service to start, a check to re-run); omit when none.
3. `/vitrinka:pickup <id|url>` — plus which NEXT row to take first when it is not the top one.

No restated decisions, no file lists, no summary of what happened.

## No task bound

1. **Where** — the directory/repo to open the session in.
2. **Intent** — the goal and what "done" looks like in 2–4 sentences, not the history.
3. **Decisions already made** — settled choices the fresh session must not re-litigate, each with its why in one clause.
4. **Read first** — full absolute paths to every file the session needs, each with a half-line "why this file". Verify each path exists (ls/glob) before listing it — never cite paths from memory.
5. **First move** — the concrete trailhead: the first task, plus known gaps flagged as such.

Under ~40 lines.

The prompt block is the last thing printed; ask nothing after it.
