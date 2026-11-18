# Chapter one: The fire was laid

Status: **draft for Misa** (2026-11-18). Player-facing text for the guided start (the hearth, the Market, the Forge). Not in the game yet: Misa approves the words, then it is wired in. This file holds no fact that players do not see; the fact IDs point into `truth.md`.

Written with the `lore` skill. Read by three blind readers (below).

## What the server finds, in order

A fragment marked **new surface** needs a small piece of UI or data that does not exist yet; the rest fit what the valley already shows (Gazette headlines, plaques, the helpers' keepsake of V-COM-3).

### The hearth (first level finished)

| Where players meet it                             | Text                                                                      | Kind      |
| ------------------------------------------------- | ------------------------------------------------------------------------- | --------- |
| Gazette headline, that week                       | HEARTH FINISHED: BLACK STONES TURN UP UNDER THE NEW RING                  | beat B1-1 |
| Plaque on the hearth, round the builders' names   | LAID BY: (names). COME AND SIT.                                           | texture   |
| Helpers' keepsake for the house: **Hearth Stone** | A spare stone from the hearth that holds the fire's warmth until morning. | texture   |

Art, not words: the finished hearth shows a few black stones at the foot of the new ring.

### The Market (finished)

| Where players meet it                                           | Text                                                                                    | Kind            |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------- |
| Gazette headline (shipped, unchanged)                           | THE MARKET OPENS: SHARDS CHANGE HANDS AT LAST                                           | texture         |
| A thing by the stall, tap to read: **Tally Post** (new surface) | An oak post notched in fives from top to foot, with a small ring cut round every fifth. | beat B1-3, seed |
| Plaque on the Market                                            | RAISED BY: (names). MIND THE AWNING.                                                    | texture         |
| Helpers' keepsake: **Awning Scrap**                             | A strip of the Market's first awning, whose stripes ran in the first rain.              | texture         |

### The Forge (first level finished)

| Where players meet it                                               | Text                                                                                                    | Kind        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------- |
| Gazette headline, that week                                         | FORGE RAISED: BOOK FOUND ON SHELF IN THE WALL                                                           | beat B1-2   |
| A thing on a shelf in the Forge: **The Forge Ledger** (new surface) | A ledger in a small neat hand, every column ruled. The back pages are blank.                            | beat B1-2   |
| Ledger page 1, a journal page a smith turns up later                | Nails, short: 1 box. Lamp oil: the usual five. Coal: 2 sacks. Bellows strap: mend it.                   | seed        |
| Ledger page 2, later                                                | Benches, long: 6 more. Hooks for the hall: 40, oak. Chalk: 1 box.                                       | trace       |
| Ledger page 3, later still                                          | Meadow hut: new roof before the Games. Lamp oil is not for bunting, tell them again. Bunting: 30 yards. | trace, seed |
| Plaque on the Forge                                                 | BUILT BY: (names). THE FIRE IS EVERYONE'S.                                                              | texture     |
| Helpers' keepsake: **First Nail**                                   | The first nail off the new anvil, a little bent, and nobody will hammer it straight.                    | texture     |

The three ledger pages are a new journal set, **The Forge Ledger**, found one at a time by creatures working at the Forge after it is raised (weeks apart; nothing to do, nothing to miss).

### The Games

| Where players meet it    | Text                                            | Kind  |
| ------------------------ | ----------------------------------------------- | ----- |
| A line at the fair's hut | The committee say the hut came with the meadow. | slant |

## What the blind readers said

Three fresh agents read the set as players (two the first version, one the revised version above). None had seen the truth or the skill.

- **Worked out, as the chapter intends:** people lived here before; they were many and orderly; one careful hand kept the Forge's books; the Games and the hut are older than the committee.
- **Not worked out:** anything deeper. The lamp oil read as a joke ("a nice one"), the Tally Post was skipped on a first read and only connected after the first ledger page.
- **Wanted next:** where the hall was; what the post counted; why the book stops; what the committee know.
- **Changed after the first two readers:** a second line about the black stones was cut (it said the headline twice); "the last entry stopped halfway along its line" became "The back pages are blank"; a "Tinker" was removed (a reader took it for a character); the plaques no longer share one phrase.
- **Still loud:** the two beat headlines were rated the strongest nudges. That is what a headline is for; the milestone's moment is meant to be noticed.

## To build (after Misa approves the words)

The Gazette lines for the hearth and the Forge; the three plaque frames; three helper keepsakes (art needed); the Tally Post and the Forge Ledger as tappable things in their scenes (art needed); the journal set and its three pages; the committee's line. Compendium entries and ledger rows change from `draft` to `shipped` in that PR.
