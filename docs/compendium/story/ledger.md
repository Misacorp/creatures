# The clue ledger

Status: **direction accepted by Misa 2026-11-18; he does not read this file** (see `README.md`). Spoilers: read `README.md` in this folder first.

Every fragment that leans on a sealed fact gets a row here, in the same change that writes it. The ledger answers three questions a writer cannot hold in their head: has this fact been hinted enough to be found, has it been hinted so much that it is told, and did two fragments say the same thing twice.

## How to read a row

- **Fact:** the ID in `truth.md`.
- **Grade:** how hard the fragment leans (see the skill, "Grades"). `trace` an object out of place; `echo` a repeat of something seen elsewhere; `slant` a voice saying something partial or wrong; `key` the piece that lets two others join. There is no grade for "says it", because nothing does.
- **Kind:** the surface (journal, gear, quirk, plaque, find, art, place, boss, Gazette, housing).
- **Status:** `shipped` (in the content today), `draft` (written, not shipped), `planned`.

## The count rule

By the end of the chapter that brings a fact into reach (`arc.md`), that fact needs **at least three clues on three different kinds of surface**, and **at most one `key`**. Two clues that say the same thing in different words count as one. Run `node .claude/skills/lore/check.mjs --ledger` to see the counts.

## The stock of names

Mystery needs a small set of names that come back, spelled the same every time, long before anyone knows what they mean. Inventing a fresh Capitalised Noun per fragment is the fastest way to make a world feel thin.

| Surface word           | First use                      | Players read it as (early)         | Points at | Notes                                                     |
| ---------------------- | ------------------------------ | ---------------------------------- | --------- | --------------------------------------------------------- |
| the usual five         | chapter 1                      | a quantity in a recipe             | S04       | Always lower case, never glossed                          |
| lamp oil (as a ration) | chapter 1                      | a supply the old ledgers fuss over | S04, S03  | Far more of it than a valley this size needs              |
| the ring and dot       | shipped ("an old symbol")      | a maker's mark, a lucky knot       | S09       | Describe it, never name it. Art carries it more than text |
| "for after"            | chapter 3                      | a label on a shelf                 | S03       | The only phrase the clerk ever underlines                 |
| the far side           | shipped concept (the Far Side) | a direction                        | S02       | Lower case in speech                                      |
| keeping the watch      | chapter 2                      | what guards do                     | S04, S05  | Used of bosses and, once, of the Hearthshell              |

Dev names (the first valley, the walkers, the stayers, the waylights, the low night, the clerk, the roll) **never** appear in player text. `sealed.json` lists them for the checker.

## Already in the game (harvested 2026-11-18)

These shipped lines were written before the story. They already lean the right way, so they are the story's first clues and cost nothing. Do not edit them to lean harder.

| Fact | Grade | Kind    | Where (id)                           | The line or detail                                                                     | Status  |
| ---- | ----- | ------- | ------------------------------------ | -------------------------------------------------------------------------------------- | ------- |
| S01  | trace | gear    | `gear.json` forge-band               | "hammered flat on a forge that was left running overnight"                             | shipped |
| S01  | trace | gear    | `gear.json` wayfarers-hood           | "made by someone who walked a great many"                                              | shipped |
| S01  | trace | place   | `destinations.json` old-crossroads   | a worn crossing, travellers' campfire ashes, four arrows                               | shipped |
| S02  | trace | journal | `journal.json` reef-silver-tide      | "By morning it is gone, and nobody remembers the way."                                 | shipped |
| S02  | echo  | boss    | `dungeon-foes.json` drift-wisp       | "forgot the way home"                                                                  | shipped |
| S05  | slant | journal | `journal.json` any-boss-adapts       | "the big ones come back with a new trick and a long memory"                            | shipped |
| S05  | trace | journal | `journal.json` storm-lightning-rod   | the king "strikes the strongest"; "the weakest walk home unharmed"                     | shipped |
| S06  | slant | journal | `journal.json` fest-last-night       | "everyone remembers why they came"                                                     | shipped |
| S06  | trace | journal | `journal.json` fest-hearth-ward      | "The fire never goes out."                                                             | shipped |
| S06  | trace | gear    | `gear.json` lantern-charm            | "lit once a season"                                                                    | shipped |
| S08  | trace | journal | `journal.json` fen-old-things        | "A cart wheel, a gate, a lantern, a pair of boots. The bog keeps whatever it is given" | shipped |
| S09  | trace | place   | `push-on-goals.json` ancient-vault   | "A door older than any road."                                                          | shipped |
| S09  | trace | place   | `push-on-goals.json` lost-cache      | "A sealed chest with an old symbol on the lid."                                        | shipped |
| S10  | slant | boss    | `dungeon-foes.json` drowned-warden   | "guards a sunken door nobody has opened. It opens its own gates for you instead."      | shipped |
| S11  | trace | journal | `journal.json` any-old-friend        | "A creature that comes back often learns the way."                                     | shipped |
| S11  | trace | journal | `journal.json` any-bait-and-patience | "the creatures come to the ones who wait"                                              | shipped |
| S13  | slant | place   | `games.md` (compendium, not shipped) | the committee say it has "always been on"                                              | draft   |

## New fragments

Add rows below as fragments are written. Newest last.

| Fact | Grade | Kind    | Where (id)                      | The line or detail                                                             | Chapter | Status |
| ---- | ----- | ------- | ------------------------------- | ------------------------------------------------------------------------------ | ------- | ------ |
| S01  | trace | Gazette | chapter-1: hearth headline      | Black stones under the new ring (device: a thing already there)                | 1       | draft  |
| S07  | trace | find    | chapter-1: The Forge Ledger     | A neat ruled ledger, back pages blank (device: a gap)                          | 1       | draft  |
| S04  | seed  | journal | chapter-1: ledger page 1        | "Lamp oil: the usual five" among nails and coal                                | 1       | draft  |
| S04  | seed  | find    | chapter-1: Tally Post           | Notched in fives, a small ring round every fifth (also the ring shape, S09)    | 1       | draft  |
| S01  | trace | journal | chapter-1: ledger page 2        | "Hooks for the hall: 40" (device: count)                                       | 1       | draft  |
| S13  | trace | journal | chapter-1: ledger page 3        | The hut and the Games in the old ledger; lamp oil "not for bunting" (S03 seed) | 1       | draft  |
| S13  | slant | place   | chapter-1: the committee's line | "the hut came with the meadow"                                                 | 1       | draft  |
