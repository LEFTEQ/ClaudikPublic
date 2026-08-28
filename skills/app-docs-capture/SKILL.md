---
name: app-docs-capture
disable-model-invocation: true
description: "Capture redacted, versioned, annotation-ready app screenshots and wire them into docs pages."
---

# app-docs-capture — screenshots for client docs

Deliverable: screenshots safe to publish, pixel-stable, versioned, annotated in CODE (overlay coordinates), never in pixels. Work in phases; open the reference for the phase you're in.

## Laws (all phases)

- **Sandbox/demo tenant first.** Never capture a real client's tenant if a demo exists; if you must, get explicit approval and redact everything personal.
- **Fixed viewport** (default 1440×900) for every shot in a set — annotation coordinates and visual consistency depend on it.
- **Annotations live in code**: store the element's CSS-px rect next to the screenshot reference; render rings/badges as HTML overlays converted to %. Never draw into the image.
- **Redact before anything ships**: personal emails, names, addresses, phone numbers, API keys/tokens. Company-owned public info (brand email) may stay.
- **Verify every shot by Reading the image** after capture — right screen, right state, nothing sensitive. Non-delegable.
- Capture scripts live in the repo (gitignored scratch dir, e.g. `.vitrinka/scratch/`), not /tmp — node module resolution needs the repo root.

## Asset format & structure (non-negotiable defaults)

- Published variant: **WebP quality 90** with the `.min.` suffix. Raw full-res PNG sits next to it, same name without `.min.`.
- Filenames carry the docs version from day one: `v<N>.<imageName>[.min].<ext>` under `public/images/appdocs/<docGroup>/<docName>/`.
- All placement, conflict handling, version bumps, pruning and integrity checks go through the structure utility — copy `scripts/appdocs-images.mjs` from this skill into the target repo (`scripts/`); never hand-place files. Full convention: `references/docs-structure.md`.
- ⚠️ Raw files in `public/` ship with the deploy. If the repo forbids that (size budgets, "webp-only" tests), pass `--no-raw` and keep raws in the gitignored scratch dir — flag the choice to the user.

## Phases

1. **Plan** — list the states to capture (one coherent state per shot), flow order, which elements each doc step highlights, and the target `<docGroup>/<version>/<docName>` route.
2. **Capture + redact** → `references/capture-redaction.md`. Lazy-image forcing, cookie-banner dismissal, DOM-replacement and pixel-patch redaction, presentational state reconstruction, the Next.js dev image-cache trap.
3. **Measure + annotate** → `references/overlay-annotations.md`. Measure `getBoundingClientRect()` in the same session that shot the screen; wire the overlay component; verify ring alignment on the rendered page.
4. **Vendor/third-party UIs behind login** → `references/vendor-login-cdp.md`. Google-SSO blocks automated sign-in; use the real-browser CDP ladder.
5. **Place + wire** — run the structure utility to place raws + generate `.min.webp`, hook images into the docs pages, keep the group index auto-generated from the docs data (`references/docs-structure.md`).
6. **Verify** — screenshot the RENDERED pages to confirm alignment and freshness (beware optimizer caches), run the repo's checks.

## Capturing progress to vitrinka

Per-shot adoption into a vitrinka set uses `vitrinka snap` — cheat sheet in `references/snap-cli.md`. Board/set publishing of finished pages is vitrinka's job (`/vitrinka:publish`), not this skill's — hand over once pages render correctly.
