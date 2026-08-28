---
name: e2e
description: "Use when QA-ing or writing end-to-end UI tests — sweeping a git diff/release or a named route/flow — by driving the app live and emitting runner-backed tests (Playwright for web, Appium/WebdriverIO for Expo/React Native). Runs autopilot end-to-end and commits."
---

# /e2e — discover → journey → test

`/e2e` takes a slice of an app (default: the current **git diff**), maps **what a real user can do** on each affected screen into **user journeys**, drives them **live**, and crystallizes each verified journey into a **runner-backed E2E test** — Playwright for Web, Appium/WebdriverIO for Expo-RN.

**The one mandatory rule — dual-verify.** A journey passes only if the *user-visible state changed* **AND** the *backend actually processed the mutation* (not a "Saved" toast over a silent 5xx).

**Lean by construction.** Durable output is the `*.spec.ts` files + one committed `journeys.md` per app. `/e2e` **never** writes an `.ai-testing/` tree, blueprints, cookbook, inventory, memory chunks, or baselines. The specs are the memory; staleness shows up as a failing test.

## Autonomy — autopilot is the default

You were invoked; the user already said yes. Run the whole pipeline (discover → journey → drive → fix → report → commit) **end-to-end, no check-ins**. Never send "shall I proceed / let me know if / before I move on" mid-run; resolve it or record a finding and keep going. Fabricating a missing input is never "resolving" it.

**JUST DO IT (no asking):** start/restart the dev server, run the project's reset/seed, switch accounts, install missing test deps, dispatch the discovery + writer subagents, emit + run specs, apply fixes (Phase 3), commit. Pick the obvious reading of a near-ambiguous journey and note it.

