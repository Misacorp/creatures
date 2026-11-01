# Combat v2 grammar: what content may contain

The shape of every Knack, rule card, boss move and boss, so new content fits without new rules. The content lives in `packages/game/src/combat-v2/data/` and the engine's types (`packages/engine/src/v2/types.ts`, `effects.ts`, `cards.ts`) are the authority for shape; this page explains them.

## Limits (hard)

- A mark has 1 to 3 stacks. One reaction per hit. A reaction on a trail mark leaves no further trail (the chain cap).
- A Store holds at most 3; at most one Store per creature line; a Store fed by reactions gains at most 1 per round.
- All hit boosts together are capped; reaction-bonus factors together are capped (x3); every debuff has its own maximum.
- Marks and trails come only from Knacks, never from gear.
- A boss's moves never exceed two damaging moves on one boss turn (today's content rule, kept).
- Every rule card has at least two answers from different tools (Knacks of different families, placement, a talent), and the report must show them winning before the board points at them (P-13).

## Knack families

A family is one rule with different numbers or elements. A new Knack joins a family; a new family needs a reason (P-09). The list lives in the data (`FAMILIES` in `packages/lab/src/knacks.ts`) and is generated into [`knacks.md`](knacks.md) ("Families"); a test fails if a Knack names a family that is not there.

Every element should get the same kinds of tools: a Heavy Prime Setter, a Setter that survives the front row, and a Payoff with a Detonator (P-12). The report's "Element coverage" table shows the gaps.

## Naming

- The same effect keeps the same name everywhere (P-06): a Knack on another species or on gear uses its existing name.
- Knacks are actions or short phrases ("Draw Fire"); talents are traits ("Sharp Claws"). A talent never repeats a Knack's effect, and talents and gear take the existing name of an effect (R20).
- Names are checked against the compendium's tone before shipping.

## Boss moves: behaviour and paint

A boss or foe move has two parts (Misa, 2026-11-01; decision `2026-11-01-combat-v2-move-library-a-themed`):

- **The behaviour** is what the move does on the board: its **shape** (which slots it hits) and its **target** (whom it picks), and whether it silences. The behaviour has a plain **label** made of a target word and a shape word, for example Nemesis Lance or Wild Sweep. The label is what a player learns once and then reads on every boss.
- **The paint** is the move's **name**, its theme and its animation, for example Deepwater Spear. The name is a coat of paint over one behaviour: **a name always means the same behaviour**, wherever it appears. The board can show both ("Deepwater Spear · Nemesis Lance").

Numbers are neither: **power, rhythm, count, Wind-up, crit chance and the boss turn belong to the boss that uses the move**, not to the move. Two bosses can share a move and hit with it differently.

The words:

| Shape word | Hits                                          | Target word | Picks                                              |
| ---------- | --------------------------------------------- | ----------- | -------------------------------------------------- |
| Slam       | the target and the slots beside it            | Front       | the first creature to act, or the front row        |
| Lance      | whole columns through the target              | Rear        | the back row (Back-most: the last creature to act) |
| Sweep      | whole rows                                    | Payoff      | the strongest Payoff                               |
| Barrage    | several random creatures                      | Nemesis     | the strongest creature                             |
| Quake      | every creature                                | Wild        | at random                                          |
| Strike     | one creature                                  | Vulture     | the weakest creature (lowest share of its HP)      |
| Hush       | silences the two ends of the row              |             |                                                    |
| Pincer     | hits the two ends of the row                  |             |                                                    |
| Leap       | the strongest, then leaps to creatures nearby |             |                                                    |

A move with no target (Barrage, Quake, Hush, Pincer, Leap) needs no target word. In a one-row arena (the dungeon) the row is both the front and the back row; front-row effects always apply there.

