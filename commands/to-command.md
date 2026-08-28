---
disable-model-invocation: true
name: to-command
description: "Distill an intention — from this session, steered by $ARGUMENTS — into a new slash command in ~/.claude/commands/."
---

Turn a one-off intention into a durable command.

## 1. Intent

Index the session: the user's point beneath the phrasing, and the proven method if one emerged (encode how we actually did it, not the first attempt). `$ARGUMENTS` steers what to extract; the session supplies substance. Fill: "When invoked, this command makes the session ___." Can't fill it crisply → ask ONE question.

## 2. Draft under doctrine

Write for a very smart model. Per line: would it act differently without this line? No → delete.

- Goal + constraints, not steps; directive voice. Steps only where order genuinely matters or the operation is fragile (then exact commands); high freedom everywhere else.
- Never explain why an instruction exists, narrate hypotheticals, or restate default behavior (verification, self-correction, brevity, scope discipline — already covered by model + harness).
- Never instruct the model to echo or explain its reasoning in output.
- Compression is token-measured, clarity-first: cut filler, hedging, duplicates; symbols only when genuinely fewer tokens and unambiguous; never drop a not/never/only/except.
- No session-specific nouns unless they ARE the point; consistent terminology; no time-sensitive facts.

Frontmatter: user-typed trigger → `disable-model-invocation: true` + short human-facing description (zero context cost). Auto-invocable → third person, what it does + when it fires, concrete trigger terms — every session pays for this line.

Wire in `$ARGUMENTS` if the command takes input, and say what empty means. A large engine goes in a skill file the command Reads by absolute path (nested `skills/my/*` dirs don't register with the Skill tool).

## 3. Reviewer pass

Run the reviewer loop from `~/.claude/commands/distill.md` (Flow step 2) on the draft — converge, keep the metrics for delivery. No user round-trips inside the loop.

## 4. Confirm, write, deliver

Show the full draft + token count. AskUserQuestion: **Approve** / **Tweak** / **Walk through /qna** (`~/.claude/skills/my/qna/SKILL.md`, then re-show). Never write unconfirmed. On approve: create `~/.claude/commands/<kebab-name>.md`, then deliver the invocation and one concrete moment a session would reach for it.
