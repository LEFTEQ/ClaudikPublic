---
disable-model-invocation: true
name: api-test-suite
description: Add unit/integration/security tests to a FixIt API module via questionnaire-driven scoping and agent dispatch — surfaces real app bugs (not just green tests).
---

# API Test Suite Generator

Generate test coverage for a FixIt API module that validates business logic, not HTTP plumbing. The goal is to **surface real app bugs, not chase green** — a deterministic failure on a clean DB is a finding, not a chore to tune away.

## Phase 1: Discovery

Ask which module to test. If unspecified, build the coverage map on the fly: scan `apps/api/src/modules/` (~61 modules), grep each for `*.spec.ts`, cross-reference `test/integration/`. Don't depend on a pre-baked handoff file — none is guaranteed fresh.

Then, via Explore agents:

1. **Structural map** — every controller, service, and entity in `apps/api/src/modules/{module}/`; every endpoint (method + path + decorators); existing specs; the security surface (which endpoints take `:id`, which are `@Public()`, which touch money/PII).
   ⚠️ **Integration specs are TOPIC-named, not module-named** (auth lives in `auth.controller.spec.ts` AND `auth-web-bridge.spec.ts` AND `security/auth-hardening-security.spec.ts`). Grep `test/integration/` for the module's symbols — assuming one canonical `{module}.spec.ts` mis-targets or overwrites.
2. **Flow map** — per endpoint: `controller → service methods → entities touched → side-effects (events, BullMQ jobs, WebSocket pushes, cache writes, queued emails) → other modules`. Journeys are cross-module (job → bid → accept → deposit → complete → payout), so don't box this into `modules/{module}/`. Small module (≲8 endpoints) → inline in the structural agent; large → one trace agent per endpoint cluster, merged into one flow map.
3. **Test-shape audit** — classify every existing `it()` as happy / error / edge / boundary / concurrent / auth, and grep controllers/services for uncovered branches: guards, error handlers, early returns, null checks, `ConflictException` / `ForbiddenException` paths. Treat the untested-branch catalog as a heuristic confirmed in Phase 2, not ground truth.

Profile table (per-type counts, not existence booleans — booleans hide gaps):

```
| Endpoint | Method | Guards | Takes :id? | Existing tests (happy/err/edge/conc/auth) | Untested branches |
```

## Phase 2: Questionnaire

One `AskUserQuestion` per question, options adapted to the profile + flow map + untested-branch catalog:

- **Scope** — all three (unit + integration + security) [recommended] / unit only / integration only / security only.
- **Depth** — production-grade (happy + error + concurrency + edge + security) [recommended] / standard / quick pass.
- **Business rules & journeys** (multi-select, populated with the REAL journeys and untested branches found in Phase 1) — ownership/authorization, state transitions, financial accuracy & idempotency, side effects from the flow map, cross-module journeys, data integrity, concurrency safety.
- **Risk** (only if the module handles payments/PII/auth) — IDOR on `:id` endpoints [recommended when they exist], input injection, rate limiting, token/session attacks.

## Phase 3: Test plan

Per endpoint (integration): setup via factories → happy path (response + DB state + side effects) → 401 without token → ownership/role enforcement → 400 on invalid input → conflict on invalid state transition → IDOR (user A vs user B) → domain edge cases (zero amounts, expired entities, disabled users).

Per service method (unit): happy path return value → not-found exception → `ForbiddenException` → `ConflictException`/`BadRequestException` on invalid state → side effects verified.

Adversarial layer — only what the above don't already cover (they cover IDOR, state conflicts, stored XSS, `Promise.allSettled` concurrency):
- boundary sweeps: negative / zero / MAX_INT / empty / 64k-char inputs
- cascade-delete orphans: delete a parent, assert children handled (not orphaned/leaked)
- backward state-machine transitions: drive a status BACKWARD or skip a step — assert rejected

Confirmed defects from this layer route to `REAL-BUGS-FOUND.md` (Phase 5) — never delete the failing assertion. Present the plan as `| Test File | Type | Tests | What's Covered |`.

## Phase 4: Dispatch

⚠️ **Tiered, NOT all-parallel.** Integration tests run `maxWorkers=1` against a single shared Postgres (`:15434`) with `cleanAllTestData` wiping ~14 tables — parallel integration agents corrupt each other's DB.

- Discovery agents → parallel
- Unit-test agents → parallel (mocked/isolated)
- Integration + security agents → **SEQUENTIAL in a loop**; log per-task status (label + first ~160 chars of any failure)

