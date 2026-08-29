#!/usr/bin/env node
// pixel-edges.mjs — image-only fallback for ui-lint (native sim shots, mockups).
// Extracts strong vertical/horizontal edges via gradient projection profiles and
// emits a pseudo-manifest (source: "pixels") that lint.ts consumes.
//
// Usage: node pixel-edges.mjs --image <screenshot> --out <manifest.json>
//
// Needs `sharp` resolvable from cwd. Exits 2 if missing so the skill can fall
// back to pure VLM judgment with tiled crops (same convention as annotate.mjs).

import { writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';

// Bare `import('sharp')` resolves from THIS file's dir, not cwd — a project-local
// sharp install would never be found. Resolve cwd-first via createRequire.
let sharp = null;
for (const base of [join(process.cwd(), 'noop.js'), import.meta.url]) {
  try {
    sharp = createRequire(base)('sharp');
    break;
  } catch {}
}
if (!sharp) {
  console.error('[pixel-edges.mjs] sharp is not resolvable from cwd. Run `npm i sharp` (or bun/pnpm) here, or skip the pixel path.');
  process.exit(2);
}

const WORK_MAX = 2000;   // downscale huge shots for speed; positions are mapped back
const MAX_EDGES = 300;

const args = parseArgs(process.argv.slice(2));
if (!args.image || !args.out) {
  console.error('Usage: node pixel-edges.mjs --image <screenshot> --out <manifest.json>');
  process.exit(1);
}

const imgPath = resolve(args.image);
const meta = await sharp(imgPath).metadata();
const origW = meta.width ?? 0;
const origH = meta.height ?? 0;
if (!origW || !origH) {
  console.error('[pixel-edges.mjs] could not read image dimensions');
  process.exit(1);
}

const scaleDown = Math.max(origW, origH) > WORK_MAX ? WORK_MAX / Math.max(origW, origH) : 1;
const { data, info } = await sharp(imgPath)
  .resize({ width: Math.round(origW * scaleDown), height: Math.round(origH * scaleDown), fit: 'fill' })
  .grayscale()
  .raw()
  .toBuffer({ resolveWithObject: true });

const w = info.width;
const h = info.height;
const backScale = origW / w;

// Projection profiles of gradient magnitude: a UI edge (card border, column
// boundary) shows as a tall spike in the column-wise |∂x| sum.
const vProfile = new Float64Array(w);
const hProfile = new Float64Array(h);
for (let y = 0; y < h; y++) {
  const row = y * w;
  for (let x = 0; x < w - 1; x++) {
    vProfile[x] += Math.abs(data[row + x + 1] - data[row + x]);
  }
}
for (let y = 0; y < h - 1; y++) {
  const row = y * w;
  const next = (y + 1) * w;
  let sum = 0;
  for (let x = 0; x < w; x++) sum += Math.abs(data[next + x] - data[row + x]);
  hProfile[y] = sum;
}

const verticalEdges = peaks(vProfile).map(({ pos, strength }) => ({ pos: r1(pos * backScale), strength }));
const horizontalEdges = peaks(hProfile).map(({ pos, strength }) => ({ pos: r1(pos * backScale), strength }));

const manifest = {
  source: 'pixels',
  viewport: { width: origW, height: origH },
  dpr: 1, // image px == overlay px in this mode
  elements: [],
  verticalEdges,
  horizontalEdges,
};
writeFileSync(resolve(args.out), JSON.stringify(manifest, null, 2) + '\n');
console.log(`[pixel-edges.mjs] ${verticalEdges.length} vertical + ${horizontalEdges.length} horizontal edges → ${args.out}`);

function peaks(profile) {
  const n = profile.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += profile[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (profile[i] - mean) ** 2;
  const thresh = mean + 1.5 * Math.sqrt(variance / n);

  const found = [];
  for (let i = 1; i < n - 1; i++) {
    if (profile[i] >= thresh && profile[i] >= profile[i - 1] && profile[i] >= profile[i + 1]) {
      found.push({ pos: i, strength: profile[i] });
    }
  }
  // normalize strength 0..1, keep the strongest MAX_EDGES
  const max = found.reduce((m, e) => Math.max(m, e.strength), 1);
  return found
    .map((e) => ({ pos: e.pos, strength: r1(e.strength / max) }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, MAX_EDGES)
    .sort((a, b) => a.pos - b.pos);
}

function r1(n) {
  return Math.round(n * 10) / 10;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      out[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}
