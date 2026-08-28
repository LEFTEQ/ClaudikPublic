# `/e2e` — Design Spec

> The lean replacement for the `ui-sweep` skill family. One skill, an internal arg
> router, and a fan-out of subagents that **discover user actions → write user journeys
> → write E2E tests** (Appium/WebdriverIO for Expo-RN, Playwright for Web).

**Status:** Proposed — awaiting user review before implementation
**Date:** 2026-06-22
**Author:** lukas + Claude (brainstorm)
**Replaces:** `ui-sweep`, `ui-sweep-test`, `ui-sweep-map`, `ui-sweep-release`, `ui-sweep-dream`, `ui-sweep-handoff`, `ui-sweep-learn`, `ui-sweep-spec-writer` (8 skills), the `ui-sweep-spec-writer` agent, the `ui-sweep-dream` command, ~28 reference files, and 21 `bin/` scripts.
**Provenance:** Distilled from a 9-subagent workflow that read the entire `ui-sweep` library (~610k tokens) plus a first-hand read of `ui-sweep/SKILL.md` (863 lines) and `ui-sweep/DESIGN.md` (567 lines).

---

## 1. Why replace `ui-sweep`

`ui-sweep` is a genuinely good idea buried under machinery it accreted over two months. The root cause is stated plainly in its own `DESIGN.md §11`:

> "The goal shifted from 'produce a clean sweep report' to **'burn the full 1M token budget exhaustively testing + fixing'**, which required removing every voluntary pause and every 'done' heuristic."

Once "never stop, maximize work" became the design goal, ceremony followed: a 10-phase spine, a 4-axis coverage matrix, a 35-gate Test-Emission Checklist (Track A `A1–A10` + B + C + `X1–X7`), StrykerJS mutation gates, a versioned orchestrator↔tester wire-contract (`contractVersion 1.1`, `dispatchId=sha1`, "worst-case=9"), `fix-state.json` file-lock journals, pixel-diff visual baselines, a confidence-lifecycle state machine, a `.ai-testing/` persistence tree (blueprints + cookbook + inventory + memory chunks + baselines + per-session dirs), 6 sidecar skills, and a 21-script `spec-writer` sub-machine. The signal — *find what a user can do, journey it, prove it with a test* — is ~4 pages. The current library is ~8 skills, ~28 references, and ~3,300 LOC of shell.

**`/e2e` is the loop plus a per-feature fan-out, and almost nothing else.**

## 2. Core idea

> Take a slice of an app (default: **a git diff**, so "many features at once" is native) →
> figure out **what a real user can DO** on each affected screen → write those actions up as
> **concrete user journeys** → **drive them live** → crystallize each verified journey into a
> **runner-backed E2E test** (Playwright for Web, Appium/WDIO for Expo/RN).

One discipline underneath everything: **dual verification** — a journey passes only if the *user-visible state changed* **AND** the *backend actually processed the mutation* (not a "Saved" toast over a silent 5xx).

## 3. Goals & non-goals

**Goals**
1. Precise, source-first **action discovery** across Web (DOM) and Expo-RN (Appium accessibility tree, as a first-class peer — not a footnote).
2. Coherent **user-journey authoring**, reviewable by a human.
3. Trustworthy **E2E test emission** — deterministic, independent, stable-selector, dual-stack.
4. **Subagent fan-out** as the scaling unit: N features → N subagents.
5. **Lean footprint** — one skill, ~5 supporting files, one committed artifact per app, no `.ai-testing/` tree.

**Non-goals**
1. Exhaustive "burn the budget" sweeping. `/e2e` stops when the declared scope is journeyed + tested, not when context runs out.
2. Mutation testing, visual-regression diffing, i18n/design-token drift audits — deferred to CI / dedicated skills.
3. Cross-session "muscle-memory" caches (blueprints / cookbook / memory chunks). The specs + `journeys.md` are the memory.
4. A formal wire-contract / gate ledger. The orchestrator branches on a plain structured envelope and trusts an Opus subagent to be thorough.

## 4. Locked decisions

Each row is a brainstorm decision and the reasoning behind it.

