---
name: research
description: "Use when the user explicitly asks for research before an answer — '/research', 'research this', 'research it first' — or picks research for a fork in a qna round: official docs, practitioner sources, the project's own code and a contrarian pass through parallel subagents, several minutes and 3-8x a normal answer."
---

# research — Research-first answering

Hard stop before answering: gather current evidence from multiple source classes, run a contrarian check, *then* answer. Output serves either the user ("teach me X") or the agent itself (recommendations must come from fresh sources, not memory). Recognising a name is not knowing its current state — search every named tool, model, or library as the user wrote it, in at least one query, however familiar it feels.

## When NOT to use this skill

- **Trivial how-to question** ("how do I `git rebase`?") — answer directly.
- **Shape a new idea through dialogue** — a brainstorming conversation, not a research run.
- **Walk through decisions interactively** — the qna skill.
- **Challenge a claim already on the table** — the push-back skill.

This skill is for *open research questions* benefiting from current sources.

## Workflow — 4 phases

### Phase 1: Scope (~10s)

1. **Topic + sub-questions.** Write a one-sentence topic line.
2. **Stack context.** Read the repo's `CLAUDE.md` / `AGENTS.md` if present. Detect framework versions from `package.json` / `composer.json` / `go.mod` / `requirements.txt` / `Cargo.toml`. Build a one-line `stack-summary` (e.g. `"Expo SDK 51, RN 0.74, TS 5"`).
3. **Output mode.** Match phrasing against the table in `references/output-modes.md`. If ambiguous, ASK once: `"Do you want this taught (long-form explanation), or as a decision brief (options + recommendation)?"` — don't guess.

Announce: `"Researching {topic} — dispatching 4 parallel sources, ~2-3 minutes."`

### Phase 2: Fan-out research (~2-3 min)

Read `references/subagent-briefings.md` now (not before).

Dispatch the four lanes **in parallel** as subagents, all in one message:

- **Web lanes** (official-docs, secondary-sources, contrarian) need a subagent with web search and fetch tools.
- **Project-context lane** is read-only exploration of the repo — the Codex sidekick via the ccx skill when it is installed, otherwise any read-only exploration subagent.
- Don't pin a cheaper model for the lanes; let them inherit the session model.
- No worktree isolation — every lane is read-only.
- On a host without subagents, run the four lanes yourself one after another, each held to its briefing's contract.

The 4 lanes:

1. **Official-docs** — Tier-1 sources (react.dev, MDN, RFCs, etc.)
2. **Secondary-sources** — reputable blogs, GitHub issues, conference talks
3. **Project-context** — grep / read the current repo
4. **Contrarian** — receives a one-line likely-consensus preview (a single sentence you write BEFORE dispatching from the topic + your prior, e.g. `"Use React Query for all server state."`) and argues against it

#### Concision enforcement + tool-loading re-dispatch

Each briefing carries a hard ≤300-word contract AND a preflight to load deferred web tools before refusing. After each brief returns:

1. Count words. Check structure (`## Top 3 findings` / `## Sources` / `## Confidence`).
2. **If the subagent refused with "I don't have web fetch / web search":** re-dispatch with this prepended:
   > **You skipped the preflight.** The web tools may be DEFERRED — not in your initial toolset; load them explicitly (in Claude Code: call `ToolSearch` with `query: "select:WebFetch,WebSearch"`), then proceed. Do not refuse again without trying this first.
3. **If violated for concision / structure:** re-dispatch ONCE with the addendum from `references/subagent-briefings.md` (Re-dispatch protocol).
4. Second attempt also fails → accept and note the violation in Phase 3.

### Phase 3: Synthesize (~20s)

Internal synthesis (not shown to user yet):

- **Consensus:** what 3+ sources agree on
- **Contradictions:** where official-docs and contrarian disagree → which is right for the user's stack version?
- **Project-specific:** what changes given the user's actual code / conventions?
- **Recommendation seed:** one-line answer grounded in the user's stack

Unresolved contradictions get surfaced in the output, not hidden. Sources are conveyed in your own indirect speech; a phrase reproduced from a source is short and marked as a quotation.

### Phase 4: Deliver

Read `references/output-modes.md` now (not before).

Produce the answer in the Phase-1 mode, using that mode's format spec verbatim — no hybrids. Inline-cite: every factual claim gets a URL on its first appearance. The mode's last section is the end of the answer — no follow-up offer after it.

## Delegation map

OWNS: research orchestration, source triangulation, contrarian check, mode-adaptive output.

DELEGATES:

| To | When |
|---|---|
| the qna skill | The recommendation leaves several decisions to settle before building |
| the normal build flow | The user accepts the recommendation and wants it implemented |
| the push-back skill | The user pushes back on the recommendation itself |

## References (loaded on-demand)

- `references/subagent-briefings.md` — load in Phase 2. The 4 briefing templates + concision contract + re-dispatch protocol.
- `references/output-modes.md` — load in Phase 4. The 3 format specs + mode detection table.

## Red flags — you're doing it wrong if

- You started writing the answer before Phase 2 completed
- You skipped the contrarian lane because "the consensus seems clear"
- A subagent returned 800 words of prose and you accepted it without re-dispatching
- You ignored the project-context findings and gave generic best-practices
- You mixed two output modes — pick one

## Cost note

A full run dispatches 4 subagents in parallel, each fetching the web or grepping; typically 3-8× a normal answer. The user opted in by invoking the skill — proceed.
