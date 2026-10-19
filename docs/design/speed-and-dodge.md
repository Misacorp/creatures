# Speed, dodge, status effects and Mire

Status: **design, 2026-10-19, building.** From a brainstorm with Misa (2026-10-19). One shippable PR. Numbers marked _start_ are first guesses; the balance simulator tunes them before the PR is done. Misa's calls are marked **(Misa)**.

## Why

Speed only did one thing: on a boss with `speed` turn order (only Cinder Wyrm) it sorted the creatures. Everywhere else it did nothing, and gear and the Zoomies talent that raise it were wasted three weeks in four. Misa: an order by Speed is not fun to plan around, because the board does not show it. And the game is ready for a fifth element, built so more can follow.

The work, in five parts:

1. **Serpentine turn order** replaces speed order. Cinder Wyrm gets it.
2. **Dodge:** Speed becomes the base of a dodge chance, for creatures and foes.
3. **Status effects:** debuffs (and the base for buffs), measured in turns, with stacks.
4. **The element chart:** element matchups become a table of attacker → defender pairs, so the wheel can grow.
5. **Mire,** the fifth element: two creature lines, a raid boss, dungeon foes, a trip place, gear, a mark, two reactions and the first debuff, Mired.

## 1. Serpentine turn order

The creatures act row by row, front row first, and each row runs the opposite way to the one before it. Every round, each row flips **(Misa)**.

| Round   | Front         | Middle        | Back          |
| ------- | ------------- | ------------- | ------------- |
| 1, 3, … | left to right | right to left | left to right |
| 2, 4, … | right to left | left to right | right to left |

_Example (3 per row, board slots 1 to 9)._ Round 1: 1, 2, 3, 6, 5, 4, 7, 8, 9. Round 2: 3, 2, 1, 4, 5, 6, 9, 8, 7.

- Rows are the board's rows (`combat-rules.md` 1.4); uneven rows (3 / 4 / 3) work the same. Gaps and knocked-out creatures are skipped; order comes from board positions.
- Enrage rounds keep flipping (round 13 runs like round 1).
- The dungeon stays left to right (`RULES.dungeon.turnOrder`).
- Turn order becomes a function of the round. Overflow ("next creature in the round's turn order") reads that round's order.
- `TurnOrderSchema` gains `serpentine`; Cinder Wyrm moves to it. The engine keeps `speed` so stored fights replay; a content test forbids it in content.
- Text: glossary entry, a turn-order glyph and caption on the boss card, the Discord reveal's short text ("creatures snake through the rows"), the board preview shows round 1's order and says rows flip each round.

## 2. Dodge

### 2.1 The chance

Every creature and every foe has a **dodge chance**. A dodged hit deals nothing.

- dodge = Speed × `dodgePerSpeedBp` (_start 10 bp a point_: 100 Speed is 10%), plus flat dodge from lines, capped at `dodgeMaxBp` (**50%**, hard).
- It is the fighter's own number, not relative to the attacker, so what the creature page shows is what the fight uses.
- Targets **(Misa)**: about **10–15% without trying**, about **30% with moderate investment**, near 50% only with the right species, real investment and perhaps a golden talent. Today's level-30 Speeds give Guards about 5–8%, most creatures about 12%, Ancientshell 17%.

### 2.2 Which hits can be dodged

| Hit                                                                         | Dodge                                               |
| --------------------------------------------------------------------------- | --------------------------------------------------- |
| Plain attack, a strike's first hit, a slam's main hit                       | Full chance                                         |
| Area hits: row attack, sweep, barrage shell, lance, pincer, a slam's splash | Half chance, plus Sidestep's points in full         |
| Chain jumps                                                                 | Each jump rolls; a dodge does not stop the chain    |
| A charge landing                                                            | Full chance                                         |
| **Enrage hit**                                                              | **Full chance (Misa: lucky dodge streaks are fun)** |
| A hit a reaction reflects back                                              | Never                                               |
| A hit a Guard steps in to take                                              | Never (the Guard chose to take it)                  |

