# The furniture workshop: drawing a set from a style

Status: 2026-11-11, work packages A1 and A2 of [`housing-next.md`](housing-next.md). The next packages (A3 `pnpm housing new-set`, A4 the review sheet in a room, A5 the skill) build on the API below. Decision: `2026-11-11-furniture-workshop-sets-are-styles-drawn` in `decisions/platform.md`.

**The idea.** A furniture set is a **style** (a palette, a ramp per material and a handful of choices) applied to nine **forms** (bed, cupboard, table, shelf, stool, lamp, rug, frame, curtains). A form is a short recipe of named parts drawn with a small **drawing library**. Where a set needs something a form does not draw, the set **overrides** that piece (or one of its layers) and says why.

## Where things are

| What                                                                                    | Where                                                                              |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| The drawing library: canvas, shapes, furniture parts                                    | `apps/activity/src/sprites/draw/` (`canvas.ts`, `shapes.ts`, `parts.ts`)           |
| The forms, one file per kind (`small.ts`: stool, lamp, rug; `wall.ts`: frame, curtains) | `apps/activity/src/sprites/workshop/forms/`                                        |
| `Style`, `SET_FORMS`, `styleProblems`                                                   | `apps/activity/src/sprites/workshop/style.ts`                                      |
| `setPack`, `makePiece`, `generatePiece`, overrides                                      | `apps/activity/src/sprites/workshop/pack.ts`                                       |
| The shipped sets' styles                                                                | `apps/activity/src/sprites/workshop/styles/<set>.ts`                               |
| Each shipped set's pack: hand pixels, overrides, `setPack`                              | `apps/activity/src/sprites/data/house/<set>.ts` (exports `SOURCE` and `HOUSE_ART`) |
| The list of shipped sets and sample styles                                              | `apps/activity/src/sprites/workshop/sets.ts`                                       |
| Sample styles (not content; nothing in the game imports them)                           | `apps/activity/src/sprites/workshop/sample/` (Plain Pine)                          |
| The shipped-art lock                                                                    | `apps/activity/src/sprites/workshop/shipped-art.json`                              |
| The command                                                                             | `pnpm housing` (`apps/activity/scripts/housing.mts`)                               |

The library sits next to `sprite-data.ts` and `sprite-lint.ts` because it is sprite tooling like them: pure, tested with Vitest, and imported by the art scripts under Node's type stripping (so no enums, no parameter properties, and imports of a folder name its `index`). The game reads the result through the usual `house-art.ts` glob; the library ships only in the housing chunk, loaded on demand.

## The drawing library

A `Canvas` is a grid of palette keys (`.` transparent), drawn on in place and turned into a `SpriteDef` with `toSprite(c, palette)`, which keeps only the keys used and throws on a key the palette lacks. Nothing is random. Light comes from the top left: a shaded shape is light on top and left, dark on the right and bottom, inside an ink (`k`) edge.

- **Canvas** (`canvas.ts`): `canvas`, `fromRows`, `get`, `put` (clipped), `under` (draws only on transparent), `blit`, `flipX`, `mirrorLeft`, `recolour`, `rowsOf`, `toSprite`.
- **Shapes** (`shapes.ts`): `fill`, `hline`, `vline`, `line`, `rect`; `box(c, x, y, w, h, ramp, { ink, round, shade: 'tl' | 'rows' | 'cols' | 'flat', edge })`, the workhorse; `ellipse` and `ellipsePixels` (fill or ring); `dither` and `ditherAt` (checker, sparse, rows, cols, diagonal, in canvas coordinates so dithers line up); `tile` (a repeating pattern from an offset); `outline` (the ink pass round what is drawn); `shadeRuns` (shade runs of one key by a ramp). A `Ramp` is `{ hi?, light, mid, dark, deep? }` of palette keys.
- **Parts** (`parts.ts`): `leg` (straight, turned, tapered, splayed; a tapered leg narrows to the middle, a splayed one leans out), `foot` (none, block, ball, paw), `panel` (a door or drawer with a recess, a field, a knob, an arched top), `trim` (plain, bead, rivets, zigzag, dentil, scallop, reed, rope, leaf) and `trimHeight`, `crest` (the silhouette above a top edge: square, rounded, scallop, arched, stepped, peaked, curl, spikes) and `crestHeight`, `cushion`, `pillow`, `mattress`, `blanket`, `pattern` (a cloth weave: plain, stripes, checks, dots, waves, diamonds, zigzag), `drape` (folds that hang straight, a smooth waist at the tie), `windowPane`, `shelfItem` (books, jar, plant, shell, candle, bottle, bowl, crystal), `stencil` (a small drawing in digits: `0` to `3` the first ramp's hi to dark, `4` to `6` the second ramp's light to dark, `k` ink), `lamp` (dome, cone, lantern, bell, cage), `glow` (the two-ring halo, 20x10, or a dithered one over the whole box), `rug` (rounded, oval, square, fringe), `motif` and `motifAt` (shell, crescent, rivet, leaf, bolt, opal, spiral, tassel, knot, star), `picture` (sea, hills, moon, flame, storm, reeds, sun). `Materials` names the six ramps a part may use.