**ASK FIRST — the only legitimate halts:**
1. A destructive op against a non-disposable/shared backend (prod, shared staging, or a reset not provably scoped to e2e seed data).
2. A missing REQUIRED input under a phase gate (`--write` with no `journeys.md`).
3. The same spec still failing after ≥2 honest, different fix attempts.
4. An irreversible, correctness-affecting ambiguity (two valid readings AND the choice can't be undone).

Hit one mid-run → finish what you can, commit it, then ask **only** about that exit.

## Dual-verify

A mutation step passes only if the UI changed **and** the backend accepted it. Three traps it must survive:

- **Optimistic UI is not the client half.** A name flip + "Saved" toast that renders before the server confirms proves nothing. For optimistic flows, require reconciliation — reload/invalidate and re-assert the value survives, OR observe the mutation request resolve 2xx in the network log. A value that reverts on reload, or a mutation that 4xx/5xx, is a **failure**.
- **A present-but-dead hook is not graceful degradation.** Degrade-to-client-only is allowed ONLY when the project exposes NO log AND NO inspect AND no server-state endpoint (a static config fact). A configured hook that's moved / 404 / errors / slow is a **backend-unverifiable finding**, not a degrade — first fall back to a `server-state` read via the network log / `page.request`; if nothing proves the mutation, the journey is `verified: client-only`, never `true`.
- **Network status overrides the log.** Before consulting `apiVerify.log`, check `browser_network_requests` (web) / the WDIO proxy (mobile) for the journey's mutation request. ANY 4xx/5xx on it is a dual-verify **failure** even if the UI shows success — emit `.fixme()` with reason `backend-silent (<METHOD> <PATH> <status>)` and record a finding.

When dual-verify genuinely can't reach a backend (no hook of any kind), warn **once** in Phase 0 the instant the config is read, mark affected journeys `verified: client-only`, and record one backend-silent finding per journey — never `verified: true`.

## Arg router

Bare `/e2e` = full pipeline on `git diff <base>..HEAD`. Route on the first arg / flags:

| Arg | Behavior |
|---|---|
| `/e2e` | scope = `git diff <base>..HEAD` → cluster into features *(default)* |
| `/e2e <routes \| "prompt">` | explicit routes (`/checkout,/profile`), or an NL target ("the checkout flow") |
| `/e2e --release <tag>` · `--since <sha>` | scope = diff vs that ref |
| `--discover` | run Phase 1 only → write `journeys.md`, stop (no device) |
| `--write` | skip Phase 1; drive + emit from the existing `journeys.md` — **requires** it to exist; if missing, STOP and say to run `/e2e --discover` first (inline source-derivation IS discovery, forbidden here) |
| `--no-fix` | author only; skip Phase 3 (the fix pass) |
| `--no-commit` | leave everything uncommitted |
| `--web` · `--mobile` | restrict to one stack |

**Scope precedence:** explicit routes/prompt arg > `--release`/`--since` > default git diff. `--discover`/`--write` are phase gates orthogonal to scope.

## Phase 0 — Config (`.e2e.json`)

Read `.e2e.json` from the repo root (or the app dir in a monorepo). It carries everything the live drivers need plus the dual-verify hook:

```jsonc
{
  "boot":  "pnpm dev",
  "login": { "web": "dev-quick-login", "mobile": "dev-client" },
  "accounts": [{ "role": "buyer", "email": "buyer@dev.local", "seed": "pnpm seed:buyer" }],
  "apiVerify": { "inspect": "curl -s localhost:3000/api/v1/e2e/state", "log": "logs/api.log" },  // prefer a project e2e-state endpoint / E2E API client; in a monorepo the log + harness often live at repo ROOT, not under an app dir
  "reset": "pnpm e2e:reset",  "seed": "pnpm e2e:seed",
  "stacks": {
    "web":    { "driver": "playwright", "rootDir": "apps/web",    "specDir": "apps/web/e2e",   "runner": "pnpm playwright test", "fixtureImport": "@/e2e/fixtures" },
    "mobile": { "driver": "appium", "framework": "webdriverio", "rootDir": "apps/client", "specDir": "appium/specs", "runner": "pnpm wdio run appium/wdio.conf.ts" }
  },
  "concurrency": { "web": 4, "mobile": 1 }   // mobile is ALWAYS 1 (skill-enforced, see lane scheduler); only "web" is tunable
}
```

**First run, no `.e2e.json` → auto-detect + write-back, never block.** Sniff: `boot` (CLAUDE.md cmd → `package.json` scripts → expo/next defaults); `apiVerify` — **prefer a project E2E API client / `…/e2e/state` endpoint** (the cleanest server-state surface) for `inspect`, falling back to a log path (search the repo ROOT too: `logs/*.log`, `*.log`, `apps/*/logs/*.log`); base URL by probing the booted app — **under `--discover` there's no boot, so leave it `# fix me`**; reuse any existing project `apiDebugSkills`. Detect stacks from `app/` (Expo Router → mobile/appium) and `apps/web|pages/` (→ web/playwright); **in a monorepo the `appium/` harness + logs often sit at the repo ROOT, not under an app's `rootDir`.** Write a starter `.e2e.json` with `# fix me` on anything you guessed, tell the user once, and proceed with best-guesses. A missing field degrades gracefully (see Dual-verify); it never halts the run. **On EVERY run (not just the first), preflight the live hooks:** confirm `apiVerify.log` resolves to a readable file and/or `apiVerify.inspect` returns non-error. A present-but-dead hook (path moved, endpoint 404) is re-sniffed, hot-patched into `.e2e.json` (or `# fix me`), warned once, and recorded as a configuration finding — never silently trusted.

## Phase 1 — Discover (static, parallel, no device)

1. **Resolve scope** → a file list. For a diff, `git diff <base>..HEAD --name-only`, filter to app code.
2. **Cluster into features.** Group by feature directory; **merge** an api segment with a client segment when their slugs overlap >50% (e.g. `apps/api/comments` + `apps/client/screens/comments` → one cluster). Topo-sort by dependency.
3. **Fan out one discovery subagent per cluster** (parallel — these are static, so no device contention). Dispatch each as a `Task` (general-purpose) with this brief:

   > Static analysis only — **do not** launch any device/browser/MCP. For cluster `<files>`: read the router + source and return JSON `{routes[], actions[], intents[], journeys[], testidGaps[], conflicts[]}`.
   > - **routes**: every screen/route the cluster reaches (Expo Router `app/`, Next `app/`/`pages/`, React Router, React Navigation).
   > - **actions**: each interactive element (`Pressable`/`Touchable`/`button`/link/form/sheet-trigger) → its `testID`/role/label.
   > - **intents**: infer each action's expected outcome from source, in priority order: explicit source (`router.push`→navigation, mutate-hook/`useMutation`→apiCall, `setShowSheet`→sheet, redirect-on-`logout`→guard) > label+context > design-system convention.
   > - **journeys**: 5–15-step numbered flows (entry → actions → expected outcomes), one per persona/auth-gate where roles differ.
   > - **testidGaps**: interactive elements missing a stable `testID`/`data-testid`, and any fragile selector the existing specs rely on.
   > - **conflicts** (intent-triangulation oracle): where current code disagrees with the prompt / product copy / DTO/OpenAPI / DB constraints — flag it; do **not** encode the bug as the expected outcome.

4. **Merge** the per-cluster returns into one unified `<app>/journeys.md` (committed). Dedup journeys that touch the same screen into one reconciled flow. Format (DESIGN §8):

   ```markdown
   # apps/client journeys · /e2e · base <sha>..<sha>
   ## Checkout · stack: mobile · roles: [buyer]
   entry: /checkout
   1. add item to cart   → cart badge = 1
   2. tap checkout       → nav /confirm   · backend: POST /orders 201
   testid-gaps: cart-badge, confirm-cta
   verified: false | client-only | true · spec: appium/specs/checkout.spec.ts
   ```

   `verified: true` requires BOTH halves observed; a journey whose backend half couldn't be checked is `verified: client-only` and MUST appear in the report's backend-silent list — never promoted to `true` (not by a Phase-3 re-verify, not by a fix).

Under `--discover`, stop here (write `journeys.md`, no commit unless asked). Otherwise continue.

## Phase 2 — Emit + Drive (live, fan-out)

**Lane scheduler — the entire concurrency model:**
- **web** writers run in parallel up to `concurrency.web` (Playwright always `--isolated`).
- **mobile** writers share **one** Appium simulator → semaphore of 1 (serial lane). This cap of 1 is **skill-enforced, not config**: ignore any `.e2e.json` `concurrency.mobile > 1` and never boot a second simulator — two Appium sessions on one device corrupt state. Non-negotiable regardless of urgency.
- **app-code edits** are a semaphore of 1 held **only by the orchestrator** (Phase 3). Writers never acquire it.

**Fan out one writer subagent per feature.** Web writers in parallel; mobile writers queued on the single lane. Dispatch each writer (`Task`, general-purpose) with this brief:

> Own this feature's journeys end-to-end. **You may NOT edit app source — only drive and write specs.**
> 1. Detect stack from `.e2e.json.stacks`. Web → Playwright MCP (`--isolated`, `references/playwright-driver.md`). Mobile → Appium/WDIO (`references/appium-driver.md`: dev-client/Metro reachability, E2E reset+seed **before** first navigation, `~testID` selectors).
> 2. Boot + login per `.e2e.json`. Reset/seed deterministic state first.
> 3. Before driving, confirm the journey's entry route still exists in source — a journey pointing at a deleted/renamed route is a `staleJourney` finding, not driven (a 404 / catch-all render is never a passing navigation). Then walk each step **text-mode-first** (a11y tree / page-source / `browser_network_requests`; screenshots only as evidence via `references/snap.sh`).
> 4. **Dual-verify every mutation** (follow the **Dual-verify** traps above): client half (UI state changed) **and** server half (`apiVerify.log` tail / `inspect` / a `server-state` assertion shows the mutation landed). A green UI over a silent 5xx is a **failure**.
> 5. Emit one spec per journey using `references/assertions.md` templates → run `node bin/ast-lint.mjs <spec> <cfg>` → fix lint violations (a missing/fragile testID is a finding for the orchestrator, NOT an edit the writer makes — emit `.fixme()` + the add-testid note) → **run-it-alone** (`--grep @e2e-<slug> --workers=1` / WDIO `--spec … --mochaOpts.grep`). GREEN → keep.
> 6. **On a real bug** (journey fails for an app reason): record a finding `{slug, step, expected, actual, evidence, stack, fixHint, files}` and emit the spec as `.fixme()`. **Do not fix.** A failing mutation (4xx/5xx) on the journey's own endpoint is ALWAYS a per-journey deferred bug here (record + `.fixme()` + continue), never a hard-stop — a 5xx doesn't stop *driving*, so it never quiesces the fan-out.
> 7. **On a hard-stop** — ANY failure that leaves the device/process unusable for later journeys on the same lane (app won't boot, login broken, or any app-process death: white-screen + Metro render error, native crash, frozen bundle, wedged simulator): stop and return `hardStop: {reason, files, fixHint}` immediately. Do NOT downgrade a process-killing crash to a step-6 `.fixme()` and drive on — the next queued journey on a serial lane can't get a clean app.
> Return `{journeysVerified[], specsWritten[], findings[], deferredFixes[], hardStops[]}`.

Update each journey's `verified:` line + `spec:` path in `journeys.md` from the writers' returns.

## Phase 3 — Fix pass (orchestrator only; skipped with `--no-fix`)

The orchestrator is the **sole app-code editor** — so fixing never collides with the parallel writers.

- **Hard-stop, mid-flight:** when a writer returns a `hardStop`, **quiesce all lanes** (let in-flight writers finish their current step, pause the rest) and **confirm every lane is paused/returned before editing any app source** (a writer re-reading half-applied code is nondeterministic), apply the fix, re-verify the blocked journey, then **resume** the fan-out. Apply the same ≤5-file/≤100-LOC budget as deferred fixes; if the fix exceeds budget or fails once, record the hardStop as a deferred finding, mark it and every journey queued behind it on that lane `blocked: hardstop-<slug>`, and continue with untouched lanes. Under `--no-fix`, a hardStop still quiesces the affected lane — never drive a queued journey into a known-dead app; mark them blocked and report.
- **Deferred bugs, after all writing completes:** for each `deferredFix`, apply it — inline if small (≤5 files / ≤100 LOC), else dispatch ONE `general-purpose` Task subagent (serial, never concurrent) — then re-run that spec. GREEN → un-`.fixme()`, keep, mark the journey `verified: true`. RED → `git restore` the fix, leave `.fixme()`, record it for the report. Never retry a failed fix more than once.

## Phase 4 — Report + commit

Consolidate: journeys verified, specs written, bugs found / fixed / deferred, **backend-silent findings** (the dual-verify catches). Commit locally — `*.spec.ts` + `journeys.md` + verified fixes — as Conventional Commits. **Never push.** Skipped with `--no-commit`.

## Folded-in checks (not separate files)

- **testId audit.** Web = `data-testid`, RN = `testID`. During discovery, flag interactive elements missing a stable id and any fragile selector (`getByText` literal / `.nth()` / CSS) the specs would otherwise need. The writer prefers stable ids; when one is missing it emits a `.fixme()` + a one-line "add testid `<x>` to `<component>`" note rather than shipping a brittle selector.
- **misleading-text.** Opportunistically check label-vs-outcome while driving: a "Save" that fires DELETE, a "Cancel" that mutates, a "permanent" confirm over a soft-delete. Cheap, high-signal — record as a finding.
- **Text-mode first.** Answer "which screen / is this disabled / did the mutation land" from the a11y tree / DOM / network log, not pixels. Screenshots are **evidence only** (a real visual bug, a before/after fix pair) via `references/snap.sh` → `.e2e/.screenshots/`.

## Files map

**Writes:** `*.spec.ts` (each stack's `specDir`), one `<app>/journeys.md`, `.e2e.json` (first run), `.e2e/.screenshots/` (scratch, gitignore it). **Never writes:** any `.ai-testing/` tree, `blueprints/`, `cookbook/`, `test-inventory.json`, `memory/`, `baselines/`, per-session dirs.

## Don't

- Don't let a writer edit app source — fixes are the orchestrator's job (Phase 3).
- Don't run two Appium writers at once, or fix while the fan-out is live.
- Don't skip the server half of dual-verify because the UI looked right.
- Don't invent an `.ai-testing/` file or a heavy header — the spec + `journeys.md` are the whole footprint.
- Don't stall mid-run on a non-destructive ambiguity — the ONLY legitimate halts are the four in **Autonomy § ASK FIRST**.
