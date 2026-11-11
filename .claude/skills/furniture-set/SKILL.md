---
name: furniture-set
description: Add a new furniture set to Leet Creatures player housing in one session, with no second art pass. Takes a theme from the compendium, scaffolds the set with `pnpm housing new-set`, gives it a palette, form variants and part hooks until at least three pieces have an outline no other set has, draws the wallpaper, floor and keepsake, renders the room sheet (day and night) and fixes what its report flags, runs an art-director pass against review-brief.md, writes every line, and finishes with the checks. Use when asked to make a new housing set (Fairground, Schoolhouse, or any other).
---

# Furniture set

A set is a **style** (palette, a ramp per material, a few choices) applied to nine forms (bed, cupboard, table, shelf, stool, lamp, rug, frame, curtains), plus a hand-drawn wallpaper, floor and keepsake, and its words. The workshop is described in `docs/design/housing-workshop.md`; read it once. The worked example is **Quiet Verge** (`apps/activity/src/sprites/workshop/styles/quiet-verge.ts`, `apps/activity/src/sprites/data/house/quiet-verge.ts`): copy its patterns. It took about 40 minutes of work from `new-set` to green checks.

Run every command from the worktree root. Use your own log names (`/tmp/<set>-check.log`). Commit after each step that works.

## 1. Theme

- Read `docs/compendium/README.md` (tone, naming rules), then the page of the set's place, faction or event (`places.md`, `games.md`, `world.md` ...) and `docs/compendium/housing.md` (the other sets' lines: match their length and tone).
- Check `docs/art/README.md` for art of that place (a banner, a concept) and open its PNG and source (`apps/activity/src/sprites/concepts/*.ts`). Take the palette from it: the set should look like the place players already know.
- Write down: mood in three words; **three motifs** (one becomes `motif`, the others go into the silhouettes); the materials (what the furniture is made of); the one accent colour that means "this set".
- Pick a palette that does not sit on an existing set: look at `pnpm housing sheet <other> --room` for the two nearest sets (Quiet Verge was checked against Moonlit and Stormglass, the other night and violet sets). The report's "too close" check only catches the same outline in the same paint; you still judge by eye.

## 2. Scaffold: `pnpm housing new-set`

```
pnpm housing new-set <id> --name "Name" --theme "one line: motif and palette" --from <style> \
  --tier 1|2 --element <tide|ember|grove|spark|mire|none> --primary <material>|family:<wood|stone|metal|cloth> \
  --accent <...> --moments trip,scout,raid --places id,id --bosses id,id
```

Always `--dry-run` first: it lists the files.

