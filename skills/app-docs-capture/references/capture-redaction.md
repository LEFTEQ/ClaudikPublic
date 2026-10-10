# Capture + redaction recipes

## Capture script pattern

Write a `.mjs` script in the repo's gitignored scratch dir and run it with the repo's own Playwright (`@playwright/test` devDep; `npx playwright install chromium` if the browser build is missing). Never /tmp — module resolution needs the repo root.

```js
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 810 } })).newPage();
await page.goto(URL, { waitUntil: 'networkidle' });
// dismiss cookie banner ONCE per context
const cookie = page.getByRole('button', { name: 'Odmítnout vše' }); // or Přijmout
if (await cookie.isVisible().catch(() => false)) await cookie.click();
```

- One coherent state per shot; capture after render settles (`waitForTimeout` 800–1500ms after navigation on SPA admin screens).
- Full-page shots of docs pages: force lazy images + scroll through first, or below-fold images render blank:

```js
await page.evaluate(async () => {
  document.querySelectorAll('img').forEach((i) => (i.loading = 'eager'));
  const h = document.body.scrollHeight;
  for (let y = 0; y <= h; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 100)); }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(1000);
await shot(page, { path: OUT, fullPage: true, animations: 'disabled' }); // redacts first — see Redaction
```

- `screenshot()` hanging repeatedly on one tab (fonts loaded, then silence) = wedged tab/browser — relaunch; don't keep retrying.
- Credentials: never inline. Inject via Onyx `run_command` `env_refs` (script reads `process.env.X`); output is suppressed, so write status/rect dumps to a JSON file and read that after.

## Redaction

Two techniques — pick by timing:

**Before capture — DOM replacement** (preferred: pixel-perfect, free).

A redaction pass is NOT a state of the page: navigation, a dialog or tab mounted later, a refetch or any framework re-render paints the real values again from app state. Run the pass **immediately before every screenshot**, after every state change — make `shot()` the script's only screenshot call so it can't be skipped. It covers text nodes and what they miss: every attribute (`title`, `aria-label`, `placeholder`, `alt`, `value`, `href`, `data-*`), live `input`/`textarea` values and open shadow roots, in every frame.

```js
const PAIRS = [['<real email>', 'customer@example.invalid'], ['<real full name>', 'Alex Example']];

function scrub({ pairs, apply }) { // runs in the page; returns the hits it saw
  const hit = (s) => typeof s === 'string' && pairs.some(([a]) => s.includes(a));
  const fix = (s) => pairs.reduce((t, [a, b]) => t.split(a).join(b), s);
  let hits = 0;
  const visit = (root) => {
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let n = walk.currentNode; n; n = walk.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) { if (hit(n.nodeValue)) { hits++; if (apply) n.nodeValue = fix(n.nodeValue); } continue; }
      for (const at of n.attributes ?? []) if (hit(at.value)) { hits++; if (apply) at.value = fix(at.value); }
      if ((n.tagName === 'INPUT' || n.tagName === 'TEXTAREA') && hit(n.value)) { hits++; if (apply) n.value = fix(n.value); }
      if (n.shadowRoot) visit(n.shadowRoot);
    }
  };
  visit(document);
  return hits;
}

async function shot(page, opts) {
  const scan = async (apply) => (await Promise.all(page.frames().map((f) => f.evaluate(scrub, { pairs: PAIRS, apply })))).reduce((a, b) => a + b, 0);
  await scan(true);
  await page.screenshot(opts);
  // a re-render between the pass and the pixels can bring a value back — then the shot is not safe
  if (await scan(false)) throw new Error(`real values re-rendered around ${opts.path} — retake it`);
}
```

The scan only sees the DOM: text drawn into a `<canvas>`, images, avatars, PDFs or a closed shadow root is invisible to it — cover those with `page.screenshot({ mask: [locator] })` or a pixel patch below. A clean scan never replaces the visual check.

**After capture — pixel patch** (for shots you can't retake): sample the background right next to the region, cover with a rect, optionally draw placeholder dots:

```sh
c=$(magick shot.png -format "%[pixel:p{X,Y}]" info:)   # sample per-image (modal dimming changes it!)
magick shot.png -fill "$c" -draw "rectangle x1,y1 x2,y2" out.png
# secrets (API keys): cover then draw dots so the field doesn't look empty
magick shot.png -fill "#f8f8f8" -draw "rectangle …" -fill "#9ca3af" -pointsize 40 -font Courier -annotate +X+Y "•••••••••••" out.png
```

Gotchas:
- Angular/custom elements: text may live in `<ui-badge>`, `<ui-select>` etc. — `querySelectorAll('span, div')` misses them. When a selector finds nothing, dump leaf elements (`children.length === 0`) with tag names first.
- Verify the redaction visually on EVERY shot, whichever technique ran: crop each redacted region and Read it.

## Presentational state reconstruction

When the backend can't produce the state the docs need, you may DOM-patch the real page to the real state's exact strings/styles — copy the wording from a tenant that HAS the state, patch chip text + inline style + button label, screenshot. Genuine UI, not a mockup. Always tell the user which shots are reconstructions.

## Next.js dev image-cache trap (Next 16)

Replacing files in `public/` does NOT update rendered pages in dev:

- Optimizer cache lives at **`.next/dev/cache/images`** (NOT `.next/cache/images`).
- AVIF and WebP variants cache separately — `curl` (no Accept header) gets WebP and may look fresh while the browser's AVIF variant is stale.
- Order matters: **stop the dev server → `rm -rf .next/dev/cache/images` → start → capture.** Wiping while the server runs does nothing (in-memory entries get re-written).
