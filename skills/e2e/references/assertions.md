# `/e2e` — Assertions, templates & determinism

The writer subagent turns each journey step's **expected outcome** into one or more assertions, picks the matching code template (Playwright for Web, Appium/WDIO for Expo-RN), and emits a spec. `bin/ast-lint.mjs` enforces the selector/safety/determinism banlist **before** the spec is written; the spec is only kept after it passes the run-it-alone gate.

The catalog is **closed** — only the kinds below are legal. Need a new shape? Add it here first.

## Assertion vocabulary

| Kind | Proves | Pick when |
|---|---|---|
| `element-text` | the text at a stable selector matches | a field/label should show a specific value after the action |
| `navigation` | the route changed (or stayed) | the action should move the user to another screen (or must not) |
| `toast-shown` | a toast/snackbar appeared with severity + copy | the action confirms success/error via a transient banner |
| `list-membership` | an item is present/absent in a list on another screen | a create/delete should make something appear/disappear in a list the user visits |
| `count-delta` | a list's item count changed by an exact delta | the action adds/removes a bounded, scoped set of rows |
| `form-reset` | named form fields cleared after submit | a create form should empty on success |
| `server-state` | a backend value persisted (the **server half** of dual-verify) | any mutation — the one mandatory check (see SKILL.md § Dual-verify) |

**Variants (sub-forms, not separate kinds):** *visibility* → `element-text` with `toBeVisible()`/`toBeHidden()` (no `equals`); *field-error* → `element-text` on the field's error node + `aria-invalid`; *modal-closed* → visibility `toBeHidden()` on the dialog.

## Test envelope

Lean header (replaces the old 13-key schema) — just enough for traceability + the determinism gate:

```ts
/*
  INTENT: <plain-English what this journey proves>
  JOURNEY: <slug>            // also the @e2e-<slug> tag + the seed-data scope prefix
  INDEPENDENT: true          // false → add DEFERRED-REASON and .fixme()/.skip() the body
*/
```

**Playwright (Web)** — parallel-safe, self-seeding, self-cleaning:

```ts
/* INTENT: … · JOURNEY: edit-profile-name · INDEPENDENT: true */
import { test, expect } from '<fixtureImport from .e2e.json>'   // worker-scoped login + apiHelpers; NOT '@playwright/test'

test.describe.configure({ mode: 'parallel' })

test('edits profile name and persists', { tag: ['@e2e-edit-profile-name'] }, async ({ page, apiHelpers, login }) => {
  const name = 'e2e-edit-profile-name-buyer'   // scope ALL seed data by the journey slug — deterministic, greppable
  await apiHelpers.createUser({ name })
  await login.as('buyer')
  await page.goto('/settings/profile')
  // … act + assert (templates below) …
})

test.afterEach(async ({ apiHelpers }) => { await apiHelpers.deleteMatching('e2e-edit-profile-name-') })
```

**Appium/WDIO (Expo-RN)** — runner owns env choreography; the spec stays small:

```ts
/*
  INTENT: … · JOURNEY: checkout · INDEPENDENT: true
  RUNNER-ISOLATED: true          // the lint requires one of RUNNER-ISOLATED / WDIO-MAX-INSTANCES: 1 / ACTOR-SESSIONS
  PRECONDITIONS:
    - e2e reset+seed scenario: checkout
*/
describe('checkout', () => {
  beforeEach(async () => { await api.reset('checkout') })   // project E2E API client from .e2e.json
  it('places an order', async () => {
    // … act + assert (templates below) …
  })
  afterEach(async () => { await api.reset() })
})
```

> Selectors: Web prefers `getByRole` > `getByTestId`; mobile uses accessibility-id (`~testID`). Text selectors only when the copy itself is the behavior under test.

## Templates (per kind: Playwright · Appium/WDIO)

### `element-text`
```ts
// Playwright
await expect(page.getByRole('<role>', { name: <name-regex> })).toHaveText(<expected-regex>)
// WDIO
await expect($('~<testID>')).toHaveText(<expected-regex>)
```
Visibility variant: `.toBeVisible()` / `.toBeHidden()` (PW) · `.toBeDisplayed()` / `expect(await $('~x').isExisting()).toBe(false)` (WDIO).

### `navigation`
```ts
// Playwright — route is observable
await expect(page).toHaveURL(<url-regex>)            // stay: assert the unchanged route
// WDIO — no URL; assert the destination screen's marker element
await expect($('~screen-<destination>')).toBeDisplayed()
```

### `toast-shown`
```ts
// Playwright
await expect(page.getByRole('alert')).toContainText(<text-regex>)
// error severity: await expect(page.getByRole('alert')).toHaveAttribute('data-severity', 'error')
// WDIO
const toast = $('~toast'); await toast.waitForDisplayed({ timeout: 3000 })
await expect(toast).toHaveText(<text-regex>)
```