**Pre-authoring audit gate (mandatory):** before writing tests for an endpoint, the agent audits the source against every Red Flag below and records findings. Confirmed defects → `REAL-BUGS-FOUND.md`. This makes the Red Flags an active gate, not passive prose.

**Inline self-verification:** each agent writes its spec, runs it, and iterates to green within its own turn (integration only inside the sequential tier). **The deliberate-failure check is required:** if a test passes first try, add a deliberate failing assertion to prove the setup exercises the code, then revert. Phase 5 is then a confirmation run, not the first run.

**Agent briefing:**

```
## Task: Write {type} tests for {module}

**Files to create:** {spec file paths}
**Files to read first:** {source files}
**Flow map entry:** {journey + side-effects for these endpoints}

### Test Infrastructure
- Unit: `apps/api/src/modules/{module}/*.spec.ts`
- Integration: `apps/api/test/integration/{module-topic}.spec.ts` (topic-named — grep first, don't overwrite)
- Security: `apps/api/test/integration/security/{module}-security.spec.ts`
- `createTestApp({ withEvents: true, envFile: '../../.env.integration' })` for integration
  (add `withBullQueues` / `withWebSocket` when the flow map shows those side-effects)
- Factories at `test/factories/` — always use them, never construct entities manually
- Clean between tests: `cleanAllTestData(dataSource)` + module-specific cleanup

### Critical Rules
- Test the CONTRACT not the implementation (verify DB state, not mock calls)
- Verify STORED values for XSS tests, not just the response
- Promise.allSettled for concurrent tests, never Promise.all
- Quiet hours: jest.useFakeTimers({ doNotFake: [...all timers...] }) — only fake Date
- REQUIRED: if a test passes on first try, add a deliberate failing assertion, then revert
- Every endpoint test checks status code + response shape + DB side effects
- Audit the source against the Red Flags below BEFORE authoring; record hits for the bug report

### Behavioral Assertions
- Right status code (201 create, 200 get, 204 delete)
- Response matches the DTO (all required fields)
- POST actually creates a row; DELETE actually removes it
- 401 without token, 403 without the right role
- User A cannot see/modify user B's data (IDOR)
- Invalid input → 400, not 500
- Calling twice is safe (idempotency)

### Red Flags (AUDIT EACH before authoring)
- Returns 200 but doesn't persist → broken save
- Missing @Roles guard on an admin endpoint → privilege escalation
- Service catches errors and returns null → silent failure
- Controller returns an entity instead of a DTO → leaks internal fields
- findOne without an ownership check → IDOR
- Promise.all where Promise.allSettled belongs → one failure kills all
```

## Phase 5: Verification & triage

```bash
bun run api:test:unit

bun run docker:up:integration
bun run api:test:integration -- --testPathPatterns="{module}"
bun run docker:down:integration
```

Run each new/changed spec **3× in isolation against a freshly-reset DB** (scope the classifier to new/changed specs only), then classify every failure:

- **APP-DEFECT** — deterministic wrong data/crash on clean state. Do NOT tune the test. Write to `.claude/work/REAL-BUGS-FOUND.md` and surface it **with a proposed fix**: `| Module | Endpoint | Payload / curl repro | Expected vs Actual | Severity | Spec line | Remediation hint |`. Require an explicit expected-vs-actual plus a repro before writing an entry — that suppresses false positives where the test flagged intended behavior.
- **FLAKY** — passes on retry. Fix the infra/timing, not the assertion.
- **TEST-DEFECT** — wrong assertion (expected 404, correctly got 401). Fix the test, then run the deliberate-failure check.

**"Done" is gated on every app-defect being triaged and reported — not on all-green.**

## Module-Specific Patterns

**Payment/Financial** — amounts in CENTS (integer); idempotency keys on duplicate requests; distributed locking on concurrent ops; Stripe webhook signature verification; Comgate IP whitelisting.

**Auth** — JWT algorithm pinning (`algorithms: ['HS256']`); per-email magic-link cooldown (Redis); token revocation during active sessions; disabled-user rejection.

**Marketplace** — pessimistic locking on offer acceptance; bulk notification (50 providers) with `Promise.allSettled`; auction state machine; deposit lifecycle (create → pay → release/refund/expire/dispute).

**Chat/WebSocket** — test via direct handler calls, not socket.io-client; per-user connection limits (`WsConnectionTracker`, max 10); aggregate rate limiting (`checkPerUser`); room authorization before join.

## Anti-Patterns

- `expect(200)` without checking DB state.
- Mocking what real infrastructure could test.
- Asserting `mock.toHaveBeenCalled` when a DB row would prove the contract.
- Skipping IDOR tests on `:id` endpoints.
- Batch-creating tests without running between batches.
