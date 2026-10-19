---
name: codrive
description: 'Use when a browser flow can only finish with the human at the keyboard for identity gates — sign-in, 2FA, eObčanka/card reader, payment, consent — and every other step should be driven for them ("drive it for me, I''ll log in"). Any headed (`headless: false`) browser run routes here.'
---

Drive the browser flow in $ARGUMENTS (a URL, a parked plan, or a description) end-to-end in the **Onyx browser**: first `mcp__onyx__browser_start(session: $CLAUDE_CODE_SESSION_ID, headless: false, idle_timeout_seconds: 3600)`, then drive it with the playwright / chrome-devtools MCP tools, which attach to that same window by session lookup (`claude-guards browser` blocks them otherwise). Vault sign-ins go through `web_login` / `browser_fill` with the same `session`. Empty args → drive the flow already under discussion this session; if there is none, ask what to drive.

You drive; the human is the identity. `headless: false` moves the session into the Onyx **codrive window**: a headed Helium, separate from the headless AI browser every agent works in, carrying the Onyx extension and the AI browser's sign-ins. It opens unfocused and nothing automated ever brings it forward, so at each gate tell the user to switch to it themselves. The session's endpoint changes on the move, so refresh your element refs before your next action. With a filled login form still on screen (a 2FA gate), use chrome-devtools `take_snapshot`, never a Playwright snapshot (step 4). The first playwright / chrome-devtools call after a move can fail once ("Target page, context or browser has been closed") while the wrapper re-attaches; retry it. What they sign into there is copied back for every session.

1. Before touching the browser, restate the flow as a short gate map: which steps you click through, which need the human (login, 2FA, eObčanka/card reader, payment, biometrics, legal consent).
2. Drive every non-identity step yourself; verify each transition with a snapshot before the next action.
3. At an identity gate: stop driving, tell the user exactly what to do in the open window (which button, which card/reader), and wait for their go-ahead. If they'd rather you log in and onyx holds the credential, use onyx tooling — never handle secrets in plaintext or ask for them in chat.
   A verification code, confirmation link or password reset is **not** an identity gate — read it yourself from the shared test mailbox (below) and keep driving.
4. After each gate, confirm the new state before resuming. After a sign-in, use `browser_wait_for` on text the signed-in page shows, never a snapshot. If the login hangs, the filled form is still on screen, and a Playwright snapshot prints field values. "Filled secrets" in `~/.claude/docs/toolbox/browser.md` covers what is masked and the safe alternatives. On rejection or error, report the exact on-screen text verbatim — don't retry blind.
5. Finish with the browser left open at the end state; report what completed, what's pending, and where the flow is parked. Work that continues without the human goes back to the headless AI browser with `browser_start(session, headless: true)`, which returns the session to the tabs it left.

## Email

Every flow that needs an inbox uses one shared test mailbox, driven by the `posta` applet. Its address and app password live in the vault under the `AI Test Mailbox` group — find the item with onyx `secret_list` (query `AI test mailbox`) and pass its refs below, so no file ever names the mailbox. Never sign in to the webmail in the browser, and never ask the user to read a mail out to you.

Mint a fresh address per run and register the app under **that** address — Gmail routes every `+tag` form to the same mailbox, so a run owns an inbox nobody else reads:

```sh
posta address --project fixit --role customer --json --out /tmp/addr.json
# → <mailbox>+fixit-customer-3f9a21c0@<domain>
```

Run it through onyx so the app password is injected at the point of use, and pass `--out` — `run_command` redacts a child's entire stdout once it injects a credential, so a file is the only way the result reaches you:

```
onyx run_command
  argv     ["<absolute path of posta: command -v posta>", "wait", "--to", "<addr>",
            "--since", "10m", "--timeout", "120s", "--json", "--out", "/tmp/mail.json"]
  env_refs POSTA_ADDRESS      <the mailbox item's username ref>
           POSTA_APP_PASSWORD <the mailbox item's app_password ref>
```

Then read `/tmp/mail.json`: `links[0]` is the call to action, and `posta links --match` narrows it further. `attach --save <dir>` writes files to disk, `send` posts mail from the mailbox, `purge --to <addr>` empties a run's address afterwards.

Take the timestamp **before** the action that triggers the mail and pass it as `--since`, so a wait can never be satisfied by an earlier run's message. `purge` refuses any address without a `+tag`, so it can never touch real mail.