| # | Decision | Chosen | Why |
|---|----------|--------|-----|
| Q1 | Subagent shape | **Shared discovery → fan-out emission** | One coherent journey map before any test is written; features that touch the same screen reconcile into one journey, not two conflicting specs. |
| Q2 | Where live-driving happens | **Writers drive live; mobile serial, web parallel** | Discovery stays cheap/static (fast, fan-out-able, no device). Live verification lives where the test is written, so each writer self-corrects against the real app. Mobile shares one simulator → serial; Playwright `--isolated` → parallel. |
| Q3 | Fix scope | **Auto-fix, orchestrator-only, deferred** | Writers never edit app code (keeps parallel emission safe). The orchestrator is the *sole* fixer: hard-stop errors fix mid-flight (quiesce → fix → resume); normal bugs defer to a serial fix pass after writing. |
| Q4 | Journey persistence | **Committed `journeys.md` per app** | Coverage legible in PR diffs, hand-editable, lets re-runs skip re-discovery. The one good idea from the old "blueprint" system, minus the merge protocols and frontmatter state machine. |
| Q5 | Backend-verify hook | **`.e2e.json`, auto-detect + write-back** | First run sniffs (dev script, API log path, base URL, existing apiDebugSkills) and writes a starter config to correct once; reliable + editable thereafter. Also carries boot/login/seed for the live writers. |
| Q6 | Skill structure | **One `/e2e` skill, internal arg router** | `skills/e2e/SKILL.md` registers directly (no nested-dir gotcha, no command stubs). Routes on first arg/flags, like `my:aix` / `my:cr`. |
| Q7 | Rollout | **Worktree-safe** | Build in an isolated worktree; user reviews/test-runs; deletion of the old 8 skills is a separate approved step. `~/.claude` untouched until sign-off. |

## 5. Architecture

**One skill + two inline subagent roles + an orchestrator that owns the only app-code-editing lane.**

| Piece | What it is | Notes |
|---|---|---|
| **`/e2e` (SKILL.md)** | Orchestrator, ~150–250 lines | Owns: arg routing, scope resolution, the lane scheduler, the merge into `journeys.md`, the serial fix pass, the report + local commit. The **only** thing that edits app code. |
| **discovery subagent** | Inline `Task` prompt, fanned out per feature cluster | Static only (no device). Reads router/source → returns `{routes, actions, intents, draft-journeys, testid-gaps, conflicts}`. Orchestrator merges all into `journeys.md`. |
| **writer subagent** | Inline `Task` prompt, fanned out per feature | Drives live, dual-verifies, emits one spec per journey. Web parallel / mobile serial. **Never fixes.** Returns `{journeys-verified, specs-written, findings, deferred-fixes, hard-stops}`. |

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
  │        lane scheduler:  web sem=N (Playwright --isolated)   mobile sem=1 (Appium, one sim)
  │        each writer: boot → drive journey → DUAL-VERIFY (UI state + backend log/inspect)
  │                     → ast-lint → emit spec → run-it-alone (--grep, workers=1) → green = keep
  │        journey fails (real bug) → record finding + emit .fixme() spec   (NEVER edits app code)
  │        hard-stop error → signal orchestrator
  │
  ├─ 3. FIX PASS  (serial · orchestrator = the ONLY app-code editor; skipped with --no-fix)
  │        per deferred bug: apply fix (inline ≤5 files / Task subagent if larger) → re-run that spec
  │              green → un-.fixme(), keep   |   red → revert, leave .fixme(), report
  │        (a hard-stop during 1/2 → quiesce all lanes → fix → re-verify → resume the fan-out)
  │
  └─ 4. REPORT + local commit (specs + journeys.md + verified fixes), conventional commits. No push.
```

### Concurrency model — the whole thing

The old skill's `fix-state.json` file-locks + journal + "worst-case=9" arithmetic collapse to **one rule**:

- **Appium simulator → semaphore of 1** (mobile writers run serially).
- **Playwright `--isolated` → semaphore of N** (`concurrency.web`, default 4).
- **App-code edits → semaphore of 1, held only by the orchestrator** during the fix pass (or a quiesced hard-stop fix). Writers never acquire it.

No two things ever edit app code at once; no two things ever share the simulator. That's the entire safety model.

### Dual-verify — the one mandatory rule

After every mutating action a writer:
1. Confirms the **client** half — user-visible state changed (a11y tree / DOM / `browser_network_requests` 2xx).
2. Confirms the **server** half — the mutation actually landed, via `.e2e.json.apiVerify` (tail the API log for the request + status, or hit an inspect endpoint, or query the DB).

A green client half over a silent 5xx is a **failure**, recorded as a backend-silent finding. If a project has no tail-able log and no inspect hook, `/e2e` warns once and degrades that journey to client-only (the rule can't be enforced without a hook) — surfaced in the report, never silent.

## 6. Files

### New tree (in the worktree)

```
skills/e2e/
├── SKILL.md                     # orchestrator + internal arg router  (~150–250 lines)
├── DESIGN.md                    # this doc
├── bin/
│   └── ast-lint.mjs             # PORTED — selector-safety + determinism lint (the one script worth keeping)
└── references/
    ├── appium-driver.md         # PORTED near-verbatim — Expo/RN playbook
    ├── playwright-driver.md     # PORTED near-verbatim — Web playbook
    ├── assertions.md            # NEW (distilled) — assertion vocabulary → PW + Appium/WDIO templates + determinism rules
    └── snap.sh                  # PORTED — screenshot 2000px-cap helper (evidence only)
