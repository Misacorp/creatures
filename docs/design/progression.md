# Week-by-week progression: design check and proposal

Status: **decided and built 2026-10-11**: the rules, content and simulator (phase 1, see "Phase 1: what was built") and the worker and client (phase 2, see "Phase 2: what was built"). Misa's answers (decisions log): ladder yes, no Resolve, Festival weeks with festival-only loot, season reset tied to the festival cycle, vague readiness band, after-action stats without advice. Originally a proposal for Misa, 2026-10-11. Based on a research pass, summarised here with sources at the end, plus `docs/design/luck.md`.

## The question

Misa's view: a fight being roughly predictable is fine. The game is about growing stronger week by week and taking another shot at a similar challenge after a miss. Bosses should form a path of rising difficulty as players grow, and players should keep agency. Crits go in regardless. Does this hold up, and how should it be built?

## What the evidence says

1. **Long-lived weekly games almost never scale the boss to the players' current power.**
   - They fix the difficulty per tier or cycle and let players outgrow it. Examples: WoW raid tiers, Genshin's Spiral Abyss, Honkai Star Rail, Pokémon GO raid tiers.
   - Alternatively they offer a **visible ladder** with steps: WoW Mythic+ keys, Slay the Spire's Ascension, Arknights' risk levels.
   - Outgrowing content _is_ the feeling of progress.
   - Our current rule (the boss grows 12% per average creature level) is hidden dynamic difficulty. Players train, the boss follows, and nothing visibly improves. Hunicke's work on dynamic difficulty warns about exactly this: it takes control away and feels cheap when noticed.
2. **Pacing should be a sawtooth:** build-up, peak, relief.
   - The week already does this (Monday reveal, Friday and Saturday scouting, Sunday climax).
   - What's missing is relief between weeks after a loss, and occasional easier weeks.
3. **Losses keep players only when they read as "fixable by us".**
   - Juul's work on failure: a loss should feel internal, specific and fixable. A deterministic loss with a clear reason is fine.
   - A loss to pure luck protects morale but teaches nothing.
   - Never fake near-misses (Clark et al. on near-miss effects).
4. **Players respect randomness they can see before deciding; randomness after the decision adds little depth.**
   - Burgun calls these input and output randomness.
   - A predictable fight is fine **when players can plan around it**, like a puzzle. It is dull when they can't see or influence the result.
   - Crits are output randomness. They add flavour and stat depth, but hundreds of hits average them out (`luck.md`).
5. **Co-op for small groups:**
   - Treat the team as "the player" (Valve, Left 4 Dead).
   - No public naming of the weakest member.
   - Absent and weaker members still earn a smaller reward (Clash Royale, Pokémon GO). We already do this.
6. **Show odds as bands or frequencies, not decimals.** People read probabilities poorly. Always show pity. (Superseded for the jackpot by Misa on 2026-10-11: the jackpot and its pity are hidden from players; see `decisions.md`.)

**Verdict:** Misa's view holds. Predictable fights are fine if the week-to-week path is visible and honest. The current "boss follows your level" scaling works against it, and should be replaced with a visible difficulty ladder.

## Proposal

### 1. Boss Rank: a visible per-server ladder

- Every week's boss shows a **Rank**, for example "Cinder Wyrm · Rank 7", on the Monday post and the boss card.
- **Superseded (2026-10-15, B-010):** the 1.4x compounding step is gone. Boss HP, Attack, plain attacks a round and boss crit chance now come from a per-rank table, `RULES.raid.curve`, designed from the simulated player progression (the rank-gated moves are the other half). The original step, below, is kept as history: it let a server collect too many wins in weeks 2 to 6 and then outgrew every roster.
- **Scaling by average level is gone.** Head-count scaling stays (bigger rosters face a bigger boss), so 15-player raids stay fair. Every signed-up player counts once, whatever their level, so one veteran cannot inflate the boss: no per-player cap is needed because there is no per-player weight to cap.
- A new server starts at rank 1 (`placementRank`, which no longer looks at levels; B-010). After that, only the ladder moves it.
- Phase 1 stays gentle (clear >= 95%). Rank mostly bites in Phase 2 and the finale.

### 2. The ladder rule

