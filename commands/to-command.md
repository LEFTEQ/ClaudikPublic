---
disable-model-invocation: true
name: to-command
description: "Distill an intention — from this session, steered by $ARGUMENTS — into a new slash command in ~/.claude/commands/."
---

Turn a one-off intention into a durable command.

## 1. Intent

Index the session: the user's point beneath the phrasing, and the proven method if one emerged (encode how we actually did it, not the first attempt). `$ARGUMENTS` steers what to extract; the session supplies substance. Fill: "When invoked, this command makes the session ___." Can't fill it crisply → ask ONE question.

## 2. Draft under doctrine

Apply the Doctrine and the frontmatter rule from `~/.claude/commands/distill.md` — the single home for both; never restate them here. Command-specific additions: directive voice; no session-specific nouns unless they ARE the point.

Wire in `$ARGUMENTS` if the command takes input, and say what empty means. A large engine goes in a skill file the command Reads by absolute path (nested `skills/my/*` dirs don't register with the Skill tool).

## 3. Reviewer pass

Run the reviewer loop from `~/.claude/commands/distill.md` (Flow step 2) on the draft — converge, keep the metrics for delivery. No user round-trips inside the loop.

## 4. Confirm, write, deliver

Show the full draft + token count. AskUserQuestion: **Approve** / **Tweak** / **Walk through /qna** (`~/.claude/skills/my/qna/SKILL.md`, then re-show). Never write unconfirmed. On approve: create `~/.claude/commands/<kebab-name>.md`, then deliver the invocation and one concrete moment a session would reach for it.
