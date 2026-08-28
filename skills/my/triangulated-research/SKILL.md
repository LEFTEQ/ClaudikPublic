---
name: triangulated-research
description: "Research-first answering via `$triangulated-research` or `/research` — triangulates current sources (4 parallel subagents + contrarian check) before answering."
---

# research — Research-first answering

Hard stop before answering: gather current evidence from multiple source classes, run a contrarian check, *then* answer. Output serves either the user ("teach me X") or the AI itself (recommendations must come from fresh sources, not memory).

## When NOT to use this skill

- **Trivial how-to question** ("how do I `git rebase`?") — answer directly.
- **Refine an idea via dialogue** — `superpowers:brainstorming`.
- **Walk through a decision interactively** — `/qna` (`~/.claude/skills/my/qna/SKILL.md`).
- **Challenge a claim already on the table** — `my:push-back`.

This skill is for *open research questions* benefiting from current sources.

## Workflow — 5 phases

### Phase 1: Scope (~10s)

1. **Topic + sub-questions.** Write a one-sentence topic line.
2. **Stack context.** Read `CLAUDE.md` if present. Detect framework versions from `package.json` / `composer.json` / `go.mod` / `requirements.txt` / `Cargo.toml`. Build a one-line `stack-summary` (e.g. `"Expo SDK 51, RN 0.74, TS 5"`).
3. **Output mode.** Match phrasing against the table in `references/output-modes.md`. If ambiguous, ASK once: `"Do you want this taught (long-form explanation), or as a decision brief (options + recommendation)?"` — don't guess.

Announce: `"Researching {topic} — dispatching 4 parallel sources, ~2-3 minutes."`

### Phase 2: Fan-out research (~2-3 min)

Read `references/subagent-briefings.md` now (not before).

Dispatch all 4 subagents **in parallel** via a SINGLE message with four `Agent` calls. Each:

- Omit `model` — subagents inherit the session model (global CLAUDE.md mandate; never pin cheaper)
- `description`, `prompt`, `subagent_type` per the briefing templates (Explore for project-context, general-purpose for the others)
- Do NOT pass `isolation: "worktree"` — read-only dispatches.

The 4 subagents:

1. **Official-docs** — Tier-1 sources (react.dev, MDN, RFCs, etc.)
2. **Secondary-sources** — reputable blogs, GitHub issues, conference talks
3. **Project-context** — grep / read the current repo
4. **Contrarian** — receives a one-line likely-consensus preview (a single sentence you write BEFORE dispatching from the topic + your prior, e.g. `"Use React Query for all server state."`) and argues against it

#### Concision enforcement + tool-loading re-dispatch

Each briefing carries a hard ≤300-word contract AND a preflight to load deferred web tools via `ToolSearch` before refusing. After each brief returns:

1. Count words. Check structure (`## Top 3 findings` / `## Sources` / `## Confidence`).
2. **If the subagent refused with "I don't have WebFetch / WebSearch":** re-dispatch with this prepended:
   > **You skipped the preflight.** WebFetch and WebSearch are DEFERRED — not in your initial toolset; load them explicitly. Call `ToolSearch` with `query: "select:WebFetch,WebSearch"`, then proceed. Do not refuse again without trying this first.
3. **If violated for concision / structure:** re-dispatch ONCE with the addendum from `references/subagent-briefings.md` (Re-dispatch protocol).
4. Second attempt also fails → accept and note the violation in Phase 3.

### Phase 3: Synthesize (~20s)

Internal synthesis (not shown to user yet):

- **Consensus:** what 3+ sources agree on
- **Contradictions:** where official-docs and contrarian disagree → which is right for the user's stack version?
- **Project-specific:** what changes given the user's actual code / conventions?
- **Recommendation seed:** one-line answer grounded in the user's stack

Unresolved contradictions get surfaced in the output, not hidden.

### Phase 4: Deliver

Read `references/output-modes.md` now (not before).

Produce the answer in the Phase-1 mode, using that mode's format spec verbatim — no hybrids. Inline-cite: every factual claim gets a URL on its first appearance.

### Phase 5: Open the door

End with exactly one line:

> Want me to dig deeper on any of these, or move to implementation?

Nothing more.

## Delegation map

OWNS: research orchestration, source triangulation, contrarian check, mode-adaptive output.

DELEGATES:

| To | When |
|---|---|
| `superpowers:writing-plans` | User accepts the recommendation and wants to implement |
| `superpowers:test-driven-development` | Implementation follows |
| `my:push-back` | User pushes back on the recommendation itself |

## References (loaded on-demand)

- `references/subagent-briefings.md` — load in Phase 2. The 4 briefing templates + concision contract + re-dispatch protocol.
- `references/output-modes.md` — load in Phase 4. The 3 format specs + mode detection table.

## Red flags — you're doing it wrong if

- You started writing the answer before Phase 2 completed
- You skipped the contrarian subagent because "the consensus seems clear"
- A subagent returned 800 words of prose and you accepted it without re-dispatching
- You ignored the project-context findings and gave generic best-practices
- You mixed two output modes — pick one
- You ended without the closing line, or replaced it with a summary

## Cost note

A full run dispatches 4 subagents in parallel, each WebFetching or grepping; typically 3-8× a normal answer. The user opted in by invoking the skill — proceed.