| Result                    | Next week                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------ |
| Finale won (normal week)  | Rank +1                                                                              |
| Finale lost               | Same rank. No demotion, no Resolve [Misa]                                            |
| Festival week, either way | The Festival boss fights at rank - 3; afterwards the rank eases by 1 (never below 1) |

- "Another shot at a similar challenge" is exactly what Misa asked for: players grow their creatures and face a boss of the same rank.
- A ladder that only goes up on a win settles where wins and the season reset balance. Over a season (4 normal weeks and a Festival) the rank rises by the number of wins and falls by the reset, so in the long run a server wins `reset / 4` of its normal weeks plus whatever its growth adds, whatever the randomness. That is why the season reset is the control for the long-run win rate (see the numbers below).
- A Festival win does not raise the rank. A week in which no finale was played changes nothing.

### 3. Rewards scale with rank

- Higher rank pays more Essence and slightly better jackpot rewards. Otherwise "we won, so it's harder" feels like a punishment.
- The server's **highest rank cleared** is a trophy in the Discord post.

### 4. Relief on a schedule

- A season is **4 normal weeks and a Festival week** (the 5th), computed from the global week index (`seasonOf`), so every server shares the calendar and nothing is stored. The Festival is the sawtooth's relax phase: the boss fights 3 ranks lower, Essence pays +50%, and a win grants each participant the season's **Festival creature** (festival-only: never on expeditions; the two take turns by season).
- After every Festival the server's rank **eases by 1** (the season reset), never below 1. It also keeps a stalled server from being stuck for ever.

### 5. Make predictability a puzzle

- **Readiness band** on the boss card: Long shot / Even / Likely / Strong.
  - The server computes it by simulating the current team many times with fresh, separate randomness. It never uses or reveals the real fight's seed.
  - It is recomputed after Friday's and Saturday's results.
  - It is shown as "about 6 Sundays in 10", never as a decimal.
- **What-if:** moving a creature or swapping the team updates the band. This is where a predictable fight becomes planning.
- **Weekly twist** (later), shown at Monday's reveal, for example "Frostbite: Tide creatures +20%". It is variety players can plan around (input randomness).

### 6. A miss should feel like progress

- An honest after-action card: "The boss had 4% left."
- ~~Plus one concrete fixable cause, found by replaying the stored fight with one change.~~ Dropped: Misa wants the stats without advice.
- No fake near-misses.
- Every miss still pays the stages' Essence.
- Team-level results only. Top contributors are celebrated; nobody is named as the weakest.

### 7. Luck

- **Crits are in [Misa]**: a 5% baseline, crit stats with caps, boss crits. Mostly flavour and build depth; they won't make outcomes very random on their own.
- **Fortune streaks:** not needed for the auto-resolved Friday and Saturday phases; those stay predictable, as scouting.
- In the live finale, a visible streak could be added later if Sundays feel too predictable. It is reactable, so it rewards timing.
- With a ladder and a readiness band, a fight's result being mostly set in advance is acceptable.

### 8. Veterans and newcomers