## Forms and their named parts

Every form draws at exactly its box of `packages/game/src/content/data/housing/forms.json` (a test keeps them equal) and stands on its bottom row, except the lamp, which hangs from its top row. Parts are drawn back to front in this order; `FORMS[form].note` says where each sits.

| Form     | Box   | Parts (draw order)                                          | Layers                                               |
| -------- | ----- | ----------------------------------------------------------- | ---------------------------------------------------- |
| bed      | 48x26 | legs, headboard, footboard, rail, mattress, pillow, blanket | `front` is the blanket; `sleep` is `{ x: 10, y: 0 }` |
| cupboard | 30x36 | feet, carcass, doors, drawer, plinth, crown                 |                                                      |
| table    | 44x18 | legs, stretcher, apron, top                                 |                                                      |
| shelf    | 40x20 | brackets, board, things                                     |                                                      |
| stool    | 16x12 | legs, frame, seat                                           |                                                      |
| lamp     | 20x16 | lamp, glow                                                  | `glow`: 20x10 for `ring`, 20x16 for `dither`         |
| rug      | 56x10 | rug                                                         |                                                      |
| frame    | 24x16 | frame, picture                                              |                                                      |
| curtains | 36x26 | window, sill, drapes, valance, rod                          |                                                      |

The outdoor forms and the Cosy pieces are not forms yet; they stay hand-drawn packs.

## The style

```ts
interface Style extends Materials {
  id: string; // the set id; pieces are `<id>-<form>`
  name: string;
  palette: Record<string, string>; // keys to #rrggbb; `k` is the ink #0d0a1a
  // Materials: wood, cloth, linen, metal, glass, accent: each a Ramp of palette keys
  leg: LegKind;
  foot: FootKind;
  trim: TrimKind; // under table tops, along the cupboard crown, the valance
  top: CrestKind; // the silhouette of headboard, cupboard, frame, rod
  motif: MotifKind; // on doors, headboard, footboard, the frame's picture
  weave: ClothPattern; // blanket, seat
  lamp: ShadeKind;
  lampMaterial: 'wood' | 'cloth' | 'linen' | 'metal';
  glow: { kind: 'ring' | 'dither'; inner: string; outer: string }; // also the lamp's own light
  rug: { shape: RugShape; weave: ClothPattern };
  picture: PictureKind;
  shelf: ShelfItem[]; // left to right
  parts?: { [form]?: { [part]?: (ctx: { c; style; at }) => void } }; // the set's own drawing of a named part
}
```

`styleProblems(style)` lists what is wrong (a ramp key not in the palette, a bad colour, a wrong ink, an empty shelf); `setPack` refuses a style with problems. A part hook gets the canvas, the style and the area the form gives the part (`at`), and replaces the form's drawing of that part only.

## Overrides

A set's pack file passes a `SetSource` to `setPack`:

```ts
export const SOURCE: SetSource = {
  style: TIDEPOOL,
  hand: HAND, // the hand-drawn pack: pieces by id, plus the skins and keepsake, which pass through
  pieces: {
    bed: { use: 'hand', why: 'shell-scalloped headboard and footboard; ...' },
    lamp: {
      use: 'layers',
      layers: ['sprite'],
      why: 'the shade is hand-drawn; the glow is generated',
    },
  },
};
export const HOUSE_ART: HouseArtPack = setPack(SOURCE);
```

A form not in `pieces` is generated from the style. An override is one of:

- `{ use: 'hand', why }`: the hand piece `<set>-<form>` from `hand`, whole.
- `{ use: 'layers', layers: ['sprite' | 'front' | 'glow' | 'sleep'], why }`: those layers by hand, the rest generated.
- `{ use: 'art', art, why }`: a piece given right there.
- `{ use: 'post', post: (art, style) => art, why }`: the generated piece, changed (a pixel moved, a detail added).

Every override has a reason (a test checks). A new set made from a style alone has no `hand` and no `pieces`.

## Render, compare, lock

- `pnpm housing sheet <style> [--out dir]`: a style's nine generated pieces at 1x and 4x (a sample style or a shipped one).
- `pnpm housing compare [--set id,id] [--out dir]`: per shipped set, each piece shipped, generated and the difference (red), at 4x, then at 1x shipped, generated and what ships now; prints how each piece is made and the pixels that differ per layer.
- `pnpm housing lock [--check]`: writes or checks `shipped-art.json`, a hash of what every shipped piece looks like (colours, not key names). The Vitest suite checks it too, so a library change that changes shipped art fails until someone has looked at `compare` and run `lock`. That is the rule that keeps a shipped set from getting worse by accident.

