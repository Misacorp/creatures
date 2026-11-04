# Phase 5 plan: simulation and balance on combat v2

Status: planned, 2026-11-04. Phase 5 of `roadmap.md`: a journey simulator on engine v2 (the Boss Rank curve, dungeon depths, week-by-week progress per play style, the raid weekend with attrition) and one balance pass, spiky, not flat (P-10). Gate (roadmap): weekly raid win rates in band at each rank, the classic trio not best everywhere, diversity of winning teams, no dead Knack. Misa's part: choose where numbers trade against feel.

## 1. Which simulator

Two simulators exist today:

|             | The journey sim (`packages/sim`)                                        | The lab's path (`packages/lab`, `--path`)                                                   |
| ----------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Engine      | v1 only (`simulateFight`, `simulateDungeonRoom`)                        | v2 (`fightV2`, `weekendV2`)                                                                 |
| Raid        | v1 phases, floors, the v1 Boss Rank curve                               | the boss track, slots and cards, the young-server ramp, attrition, Determination, Festivals |
| Roster      | earned: XP, levels, gear, v1 talents, catches, the economy hour by hour | given: the valley's roster profile (levels per week by player kind)                         |
| Dungeon     | depth progression per player and day                                    | one fight per foe and depth; map runs at fixed depths; no progression                       |
| Play styles | four journey presets and server mixes                                   | dedicated, mixed and builder servers at three speeds                                        |

