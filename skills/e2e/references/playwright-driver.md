# Playwright MCP Driver (Web)

## CRITICAL: Always use --isolated

Playwright MCP **MUST** run with `--isolated`. Without it, the browser process locks and all subsequent tool calls fail with "Browser is already in use."

**Recovery if locked:**
```bash
pkill -f "mcp-chrome-for-testing"
sleep 1
# Then retry navigation
```

## Available tools

### Visual sweep
- `browser_navigate` — go to URL
- `browser_resize` — set viewport (width, height)
- `browser_take_screenshot` — viewport or full page (may timeout on font loading — see Screenshot strategy)
- `browser_snapshot` — accessibility tree (better for finding elements, never timeouts)
- `browser_wait_for` — wait for text/time
- `browser_close` — close browser

### Functional interaction
- `browser_click` — click element by ref
- `browser_type` — type text (use `slowly: true` for Quill editors)
- `browser_fill_form` — fill multiple form fields at once
- `browser_press_key` — press key (Enter, Tab, @, etc.)
- `browser_run_code` — arbitrary Playwright code (CDP fallback, batch operations, complex interactions)
- `browser_evaluate` — JS in page context (batching tests, checking state, inserting text via `execCommand`)
- `browser_console_messages` — runtime errors after actions
- `browser_network_requests` — verify API calls (method, URL, status, request body)

**Note:** tool names are prefixed with the MCP server name, e.g. `mcp__playwright__browser_navigate` — replace `playwright` with the active server name.

## Standard breakpoints
| Width | Height | Device |
|-------|--------|--------|
| 375 | 812 | iPhone SE / small phone |
| 768 | 1024 | iPad Mini / tablet |
| 1440 | 900 | Desktop |

## Login flow pattern
```
browser_navigate → login URL
browser_wait_for → 3s (page load)
browser_snapshot → get form refs
browser_fill_form → email + password fields
browser_click → submit button
browser_wait_for → 3s (auth + redirect)
```

## Per-page sweep pattern
```
browser_navigate → page URL
browser_wait_for → 4s (data load, wait for "Connecting..." to disappear)
browser_resize → first breakpoint
browser_take_screenshot → save as {routeId}-{width}.png
browser_resize → next breakpoint
browser_take_screenshot → save as {routeId}-{width}.png
... repeat for all breakpoints
```

## Functional test pattern
```
browser_snapshot → inventory interactive elements
browser_evaluate → batch check initial state (buttons disabled, editors exist, variables listed)
browser_evaluate → type content via execCommand('insertText') for rich editors
browser_wait_for → 2s (reactivity)
browser_evaluate → verify state changed (save enabled, preview updated, counter changed)
browser_evaluate → click save button
browser_wait_for → 3s (API call)
browser_network_requests → verify POST/PUT with correct body + 200 status
browser_navigate → reload same URL
browser_evaluate → verify content persisted
browser_console_messages → check for new errors
```

## Screenshot strategy — CDP fallback

`browser_take_screenshot` can timeout on "waiting for fonts to load" — especially after the first screenshot in a session. Fall back to CDP, which bypasses font waiting:

```
1. Try: browser_take_screenshot (5s timeout)
2. If timeout → CDP via browser_run_code:

   async (page) => {
     const session = await page.context().newCDPSession(page);
     const { data } = await session.send('Page.captureScreenshot', {
       format: 'png',
       captureBeyondViewport: false
     });
     // data is base64 — return it for external save,
     // or use Node.js fs to write directly
   }

3. Save the base64 data via Bash:
   echo "<base64>" | base64 -d > .e2e/.screenshots/file.png
```

**Alternative:** if screenshots consistently fail, use `browser_snapshot` as the primary evaluation tool — it never timeouts. Reserve screenshots for the final report only.

## Tips
- After `navigate`, always wait 3-4s for data loading; apps often show "Connecting..." or a spinner during initial load
- Geist fonts from Vercel CDN may timeout — use CDP fallback (above)
- Session expires after ~15 min of inactivity — re-login if needed
- `mkdir -p` the screenshot directory before the first screenshot
- `fullPage: true` for scrollable pages
- `browser_snapshot` (not screenshot) when you need to interact with elements
- cmdk/Command components: `page.locator('[cmdk-item]').click({ force: true })` — standard clicks may fail due to re-rendering

## Spec emission cross-reference

When `/e2e` emits Playwright specs on this driver: assertion vocabulary, code templates, and determinism rules are governed by `references/assertions.md`; the selector/safety + determinism banlist is enforced by `bin/ast-lint.mjs` before any spec is written.
