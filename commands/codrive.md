---
disable-model-invocation: true
name: codrive
description: User signals "drive it for me, I'll log in" — drive a multi-step browser flow via Playwright MCP, handing the visible browser to the user at identity gates and resuming after.
---

Drive the browser flow in $ARGUMENTS (a URL, a parked plan, or a description) end-to-end via Playwright MCP. Empty args → drive the flow already under discussion this session; if there is none, ask what to drive.

You drive; the human is the identity. The Playwright window is shared and visible — the user acts in it directly when needed.

1. Before touching the browser, restate the flow as a short gate map: which steps you click through, which need the human (login, 2FA, eObčanka/card reader, payment, biometrics, legal consent).
2. Drive every non-identity step yourself; verify each transition with a snapshot before the next action.
3. At an identity gate: stop driving, tell the user exactly what to do in the open window (which button, which card/reader), and wait for their go-ahead. If they'd rather you log in and onyx holds the credential, use onyx tooling — never handle secrets in plaintext or ask for them in chat.
4. After each gate, snapshot to confirm the new state before resuming. On rejection or error, report the exact on-screen text verbatim — don't retry blind.
5. Finish with the browser left open at the end state; report what completed, what's pending, and where the flow is parked.
