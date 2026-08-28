# Output Modes — `research`

Phase 1 infers ONE mode from request phrasing; Phase 4 produces output in that mode per these specs.

## Mode detection (Phase 1)

| Request phrasing contains… | Mode |
|---|---|
| "teach me", "explain", "I don't know how", "help me understand", "walk me through" | **teach-me** |
| "should we use", "A or B", "which is better", "compare", "evaluate options" | **options-recommendation** |
| "what's the architecture", "how should we structure", "design X", "approach for", "right pattern for" | **architecture-brief** |

If ambiguous, ask the user: "Do you want this taught (long-form explanation), or as a decision brief (options + recommendation)?"

---

## Mode 1: Teach-me

The `/me:teachme` 4-beat format (`commands/me/teachme.md`):

1. **What was being asked / the situation** — restate in plain language
2. **Why it matters / context** — the gap, the trade-off, the definitions
3. **The state / answer / decision** — what's actually true now
4. **Implication** — what this means going forward

**Plus:**
- **Inline citations** — every factual claim gets a parenthesized source URL on its first appearance: `(react.dev/learn/state-management)`
- **Version notes called out** — if a finding is version-specific, bold-tag it: **In Expo SDK 50+:** …
- **End with** the standard teach-me closing: Bottom line / Open items / next-step question.

**Example skeleton:**

```markdown
## What you asked

You want to know whether to use Context or Redux for [thing] in your Expo app.

## Why this is even a question

[2-4 sentence framing of the trade-off, with definitions of any acronyms.]

## What's actually true

**Official guidance** (react.dev/learn/managing-state): …
**Real-world practice** (engineering blogs, 2025): …
**In your stack** (Expo SDK 51, found in `apps/mobile/src/state/`): …
**Contrarian view:** …

## Implication

[1-2 sentences on what this means for the user's next decision.]

**Bottom line:** [one-sentence headline].
**Open items:** [anything unresolved, if any].
**Next step:** [direct question offering the concrete next action].
```

---

## Mode 2: Options-recommendation

A decision brief. Use when the user is choosing between known alternatives.

**Structure:**

```markdown
## Question

[1-sentence restatement of the decision.]

## Options

### Option A: [Name]
- **What it is:** [1 sentence]
- **Pros:** [3-5 bullets, ≤15 words each]
- **Cons:** [3-5 bullets, ≤15 words each]
- **Fits your stack because / despite:** [stack-specific note from project-context findings]

### Option B: [Name]
[Same structure.]

### Option C: [Name] (if applicable)
[Same structure.]

## Recommendation

**Use Option [X]** because [stack-specific reason grounded in project-context findings, not generic].

## Contrarian counterpoint

[1-3 sentences from the contrarian subagent. Only include if it found credible dissent.]

## How to apply

[3-6 numbered steps with file paths from the project-context findings where possible.]

**Sources:** [bullet list of URLs from all subagent briefs, de-duplicated.]
```

---

## Mode 3: Architecture-brief

For higher-level "how should we structure X" questions. Heavier on trade-offs and migration cost.

**Structure:**

```markdown
## Goal

[1-2 sentences describing what's being architected and why.]

## Constraints

[Bullet list — pulled from project-context findings + user's stack version.]
- [Constraint 1, e.g. "Must work offline-first (existing pattern in `apps/mobile/src/sync/`)"]
- [Constraint 2]
- …

## Options

| Option | Approach | Effort | Risk | Reversibility |
|---|---|---|---|---|
| A | [1-line] | low/med/high | low/med/high | easy/hard |
| B | [1-line] | … | … | … |
| C | [1-line] | … | … | … |

## Trade-offs (detailed)

### Option A: [Name]
[2-3 sentences on the deeper trade-off — what you give up, what you gain.]

### Option B: [Name]
[Same.]

### Option C: [Name]
[Same.]

## Recommendation

**Option [X]** for these reasons:
1. [stack-specific reason]
2. [stack-specific reason]
3. [counterpoint from contrarian acknowledged + dismissed OR mitigated]

## Migration path (if changing existing structure)

[Numbered, file-path-anchored steps.]
1. [Step with file path]
2. …

## What we explicitly chose NOT to do

[2-4 bullets on rejected options + why — prevents future re-litigation.]

**Sources:** [bullet list of URLs.]
```

---

## Closing line (all three modes)

After the body, add exactly one line:

> Want me to dig deeper on any of these, or move to implementation?