Order in the hit: the target is picked, a Guard steps in or not, then the taker rolls dodge, before Shield Wall, armor, cover and crit. A dodged hit is a `boss_hit` with `damage: 0` and `dodged: true`. Nothing that waits for a hit taken fires on it (Payback, Last stand, Stubborn, Rally cry, the Mire Guard's Mired).

If dodge streaks make the finale drag, the lever is enrage escalation (the boss's enrage damage grows each enrage round), not a rule change.

### 2.3 Foes dodge too

- Every boss and dungeon foe gets `baseSpd`; foes sit low (_start 2–5% dodge_). A raid boss's Speed may grow with Boss Rank (a curve column).
- A dodged creature hit: no damage, no crit, no Echo, no reaction, no credit.
- **Marks (Misa):** a **Setter's** hit always leaves its mark, even when dodged (setup never misses). Any other dodged hit leaves no mark (Quick re-mark included). A Payoff's dodged hit leaves the existing mark standing.

### 2.4 Sources

- **Fleet** (new gear line): Speed +% (a share). Stat line, tiered. _Start 5 / 8 / 11 / 14 / 17%._
- **Light-footed** (new gear line): dodge, flat points. Special line, Rare and up. _Start 2 / 3 / 4 / 5 / 6._
- **Sidestep** folds into dodge: "+X points of dodge against area hits". Its old dice stay for replays only.
- **Zoomies:** "Dodges more often" (it still raises Speed).
- **Mud** room modifier (team Speed down) and room modifiers on `spd` already exist in the schema.

### 2.5 On-dodge lines (trigger lines, `combat-rules.md` 12)

| Line       | Effect when it dodges                                                                       |
| ---------- | ------------------------------------------------------------------------------------------- |
| Riposte    | Strikes back at once for a share of its Attack (_start 30%_); no mark, no crit, no reaction |
| Momentum   | Its next turn hit deals this much more (replaces an earlier one)                            |
| Slipstream | The creature beside it with the most Attack gets a boost on its next hit                    |

## 3. Status effects

The general system for debuffs now and buffs later. Silence can move into it later; it already counts down the same way.

### 3.1 The model

A **status effect** sits on one fighter (a creature, a boss or a foe). Each is defined in content (`status-effects.json`, schema-validated):

- `id`, `name`, `kind` (`debuff` now; `buff` is in the schema from day one),
- `maxStacks`, `turns` (the base duration),
- `perStack`: plain numbers on the modifier sheet (for Mired: Speed −%, damage dealt −%).

On a fighter, an effect has **stacks** and **turns left**.

### 3.2 Turns

A **turn** is one fighter's action. **A status effect counts down on its target's own turns (Misa agreed):** at the end of each of the target's turns, turns left goes down by 1; at 0 the effect ends. The boss takes one turn a round, so "3 turns" on a boss is 3 rounds in a raid of any size and in the dungeon. A creature's skipped turn (silence, haze) still counts as its turn. A knocked-out creature's effects end.

### 3.3 Applying, stacks and refresh

- **Application power** says how many stacks an application adds, in basis points **(Misa)**: 100% adds one stack, 200% two, 140% one plus a 40% chance of a second. A gear line "+40% chance to apply an extra stack" is +40% power. Below 100% it is a chance of one stack.
- The extra-stack chance rolls on dice drawn at round start (`combat-rules.md` 9.2), behind the effect's own dice so other dice never move.
- Stacks add up to `maxStacks`. **Every application refreshes the timer to full, even at the cap (Misa).**
- **When the timer runs out, all stacks fall off together.**
- Duration modifiers (+N turns) and power modifiers (+%) come from gear, talents and sources.

### 3.4 Purge and cleanse

- **Purge** is a new kind of boss move (`op: purge`, any trigger): it removes every debuff from the boss. Content can give it to any boss or foe.
- A Support's **cleanse** (today it clears silence on neighbours) also removes debuffs from its neighbours.

### 3.5 Brakes, so a boss is not pinned at the cap forever

1. Most sources apply **below 100% power**, so duration matters between lucky rolls.
2. A low cap with modest stacks: Mired at 5 × 3% is at most −15%.
3. Only some things apply debuffs: a creature's plain hit leaves its mark, not a debuff.
4. **Flare** (5.4) burns the stacks away for damage, and purge moves clear them.
5. Later, if needed: boss debuff resistance by Boss Rank.

### 3.6 Lines and talents for effects

- **Lingering** (gear): debuffs you apply last +N turns.
- **Heavy hand** (gear): +% application power for debuffs you apply.
- **Clean coat** (gear): debuffs on the wearer are weaker (−% per-stack effect); a Support version for its neighbours.
- Talents use the same numbers (a Mire Guard talent that resists debuffs; Support talents that extend them).

### 3.7 Showing it

Effects show as icons beside the boss (and over creatures on the stage), with stacks as "×5" and turns left. The fight log has a sentence for applied, stacked, refreshed, expired, purged and cleansed.

## 4. The element chart

Matchups become a list of attacker → defender pairs with a multiplier. A pair not listed is 100%. It still only changes a creature's hit on a boss or foe; foe hits on creatures ignore elements (they may use the chart later).

| Attacker → defender                                      | Damage |
| -------------------------------------------------------- | ------ |
| Tide → Ember, Ember → Grove, Grove → Spark, Spark → Tide | 150%   |
| Ember → Tide, Grove → Ember, Spark → Grove, Tide → Spark | 75%    |
| **Mire → Ember** (damp smothers the fire)                | 150%   |
| **Ember → Mire** (swamp gas goes up)                     | 150%   |
| **Tide → Mire** (it is already wet)                      | 75%    |
| Grove, Spark ↔ Mire; Mire → Tide                         | 100%   |

- **Reactions:** a mark is set off by any element that deals 150% to the marking element. A mark can have more than one trigger (Scorched: Tide and Mire).
- **Hunter and Ward lines** read the chart: "X Hunter: damage against foes X deals 150% to" (Mire Hunter: Ember foes), "X Ward: damage from foes that deal 150% to X" (Mire Ward: Ember; Ember Ward: Tide and Mire).
- Help text: "the wheel" becomes the **element chart**, a small grid in the glossary and how-to-play. Each element's line reads "Mire: strong against Ember · weak to Ember · resists Tide". The journal's wheel page gets a new line in lore.
- Ember ↔ Mire is the first pair that sets off each other's marks, so either can go first: robust on Serpentine weeks. The simulator watches it.

## 5. Mire

**Identity: Mire is patience. It sticks, it holds, it keeps.** Peat brown, ochre, tar black with an oily rainbow sheen. Slow, sturdy creatures (the lowest Speed in the game, so little dodge, and high HP). The bog keeps old things: its trip place turns up old finds.

### 5.1 Mark and the Mired debuff

- **Mark:** **Muddied** (Mire's element mark, left like every mark).
- **Mired** (status effect, debuff): per stack Speed −3% and damage dealt −3% (_start_), cap 5, 3 turns (_start_).

### 5.2 Reactions

| Reaction    | Mark set off     | By    | Extra                                                                                          |
| ----------- | ---------------- | ----- | ---------------------------------------------------------------------------------------------- |
| **Smother** | Scorched (Ember) | Mire  | Normal reaction bonus, and applies Mired (_start 100% power_)                                  |
| **Flare**   | Muddied (Mire)   | Ember | Normal reaction bonus, then **burns off all Mired stacks** for +20% (_start_) damage per stack |

Flare gives a real choice: keep the stacks (boss slower and weaker) or burn them for one big hit.

### 5.3 Creatures (Misa: a Guard and a Support for now)

Two lines, each a base form that evolves at level 15, like the existing lines. Names below are working names; the compendium pass may refine them.

- **Guard line: Mudlump → Bogwarden.** The steadfast tank: very high HP, the lowest Speed. Signature: when it takes a hit (not dodged), it applies Mired to the attacker (_start 60% power_). A talent in its pool resists debuffs.
- **Support line: Squelch → Croakmire.** The debuffer: its round-start action, besides its usual Support work, applies Mired to the boss (_start 60% power_); its talents and gear lean to debuff duration and power.

Setter and Payoff Mire lines come later **(Misa)**.

### 5.4 Raid boss: Old Bogback

A huge, half-sunk ancient toad. Element Mire. Its moves put **Mired on creatures** (whole rows), which cuts their Speed and so their dodge, so debuff resistance and Clean coat are worth chasing on its week. It may also purge itself now and then. Needs lore, a sprite, a Discord portrait, retreat lines, a loot table and an adaptation like the other bosses. Spark is neutral against it; Ember teams shine (150%), Tide teams struggle (75%).

### 5.5 Dungeon

- Two or three Mire foes (for example a bog toad, a tar leech, a fen lurker room boss), with low Speed.
- **Mud** room modifier: the team's Speed down (_start −30%_).

### 5.6 Trip place: Sunken Fen

A Mire destination where the bog keeps old things: better odds of old finds (gear, journal pages, the Ancient vault push-on). Banner, catch table (the two Mire lines), journal pages, compendium entry.

### 5.7 Gear

- Mire shards; one or two Mire-tagged bases.
- The four element lines for Mire (Attunement, Hunter, Reaction, Ward), from the per-element line set.
- Mire bases favour staying power and debuff lines (Last stand, Stubborn, Second wind, Lingering, Heavy hand).

### 5.8 Everywhere elements are listed

Every list, switch and palette that names the four elements gets Mire: the auto placer, the simulator and analytics, the element icons and colours, Discord emoji and colours, the glossary and how-to-play, collection goals, guests, weather or specials that pick an element, loot tables keyed by element.

## 6. Randomness and replays

- Dodge dice and effect dice are drawn at round start like every other die, numbered by purpose, and only when the feature is on in the fight's stored rules. A fight without them draws what it always drew.
- Stored fights keep their rules and boss, so a stored fight replays exactly. The legacy digest test is re-pinned once on purpose, with the reason in `decisions.md`, if Serpentine or dodge changes its numbers.

## 7. Balance

- 50% dodge doubles real HP. Boss damage is re-tuned so the targets in `balance-targets.md` still hold with typical dodge in the teams; foe dodge and Mired move boss HP the other way.
- The simulator runs before and after with seeded dice; results go in `docs/balance/log.md`.
- Watch: Cinder Wyrm on Serpentine, Ember + Mire pairs, enrage length with dodge, Old Bogback's clear rates by element.

## 8. Build order (one PR, one commit per slice)

1. Serpentine.
2. The element chart (pairs, multi-trigger reactions), no Mire yet; nothing changes for players.
3. Status effects in the engine (model, turns, power, refresh, purge, cleanse, events), with a test effect.
4. Dodge in the engine (rules, dice, hit table, the Setter mark rule, events).
5. Mire content: element, chart pairs, mark, Mired, Smother, Flare, creatures, boss, foes, Mud, Sunken Fen, shards, bases; foe Speeds for every foe.
6. Lines and talents: Fleet, Light-footed, Sidestep, Riposte, Momentum, Slipstream, Lingering, Heavy hand, Clean coat; the power score counts dodge.
7. The game UI: sprites and portraits, Mire colours and icon, status icons, dodge on the stage and creature page, the element chart in help, the boss card.
8. Balance pass, then everything on by default; docs (`combat-rules.md`, compendium, how-to-play).