| Flag                    | Default                       | How to choose                                                                                                                                                                                                                                                                       |
| ----------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<id>`                  |                               | kebab-case, at most 23 characters (`<id>-curtains` must fit 32)                                                                                                                                                                                                                     |
| `--name`                | title of the id               | the player-facing set name                                                                                                                                                                                                                                                          |
| `--theme`               | a `TODO`                      | the "Motif and palette" line of the compendium Sets table, not shown to players                                                                                                                                                                                                     |
| `--from`                | `plain-pine`                  | the style to copy: the sample or shipped style nearest in shape (Quiet Verge copied `blackthorn`). You rewrite it anyway                                                                                                                                                            |
| `--tier`                | 1                             | 1 for a set of a common place; 2 for a late, rare or night place (Moonlit, Ancient, Lantern Night, Quiet Verge). Price comes from tier and materials (`housing/price.ts`)                                                                                                           |
| `--element`             | none                          | only the five shipped elements (`elements.json`); a place whose element is not shipped (Void) gets `none`                                                                                                                                                                           |
| `--primary`, `--accent` | `family:wood`, `family:stone` | a luxury material id (`packages/game/src/content/data/housing/materials.json`; the icon is `lux-<id>` in `resources.json`) when one fits, else a family. Do not invent a new material in this skill (it needs a resource, an icon and a glossary entry). Several sets may share one |
| `--moments`             | `trip,scout,raid`             | add `dungeon` for underground places, `games` for the Valley Games                                                                                                                                                                                                                  |
| `--places`, `--bosses`  | none                          | destination and boss ids (`destinations.json`, `bosses.json`). An unshipped place uses the shipped places that lead to it                                                                                                                                                           |

It writes `sets.json`, `pieces.json`, `skins.json`, the style, the pack, the concept wrapper, `workshop/sets.ts` and the compendium rows (marked `draft`/`TODO`), then runs the lock, the art library, the tests and a first sheet. Commit.

## 3. The style

Edit `apps/activity/src/sprites/workshop/styles/<id>.ts`.

- **Palette:** 12 to 16 keys plus `k` (`#0d0a1a`). A piece is linted at 16 colours: the shelf draws from every ramp, so share keys between ramps rather than adding more. Ramps: `wood` (the main body, whatever it is made of; give it `hi` and `deep`), `cloth` (blanket, drapes, seat), `linen` (sheets, pillow), `metal` (rims, knobs, rod), `glass` (window, cupboard glass, picture sky), `accent` (motif, inlay). The style palette may hold keys no ramp uses (the wallpaper's sky): the pack's `art()` keeps only the keys a sprite uses.
- **Variants:** `pnpm housing variants <id> --out <dir>` draws every value of every axis in your style. Pick one per form in `shapes`; choose `leg`, `foot`, `trim`, `top`, `motif`, `weave`, `lamp`, `lampMaterial`, `glow`, `rug`, `picture`, `shelf`.
- **Part hooks for identity.** Aim for **at least three pieces whose outline no other set has**. `parts: { <form>: { <part>: ({ c, style, at }) => ... } }` replaces one named part (names and areas: `FORMS[form].parts`, the form files in `workshop/forms/`; a shaped variant is drawn in `*-shapes.ts`, read the part's `at` there). Draw with `box`, `solid` + `inArch`/`inEllipse`/`shrink`, `motif`, `put` from `sprites/draw/`. Keep helpers (a chip, a star field) at the top of the style file. Quiet Verge hooks: bed `headboard` (two standing stones) and `legs` (floating chips), cupboard `doors` (an arch of window dark with the warm star), table `legs` (a top hovering over a pillar), shelf `brackets` (chips, no brackets), stool `legs` + `seat`, frame `frame` + `picture` (a dark moon), rug `rug` (a pool of stars), curtains `window` (the place at dusk).
- **Hand overrides** (`SOURCE.pieces` in the pack: `hand`, `layers`, `art`, `post`, each with a `why`) only when a hook cannot say it. A new set should need none; Quiet Verge has none.
- **Lights:** the lamp form is a light by default (`FORM_LIGHT`). Set `light` on a piece's art (`house-art.ts`) only for another piece that should light the room. A lamp whose shade is bright saturated yellow or orange keeps glowing at night (`toneOf` "flame" in `house-light.ts`).

Render after every change: `pnpm housing sheet <id> --out <dir>` (pieces at 1x and 4x) and look.

## 4. Wallpaper, floor, keepsake

Replace `placeholderHand` in `apps/activity/src/sprites/data/house/<id>.ts` with a `HAND` pack (see `quiet-verge.ts`): `skins['<id>-wall'].tile` 16x52, `skins['<id>-floor'].tile` 16x8, `keepsakes['<id>']` 12x12. Delete the `placeholder` import and the `TODO(artist)` header.

- Tiles have no ink outline and repeat sideways every 16 px: put stars, dots or seams so the join does not show. Rows 46 to 51 of the wall sit behind the floor pieces' feet (a skirting).
- **Contrast rule:** the furniture must read on the set's own wallpaper. The paper should be clearly darker or lighter than the `wood` ramp's mid (Quiet Verge: dusk sky `#262050`/`#352d68` behind lilac stone `#6f62b8`). The report measures it.
- The keepsake must read at icon size: one shape, one bright accent, an ink edge. Draw it with the library (Quiet Verge's is a 6-line function) or as rows.

## 5. Render and look

```
pnpm housing sheet <id> --room --night --out /tmp/<scratch>/sets/<id>/
pnpm housing sheet <id> --out /tmp/<scratch>/sets/<id>/
```

- Open `<id>-room.png`: three rooms at 1x, at phone scale (3x), at night lit by the lamps (`--night`, the lighting pass of `house-light.ts`; stars in the night window are not drawn), and the catalogue tiles. A red tile label is a flagged piece.
- The PNG viewer shrinks wide sheets: crop and enlarge what you check (a small PIL script in the scratchpad: `Image.crop(...).resize(..., Image.NEAREST)`; run it with `python3 -I`).
- The report (`<id>-report.txt`): **fix every flag or write down why it stays.** Low "inside contrast" means the piece is the paper's colour: change the paper first, then the ramp. "Lone specks" over 12% means dithering that vanishes on a phone. "Too close" means the same outline in the same paint as another set: change the variant or add a hook.

## 6. Art-director pass (`docs/design/review-brief.md`)

Write the answers in your report, one line each:

1. The nine belong together: one palette, one material language, the motif on most pieces.
2. At least three outlines are the set's own (name them); none is another set's in new paint.
3. Every piece reads at 1x and at phone scale on the set's own paper and floor, and at night.
4. Ramps run light top-left to dark bottom-right; every dark shape has a light edge or an ink line against a dark paper.
5. No noise: no lone specks, no dither that turns grey at 1x, two or three colours per part.
6. The motif is drawn the same way everywhere (same stencil, same accent).
7. The keepsake reads at 12x12.
8. Pixel style: hard edges, no soft glows (the lamp glow is the stepped ring).

## 7. Words

Fill every `TODO` from the compendium's tone (short, plain, concrete, one image; no em dashes; piece lines and hints at most 90 characters):

- `sets.json`: `line` (the set in a few words), `keepsake.name` (a thing, not "<Set> Keepsake") and `keepsake.line`.
- `pieces.json`: nine `line`s. Players may not know an unshipped place: do not name it in a line.
- `docs/compendium/housing.md`: the Sets row (replace `draft: ` with the theme), the Keepsakes row (the new keepsake name), the set's section (its line, then a short **Compendium detail, not shipped** paragraph), the nine piece rows. Add a short note to the place's own page (`places.md` ...) that the set exists.
- Update every sentence that counts the sets: the compendium's "N sets: the starter set and N-1 to collect", `docs/design/housing.md` (section 1 "Sets.", the section 2.5 Sets table gets a row).

## 8. Checks

1. Add the id to `SHIPPED_SET_IDS` in `apps/activity/src/sprites/workshop/new-set.ts` (and to the id list of the "never touches a shipped set" test in `new-set.test.ts`). After that, `new-set` and `remove-set` refuse it: do this last.
2. `pnpm housing lock` after the art is final (only your set's rows may change: `git diff apps/activity/src/sprites/workshop/shipped-art.json`), and `pnpm art library`.
3. `pnpm housing check` (lock, art catalogue, every set's tests; about 20 s).
4. `pnpm format:check`.
5. `pnpm check:changed > /tmp/<id>-check.log 2>&1; echo "exit $?" >> /tmp/<id>-check.log` as a **background** job (about 12 minutes; a foreground call times out). Wait on the log.
6. `pnpm fixtures:capture --check`. If content growth changes a fixture, run `pnpm fixtures:capture` and say which and why; never hand-edit.

## 9. Report

- Branch and commits.
- The sheets: `<id>.png` (pieces 1x and 4x) and `<id>-room.png` (day, phone, night, tiles), by absolute path.
- The report output, with a reason for every flag left.
- Per piece: generated, generated with a part hook (which parts), or a hand override (with its `why`).
- The art-director checklist answers; the tier, materials and sources you picked and why.
- What in the workshop was awkward (and fix it in this skill).

## Common mistakes

- **Editing a style with a scripted cut and paste** lost Quiet Verge's `shapes` and `parts` blocks once. Use the Edit tool on a unique string, or re-read the file after a script.
- **Only the style palette, not the sprite, defines keys:** a hook that uses a key the style palette lacks throws in `toSprite`. Add the key to the palette.
- **The placeholder wallpaper is the wood ramp,** so every first report flags contrast. Draw the paper before tuning the pieces.
- **A `box` 3 pixels wide or tall is all ink.** Small floating bits need 5x3 or more to show a colour.
- **A part hook replaces the part in every variant,** and some variants draw extra parts after it (the drum stool's seat ellipse covered the hooked body): hook the seat too, or pick a variant that draws less.
- **Ceiling lamps hang from row 0,** floor pieces stand on their last row; a hovering piece still needs something (a chip) on its last row.
- **The window glass is the `glass` ramp,** which is also the cupboard glass and the frame's sky: a dark glass makes the curtains vanish on a dark paper. Quiet Verge hooks the curtains' `window` and paints the place at dusk.
- **Shell or chained commands** (`cd x && a | b`) are refused in an isolated worktree: run plain commands with absolute paths, put scripts in the scratchpad and run them with `python3 -I`.
- **`SHIPPED_SET_IDS` too early:** once the id is in it, `new-set` cannot be re-run to add a missing file.

## Rules

- Never edit a shipped set's art for your set; the lock test catches it.
- No new dependencies, no migrations, no `Math.random` (nothing in the library is random).
- Keep this skill current: when a step proves wrong or the workshop gains a tool, edit this file in the same branch.
