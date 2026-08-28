# Working Principles (detail)

Referenced from CLAUDE.md. Only non-default rules live here — general craft (think before coding, simplicity, surgical diffs, self-verification) is the model's default behavior and is deliberately not restated.

## Full Fixes, No Deferral

Trigger is *incorrectness*: wrong behavior, broken logic, crashes, meaning-changing typos — fix now, even outside the original scope. Working-but-imperfect code (style, naming, dead code, refactor opportunities) stays untouched. If a full fix is genuinely large or risky (many files, migration, public contract), surface it and propose the fix — deferral is a deliberate, user-visible decision, never a default.

## Structured Forms — Engine-Level 'Other'

Every discrete-vocabulary widget gets an auto-appended 'Other / Něco jiného' option at the renderer/engine level (single-select, multi-select, material, fixture, MCP param schemas, admin form-builders) — never per-seed, so a seed author can't forget it. Selecting it reveals an inline text field; custom text persists as a sibling key (`${slug}__other`). Per-option opt-out via `metadata.allowOther: false` only for law-constrained vocabularies (e.g. EU material categories). Why: every human-authored taxonomy is incomplete; a form that hard-blocks off-vocabulary input is strictly worse than free text. Include from the first spec draft.

## Reuse & Errors

- **DRY at 3+ implementations.** Three similar implementations mean a missed abstraction — extract on concrete duplication, never speculatively for single-use code. Document new shared code (location, purpose, usage) in the project CLAUDE.md immediately so future sessions reuse instead of duplicating.
- **Never silently swallow errors.** No bare `catch {}` / `.catch(() => undefined)`. Narrow every catch to the genuinely-expected case (ENOENT = "not there yet", malformed-JSON = recoverable-empty); log and rethrow the unexpected (EACCES/EIO/network/timeout). Map transport failures to typed exceptions (e.g. NestJS `BadGatewayException` → 502) AND log the cause — errors must never become opaque 500s. Heuristic for any catch: "what does this hide, and would an operator see a log if it fired?"

Related: `~/.claude/docs/orchestration-full.md`, `~/.claude/docs/git-safety-full.md`.
