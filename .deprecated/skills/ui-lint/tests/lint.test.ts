import { test } from "node:test";
import assert from "node:assert/strict";
import { cluster, calibrate, runLint, type Manifest, type El } from "../scripts/lint.ts";

let nextId = 0;
function el(x: number, y: number, width: number, height: number, extra: Partial<El> = {}): El {
  return { id: nextId++, parent: 0, tag: "div", rect: { x, y, width, height }, ...extra };
}
function make(builder: () => El[], extra: Partial<Manifest> = {}): Manifest {
  nextId = 1; // root takes 0
  const els = builder();
  const root: El = { id: 0, parent: null, tag: "main", rect: { x: 0, y: 0, width: 1440, height: 900 } };
  return { source: "dom", viewport: { width: 1440, height: 900 }, dpr: 2, elements: [root, ...els], ...extra };
}
function checks(m: Manifest, scale?: number[]): string[] {
  return runLint(m, { spacingScale: scale ?? null }).findings.map((f) => f.check);
}

test("cluster groups within tolerance and splits beyond it", () => {
  const cs = cluster([24, 24.5, 23.8, 27, 100], 1.5);
  assert.equal(cs.length, 3);
  assert.deepEqual(cs.map((c) => c.idx.length).sort(), [1, 1, 3]);
});

test("aligned stack produces no findings", () => {
  const m = make(() => [
    el(24, 100, 300, 40),
    el(24, 156, 300, 40),
    el(24, 212, 300, 40),
    el(24, 268, 300, 40),
  ]);
  assert.deepEqual(checks(m), []);
});

test("one 4px-off card among aligned siblings → near-miss-alignment", () => {
  const m = make(() => [
    el(24, 100, 300, 40),
    el(24, 156, 300, 40),
    el(24, 212, 300, 40),
    el(28, 268, 300, 40), // 4px off
  ]);
  const r = runLint(m);
  const f = r.findings.find((x) => x.check === "near-miss-alignment");
  assert.ok(f, "expected near-miss-alignment");
  assert.match(f!.label, /4px/);
  assert.equal(f!.confidence, "high"); // same tag as majority
});

test("intentional indent (>6px) is NOT flagged", () => {
  const m = make(() => [
    el(24, 100, 300, 40),
    el(24, 156, 300, 40),
    el(24, 212, 300, 40),
    el(56, 268, 268, 40), // 32px indent — deliberate
  ]);
  assert.ok(!checks(m).includes("near-miss-alignment"));
});

test("gaps 16,16,16,23 in one stack → inconsistent-gap", () => {
  const m = make(() => [
    el(24, 100, 300, 40),
    el(24, 156, 300, 40), // gap 16
    el(24, 212, 300, 40), // gap 16
    el(24, 268, 300, 40), // gap 16
    el(24, 331, 300, 40), // gap 23
  ]);
  const r = runLint(m);
  const f = r.findings.find((x) => x.check === "inconsistent-gap");
  assert.ok(f, "expected inconsistent-gap");
  assert.match(f!.message, /23px/);
});

test("gap 18 vs declared scale [4,8,16,24] → off-scale-spacing", () => {
  const m = make(() => [
    el(24, 100, 300, 40),
    el(24, 158, 300, 40), // gap 18 — near 16, off scale
  ]);
  const r = runLint(m, { spacingScale: [4, 8, 16, 24] });
  const f = r.findings.find((x) => x.check === "off-scale-spacing");
  assert.ok(f, "expected off-scale-spacing");
  assert.equal(f!.calibration, "declared");
  assert.equal(f!.confidence, "high");
});

test("odd gap repeated ≥3× page-wide is treated as an intentional token", () => {
  const m = make(() => [
    // three separate pairs, all with the same odd 18px gap
    el(24, 100, 100, 40), el(24, 158, 100, 40),
    el(400, 100, 100, 40, { parent: 0 }), el(400, 158, 100, 40, { parent: 0 }),
    el(800, 100, 100, 40, { parent: 0 }), el(800, 158, 100, 40, { parent: 0 }),
  ]);
  const r = runLint(m, { spacingScale: [4, 8, 16, 24] });
  assert.ok(!r.findings.some((x) => x.check === "off-scale-spacing"), "repeated gap should be suppressed");
});

test("no off-scale check when calibration is inferred", () => {
  const m = make(() => [
    el(24, 100, 300, 40),
    el(24, 158, 300, 40), // gap 18
  ]);
  const r = runLint(m); // no scale, nothing extractable → inferred
  assert.equal(r.meta.calibration.spacingSource, "inferred");
  assert.ok(!r.findings.some((x) => x.check === "off-scale-spacing"));
});

test("element past the viewport → viewport-overflow, absolute-positioned skipped", () => {
  const m = make(() => [
    el(1300, 100, 200, 40), // right edge 1500 > 1440
    el(1300, 200, 200, 40, { styles: { position: "absolute" } }),
  ]);
  const found = runLint(m).findings.filter((x) => x.check === "viewport-overflow");
  assert.equal(found.length, 1);
});

test("pageHScroll flag → page-h-scroll finding", () => {
  const m = make(() => [el(24, 100, 300, 40)], { pageHScroll: true });
  assert.ok(checks(m).includes("page-h-scroll"));
});

