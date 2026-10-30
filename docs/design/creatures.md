# Creatures: lore, visual briefs, traits and quirks

Status: **built 2026-10-11** (Misa's request: every species gets a short description and a visual identity, behavioural traits, and each creature a personality quirk). Builds on `m2-collection.md` (the roster) and `creature-abilities.md`.

The point is to **keep things consistent as the game evolves**: anyone who writes about, draws or animates a creature starts from the same source. **The data files are the source of truth**; this page explains them. If this page and a data file disagree, the file wins.

## Files

All in `packages/game/src/content/data/`, schema-validated at load (`packages/game/src/content/lore.ts`):

| File                | What it holds                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `species-lore.json` | One entry per species (all 22, including the Festival species): description, visual brief and traits. |
| `bosses-lore.json`  | One entry per boss: description and visual brief.                                                     |
| `quirks.json`       | The general quirk pool and the "against type" quirks per evolution line.                              |

In code: `lore` (the validated data), `pickQuirk(speciesId, rng)` and `quirkText(id)`, all exported from `@creatures/game`. The Activity and the Worker both read them from there; the server never sends lore text.

## Species entry

```
"splashet": {
  "description": "...",
  "appearance": { "silhouette", "size", "palette", "features", "pose", "always", "never", ("fromStage1") },
  "traits": ["...", "..."]
}
```

| Field         | Rule                                                                                                                   | Shown to players? |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `description` | 1 to 2 sentences, at most 220 characters, player-facing voice. Must agree with the species' element, role and ability. | Yes ("About")     |
| `traits`      | 3 to 4 short behaviours, at most 60 characters each.                                                                   | Yes (small chips) |
| `appearance`  | The visual brief, see below.                                                                                           | **No**, art only  |

Player-facing text is plain, warm and short. No jargon, no stats. Say what the creature is like, not how strong it is.

## The visual brief (`appearance`)

An input brief for anyone making images of the creature: a sprite artist, an illustrator or an image model. It is deliberately medium-neutral, but every line has to survive being drawn at **16×16** (creatures) or **24×24** (bosses).

| Field        | Meaning                                                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `silhouette` | One line: the shape you must be able to recognise in solid black. The most important line.                                               |
| `size`       | `tiny`, `small`, `medium` or `large`, relative to other creatures (bosses: `large` or `huge`). See the footprint table below.            |
| `palette`    | 3 to 5 named colours as lowercase `#rrggbb`, consistent with the element (see below).                                                    |
| `features`   | 3 to 5 bullet strings: the few details that make it this creature. Keep to what survives at 16×16 (a tuft, an ear, an eye highlight).    |
| `pose`       | One line: the default pose to draw.                                                                                                      |
| `always`     | 1 to 3 things every drawing must include.                                                                                                |
| `never`      | 1 to 3 things no drawing may include (these protect the silhouette and the creature's character).                                        |
| `fromStage1` | **Stage 2 forms only** (and required for them): `keeps` (what is shared with the stage 1 form) and `changes` (what is new or different). |

### Size and footprint

Since the shared chibi face (eyes at x 4-5 and 10-11, blush at x 3 and 12, checked by a test), every creature's head is 14 px wide with its outline, so `size` no longer changes the body's width at 16×16. Size shows in what grows around the head: ears, wings, fins, shells and how much of the 16×16 frame they fill. (The old table of 6 to 16 px body widths predates the shared face; Zipmouse, the `tiny` example, is 14 px at the eyes and 15 at most. Found while drawing the Void concepts, `art-studio.md`.)

| `size`   | At 16×16 (creatures)                                    | Example            |
| -------- | ------------------------------------------------------- | ------------------ |
| `tiny`   | the bare head, small ears or tufts, frame mostly empty  | Zipmouse           |
| `small`  | the head and one small feature above it                 | Splashet, Cindle   |
| `medium` | features reach the frame edge on one or two sides       | Tidewing, Stormray |
| `large`  | the full 16 px width, features to the edges, filling it | Gaiadrake, Solmane |

Bosses are 24×24: `large` is about 16 to 20 px, `huge` about 20 to 24 px.

### Palette rules

- Every palette holds **at least two colours in its element's hue family**, checked by a test:
  - Tide: blues and teals (hue 165 to 240).
  - Ember: reds, oranges and warm yellows (hue 345 to 50).
  - Grove: greens (hue 70 to 165).
  - Spark: electric yellow, and storm violet (hue 40 to 70 and 235 to 300).
- Other colours are accents: a cream belly, a pink flower, a glowing lantern. Use them sparingly.
- A species keeps its element colours at every stage. Colour names are unique within a palette.
- The palette does **not** include the shared outline colour (`ink`, see `m6-look.md`) or the white eye highlight; every sprite gets those.
- Shiny variants are **palette swaps** made by the artist; the brief describes the normal form only.

### Stage 2 forms

A stage 2 form must read as a clear evolution of stage 1: same family of silhouette, the key features kept, and a few obvious changes. Write `fromStage1.keeps` and `fromStage1.changes` and make `features` list the full set for the evolved form. The evolved form is the same size or bigger (a test checks this).

## Traits

Short behavioural traits, shown as chips. They describe how a **species** acts ("Never sits still", "Naps in any sunny patch"), not what it looks like and not what it does in battle. A trait is shared by every creature of the species. Stage 2 forms get their own traits that grow out of the stage 1 ones.

## Quirks

A **quirk** is a cosmetic personality detail that belongs to one creature ("Hums a tiny tune when it thinks nobody is listening."). It exists so players can attach to _their_ creature rather than to the species. A quirk has **no gameplay effect and no visual change**: do not write quirks that imply a different look ("wears a tiny hat"), and never read a quirk in any rule.

- **Pools** (`quirks.json`):
  - `general`: about 40 quirks that fit any creature.
  - `againstType`: per **evolution line** (keyed by the id of the stage 1 species), 2 to 3 quirks that go **against** the species' traits ("Is secretly afraid of thunder" for the Stormray). Funny and warm, never mean.
- **Text:** at most 60 characters, a complete sentence ending in a full stop, family-friendly, warm or funny. It is shown as "Personality: <text>".
- **Ids:** each quirk has a unique kebab-case id (at most 32 characters). Ids across both pools are unique.
- **The pick rule** is the pure function `pickQuirk(speciesId, rng)`: about **75%** from the general pool and **25%** from the species' against-type quirks (`chance(rng, 1, 4)`, then a uniform pick). A species without against-type quirks, or an unknown one, uses the general pool.
- **Assignment** (server, `apps/worker`): a creature gets its quirk **when it is created**, using the live crypto RNG at that moment, in the same transaction:
  - the starter (`chooseStarter`),
  - a new catch on an expedition (`applyCatch`),
  - a new Festival creature (`grantFestivalCreature`).

  Fusing a duplicate, teaching or releasing one, training and **evolving never change the quirk** (a Kept second creature rolls its own). The quirk RNG (`quirkRng` in `GuildCoreOptions`) is separate from the catch and raid RNGs, so a quirk never uses up the draws of a catch or a fight.

- **Storage:** `creatures.quirk_id` (migration 13). The client gets `quirk` (the id) on the creature view and looks the text up in `lore`. If the id is not in the data (null, or removed), the card shows no Personality line.
- **Backfill:** migration 13 gives every existing creature a quirk, once, from crypto randomness with the same pick rule. It is stored, so it never changes again.

### Editing quirks

- **Text can be edited at any time**; creatures that have the quirk show the new text.
- **Never change or delete an id** that has shipped, because creatures store it. To retire a quirk, rewrite its text. (A missing id is safe, the card just shows nothing, but the player loses the quirk.)
- **Adding quirks** only affects creatures created afterwards (the existing ones keep theirs).
- Keep the general pool at 30 or more quirks and 2 to 3 against-type quirks per line; the loader enforces both.

## Bosses

`bosses-lore.json` has `description` (at most 220 characters) and an `appearance` brief for each boss, in the same shape as a species (no traits, no quirks, no `fromStage1`). The description mentions the boss's gimmick in plain words and must agree with `bosses.json`. Bosses are drawn at 24×24.

## Load-time checks

`loadLore` runs when `@creatures/game` is first imported, so a bad edit fails the tests, the build and the Worker at once:

- every species and every boss has an entry, and nothing else does;
- all lengths, list sizes, `size` values and `#rrggbb` colours are valid; unknown keys are rejected;
- stage 2 forms have `fromStage1`, stage 1 forms do not;
- palette colour names and values are unique within a palette;
- every evolution line has 2 to 3 against-type quirks; the general pool has at least 30;
- every quirk id is unique across both pools.

Tests (`packages/game/test/lore.test.ts`) also check that palettes match the element, that evolved forms are bigger, and that the 25% pick rule holds.

## Adding or changing a species

1. Add it to `creatures.json` (stats, ability).
2. Add its entry to `species-lore.json`. For a stage 2 form, include `fromStage1`.
3. For a new line, add 2 to 3 against-type quirks to `quirks.json` under the stage 1 species id.
4. Run `pnpm test`; the loader tells you what is missing.

## Art direction for sprites

The upcoming look is **chunky pixel art, cute and round, on a dark night-sky UI** (`m6-look.md`). The briefs above are written for it, but they also work for illustrations.

- **Grid:** creatures 16×16, bosses 24×24. Nearest-neighbour scaling only, never smoothed. Transparent background.
- **Shape language:** round, soft and chunky. A big head, a short body, stubby limbs. One strong silhouette per creature, readable as a solid shape. Sharp edges are for bosses and for a few details (thorns, bolts).
- **Eyes:** the main source of charm. Two or three pixels tall with a single white highlight pixel. Big and wide-set for small creatures, calmer and narrower for ancient or elegant ones.
- **Colour:** at most the 3 to 5 palette colours plus the shared outline (`ink`) and a white highlight. Light from the top left: one lighter tone on the upper left edge, one darker on the lower right. No gradients and no anti-aliasing. Colours are saturated enough to stand out on the dark UI.
- **Outline:** one pixel, a dark hue-shifted shade (never pure black), the same for every sprite so a team looks like a set.
- **Evolution:** keep the head shape, ears, eyes and colours from stage 1 and change body proportions and one signature detail. A stage 2 form is bigger, not a different animal.
- **Animation:** two-frame idle bob (1 px up and down); stepped, short motions. Shiny variants swap the palette only.
- **Check:** the sprite must be recognisable at 1×, as a black silhouette and on a `dusk` panel, and still read at 2×, 3× and 4×. `pnpm art <set>` draws all of these and runs the rules (`art-studio.md`).
- **Bosses:** the same language with more weight: heavier proportions, one or two glowing details (eyes, seams, crown) and a clear element colour. Never scary-gory; this is a game for a friendly Discord server.
