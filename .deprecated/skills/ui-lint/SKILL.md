---
disable-model-invocation: true
name: ui-lint
description: Use when the user asks to check a UI for alignment/grid/spacing problems or "weird things" — "design lint", "is this aligned?", "check the spacing", "something looks off", "audit this screen's layout" — on a live web page, a running simulator, or an existing screenshot.
---

# ui-lint — design lint for UI screenshots

**Code is the ruler, you are the judge.** You cannot measure pixels — your coordinate estimates are approximate by design (Anthropic vision docs) — so NEVER assert a px number you didn't get from the script layer. The scripts measure and mark candidates; your job is the two things code can't do: verdict each candidate (defect vs intentional) and spot holistic weirdness no rule catches.

Pipeline: **collect geometry → lint (deterministic) → overlay marks → judge annotated crops → report.**

## Phase 0 — Triage input + calibrate the grid

**Input:**

| Input | Path |
|---|---|
| Live web page (Playwright / chrome-devtools MCP reachable) | DOM path — exact geometry |
| Running iOS/Android sim, or user-provided image | pixel path — coarse geometry |
| App running but no screenshot yet | capture via the `screenshot` skill (`vitrinka/cli.ts snap`), then pixel path — or prefer the DOM path if it's a web app |

**Calibration — the grid is the app's, never universal.** Resolve the spacing scale in this order and tag every use of it:

1. **declared** — read `.claude/design-system.md` (from `learn-design`), else tailwind config / theme tokens in the repo. Extract the spacing scale (e.g. `4,8,12,16,24,32,48,64`) and pass it as `--spacing-scale`.
2. **extracted** — no tokens found: lint.ts derives the scale from the page's own computed `gap`/`padding` values automatically.
3. **inferred** — image-only: lint.ts detects the dominant quantum (4/8pt) from the geometry itself; misalignment is then "deviates from what its own siblings do", never "violates a rule I assumed".

Work dir: `.ui-lint/<slug>/` in the project (add to `.gitignore`/`.git/info/exclude` if new).

## Phase 1a — DOM path (live web)

1. `mkdir -p .ui-lint/<slug>` first — the MCP won't create parent dirs, and its file writes only land inside allowed roots (session cwd + its `.playwright/`). `file://` URLs are blocked — serve local pages over http (`python3 -m http.server`, prefer `127.0.0.1`).
2. `browser_resize` to the breakpoint under test (default 1440×900; also 375×812 if responsive work). Navigate, wait for fonts/idle (`await document.fonts.ready` via evaluate).
3. Read `scripts/collect-geometry.js` and paste its arrow function into `browser_evaluate` with `filename: .ui-lint/<slug>/manifest.raw.json` — the result saves straight to disk without flowing through context (chrome-devtools MCP: `evaluate_script`). The saved result may arrive JSON-double-encoded; normalize:
   ```bash
   node -e "const fs=require('fs');let d=JSON.parse(fs.readFileSync('.ui-lint/<slug>/manifest.raw.json','utf8').trim());if(typeof d==='string')d=JSON.parse(d);fs.writeFileSync('.ui-lint/<slug>/manifest.json',JSON.stringify(d))"
   ```
   **Do not scroll or interact between this step and the screenshot** — geometry and pixels must describe the same frame.
4. `browser_take_screenshot` with `filename: .ui-lint/<slug>/shot.jpeg`, `type: "jpeg"`, `fullPage: false`, **`scale: "device"`** — device scale makes image px = CSS px × dpr, which is exactly the mapping overlay.mjs applies via `meta.dpr`.

## Phase 1b — pixel path (sim shots, mockups, provided images)

```bash
node ~/.claude/skills/ui-lint/scripts/pixel-edges.mjs --image <shot> --out .ui-lint/<slug>/manifest.json
```

Needs `sharp` resolvable from cwd (exit 2 if missing — then skip to Phase 3 with raw tiled crops and judge without measurements, saying so). Pixel findings are coarse (±2px, `confidence: low`) — lean harder on your Phase 3 judgment here.

