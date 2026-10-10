# `/e2e` — Design

> One skill, an internal arg router, and a fan-out of subagents that **discover user
> actions → write user journeys → write E2E tests** (Appium/WebdriverIO for Expo-RN,
> Playwright for Web).

`SKILL.md` is the operating contract — the `.e2e.json` schema, the `journeys.md`
format and the arg router live there. This document records why the skill is shaped
the way it is.

## 1. Core idea

> Take a slice of an app (default: **a git diff**, so "many features at once" is native) →
> figure out **what a real user can DO** on each affected screen → write those actions up as
> **concrete user journeys** → **drive them live** → crystallize each verified journey into a
> **runner-backed E2E test** (Playwright for Web, Appium/WDIO for Expo/RN).

One discipline underneath everything: **dual verification** — a journey passes only if the *user-visible state changed* **AND** the *backend actually processed the mutation* (not a "Saved" toast over a silent 5xx).

## 2. Goals & non-goals

**Goals**
1. Precise, source-first **action discovery** across Web (DOM) and Expo-RN (Appium accessibility tree, as a first-class peer — not a footnote).
2. Coherent **user-journey authoring**, reviewable by a human.
3. Trustworthy **E2E test emission** — deterministic, independent, stable-selector, dual-stack.
4. **Subagent fan-out** as the scaling unit: N features → N subagents.
5. **Lean footprint** — one skill, a handful of supporting files, one committed artifact per app, no persistence tree.

**Non-goals**
1. Exhaustive "burn the budget" sweeping. `/e2e` stops when the declared scope is journeyed + tested, not when context runs out.
2. Mutation testing, visual-regression diffing, i18n/design-token drift audits — left to CI / dedicated tools.
3. Cross-session "muscle-memory" caches (per-screen blueprints, selector cookbooks, memory chunks). The specs + `journeys.md` are the memory.
4. A formal wire-contract / gate ledger. The orchestrator branches on a plain structured envelope and trusts the pipeline lead to be thorough.

## 3. Decisions

| # | Decision | Chosen | Why |
|---|----------|--------|-----|
| Q1 | Subagent shape | **Shared discovery → fan-out emission** | One coherent journey map before any test is written; features that touch the same screen reconcile into one journey, not two conflicting specs. |
| Q2 | Where live-driving happens | **Writers drive live; mobile serial, web limited by the shared browser** | Discovery stays cheap/static (fast, fan-out-able, no device). Live verification lives where the test is written, so each writer self-corrects against the real app. Mobile shares one simulator → serial; web writers share the session's browser → one drives at a time while the others work from source. |
| Q3 | Fix scope | **Auto-fix, orchestrator-only, deferred** | Writers never edit app code (keeps parallel emission safe). The orchestrator is the *sole* fixer: hard-stop errors fix mid-flight (quiesce → fix → resume); normal bugs defer to a serial fix pass after writing. |
| Q4 | Journey persistence | **Committed `journeys.md` per app** | Coverage legible in PR diffs, hand-editable, lets re-runs skip re-discovery — without merge protocols or a frontmatter state machine. |
| Q5 | Backend-verify hook | **`.e2e.json`, auto-detect + write-back** | First run sniffs (dev script, API log path, base URL, existing API-debug helpers) and writes a starter config to correct once; reliable + editable thereafter. Also carries boot/login/seed for the live writers. |
| Q6 | Skill structure | **One `/e2e` skill, internal arg router** | One entry point; scope and phase are flags, not sibling skills or command stubs. |
| Q7 | Data safety | **Reset/seed only under the repo's own authorization** | Deterministic state needs resets, but a reset against shared data is unrecoverable. The repo declares what is safe; anything else is an ASK FIRST halt. |

## 4. Architecture

**One skill + two inline subagent roles + an orchestrator that owns the only app-code-editing lane.**

| Piece | What it is | Notes |
|---|---|---|
| **`/e2e` (SKILL.md)** | Orchestrator | Owns: arg routing, scope resolution, the lane scheduler, the merge into `journeys.md`, the serial fix pass, the report and the local commit. The **only** thing that edits app code. |
| **discovery subagent** | Inline prompt — a `codex` agent on the Codex sidekick, a general-purpose subagent otherwise — fanned out per feature cluster | Static only (no device). Reads router/source → returns `{routes, actions, intents, draft-journeys, testid-gaps, conflicts}`. Orchestrator merges all into `journeys.md`. |
| **writer subagent** | Inline prompt — one persistent writer per lane, fed feature by feature | Drives live, dual-verifies, emits one spec per journey. **Never fixes.** Returns `{journeys-verified, specs-written, findings, deferred-fixes, hard-stops}`. |

No separate agent-registry files, no versioned contract — the subagents return a plain structured envelope the orchestrator branches on.

### Pipeline

