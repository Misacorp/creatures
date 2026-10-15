# M3 design: combat engine, raid loot rules, balance simulator

Status: **draft for M3**. Numbers are starting values; the simulator tunes them against `balance-targets.md`. Rules Misa decided are in `decisions.md`.

## Principles

- **One engine** (`packages/engine`) runs live raids and simulations. It is pure (no I/O, no clock) and takes an injected `Rng` from `@creatures/game`.
- **Readable, low-luck combat.** The engine is deterministic apart from the injected RNG, and uses the RNG only for tie-breaks and gimmicks that say so. Player choices (team, placement, finale ability timing) decide fights, not dice.
- **Everything is data.** Bosses, gimmicks, abilities, reactions, finale abilities, loot tables and scaling live in schema-validated content. The engine interprets a small set of effect operations.
- **Every fight produces an event log** that the replay UI and the reports read. Events are plain JSON.

## The board

- One shared **row** of slots, ordered left to right. Each signed-up player places their 3 creatures; only the owner can move them.
- **Zones:** the row splits into three contiguous zones, **front** (left), **middle**, **back** (right). Front and back each get `floor(n / 3)` slots of an `n`-slot row; everything left goes to the middle (a row of 1 or 2 is all middle).
- **Adjacency:** a creature's neighbours are the slots directly left and right of it.
- **Guests:** with fewer than 3 players, the row is filled to 9 slots with NPC guest creatures (content-defined, level scaled to the players' average). Guests earn no loot.
- **Placement conflicts:** each slot holds one creature; first come, first served. Players coordinate in Discord. A player can offer a swap, and the other player accepts it (M4 UI). Unplaced creatures of signed-up players are auto-placed into free slots by a default rule (guards front, payoffs back, setters next to payoffs) **[Misa: absent players are auto-placed]**.

## Turn order

A boss (or modifier) sets one ordering for a fight: `left_to_right`, `right_to_left` or `speed` (highest Speed first, ties by position). The boss acts after every creature has acted in a round. The UI always shows the order as a portrait strip.

## Elements and marks

- Matchups: an attacker deals ×1.5 to an element it's strong against and ×0.75 to the one that's strong against it (`Tide > Ember > Grove > Spark > Tide`).
- **Marks:** the boss carries at most **one mark**. Each element has a mark: Tide → _Soaked_, Ember → _Scorched_, Grove → _Overgrown_, Spark → _Charged_.
- **Hit rules**, for each creature hit on the boss:
  1. If the boss has a mark and the hit's element is that mark's **trigger**, a **reaction** fires: the hit's damage is multiplied by ×4.5 (content: `multiplierBp`) and the mark is consumed. The "bonus" is the damage above the plain hit.
  2. Else, if the boss has no mark, the hit applies its element's mark.
  3. Else (the boss has a different mark): a **Setter** overwrites it with its own mark; others leave it.
- **Triggers:** Soaked ← Spark (_Overload_), Charged ← Grove (_Grounding_), Overgrown ← Ember (_Wildfire_), Scorched ← Tide (_Steam_).
- **Credit:** a reaction's bonus damage is split 60/40 between the creature that applied the mark (setup) and the one that triggered it (payoff) (`RULES.combat.setupShareBp`; it was 50/50 until the combined balance pass of 2026-10-13). Payoff creatures get an extra ×1.1 on reactions, combined with the ×4.5 into one multiplier of ×4.95 (one floor, in basis points). (Both numbers are tuned by the simulator; the first draft was ×2.5 and ×1.25.) The setup creature gets `floor(bonus x 60%)`, the payoff creature the rest. Credit only: the damage dealt does not change.

## Creatures in combat

- Effective stats come from `@creatures/game` (`effectiveStats`, including fusion), plus gear later.
- **Basic hit:** damage = Attack × matchup × (reaction multiplier if any).
- **Roles:**
  - **Setter:** overwrites marks (see above).
  - **Payoff:** ×1.25 on reactions.
  - **Support:** each round (if it is not silenced), gives its two neighbours +15% damage on their next hit. Buffs from the same supporter don't stack.
  - **Guard:** has +30% HP and takes single-target hits (the boss's normal attack and "strike" gimmicks) meant for others in its zone, first living guard in position order. It does not intercept zone-wide hits (`hit_zone`) or reflected damage. Its credit is the damage it actually took: all of what it absorbed for a neighbour, and (`RULES.combat.guardOwnCreditBp`, 100%) what hits aimed at the Guard itself did to it.
- **HP:** creatures can be knocked out and sit out the rest of the phase. Knocked-out creatures still keep their credit.

## Bosses

Content-defined:

- name, element, base HP, base Attack, turn order;
- **1–2 gimmicks** per phase;
- a Phase 2 **adaptation rule**;
- loot table id.

Gimmicks are data, built from effect operations. Examples for the four MVP bosses (placeholder names):

| Boss            | Element | Turn order    | Gimmicks                                                                                                                   |
| --------------- | ------- | ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Tidal Colossus  | Tide    | left to right | _Undertow_: every 3rd round (`every: N` fires on rounds N, 2N, 3N, ...), hits the whole front zone                         |
| Cinder Wyrm     | Ember   | speed         | _Backdraft_: the first reaction each round is reflected and damages the triggering creature instead of giving bonus damage |
| Thornmother     | Grove   | right to left | _Bramble Bind_: every 2nd round, the creatures at both ends of the row are silenced for their next turn                    |
| Storm Sovereign | Spark   | left to right | _Lightning Rod_: every round, strikes the creature with the highest Attack                                                 |

- **Normal boss attack** (each round, after any gimmick): hits one creature, picked by a rule (front zone first, guards first).
- **Targets are always living creatures.** A knocked-out creature is never picked by a boss or foe ability, so it cannot soak up a hit. Row ends are the leftmost and rightmost creature still standing; a zone attack whose zone has nobody standing lands on the nearest zone that has (front side first on a tie); the strongest is the strongest living creature; the plain attack goes to the front-most living creature; Guard cover and Support buffs only come from and go to living creatures.
- Bosses rotate weekly in content order.

## Raid structure (one boss, one week)

- The boss has **one HP pool for the whole week**: Phase 1, Phase 2 and the finale all chip away at it.
- **Phase 1** (Fri 13:37, auto): 10 rounds. **Phase 2** (Sat 13:37, auto): 10 rounds. **Finale** (Sun 20:00, live): 12 rounds of about 10 seconds (2 minutes, configurable per boss, at most 5 minutes) **[Misa]**.
- **Clear thresholds** (config): Phase 1 is cleared when the pool is down 18%; Phase 2 when it's down 52%; the finale when the boss is defeated (tuned from 30% / 60% by the simulator; see `docs/balance/`; Phase 2 moved from 54% to 52% in the progression pass).
- **Phase 2 adaptation:** after Phase 1 the boss gains one counter, chosen by a plain-language rule shown to players. Example: "the reaction you used most is resisted 50%", or "the element that dealt most damage is resisted 25%". It is stored in the event log.
- **Finale abilities:** now built from effects and from the players' creatures: see `creature-abilities.md` (the current spec). In short:
  - Each player picks one **basic** ability before the finale (Rally, Shield Wall, Re-mark or Purge), deliberately weak. They are the four effect operations at small values: Rally +10% for 1 round, Shield Wall 50% less damage in a chosen zone for 1 round, Re-mark a chosen element, Purge for 2 rounds.
  - Every creature in the raid team of 3 at level 10 or above also brings its species' **creature ability** (one use, a stronger form after evolving). Creature abilities combine up to 3 effects: `rally`, `shield_wall`, `re_mark`, `purge` and `strike`.
  - Each ability has a **default round** **[Misa]** (Rally 6, Shield Wall on the boss's first zone attack from round 2 on else round 3, Re-mark 4, Purge 2; creature abilities set their own). A present player fires theirs whenever they choose; an absent player's fires at its default round, at full strength **[Misa]**. Timing rules for the live finale are in `m5-finale.md`.

- **Scaling:** boss HP = `baseHp × N^e × rankFactor`, where N is the number of signed-up players (minimum 1; guests fill the row), `e` is the boss's own head-count exponent (`hpExponent` in the boss content, else `RULES.raid.scaling.hpExponent`) and `rankFactor` is the server's Boss Rank ladder (compounding `rankStepBp` per rank above 1). Boss Attack follows the rank factor at half strength (`atkRankShareBp`) and ignores the head count. **Creature levels no longer move the boss** (the old per-average-level factor is gone; see `progression.md`). Every signed-up player counts once, so one veteran adds exactly what a newcomer adds and no per-player cap is needed. The exponent can sit above 1 because bigger servers earn more Bait per player and cover more elements; each boss gets the exponent that keeps its odds flat from 5 to 15 players. All of these are config (`RULES.raid.scaling`, `RULES.progression`) and content.

## Contribution and loot (pure rules in `@creatures/game`)

- **Contribution** per player = own damage + setup credit + support credit + guard credit (damage absorbed). Setup and support credit are **zero-sum**: the bonus damage they cause moves from the hitter's credit to the setter's or supporter's, so contributions add up to the damage dealt plus the damage guards absorbed.
- **Soft cap:** a player's share of total contribution counts fully up to 35%; above that it counts at half rate, for loot weighting only. Damage itself is unchanged.
- **Essence** (needed to evolve) per cleared stage:
  - Phase 1 cleared: 10 Essence to everyone who signed up.
  - Phase 2 cleared: +15.
  - Finale won: +25.

  Plus a contribution-weighted pool per stage worth 3/7 of that stage's flat total (`poolBp` 4286), split with largest-remainder rounding so it is paid out exactly. That makes about 70% flat and 30% contribution across the week.

- **Gear rolls** (gear arrives with the gear step): one roll per cleared stage, rarity weighted by contribution share.
- **Jackpot** (finale win only): each signed-up player rolls 6%. Pity: +8 points per finale win without a jackpot from the 5th win on; guaranteed at the 10th. The counter advances only on a finale **win** (a lost finale changes nothing), never resets for skipping a week, and is shown privately **[Misa]**.
- **First on server:** everyone who gets a jackpot item from the same finale shares the record **[Misa]**.

## Mutator hooks (for seasonal features)

- The engine raises named hook points: `onFightStart`, `onRoundStart`, `onBeforeHit`, `onReaction`, `onKnockout`, `onRoundEnd`, `onFightEnd`.
- A **mutator** is a named module registered in code and switched on by a feature flag in content (`mutators: ["season-2026-11-frost"]`). Mutators can change the numbers flowing through a hook, but can't reach outside the fight.
- Disabled mutators never run. Each one is tested in isolation and can be turned off with a content change.

## Event log

A fight returns:

```ts
{ seed, rounds, bossHpStart, bossHpEnd, cleared, events: FightEvent[], perPlayer: {...}, perCreature: {...} }
```

`FightEvent` covers: round start, turn, hit (with matchup and mark state), mark applied, reaction (with setter and payoff), gimmick, knockout, silence, ability fired, adaptation, round end.

- The **live** server draws a fresh 128-bit seed from `crypto.getRandomValues` at the moment a phase resolves, runs the engine and stores the seed and inputs. Replays re-run the engine from the stored seed. Players can't predict outcomes because the seed doesn't exist before the phase runs.

## Balance simulator (`packages/sim`, CLI)

- **Economy sim** over N weeks. Players follow archetype policies:
  - **casual:** leets 2 days a week;
  - **daily:** 6 of 7 days;
  - **top earner:** every day;
  - **newcomer:** joins in week 4.

  Group sizes per day follow from who leets. A simple spending policy (expeditions vs training) produces rosters per week.

- **Raid sim:** for player counts 1, 5, 10 and 15 and each boss:
  - mixed-archetype groups with heuristic team picks and placements;
  - many seeded runs;
  - finale abilities at their default rounds: each player's basic ability (round-robin) plus the creature abilities of their team at level 10 or above.
- **Report** (Markdown):
  - clear rates per phase and boss;
  - damage and contribution share per player and archetype;
  - creature and element pick and performance;
  - reaction frequency;
  - Essence, gear and jackpot distribution, and pity triggers;
  - outliers (dominant creatures, dead elements, unbeatable or trivial bosses);
  - **violations** of `balance-targets.md`.
- **CI:** a fast smoke run (small sample, fixed seeds) on PRs that touch `packages/game`, `packages/engine` or content. The full run is on demand (`pnpm sim`).
