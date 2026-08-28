# Appium mobile driver policy

Appium/WebdriverIO is the mobile driver for `/e2e` work.

## Detection

In Phase 0, prefer an Appium platform when any exist:

- `appium/config/wdio.conf.ts`
- `appium/specs/**/*.spec.ts`
- `package.json` scripts containing `appium`, `wdio`, or `appium:dev-client`
- `.e2e.json.stacks.mobile.driver == "appium"`

## Expected project shape

The active project is the source of truth. **Discover the project's Appium harness** — commonly an `appium/` dir at the **repo root** (NOT under the app's `rootDir` in a monorepo). Typically:

- `appium/config/wdio.conf.ts` (runner + capabilities)
- `appium/support/runtime.ts` (reset/seed + session helpers)
- `appium/support/e2e-api-client.ts` (project E2E API client — the **best dual-verify surface**; prefer it over log-tailing)

Generic expectations: WDIO runner with Appium service; `maxInstances: 1` for single-device lanes; release and dev-client modes; small stateless page/component objects; specs reset deterministic backend state before navigation; stable `testID`/accessibility-id selectors — visible text only when copy is the behavior under test.

## Preflight

1. Appium server can start on configured host/port.
2. Required drivers installed: iOS `xcuitest`, Android `uiautomator2`.
3. Target simulator/emulator booted or configured app artifact available.
4. Expo dev-client mode: Metro reachable, app can open the configured dev-client URL/deep link.
5. E2E API reset/seed endpoint works before the first UI navigation.

Appium 2+: assume server base path `/` unless project config says otherwise — not legacy `/wd/hub`.

## Action discovery from the accessibility tree

Web discovery enumerates actions via DOM `querySelectorAll`; the RN/native peer is the **Appium accessibility tree**. The live writer reads the tree; the discovery subagent reads the same elements from source.

### Pull the tree
- `const xml = await driver.getPageSource()` → the native hierarchy as XML.
- **iOS (XCUITest):** types `XCUIElementTypeButton`, `XCUIElementTypeStaticText`, `XCUIElementTypeTextField` / `SecureTextField`, `XCUIElementTypeSwitch`, `XCUIElementTypeCell`, `XCUIElementTypeOther`. RN `testID` surfaces as element **`name`** (== accessibility id); `accessibilityLabel` as `label`; text/value as `value`.
- **Android (uiautomator2):** `android.widget.Button` / `EditText` / `Switch`, `android.view.ViewGroup`. RN `testID` surfaces as **`content-desc`** (== accessibility id); text as `text`.

### Enumerate interactive elements
An element is a **candidate user action** when it is: a button/pressable type, or carries `accessibilityRole` of button/link/switch/checkbox/menuitem/tab; a text/secure field (→ "type" action); a tappable cell/row (RN `Pressable`/`TouchableOpacity` wrapping a list row); or a sheet/menu trigger (a pressable whose `onPress` toggles a bottom-sheet/modal).

For each, record `{ testID, type, role, label, value, tappable, displayed }`. Resolve a live handle with `$('~<testID>')` (accessibility id) and confirm `await el.isDisplayed()`.

### Map element → candidate action
| Element | Action |
|---|---|
| button / pressable / role=button or link | tap |
| text / secure field | type `<value>` |
| switch / checkbox | toggle |
| tappable cell / row | tap (usually → navigation to detail) |
| sheet / menu trigger | tap → assert the sheet/modal appears |

### Infer the expected outcome (cross-reference source)
The tree says *what's tappable*; the **source** says *what it does*. In the screen's component file, trace each handler in priority order: `router.push(...)` / `navigation.navigate(...)` → **navigation**; `useMutation` / `mutate(...)` / `apiClient.post|patch|delete(...)` → **apiCall** (a mutation REQUIRES the dual-verify server half); `setShowSheet(true)` / `bottomSheetRef.present()` → **sheet open**; `logout()` / auth guard → **guard / redirect**. The discovery subagent does this statically; the live writer confirms the tree matches.

