# Speed and dodge: Serpentine turn order and a stat that matters

Status: **design, 2026-10-19, not built.** From a brainstorm with Misa. Numbers marked _start_ are first guesses that the balance simulator tunes before anything ships.

## Why

Speed only did one thing: on a boss with `speed` turn order (only Cinder Wyrm), it sorted the creatures, highest first. On the other three raid weeks, in the dungeon and everywhere else it did nothing. Gear lines and talents (Zoomies) that raise Speed were wasted three weeks out of four. Misa: turn order by Speed is not fun to plan around, because players cannot see it on the board.

The change has two parts:

1. **Serpentine turn order** replaces speed order. Cinder Wyrm gets it.
2. **Speed becomes the base of a dodge chance** for creatures and foes. Gear, talents, room modifiers and boss moves can change it.

## 1. Serpentine turn order

The creatures act row by row, front row first, and each row runs the opposite way to the one before it. Every round, each row flips.

| Round   | Front         | Middle        | Back          |
| ------- | ------------- | ------------- | ------------- |
| 1, 3, … | left to right | right to left | left to right |
| 2, 4, … | right to left | left to right | right to left |

_Example (3 per row, slots numbered on the board, left to right)._ Round 1: 1, 2, 3, 6, 5, 4, 7, 8, 9. Round 2: 3, 2, 1, 4, 5, 6, 9, 8, 7.

Rules:

- **Rows** are the board's rows (`combat-rules.md` 1.4). Rows of different lengths (3 / 4 / 3) work the same way.
- **Gaps and knocked-out creatures** are skipped, as in every turn order. The order is read from board positions, so an empty slot does not shift anyone.
- **Enrage rounds** keep flipping (round 13 runs like round 1).
- **The dungeon** stays left to right (`RULES.dungeon.turnOrder`). Each creature is its own row there, so Serpentine would be the same thing anyway.
- **What it means for play:** a Setter just left of a Payoff sets up the hit on odd rounds; on even rounds the Payoff goes first and spends whatever mark is left. Players can see it coming and place for it.

What changes:

- **Engine:** turn order becomes a function of the round (today it is fixed at the start of the fight: `turnOrder` in `fight.ts`, `combat-rules.md` 2.4.1). Overflow's "next creature in the round's turn order" reads the round's order.
- **Content:** `TurnOrderSchema` gains `serpentine`; Cinder Wyrm moves from `speed` to `serpentine`.
- **Old fights:** the engine keeps `speed` order so stored fights replay exactly. No content may use it any more (a content test checks).
- **Player-facing text:**
  - a glossary entry "Serpentine";
  - a new turn-order glyph and caption on the boss card (`boss-icons.ts`, `glyphs.ts`);
  - the Discord reveal's turn-order text (`TURN_ORDER_SHORT` in `discord-format.ts`): "creatures snake through the rows".
- **UI:**
  - the stage and replay ordinals already come from each round's events (`turnOrderOfRound`), so they follow the flips;
  - the placement board's preview (`affects.ts`, `raid-board.ts`) shows round 1's order and says the rows flip each round.
- **Balance:** Cinder Wyrm is re-checked in the simulator.

## 2. Dodge

### 2.1 The chance

Every creature and every foe has a **dodge chance**. A dodged hit deals nothing.

- **From Speed:** dodge = Speed × `dodgePerSpeedBp`. _Start: 10 bp per point_, so 100 Speed is 10%. There is no separate flat base: Speed is the base.
- **Hard cap:** 50% (`dodgeMaxBp`, _start 5000_). Nothing goes above it.
- **The chance is the creature's own.** It does not depend on the attacker's Speed, so the number on the creature page is the number in the fight.

What that gives with today's species (Speed at level 30, before fusion):

| Creature                                | Speed | Dodge |
| --------------------------------------- | ----- | ----- |
| Hearthshell (Guard, slowest)            | 51    | 5%    |
| A typical Guard (Thornbuck, Fogwyrm, …) | 80    | 8%    |
| A typical Setter, Payoff or Support     | 120   | 12%   |
| Ancientshell (fastest)                  | 172   | 17%   |
| Level 1 starters                        | 16–40 | 2–4%  |

