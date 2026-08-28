---
disable-model-invocation: true
name: to-skill
description: "Distill an intention or this session's proven method into a durable skill in ~/.claude/skills/ — routes skill-vs-command first, settles structure via Q&A, then scaffolds."
---

Turn an intention into a durable skill — sibling of /to-command, for capabilities too big or too resource-backed for a single command file.

## 1. Intent

Index the session: the user's point beneath the phrasing, and the proven method if one emerged (encode how we actually did it, not the first attempt). `$ARGUMENTS` steers what to extract; the session supplies substance. Fill: "When this skill fires, the session ___." Can't fill it crisply → ask ONE question.

## 2. Routing gate

Command instead if: single-file intention, user-typed trigger, no supporting resources. Skill if ANY of: companion files (references/, scripts/, templates/), should fire automatically on matching tasks, or an engine multiple commands share. Verdict "command" → hand off to /to-command. Borderline → make it a question in step 3.

## 3. Q&A (AskUserQuestion, batched — escalate to /qna for big scope)

Settle at minimum:

- **Auto-invocable or manual-only?** Decides the frontmatter (step 4).
- **Structure:** one lean SKILL.md, or SKILL.md + references/ loaded per-phase (SKILL.md orchestrates, references carry the bulk, one level deep)? Scripts for the deterministic parts?
- **Front door:** thin command stub in `~/.claude/commands/<name>.md`? Required if the skill dir can't be top-level — nested `skills/my|me/*` never register; stub Reads the SKILL.md by absolute path.
- **Name:** kebab, collision-checked against existing skills AND commands.

## 4. Draft under doctrine

Write for a very smart model. Per line: would it act differently without this line? No → delete.

- Goal + constraints, not steps. Steps only where order genuinely matters or the operation is fragile (then exact commands, low freedom); high freedom everywhere else.
- Never explain why an instruction exists, narrate hypotheticals, or restate default behavior (verification, self-correction, brevity, scope discipline — already covered by model + harness).
- Never instruct the model to echo or explain its reasoning in output.
- Compression is token-measured, clarity-first: cut filler, hedging, duplicates; symbols only when genuinely fewer tokens and unambiguous; never drop a not/never/only/except.
- Consistent terminology; no time-sensitive facts; SKILL.md body < 500 lines; no model pinning.

Frontmatter:
- Auto-invocable → description in third person: what it does + when it fires, concrete trigger terms. It's the entire standing context cost — every session pays it.
- Manual-only → `disable-model-invocation: true` + short human-facing description. Never spend description tokens saying "manual only".

Then run the reviewer loop from `~/.claude/commands/distill.md` (Flow step 2) on the draft — converge, keep the metrics for delivery. No user round-trips inside the loop.

## 5. Confirm, scaffold, deliver

Show the full SKILL.md + directory tree (each planned reference/script with a one-line purpose) + token count. AskUserQuestion: **Approve** / **Tweak** / **another /qna round**. Never scaffold unconfirmed. On approve: create `~/.claude/skills/<name>/` (+ references, scripts, command stub as chosen). Deliver the file tree, invocation(s), one concrete moment a session would reach for it, and that a fresh session registers it.
