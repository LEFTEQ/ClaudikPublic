---
name: qna
description: "Interactive questionnaire via /qna — batched AskUserQuestion rounds to settled answers, /research on tap, then build. Lean sibling of vitrinka brainstorming (no board)."
---

# /qna — Interactive Questionnaire

Walk a fuzzy problem to settled answers through short AskUserQuestion rounds, then build. Lean sibling of `vitrinka:brainstorming`: same decision-led spirit, no board, no decision-map editing round. Deliverable is clarity first, working code second.

Input: `$ARGUMENTS` is the problem/topic. Empty → ask what we're working through.

## Flow

```
Frame → Question rounds (research on demand) → Synthesis → optional docs/qna/ log → Build
```

### 1. Frame (fast)

Read just enough context to ask non-generic questions: project CLAUDE.md, the files the topic touches, recent commits if relevant. Open with 2-3 sentences: how you understand the problem, and the 3-6 forks that matter, in dependency order, one line each — orientation, not an editable map. If the user objects, adjust; otherwise go straight to questions.

**Only real forks get asked.** If the codebase or the user's constraints already answer something, state it as an assumption. If the request spans independent subsystems, say so and split before burning questions.

### 2. Question rounds — batched, opinionated

`AskUserQuestion`, up to 4 questions per call. Each round asks the **frontier**: every open fork whose prerequisites are settled. A question whose best options depend on an answer still open this round waits for a later round. Recompute the frontier between rounds; done when it's empty — nothing left silently assumed. Most problems settle in 1-3 rounds.

**Facts are your job; only decisions go to the user.** A frontier question hinging on an environment fact: look it up — or dispatch a subagent and, without blocking, ask the rest of the frontier while it runs; only dependent questions wait.

Question craft:
- Lead with your recommendation: first option, "(Recommended)" suffix, description says WHY.
- Every option's description carries the tradeoff — what it costs, not just what it is.
- `preview` for structural choices (ASCII layouts, code-shape snippets, schemas); skip for plain preferences.
- The engine auto-appends "Other" — never hard-block an off-list answer.
- Between rounds, one sentence on how the answers reshaped what's left. Never re-litigate settled answers.

**Brainstorm inside the options.** For an open-ended fork, the options are the brainstorm: 2-4 genuinely different directions grounded in this project's stack and patterns — never generic textbook alternatives.

### 3. Research escalation — offered, never auto

When confidence on a fork is low (stale training data, fast-moving library, hard tradeoff you'd otherwise answer from memory), say so and make research one of that question's options:

> `{"label": "Research this first", "description": "Low confidence here — spin /research (4 parallel subagents, ~2-3 min, costs 3-8× a normal answer) and re-ask with grounded options."}`

If picked: Read `~/.claude/skills/my/triangulated-research/SKILL.md` and follow it, scoped to that sub-question (pass it as the input). On return, re-present the fork with options rewritten from the findings, citing sources in the descriptions. Continue the questionnaire.

Never dispatch research without the user picking it; never refuse it when they ask.

### 4. Synthesis

When the forks are settled, deliver in-conversation:

- **Problem** — 1-2 sentences, as finally understood.
- **Decisions** — each fork: the call + one-line why (the user's answer, not your preference).
- **Assumptions** — what you didn't ask, stated so it's contestable.
- **Recommendation / shape of the solution** — a few lines: what gets built, how the pieces fit.

**Optional log:** if the outcome is worth keeping (real design settled, research spent, decisions a future session would need), offer to save `docs/qna/YYYY-MM-DD-<topic>.md` in the project repo — synthesis content plus links to research findings. Skip the offer for throwaway explorations. Commit if the user says yes.

### 5. Build — directly

Implement in the same session straight from the synthesis (worktree if a branch is warranted). Do NOT write a separate implementation plan document — in-session task tracking is fine; a committed plan file only if explicitly requested.

## Principles

- **User leads, Claude maps.** You find the forks and do them justice; the user makes the calls.
- **Honest uncertainty.** Name low confidence and offer research.
- **Don't ask what the codebase already answers.** Obvious calls become stated assumptions.
- **Tailored, never generic** — options reference this project's actual files, patterns, constraints.
- **Speed is a feature.** Batch questions, keep synthesis short, get to code.

## When NOT to use

- Purely visual forks (competing layouts, design directions) → `vitrinka:brainstorming`.
- Open research question with no decision to walk → `/research` directly.
- Challenging a claim already on the table → `/push-back`.
