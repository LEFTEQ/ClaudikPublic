#!/usr/bin/env node
// ast-lint.mjs — banlist + selector-policy enforcement for emitted Playwright/Appium tests.
// Usage: node ast-lint.mjs <candidateFile> <appCfgJson>
// Exit 0 → clean. Exit 1 → violations printed to stdout (one per line: <rule-id>: <evidence>).
// Exit 2 → invalid invocation (missing args / unreadable files).

import { readFileSync } from 'node:fs'

const [,, file, cfgFile] = process.argv
if (!file) {
  console.error('usage: ast-lint.mjs <file> <cfg.json>')
  process.exit(2)
}

let src
try {
  src = readFileSync(file, 'utf8')
} catch (e) {
  console.error(`ast-lint.mjs: cannot read candidate file: ${file} (${e.message})`)
  process.exit(2)
}

let cfg = { allowedOrigins: [] }
if (cfgFile) {
  try {
    cfg = JSON.parse(readFileSync(cfgFile, 'utf8'))
  } catch (e) {
    console.error(`ast-lint.mjs: cannot read/parse cfg file: ${cfgFile} (${e.message})`)
    process.exit(2)
  }
}

const violations = []
const v = (rule, msg) => violations.push(`${rule}: ${msg}`)

{
  // TypeScript specs (Playwright or Appium/WebdriverIO) — regex-based first pass
  // (sufficient for catching obvious patterns; the typescript-compiler-API upgrade
  // is a v2 task per design doc Section 12).

  // no-dynamic-eval
  if (/\beval\s*\(/.test(src)) v('no-dynamic-eval', 'eval(')
  if (/\bnew\s+Function\s*\(/.test(src) || /\bFunction\s*\([^)]*\)\s*\(/.test(src)) v('no-dynamic-eval', 'Function(')

  // no-eval-via-page
  if (/page\.evaluate\s*\(\s*`[^`]*\$\{/.test(src)) v('no-eval-via-page', 'page.evaluate template literal with interpolation')
  if (/page\.evaluate\s*\(\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\)/.test(src)) v('no-eval-via-page', 'page.evaluate(variable)')

  // no-unsafe-mcp
  if (/browser_run_code_unsafe/.test(src)) v('no-unsafe-mcp', 'browser_run_code_unsafe')

  // no-shell
  if (/from\s+['"]child_process['"]|require\s*\(\s*['"]child_process['"]\s*\)/.test(src)) v('no-shell', 'child_process import')
  if (/\b(spawn|execSync)\s*\(/.test(src)) v('no-shell', 'spawn()/execSync()')

  // no-fs
  if (/from\s+['"](node:)?fs['"]|require\s*\(\s*['"](node:)?fs['"]\s*\)/.test(src)) v('no-fs', 'fs import')

  // no-raw-env
  if (/\bprocess\.env\.[A-Z_]+/.test(src)) v('no-raw-env', 'process.env.* direct read')

  // no-cross-origin-fetch
  const fetchMatches = [...src.matchAll(/\bfetch\s*\(\s*['"`](https?:\/\/[^'"`]+)['"`]/g)]
  for (const m of fetchMatches) {
    const url = m[1]
    if (!(cfg.allowedOrigins || []).some(o => url.startsWith(o))) {
      v('no-cross-origin-fetch', `fetch to disallowed origin: ${url}`)
    }
  }

  // no-storage-secret
  if (/(localStorage|sessionStorage)\.(getItem|setItem)\s*\([^)]*(token|secret|key|password)[^)]*\)/i.test(src)) {
    v('no-storage-secret', 'storage access with secret-named key')
  }

  // no-console-secret
  const consoleSecret = [...src.matchAll(/console\.(log|info|debug)\s*\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/g)]
  for (const m of consoleSecret) {
    if (/token|secret|key|password|cookie/i.test(m[2])) v('no-console-secret', `console.log(${m[2]})`)
  }

  // selector-policy
  if (/\.locator\s*\(\s*['"][^'"]*(?:[#.]|xpath=|text=)/.test(src)) v('selector-policy', 'page.locator with CSS/XPath/text-engine')
  if (/\.locator\s*\(\s*['"](\/\/|\(\/)/.test(src)) v('selector-policy', 'page.locator with raw XPath')
  if (/\.nth\s*\(\s*\d+\s*\)/.test(src)) v('selector-policy', '.nth(n)')
  // getByText must be regex form
  const gbtMatches = [...src.matchAll(/getByText\s*\(\s*(['"`][^'"`]+['"`])/g)]
  for (const m of gbtMatches) v('selector-policy', `getByText with string literal: ${m[1]} (use /regex/ form)`)
  if (/['"]>>\s*text=/.test(src)) v('selector-policy', '>> text-engine pipe')

  // no-tag-shell-chars
  const tagArrayMatch = src.match(/tag:\s*\[([^\]]+)\]/)
  if (tagArrayMatch && /[;`|&]|\$\(/.test(tagArrayMatch[1])) v('no-tag-shell-chars', tagArrayMatch[1])

  // ─── Determinism rules (references/assertions.md) ───

  // Header escape hatch — when `INDEPENDENT: false` is declared, the determinism rules
  // are waived for this file. The orchestrator routes the test to Track C anyway.
  const independentFalse = /^\s*\*?\s*INDEPENDENT\s*:\s*false\b/mi.test(src)

  // require-isolation-metadata
  // Playwright specs declare test.describe.configure({ mode: 'parallel' }) at file scope.
  // Appium/WebdriverIO specs declare runner isolation metadata in the spec header.
  // The string match is intentionally tolerant of whitespace / single+double quotes
  // but strict on the literal 'parallel' value (no 'serial', no 'default').
  if (!independentFalse) {
    const looksPlaywright = /@playwright\/test|test\.describe|test\s*\(/.test(src)
    const hasParallel = /test\.describe\.configure\s*\(\s*\{[^}]*mode\s*:\s*['"]parallel['"]/m.test(src)
    const hasWdioIsolation =
      /^\s*\*?\s*RUNNER-ISOLATED\s*:\s*true\b/mi.test(src) ||
      /^\s*\*?\s*WDIO-MAX-INSTANCES\s*:\s*1\b/mi.test(src) ||
      /^\s*\*?\s*ACTOR-SESSIONS\s*:/mi.test(src)
    if (looksPlaywright && !hasParallel) {
      v('require-isolation-metadata', "missing test.describe.configure({ mode: 'parallel' }) — see references/assertions.md")
    }
    if (!looksPlaywright && !hasWdioIsolation) {
      v('require-isolation-metadata', 'missing Appium/WebdriverIO RUNNER-ISOLATED: true / WDIO-MAX-INSTANCES: 1 / ACTOR-SESSIONS header — see references/assertions.md')
    }
  }

  // no-test-serial — banned regardless of independence waiver (order-coupling primitive).
  // Matches `.serial(` only when the preceding token is `test`, `describe`, or `)` (the
  // .describe(...) chain form). Won't false-positive on .serialize( etc. because `serial`
  // is followed strictly by `\s*\(`, not `ize`.
  if (/test\.describe\.serial\s*\(/.test(src)) v('no-test-serial', 'test.describe.serial(')
  if (/(test|describe|\))\s*\.\s*serial\s*\(/.test(src)) v('no-test-serial', '.serial( chained on test/describe')

  // no-shared-mutable-module-state
  // Walks the source line-by-line, tracking brace depth. Top-level `let <name>` or `var <name>`
  // bindings flag a violation. `const` is always allowed (immutable binding); declarations
  // inside `test()` / `describe()` blocks (depth > 0) are fine.
  if (!independentFalse) {
    let depth = 0
    const lines = src.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Strip line comments to avoid false-positives like `// let foo = ...`
      const stripped = line.replace(/\/\/.*$/, '')
      if (depth === 0) {
        const m = stripped.match(/^\s*(let|var)\s+([A-Za-z_$][\w$]*)/)
        if (m) v('no-shared-mutable-module-state', `top-level ${m[1]} ${m[2]} at line ${i + 1}`)
      }
      for (const ch of stripped) {
        if (ch === '{') depth++
        else if (ch === '}') depth = Math.max(0, depth - 1)
      }
    }
  }
}

if (violations.length) {
  for (const x of violations) console.log(x)
  process.exit(1)
}
console.log('CLEAN')
process.exit(0)
