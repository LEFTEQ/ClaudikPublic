# Working Principles (detail)

Referenced from CLAUDE.md. Only rules the harness prompt does not already carry live here (think-first, verification, progress updates, finishing the task, scope of the deliverable are its job, not ours).

## Full Fixes, No Deferral

Trigger is *incorrectness*: wrong behavior, broken logic, crashes, meaning-changing typos — fix now, even outside the original scope. Working-but-imperfect code (style, naming, dead code, refactor opportunities) stays untouched. If a full fix is genuinely large or risky (many files, migration, public contract), surface it and propose the fix — deferral is a deliberate, user-visible decision, never a default.

## Structured Forms — Engine-Level 'Other'

Every discrete-vocabulary widget gets an auto-appended 'Other / Něco jiného' option at the renderer/engine level (single-select, multi-select, material, fixture, MCP param schemas, admin form-builders) — never per-seed, so a seed author can't forget it. Selecting it reveals an inline text field; custom text persists as a sibling key (`${slug}__other`). Per-option opt-out via `metadata.allowOther: false` only for law-constrained vocabularies (e.g. EU material categories). Why: every human-authored taxonomy is incomplete; a form that hard-blocks off-vocabulary input is strictly worse than free text. Include from the first spec draft.

## Schematics over Copy-Paste

When work reveals a recurring complex scaffold (a new tenant, flow, console section, nginx surface), build or extend a template-based generator in the style of Angular schematics instead of hand-copying blocks. The manifest is the source of truth, a script renders it into tracked files, and a drift check runs in the contract or CI. Adding the next instance must come down to about one manifest line. Reference implementation: `devops-infra` `nginx/eve-tenants.list` + `scripts/gen-eve-tenant-locations.sh`.

**Enabling follow-ups ride the SAME PR.** The generator, its drift check, the recipe or docs pointer, and any small hardening the change itself revealed belong in the PR that revealed them. Never defer them to a second review cycle. Propose them before opening the PR, not after merging.

## Reuse & Errors

- **DRY at 3+ implementations.** Three similar implementations mean a missed abstraction — extract on concrete duplication, never speculatively for single-use code. Shared code earns reuse by being discoverable where it lives (naming, a package doc comment or README beside it). CLAUDE.md is operating rules — traps, contracts, conventions — never a feature ledger; what shipped and what a subsystem is are derivable from code and git. A `<repo>/.claude/memory/` project note is the home only when a fresh session would otherwise duplicate the code.
- **Never silently swallow errors.** No bare `catch {}` / `.catch(() => undefined)`. Narrow every catch to the genuinely-expected case (ENOENT = "not there yet", malformed-JSON = recoverable-empty); log and rethrow the unexpected (EACCES/EIO/network/timeout). Map transport failures to typed exceptions (e.g. NestJS `BadGatewayException` → 502) AND log the cause — errors must never become opaque 500s. Heuristic for any catch: "what does this hide, and would an operator see a log if it fired?"

Related: `~/.claude/docs/orchestration-full.md`, `~/.claude/docs/git-safety-full.md`.
