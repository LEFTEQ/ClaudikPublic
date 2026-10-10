# Login-walled vendor UIs

Google and other SSO providers reject sign-in inside automation-launched browsers ("This browser or app may not be secure"); retrying never helps. Neither does switching to another browser binary or attaching to a personal profile — a blocked sign-in is never fixed by swapping browsers. Climb this ladder:

## 1. Sign in through the Onyx browser

Start the Onyx browser for this session (`browser_start` with the session id, headless) before any playwright or chrome-devtools call, and drive every capture through it. Stored vendor credentials are filled from the vault (`web_login` / `browser_fill` with the item's handle) — never typed into chat or written into a capture script.

⚠️ Vendor session cookies are often **session-scoped — they die when the browser session ends.** Capture every state you need while the session is open.

## 2. A human must type — 2FA, SSO consent, card reader

Use the codrive skill when installed: it runs the same Onyx browser headed for the human's identity step and drives every other step for them. Without it, ask the user to finish the sign-in in a headed Onyx browser session, wait until they say they're in, then continue the capture in that same session.

## 3. Fallback: the human screenshots it

If the vendor refuses the Onyx browser even with a human at the keyboard, ask the user for manual screenshots (⌘⇧4) of the exact states, at a consistent window size (1440×810 viewport).

## Conduct inside vendor consoles

- Read-only by default: open dialogs, screenshot, **cancel** — never submit, generate, delete, or edit anything without explicit approval.
- Redact secrets visible on screen (API keys, tokens) before shipping the shot; company-account identity (brand email) may stay.
- Dump the page's innerText alongside screenshots — exact UI labels feed the docs copy.
