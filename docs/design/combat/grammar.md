# Combat v2 grammar: what content may contain

The shape of every Knack, rule card and boss, so new content fits without new rules. The lab's types (`packages/lab/src/knacks.ts` `KnackFx`, `src/types.ts`, `src/cards.ts`) are the authority for shape; this page explains them.

## Limits (hard)

- A mark count is 1 to 3. One reaction per hit.
- A Store holds at most 3; at most one Store per creature line.
- All buff hit bonuses together are capped; every debuff has its own maximum.
- A boss's moves never exceed two damaging moves on one boss turn (today's content rule, kept).
- Every rule card has at least two answers from different tools (Knacks of different families, placement, a talent).

## Knack families

A family is one rule with different numbers or elements. A new Knack joins a family; a new family needs a reason (P-09).

| Family                      | What it does                                       | Examples                                     |
| --------------------------- | -------------------------------------------------- | -------------------------------------------- |
| Seal                        | Its marks are not shed                             | Soak Through                                 |
| Lead                        | Boosts the next creature after it marks            | Lead the Way                                 |
| Heavy Prime                 | Gives up its damage for more mark counts           | Overcharge, Downpour                         |
| Self Prime                  | A non-Setter that marks what it can cash           | Own Puddle                                   |
| Guard Prime / Support Prime | A Guard or Support that marks, at a cost           | Primed by Pain, Static Shell, Ready the Mark |
| Detonator                   | A Payoff that spends several counts                | Detonate, Big Spout                          |
| Chain                       | After a reaction, leaves a mark of its own element | Leave a Trail                                |
| Flurry                      | Several smaller hits                               | Twin Strike                                  |
| Reach / Intercept           | Changes what a Guard covers                        | Wide Reach, Night Watch, Catch the Bolts     |
| Taunt                       | Draws the plain attack                             | Draw Fire                                    |
| Evasion                     | Dodge, with Retaliate or a Store                   | Zoom, Zigzag                                 |
| Row Ward                    | Cuts area damage for its row                       | Keep the Heat In                             |
| Pierce                      | Ignores some boss armour                           | Tunnel Through                               |
| Support shape               | Changes where a Support's boost and heal land      | Sunbeam, Wide Warmth, Curl Up, Clear Skies   |
| Sustain                     | Heals or cleanses on a reaction                    | Circle Round, Clear the Air                  |
| Store                       | Fills over the fight, spends at 3                  | Gather Calm, Baked Shell                     |
| Debuff                      | Puts a debuff on the boss                          | Mud Wall, Squelch Song                       |

## Naming

- The same effect keeps the same name everywhere (P-06): a Knack on another species or on gear uses its existing name.
- Knacks are actions or short phrases ("Draw Fire"); talents are traits ("Proud Wings").
- Names are checked against the compendium's tone before shipping.

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

## Template: a boss

```
### Boss: Name (id)
Arena: rows and slots per row.
Stats: HP, Attack, Armour, Speed (data only).
Plain attack: anchor and shape.
Moves: each with anchor, shape, power, schedule and boss turn.
Cards: its signature rule cards, and which rank adds which.
```