- **Newcomers** join at the server's rank. Their weight in boss scaling is capped, catch-up training already exists, and guests and auto-placement help.
- **Veterans** get variety at high ranks: new boss mechanics, not just bigger numbers (WoW's Mythic lesson).
- Optional **stretch goals** per fight (no knockouts, best setup) pay cosmetics or bragging rights, never power.

## Order of work (status)

1. Crits on and boss HP retuned per boss and per group size. **Done in phase 1.**
2. Ladder rule and Festival weeks in the simulator (no Resolve). **Done in phase 1.** Targets (final values in `balance-targets.md`):
   - long-run finale win rate per server, Festivals included, 40-60%;
   - Festival finale win rate at least 70%;
   - median weeks between rank-ups 2-4;
   - at most 10% of servers with a loss streak over 4 weeks;
   - rank spread between typical and 15-player servers: information only.
3. Boss Rank on the server and the Monday post; rank-scaled rewards; Festival weeks and the Festival creature. **Done in phase 2 (worker and client).**
4. Readiness band (rules and calibration in phase 1, server and client in phase 2) and what-if. **Done**; the band follows team and placement changes within 30 seconds.
5. After-action card (built, stats only; the one-change replay was dropped by Misa).
6. Weekly twists; stretch goals. (The season reset is done.)

## Decisions for Misa (game feel): answered, see the decisions log

1. **Ladder** instead of "boss follows your level": yes or no?
2. **On a loss:** Resolve (a visible +X% next week, up to 3 times), rank −1 after two misses, or both? (Answered: neither.)
3. **Festival weeks** every 4th or 5th week: yes or no?
4. **Readiness band** on the boss card: yes or no? Some may prefer not knowing.
5. **Season reset** every few months: yes or no?

## Sources

- Hunicke & Chapman, _AI for Dynamic Difficulty Adjustment in Games_: https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf
- Valve, _Replayable Cooperative Game Design: Left 4 Dead_ (GDC 2009): https://cdn.fastly.steamstatic.com/apps/valve/2009/GDC2009_ReplayableCooperativeGameDesign_Left4Dead.pdf
- Burgun, _Randomness and Game Design_ (Game Developer): https://gamedeveloper.com/design/randomness-and-game-design
- Supercell, Clash of Clans war matchmaking: https://supercell.com/en/games/clashofclans/blog/news/clan-war-matchmaking-improvements/
- Supercell, Clash Royale Clan Wars 2: https://supercell.com/en/games/clashroyale/blog/release-notes/clan-wars-2-is-here/
- Niantic, raid rebalance: https://pokemongo.com/en/post/raid-trainerbattle-rebalance
- Secondary sources:
  - WoW raid tiers and Mythic+ (Engadget, Warcraft Wiki);
  - Genshin Spiral Abyss and Honkai Star Rail (wikis);
  - Arknights Contingency Contract (wiki);
  - Clark et al. 2009 on near-misses (PMC);
  - Juul, _The Art of Failure_ (review).

## Phase 1: what was built (rules, content, simulator)

Code: `packages/game/src/rules/progression.ts` (rank, seasons, rewards, Festival creature, readiness band), `packages/engine/src/scaling.ts` (`scaleBoss(boss, players, rank)`) and `forecast.ts` (`forecastFinale`, `forecastWeek`), content (two Festival species, per-boss exponents), `packages/sim` (ladder in the economy sim, long-run model, readiness calibration, tuning tools). Numbers are in `RULES.raid.scaling`, `RULES.progression` and `RULES.combat.luck`; the measurements are in `docs/balance/report-2026-10-11-progression.md`.

| Setting                      | Value                                                                                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crits                        | On: 5% chance, +50% damage for every creature and for the boss; species bonus (+5% / +25%) kept; caps 30% / +150%. Fortune streaks and spread stay in the code, off. Boss Attack x1          |
| Boss HP                      | `baseHp x N^e x rankFactor`; `N` = signed-up players; `e` per boss (1.04 to 1.21, see below)                                                                                                 |
| Rank factor                  | The curve's `hpBp` for the rank (`RULES.raid.curve`, a table from rank 1; gentle extrapolation past it), capped at rank 30. It was +40% compounding per rank (`rankStepBp` 4000) until B-010 |
| Boss Attack                  | `baseAtk x` the curve's `atkBp` for the rank (independent of HP); not scaled by head count. The curve also sets the boss's plain attacks a round and a crit bonus                            |
| Placement (new server, once) | Rank 1 (`RULES.progression.placement.startRank`), whatever the creatures; it was the rank closest to the old per-level rule until B-010                                                      |
| Win / loss                   | Normal week: win +1, loss 0. Never below 1. No Resolve, no demotion                                                                                                                          |
| Season                       | 5 weeks: 4 normal and a Festival (global week index mod 5 = 4)                                                                                                                               |
| Festival                     | Boss at rank - 3 (`festivalEaseRanks`), Essence +50% (`festivalEssenceBp` 5000), win grants the creature, no rank gain                                                                       |
| After a Festival             | Rank - 1 (`seasonResetRanks`), never below 1                                                                                                                                                 |
| Rewards                      | Essence and jackpot x (1 + 6% per rank above 1), capped at x2 (`rankRewardBp` 600, `rankRewardCapBp` 20000); Festival on top; follows the server rank, not the eased one                     |
| Phase 2 clear threshold      | 52% of the pool (was 54%), see the report                                                                                                                                                    |
| Readiness band               | Long shot / Even / Likely / Strong from the margin (mean finale damage over HP left) at 8000 / 8800 / 10300 basis points; 5 fresh seeds                                                      |

**Why the step is 40%.** In the long run a server's wins are its rank gains plus the resets: over 30 weeks `wins = (final rank - placement) + resets`. A server grows about 3.5 times stronger over its first weeks, and a rank costs the boss's step, so a small step means many ranks to climb and a long unbroken run of wins. At +20% a rank the simulator gave 65% of finales won over 30 weeks and a median of 1 week between rank-ups; at +40% it gives 54% and 2. A big step also makes each rank-up a real event. The cost: after a rank-up the next boss is 40% bigger, so most servers settle on a wall of 5 or 6 within three months, win the Festival, drop one rank and climb back.

**Why the head count stays weight-neutral.** `scaleBoss` takes only a player count: a veteran adds exactly the HP a newcomer adds, so one strong player cannot inflate the boss for everyone, and there is no per-player cap to tune.

**Per-boss exponents.** One exponent could not keep every boss flat from 5 to 15 players: Cinder Wyrm's Backdraft matters less with many creatures, Thornmother's resisted reaction matters more. Each boss now carries its own `hpExponent`, fitted on four seeds (`node packages/sim/scripts/tune.mjs --calibrate 5 --seeds 4`).

**Festival creatures.** Lanternfin (tide, epic, support: Lantern Glow re-marks Soaked and rallies +7% for 2 rounds) and Hearthshell (ember, epic, guard: Hearth Ward gives its zone 70% less damage for 3 rounds and rallies +7%). Both are single-stage, level cap 30, `festival: true`, never catchable. The creature of a Festival is `festivalCreatureFor(weekIndex)`: the festival species in content order by season index, so Lanternfin, then Hearthshell, and so on. A repeat is the usual duplicate: fuse up to 5 times, then Bait by rarity (`festivalGrantOutcome`).

## Phase 2: what was built (worker and client)

Code: `apps/worker/src/raid-ladder.ts` (stored rank, placement, ladder update), `raid-festival.ts` (the Festival grant), `raid-readiness.ts` (the band and its cache), `raid-progression-migration.ts` (migration 12), and changes in `raid.ts`, `raid-resolve.ts`, `raid-view.ts`, `raid-reveal.ts`, `raid-live-view.ts`, `raid-posts.ts`, `discord-format.ts`; client in `raid-progress.ts`, `RaidInfo.tsx` (boss card), `Reveal.tsx`, `Collection.tsx`, `raid-api.ts`, `live-api.ts`. Interpretations and the reasons are in the decisions log ("Progression, phase 2").

- **Placement** happens once, as soon as a week has a roster (usually when the week opens; on a brand-new server when its first player joins). Existing servers are placed when their next week is created. The week that is open at deploy keeps its stored pool and old rules if Phase 1 has already resolved; if not, it is ranked (the server is placed if needed) at its Phase 1.
- **Each week** stores its plan when it is created: rank, the eased rank a Festival boss fights at, whether it is a Festival, its season and the Festival creature. The boss is scaled once, at Phase 1, from the head count and the stored effective rank (`scaleBoss`). Every fight input carries `RULES.combat.luck`.
- **Payouts** use the week's rank and Festival flag for every stage's Essence and for the jackpot (`essenceForStage`, `jackpotEssenceFor`), and the numbers shown (reveal, live loot, Discord post) come from the same function.
- **After the finale** has resolved for every party that has members, once: the server won if at least half of the parties won; then `nextRank`. A normal-week win records the best rank. A week with no finale changes nothing.
- **Festival creature:** every member of a winning party gets the week's species (a new level 1 creature, a fusion, or Bait), once per player and week, and "first on server" is recorded with the new kind `festival`.
- **Readiness band:** `forecastWeek` (Monday to Friday) or `forecastFinale` (after Saturday) with a fresh crypto Rng, cached per party, only the band is sent (`party.readiness`).

`GET /api/raid` gains `rank`, `effectiveRank`, `festival`, `festivalCreature`, `season: { index, week }`, `bestRank` and `party.readiness`; `you.reveal` and the live finale's `loot` gain `rankChange` and `festivalGrant`. A week that was open before the ladder existed has `rank`, `effectiveRank` and `season` null.