So a creature hovers around 10–15% without trying (Misa's target), more as it levels.

### 2.2 Investment targets (Misa)

| Investment                                                             | Dodge     |
| ---------------------------------------------------------------------- | --------- |
| None                                                                   | 10–15%    |
| Moderate (a Speed line or two, a dodge line)                           | about 30% |
| Heavy: the right fast species, several lines, a golden Zoomies, fusion | near 50%  |

The cap should be hard to reach: the right creature, real investment and perhaps a golden talent roll.

### 2.3 Sources

None of these exist yet except Zoomies (`talents.json`, `+12%` Speed, golden `+18%`). Speed from gear is today "a share; only a talent gives it" (`gear-items.ts`).

- **New gear line "Fleet":** Speed, more (a share). A stat line, tiered like the others. _Start: 5 / 8 / 11 / 14 / 17%._
- **New gear line "Light-footed":** dodge, flat. A special line, Rare and up, like the chance lines. _Start: 2 / 3 / 4 / 5 / 6 points._
- **Sidestep folds into dodge:** today it is a separate roll that stops area hits (`combat-rules.md` 11.2). It becomes "+X points of dodge against area hits", so there is one dodge roll, not two.
- **Zoomies:** "Acts earlier when the boss goes by speed" becomes "Dodges more often", and it grows Speed as now.
- **Room modifiers:** the dungeon schema already allows `team_stat` on `spd`. New rooms can use it (2.8).

### 2.4 Which hits can be dodged

| Hit                                                                         | Dodge                                            | Why                                                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------- |
| Plain attack, a strike's first hit, a slam's main hit                       | Full chance                                      | The classic dodge                                                           |
| Area hits: row attack, sweep, barrage shell, lance, pincer, a slam's splash | Half chance (Sidestep's points added in full)    | Harder to get clear of a wave                                               |
| Chain jumps                                                                 | Each jump rolls; a dodge does not stop the chain | Chains keep working as today                                                |
| A charge landing (announced a round ahead)                                  | Full chance                                      | You saw it coming. Storm warning still cuts the damage if it lands          |
| **Enrage hit**                                                              | **Full chance**                                  | Misa: a creature that keeps dodging on a lucky streak is an exciting moment |
| A hit a reaction reflects back                                              | No                                               | It is the creature's own hit coming back (as Sidestep today)                |
| A hit a Guard steps in to take                                              | No                                               | The Guard chose to take it                                                  |

The Guard rule keeps two kinds of tank: Guards who take hits on purpose, and dodgers who avoid them. Without it a dodging Guard would soak every aimed hit for its row and take only half of them.

**Order in the hit (`combat-rules.md` 3):** the target is picked, a Guard steps in (or not), then the taker rolls dodge, before Shield Wall, armor, cover and crit. A dodged hit is logged as a `boss_hit` with `damage: 0` and `dodge`. Nothing that waits for a hit taken fires on it (Payback, Last stand, Stubborn, Rally cry).

### 2.5 Foes dodge too

Every boss and dungeon foe gets a Speed (`baseSpd`) and dodges by the same rule.

