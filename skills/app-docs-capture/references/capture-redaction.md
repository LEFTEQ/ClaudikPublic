# Capture + redaction recipes

## Capture script pattern

Write a `.mjs` script in the repo's gitignored scratch dir and run it with the repo's own Playwright (`@playwright/test` devDep; `npx playwright install chromium` if the browser build is missing). Never /tmp — module resolution needs the repo root.

```js
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
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
await page.screenshot({ path: OUT, fullPage: true, animations: 'disabled' });
```

- `screenshot()` hanging repeatedly on one tab (fonts loaded, then silence) = wedged tab/browser — relaunch; don't keep retrying.
- Credentials: never inline. Inject via Onyx `run_command` `env_refs` (script reads `process.env.X`); output is suppressed, so write status/rect dumps to a JSON file and read that after.

## Redaction

Two techniques — pick by timing:

**Before capture — DOM text replacement** (preferred: pixel-perfect, free):

```js
await page.evaluate((pairs) => {
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while ((n = walk.nextNode()))
    for (const [a, b] of pairs) if (n.nodeValue.includes(a)) n.nodeValue = n.nodeValue.split(a).join(b);
}, [['real@email.cz', 'vas@email.cz'], ['Real Name', 'Jana Nováková']]);
```

DOM edits persist until navigation — dialogs opened afterwards stay redacted.

**After capture — pixel patch** (for shots you can't retake): sample the background right next to the region, cover with a rect, optionally draw placeholder dots:

```sh
c=$(magick shot.png -format "%[pixel:p{X,Y}]" info:)   # sample per-image (modal dimming changes it!)
magick shot.png -fill "$c" -draw "rectangle x1,y1 x2,y2" out.png
# secrets (API keys): cover then draw dots so the field doesn't look empty
magick shot.png -fill "#f8f8f8" -draw "rectangle …" -fill "#9ca3af" -pointsize 40 -font Courier -annotate +X+Y "•••••••••••" out.png
```

Gotchas:
- Angular/custom elements: text may live in `<ui-badge>`, `<ui-select>` etc. — `querySelectorAll('span, div')` misses them. When a selector finds nothing, dump leaf elements (`children.length === 0`) with tag names first.
- Verify the redaction visually by cropping the region and Reading it.

## Presentational state reconstruction

When the backend can't produce the state the docs need, you may DOM-patch the real page to the real state's exact strings/styles — copy the wording from a tenant that HAS the state, patch chip text + inline style + button label, screenshot. Genuine UI, not a mockup. Always tell the user which shots are reconstructions.

## Next.js dev image-cache trap (Next 16)

Replacing files in `public/` does NOT update rendered pages in dev:

- Optimizer cache lives at **`.next/dev/cache/images`** (NOT `.next/cache/images`).
- AVIF and WebP variants cache separately — `curl` (no Accept header) gets WebP and may look fresh while the browser's AVIF variant is stale.
- Order matters: **stop the dev server → `rm -rf .next/dev/cache/images` → start → capture.** Wiping while the server runs does nothing (in-memory entries get re-written).
