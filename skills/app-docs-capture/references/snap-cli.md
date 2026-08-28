# vitrinka snap — quick reference (per-shot adoption)

Full doctrine: vitrinka publish skill. Setup once per repo/session:

```sh
mkdir -p .vitrinka/screenshots && touch .vitrinka/screenshots/.active
vitrinka remote-init --root .vitrinka/screenshots
vitrinka meta --root .vitrinka/screenshots \
  --kicker "WEB · DOCS" --title "<display title>" --accent "<tail>" \
  --intro "<1–2 sentences>" --chip "Persona=<who>" --chip "Motiv=<light|dark>"
```

Adopt an already-captured file (docs-capture always captures first, then adopts with `--file`):

```sh
vitrinka snap web --file <path.png> \
  --route "/route" --label "STAGE" --title "Short state title" \
  --note "1–2 lines: what & why" \
  --action "What you do here to reach the NEXT shot" \
  --src <implementing-file> [--src <key-component>] \
  --state "tenant · theme · notable app state"
```

- `--label`: 1–2 uppercase words; same label across passes = same logical screen (title the pass, e.g. "… (pass 2)").
- `--src` is the highest-value field — repo-relative implementing files.
- After every snap: **Read the image to verify** (non-delegable).
- Notes with Czech quotes/apostrophes break zsh heredocs — use single-quoted ASCII-ish notes or write the command into a script file.
- Publish/structure passes belong to the vitrinka-publisher agent; the idempotent `board-from-set` re-import **resurrects previously deleted shots** — prefer card-level swaps over re-imports on curated boards.