**Phase 5 builds on the lab's path, not on the journey sim.** The journey sim's strength comes from the v1 economy and v1 combat, and the valley is redesigning that economy: the valley owns the roster (how fast a server's players grow), combat v2 owns the challenges (decision `2026-10-30-the-boss-track-is-tuned-against`). Porting the journey sim's economy to v2 would rebuild what the valley replaces.

**The journey sim stays as it is** for the live game: production plays v1 until phase 8, and the balance loop (`balance-review`, `pnpm sim:live`) reads it. Its combat targets (`raid-*`, `curve-*`, `longrun-*`) retire when v2 ships.

## 2. What the v2 journey simulator adds to the lab's path

The path walks servers week by week on the track with the valley's roster. It becomes the v2 journey simulator by adding:

1. **The worker's raid rules, shared, not copied.** The arena pieces and seats per player, players locking at stage 1, the spare column, Knacks and talents locked once fought, and replacements between stages from each player's own spares. They are drawn from the same code the worker runs where possible (the engine's `stageV2`, the track's boss), so the simulator cannot drift from the game.
2. **Real party sizes.** The servers' players per week from the valley's coverage (mixed 5, 8 and 15), not only four columns; small parties (one to three players) per question 1.
3. **Players' choices as policies.**
   - **Knacks:** the best for the board, the first one known, or none.
   - **Talents:** rolled from the line pools over the weeks, golden at the game's chance, learned at the valley's rate.
   - **Placements:** following the board, or random.
   - **Replacements:** whether a player brings a spare after a knock-out.
   - **The finale's action:** Rally, Shield Wall or Purge, at the auto-fire rounds.
4. **The dungeon over days.**
   - Each player's daily run on the v2 rooms (the map, the camp, the Undercroft), at the valley's levels.
   - Depth growth per week, first-week clears and descent rates measured against today's dungeon targets.
5. **Rewards out, not in.**
   - Each stage's and room's Essence, XP and gear are recorded and compared with what the valley's roster assumes (about 120 XP a day from the dungeon and 70 from the raid for a top creature; `boss-track.md`, "Touch points").
   - The simulator does not feed them back into levels: that loop is the valley's. A mismatch goes to the valley session as numbers.
6. **The v2 reward shape** per question 2.

## 3. What is measured (the gate and the rest)

Each is a report section and, where it gates, a lab test with its threshold in `targets.ts`.

- **Raid by rank** (the gate):
  - the kill and the weekends to kill per slot, for dedicated, mixed and builder servers at the three speeds;
  - the stuck share (more than four weekends on one boss, at most 10% of servers);
  - Determination on from the second lap.
- **The classic trio not best everywhere** (the gate): the classic line loses on most cards (P-11), now on real party sizes.
- **Diversity of winning teams** (the gate):
  - how many different lines, element sets and Knack families win each boss;
  - the share of the winning weight the top line holds.
- **No dead Knack** (the gate): every Knack picked somewhere by the best-for-board policy, scored on damage potential (the raid searches saturate at a kill; lab follow-up, panel 6 finding 22).
- **The casual metric:** creatures used beyond each player's top three, at 1.5 (phase 1 accepted 1.41 and set 1.5 for phase 5).
- **The dungeon:** depth growth, first-week clears, descent rate, fights per run.
- **Talents' share**, the reaction cap, crit lines, and golden's effect.
- **The finale's actions:** what each is worth, so none is worth more than its intent.
- **Rewards against the valley's assumptions** (section 2.5).
- **Small parties and wide ones:** one to three players, and fifteen.
- **CPU:** the worst stage and finale replay at fifteen players stay under the Free plan's limit (`integration.md`, section 8).

## 4. The balance pass

One pass, spiky, not flat (P-10): bosses ask different things, and a few strong builds come from investment. **Agents change rules and content; the tuners set the numbers** (as in phase 1): the track tuner (`--tune --track --write`) and the boss tuner re-run on the v2 journey's rosters and party sizes. A target the tuners cannot reach is a content problem, never a looser threshold. Where a number trades against feel (a boss that feels unfair, a Knack that is right but dull), the choice goes to Misa with the measured options.

Folded into the pass, from the lab's follow-ups and phase 4's open items:

- the track's three misses (mixed kills at slots 8, 11 and 14);
- slow servers getting stuck;
- deep ranks running out of creatures before the finale (attrition with real replacements);
- second answers for the 11 cards with one answer (P-13);
- the Tidal Colossus's and Old Bogback's second answers;
- the gear model and gear's effect lines (`gear-plan.md`: stat lines count today, effect lines do not);
- weather in v2 fights (question 3);
- Culling Strike stays an enabler: not buffed for its solo value (decision `2026-11-03-culling-strike-stays-as-an-enabler`).

## 5. Order of the work

1. **The shared raid rules in the simulator**: seats, locks, the spare, replacements, real party sizes; the path's results rerun and compared with today's.
2. **Policies**: Knacks, talents from pools, placement, the finale's action.
3. **The dungeon over days.**
4. **Rewards recorded** against the valley's assumptions.
5. **The report sections and gate tests** (section 3).
6. **The balance pass** (section 4), with Misa's choices.
7. **Lab speed:** the lab's tests run in about 20 s, double their 10 s budget; move the slow measurements to the report so the suite stays fast as the simulator grows.

## 6. Not in phase 5

- The economy: income, trips, crafting and catches are the valley's.
- Production: the flag stays off until phase 8.
- Migration: phase 6 converts nothing (the game resets).
- New species or bosses.
- The six unreviewed icons; they come back when Misa wants them.

## 7. Questions for Misa

1. **Small parties (one to three players).**
   - Proposal: the boss shrinks with the party (its HP and its arena follow the players, as the curve already allows), so two friends fight a smaller boss.
   - Alternative: simulated guests fill the party up to four (today's v1 rule).
2. **Raid rewards on v2.**
   - Proposal: pay each stage by the share of the weekend's HP it removed, plus a kill bonus. HP removed is the raid's measure (decision `2026-10-30-a-failed-raid-boss-returns-next`).
   - Alternative: keep today's stage-clear tiers (30% and 85% of the HP), copied from v1.
3. **Weather in v2 fights.**
   - Proposal: measure the Boons and Omens in the lab, and keep only those that change a choice, not just a number.
   - Alternative: drop weather from fights for good, and keep it for the valley's other systems.

## 8. Progress

| Step | State              |
| ---- | ------------------ |
| Plan | Done (2026-11-04). |
