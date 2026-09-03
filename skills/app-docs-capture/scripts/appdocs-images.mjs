#!/usr/bin/env node
/**
 * appdocs-images — versioned docs-screenshot structure manager.
 *
 * Layout: public/images/appdocs/<group>/<doc>/v<N>.<name>.png        (raw)
 *         public/images/appdocs/<group>/<doc>/v<N>.<name>.min.webp   (published, q90)
 *
 * Copy this file into the target repo's scripts/ dir. Zero deps; encoding
 * shells out to `magick` (ImageMagick) or `cwebp`.
 *
 *   add <group>/<doc> -v <N> -n <name> -f <sourceFile> [--force] [--no-raw]
 *   bump <group>/<doc> --from <N> --to <M> [name…]
 *   list [group[/doc]]
 *   check
 *   prune
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const BASE = path.join(process.cwd(), 'public', 'images', 'appdocs');
const QUALITY = '90';
const NAME_RE = /^v(\d+)\.([a-z0-9]+(?:-[a-z0-9]+)*)(\.min)?\.(png|webp|jpg|jpeg|noraw)$/;

const die = (msg) => { console.error('✗ ' + msg); process.exit(1); };
const ok = (msg) => console.log('✓ ' + msg);

function encoderAvailable() {
  for (const bin of ['magick', 'cwebp']) {
    if (spawnSync('which', [bin], { stdio: 'ignore' }).status === 0) return bin;
  }
  die('need `magick` (ImageMagick) or `cwebp` on PATH for WebP encoding');
}

function encodeWebp(src, dest) {
  const bin = encoderAvailable();
  if (bin === 'magick') execFileSync('magick', [src, '-quality', QUALITY, dest]);
  else execFileSync('cwebp', ['-q', QUALITY, src, '-o', dest], { stdio: 'ignore' });
}

function parseTarget(arg) {
  const [group, doc] = (arg ?? '').split('/');
  if (!group || !doc) die('target must be <group>/<doc>');
  if (!/^[a-z0-9-]+$/.test(group) || !/^[a-z0-9-]+$/.test(doc)) die('group/doc must be kebab-case');
  return { group, doc, dir: path.join(BASE, group, doc) };
}

function flag(args, ...names) {
  for (const n of names) {
    const i = args.indexOf(n);
    if (i !== -1) { const v = args[i + 1]; args.splice(i, 2); return v; }
  }
  return undefined;
}
function boolFlag(args, name) {
  const i = args.indexOf(name);
  if (i !== -1) { args.splice(i, 1); return true; }
  return false;
}

const [, , cmd, ...args] = process.argv;

if (cmd === 'add') {
  const force = boolFlag(args, '--force');
  const noRaw = boolFlag(args, '--no-raw');
  const version = flag(args, '-v', '--version');
  const name = flag(args, '-n', '--name');
  const from = flag(args, '-f', '--from');
  const { dir } = parseTarget(args[0]);
  if (!/^\d+$/.test(version ?? '')) die('-v <int> required');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name ?? '')) die('-n <kebab-name> required (no dots)');
  if (!from || !fs.existsSync(from)) die('-f <sourceFile> must exist');

  fs.mkdirSync(dir, { recursive: true });
  const rawExt = path.extname(from).slice(1).toLowerCase() || 'png';
  const rawDest = path.join(dir, `v${version}.${name}.${rawExt}`);
  const minDest = path.join(dir, `v${version}.${name}.min.webp`);
  for (const dest of [rawDest, minDest]) {
    if (fs.existsSync(dest) && !force) die(`${path.relative(process.cwd(), dest)} exists — pass --force to override`);
  }
  if (noRaw) fs.writeFileSync(path.join(dir, `v${version}.${name}.noraw`), '');
  else fs.copyFileSync(from, rawDest);
  encodeWebp(from, minDest);
  ok(`${path.relative(process.cwd(), minDest)}${noRaw ? ' (no raw)' : ' + raw'}`);
} else if (cmd === 'bump') {
  const fromV = flag(args, '--from');
  const toV = flag(args, '--to');
  const { dir } = parseTarget(args[0]);
  const only = args.slice(1);
  if (!/^\d+$/.test(fromV ?? '') || !/^\d+$/.test(toV ?? '')) die('--from <int> --to <int> required');
  if (!fs.existsSync(dir)) die('no such doc dir');
  let n = 0;
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(NAME_RE);
    if (!m || m[1] !== fromV) continue;
    if (only.length && !only.includes(m[2])) continue;
    const dest = path.join(dir, f.replace(`v${fromV}.`, `v${toV}.`));
    if (fs.existsSync(dest)) { console.log(`- skip (exists): ${path.basename(dest)}`); continue; }
    fs.copyFileSync(path.join(dir, f), dest);
    n++;
  }
  ok(`bumped ${n} file(s) v${fromV} → v${toV}`);
} else if (cmd === 'list') {
  if (!fs.existsSync(BASE)) die('no appdocs dir yet');
  const [g, d] = (args[0] ?? '').split('/');
  for (const group of fs.readdirSync(BASE).filter((x) => !g || x === g)) {
    for (const doc of fs.readdirSync(path.join(BASE, group)).filter((x) => !d || x === d)) {
      const files = fs.readdirSync(path.join(BASE, group, doc));
      const versions = {};
      for (const f of files) {
        const m = f.match(NAME_RE);
        if (m) (versions[`v${m[1]}`] ??= new Set()).add(m[2]);
      }
      const summary = Object.entries(versions).map(([v, s]) => `${v}:${s.size}`).join(' ') || 'empty';
      console.log(`${group}/${doc}  ${summary}`);
    }
  }
} else if (cmd === 'check') {
  if (!fs.existsSync(BASE)) die('no appdocs dir yet');
  let bad = 0;
  const walk = (dir, depth = 0) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth >= 2) { console.log(`✗ unexpected nested dir: ${path.relative(BASE, p)}`); bad++; }
        else walk(p, depth + 1);
        continue;
      }
      if (depth < 2) { console.log(`✗ file outside <group>/<doc>: ${path.relative(BASE, p)}`); bad++; continue; }
      const m = entry.name.match(NAME_RE);
      if (!m) { console.log(`✗ bad name: ${path.relative(BASE, p)}`); bad++; continue; }
      if (m[3] === '.min') {
        const stem = `v${m[1]}.${m[2]}`;
        const siblings = fs.readdirSync(dir);
        const hasRaw = siblings.some((f) => { const s = f.match(NAME_RE); return s && !s[3] && `v${s[1]}.${s[2]}` === stem && s[4] !== 'noraw'; });
        const noRaw = siblings.includes(`${stem}.noraw`);
        if (!hasRaw && !noRaw) { console.log(`✗ min without raw: ${path.relative(BASE, p)}`); bad++; }
      }
    }
    if (fs.readdirSync(dir).length === 0) console.log(`- empty dir (prune): ${path.relative(BASE, dir)}`);
  };
  walk(BASE);
  bad ? die(`${bad} problem(s)`) : ok('structure clean');
} else if (cmd === 'prune') {
  if (!fs.existsSync(BASE)) die('no appdocs dir yet');
  let n = 0;
  for (const group of fs.readdirSync(BASE)) {
    const gDir = path.join(BASE, group);
    for (const doc of fs.readdirSync(gDir)) {
      const dDir = path.join(gDir, doc);
      if (fs.statSync(dDir).isDirectory() && fs.readdirSync(dDir).length === 0) { fs.rmdirSync(dDir); n++; }
    }
    if (fs.readdirSync(gDir).length === 0) { fs.rmdirSync(gDir); n++; }
  }
  ok(`pruned ${n} empty dir(s)`);
} else {
  console.log('usage: appdocs-images.mjs <add|bump|list|check|prune> …  (layout + commands documented at the top of this file)');
  process.exit(cmd ? 1 : 0);
}