test("clipped element → clipped-content", () => {
  const m = make(() => [el(24, 100, 300, 40, { clipped: true, text: "Dlouhý název pobočky…" })]);
  assert.ok(checks(m).includes("clipped-content"));
});

test("size jitter: 243px card among 240px identical siblings → size-jitter", () => {
  const m = make(() => [
    el(24, 100, 240, 120, { classes: "card" }),
    el(288, 100, 240, 120, { classes: "card" }),
    el(552, 100, 240, 120, { classes: "card" }),
    el(816, 100, 243, 120, { classes: "card" }),
  ]);
  const r = runLint(m);
  assert.ok(r.findings.some((x) => x.check === "size-jitter"));
});

test("size jitter: a modifier class must not split the sibling group", () => {
  const m = make(() => [
    el(24, 100, 240, 120, { classes: "stat" }),
    el(288, 100, 240, 120, { classes: "stat" }),
    el(552, 100, 240, 120, { classes: "stat" }),
    el(816, 100, 243, 120, { classes: "stat off" }),
  ]);
  const r = runLint(m);
  assert.ok(r.findings.some((x) => x.check === "size-jitter"));
});

test("row v-center outlier → row-baseline", () => {
  const m = make(() => [
    el(24, 100, 80, 24),
    el(128, 100, 80, 24),
    el(232, 100, 80, 24),
    el(336, 103, 80, 24), // center 3px lower
  ]);
  assert.ok(checks(m).includes("row-baseline"));
});

test("partial sibling overlap flagged low; containment (badge) not flagged", () => {
  const overlap = make(() => [
    el(24, 100, 200, 100),
    el(200, 150, 200, 100), // partial overlap
  ]);
  const f = runLint(overlap).findings.find((x) => x.check === "sibling-overlap");
  assert.ok(f);
  assert.equal(f!.severity, "low");

  const badge = make(() => [
    el(24, 100, 200, 100),
    el(30, 106, 20, 20), // fully inside → containment, intentional
  ]);
  assert.ok(!checks(badge).includes("sibling-overlap"));
});

test("calibration: extracted from computed gap styles", () => {
  const m = make(() => [
    el(24, 100, 300, 40, { styles: { gap: "8px" } }),
    el(24, 156, 300, 40, { styles: { gap: "8px" } }),
    el(24, 212, 300, 40, { styles: { gap: "16px", paddingLeft: "24px" } }),
    el(24, 268, 300, 40, { styles: { paddingLeft: "24px", paddingTop: "16px" } }),
  ]);
  const cal = calibrate(m, null);
  assert.equal(cal.spacingSource, "extracted");
  assert.deepEqual(cal.spacingScale, [8, 16, 24]);
});

test("calibration: 8pt quantum inferred from gap population", () => {
  const m = make(() => [
    el(24, 100, 100, 40), el(24, 148, 100, 40), el(24, 196, 100, 40), el(24, 244, 100, 40), // gaps 8
    el(400, 100, 100, 40), el(400, 156, 100, 40), el(400, 212, 100, 40), el(400, 268, 100, 40), // gaps 16
  ]);
  const cal = calibrate(m, null);
  assert.equal(cal.spacingSource, "inferred");
  assert.equal(cal.quantum, 8);
});

test("calibration: column edges from ≥4-member left-edge clusters", () => {
  const m = make(() => [
    el(24, 100, 100, 40), el(24, 160, 100, 40), el(24, 220, 100, 40), el(24, 280, 100, 40),
    el(400, 100, 100, 40), el(401, 160, 100, 40),
  ]);
  const cal = calibrate(m, null);
  assert.ok(cal.columnEdges.includes(24));
  assert.ok(!cal.columnEdges.some((e) => Math.abs(e - 400) < 2), "2-member cluster is not a column");
});

test("pixels mode: two strong vertical edges 4px apart → pixel-edge-near-miss", () => {
  const m: Manifest = {
    source: "pixels",
    viewport: { width: 1200, height: 800 },
    dpr: 1,
    elements: [],
    verticalEdges: [
      { pos: 100, strength: 1 },
      { pos: 104, strength: 0.9 },
      { pos: 600, strength: 0.95 },
      { pos: 900, strength: 0.1 }, // weak — ignored
    ],
    horizontalEdges: [],
  };
  const r = runLint(m);
  const f = r.findings.find((x) => x.check === "pixel-edge-near-miss");
  assert.ok(f);
  assert.equal(f!.calibration, "inferred");
  assert.equal(f!.confidence, "low");
});

test("findings are capped and suppressed count reported", () => {
  const els: El[] = [];
  nextId = 1;
  for (let i = 0; i < 30; i++) {
    els.push(el(1300, 30 + i * 30, 200, 20)); // 30 viewport overflows
  }
  const root: El = { id: 0, parent: null, tag: "main", rect: { x: 0, y: 0, width: 1440, height: 900 } };
  const m: Manifest = { source: "dom", viewport: { width: 1440, height: 900 }, dpr: 2, elements: [root, ...els] };
  const r = runLint(m, { max: 10 });
  assert.equal(r.findings.length, 10);
  assert.equal(r.meta.suppressed, r.meta.total - 10);
  assert.deepEqual(r.findings.map((f) => f.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});