```
/e2e [scope] [flags]
  │
  ├─ 0. CONFIG · .e2e.json (auto-detect + write-back first run)
  │        boot · login · accounts · apiVerify{log|inspect} · reset+seed · stacks{web,mobile} · concurrency
  │
  ├─ 1. DISCOVER  (parallel · static · NO device)
  │        resolve scope → cluster into features (api+client slug-overlap merge, dependency topo-sort)
  │        fan out  discovery+testId-audit subagent per cluster ──┐
  │           each: read router/source → routes, actions,         │
  │                 inferred outcomes (router.push→nav, mutate→api,│
  │                 redirect→guard), draft journeys, testid-gaps,  │
  │                 intent-triangulation (prompt/copy/DTO/DB) → flag conflicts
  │        MERGE partial maps → unified journeys.md  (committed) ◄─┘
  │
  ├─ 2. EMIT + DRIVE  (fan-out · live)
  │        lane scheduler:  web: one live driver on the shared browser   mobile sem=1 (Appium, one sim)
  │        each writer: boot → drive journey → DUAL-VERIFY (UI state + backend log/inspect)
  │                     → ast-lint → emit spec → run-it-alone (--grep, workers=1) → green = keep
  │        journey fails (real bug) → record finding + emit .fixme() spec   (NEVER edits app code)
  │        hard-stop error → signal orchestrator
  │
  ├─ 3. FIX PASS  (serial · orchestrator = the ONLY app-code editor; skipped with --no-fix)
  │        per deferred bug within budget (≤5 files / ≤100 LOC): apply fix → re-run that spec
  │              green → un-.fixme(), keep   |   red → take the fix back out, leave .fixme(), report
  │        over budget → stays deferred, reported with its fix hint
  │        (a hard-stop during 1/2 → quiesce all lanes → fix → re-verify → resume the fan-out)
  │
  └─ 4. REPORT + local commit (specs + journeys.md + verified fixes), conventional commits. No push.
```

### Concurrency model — the whole thing

- **Appium simulator → semaphore of 1** (mobile writers run serially).
- **The session's browser → semaphore of 1 for live driving**; other web writers keep working from source meanwhile (Playwright `--isolated`; `concurrency.web` caps the writers).
- **App-code edits → semaphore of 1, held only by the orchestrator** during the fix pass (or a quiesced hard-stop fix). Writers never acquire it.

No two things ever edit app code at once; no two things ever share the simulator. That is the entire safety model — no lock files, journals or dispatch arithmetic.

### Dual-verify — the one mandatory rule

After every mutating action a writer:
1. Confirms the **client** half — user-visible state changed (a11y tree / DOM / `browser_network_requests` 2xx).
2. Confirms the **server** half — the mutation actually landed, via `.e2e.json.apiVerify` (tail the API log for the request + status, or hit an inspect endpoint, or query the DB).

A green client half over a silent 5xx is a **failure**, recorded as a backend-silent finding. If a project has no tail-able log and no inspect hook, `/e2e` warns once and degrades that journey to client-only (the rule can't be enforced without a hook) — surfaced in the report, never silent.

## 5. Files

```
skills/e2e/
├── SKILL.md                     # orchestrator + internal arg router
├── DESIGN.md                    # this doc
├── bin/
│   ├── ast-lint.mjs             # selector-safety + determinism lint, run on every emitted spec
│   └── ast-lint.test.mjs        # node --test bin/ast-lint.test.mjs
└── references/
    ├── appium-driver.md         # Expo/RN playbook (dev-client/Metro, reset/seed before nav, actors)
    ├── playwright-driver.md     # Web playbook (--isolated, CDP screenshot fallback, login/per-page patterns)
    ├── assertions.md            # assertion vocabulary → PW + Appium/WDIO templates + determinism rules
    └── snap.sh                  # screenshot downscale/crop helper (evidence only)
```

**Folded in as prose** (ideas absorbed into SKILL.md, not separate files): testId conventions + audit, misleading-text check (opportunistic), text-mode-first + screenshot discipline, the intent-triangulation oracle, the `journeys.md` merge format.

## 6. Deliberate omissions (tradeoffs of going lean)

- **No cross-session per-screen muscle memory.** `journeys.md` recovers *some*; per-screen selector caches and login shortcuts are re-derived each run (cheap, since discovery is static).
- **No auditable completeness proof.** There is no gate ledger; the pipeline lead is trusted to cover the scope. Trade: usefulness over provable exhaustiveness.
- **Bug classes this tool does not catch:** weak assertions a mutation test would expose, pixel/layout regressions, raw-i18n-key leaks, design-token drift. Those belong in CI / dedicated tools.
- **Fuzzy no-op detection.** glob+grep over existing `*.spec.ts` rather than a finding signature — can occasionally emit a near-duplicate.
- **Net-new design risk:** stack-native action discovery via the Appium accessibility tree carries the most implementation risk (see `references/appium-driver.md`).

## 7. Open questions

1. **Appium a11y-tree discovery recipe** — validate the element type/attribute names against a real Expo app on both iOS (XCUITest) and Android (uiautomator2), and tighten selectors from the observed tree.
2. **Monorepo `.e2e.json`** — one root file with per-app `stacks` vs one file per app. Leaning toward the root file.
3. **`--release` scope** — whether release clustering needs anything beyond "diff vs that ref".
4. **A real parser for the lint** — `ast-lint.mjs` is regex-based; a TypeScript-compiler-API pass would remove its false-positive/negative edges.
