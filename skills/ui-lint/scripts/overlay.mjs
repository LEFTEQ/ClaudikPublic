#!/usr/bin/env node
// overlay.mjs — burn ui-lint findings onto the screenshot as numbered set-of-mark
// badges + measurement labels, and emit a zoom crop per finding. The annotated
// image + crops are what the VLM judges — it never eyeballs raw pixels.
//
// Usage:
//   node overlay.mjs --screenshot <img> --findings <findings.json> --out-dir <dir> [--grid] [--max 12]
//
// findings.json = lint.ts output (meta.dpr scales CSS-px bboxes to device px;
// pixel-mode manifests use dpr=1 so bboxes are already image px).
// Output: <base>.lint.jpg (long edge ≤1568 — Claude vision standard-tier cap)
//         mark-NN.jpg zoom crops (annotated, readable at model resolution)
// Needs `sharp` resolvable from cwd; exits 2 if missing (same as annotate.mjs).

import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, join, basename, extname } from 'node:path';
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
  console.error('[overlay.mjs] sharp is not resolvable from cwd. Run `npm i sharp` here, or fall back to the findings table + raw screenshot.');
  process.exit(2);
}

const MAX_DIM = 1568;     // Claude vision standard-tier long-edge cap
const CROP_PAD = 64;      // device px around a finding's bbox
const CROP_MAX = 1400;
const CROP_MIN = 500;     // upscale tiny crops so measurements stay legible
const RED = '#ef4444';
const BLUE = '#3b82f6';

const args = parseArgs(process.argv.slice(2));
if (!args.screenshot || !args.findings || !args['out-dir']) {
  console.error('Usage: node overlay.mjs --screenshot <img> --findings <findings.json> --out-dir <dir> [--grid] [--max 12]');
  process.exit(1);
}

const shotPath = resolve(args.screenshot);
const outDir = resolve(args['out-dir']);
mkdirSync(outDir, { recursive: true });
const result = JSON.parse(readFileSync(resolve(args.findings), 'utf8'));
const dpr = result.meta?.dpr ?? 1;
const maxMarks = args.max ? parseInt(args.max, 10) : 12;
const findings = (result.findings ?? []).slice(0, maxMarks);

const meta = await sharp(shotPath).metadata();
const imgW = meta.width ?? 0;
const imgH = meta.height ?? 0;
if (!imgW || !imgH) {
  console.error('[overlay.mjs] could not read image dimensions');
  process.exit(1);
}

const svg = buildSvg();
const annotatedNative = await sharp(shotPath)
  .composite([{ input: Buffer.from(svg, 'utf8'), top: 0, left: 0 }])
  .toBuffer();

const outBase = basename(shotPath, extname(shotPath));
const annotatedPath = join(outDir, `${outBase}.lint.jpg`);
await sharp(annotatedNative)
  .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
  .jpeg({ quality: 85, mozjpeg: true })
  .toFile(annotatedPath);

const crops = [];
for (const f of findings) {
  const b = deviceBox(f.bbox);
  const x = clamp(Math.round(b.x - CROP_PAD), 0, imgW - 1);
  const y = clamp(Math.round(b.y - CROP_PAD), 0, imgH - 1);
  const wid = clamp(Math.round(b.w + 2 * CROP_PAD), 8, imgW - x);
  const hei = clamp(Math.round(b.h + 2 * CROP_PAD), 8, imgH - y);
  const cropPath = join(outDir, `mark-${String(f.id).padStart(2, '0')}.jpg`);
  let pipe = sharp(annotatedNative).extract({ left: x, top: y, width: wid, height: hei });
  const long = Math.max(wid, hei);
  if (long > CROP_MAX) pipe = pipe.resize({ width: CROP_MAX, height: CROP_MAX, fit: 'inside' });
  else if (long < CROP_MIN) pipe = pipe.resize({ width: Math.round(wid * 2), height: Math.round(hei * 2), fit: 'inside' });
  await pipe.jpeg({ quality: 88, mozjpeg: true }).toFile(cropPath);
  crops.push({ id: f.id, path: cropPath, label: f.label });
}

console.log(JSON.stringify({ annotated: annotatedPath, crops }, null, 2));

function deviceBox(bbox) {
  return { x: bbox.x * dpr, y: bbox.y * dpr, w: Math.max(bbox.width * dpr, 2), h: Math.max(bbox.height * dpr, 2) };
}

function buildSvg() {
  const s = Math.max(1, Math.round(dpr)); // stroke/font scale
  const parts = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${imgH}" viewBox="0 0 ${imgW} ${imgH}">`);

  if (args.grid !== undefined && result.meta?.calibration?.columnEdges?.length) {
    for (const edge of result.meta.calibration.columnEdges) {
      const x = edge * dpr;
      parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${imgH}" stroke="${BLUE}" stroke-width="${s}" stroke-dasharray="${8 * s} ${6 * s}" opacity="0.6"/>`);
    }
  }

  for (const f of findings) {
    const b = deviceBox(f.bbox);
    const x = clamp(b.x, 0, imgW);
    const y = clamp(b.y, 0, imgH);
    const w = clamp(b.w, 2, imgW - x);
    const h = clamp(b.h, 2, imgH - y);
    const badgeR = 14 * s;
    const font = 13 * s;

    parts.push(`<rect x="${x - 3 * s}" y="${y - 3 * s}" width="${w + 6 * s}" height="${h + 6 * s}" rx="${4 * s}" fill="none" stroke="${RED}" stroke-width="${2.5 * s}"/>`);
    parts.push(
      `<circle cx="${x}" cy="${y}" r="${badgeR}" fill="${RED}"/>` +
      `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="-apple-system, system-ui, sans-serif" font-weight="700" font-size="${font}">${f.id}</text>`,
    );

    const label = escapeXml(`#${f.id} ${f.label}`);
    const labelW = (label.length * 0.62 + 2) * font;
    const labelH = font * 1.8;
    const ly = y + h + labelH + 4 * s > imgH ? y - labelH - 6 * s : y + h + 6 * s;
    const lx = clamp(x, 0, Math.max(0, imgW - labelW));
    parts.push(
      `<rect x="${lx}" y="${ly}" width="${labelW}" height="${labelH}" rx="${3 * s}" fill="#111827" opacity="0.92"/>` +
      `<text x="${lx + font * 0.6}" y="${ly + labelH / 2}" dominant-baseline="central" fill="#fff" font-family="-apple-system, system-ui, sans-serif" font-size="${font}">${label}</text>`,
    );
  }

  parts.push(`</svg>`);
  return parts.join('');
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}
