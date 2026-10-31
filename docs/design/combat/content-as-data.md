# Phase 3 plan: combat v2 content as data

Status: plan, 2026-10-31. Phase 3 of `roadmap.md`: the combat v2 content leaves the lab's TypeScript and becomes schema-validated data files in `@creatures/game`, the code that turns it into an engine input moves next to the engine, and the lab reads the game's content. Gate (roadmap): content tests for unique names (P-06), every keyword defined, every card has answers, every form has its Knacks. Misa's part: approve the new names and flavour in batches.

## 1. What moves, and where

| Lab today                                                                                                                     | Kind                              | Data file (`packages/game/src/combat-v2/data/`)                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `rules.ts` `LAB_RULES`                                                                                                        | Rules numbers                     | `rules.json` (checked against the engine's `V2Rules`)                                                                 |
| `knacks.ts` `FAMILIES`, `KNACKS`                                                                                              | Content                           | `knacks.json`: families, then Knacks (id, name, family, text, intent, effects)                                        |
| `knacks.ts` `OWN_KNACKS`, `armour.ts`, `stats.ts`                                                                             | Content (per form)                | `forms.json`: per form its armour, its own Knacks, and its stat changes (Attack scale, crit chance, crit damage)      |
| `talents.ts` `TALENTS`, `LINE_POOLS`                                                                                          | Content                           | `talents.json`: talents (id, name, text, roles, intent, effects), then the pools per line                             |
| `cards.ts` `CARDS`                                                                                                            | Content, today code               | `cards.json`: each card a list of operations (section 4)                                                              |
| `bosses.ts` `RAID_SPECS`                                                                                                      | Content                           | `raid-bosses.json`: arena rows, armour, Attack, HP, plain attack, moves, cards, Build-up, `asks`                      |
| `foes.ts` `FOE_SPECS`, `FOE_BASE`, `FOE_CURVE`                                                                                | Content                           | `foes.json`: the scale and depth curve, then each foe                                                                 |
| `keywords.ts` `KEYWORDS`                                                                                                      | Content (player text)             | `keywords.json`                                                                                                       |
| `track.ts` `TRACK_ORDER`, `SLOT_NUMBERS`, `SLOT_CARDS`, `SLOT_EXTRA_CARDS`, the slot strengths                                | Content (what the game will play) | `raid-track.json`: slots 1 to 15, each with its boss, HP, Attack, armour, card strength, cards, Build-up, extra cards |
| `species.ts` `formStats`, `fight.ts` `placeFighters` and its memos, `cards.ts` `apply`, `raidBossOf`'s and `foeAt`'s building | Content resolution                | the engine, `packages/engine/src/v2/resolve/` (section 2)                                                             |
| Ranks (low, mid, high), answers, targets, search, tuners, the path, reports, the valley seam, ownability                      | Measurement                       | stay in the lab                                                                                                       |

Names, ids and numbers move unchanged. The lab keeps its module names and exports (`KNACKS`, `TALENTS`, `card`, `raidBossOf`, ...) as thin readers of the game's content, so its searches, tuners, reports, tests and the Activity's combat-lab page change only where they read.

**The intent text stays next to its entry** (`intent` on Knacks and talents, `asks` on cards, bosses and foes): agents edit one place, and the lab report prints it. It is never shown to players; phase 4's client reads only the player fields. The long tuning comments in `bosses.ts`, `foes.ts` and `track.ts` already have their record in `boss-track.md` and the decisions; what is left of them goes to the compendium (section 7) or a `note` field.

## 2. The seam

- **A separate entry point, `@creatures/game/combat-v2`.** It loads and checks the v2 files at import, like the game's `content`, but nothing in the shipped game imports it until phase 4, so the worker's bundle and start-up do not grow before then. (A new `exports` entry in `packages/game/package.json`: a manifest change, called out in the PR.)
- **The resolver goes to the engine, not the game.** The roadmap said "the game"; it cannot: the engine depends on the game (`Rng`, `int`, `chance`), and the resolver needs the engine's effect merge (`mergeFx`, `STAT_FIELDS`). So `packages/engine/src/v2/resolve/` holds `formStats`, `resolveFighters` (today's `placeFighters` with its uniform effect objects and memos), `applyCard`, `raidBoss` and `foeAt`. Each takes the content pack as an argument, so the rules stay pure and the tests build tiny packs; the lab, and in phase 4 the worker, pass `combatV2` from the game.
- **The engine's types stay the rules' source.** The game's schemas (the effect vocabulary, patterns, moves, the Build-up, card operations) describe the same shapes as the engine's `KnackFx`, `Pattern`, `BossMove`, `Escalation` and the new `CardOp`. A type test in the engine checks each pair both ways, so a new effect field fails the typecheck until both sides have it. Shipped species data (`creatures.json`) is read as it is; the v2 form data sits beside it, so v1 is untouched.

## 3. Schemas and load-time checks

Valibot, strict objects, as the game's other content (`talent-schema.ts`, `dungeon-schema.ts`). After the schema, cross-references, each failing at load with the entry named:

