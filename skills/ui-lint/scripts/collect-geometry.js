// collect-geometry.js — browser-side snippet for ui-lint's DOM path.
//
// NOT a Node script. Paste the arrow function below as the `function` argument of
// mcp__playwright__browser_evaluate (or chrome-devtools evaluate_script). It returns
// a compact JSON STRING — Write it verbatim to `.ui-lint/<slug>/manifest.json`,
// then feed that file to lint.ts. Schema: see skills/ui-lint/SKILL.md.
//
// Filters to "layout-significant" elements (media, controls, text nodes, painted
// boxes, flex/grid containers) and caps at 900 so the payload stays small.
// Rects are CSS px (multiply by dpr for device px — overlay.mjs does this).

() => {
  const MAX = 900;
  const els = [];
  const idOf = new Map();
  const KEEP_STYLES = [
    "display", "position", "gap", "rowGap", "columnGap",
    "paddingLeft", "paddingTop", "marginLeft", "marginTop",
    "overflowX", "overflowY", "transform", "borderRadius",
    "fontSize", "gridTemplateColumns", "flexDirection",
  ];
  const DEFAULTS = new Set(["none", "normal", "0px", "auto", "visible", "static", ""]);
  const r1 = (v) => Math.round(v * 10) / 10;

  for (const el of document.body.querySelectorAll("*")) {
    if (els.length >= MAX) break;
    const tag = el.tagName.toLowerCase();
    if (/^(script|style|link|meta|noscript|template)$/.test(tag)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight * 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;

    const bg = cs.backgroundColor;
    const hasBg = bg && bg !== "transparent" && !bg.startsWith("rgba(0, 0, 0, 0)");
    const hasBorder = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0;
    const hasShadow = cs.boxShadow && cs.boxShadow !== "none";
    const isMedia = /^(img|svg|video|canvas|picture|iframe)$/.test(tag);
    const isControl = /^(button|input|select|textarea|a|label)$/.test(tag);
    const isContainer = /(flex|grid)/.test(cs.display);
    const hasOwnText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!(isMedia || isControl || hasBg || hasBorder || hasShadow || isContainer || hasOwnText)) continue;

    const styles = {};
    for (const k of KEEP_STYLES) {
      const v = cs[k];
      if (v && !DEFAULTS.has(v)) styles[k] = v;
    }
    // Content wider than its box + clipping overflow = truncation candidate.
    const clipped =
      el.scrollWidth - el.clientWidth > 2 &&
      /(hidden|clip|auto|scroll)/.test(cs.overflowX + " " + cs.textOverflow);

    let p = el.parentElement;
    while (p && !idOf.has(p)) p = p.parentElement;

    const id = els.length;
    idOf.set(el, id);
    els.push({
      id,
      parent: p ? idOf.get(p) : null,
      tag,
      classes: (typeof el.className === "string" ? el.className : "").trim().slice(0, 100) || undefined,
      text: hasOwnText ? (el.textContent || "").trim().slice(0, 40) : undefined,
      rect: { x: r1(r.x), y: r1(r.y), width: r1(r.width), height: r1(r.height) },
      styles: Object.keys(styles).length ? styles : undefined,
      clipped: clipped || undefined,
    });
  }

  return JSON.stringify({
    source: "dom",
    url: location.href,
    viewport: { width: innerWidth, height: innerHeight },
    dpr: devicePixelRatio,
    pageHScroll: document.scrollingElement.scrollWidth > innerWidth + 1,
    elements: els,
  });
}
