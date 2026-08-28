// lint.ts — deterministic design-lint over a ui-lint geometry manifest.
// Run: node lint.ts --manifest <path> [--spacing-scale 4,8,16,24] [--max 20] [--out <path>]
//
// Code is the ruler, the model is the judge: this script emits CANDIDATE findings
// with exact measurements; the VLM later verdicts each one (defect / intentional /
// unclear) from annotated crops. Grid calibration is per-app, never universal:
//   declared  — --spacing-scale from the project's design tokens (design-system.md,
//               tailwind config), passed in by the skill
//   extracted — gap/padding px values read from the page's own computed styles
//   inferred  — majority behavior of the geometry itself (edge clusters, gap quantum)
// Zero deps. Erasable TS only. Schema: skills/ui-lint/SKILL.md.

import { readFileSync, writeFileSync } from "node:fs";

export type Rect = { x: number; y: number; width: number; height: number };
export type El = {
  id: number;
  parent: number | null;
  tag: string;
  classes?: string;
  text?: string;
  rect: Rect;
  styles?: Record<string, string>;
  clipped?: boolean;
};
export type Edge = { pos: number; strength: number };
export type Manifest = {
  source: "dom" | "pixels";
  url?: string;
  viewport: { width: number; height: number };
  dpr: number;
  pageHScroll?: boolean;
  elements: El[];
  verticalEdges?: Edge[];
  horizontalEdges?: Edge[];
};
export type CalSource = "declared" | "extracted" | "inferred";
export type Calibration = {
  spacingScale: number[];
  spacingSource: CalSource;
  quantum: number | null;
  columnEdges: number[];
};
export type Finding = {
  id: number;
  check: string;
  severity: "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  calibration: CalSource;
  label: string;
  message: string;
  elements: number[];
  bbox: Rect;
};
export type LintResult = {
  meta: {
    source: string;
    url?: string;
    viewport: { width: number; height: number };
    dpr: number;
    calibration: Calibration;
    total: number;
    shown: number;
    suppressed: number;
  };
  findings: Finding[];
};

const SEV_RANK = { high: 0, medium: 1, low: 2 } as const;

// ---------- generic helpers ----------

export function cluster(values: number[], tol: number): { mean: number; idx: number[] }[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out: { mean: number; idx: number[] }[] = [];
  for (const { v, i } of order) {
    const last = out[out.length - 1];
    if (last && Math.abs(v - last.mean) <= tol) {
      last.idx.push(i);
      last.mean += (v - last.mean) / last.idx.length;
    } else out.push({ mean: v, idx: [i] });
  }
  return out;
}

