_Creature abilities, phase 1 (content, engine, simulator, pity rule). Seed `leet`, 12 weeks, 200 raid weeks per cell, 24 economy sims per player count, 40 twenty-week pity sims (`pnpm sim`). "Before" is the same full run on the `creature-abilities` branch head (the balance-2 numbers), "after" is this change. Targets are unchanged (`packages/sim/targets.json`)._

# Balance pass 3: creature abilities and wins-only pity

**Result: 19 passed / 2 failed before, 21 passed / 0 failed after** (full run). Five more seeds (`a` to `e`) pass 21, 21, 21, 20 and 20. Seed `d` has a 15-player finale at 71% (needs at most 65%). Seed `e` has Ashmole at 0.48x of its rarity median (needs at least 0.60x); that support is almost never picked, the same kind of noise the previous pass saw. The finale and Phase 2 targets are sensitive to boss HP (1% of HP moves Phase 2 by about 3 points), so re-check them after the next content change.

## Before and after

| Target                                     | Required | Before | After |
| ------------------------------------------ | -------- | ------ | ----- |
| Phase 1 clear, typical group               | >= 95%   | 100%   | 100%  |
| Phase 2 clear, typical group               | 70-85%   | 76.0%  | 72.0% |
| Finale win, typical group                  | 40-60%   | 49.1%  | 54.5% |
| Phase 1 clear, 1 player                    | >= 80%   | 100%   | 100%  |
| Finale win, 15 players                     | 35-65%   | 56.9%  | 59.1% |
| Finale win spread between bosses           | <= 15 pp | 5.2    | 7.9   |
| Bosses always or never beaten              | 0        | 0      | 0     |
| Median top player's share                  | <= 35%   | 16.4%  | 15.9% |
| Setup credit share                         | >= 15%   | 16.6%  | 15.7% |
| Reactions per round                        | >= 1     | 4.35   | 4.40  |
| Newcomer Essence vs top earner, week 6     | >= 70%   | 94.4%  | 93.5% |
| Lowest element pick rate                   | >= 15%   | 20.5%  | 19.9% |
| Highest element pick rate                  | <= 35%   | 29.0%  | 29.1% |
| Highest creature vs rarity median          | <= 1.6x  | 1.41x  | 1.39x |
| Lowest creature vs rarity median           | >= 0.6x  | 0.71x  | 0.69x |
| Dead elements                              | 0        | 0      | 0     |
| Casual's top creature level, end of week 4 | >= 15    | 15     | 15    |
| Daily player species by week 6             | >= 8     | 11     | 11    |
| Top earner vs casual power, week 8         | <= 1.6x  | 1.50x  | 1.50x |
| Jackpot rate per player per finale win     | 6-15%    | 18.9%  | 12.4% |
| Players reaching hard pity in 20 weeks     | <= 15%   | 66.4%  | 11.9% |

Finale win rate by boss (typical group): Tidal Colossus 46% -> 59%, Cinder Wyrm 51% -> 52%, Thornmother 51% -> 51%, Storm Sovereign 48% -> 57%.

## What the simulator now models

- Each player brings their **basic ability** (round-robin over the four) and the **creature ability of each of their 3 team creatures at level 10 or above** (`abilitiesFor`).
  - A creature below level 10 adds nothing.
  - The creature's current species decides the form: an evolved creature brings the stage-2 ability.
  - Every ability fires at its default round, as for an absent player.
- **Pity counts finale wins only.** `PITY_COUNTS_LOSSES` is gone; a lost finale rolls nothing and changes nothing. Soft pity now starts at raid 5 (`RULES.raid.jackpot.softPityFromRaid`, was 6). Together these make both pity targets pass: the jackpot rate is 12.4%, and 11.9% of players reach hard pity.

## Ability damage share (informational, not a target)

Each finale is replayed three times (all abilities, basic only, none) against a boss that cannot fall, so all 12 rounds are played. Creature share = (all - basic only) / all.