### `list-membership`
```ts
// Playwright — present
const list = page.getByRole('list', { name: <list-name-regex> })
await expect(list.getByRole('listitem').filter({ hasText: <item-regex> })).toBeVisible()
// absent: await expect(list.getByRole('listitem').filter({ hasText: <item-regex> })).toHaveCount(0)
// WDIO — present / absent
await $('~<listTestID>').waitForDisplayed()
await expect($(`~<rowPrefix>-<itemKey>`)).toBeDisplayed()
// absent: expect(await $(`~<rowPrefix>-<itemKey>`).isExisting()).toBe(false)
```

### `count-delta`
Scope the list to this journey's seeded data so siblings can't perturb the count (e.g. a `?owner=e2e-<slug>` filter view).
```ts
// Playwright
const rows = page.getByRole('list', { name: <list-name-regex> }).getByRole('listitem')
const before = await rows.count()
// … action fires …
expect(await rows.count() - before).toBe(<delta>)
// WDIO
const before = (await $$('~<rowTestID>')).length
// … action fires …
expect((await $$('~<rowTestID>')).length - before).toBe(<delta>)
```

### `form-reset`
Must live in the SAME test body as the submit it follows — never a sibling test (would couple to order).
```ts
// Playwright
for (const f of <fields>) await expect(page.getByLabel(f)).toHaveValue('')
// WDIO
for (const f of <fields>) await expect($(`~field-${f}`)).toHaveText('')
```

### `server-state`  (the server half of dual-verify — required after every mutation)
```ts
// Playwright — via the request context
const res = await page.request.<method>('<endpoint>'<, { data: <body> }>)
expect(res.status()).toBe(<status>)
expect((await res.json()).<jsonPath>).toBe(<value>)
// WDIO — via the project E2E API client
const row = await api.get('<endpoint>')
expect(row.<jsonPath>).toBe(<value>)
```
If the project exposes no API client/log, dual-verify degrades to client-only for that step — `/e2e` warns once and records it (see SKILL.md § Dual-verify).

## Determinism & independence (the second bar after the lint)

A spec must pass **run alone, in any order, against a fresh backend**. Five rules — `bin/ast-lint.mjs` enforces the bold ones structurally:

1. **Parallel-by-default.** PW: `test.describe.configure({ mode: 'parallel' })` after imports. WDIO: declare `RUNNER-ISOLATED: true` (or `WDIO-MAX-INSTANCES: 1` / `ACTOR-SESSIONS:` for multi-actor) and reset/seed before the spec.
2. **No order-coupling.** Banned: `test.describe.serial(` / chained `.serial(`; **top-level `let`/`var`** holding shared state (use `const` or fixtures). Coupled multi-step flows → emit ONE test containing all steps, never split.
3. **Seed your own data, scoped by the journey slug** (`e2e-<slug>-…`). Slugs are deterministic and greppable in CI logs; UUIDs are not.
4. **No real clock / RNG in assertions.** Banned in assertion args: `Date.now()`, `new Date()`, `Math.random()`, `crypto.randomUUID()`, `performance.now()`. For app-generated values, **capture-and-rebind** (read into a `const`, assert against it) or assert a **shape regex** (`/^BK-\d{8}$/`), never a literal.
5. **Clean up what you create** — `afterEach` (PW `apiHelpers.deleteMatching('e2e-<slug>-')`; WDIO project reset helper). If cleanup is genuinely impossible (third-party irreversible) → `INDEPENDENT: false` + `DEFERRED-REASON: cleanup-impossible-<reason>` and `.fixme()`/`.skip()` the body.

## Selector & safety policy (mirrors `bin/ast-lint.mjs`)

Preference: **`getByRole` > `getByTestId`** (Web) · **accessibility-id `~testID`** (mobile). Banned, and the lint will reject:

- **Selectors:** raw CSS/XPath in `.locator()`, `.nth(n)`, `getByText('literal')` (use `/regex/i`), `>> text=` engine pipes.
- **Code execution:** `eval(` / `new Function(`, `page.evaluate(<interpolated template>)` or `page.evaluate(variable)`, `browser_run_code_unsafe`.
- **Host access:** `child_process` / `spawn`/`execSync`, `fs` import, `process.env.X` direct reads, cross-origin `fetch` (outside `cfg.allowedOrigins`).
- **Secret leaks:** `localStorage`/`sessionStorage` get/set with token/secret/key/password names; `console.log` of token/secret/key/password/cookie vars.

## Run-it-alone gate

After emit, prove the spec passes standalone (no sibling pre-seeded state):

```bash
# Playwright
<runner> playwright test --grep "@e2e-<slug>" --workers=1
# Appium/WDIO
<runner> wdio run <wdio.conf> --spec <specPath> --mochaOpts.grep "@e2e-<slug>"
```
GREEN → keep. RED → the spec depends on sibling state: mark `INDEPENDENT: false`, `.fixme()`, and report.