function unionBbox(els: El[]): Rect {
  const x1 = Math.min(...els.map((e) => e.rect.x));
  const y1 = Math.min(...els.map((e) => e.rect.y));
  const x2 = Math.max(...els.map((e) => e.rect.x + e.rect.width));
  const y2 = Math.max(...els.map((e) => e.rect.y + e.rect.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function overlapRatio(a: Rect, b: Rect, axis: "v" | "h"): number {
  const o =
    axis === "v"
      ? Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
      : Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const m = axis === "v" ? Math.min(a.height, b.height) : Math.min(a.width, b.width);
  return m > 0 ? o / m : 0;
}

function name(el: El): string {
  return el.text ? `${el.tag} "${el.text.slice(0, 24)}"` : el.tag + (el.classes ? `.${el.classes.split(/\s+/)[0]}` : "");
}

// Rows: siblings that vertically overlap ≥50% form one horizontal run.
function runsOf(els: El[], axis: "row" | "stack"): El[][] {
  const main: keyof Rect = axis === "row" ? "y" : "x";
  const cross: keyof Rect = axis === "row" ? "x" : "y";
  const ovAxis = axis === "row" ? "v" : "h";
  const sorted = [...els].sort((a, b) => a.rect[main] - b.rect[main] || a.rect[cross] - b.rect[cross]);
  const runs: El[][] = [];
  for (const el of sorted) {
    const run = runs.find((r) => r.every((m) => overlapRatio(m.rect, el.rect, ovAxis) >= 0.5));
    if (run) run.push(el);
    else runs.push([el]);
  }
  return runs.map((r) => r.sort((a, b) => a.rect[cross] - b.rect[cross]));
}

// ---------- calibration ----------

export function calibrate(m: Manifest, declaredScale: number[] | null): Calibration {
  const els = m.elements;

  // Column edges: clusters of left edges with ≥4 members = the app's own grid lines.
  const lefts = els.map((e) => e.rect.x);
  const columnEdges = cluster(lefts, 1.5)
    .filter((c) => c.idx.length >= 4)
    .map((c) => Math.round(c.mean * 10) / 10);

  if (declaredScale?.length) {
    return { spacingScale: declaredScale, spacingSource: "declared", quantum: gcdQuantum(declaredScale), columnEdges };
  }

  // Extracted: px values the page itself declares in gap/padding computed styles.
  const freq = new Map<number, number>();
  for (const el of els) {
    for (const k of ["gap", "rowGap", "columnGap", "paddingLeft", "paddingTop"]) {
      const v = el.styles?.[k];
      if (!v) continue;
      for (const part of v.split(/\s+/)) {
        const n = parseFloat(part);
        if (part.endsWith("px") && Number.isFinite(n) && n >= 2 && n <= 96) {
          freq.set(n, (freq.get(n) ?? 0) + 1);
        }
      }
    }
  }
  const extracted = [...freq.entries()].filter(([, c]) => c >= 2).map(([v]) => v).sort((a, b) => a - b);
  if (extracted.length >= 3) {
    return { spacingScale: extracted, spacingSource: "extracted", quantum: gcdQuantum(extracted), columnEdges };
  }

  // Inferred: does the page's own gap population sit on a 4pt or 8pt quantum?
  const gaps = allGaps(m);
  let quantum: number | null = null;
  for (const q of [8, 4]) {
    const near = gaps.filter((g) => Math.abs(g - q * Math.round(g / q)) <= 1).length;
    if (gaps.length >= 6 && near / gaps.length >= 0.55) {
      quantum = q;
      break;
    }
  }
  return { spacingScale: [], spacingSource: "inferred", quantum, columnEdges };
}

function gcdQuantum(scale: number[]): number | null {
  const ints = scale.filter((v) => Number.isInteger(v));
  if (!ints.length) return null;
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const q = ints.reduce((a, b) => gcd(a, b));
  return q >= 2 ? q : null;
}

function allGaps(m: Manifest): number[] {
  const gaps: number[] = [];
  for (const group of siblingGroups(m.elements)) {
    for (const axis of ["row", "stack"] as const) {
      for (const run of runsOf(group, axis)) {
        for (let i = 1; i < run.length; i++) {
          const g =
            axis === "row"
              ? run[i].rect.x - (run[i - 1].rect.x + run[i - 1].rect.width)
              : run[i].rect.y - (run[i - 1].rect.y + run[i - 1].rect.height);
          if (g >= 0) gaps.push(Math.round(g * 2) / 2);
        }
      }
    }
  }
  return gaps;
}

function siblingGroups(els: El[]): El[][] {
  const byParent = new Map<number | null, El[]>();
  for (const el of els) {
    const k = el.parent;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(el);
  }
  return [...byParent.values()].filter((g) => g.length >= 2);
}

// ---------- checks ----------

type Ctx = {
  m: Manifest;
  cal: Calibration;
  gapCounts: Map<number, number>;
  flagged: Set<string>;
  out: Omit<Finding, "id">[];
};

function push(ctx: Ctx, f: Omit<Finding, "id" | "elements" | "bbox"> & { els: El[] }): void {
  const key = `${f.check}:${f.els.map((e) => e.id).join(",")}`;
  if (ctx.flagged.has(key)) return;
  ctx.flagged.add(key);
  const { els, ...rest } = f;
  ctx.out.push({ ...rest, elements: els.map((e) => e.id), bbox: unionBbox(els) });
}

function checkEdgeAlignment(ctx: Ctx, group: El[]): void {
  const perEl = new Set<number>();
  const kinds: [string, (e: El) => number][] = [
    ["left", (e) => e.rect.x],
    ["right", (e) => e.rect.x + e.rect.width],
    ["center-x", (e) => e.rect.x + e.rect.width / 2],
  ];
  for (const [kind, val] of kinds) {
    const clusters = cluster(group.map(val), 1.5);
    const majors = clusters.filter((c) => c.idx.length >= 3);
    if (!majors.length) continue;
    for (const c of clusters.filter((c) => c.idx.length === 1)) {
      const el = group[c.idx[0]];
      if (perEl.has(el.id)) continue;
      const nearest = majors.reduce((a, b) => (Math.abs(b.mean - c.mean) < Math.abs(a.mean - c.mean) ? b : a));
      const d = Math.abs(c.mean - nearest.mean);
      if (d < 2 || d > 6) continue;
      const sameTag = nearest.idx.some((i) => group[i].tag === el.tag);
      perEl.add(el.id);
      push(ctx, {
        check: "near-miss-alignment",
        severity: d <= 4 && nearest.idx.length >= 4 ? "high" : "medium",
        confidence: sameTag ? "high" : "medium",
        calibration: "extracted",
        label: `${kind} off by ${round1(d)}px`,
        message: `${name(el)}: ${kind} edge at ${round1(c.mean)}px while ${nearest.idx.length} siblings share ${round1(nearest.mean)}px (Δ${round1(d)}px)`,
        els: [el],
      });
    }
  }
}

function checkSpacing(ctx: Ctx, group: El[]): void {
  const { spacingScale, spacingSource } = ctx.cal;
  for (const axis of ["row", "stack"] as const) {
    for (const run of runsOf(group, axis)) {
      const gaps: { g: number; a: El; b: El }[] = [];
      for (let i = 1; i < run.length; i++) {
        const a = run[i - 1];
        const b = run[i];
        const g = axis === "row" ? b.rect.x - (a.rect.x + a.rect.width) : b.rect.y - (a.rect.y + a.rect.height);
        if (g >= 0) gaps.push({ g: Math.round(g * 2) / 2, a, b });
      }
      // Inconsistent rhythm inside one run: majority gap + a single outlier.
      if (gaps.length >= 3) {
        const cs = cluster(gaps.map((x) => x.g), 1);
        const major = cs.find((c) => c.idx.length >= gaps.length - 1 && c.idx.length >= 2);
        const outlier = cs.find((c) => c.idx.length === 1);
        if (major && outlier && cs.length === 2) {
          const d = Math.abs(outlier.mean - major.mean);
          if (d >= 2 && d <= 12) {
            const { a, b } = gaps[outlier.idx[0]];
            push(ctx, {
              check: "inconsistent-gap",
              severity: d <= 6 ? "high" : "medium",
              confidence: "high",
              calibration: "extracted",
              label: `gap ${round1(outlier.mean)}px, siblings use ${round1(major.mean)}px`,
              message: `${axis} run of ${run.length}: gap between ${name(a)} and ${name(b)} is ${round1(outlier.mean)}px while the other ${major.idx.length} gaps are ${round1(major.mean)}px`,
              els: [a, b],
            });
          }
        }
      }
      // Off-scale: gap almost-but-not-quite on the app's declared/extracted scale.
      if (spacingSource === "inferred" || !spacingScale.length) continue;
      for (const { g, a, b } of gaps) {
        const nearest = spacingScale.reduce((p, s) => (Math.abs(s - g) < Math.abs(p - g) ? s : p));
        const d = Math.abs(g - nearest);
        if (d <= 0.75 || d > 3.5) continue;
        if ((ctx.gapCounts.get(g) ?? 0) >= 3) continue; // repeated page-wide → intentional token
        push(ctx, {
          check: "off-scale-spacing",
          severity: "medium",
          confidence: spacingSource === "declared" ? "high" : "medium",
          calibration: spacingSource,
          label: `gap ${round1(g)}px, scale has ${nearest}px`,
          message: `gap between ${name(a)} and ${name(b)} is ${round1(g)}px; nearest ${spacingSource} scale step is ${nearest}px (Δ${round1(d)}px)`,
          els: [a, b],
        });
      }
    }
  }
}

function checkRowBaseline(ctx: Ctx, group: El[]): void {
  for (const run of runsOf(group, "row")) {
    if (run.length < 4) continue;
    const centers = run.map((e) => e.rect.y + e.rect.height / 2);
    const cs = cluster(centers, 1.5);
    const major = cs.find((c) => c.idx.length >= 3);
    if (!major) continue;
    for (const c of cs.filter((c) => c.idx.length === 1)) {
      const d = Math.abs(c.mean - major.mean);
      if (d < 2 || d > 5) continue;
      const el = run[c.idx[0]];
      push(ctx, {
        check: "row-baseline",
        severity: "medium",
        confidence: "medium",
        calibration: "extracted",
        label: `v-center off by ${round1(d)}px`,
        message: `${name(el)}: vertical center ${round1(d)}px off the ${major.idx.length} siblings in its row`,
        els: [el],
      });
    }
  }
}

function checkSizeJitter(ctx: Ctx, group: El[]): void {
  for (const dim of ["width", "height"] as const) {
    const byTag = new Map<string, El[]>();
    for (const el of group) {
      // First class token only — modifier classes (`card card--wide`) must not split the group.
      const k = el.tag + "|" + (el.classes ?? "").split(/\s+/)[0];
      if (!byTag.has(k)) byTag.set(k, []);
      byTag.get(k)!.push(el);
    }
    for (const els of byTag.values()) {
      if (els.length < 4) continue;
      const cs = cluster(els.map((e) => e.rect[dim]), 1);
      const major = cs.find((c) => c.idx.length >= 3);
      if (!major) continue;
      for (const c of cs.filter((c) => c.idx.length === 1)) {
        const d = Math.abs(c.mean - major.mean);
        if (d < 2 || d > 6) continue;
        const el = els[c.idx[0]];
        push(ctx, {
          check: "size-jitter",
          severity: "medium",
          confidence: "high",
          calibration: "extracted",
          label: `${dim} ${round1(c.mean)}px vs ${round1(major.mean)}px`,
          message: `${name(el)}: ${dim} ${round1(c.mean)}px while ${major.idx.length} identical siblings are ${round1(major.mean)}px`,
          els: [el],
        });
      }
    }
  }
}

function checkOverflow(ctx: Ctx): void {
  const { viewport } = ctx.m;
  const byId = new Map(ctx.m.elements.map((e) => [e.id, e]));
  if (ctx.m.pageHScroll) {
    push(ctx, {
      check: "page-h-scroll",
      severity: "high",
      confidence: "high",
      calibration: "extracted",
      label: "page scrolls horizontally",
      message: `document is wider than the ${viewport.width}px viewport — something overflows`,
      els: [ctx.m.elements[0] ?? { id: -1, parent: null, tag: "body", rect: { x: 0, y: 0, width: viewport.width, height: 40 } } as El],
    });
  }
  for (const el of ctx.m.elements) {
    if (el.styles?.position === "fixed" || el.styles?.position === "absolute") continue;
    const right = el.rect.x + el.rect.width;
    if (right > viewport.width + 2 && el.rect.x < viewport.width) {
      push(ctx, {
        check: "viewport-overflow",
        severity: "high",
        confidence: "high",
        calibration: "extracted",
        label: `${round1(right - viewport.width)}px past viewport`,
        message: `${name(el)} extends ${round1(right - viewport.width)}px past the ${viewport.width}px viewport`,
        els: [el],
      });
      continue;
    }
    const parent = el.parent != null ? byId.get(el.parent) : undefined;
    if (!parent) continue;
    const pOverflow = (parent.styles?.overflowX ?? "visible") + (parent.styles?.overflowY ?? "visible");
    if (!/visible/.test(pOverflow) && pOverflow !== "visiblevisible") continue;
    const spill = Math.max(right - (parent.rect.x + parent.rect.width), parent.rect.x - el.rect.x);
    if (spill > 2 && el.rect.width <= parent.rect.width * 1.5) {
      push(ctx, {
        check: "parent-overflow",
        severity: "medium",
        confidence: "medium",
        calibration: "extracted",
        label: `spills ${round1(spill)}px out of parent`,
        message: `${name(el)} spills ${round1(spill)}px outside ${name(parent)}`,
        els: [el, parent],
      });
    }
  }
  for (const el of ctx.m.elements) {
    if (el.clipped) {
      push(ctx, {
        check: "clipped-content",
        severity: "high",
        confidence: "medium",
        calibration: "extracted",
        label: "content clipped",
        message: `${name(el)}: content is wider than its box and gets cut off (scrollWidth > clientWidth)`,
        els: [el],
      });
    }
  }
}

function checkOverlap(ctx: Ctx, group: El[]): void {
  const els = group.slice(0, 40).filter((e) => {
    const pos = e.styles?.position;
    return pos !== "absolute" && pos !== "fixed" && !e.styles?.transform && !(e.styles?.marginLeft ?? "").startsWith("-") && !(e.styles?.marginTop ?? "").startsWith("-");
  });
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      const a = els[i].rect;
      const b = els[j].rect;
      const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (w <= 4 || h <= 4) continue;
      const inter = w * h;
      const smaller = Math.min(a.width * a.height, b.width * b.height);
      if (inter >= smaller * 0.85) continue; // containment → intentional badge/overlay
      push(ctx, {
        check: "sibling-overlap",
        severity: "low",
        confidence: "low",
        calibration: "extracted",
        label: `overlap ${round1(w)}×${round1(h)}px`,
        message: `${name(els[i])} and ${name(els[j])} overlap by ${round1(w)}×${round1(h)}px without absolute positioning`,
        els: [els[i], els[j]],
      });
    }
  }
}

function checkPixelEdges(ctx: Ctx): void {
  for (const [key, axis] of [["verticalEdges", "vertical"], ["horizontalEdges", "horizontal"]] as const) {
    const edges = ctx.m[key];
    if (!edges?.length) continue;
    const max = Math.max(...edges.map((e) => e.strength));
    const strong = edges.filter((e) => e.strength >= max * 0.4).sort((a, b) => a.pos - b.pos);
    let flagged = 0;
    for (let i = 1; i < strong.length && flagged < 8; i++) {
      const d = strong[i].pos - strong[i - 1].pos;
      if (d < 2 || d > 6) continue;
      flagged++;
      const x = axis === "vertical" ? strong[i - 1].pos - 4 : 0;
      const y = axis === "vertical" ? 0 : strong[i - 1].pos - 4;
      push(ctx, {
        check: "pixel-edge-near-miss",
        severity: "low",
        confidence: "low",
        calibration: "inferred",
        label: `two ${axis} edges ${round1(d)}px apart`,
        message: `two strong ${axis} edges sit ${round1(d)}px apart (${round1(strong[i - 1].pos)} / ${round1(strong[i].pos)}) — possible misalignment, measured from pixels ±2px`,
        els: [
          {
            id: -1,
            parent: null,
            tag: "edge-pair",
            rect: axis === "vertical"
              ? { x, y, width: d + 8, height: ctx.m.viewport.height }
              : { x, y, width: ctx.m.viewport.width, height: d + 8 },
          } as El,
        ],
      });
    }
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------- entry ----------

export function runLint(m: Manifest, opts: { spacingScale?: number[] | null; max?: number } = {}): LintResult {
  const cal = calibrate(m, opts.spacingScale ?? null);
  const gapCounts = new Map<number, number>();
  for (const g of allGaps(m)) gapCounts.set(g, (gapCounts.get(g) ?? 0) + 1);
  const ctx: Ctx = { m, cal, gapCounts, flagged: new Set(), out: [] };

  if (m.source === "pixels") {
    checkPixelEdges(ctx);
  } else {
    for (const group of siblingGroups(m.elements)) {
      checkEdgeAlignment(ctx, group);
      checkSpacing(ctx, group);
      checkRowBaseline(ctx, group);
      checkSizeJitter(ctx, group);
      checkOverlap(ctx, group);
    }
    checkOverflow(ctx);
  }

  const sorted = ctx.out.sort(
    (a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || SEV_RANK[a.confidence] - SEV_RANK[b.confidence] || a.bbox.y - b.bbox.y,
  );
  const max = opts.max ?? 20;
  const findings = sorted.slice(0, max).map((f, i) => ({ ...f, id: i + 1 }));
  return {
    meta: {
      source: m.source,
      url: m.url,
      viewport: m.viewport,
      dpr: m.dpr,
      calibration: cal,
      total: sorted.length,
      shown: findings.length,
      suppressed: sorted.length - findings.length,
    },
    findings,
  };
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      out[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifest) {
    process.stderr.write("Usage: node lint.ts --manifest <path> [--spacing-scale 4,8,16,24] [--max 20] [--out <path>]\n");
    process.exit(1);
  }
  const manifest: Manifest = JSON.parse(readFileSync(args.manifest, "utf8"));
  const scale = args["spacing-scale"]
    ? args["spacing-scale"].split(",").map((s) => parseFloat(s)).filter((n) => Number.isFinite(n) && n > 0)
    : null;
  const result = runLint(manifest, { spacingScale: scale, max: args.max ? parseInt(args.max, 10) : undefined });
  const json = JSON.stringify(result, null, 2) + "\n";
  if (args.out) writeFileSync(args.out, json);
  process.stdout.write(json);
}

if (import.meta.main) {
  main().catch((e) => {
    process.stderr.write(`error: ${(e as Error).message}\n`);
    process.exit(1);
  });
}