```

### Kept / ported (≈5 files — the real signal)

| New path | Source | Treatment |
|---|---|---|
| `references/appium-driver.md` | `ui-sweep/references/appium-driver.md` | near-verbatim (dev-client/Metro reachability, E2E reset/seed before nav, one-session-per-actor, native return-flows) |
| `references/playwright-driver.md` | `ui-sweep/references/playwright-driver.md` | near-verbatim (`--isolated` mandatory, CDP fallback, login/per-page patterns) |
| `bin/ast-lint.mjs` | `ui-sweep-spec-writer/bin/ast-lint.mjs` | as-is (bans `eval`/`fs`/`process.env`/raw CSS/`.nth()`; forces testid+regex; no `Date.now`/`Math.random` in asserts) |
| `references/snap.sh` | `ui-sweep/references/snap.sh` | as-is (path refs updated to `skills/e2e/`) |
| `references/assertions.md` | NEW, distilled from `assertions.md` + `spec-emission-playwright.md` + `spec-emission-appium-wdio.md` + `determinism.md` | the closed assertion vocab (element-text, navigation, list-membership, count-delta, server-state, form-reset, toast-shown) → per-stack code templates + determinism/independence doctrine |

**Folded in as prose** (ideas absorbed into SKILL.md, not separate files): testId conventions + audit, misleading-text check (one paragraph, opportunistic), text-mode-first + screenshot discipline (one paragraph + `snap.sh`), intent-triangulation oracle, the ≤80-line handoff-digest shape (now the `journeys.md` merge format).

### Deleted (rollout stage 3, after `/e2e` is proven)

8 skills (`ui-sweep`, `-test`, `-map`, `-release`, `-dream`, `-handoff`, `-learn`, `-spec-writer`) · the `ui-sweep-spec-writer` agent · the `ui-sweep-dream` command · ~24 reference files · 20 of 21 `bin/` scripts · the `.ai-testing/` tree convention · the 35-gate checklist + Stryker/quarantine/contract/file-lock machinery.

**settings.json hooks:** the two PreToolUse hooks that (a) block raw `simctl/screencapture` and (b) block reading `.ai-testing/**/*.png` both reference `ui-sweep` paths and `source ~/.claude/skills/ui-sweep/references/snap.sh`. On deletion they must be **updated to point at `skills/e2e/references/snap.sh`** (if kept) or **removed** (guidance-over-enforcement). Decision deferred to stage 3.

## 7. `.e2e.json` schema

Committed per app (or per monorepo root with per-app `stacks`). Auto-detected + written on first run; user corrects the `# fix me` lines once.

```jsonc
{
  "boot":   "pnpm dev",                        // how to start the app
  "login":  { "web": "dev-quick-login", "mobile": "dev-client" },
  "accounts": [{ "role": "buyer", "email": "buyer@dev.local", "seed": "pnpm seed:buyer" }],
  "apiVerify": {                               // the backend half of dual-verify
    "log":     "apps/api/logs/api.log",        // tail this  (# fix me on first run)
    "inspect": "curl -s localhost:3000/__debug/last-mutation"   // OR hit this
  },
  "reset": "pnpm e2e:reset",                   // deterministic state before a run
  "seed":  "pnpm e2e:seed",
  "stacks": {
    "web":    { "driver": "playwright", "rootDir": "apps/web",    "specDir": "apps/web/e2e",   "runner": "pnpm playwright test" },
    "mobile": { "driver": "appium", "framework": "webdriverio", "rootDir": "apps/client", "specDir": "appium/specs", "runner": "pnpm wdio run appium/wdio.conf.ts" }
  },
  "concurrency": { "web": 4, "mobile": 1 }
}
```

