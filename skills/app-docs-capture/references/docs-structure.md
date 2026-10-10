# Versioned docs structure — routes, images, auto-index

Version EVERYTHING from day one — routes and image filenames — so adding a revision is purely additive (new files, new route), never a rename of what's published. Some apps need two live versions at once.

## Route convention

```
/<docsBase>/<docGroup>/v<N>/<docName>
```

- `<docsBase>` is app-specific ("napoveda", "docs", "help").
- `<docGroup>` clusters related guides (e.g. "chytre-zamky", "platby").
- `v<N>` is a plain integer version segment (v1, v2, …).
- `<docName>` is the guide slug.

**Group index** at `/<docsBase>/<docGroup>` is auto-generated FROM THE DOCS DATA (the typed array/registry defining the guides — `docGroup`/`version`/`slug` per guide). Never hand-maintain the index's list; the page derives cards, newest version primary, older versions secondary links. Adding a guide entry = the index updates itself.

## Image convention

```
public/images/appdocs/<docGroup>/<docName>/v<N>.<imageName>.png        # raw capture
public/images/appdocs/<docGroup>/<docName>/v<N>.<imageName>.min.webp   # published, q90
```

- Pages reference ONLY `.min.webp`. Raw sits alongside as the archival original (⚠️ it ships with the deploy — if the repo forbids that, run the utility with `--no-raw` and keep raws in the gitignored scratch dir).
- `<imageName>` is kebab-case, no dots.
- A new docs version duplicates still-valid images under the new prefix (`bump`), then replaces only what changed — the old version's files are never touched.

## The structure utility (never hand-place files)

Copy `scripts/appdocs-images.mjs` from this skill into the target repo's `scripts/` on first use. Zero-dep Node; uses `magick` (or `cwebp`) for the WebP q90 encode.

```sh
node scripts/appdocs-images.mjs add  <group>/<doc> -v 1 -n payments-start -f shot.png   # place raw + gen .min.webp
node scripts/appdocs-images.mjs add  … --force                                          # replace the image's whole set; explicit only
node scripts/appdocs-images.mjs add  … --no-raw                                         # WebP + .noraw marker, no raw
node scripts/appdocs-images.mjs bump <group>/<doc> --from 1 --to 2 [name…]              # start v2 from v1 images
node scripts/appdocs-images.mjs list [group[/doc]]                                      # inventory by version
node scripts/appdocs-images.mjs check                                                   # naming + raw/min pairing
node scripts/appdocs-images.mjs prune                                                   # drop empty dirs
```

Rules the utility enforces (don't work around them):
- name regex `v<int>.<kebab-name>(.min).<ext>` — anything else fails `check`;
- no silent overrides — an existing WebP, raw or marker for that version/name requires `--force`, which replaces the whole set: `--no-raw` removes every published raw, a raw removes the `.noraw` marker;
- `add` is all-or-nothing — it encodes in a staging dir and publishes only the complete set, so a failed add (no encoder, failed encode) changes nothing and rerunning it is the recovery;
- every `.min.webp` has exactly one of its raw sibling or a `.noraw` marker (`--no-raw` writes the marker) — `check` fails on neither and on both;
- empty directories are noise — `prune` removes them.
