---
name: diagnosing-bugs
description: Diagnosis loop for hard bugs and performance regressions — anything where the cause isn't visible after a first look. Use when the user says "diagnose"/"debug this", reports wrong output, intermittent failures, or something slow, and the fix isn't obvious. NOT for dev-environment/tooling failures (EPERM, unreachable hosts, CLI weirdness) — that's dev-env-troubleshooting.
---

# Diagnosing Bugs

A discipline for hard bugs. Skip phases only when explicitly justified. Trivial bugs (cause visible on first read) don't need this — fix directly.

Adapted from [mattpocock/skills](https://github.com/mattpocock/skills) `diagnosing-bugs` (MIT).

When exploring, read the project CLAUDE.md and committed `.claude/memory/` notes for the area — prior sessions may have mapped this failure mode.

## Redact

**Redact every secret** in shown commands/outputs/artifacts — write `<REDACTED>`. Build loops against env vars (onyx `run_command` env_refs when the credential lives in the vault). Captured artifacts carry auth headers: quote only the lines carrying the signal. If redacted output isn't enough to diagnose, say so and ask the user.

## Phase 1 — Build a feedback loop

**This is the skill.** A **tight** pass/fail signal that goes red on _this_ bug is what bisection, hypothesis-testing, and instrumentation consume. Spend disproportionate effort here. Be aggressive; refuse to give up.

### Ways to construct one — roughly in order

1. **Failing test** at whatever seam reaches the bug — unit, integration, e2e.
2. **Curl / HTTP script** against a running dev server.
3. **CLI invocation** with a fixture input, diffing stdout against a known-good snapshot.
4. **Headless browser script** (Playwright) — drives the UI, asserts on DOM/console/network.
5. **Replay a captured trace** — save a real request/payload/event log, replay through the code path in isolation.
6. **Throwaway harness** — minimal subset of the system (one service, mocked deps) exercising the bug path with one call.
7. **Property / fuzz loop** — for "sometimes wrong output", run 1000 random inputs.
8. **Bisection harness** — bug appeared between two known states: automate "boot at state X, check" so `git bisect run` works. 🚨 Bisection checks out commits — never in the primary checkout; use a `.worktrees/` worktree.
9. **Differential loop** — same input through old vs new version (or two configs), diff outputs.
10. **HITL bash script** — last resort; a human must click, so drive _them_ with `scripts/hitl-loop.template.sh` (in this skill dir); captured output feeds back to you.

### Tighten the loop

- Faster? (Cache setup, skip unrelated init, narrow test scope.)
- Sharper signal? (Assert the specific symptom, not "didn't crash".)
- More deterministic? (Pin time, seed RNG, isolate filesystem, freeze network.)

A 2-second deterministic loop is a debugging superpower; a 30-second flaky one barely beats none.

### Non-deterministic bugs

Goal: a **higher reproduction rate**, not a clean repro. Loop the trigger 100×, parallelise, add stress, narrow timing windows, inject sleeps. 50% flake is debuggable; 1% is not — raise the rate until it is.

### When you genuinely cannot build a loop

Stop and say so; list what you tried. Ask for: (a) access to an environment that reproduces it, (b) a redacted captured artifact (HAR, log dump, core dump, timestamped screen recording), or (c) permission to add temporary instrumentation — production instrumentation only with explicit sign-off, never a change the Hard Safety Rules gate. Do **not** hypothesise without a loop.

### Completion criterion — a tight loop that goes red

Done when you can name **one command** (script path, test invocation, curl) you have **already run at least once** (show invocation + redacted output) that is:

- [ ] **Red-capable** — drives the actual bug path and asserts the **user's exact symptom**; goes red on this bug, green once fixed. Not "runs without erroring".
- [ ] **Deterministic** — same verdict every run (flaky bugs: pinned high reproduction rate).
- [ ] **Fast** — seconds, not minutes.
- [ ] **Agent-runnable** — unattended; a human only via the HITL template.

Reading code to build a theory before this command exists is the exact failure this skill prevents. No red-capable command, no Phase 2.

## Phase 2 — Reproduce + minimise

Run the loop; watch it go red. Confirm:

- [ ] The failure is the one the **user** described — not a nearby different one. Wrong bug = wrong fix.
- [ ] Reproducible across runs (or at a debuggable rate).
- [ ] The exact symptom (error message, wrong output, slow timing) is captured for later fix verification.

### Minimise

Shrink to the **smallest scenario that still goes red**: cut inputs, callers, config, data, steps **one at a time**, re-running after each cut. Done when **every remaining element is load-bearing** — removing any one makes it go green. This shrinks the Phase 3 hypothesis space and becomes the Phase 5 regression test.

Do not proceed until reproduced **and** minimised.

## Phase 3 — Hypothesise

Generate **3–5 ranked hypotheses** before testing any — single-hypothesis generation anchors on the first plausible idea. Each must be **falsifiable** with a stated prediction:

> "If <X> is the cause, then <changing Y> will make the bug disappear / <changing Z> will make it worse."

No prediction = a vibe — discard or sharpen.

**Show the ranked list to the user before testing** — they often re-rank instantly or have ruled hypotheses out. Don't block on it; proceed with your ranking if they're AFK.

## Phase 4 — Instrument

Each probe maps to a specific Phase 3 prediction. **One variable at a time.** Tool preference:

1. **Debugger / REPL** if the env supports it — one breakpoint beats ten logs.
2. **Targeted logs** at the boundaries that distinguish hypotheses.
3. Never "log everything and grep".

**Tag every debug log** with a unique prefix, e.g. `[DEBUG-a4f2]` — cleanup becomes one grep.

**Perf branch.** For performance regressions, logs are usually wrong: establish a baseline measurement (timing harness, `performance.now()`, profiler, query plan), then bisect. Measure first, fix second.

## Phase 5 — Fix + regression test

Write the regression test **before the fix** — but only at a **correct seam**: one exercising the **real bug pattern** as it occurs at the call site. A too-shallow seam (single-caller test when the bug needs multiple callers, unit test that can't replicate the triggering chain) gives false confidence.

**No correct seam = that itself is the finding.** Note it; the architecture is preventing the bug from being locked down.

If one exists:

1. Turn the minimised repro into a failing test at that seam.
2. Watch it fail.
3. Apply the fix.
4. Watch it pass.
5. Re-run the Phase 1 loop against the original un-minimised scenario.

One focused regression test, not a suite.

## Phase 6 — Cleanup

Required before declaring done:

- [ ] Original repro no longer reproduces (re-run the Phase 1 loop)
- [ ] Regression test passes (or absence of seam documented)
- [ ] All `[DEBUG-...]` instrumentation removed (`grep` the prefix)
- [ ] Throwaway harnesses/prototypes deleted (or moved to a clearly-marked debug location)
- [ ] The correct hypothesis stated in the commit / PR message
