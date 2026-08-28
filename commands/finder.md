---
disable-model-invocation: true
name: finder
description: "User signals 'show me that in Finder' — open the session's most relevant directory (exports, generated files, changed code) in macOS Finder and print its full path."
---

Open the directory the user most plausibly wants to see, in Finder.

1. Resolve the target:
   - `$ARGUMENTS` given → treat it as a path (absolute, `~`, or relative to cwd) or a fuzzy hint ("the pdfs", "the worktree") matched against directories this session touched.
   - No argument → artifacts first: the directory of the most recent exported/generated output files (PDFs, reports, builds, screenshots) → else the directory of files created/edited by code changes → else the current working directory.
2. `open <dir>` — always the directory in Finder, never individual files (that's /finder:open).
3. Print the full resolved path on its own line (bare, no markdown wrapping) so it stays clickable/copyable.
4. If the location is session-scoped temp (scratchpad, /tmp): still open it, note it's ephemeral, and offer to copy the contents somewhere permanent.

Never create directories; if the resolved path no longer exists, say so and open + print the nearest existing parent instead of guessing.