**The library.** Every move lives once in the move library (`packages/game/src/combat-v2/data/moves.json`). An entry has an `id` (the name in kebab case, stable from the day it exists: `deepwater-spear`), a `name`, an `element` (`tide`, `ember`, `grove`, `spark` or `mire`; absent for a card's move) and the behaviour, which never changes: `shape` (which slots), `anchor` (whom it picks) and `silences` (a boolean; `oneShot` too for Judgement Bolt, the one move that deals a share of the victim's Max HP). **A behaviour has one name per element**, shared by every boss and foe of that element that uses it (the Bramble Hound and the Bramble Matron use Thornmother's Bramble Hush). A rule card has no element, so the move a card adds takes the plain label as its name (Hush, Payoff Slam, Wild Sweep, Crush).

A boss, foe or card refers to a library move by `id` and carries **only its numbers**: `every`, `turn`, `powerBp`, `n`, `perColumns`, `decayBp`, `anchors`, `windUp` (Wind-up), `silenceTurns`, `strengthBp`, `oneShotBp`. The schema has no field for a name, a shape or an anchor, so a usage cannot change what a move is. The loader builds the engine's `BossMove` from the pair (name and the pattern's shape and anchor from the library); the engine knows nothing of the library. It refuses a usage of a move that is not in the library, of another element's move (a card's move has no element), or one whose `silenceTurns` or `oneShotBp` does not fit the move.

**One behaviour once.** The loader refuses a library where two moves of one element share a label, and a boss or foe with two moves of one label: its own moves, its landmark move and its phase's moves together, before the phase and after it, and the moves its cards add (a card Hush on a boss that has Bramble Hush). Merge them into one and let the numbers or the phase carry the difference. An escalation's **phase** adds moves, or **replaces** one: a phase move with the same library id as one of the boss's own moves takes that move's place when the phase begins (Thornmother's Second Bloom replaces her Thorn Rain with a stronger one and adds Thorn Wall). The engine does it in `withPhase` (`escalation.ts`); the lab's report says "replacing the move of its name".

**The label** is `moveLabel(move)` (`packages/game/src/combat-v2/moves.ts`), made from the library entry: the target word from the anchor and the shape word from the shape, or the shape word alone for a move with no target. The board shows it under the move's own name. A column and several columns are one Lance, a row and several rows one Sweep, but the library keeps the shapes apart (`column` and `columns`, `row` and `rows`): an Escalating boss's area growth widens only `columns` and `rows`, so Undertow, a `row`, stays one row while Backflow, `rows`, grows. A move's `n` is its count, and it belongs to the boss.

**Adding a move:**

1. Name the behaviour first: a shape word and a target word from the table. A new shape or target word is a new rule (an engine change and a keyword); it needs a reason, like a new Knack family.
2. Look the behaviour up in the library for the boss's element. If it is there, use that move with the boss's own numbers. Don't paint a second name on a behaviour the element already has.
3. If the element has no move for it, add one: a themed name in the element's voice (read `docs/compendium/` for tone), not used by any other move, Knack, talent, card or keyword (P-06). It goes to Misa with the other new names.
4. The loader and the content test (`packages/game/test/combat-v2-content.test.ts`) fail if a library name is used twice, if an element has two moves of one label, if a boss has two moves of one label, if a library move has no user, or if a name clashes with another name (a Knack, a talent, a card, a keyword).

## Template: a Knack

```
### Knack: Name (id)
Family: one from the table.
Forms: which species and stages can equip it; unlock (catch or evolution).
Text: what the player reads; keywords in braces must exist in keywords.md.
Effect: in the grammar's terms (the KnackFx fields).
Cost: what it gives up, or "none" (then name the fight where it is the wrong pick).
Intent: the situation it is for (for contributors; never shown to players).
Principles: which it serves; which it trades against.
Must not: one counter-example of how it could go wrong.
Tests: the lab test or report section that shows it works.
```

## Template: a rule card

```
### Card: Name (id)
Asks: the question, one sentence.
Does: in the grammar's terms (a boss move with anchor, shape, power, schedule; or a boss mod).
Answers: at least two, from different families or tools.
Punishes: the setup it punishes (never a whole build or element).
Scales: how it grows at higher Boss Ranks.
```

## Template: a move

```
### Move: Name (id)
Behaviour: the label (target word + shape word), and whether it silences.
Element: the element whose voice the name is in (none for a card's move: then the name is the label).
Used by: the bosses, foes and cards that use it, each with its own numbers.
Paint: one line on the theme and the animation it calls for.
```

## Template: a boss

```
### Boss: Name (id)
Arena: rows and slots per row.
Stats: HP, Attack, Armour, Speed (data only).
Plain attack: anchor and shape.
Moves: library moves by name, each with this boss's power, schedule, count, Wind-up and boss turn; at most one move per behaviour.
Cards: its signature rule cards, and which rank adds which.
```
