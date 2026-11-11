# The furniture workshop: drawing a set from a style

Status: 2026-11-11, work packages A1, A2 and A4 of [`housing-next.md`](housing-next.md), plus the form variants. The next packages (A3 `pnpm housing new-set`, A5 the skill) build on the API below. Decision: `2026-11-11-furniture-workshop-sets-are-styles-drawn` in `decisions/platform.md`.

**The idea.** A furniture set is a **style** (a palette, a ramp per material and a handful of choices) applied to nine **forms** (bed, cupboard, table, shelf, stool, lamp, rug, frame, curtains). A form is a short recipe of named parts drawn with a small **drawing library**. Where a set needs something a form does not draw, the set **overrides** that piece (or one of its layers) and says why.

## Where things are

| What                                                                                    | Where                                                                                                     |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| The drawing library: canvas, shapes, furniture parts                                    | `apps/activity/src/sprites/draw/` (`canvas.ts`, `shapes.ts`, `parts.ts`)                                  |
| The forms, one file per kind (`small.ts`: stool, lamp, rug; `wall.ts`: frame, curtains) | `apps/activity/src/sprites/workshop/forms/`                                                               |
| `Style`, `SET_FORMS`, `styleProblems`                                                   | `apps/activity/src/sprites/workshop/style.ts`                                                             |
| `setPack`, `makePiece`, `generatePiece`, overrides                                      | `apps/activity/src/sprites/workshop/pack.ts`                                                              |
| The shipped sets' styles                                                                | `apps/activity/src/sprites/workshop/styles/<set>.ts`                                                      |
| Each shipped set's pack: hand pixels, overrides, `setPack`                              | `apps/activity/src/sprites/data/house/<set>.ts` (exports `SOURCE` and `HOUSE_ART`)                        |
| The list of shipped sets and sample styles                                              | `apps/activity/src/sprites/workshop/sets.ts`                                                              |
| Sample styles (not content; nothing in the game imports them)                           | `apps/activity/src/sprites/workshop/sample/` (Plain Pine, Blackthorn, Sugarplum)                          |
| The form variants: per form, the axes and their values                                  | `apps/activity/src/sprites/workshop/variants.ts`; drawn by `forms/*-shapes.ts`                            |
| The room sheet's layout and the review report (pure, tested)                            | `apps/activity/src/sprites/workshop/room.ts`, `report.ts`                                                 |
| The shipped-art lock                                                                    | `apps/activity/src/sprites/workshop/shipped-art.json`                                                     |
| The command                                                                             | `pnpm housing` (`apps/activity/scripts/housing.mts`; the room and variant sheets in `housing-review.mts`) |

The library sits next to `sprite-data.ts` and `sprite-lint.ts` because it is sprite tooling like them: pure, tested with Vitest, and imported by the art scripts under Node's type stripping (so no enums, no parameter properties, and imports of a folder name its `index`). The game reads the result through the usual `house-art.ts` glob; the library ships only in the housing chunk, loaded on demand.

## The drawing library

A `Canvas` is a grid of palette keys (`.` transparent), drawn on in place and turned into a `SpriteDef` with `toSprite(c, palette)`, which keeps only the keys used and throws on a key the palette lacks. Nothing is random. Light comes from the top left: a shaded shape is light on top and left, dark on the right and bottom, inside an ink (`k`) edge.

