---
name: actions
description: "Manual only: use when explicitly invoked as `/actions`. Detects the repo's GitHub Actions, watches the run for the current branch, and on failure diagnoses → fixes → pushes → re-watches until green."
---

# git:actions — autonomous CI watch + fix loop

The user opted in by invoking the slash command. This skill makes CI **just work**: it
auto-detects the repo's workflows, watches the run for the current branch's head commit,
and on failure diagnoses the root cause, fixes it (writing a failing test first when the
failure is a test), pushes, and re-watches — until the run is green or a give-up cap is hit.

Composes:
- `~/.claude/skills/git/_shared/round.md` — safety guardrails + stop discipline.
- `~/.claude/skills/git/_shared/output.md` — full-clickable-link summaries (run + commit URLs).
- `superpowers:systematic-debugging` — diagnose from logs before touching code.
- `superpowers:test-driven-development` — failing test first when the failure is a test.

## Usage

```
/actions [--once] [--workflow <name>]
```

`--once` watches the current run once and stops after reporting (no fix loop).
`--workflow <name>` restricts to a single workflow by its `name:`.

## Procedure

1. **Detect workflows:**
   `node ~/.claude/skills/git/_shared/bin/github-io.ts detect-workflows`
   → JSON `[{name, path}]` from `.github/workflows`. If `--workflow` is set, keep only
   that one. If the list is empty → report "no GitHub Actions workflows in this repo" and STOP.
2. **Find the run:** `git rev-parse HEAD` → head SHA. Then
   `node …/github-io.ts find-run --sha <sha>` → the run(s) for that commit. If none yet
   (CI not started), schedule a re-check via `ScheduleWakeup` (short cadence, e.g. 60s)
   and stop this round; the next firing retries.
3. **Watch:** `node …/github-io.ts watch-run --runId <id>` (blocks; `--exit-status` makes a
   failed run exit non-zero). On success → report green (with the run URL per `output.md`) and STOP.
4. **On failure — diagnose:** `node …/github-io.ts failed-logs --runId <id>` → read the
   failing-job logs. Diagnose the root cause with `superpowers:systematic-debugging`
   (find the cause; don't pattern-match the first error line).
5. **Fix + push:** apply the fix (failing test first if it's a test failure), run the
   repo's local checks, then push — honoring every guardrail in `round.md`
   (current branch only, worktree-not-checkout, never force-push, never push a protected branch).
6. **Re-watch:** go back to step 2 for the new head SHA. Repeat until green.

## Stop discipline (per `round.md`)

- Green run → done.
- N fix attempts on the **same failing job** (default 3) → STOP; no infinite CI-burning.
  Report the still-failing job with its run URL.
- Infra / flaky failure (timeout, runner error, network) → `node …/github-io.ts
  rerun-failed --runId <id>` once; if still red, STOP and report.
- User interrupt.

## Hard rules

- All `round.md` safety guardrails are non-negotiable.
- Diagnose before editing — never push a speculative fix without a logs-grounded cause.
- Subagents run on Opus.
- Summaries use full clickable links (`output.md`): the run URL and each fix commit URL,
  de-duped — never a bare run number.
- Write no files beyond code changes.