| Roster week | Group                  | Creature abilities per raid | Creature share | Basic share |
| ----------- | ---------------------- | --------------------------- | -------------- | ----------- |
| 4           | typical (5-10 players) | 18.7                        | 17.9%          | 3.4%        |
| 4           | 15 players             | 31.6                        | 18.5%          | 4.2%        |
| 4           | 1 player with guests   | 3.0                         | 9.8%           | 0.7%        |
| 8           | typical (5-10 players) | 23.1                        | 20.0%          | 3.1%        |
| 8           | 15 players             | 40.5                        | 21.2%          | 3.9%        |
| 8           | 1 player with guests   | 3.0                         | 9.7%           | 0.7%        |

The aim was about 10-25% for a week-8 roster. The result is 20% for a typical group and 21% for 15 players. Basic abilities add about 3% in total.

One-off leave-one-out check (week-8 rosters, 384 raids): one ability is removed and the finale replayed. This is the average share of finale damage that one use adds:

| Ability (species)                | Added by one use |
| -------------------------------- | ---------------- |
| Rally (basic)                    | 0.84%            |
| Purge (basic)                    | 0.22%            |
| Re-mark (basic)                  | 0.26%            |
| Shield Wall (basic)              | 0.02%            |
| Tempest Strike (Tempestray)      | 0.78%            |
| Inferno Strike (Pyrelynx)        | 0.64%            |
| Coral Lance (Coralynx)           | 0.59%            |
| Verdant Roar (Gaiadrake)         | 0.82%            |
| Riptide Mark (Tidewing)          | 0.81%            |
| Storm Zap (Voltaro)              | 0.44%            |
| Solar Brand (Solmane)            | 0.36%            |
| Ancient Bloom (Ancientshell)     | 0.44%            |
| Ironbark Guard (Thornbuck)       | 0.77%            |
| Dense Fog (Fogwyrm)              | 1.03%            |
| Magma Glow (Magmole), few uses   | 1.38%            |
| Aurora Surge (Aurorix), few uses | 1.88%            |

- **Shields add almost no damage.** The boss knocks out about one creature per raid in week 8 (0.8 with 5 players, 1.1 with 10-15), so defence rarely decides a finale. That is why the guard abilities also carry a small team Rally or Purge.
- **Re-mark** is worth about nothing on average when it fires by default, because the mark changes every few hits. It matters when a present player times it.

## Levers changed (one at a time, with the reason)

1. **Basic abilities made weak** (`finale-abilities.json`).
   - Rally +40% -> +10% for 1 round. The design's starting value was +15%, but at +15% a basic Rally was worth more than most creature abilities (1.2% against 0.5-0.8%).
   - Shield Wall: stopped all damage -> 50% less, for 1 round.
   - Purge: for the rest of the fight -> 2 rounds.
   - Re-mark unchanged.
2. **Creature abilities** (12 lines, 20 abilities, see `docs/design/creature-abilities.md`): strikes at 90-320% of Attack, team Rallies of 5-12% for 1-2 rounds, zone shields and purges.
   - A first draft with Rally 20-30% and strikes up to 550% added 28% of finale damage and pushed the typical finale win rate to 71% (Cinder Wyrm 67%).
   - The values were scaled down to about a third. Each ability now adds about 0.4-1% of finale damage.
3. **Boss base HP**: Tidal Colossus 4724 -> 4670, Cinder Wyrm 2710 -> 2870, Thornmother 4296 -> 4410, Storm Sovereign 4380 -> 4340. The abilities lift each boss by a different amount (Cinder Wyrm's win rate rose the most), so each was re-tuned on the average of the same seeds. Phase 2 lands at 72% and the finale at 54%.
4. **Pity** wins-only and soft pity from raid 5, as above.

Not changed: phase thresholds, scaling exponents, reactions, leet points, training costs, creature stats, the target values.

## Notes

- **15-player finale:** the closest finale target (59% against a 65% limit). Rallies stack across players, so the ability share grows a little with the group (21% against 20%). If a future ability pushes it over, lower Rally values before touching boss HP.
- **Default timing only:** in the simulator, basic and creature abilities all fire at their default rounds. Present players who time them well will do better than these numbers.
- **Solo players** (with guests) still win the finale every time, with a creature share of 10%. This is not a target.