### Selectors + gotchas
- Emit specs with `~<testID>` accessibility-id selectors. An interactive element with **no** `testID` is a **testid-gap** — flag it (add a `testID` to the component) rather than falling back to text/xpath.
- **XCUITest page source can contain hidden, non-foregrounded screens** (stacked routes). An element present in the XML is NOT necessarily on screen — always gate discovery and assertions on `await el.isDisplayed()`, or you'll match a backgrounded route and call a stale screen "covered".
- `label`/text selectors only when the visible copy IS the behavior under test (an i18n label that changes per locale is not a stable selector).

> VALIDATE on first real run: confirm the type/attribute names above against FixIt `apps/client` on a live simulator (iOS XCUITest vs Android uiautomator2 differ), and tighten selectors from the observed tree.

## Transactional flow checklist

Use when a mobile sweep covers cache invalidation, realtime delivery, chat, offers/bids, scheduling, payments, payouts, marketplace modes, or any multi-screen mutation flow.

Before driving the UI, write the expected invalidation map in the session notes:

- Mutation/event under test: e.g. offer sent, offer canceled, bid accepted, schedule proposed, payment completed.
- Backend source of truth: endpoint/DB/API probe proving the mutation happened.
- UI surfaces that must update: list row, activity/action-required card, detail header/CTA, chat thread, worker job screen, profile/company/public profile, admin/ledger screens when relevant.
- Client cache/state slices to invalidate or reconcile. Name concrete query keys when discoverable; otherwise the feature cache owner and route.
- Realtime channel/event if the user expects instant propagation.
- Negative assertions: stale counters gone, removed offers absent, off-platform payment rows absent, duplicate hidden routes not counted as success.

Then drive in this order:

1. Seed an independent scenario through the project E2E API or safe seed command.
2. Reset backend + app state before the spec: terminate the app, clear project E2E state, reopen the app/dev-client URL.
3. Capture pre-mutation UI state on every affected surface, not just the current screen.
4. Perform the mutation from the actor that owns it.
5. Assert backend/API state first, then every affected UI surface.
6. For realtime requirements, use separate actor sessions when the feature depends on live delivery, locking, duplicate prevention, chat arrival, or race behavior. Account switching in one session is only acceptable for non-realtime confirmation after the event is already persisted.
7. For business modes with different rails, assert both presence and absence. Example shape: mode A shows payment/invoice/ledger rows and creates payment records; mode B intentionally shows direct-settlement/off-platform rows and creates no payment records.
8. Re-open affected surfaces through different navigation paths: list → detail, activity → detail, chat → linked inquiry, profile/company → history item. A route found in page source but not displayed is a failure — hidden stacked routes can mask stale navigation.

## Native payment/external sheet checks

For Stripe, Apple Pay, browser redirects, or any native/external sheet:

- Verify app initialization includes required return/deep-link configuration before opening the sheet.
- Treat provider warnings as findings when they hide methods or affect return flow.
- Prefer project test doubles or seeded payment states; do not depend on real card entry unless the project has a dedicated provider test harness.
- After sheet return, assert app cache/state and backend payment state independently.
- Cover payment-method management separately from payment execution: add/list/default/remove where the product claims management exists.

## Multi-actor journeys

Realtime and concurrency flows model actors explicitly:

- `customer`, `worker`, `admin`, etc. each own a separate Appium session.
- Actors share fixture metadata from the E2E reset/seed API, not WDIO globals.
- Synchronize cross-actor steps with barriers: "customer submitted", "worker list refreshed", "customer accepted", etc.
- Never fake concurrency by switching accounts in one session when the requested behavior is realtime, locking, duplicate offer prevention, chat delivery, or race handling.

## Runner-backed determinism

Wrap mobile deterministic tests in a project-local runner when available. The runner owns: infra/dev-server startup and health checks; E2E reset/seed scenario; Appium env/capabilities; test invocation; backend/API/DB verification; cleanup. The emitted spec stays small: user intent, selectors, assertions.

When no runner helper exists, create one project-local reset helper before adding more specs: reset the E2E backend, terminate/reopen the app, optionally skip app launch for pure API setup. Every new spec must pass when run alone and after an unrelated spec with fresh reset state.
