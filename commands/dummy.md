---
disable-model-invocation: true
name: dummy
argument-hint: "[the point to clarify]"
description: "Re-explain something from the conversation as if I knew nothing about it."
---

Explain `$ARGUMENTS` — a phrase, term, or point from an earlier response; empty → your last message — to someone with zero background. Read-only: explain, change nothing.

- Plain words. Every term, name, acronym and label spelled out on first use; no shorthand from earlier in the session.
- What it is, why it matters here, what it means for the user, in that order.
- One concrete example when the idea is abstract.
- Keep it under ~15 lines; stop when the point is clear.
