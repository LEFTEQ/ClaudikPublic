---
name: whats-next
description: "Manual only: use when explicitly invoked as `/whats-next` (\"what should I do next?\"). Take the thing the assistant just said — or the current blocker — and turn it into a plain-language explanation plus concrete, triaged next steps: do now, let Claude do it, or defer to Plane / a GitHub issue."
disable-model-invocation: true
---

# `/whats-next` — What's Next?

The user just read something in this conversation they don't fully understand or don't know how to act on — typically your own previous message (follow-ups, warnings, "not automatable from here" items) or whatever is currently blocking progress. Your job: make it fully actionable, in plain language, with zero assumed context.

**Scope:** `$ARGUMENTS` if given (a quoted phrase, topic, or question pinpoints the part to explain). Otherwise default to the most recent assistant message's open items / the current blocker. If genuinely nothing in recent context is unclear or pending, say so in one line and stop.

## 1. Explain — assume no context

For the thing in scope, explain in plain language, as if the user stepped away and missed everything:

- **What it is** — spell out any artifact, file, term, or codename you (or a tool) introduced. Never reference your earlier shorthand without re-explaining it.
- **Why it exists / why it matters** — the causal chain: what created this situation, what happens if it's ignored.
- **What state it's in right now** — done, partially done, waiting on someone/something.

Keep it short but complete sentences — this section is the "explain it to me like I wasn't here" part.

## 2. Triage every open item

Break the situation into discrete action items. For each one, give exactly one verdict:

- **🟢 Do now (you)** — only the user can do it (physical action, external account, judgment call). Give exact steps: the literal commands, the specific file/place, the concrete example ("copy X to Y, e.g. `cp … …`, or put it in onyx under …"). Never "back it up somewhere" without a suggested somewhere.
- **🤖 I can do it** — automatable from this session. Say so and, if it's reversible and in-scope, just do it now rather than describing it.
- **🕐 Defer & log** — real work, but not urgent and not blocking. Recommend where it belongs (Plane issue via the plane skill, or `gh issue` in the relevant repo — pick based on which repo/project the item concerns) and offer to create it with a draft title + body.
- **🚫 Ignore** — sounds scary but needs nothing. Say so explicitly; a non-item left unlabeled keeps nagging the user.

## 3. The bottom line

End with a **"Your move"** block: the minimal ordered list of things the *user* personally must do (usually 0–3 items), each one sentence with its concrete step. Everything else you've either done, offered to do, or logged.

If any verdict is genuinely the user's call (e.g. do-now vs defer, Plane vs GitHub), ask via one `AskUserQuestion` batch with a recommended option — then execute the chosen actions (create the issue, run the automatable steps) before ending the turn.

## Rules

- No jargon, no arrow-chains, no references to unexplained earlier labels.
- Prefer doing over describing: anything reversible and automatable gets done in this turn.
- Never invent urgency — if it can safely wait, say so and log it.