## Phase 2 — Lint + overlay (deterministic)

```bash
node ~/.claude/skills/ui-lint/scripts/lint.ts --manifest .ui-lint/<slug>/manifest.json \
  [--spacing-scale 4,8,16,24,32] --out .ui-lint/<slug>/findings.json
node ~/.claude/skills/ui-lint/scripts/overlay.mjs --screenshot .ui-lint/<slug>/shot.jpg \
  --findings .ui-lint/<slug>/findings.json --out-dir .ui-lint/<slug>/ [--grid]
```

Checks: `near-miss-alignment` (2–6px off a ≥3-sibling edge cluster), `inconsistent-gap`, `off-scale-spacing` (declared/extracted scale only; gaps repeated ≥3× page-wide are treated as intentional tokens and suppressed), `row-baseline`, `size-jitter`, `viewport-overflow` / `parent-overflow` / `page-h-scroll`, `clipped-content`, `sibling-overlap`, `pixel-edge-near-miss` (pixel path). Output caps at 20 marks by severity; `meta.suppressed` reports the rest. `--grid` draws the calibrated column edges in blue.

overlay.mjs emits `shot.lint.jpg` (≤1568px long edge) + one annotated zoom crop per mark (`mark-NN.jpg`). If sharp is missing it exits 2 → judge from the findings table + raw screenshot and note the degraded mode in the report.

## Phase 3 — Judgment (yours, non-delegable)

Read `shot.lint.jpg`, then every `mark-NN.jpg`. Findings are **candidates, not defects**.

**Per mark, verdict one of:**
- `defect` — visually wrong, worth fixing (say why in ≤1 line)
- `intentional` — optical alignment, deliberate emphasis/indent, platform convention
- `unclear` — needs the designer; say what would decide it

Rules: use only the script's numbers, never your own estimates; an `inferred`/`low`-confidence finding needs visible evidence in the crop to become `defect`; when a crop contradicts the numbers (transforms, shadows, borders fool rect math), trust the crop and say so.

**Then one holistic pass** over `shot.lint.jpg` for what rules can't catch: truncated/clipped text (watch diacritics: Č Ř Ž ascenders), broken images/icons, stuck loading placeholders, mixed icon styles or corner radii, low-contrast text, orphan words, inconsistent visual weight/hierarchy, anything uncanny. These get listed separately as `visual` findings — no fake measurements attached.

## Phase 4 — Report

```markdown
# ui-lint: <page/screen> @ <viewport>
Calibration: <declared|extracted|inferred> — scale [4,8,16,24] (source: design-system.md)
Verdicts: N defect · N intentional · N unclear (of N marks, N suppressed)

| # | Check | Measured | Verdict | Why |
|---|-------|----------|---------|-----|
| 1 | near-miss-alignment | left 27 vs 24 (Δ3px) | defect | 14 siblings share the 24px edge |

## Visual pass (no measurements)
- …

## Suggested fixes  ← only when defects exist; file:line if source is in reach
```

Show the annotated image path. **Not a CI gate** — never emit pass/fail, always verdicts. If ≥half the marks judged `intentional`, say the layout is healthier than the count implies.

## Gotchas

- Screenshot and manifest must be the same frame — no scroll/hover/animation between them; wait out carousels and skeleton loaders.
- DOM rects are CSS px; screenshots are device px. `meta.dpr` handles the mapping — never mix them manually.
- iframes aren't traversed by the collector; note them as unscanned.
- sharp is optional everywhere; every degraded mode must be named in the report, not silently absorbed.
- Measured gap ≠ authored margin: vertical margins collapse (max wins), so "I set margin 24px but lint says 16px" is usually CSS being CSS, not a lint error. Report the rendered value.
- Tests: `node --test ~/.claude/skills/ui-lint/tests/lint.test.ts` after any script change. End-to-end fixture with 5 planted defects + 2 intentional decoys: `tests/fixture.html` (serve it, run the DOM path, expect exactly the 5).