- Every Knack's family exists; every form in `forms.json` is a shipped form and every shipped form has an entry with at least one own Knack; every Knack a form names exists, and every Knack is on at least one form.
- Every talent in a pool exists; each pool holds seven talents; a talent's effects use only additive fields (`ADDITIVE_FIELDS`), never a Knack's effect alone, and never Seal (the rules in `talents.ts`' header).
- Every card, move and Build-up a boss, foe or track slot names exists; at most two moves share a boss turn on any round (today a lab test).
- Rules numbers: every `V2Rules` field present.

## 4. Rule cards as operations

Today each card's `apply(boss, strengthBp)` is a function. As data a card is a list of operations; the engine's `applyCard` runs them at a strength, and **applying any card sets the boss's strength to the card's** (today only the mod cards do; every place that applies a card does so at the boss's own strength or at full strength, so this changes no result, and the digest proves it). `share(v)` is `floor(v x strength / 10000)`, as now.

| Operation                              | Does                                                                                          | Cards                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `add` (stat, value)                    | stat + share(value)                                                                           | Thick Hide (armour 70), Elusive (Speed 300)                                                |
| `set` (stat, value)                    | stat = share(value)                                                                           | Slippery (dodge 2,500), Lucky Strike (crit chance 2,000)                                   |
| `raise` (stat, bp)                     | stat x (1 + share(bp))                                                                        | Wither (Attack 2,000)                                                                      |
| `flag` (mod)                           | turns a rule on                                                                               | Clean Scales, Reflective Hide, Fizzle, Reaction Resistance, Element Resistance             |
| `mod` (mod, base, plus or minus value) | mod = base + or - share(value); without a value, base, unscaled                               | Breakwater (ward 10,000 + 20,000), Wither (healing 10,000 - 5,000), Shake It Off (every 3) |
| `cap` (value)                          | no hit above value x 10000 / strength; none at strength 0                                     | Stone Skin (260)                                                                           |
| `move` (move, scale)                   | adds a move: its power scaled (at least 1 bp), or its gate's strength                         | Payoff Hunter, Great Wave, Crusher (power); Bramble Bind (gate)                            |
| `plain` (pattern, power bp, hits)      | changes the plain attack: a new aim with power x (1 + share), or new hits rounded by strength | Grudge, Swarm                                                                              |

A card also carries its name, its `asks` and, for the gate's "every card has answers", its **answers**: the Knack families or talents that answer it (at least two, from different families; the lab's measurement tests already prove that the written answers beat the classic line).

## 5. Order of the work

Each slice is one commit (or a few), and the lab's parity digest (`node scripts/parity.mjs --check`) is identical after every one.

1. **Rules, Knacks, forms, talents.** `rules.json`, `knacks.json`, `forms.json`, `talents.json` with schemas, checks and the engine's type test; the lab's `rules.ts`, `knacks.ts`, `armour.ts`, `stats.ts` and `talents.ts` read them.
2. **Cards, bosses, foes, keywords.** `cards.json` with the operations and `applyCard` in the engine (with rule tests per operation); `raid-bosses.json`, `foes.json` (moves as objects, not the lab's short rows), `keywords.json`; the lab's `cards.ts`, `bosses.ts`, `foes.ts` and `keywords.ts` read them.
3. **The resolver.** `formStats`, `resolveFighters`, `raidBoss` and `foeAt` move to `engine/src/v2/resolve/` with tests on hand-built packs; the lab's `fight.ts`, `species.ts` and the boss builders call them. The speed budget holds (the memos and uniform effect objects move with it).
4. **The track.** `raid-track.json`; the track tuner writes it (`--tune --track --write`) instead of printing a table to paste. The lab's ranks stay as measurement; the track's own slot strengths are written out per slot.
5. **Content tests** (the gate, section 6), then **the compendium** and **the names** (section 7), then **the icons** (section 8).

## 6. Content tests (the gate)

In `packages/game/test/combat-v2-content.test.ts`, on the shipped files:

- **Unique names (P-06):** one name per effect across Knacks, talents, cards, keywords, families, boss moves and Build-ups; a talent may share a name only with the shipped gear line of the same effect (`TALENT_IS_GEAR`, moved with it).
- **Every keyword defined:** every `{Keyword}` in a Knack, talent, card or keyword text is in `keywords.json`, and every keyword is used somewhere.
- **Every card has answers:** at least two, from different families, each one existing.
- **Every form has its Knacks:** every shipped form has at least one Knack it can equip (its own and, if its role stayed, its stage 1 form's), and every Knack is on a form.

The lab keeps the measurement tests (answers beat the classic line, ownability, the targets); the content tests the lab has today (`knacks.test.ts`, the content parts of `talents.test.ts`) move to the game.

## 7. The compendium and the names

- **Compendium:** a new `docs/compendium/combat.md` for Knacks, families, keywords and rule cards; v2 talents in `talents.md` beside the v1 ones (marked as combat v2); the bosses' moves and Build-ups in `bosses.md`, the foes' in `dungeon.md`. `compendium.test.ts` grows to require every v2 name.
- **Names, Misa's part:** no combat v2 name is approved yet. They go to Misa in four batches, each with its player text: (1) Knacks and families; (2) talents; (3) keywords and rule cards; (4) the bosses' and foes' moves and Build-ups. A batch's answer is either "approved" or a rename; a rename is one edit in the data file (ids stay), and the content tests and the compendium follow. Approved names get **[Misa]** in a combat decision.

## 8. Icons

One icon per keyword that names a rule a player meets on the board (Mark, Taunt, Silenced, Wind-up, ...) and per attack shape (single, row, column, line of three, scatter, the row's ends, cross), drawn in the art studio (`docs/design/art-studio.md`) at the board's size. They come last, after the names are approved, so no icon is drawn for a name that changes. Misa sees them as a sheet before they ship (they are a design he has not seen).

## 9. Not in phase 3

- Wiring any of it into the worker or the Activity (phase 4, behind `COMBAT_V2`).
- The track after slot 15: the lab carries the high rank's numbers on; the game's later laps are a phase 5 question.
- New content (a Mire Setter or Payoff, the Undercroft's foes): later content, after the names.
