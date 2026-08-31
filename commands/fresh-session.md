---
disable-model-invocation: true
name: fresh-session
description: "User wants to continue this work in a fresh session — compose a ready-to-paste initial prompt: exact intent, settled decisions, and full absolute paths to every file the new session must read."
---

Compose the initial prompt for a fresh session that continues this one's work. Scope from $ARGUMENTS if given (one thread of the session), else the session's main thread. The deliverable is PROMPT TEXT in one fenced code block the user copies — not a file (a resumable, gated handoff is /handoff).

Write it for a Claude with ZERO context — no session shorthand, no "as discussed". Structure, in order:

1. **Where** — the directory/repo to open the session in.
2. **Intent** — what we want in 2–4 sentences: the goal and what "done/good" looks like, not the history.
3. **Decisions already made** — settled choices the fresh session must not re-litigate, each with its why in one clause.
4. **Read first** — full absolute paths to every file the session needs (specs, entry-point sources, configs, memory files), each with a half-line "why this file". Verify each path exists (ls/glob) before listing it — never cite paths from memory.
5. **First move** — the concrete trailhead: the first task, plus known gaps/unknowns flagged as such.

Keep it under ~40 lines. End your own output by asking nothing — the prompt block is the last thing printed, ready to copy.