- **Speeds start low**, so foes dodge rarely: _start 2–5%_. A raid boss's Speed may grow with Boss Rank (`RULES.raid.curve`, a new column), like its HP and Attack.
- **A dodged creature hit** deals nothing: no damage, no crit, no Echo, no reaction.
- **Marks (Misa's rule):** a **Setter's** hit always leaves its mark, even when dodged. Any other creature's dodged hit leaves no mark (Quick re-mark included). A Payoff's dodged hit leaves the mark standing, since no reaction went off. This gives Setters a clear identity: the setup never misses.
- **Credit:** a dodged hit earns nothing; the mark a dodged Setter leaves is credited as setup as usual.

### 2.6 Things that fire on a dodge

New trigger lines (`combat-rules.md` 12), each writing a `proc` event:

| Line       | Moment          | Effect                                                                                         |
| ---------- | --------------- | ---------------------------------------------------------------------------------------------- |
| Riposte    | It dodges a hit | It strikes back at once for a share of its Attack (_start 30%_); no mark, no crit, no reaction |
| Momentum   | It dodges a hit | Its next turn hit deals this much more (replaces an earlier one, like Ember tail)              |
| Slipstream | It dodges a hit | The creature beside it with the most Attack gets a boost on its next hit                       |

Foes can get on-dodge moves later as boss gimmicks (a boss that counters when it dodges).

### 2.7 Counters to dodge

Players need tools before any foe dodges a lot, and so do bosses against a team of dodgers.

**Against dodgy foes** (good design space for Supports):

- A Support boost that also makes the boosted creature's next hit **sure** (it cannot be dodged).
- An aura that lowers the foe's dodge while a Support stands.
- A mark that slows the foe (it dodges less while marked).
- A future element built around slowing and freezing (Misa: "ice element incoming?").

**Against dodgy teams** (boss gimmicks):

- **Sure-hit moves** that cannot be dodged.
- A move that **lowers Speed** (Thornmother's vines tangle creatures up).

These make a Speed team strong on some weeks and weak on others, which suits a weekly raid.

### 2.8 Later, not in the first build

- **The cricket boss (Misa):** a tiny boss with low HP and very high Speed and dodge. It only works once players have the counters in 2.7; otherwise it drags out the round count.
- **Dungeon rooms:** "Fog" (more dodge for everyone), "Mud" (less Speed for the team).
- **Enrage escalation:** if dodge streaks make enrage last too long, the boss's damage grows each enrage round, so a hit that lands lands hard.
- **A Speed-focused species or role**, once the stat is worth building around.

## 3. Randomness

- **Dodge dice:** each round draws dodge dice at round start like every other die (`combat-rules.md` 9.2):
  - one per creature for each hit it can take that round, numbered by hit (as Sidestep's dice 6 to 9 are today);
  - one per creature turn and strike for the foe's dodge.
- **Old fights:** the dice are drawn only when dodge is on in the fight's stored rules (`luck.dodge`, absent = off), so a stored fight replays exactly and a fight without dodge draws what it always drew. The legacy digest test (`packages/sim/test/legacy-unchanged.test.ts`) must stay unchanged.
- **Sidestep's dice** (6 to 9) are retired once Sidestep is part of dodge; old fights that used them still replay with them.

## 4. Showing it

- **Creature page:** a "Dodge 14%" row under Speed, with the Speed it comes from (`CreaturePage.tsx`).
- **Boss card and foe card:** the foe's dodge.
- **Stage and replay:** "Dodged!" over the creature or boss, and the turn's sentence in the log (`describeEvent`).
- **Glossary:** "Dodge", "Serpentine"; Speed's entry says what it does now.
- **Gear and talent text:** Fleet, Light-footed, Riposte, Momentum, Slipstream, the new Sidestep and Zoomies.
- **Choosing teams:** the auto team, Equip best and the simulator score creatures by power (`talentScore` and friends). That score must count dodge, or they will ignore Speed builds.

## 5. Balance

- 50% dodge doubles a creature's real HP (1 / (1 − 0.5)). Boss Attack and move power are re-tuned so the targets in `balance-targets.md` still hold with typical dodge (about 12%) in the teams.
- Foe dodge cuts the team's damage by about the same share. Boss HP comes down to match.
- The simulator runs before and after, with seeded dice; the result goes in `docs/balance/log.md`.
- Enrage dodge is watched for long finales (2.8, enrage escalation).

## 6. Build order

One PR, one commit per slice:

1. **Serpentine:** engine order per round, content, Cinder Wyrm, glyph, glossary, boss card, Discord text, board preview. Tests for the order with gaps, uneven rows and enrage.
2. **Dodge in the engine:** the rules and dice behind a stored flag (off by default), the hit table in 2.4, the Setter mark rule, events. Tests, and the legacy digest unchanged.
3. **Foe Speed in content:** `baseSpd` for every boss and foe, and a Boss Rank column.
4. **Sources:** Fleet, Light-footed, Sidestep folded in, Zoomies text, power score.
5. **On-dodge lines:** Riposte, Momentum, Slipstream.
6. **Showing it:** creature page, boss card, stage, log, glossary.
7. **Balance pass** in the simulator, then dodge turned on.

Counters (2.7) and the later ideas (2.8) are a follow-up.