PNGs go to `apps/activity/scratch/housing/` unless `--out` says otherwise.

## The eight shipped sets after the first pass

Each shipped set has its style (`workshop/styles/`), and its pack draws through `setPack`. The pixels that ship are exactly the first pass's (checked by the lock and by a before-and-after dump of every pack). Side by side, the generated pieces are sound but plainer re-skins: the hand pieces carry each set's motif in their silhouette (Moonlit's oval mirror, Rootwood's round window and stump stool, Emberhold's anvil shelf), so every hand sprite stays an override for now, each with its reason in the pack file. The four ring-glow lamps (Tidepool, Moonlit, Emberhold, Rootwood) take their glow layer from the library, pixel-identical. The way to move a piece from hand to generated: improve the form or give the style a part hook, compare, and drop the override when the generated piece is at least as good at 1x and 4x.

## Adding a set: `pnpm housing new-set` (work package A3)

```
pnpm housing new-set <id> [--name "Quiet Verge"] [--theme "..."] [--from <style>] [--dry-run]
    [--element tide|none|...] [--tier 1|2] [--primary <material>|family:wood] [--accent ...]
    [--moments trip,scout,raid] [--places id,id] [--bosses id,id] [--no-checks]
pnpm housing remove-set <id> [--dry-run]     undoes new-set; refuses the nine shipped ids (Cosy and the eight sets)
pnpm housing check                           the lock, the art catalogue and every set's tests in one go
```

`new-set` does everything a set needs in one run and can be re-run (it adds only what is missing; `--dry-run` lists the files it would create or change). The plans are pure (`apps/activity/src/sprites/workshop/new-set.ts`, tested in memory against the real files); `apps/activity/scripts/housing-new-set.mts` writes the files, runs prettier on them, then runs `housing lock`, `art library`, the cross-check tests and `housing sheet <id>`, and prints what is left.

**Defaults** (the plainest set that validates): tier 1, no element, primary material "any wood", accent "any stone" (so no new luxury material), any place and boss, from trips, scouts and raids; the style is a copy of Plain Pine (`--from tidepool` copies a shipped one). Prices need nothing per piece: they come from the form's size, the set's tier and its materials (`housing/price.ts`), and drops from the set's `sources`.

**The files a set touches**

| File                                                               | By                                                                                              |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `packages/game/src/content/data/housing/sets.json`                 | `new-set`: the set and its keepsake                                                             |
| `packages/game/src/content/data/housing/pieces.json`               | `new-set`: nine pieces, `<id>-<form>`, after the last set's                                     |
| `packages/game/src/content/data/housing/skins.json`                | `new-set`: `<id>-wall` and `<id>-floor`                                                         |
| `apps/activity/src/sprites/workshop/styles/<id>.ts`                | `new-set`: the style, with `TODO(artist)` notes                                                 |
| `apps/activity/src/sprites/data/house/<id>.ts`                     | `new-set`: `setPack` with no overrides, and placeholder wallpaper, floor and keepsake           |
| `apps/activity/src/sprites/concepts/house-<id>.ts`                 | `new-set`: the art library's wrapper (three lines, `workshop/set-concept.ts` does the work)     |
| `apps/activity/src/sprites/workshop/sets.ts`                       | `new-set`: an import and an entry in `SHIPPED_SETS` (the lock and `housing sheet <id>` read it) |
| `apps/activity/src/sprites/workshop/shipped-art.json`, `docs/art/` | generated (`housing lock`, `art library`)                                                       |
| `docs/compendium/housing.md`                                       | `new-set`: the set, keepsake, nine piece and two skin rows, marked draft                        |

Nothing else names a set: piece and skin names come from the content (`house-text.ts`), and the glossary has no per-set entry. Wallpaper and floor art lives in the set's own pack file, not in `rooms.ts` (that holds the room kinds' defaults).

**Left to the people.** `new-set` writes every text as `TODO: ...` (the set's line, keepsake line, nine piece lines; the theme unless `--theme` is given) and the style as a copy, so the artist edits the style (palette, variants, motif), re-runs `pnpm housing sheet <id>`, draws the wallpaper, floor and keepsake, and the writer fills the lines from the compendium. The command prints that list. `pnpm housing lock` and `pnpm art library` follow every art change.

**What checks a set.** `sets-agree.test.ts` (new) holds each content set to its style, pack, concept wrapper, workshop entry, lock rows and form boxes; the content tests (`housing-content.test.ts`) hold its pieces, skins, keepsake and compendium names; `house-content-art.test.ts` its art; `workshop.test.ts` the lock. The tests that counted the nine sets (114 pieces, 47 skins, 212 catalogue things) now count the nine plus whatever `new-set` added.
