# Browser MCPs (detail)

Referenced from CLAUDE.md (**Browser**). The Onyx browser is THE browser. `claude-guards browser` enforces the start order and the screenshot directory. This file holds what no guard says.

## Start and attach

- Every browser session starts with onyx `browser_start(session: $CLAUDE_CODE_SESSION_ID)`. Use the same `session` string on every onyx browser call; read it with `printenv CLAUDE_CODE_SESSION_ID`. Only then make the first playwright or chrome-devtools call.
- The global wrappers attach to that browser by session lookup, so all three MCPs drive one Helium window. That window carries the Onyx extension, which provides autofill, save-on-submit and TOTP.
- `browser:onyx-first` blocks a third-party browser call while this session has no onyx browser. A wrapper that already spawned standalone needs `/mcp` to reattach.
- Never `pwmcp serve` or a standalone browser as a workaround. A missing onyx browser is the thing to fix.

## Headless, headed and lifetime

- Default to **headless**. It is freely scriptable, runs any number in parallel, and is immune to the occluded-window stall: a headed window that loses focus stops producing compositor frames, so screenshots hang while every other tool keeps working.
- Use `headless: false` only where a human must take the keyboard: `/codrive`, 2FA, vault sign-in.
- For any human-in-the-loop or long raw-CDP work, pass `idle_timeout_seconds: 3600`. Otherwise onyx reaps the idle profile after about 5 minutes.
- Never pass `0`. It disables idle-stop entirely and leaves the browser to the daemon's 8 h ceiling.
- Call `browser_stop` when done. The SessionEnd `claude-guards browser-teardown` hook is the backstop, not the plan.
- `just install-mcp` in the onyx repo restarts the shared server and takes every session's browser with it. Never run it mid-flow.

## Screenshots

- Browser-MCP screenshots have ONE home per repo: `.vitrinka/mcp/`, which is ignored globally in `~/.config/git/ignore`.
- Always pass the path explicitly:
  - playwright: `filename: ".vitrinka/mcp/<name>"`.
  - chrome-devtools: `filePath: ".vitrinka/mcp/<name>"`, or omit it for an inline image.
- A bare filename does NOT land in the worktree. The playwright wrapper resolves it against the MAIN checkout root, even from a worktree. If one lands there, move it into `<worktree>/.vitrinka/mcp/` at once.
- `browser:screenshot-dir` refuses any other destination.
- The onyx headless browser opens at 748×486. Call `browser_resize` to 1440×810 before any desktop screenshot meant for judging or for a board.

## Installs

- Browsers live at `~/.local/share/toolbox/playwright-browsers`.
- NEVER `rm -rf ~/Library/Caches/ms-playwright`, and never use `@playwright/mcp@latest`.
- To reclaim space, use `pwmcp prune`.

## Blocked sign-in

A blocked sign-in is never fixed by swapping browsers. The gate keys on how the browser was launched, not on which browser it is. Ladder: `~/.claude/skills/app-docs-capture/references/vendor-login-cdp.md`.

Related: `~/.claude/commands/codrive.md` (headed human-at-the-keyboard flows), `~/.claude/skills/reclaiming-disk-space/SKILL.md` (browser cache cleanup).