- **Canvas** (`canvas.ts`): `canvas`, `fromRows`, `get`, `put` (clipped), `under` (draws only on transparent), `blit`, `flipX`, `mirrorLeft`, `recolour`, `rowsOf`, `toSprite`.
- **Shapes** (`shapes.ts`): `fill`, `hline`, `vline`, `line`, `rect`; `box(c, x, y, w, h, ramp, { ink, round, shade: 'tl' | 'rows' | 'cols' | 'flat', edge })`, the workhorse; `ellipse` and `ellipsePixels` (fill or ring); `dither` and `ditherAt` (checker, sparse, rows, cols, diagonal, in canvas coordinates so dithers line up); `tile` (a repeating pattern from an offset); `outline` (the ink pass round what is drawn); `shadeRuns` (shade runs of one key by a ramp). A `Ramp` is `{ hi?, light, mid, dark, deep? }` of palette keys.
- **Solids** (`solid.ts`): `solid(c, area, shape, ramp)` draws any outline given as a pixel test like `box` draws a rectangle (ink on its outer pixels, light top and left, dark right and bottom); `inRect`, `inEllipse`, `inArch` (straight sides, a round top), `inPoint` (a gothic point), `union`, `minus`, `shrink`; `recess` sinks a field that follows a shape (a door panel in an arch).
- **Parts** (`parts.ts`): `leg` (straight, turned, tapered, splayed; a tapered leg narrows to the middle, a splayed one leans out), `foot` (none, block, ball, paw), `panel` (a door or drawer with a recess, a field, a knob, an arched top), `trim` (plain, bead, rivets, zigzag, dentil, scallop, reed, rope, leaf) and `trimHeight`, `crest` (the silhouette above a top edge: square, rounded, scallop, arched, stepped, peaked, curl, spikes) and `crestHeight`, `cushion`, `pillow`, `mattress`, `blanket`, `pattern` (a cloth weave: plain, stripes, checks, dots, waves, diamonds, zigzag), `drape` (folds that hang straight, a smooth waist at the tie), `windowPane`, `shelfItem` (books, jar, plant, shell, candle, bottle, bowl, crystal, trophy, toy, tools, scroll, vase), `stencil` (a small drawing in digits: `0` to `3` the first ramp's hi to dark, `4` to `6` the second ramp's light to dark, `k` ink), `lamp` (dome, cone, lantern, bell, cage, and the lamps that are their own light: globe, paper lantern, chandelier, hanging bowl), `glow` (the two-ring halo, 20x10; a dithered one over the whole box; `stipple`, the two dotted rings of the hand-drawn candle lamps), `rug` (rounded, oval, square, fringe, pointed, capsule, runner, scalloped; a border of band, stripe, dots or none; the motif once in the middle or in a row), `motif` and `motifAt` (shell, crescent, rivet, leaf, bolt, opal, spiral, tassel, knot, star, heart, flower, diamond, fleur, drop), `picture` (sea, hills, moon, flame, storm, reeds, sun). `Materials` names the six ramps a part may use.

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

## Variants: a set's silhouette without hand pixels

The first pass showed that a style alone draws a coherent but plain set: every form had one outline, and the hand pieces carry each set's identity in theirs. So each form now has a small menu of **silhouette variants**, picked by the style's `shapes` (`variants.ts`). A form the style leaves out is drawn exactly as before; the first value of each list is that plain drawing.

