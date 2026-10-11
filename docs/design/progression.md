# Week-by-week progression: design check and proposal

Status: **proposal for Misa**, 2026-10-11. Based on a research pass, summarised here with sources at the end, plus `docs/design/luck.md`.

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
6. **Show odds as bands or frequencies, not decimals.** People read probabilities poorly. Always show pity.

**Verdict:** Misa's view holds. Predictable fights are fine if the week-to-week path is visible and honest. The current "boss follows your level" scaling works against it, and should be replaced with a visible difficulty ladder.

## Proposal

### 1. Boss Rank: a visible per-server ladder

- Every week's boss shows a **Rank**, for example "Cinder Wyrm · Rank 7", on the Monday post and the boss card.
- Each rank adds a fixed step of boss HP and damage, starting around +8% per rank. The simulator sets the real number.
- **Scaling by average level goes away.** Head-count scaling stays (bigger rosters face a bigger boss), so 15-player raids stay fair. Each player's weight is capped, so one veteran can't inflate the boss for everyone.
- A new server gets a starting rank from its current roster once. After that, only the ladder moves it.
- Phase 1 stays gentle (clear ≥95%). Rank mostly bites in Phase 2 and the finale.

### 2. The ladder rule

| Result                | Next week                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Finale won            | Rank +1                                                                                                                   |
| Finale lost           | Same rank, and the team gains **Resolve**: +X% damage next week, shown on the boss card, stacks up to 3, cleared on a win |
| Three misses in a row | Resolve is maxed. Optionally rank −1 as a last resort, so a server can never get stuck                                    |

- "Another shot at a similar challenge" is exactly what Misa asked for, and Resolve makes each retry visibly a bit easier.
- That is honest, visible catch-up instead of a hidden rubber band.
- A ladder that only goes "+1 on a win, stay on a miss" would settle at a low win rate, about 30% before player growth. Resolve and weekly growth lift it.
- The simulator tunes the step and Resolve so a typical server wins about half its finales and climbs a rank every few weeks.

### 3. Rewards scale with rank

- Higher rank pays more Essence and slightly better jackpot rewards. Otherwise "we won, so it's harder" feels like a punishment.
- The server's **highest rank cleared** is a trophy in the Discord post.

### 4. Relief on a schedule

- Every 4th or 5th week is a **Festival** week: an easier variant (rank −2) with bonus Essence. This is the sawtooth's relax phase.
- A gentle **season reset** (for example every 3 months, back about 3 ranks) keeps old servers reachable for new and returning players.

### 5. Make predictability a puzzle

- **Readiness band** on the boss card: Long shot / Even / Likely / Strong.
  - The server computes it by simulating the current team many times with fresh, separate randomness. It never uses or reveals the real fight's seed.
  - It is recomputed after Friday's and Saturday's results.
  - It is shown as "about 6 Sundays in 10", never as a decimal.
- **What-if:** moving a creature or swapping the team updates the band. This is where a predictable fight becomes planning.
- **Weekly twist**, shown at Monday's reveal, for example "Frostbite: Tide creatures +20%". It is variety players can plan around (input randomness).

### 6. A miss should feel like progress

- An honest after-action card: "The boss had 4% left."
- Plus one concrete fixable cause, found by replaying the stored fight with one change: "With Rally in round 4 instead of 8, you'd have won."
- No fake near-misses.
- Every miss still pays the stages' Essence, plus Resolve for next week.
- Team-level results only. Top contributors are celebrated; nobody is named as the weakest.

### 7. Luck

- **Crits are in [Misa]**: a 5% baseline, crit stats with caps, boss crits. Mostly flavour and build depth; they won't make outcomes very random on their own.
- **Fortune streaks:** not needed for the auto-resolved Friday and Saturday phases; those stay predictable, as scouting.
- In the live finale, a visible streak could be added later if Sundays feel too predictable. It is reactable, so it rewards timing.
- With a ladder, a readiness band and Resolve, a fight's result being mostly set in advance is acceptable.

### 8. Veterans and newcomers

- **Newcomers** join at the server's rank. Their weight in boss scaling is capped, catch-up training already exists, and guests and auto-placement help.
- **Veterans** get variety at high ranks: new boss mechanics, not just bigger numbers (WoW's Mythic lesson).
- Optional **stretch goals** per fight (no knockouts, best setup) pay cosmetics or bragging rights, never power.

## Order of work

1. Crits (in progress), then retune boss HP per boss and per group size. `luck.md` found up to 27% spread between bosses with luck enabled, so this fix comes before any ladder.
2. Ladder rule, Resolve and Festival weeks in the simulator. New targets:
   - finale win rate per server about 45–60%;
   - median weeks per rank about 2–4;
   - share of weeks at the floor rank;
   - no server stuck for more than 4 weeks.
3. Boss Rank on the server and the Monday post; rank-scaled rewards.
4. Readiness band and what-if.
5. After-action card with the one-change replay.
6. Weekly twists; season reset; stretch goals.

## Decisions for Misa (game feel)

1. **Ladder** instead of "boss follows your level": yes or no?
2. **On a loss:** Resolve (a visible +X% next week, up to 3 times), rank −1 after two misses, or both?
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