## 8. `journeys.md` format

One committed file per app (`<app>/journeys.md`). Human-readable, hand-editable, re-read on the next run to skip re-discovery. No frontmatter state machine — just a `verified: true|false (date)` line + the spec path.

```markdown
# apps/client journeys · /e2e · base abc123..def456

## Checkout · stack: mobile · roles: [buyer]
entry: /checkout
1. add item to cart      → cart badge = 1
2. tap checkout          → nav /confirm   · backend: POST /orders 201
3. confirm               → toast "Order placed" · backend: order.status = paid
testid-gaps: cart-badge, confirm-cta
verified: true (2026-06-22) · spec: appium/specs/checkout.spec.ts

## Edit profile name · stack: web · roles: [buyer]
entry: /settings/profile
1. change name → save    → name shows on /profile · backend: PATCH /me 200
verified: false · reason: backend-silent (PATCH /me returned 500) · spec: apps/web/e2e/profile.spec.ts (.fixme)
```

## 9. `/e2e` arg router

Bare `/e2e` = full pipeline on the git diff. Routes on the first arg / flags.

| | Arg | Behavior |
|---|---|---|
| **Scope (what)** | `/e2e` | `git diff base..HEAD` → cluster into features *(default)* |
| | `/e2e <routes \| "prompt">` | explicit routes, or NL target ("the checkout flow") |
| | `/e2e --release <tag>` · `--since <sha>` | diff vs a ref (folds in old `--release`) |
| **Phase (how far)** | `--discover` | discovery pass only → `journeys.md`, stop (no device) |
| | `--write` | skip discovery; write+drive from existing `journeys.md` |
| **Behavior** | `--no-fix` | author only; skip the serial fix pass |
| | `--no-commit` | leave everything uncommitted |
| | `--web` · `--mobile` | restrict to one stack |

## 10. Honest losses (tradeoffs of going lean)

- **No cross-session per-screen muscle memory** (blueprints/nav-map gotchas). `journeys.md` recovers *some*; per-screen selector caches and login shortcuts are re-derived each run (cheap, since discovery is static).
- **No auditable completeness proof.** The 35-gate ledger is gone; we trust an Opus subagent to cover the scope. Trade: usefulness over provable exhaustiveness.
- **Bug classes this tool no longer catches:** weak assertions a mutation test would expose, pixel/layout regressions, raw-i18n-key leaks, design-token drift. Bet: those belong in CI / dedicated skills.
- **Fuzzier no-op detection.** glob+grep over existing `*.spec.ts` instead of sha256 `findingSignature` — can occasionally emit a near-duplicate.
- **Net-new design risk:** stack-native action discovery via the Appium accessibility tree. The old library was DOM-first with mobile bolted on, so there's no recipe to port verbatim — this is the one place we *design* rather than delete, and carries the most implementation risk.

## 11. Rollout (worktree-safe)

| Stage | Action | Gate |
|---|---|---|
| **1 — Build** *(current)* | In worktree `claude-e2e-skill` (branch `e2e-skill`): write this spec → user review → implementation plan → build `SKILL.md` + port 5 files. | Nothing in live `~/.claude` changes. |
| **2 — Install & prove** | Merge `e2e-skill` → `main` (installs `/e2e` live; **old 8 skills still present**). Test-run `/e2e` on a real project (FixIt web + Expo client). | `/e2e` produces a green spec + a `journeys.md` on a real app. |
| **3 — Remove sprawl** | Delete the 8 `ui-sweep*` skills + agent + command + refs + scripts; update/remove the 2 settings.json hooks. | Separate, explicit, user-approved commit. |

## 12. Open questions (deferred to implementation)

1. **Appium a11y-tree discovery recipe** — needs designing against a real Expo app (the one net-new piece). Likely a `--discover` smoke-run on FixIt's client to derive the recipe empirically.
2. **Monorepo `.e2e.json`** — one root file with per-app `stacks` vs one file per app. Lean toward root file; confirm during build.
3. **Fix-pass size cutoff** — inline (≤5 files / ≤100 LOC) vs `general-purpose` Task subagent for larger fixes (mirrors old routing). Keep the threshold, drop the ACL ceremony.
4. **`--release` scope** — fully fold the old `ui-sweep-release` clustering into `/e2e --release`, or keep release as a thin preset. Lean toward fold.