| Form     | Axis (`Style.shapes.<form>`)  | Values                                                                                                          |
| -------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| bed      | `head`                        | panel, arched, pointed, posts, ladder, shell, canopy (posts at both ends and a cloth canopy behind the sleeper) |
|          | `foot`                        | board, low, none, post (the footboard's top follows the headboard's)                                            |
|          | `blanket`, `mark`             | band, sheet (the sheet turned over), quilt (patchwork), hem; `mark` puts the motif on it                        |
| cupboard | `top`                         | crest (the crown and the style's `top`), cornice, arched, domed, rounded                                        |
|          | `doors`                       | panel, glass, lattice, slatted, round (a window in each), single, drawers                                       |
|          | `base`, `bands`, `narrow`     | legs, plinth, bun; iron straps with rivets; a slim cabinet                                                      |
| table    | `kind`                        | four-leg, trestle (A-frames), pedestal, slab (two carved sides), log (roots)                                    |
|          | `skirt`                       | apron (the trim), swag (a cloth rope with a tassel), cloth (a tablecloth with a fringe), drawer, none           |
| shelf    | `bracket`, `board`            | wedge, scroll (iron), block, rope, chain, none; plank, thick, log                                               |
| stool    | `kind`, `mark`                | two-leg, three-leg, drum, pouf, stump, spool; the motif on the seat                                             |
| lamp     | the style's `lamp` and `glow` | dome, cone, lantern, bell, cage, globe, paper, chandelier, bowl; ring, dither, stipple                          |
| rug      | the style's `rug`             | `shape` (8), `border` (band, stripe, dots, none), `motifs` (none, centre, row)                                  |
| frame    | `kind`                        | picture, mirror (oval), round, crest (a shield with the motif), banner, clock                                   |
| curtains | `kind`                        | tied, straight, shutters, beads, cafe (a half curtain), bare                                                    |
|          | `pane`, `valance`             | cross, round, arched, grid, plain; band, scallop, none                                                          |

The set's motif is the thread through the pieces: the headboard, the cupboard doors, a slab table's sides, the rug's medallion, the stool's seat (`mark`), the shield and the banner. Every variant still draws through the form's named parts, so a style's part hook replaces one part of a variant too. `pnpm housing variants <style> [--form bed]` draws every value of every axis in a style, which is how to pick.

A test draws every value of every axis in every style (the samples and the eight shipped ones): each comes out at exactly its form box, its outer pixels at least 85% ink, no sprite-lint error, floor pieces on their bottom row and lamps from their top row. A second test keeps the three demo styles apart: each pair differs in outline (overlap under 0.85) on at least six of the nine forms. A style that puts many materials on one piece (the shelf's things draw from every ramp) must keep the piece under the lint's 16 colours: Blackthorn and Sugarplum share a few keys between ramps for that.

**The three demo styles** (`sample/`): Plain Pine (farmhouse: a ladder-back bed, a cornice cupboard, a trestle table, corbels, a milking stool), Blackthorn (wrought iron and wine velvet: a pointed bed, a narrow lattice cabinet under a gable, a pedestal table, scroll brackets, a spool stool, a chandelier in a dotted halo, a pointed rug with a fleur, a shield, straight drapes on an arched window) and Sugarplum (pastel and round: an arched bed with a quilt, an arched cupboard on bun feet, a pedestal table under a cloth, a rope shelf with toys, a pouf with a heart, a globe lamp, a capsule rug, an oval mirror, a café curtain on an arched window).

**The shipped sets after the variant pass.** Each shipped style now names the variants closest to its hand pieces (Tidepool's shell headboard, Moonlit's arched bed, swag and oval mirror, Emberhold's iron bands, Rootwood's log table, stump and round window, Ancient's slab table, Lantern Night's posts, lattice and paper lantern, the four hand-glow lamps' stipple halo). That changes only the `compare` sheet's generated column. Compared at 1x and 4x, the generated pieces now share each hand piece's outline, but no generated piece is pixel-identical or clearly as good: the hand pieces still carry details the variants do not draw (Moonlit's crescent doors, Rootwood's leaf curls and moss, Emberhold's anvil shelf, the hand lamps' irregular halos). So **no shipped piece switched**; every override and `shipped-art.json` are as they were.

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
  rug: {
    shape: RugShape;
    weave: ClothPattern;
    border?: RugBorder;
    motifs?: 'none' | 'centre' | 'row';
  };
  picture: PictureKind;
  shelf: ShelfItem[]; // left to right
  shapes?: FormShapes; // the silhouette variant per form (variants.ts); a form left out is drawn plain
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

- `pnpm housing variants <style> [--form id] [--out dir]`: every variant of every form drawn in the style (see Variants).
- `pnpm housing sheet <style or set> --room [--night] [--out dir]`: the room sheet and the report (below). `--night` adds the rooms at night at phone scale, every pixel through the lighting pass of `house-light.ts` (`shade`, `levelMap`, `windowPixel`) and lit by each room's lamp; the window's stars are not drawn.
- The step-by-step for a new set is the `furniture-set` skill (`.claude/skills/furniture-set/SKILL.md`).

## The room sheet and the report (A4)

`pnpm housing sheet <id> --room` draws the set **in rooms at real size**: three rooms of the `kitchen` kind side by side (one cell each: a window, a large and a small wall spot, a ceiling, a large floor spot, two small floor spots and a rug), with the bed, the table (and both stools) and the cupboard on the large spot of one room each and the curtains, shelf, frame, lamp and rug in every room. The pieces stand where the house scene puts them (`room.ts` repeats the scene's geometry because the scene loads the art through Vite's glob; a test keeps the numbers and the spot boxes equal to `house-scene.ts`). A shipped set stands on its own wallpaper and floor; a sample style, which has none, on the Cosy ones. A housemate sleeps in the bed and stands by the cupboard, for scale. The sheet shows the rooms at 1x, then at the phone's scale (3: the scale `RoomFocus` gives a one-cell room on a 390 px screen), then the catalogue tiles as the catalogue draws them (a 40 px tile, the largest scale up to 3 that fits, as `fitScale`). A tile's label is red when the report flags its piece.

**The report** (`report.ts`, printed and written to `<id>-report.txt` next to the PNG):

- **Too close to another set's piece.** Each piece is compared with the same form of every other shipped set and sample style: the outline overlap (pixels drawn in both over pixels drawn in either) and the colour distance (each colour to the other piece's nearest, by pixels, both ways, 0 to 1; ink left out). A pair is listed when the overlap is 0.85 or more and the colour distance 0.065 or less: the same outline in nearly the same paint. Calibrated on the shipped sets, where it lists only Fenkeeper's and Ancient's cupboards (two sandy carcasses of the same box).
- **Hard to read at 1x.** Fewer than 3 colours besides the ink; the inside's average colour against the wallpaper's (or, for the rug, the floor's) average under a contrast ratio of 1.25 (only the ink edge shows the piece); more than 12% of its pixels lone specks (a colour with no neighbour of the same colour: a detail that vanishes on a phone); or an outline filling under 22% of its box. These are prompts to look, not failures: on the shipped sets they flag mostly tone-on-tone pieces (Stormglass, Fenkeeper and Ancient furniture on their own same-coloured paper) and the dithered rugs.

The thresholds are `CLOSE` and `READABLE` in `report.ts`, one place each.

PNGs go to `apps/activity/scratch/housing/` unless `--out` says otherwise.

## The eight shipped sets after the first pass

Each shipped set has its style (`workshop/styles/`), and its pack draws through `setPack`. The pixels that ship are exactly the first pass's (checked by the lock and by a before-and-after dump of every pack). Side by side, the generated pieces are sound but plainer re-skins: the hand pieces carry each set's motif in their silhouette (Moonlit's oval mirror, Rootwood's round window and stump stool, Emberhold's anvil shelf), so every hand sprite stays an override for now, each with its reason in the pack file. The four ring-glow lamps (Tidepool, Moonlit, Emberhold, Rootwood) take their glow layer from the library, pixel-identical. The way to move a piece from hand to generated: improve the form or give the style a part hook, compare, and drop the override when the generated piece is at least as good at 1x and 4x.

## Adding a set: `pnpm housing new-set` (work package A3)

```
pnpm housing new-set <id> [--name "Quiet Verge"] [--theme "..."] [--from <style>] [--dry-run]
    [--element tide|none|...] [--tier 1|2] [--primary <material>|family:wood] [--accent ...]
    [--moments trip,scout,raid] [--places id,id] [--bosses id,id] [--no-checks]
pnpm housing remove-set <id> [--dry-run]     undoes new-set; refuses the shipped ids (`SHIPPED_SET_IDS`: Cosy, the first eight sets, and each finished new set)
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
