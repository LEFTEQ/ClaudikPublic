# Login-walled vendor UIs (Google-SSO blocked automation)

Google rejects sign-in inside automation-launched browsers ("This browser or app may not be secure") — Playwright's launch flags and navigator.webdriver give it away; retrying never helps. Climb this ladder:

## 1. Reuse an existing session

If a work profile already holds a valid vendor session, attach and go. ⚠️ Vendor session cookies are often **session-scoped — they die when the window closes.** "Logged in, then closed the window" = logged out.

## 2. Real browser + CDP attach (the reliable path)

1. Launch the user's REAL browser binary (Helium/Chrome/Brave) as a normal process — no Playwright launch, only a debug port and a dedicated work profile (never their personal one):

   ```sh
   nohup "/Applications/Helium.app/Contents/MacOS/Helium" \
     --user-data-dir="<repo>/.vitrinka/scratch/vendor-profile" \
     --remote-debugging-port=9223 --no-first-run "https://vendor.example/" \
     > /tmp/vendor-browser.log 2>&1 & disown
   curl -s http://127.0.0.1:9223/json/version   # confirm CDP is up
   ```

   No automation fingerprints → Google SSO passes.
2. The user logs in manually and **leaves the window open** (cookie warning above). They tell you when they're in.
3. Attach and drive:

   ```js
   const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
   const page = browser.contexts()[0].pages().find((p) => /vendor/.test(p.url()));
   await page.bringToFront();
   // navigate, measure, screenshot — then browser.close() detaches, window stays
   ```

4. When done, kill the work-profile browser instance (`pkill -f "vendor-profile"`).

Half-measures that fail: Playwright-launched real binary (still flagged), re-attaching after the window closed (session gone), clicking SSO with cached Google cookies under automation (still flagged).

## 3. Fallback: the human screenshots it

If CDP also fails, ask the user for manual screenshots (⌘⇧4) of the exact states, at a consistent window size.

## Conduct inside vendor consoles

- Read-only by default: open dialogs, screenshot, **cancel** — never submit, generate, delete, or edit anything without explicit approval.
- Redact secrets visible on screen (API keys, tokens) before shipping the shot; company-account identity (brand email) may stay.
- Dump the page's innerText alongside screenshots — exact UI labels feed the docs copy.
