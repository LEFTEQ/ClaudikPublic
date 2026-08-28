---
disable-model-invocation: true
name: open
description: "User signals 'open those files' — open the session's most recent artifact files in their associated apps (Preview, etc.), capped at the last 4."
---

Open the session's relevant artifact FILES in their associated apps (not Finder).

1. Resolve the target files with the same logic as /finder (argument = path or fuzzy hint; no argument = most recent exported/generated outputs, then changed files).
2. SAFETY CAP: if more than 4 files match, open ONLY the last 4 (most recent) and warn: "N files matched — opened the last 4" with the full list of what was skipped. Never mass-open.
3. `open <file>...` for the chosen files; print each full path on its own line.
4. Session-temp locations: same as /finder — open, note ephemerality, offer a permanent copy.
