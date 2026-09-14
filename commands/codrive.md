---
disable-model-invocation: true
name: codrive
description: User signals "drive it for me, I'll log in" — drive a multi-step browser flow via Playwright MCP, handing the visible browser to the user at identity gates and resuming after.
---

Drive the browser flow in $ARGUMENTS (a URL, a parked plan, or a description) end-to-end in the **Onyx browser**: first `mcp__onyx__browser_start(session: $CLAUDE_CODE_SESSION_ID, headless: false, idle_timeout_seconds: 3600)`, then drive it with the playwright / chrome-devtools MCP tools, which attach to that same window by session lookup (`claude-guards browser` blocks them otherwise). Vault sign-ins go through `web_login` / `browser_fill` with the same `session`. Empty args → drive the flow already under discussion this session; if there is none, ask what to drive.

You drive; the human is the identity. The Onyx window is visible, carries the Onyx extension, and is shared — the user acts in it directly when needed.

1. Before touching the browser, restate the flow as a short gate map: which steps you click through, which need the human (login, 2FA, eObčanka/card reader, payment, biometrics, legal consent).
2. Drive every non-identity step yourself; verify each transition with a snapshot before the next action.
3. At an identity gate: stop driving, tell the user exactly what to do in the open window (which button, which card/reader), and wait for their go-ahead. If they'd rather you log in and onyx holds the credential, use onyx tooling — never handle secrets in plaintext or ask for them in chat.
   A verification code, confirmation link or password reset is **not** an identity gate — read it yourself from the shared test mailbox (below) and keep driving.
4. After each gate, snapshot to confirm the new state before resuming. On rejection or error, report the exact on-screen text verbatim — don't retry blind.
5. Finish with the browser left open at the end state; report what completed, what's pending, and where the flow is parked.

## Email

Every flow that needs an inbox uses one shared test mailbox, driven by the `posta` applet. Its address and app password live in the vault under the `AI Test Mailbox` group — posta reads both from the refs below, so no file ever names the mailbox. Never sign in to the webmail in the browser, and never ask the user to read a mail out to you.

Mint a fresh address per run and register the app under **that** address — Gmail routes every `+tag` form to the same mailbox, so a run owns an inbox nobody else reads:

```sh
posta address --project fixit --role customer --json --out /tmp/addr.json
# → <mailbox>+fixit-customer-3f9a21c0@<domain>
```

Run it through onyx so the app password is injected at the point of use, and pass `--out` — `run_command` redacts a child's entire stdout once it injects a credential, so a file is the only way the result reaches you:

```
onyx run_command
  argv     ["~/.local/bin/posta", "wait", "--to", "<addr>",
            "--since", "10m", "--timeout", "120s", "--json", "--out", "/tmp/mail.json"]
  env_refs POSTA_ADDRESS      onyx://AI%20Test%20Mailbox/Gmail%20AI%20test%20mailbox%20%E2%80%94%20app%20password/username
           POSTA_APP_PASSWORD onyx://AI%20Test%20Mailbox/Gmail%20AI%20test%20mailbox%20%E2%80%94%20app%20password/app_password
```

Then read `/tmp/mail.json`: `links[0]` is the call to action, and `posta links --match` narrows it further. `attach --save <dir>` writes files to disk, `send` posts mail from the mailbox, `purge --to <addr>` empties a run's address afterwards.

Take the timestamp **before** the action that triggers the mail and pass it as `--since`, so a wait can never be satisfied by an earlier run's message. `purge` refuses any address without a `+tag`, so it can never touch real mail.
