# Overlay annotations — measure in px, render in %

Annotations are highlight rings + numbered badges rendered as absolutely positioned HTML over the `<Image>`, never drawn into pixels. Coordinates live in the docs data next to the screenshot reference.

## Measuring

Measure in the SAME browser session that shot the screen, at the exact scroll state of the shot — eyeballing drifts 20px:

```js
const r = el.getBoundingClientRect();       // CSS px in the 1440×900 viewport
// {x, y, w: r.width, h: r.height} → store rounded
```

- Batch-measure everything the doc will highlight while the state exists — states are expensive to reproduce.
- The same dialog with shorter text sits higher — re-measure per variant, don't reuse a sibling dialog's rects.
- Unreproducible shots: estimate from the image (Read it, use the displayed→original scale factor), then verify on the rendered page and nudge.

## Data model

```ts
export const SCREENSHOT_W = 1440;
export const SCREENSHOT_H = 900;
interface Annotation { x: number; y: number; w: number; h: number; badge?: number }
interface Screenshot { src: string; alt: string; caption?: string; annotations?: Annotation[] }
```

## Render pattern (framework-agnostic core)

```tsx
<div className="relative">
  <Image src={s.src} width={SCREENSHOT_W} height={SCREENSHOT_H} … />
  {s.annotations?.map((a) => (
    <div aria-hidden className="absolute rounded-lg border-2 border-cyan-400 pointer-events-none"
      style={{
        left:   `${((a.x - 6) / SCREENSHOT_W) * 100}%`,
        top:    `${((a.y - 6) / SCREENSHOT_H) * 100}%`,
        width:  `${((a.w + 12) / SCREENSHOT_W) * 100}%`,
        height: `${((a.h + 12) / SCREENSHOT_H) * 100}%`,
      }}>
      {a.badge && <span className="absolute -top-3 -left-3 …">{a.badge}</span>}
    </div>
  ))}
</div>
```

- The −6/+12 padding makes the ring breathe around the element.
- Full-page screenshots (non-1440×900 aspect) need their own W/H pair — the % math only works against the actual image dimensions.

## Verification (mandatory)

Screenshot the RENDERED docs page (scroll each annotated figure into view) and Read it — confirm every ring sits on its element. Lazy loading defeats naive full-page shots; use the eager+scroll routine from capture-redaction.md.
