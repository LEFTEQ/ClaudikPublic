---
disable-model-invocation: true
name: browser
description: Set the macOS default web browser via the `defaultbrowser` CLI. No arg lists handlers; an arg switches.
argument-hint: "[chrome|safari|firefox|brave|opera|...]"
---

# `/browser`

Wrapper over the `defaultbrowser` CLI. Argument: `$ARGUMENTS`

Be FAST and TERSE. Do not reason out loud, do not warn about dialogs, do not read back state.

## If an argument IS given

Resolve the alias to a handler token (chrome, safari, firefox, opera, chromium, torbrowser; `brave`→`browser`; `ff`→`firefox`; `google`→`chrome`; `tor`→`torbrowser`), then run **exactly one** Bash call:

```
defaultbrowser <token>
```

Reply with a single line only: `Switched to <name>.` Nothing else.

## If NO argument is given

Run `defaultbrowser` once and print the token list as a compact one-line-per-browser list, then stop. No commentary.

## Edge cases

- Unknown/ambiguous arg → run `defaultbrowser` once, list the valid tokens, stop.
- Keep total output to a line or two. Never explain the confirmation dialog unless the command errors.
