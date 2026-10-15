# Balance log

The process is in `docs/design/balance-loop.md`. Newest entry last. Each entry has a stable id, `B-001` and upwards. An entry stays open until its outcome is measured.

## Template

### B-000: short title (open | closed)

- **Opened:** YYYY-MM-DD, from `docs/balance/live-YYYY-MM-DD.md` or from Misa's note.
- **Finding:**
- **Hypothesis:**
- **Options:** scalar path, the change, the sim result.
- **Action:** scalar path old → new, PR #. Or "none, watching".
- **Expected:**
- **Outcome:** filled in later, with the date and report, the measured effect, and a verdict (worked, partly, no effect or backfired).
- **Follow-ups:**

## Entries

### B-001: The third creature in a dungeon team looks like filler (open)

- **Opened:** 2026-10-14, from Misa's note ("players will always want to bring two [setter/payoff] creatures... the third will be a support or guard just for fun"). Studied in `docs/balance/role-assessment-2026-10-14.md`.
- **Finding:** in the sim, while creatures out-level the depth, every team clears, so guards and supports change only HP left, and HP left earns nothing. A guard beats a second payoff once foe damage reaches about 25–30% of team HP: depth 10 at level 15, depth 12–14 at level 22, by +4–9 points at depth 14 and +26–34 at depth 18–21. A support is level with or behind a payoff almost everywhere.
- **Hypothesis:** this is a depth effect, not a role problem; live data should show guards appearing in teams once players reach their wall. Supports need a better kit (see `docs/design/attack-patterns.md`, element-flavoured supports).
- **Options:** foe Attack scaling (`RULES.dungeon.atkStepBp`, `atkCurveBp`, `baseAtkBp`); `RULES.combat.supportBuffBp`; a flawless-clear reward (new scalar); attack patterns that threaten several creatures.
- **Action:** none, watching. Attack patterns are in design.
- **Expected:** live `dungeon.team_role` picks shift towards a guard at depths where clear rates fall below about 90%.
- **Outcome:**
- **Follow-ups:** B-002, B-004.

### B-002: Reflect knocks out the payoff almost every time (open)

- **Opened:** 2026-10-14, from the role assessment.
- **Finding:** a run that meets reflect (the Thorns modifier, or Slag Tyrant's Molten Shell; about half of all runs) knocks out a creature in 97–100% of cases at every depth. The reflected hit is the whole reaction bonus and can't be intercepted.
- **Hypothesis:** reflect punishes the spike so hard it deletes the payoff rather than making players think.
- **Options:** cap reflected damage at a share of the target's max HP (new scalar); make reflect interceptable by a guard.
- **Action:** none, watching.
- **Expected:**
- **Outcome:**
- **Follow-ups:** the Cinder Wyrm's reflect (Backdraft) was measured with two softer rules (B-007). Misa decided 2026-10-15: Backdraft stays; a Guard takes reflected hits (decisions.md). Nothing else changed.

### B-003: Row order decides whether a team reacts at all (closed)

- **Opened:** 2026-10-14, from the role assessment, with the dungeon moving to always left to right.
- **Finding:** under left to right the same trio swings 30–55 clear points by order. The starters in the old suggested order (Splashet / Sproutle / Cindle) never react: at depth 5, level 8, they clear about 3% against about 47% for Cindle / Sproutle / Splashet.
- **Hypothesis:** the suggested order ignored elements.
- **Options:** element-aware suggested order; an in-setup hint that names the reaction or warns that none is possible.
- **Action:** both, in the left-to-right dungeon PR: `rowScore` / `dungeonRowOrder` in `packages/game/src/rules/dungeon.ts`, and the reaction hint in team setup.
- **Expected:** sim targets hold (they do: 47 of 47 on seeds leet, leet2, leet3).
- **Outcome:** shipped with the PR; watch live `dungeon.team_species` and clear rates by depth.
- **Follow-ups:**

### B-004: Guard and support barely matter in the raid (closed)

- **Opened:** 2026-10-14, from the role assessment.
- **Finding:** removing guard or support mechanics changes the finale win rate by 0–1.2 points, even with boss Attack ×5. Contribution credit pays a guard about 0.3–0.55× and a support about 0.25–0.75× of a payoff per creature.
- **Hypothesis:** one boss hit a round can't threaten a row of 15–45 creatures.
- **Options:** attack patterns that hit many creatures at once (`docs/design/attack-patterns.md`); a credit multiplier for guard and support.
- **Action:** none yet; attack patterns are in design (prototype: guard + support + Shield Wall worth about 11 finale-win points with good formation, against 5 today).
- **Expected:** with attack patterns, a Guard is worth at least 2 finale win points in the sim's own rosters, spread formation.
- **Outcome:** 2026-10-15, B-007. With the patterns built and retuned a Guard is worth 3.6 / 2.4 / 3.4 win points (seeds leet / leet2 / leet3) in the sim's rosters, 3.7 to 4.5 when every player brings one, and a Support is worth 6.5 to 7.4 points when every player brings one (the Ember effect about 1, Tide 0.4 to 0.7, Spark under 0.3). Worked. A Guard's saves show most as knock-outs (about 5 points of the creatures at the same win rate).
- **Follow-ups:** B-007 (the new `raid-guard-value` target keeps it honest).

### B-005: Three sim targets just outside their limits after row-edge adjacency (closed)

- **Opened:** 2026-10-14, from the full `pnpm sim` run for raid row-edge adjacency (raid neighbours stop at row edges, Raid UX pass 2).
- **Finding:**
  - `raid-finale-typical` on seed leet moved from 59.66% to 60.25% (limit 40–60%); leet2 and leet3 stay at about 52%.
  - Two targets already failed before the change, on main at 622f6c3:
    - `exp-casual-discovery` on leet and leet2 (0.32–0.34, limit 0.3);
    - `raid-boss-spread` on leet3 (17.7% → 18.1%, limit 15%).
- **Hypothesis:** row-edge adjacency removes a few cross-zone Support buffs, so a raid row loses a little damage. The other two are seed noise at the edge, not a trend.
- **Options:** nudge raid boss HP by about 1%. Or wait for the attack-pattern and raid-structure retune (phase floors, enrage), which re-tunes every `raid-*` target anyway.
- **Action:** none; the raid retune is the next build. Check the expedition discovery target in the next `balance-review`.
- **Expected:** all targets pass on all three seeds after the raid retune.
- **Outcome:** 2026-10-15, B-007. After the raid retune every target passes on leet, leet2 and leet3 (51 of 51). `raid-boss-spread` is 7.0% / 2.8% / 2.2% (it was 22.4% / 17.2% / 19.6% at the start of the retune); `raid-finale-typical` and the other raid bands were re-based, see B-007. `exp-casual-discovery` is 0.17 / 0.25 / 0.21 and its limit moved from 0.3 to 0.45 (see B-006). Worked.
- **Follow-ups:** B-006, B-007.

### B-006: Fallen creatures no longer absorb boss abilities (closed)

- **Opened:** 2026-10-15, from Misa's note (abilities that target by position still hit knocked-out creatures, a flesh wall).
- **Finding:** engine fix, not a balance change: row-end silence and zone strikes now choose living creatures (see `decisions.md`, 2026-10-15). Full `pnpm sim`, before (79584b2) and after:
  - `raid-finale-typical`: leet 60.25% to 56.1% (now passes), leet2 52.2% to 50.6%, leet3 52.6% to 49.3%.
  - `raid-phase2-typical`: leet 82.9% to 79.8%, leet2 79.2% to 75.7%, leet3 81.7% to 77.2% (all inside 70-85%).
  - `raid-boss-spread`: leet 9.8% to 7.0%, leet2 13.2% to **17.2% (now fails, limit 15%)**, leet3 18.1% to 12.2% (now passes). Per-boss finale win rates moved by about 1 to 9 points in both directions; with about 290 runs per boss that is mostly seed noise, the rosters differ because loot and progress change after the first raid.
  - `exp-casual-discovery`: leet 0.32 to 0.18 and leet2 0.32 to 0.14 (both now pass), leet3 0.25 to **0.302 (now fails, limit 0.3)**. An expedition target that has no link to combat other than through the shifted raid loot; it swings by 0.1 or more between seeds, treated as noise.
  - Smaller moves (a few points): `raid-finale-15` +1 / +0 / +6, `dungeon-first-week-clear` leet2 83.3% to 84.8%, leet3 83.8% to 80.7% (limit 80%, still passes), `gear-newcomer-catchup` leet3 86% to 80%. All other targets within 1% relative.
  - Failing after: leet none; leet2 `raid-boss-spread`; leet3 `exp-casual-discovery`.
- **Hypothesis:** bosses lose their flesh wall, so Undertow and Bramble Bind hurt more once a few creatures are down. Seed-to-seed swings in the spread and discovery targets are larger than the effect.
- **Options:** none taken. Retune with the planned raid retune (phase floors, enrage), which re-tunes every `raid-*` target anyway.
- **Action:** none, watching. Instructed not to retune.
- **Expected:** raid targets stay inside their limits except the noisy spread; the retune will reset them.
- **Outcome:**
- **Follow-ups:** B-005 (its three edge cases are now: leet finale passes, leet2 and leet3 `exp-casual-discovery` / `raid-boss-spread` swap places), B-007.

### B-007: The raid retune: attack patterns, phase floors and enrage need new numbers (open)

- **Opened:** 2026-10-15, from the retune build at 18211aa (attack patterns with untuned starting powers, Guard cover, Support element effects, the single-hit cap, phase floors at 70% / 15% HP left, finale enrage, dungeon boss-room enrage). The numbers are below; the studies can be re-run with the tune CLI.
- **Finding:** at 18211aa the full sim (seeds leet / leet2 / leet3) failed four targets on every seed: Phase 1 clear 53.5% / 49.0% / 45.0% (needs 95%), Phase 2 clear 0.1% / 0.2% / 0.0% (needs 70% to 85%), boss spread 22.4% / 17.2% / 19.6% (needs 15%), and the finale band on leet (64.5%). The three new measures, run on the same build: 43% to 50% of the finale's creatures knocked out (target 10% to 22%), 54% to 61% of finales reaching enrage, no avoidable barrage repeats (a repeat the rule allows, because too few others stand, is 0.6% to 0.8% of volleys). Two things the old bands assumed no longer hold:
  - **Phase 1 and Phase 2 can no longer be about 95% and about 77% while the finale is about 50%.** The floors make Phase 1 a 30% job and Phase 2 an 85% job (cumulative), and the finale only has to finish what is left. A team that drives the boss to its 15% floor has 12 rounds and its abilities for the last 15%: it won 100% of those finales. Measured by scaling boss HP on leet (typical groups): HP x1.0 gives Phase 1 46%, Phase 2 0%, finale 61%; x0.8 gives 91%, 0.3%, 94%; x0.65 gives 99.7%, 7%, 100%; x0.5 gives 100%, 43%, 100%; x0.4 gives 100%, 90%, 100%. Phase 2 at 70% to 85% means a finale won about every time; a finale won about half the time means Phase 2 is never cleared.
  - **Most of the knock-outs were enrage wipes.** A lost finale ends with the row wiped (97% of the creatures knocked out), a won one with about 10%, so the knock-out share is about 0.97 x (finale loss rate) + 0.10 x (win rate). A band of 10% to 22% therefore needs a finale loss rate under about 14%.
- **Hypothesis:** keep the lethality of the design table (it was not off: with HP fitted, about 10% of the creatures fall in a won finale) and fit the bosses to a typical finale win rate of about 92%, which gives KO 16%, a real Phase 1, and a finale that starts with about 38% of the boss's HP left (Phase 2 is a strong server's result). The ladder pins the long run, not this: the long-run finale win rate stayed 54% to 57% and the rank-up gap at 2 weeks, because every win raises the rank (HP x1.4).
- **Options:**
  - Keep the finale band at 40% to 60% and let the phase bands fall to what they must (Phase 1 about 45%, Phase 2 about 0%): a typical server fails Friday half the time. Rejected.
  - Re-base the phase and finale bands to the structure above (taken, see Action).
  - Move the floors (`clearAtLossBp`, Misa's numbers). Not changed; measured as a question for Misa (report, "What the floors do on an established server").
- **Action:**
  - Boss `baseHp` and `hpExponent` (tune CLI `--calibrate 6 --target 0.96 --slope 2 --seeds 3`, then nudged by +0.5% after two verification runs; `--target` and `--slope` are new, the old defaults 0.5 and 3 are unchanged): Tidal Colossus 7344, 1.07 to 6485, 1.04; Cinder Wyrm 2916, 1.23 to 2540, 1.26; Thornmother 6729, 1.04 to 4734, 1.13; Storm Sovereign 5423, 1.15 to 4095, 1.18 (at 10 players the pool is 18%, 7%, 14% and 19% smaller). Pattern `power` unchanged. `maxHitBp` unchanged (5000).
  - `RULES.raid.enrage.powerBp` 30000 to 50000 (rounds stay 3). Above about 400% the power hardly matters: the single-hit cap (50% of a creature's max HP) makes the hit, so the row is wiped in two to three rounds (mean 2.7 to 2.9 in the lost finales) whatever the number. Enrage rounds in lost finales: 3.00 at 200% and 300%, 2.97 at 450%, 2.7 at 700% to 1000% (2.7 to 2.9 at 500%).
  - `RULES.dungeon.baseHpBp` 12500 to 11750 (foe HP x0.94, applied through the one knob, no per-foe `baseHp` touched). `RULES.dungeon.enrage.powerBp` 20000 to 10000: the boss-room wipe takes about 1.5 rounds (the cap again), 7% to 9% of boss rooms at depths 13 to 16 run into it (4% to 5% at depths 8 to 12), and enrage clears about 0.7 point more runs (HP x0.94 about 2.6 points, together 3.3; same rosters, depths 8 to 20). Dungeon targets pass with room to spare.
  - Targets (`packages/sim/targets.json`): added `raid-ko-share` 10% to 22%, `raid-guard-value` at least 2.0 win points (Guard role off, spread formation, typical group, bosses with a 15% bigger pool so the reference wins about 70%), `raid-pattern-fairness` 0% (only avoidable repeats count), `raid-finale-start-share` 25% to 45%. Re-based: `raid-phase1-typical` 95% to 80%, `raid-phase2-typical` 70% to 85% to 0% to 25%, `raid-finale-typical` 40% to 60% to 85% to 97%, `raid-finale-15` 35% to 65% to 85% to 99%. `exp-casual-discovery` 0.3 to 0.45 (noise, see B-006). `pnpm sim` gained a "Finale structure" and a "Roles" section (Guard off, Support off, each element's effect off, in two populations; `packages/sim/src/roles.ts`).
- **Expected:** every target passes on all three seeds; boss spread under 15%; knock-outs 10% to 22%; the finale reaches enrage in about one week in seven.
- **Outcome:** 2026-10-15, full `pnpm sim`, seeds leet / leet2 / leet3: **51 of 51 pass** on each. Before is 18211aa (the new measures run on that build; the bands in the first column are the new ones):

  | Target                          | Requirement                 | leet before | leet after | leet2 before | leet2 after | leet3 before | leet3 after |
  | ------------------------------- | --------------------------- | ----------- | ---------- | ------------ | ----------- | ------------ | ----------- |
  | `raid-phase1-typical`           | >= 80% (was >= 95%)         | 53.5%       | 86.5%      | 49.0%        | 86.8%       | 45.0%        | 85.8%       |
  | `raid-phase2-typical`           | 0% to 25% (was 70% to 85%)  | 0.1%        | 0.5%       | 0.2%         | 0.2%        | 0.0%         | 0.6%        |
  | `raid-finale-typical`           | 85% to 97% (was 40% to 60%) | 64.5%       | 93.0%      | 58.8%        | 93.0%       | 55.3%        | 92.5%       |
  | `raid-finale-start-share` (new) | 25% to 45%                  | 43.0%       | 37.7%      | 43.9%        | 37.6%       | 44.5%        | 37.8%       |
  | `raid-finale-15`                | 85% to 99% (was 35% to 65%) | 52.8%       | 95.9%      | 61.0%        | 91.4%       | 65.5%        | 97.2%       |
  | `raid-boss-spread`              | <= 15%                      | 22.4%       | 7.0%       | 17.2%        | 2.8%        | 19.6%        | 2.2%        |
  | `raid-ko-share` (new)           | 10% to 22%                  | 43.3%       | 15.9%      | 49.0%        | 16.0%       | 50.4%        | 17.5%       |
  | `raid-guard-value` (new)        | >= 2.0 points               | 4.07        | 3.60       | 4.01         | 2.38        | 4.28         | 3.37        |
  | `raid-pattern-fairness` (new)   | 0%                          | 0.0%        | 0.0%       | 0.0%         | 0.0%        | 0.0%         | 0.0%        |
  | `exp-casual-discovery`          | <= 0.45 (was 0.3)           | 0.25        | 0.17       | 0.40         | 0.25        | 0.24         | 0.21        |
  | `dungeon-first-week-clear`      | >= 80%                      | 84.0%       | 84.8%      | 87.3%        | 87.8%       | 85.0%        | 88.4%       |
  | `dungeon-depth-growth`          | 1 to 2                      | 1.67        | 1.67       | 1.67         | 1.67        | 1.50         | 1.67        |
  | `longrun-win-typical`           | 40% to 60%                  | 54.2%       | 56.6%      | 54.8%        | 56.5%       | 54.6%        | 56.6%       |

  Every other target stays inside its limit on every seed and moves little. Two to watch: `gear-skill-day30` is 5 / 5.5 / 6 before and 6 / 6 / 6 after (limit 4 to 6; more cleared Phase 1s pay more scrap, so crafting is quicker), and `raid-guard-value` on leet2 (2.38, one standard error is about 0.8). Typical groups, after (leet / leet2 / leet3): enrage reached in 14.3% / 15.3% / 17.2% of finales (before 54% / 57% / 61%), a win inside enrage in 51% / 54% / 57% of those (before 34% / 27% / 27%; 7% to 10% of all finales), enrage losses last 2.9 / 2.7 / 2.8 enrage rounds.

- **Follow-ups:** Misa's questions in the report (the floors on an established server, the free first enrage round, the Wyrm's reflect); watch live `raid.phase1_clear`, finale win rate and rank-ups against the sim after deploy; `gear-skill-day30` at its limit; the equilibrium view (a typical server in weeks 11 and later, normal weeks: Phase 1 cleared 34%, Phase 2 0%, finale won 31%, the finale starts with 52% of the boss's HP, 72% of the creatures knocked out, enrage reached in 77% of finales) is set by the ladder, not by this retune; see the report.

### B-008: The raid retune, second pass: no single-hit cap, Guard armor, enrage and the setups (open)

- **Opened:** 2026-10-15, after Misa's answers on B-007 (decisions.md, "Misa's answers on the retune"): the single-hit cap is off ("big hits stay big"), a Guard has armor instead of +30% HP, knock-outs and swings are wanted. Before is e7afddb (cap 5000, raid enrage 50000, dungeon enrage 10000, the B-007 bosses); after is f9b927c plus this change (the engine fixes merged in between: Shield Wall protects the creature that takes the hit, a chain never hits one creature twice, the killing blow counts only the HP left).
- **Finding:**
  - The bosses needed almost nothing for the cap to go: with the cap off and nothing else changed the typical finale was won 94% of the time (95% before), inside its band. What changed is the enrage: it hits every creature for a share of the boss's Attack, and with the cap off that share decides how fast a row dies.
  - A Guard is worth far more than the 2.0 floor: 10 to 13 win points at every armor from 20% to 35% (it was about 11 at e7afddb too; B-007's 2.4 to 3.6 was the old +30% HP Guard). Armor is a weak lever: about +0.5 point per 5 points of armor.
  - Wins collapse with Boss Rank whatever the cap does (table below): a roster that has stopped growing wins nothing at rank 7, cap or no cap. The cap was not what held the high ranks up.
- **Hypothesis:** keep the bosses (B-007 fitted them to a typical finale won about 92%), set the enrage by what a row that reaches overtime does, and widen the knock-out band so it catches broken numbers without pulling the swings to the middle.
- **Options:**
  - Guard armor 20% / 25% / 30% / 35%: `raid-guard-value` (win points lost with the Guard role off; leet / leet2 / leet3): 11.79 / 9.99 / 10.57 at 20%; **12.13 / 10.24 / 11.11 at 25%**; 12.55 / 10.87 / 11.56 at 30%; 12.89 / 11.20 / 12.01 at 35%. All far above 2.0, so the armor stays at 25% (the glossary line is unchanged).
  - Raid enrage power (typical groups, three seeds, 200 weeks per boss and size; overtime wins are a share of all finales; "wiped" is the share of lost overtimes that ended with the whole row down, the rest ended after the third round with creatures still standing). Measured on the merged engine, bosses as now:

    | Power | Overtime won (leet / leet2 / leet3) | Enrage rounds in a lost overtime | Wiped           | Finale win         |
    | ----- | ----------------------------------- | -------------------------------- | --------------- | ------------------ |
    | 300%  | 6.9 / 9.9 / 8.0                     | 2.92 / 2.97 / 2.88               | 37% / 37% / 29% | 92.7 / 91.0 / 93.4 |
    | 400%  | 6.5 / 8.4 / 6.9                     | 2.75 / 2.79 / 2.80               | 55% / 71% / 61% | 92.3 / 89.5 / 92.3 |
    | 500%  | 5.6 / 7.6 / 6.0                     | 2.57 / 2.57 / 2.61               | 85% / 95% / 96% | 91.4 / 88.8 / 91.4 |
    | 600%  | 4.9 / 6.8 / 5.4                     | 2.40 / 2.34 / 2.27               | 100%            | 90.7 / 87.9 / 90.8 |

    The two wishes pull apart: a harder enrage wipes faster and costs the overtime wins, because only 14% to 19% of finales reach overtime and the share won inside it falls from about 55% to 35%. Tougher bosses would raise the reach, but about 4% more boss HP already takes Phase 1 on leet2 to 79.6% (needs 80%), before one finale in twelve is reached (measured before the engine merge).

  - Dungeon enrage power (week 8 rosters, depths 8 to 20, boss rooms): from 5% to 100% of the foe's Attack makes no difference to the wipe (a lost boss room lasts 1.5 to 1.8 enrage rounds at any power, because the boss's own attack finishes a team that is already hurt), and enrage adds about 1.1 clears per 100 runs at depths 13 to 20 (42.5% to 43.6%). A third enrage round would add about 0.3 more; not changed.
  - Boss HP: tune CLI `--calibrate 5 --target 0.95 --slope 2 --seeds 2`, once per seed (leet, leet2, leet3), the three fits averaged and base HP +1%. The fits were noisy (base HP and exponent trade off) and moved the pools by under 4% at 10 players.
- **Action:**
  - `RULES.combat.maxHitBp` 5000 to 0 (no cap; the engine treats 0 as off and the live rules copy it; a new engine test pins both).
  - `RULES.combat.guard.armorBp` stays 2500.
  - `RULES.raid.enrage.powerBp` 50000 to 40000 (rounds stay 3): the middle of the table. A lost overtime lasts 2.75 to 2.8 rounds as in B-007, 55% to 70% of them end in a wipe, and about one finale in 14 is won in overtime (6.3% / 8.2% / 7.7% in the final runs), not one in twelve: see the question in the report.
  - `RULES.dungeon.enrage.powerBp` 10000 to 3000 (a modest hit; the number does not decide the room).
  - Boss `baseHp` and `hpExponent`: Tidal Colossus 6485, 1.04 to 5915, 1.08; Cinder Wyrm 2540, 1.26 to 2490, 1.29; Thornmother 4734, 1.13 to 4737, 1.13; Storm Sovereign 4095, 1.18 to 3974, 1.19. Pattern powers unchanged.
  - Targets: `raid-ko-share` 10% to 22% widened to 10% to 30%.
  - New in `pnpm sim` (and `report.json` as `setups` and `ranks`): the "Setups" and "High Boss Ranks" sections (`packages/sim/src/setup-study.ts`, `formations.ts`). The economy sim gained `behaviour.signUpPercent` and an `onRaidOpen` hook, and a raid stage records `knockedOutIds` (used for the progression and newcomer data).
- **Expected:** every target passes on all three seeds; knock-outs 15% to 25% of the finale's row.
- **Outcome:** 2026-10-15, full `pnpm sim`, seeds leet / leet2 / leet3: **51 of 51 pass** on each. Before is e7afddb:

  | Target                     | Requirement          | leet before | leet after | leet2 before | leet2 after | leet3 before | leet3 after |
  | -------------------------- | -------------------- | ----------- | ---------- | ------------ | ----------- | ------------ | ----------- |
  | `raid-phase1-typical`      | >= 80%               | 89.5%       | 85.2%      | 86.9%        | 84.4%       | 87.8%        | 85.6%       |
  | `raid-phase2-typical`      | 0% to 25%            | 0.6%        | 0.6%       | 0.3%         | 0.9%        | 0.7%         | 0.3%        |
  | `raid-finale-typical`      | 85% to 97%           | 95.3%       | 90.9%      | 92.0%        | 89.9%       | 93.5%        | 91.9%       |
  | `raid-finale-start-share`  | 25% to 45%           | 36.4%       | 37.1%      | 37.2%        | 37.5%       | 36.6%        | 37.3%       |
  | `raid-finale-15`           | 85% to 99%           | 95.0%       | 92.9%      | 96.3%        | 89.0%       | 96.3%        | 90.4%       |
  | `raid-boss-spread`         | <= 15%               | 5.4%        | 2.3%       | 4.7%         | 4.1%        | 2.5%         | 2.5%        |
  | `raid-ko-share`            | 10% to 30% (was 22%) | 12.0%       | 17.8%      | 15.9%        | 20.6%       | 13.6%        | 18.1%       |
  | `raid-guard-value`         | >= 2.0 points        | 11.70       | 12.13      | 11.25        | 10.24       | 10.37        | 11.11       |
  | `raid-pattern-fairness`    | 0%                   | 0.0%        | 0.0%       | 0.0%         | 0.0%        | 0.0%         | 0.0%        |
  | `longrun-win-typical`      | 40% to 60%           | 56.0%       | 55.7%      | 56.9%        | 56.2%       | 56.3%        | 56.2%       |
  | `dungeon-first-week-clear` | >= 80%               | 84.8%       | 85.6%      | 89.9%        | 89.5%       | 88.9%        | 90.3%       |
  | `dungeon-depth-growth`     | 1 to 2               | 1.50        | 1.67       | 1.67         | 1.67        | 1.58         | 1.67        |
  | `gear-skill-day30`         | 4 to 6               | 5           | 6          | 6            | 6           | 6            | 6           |
  | `exp-casual-discovery`     | <= 0.45              | 0.22        | 0.14       | 0.22         | 0.16        | 0.17         | 0.22        |

  Typical groups, after (leet / leet2 / leet3): enrage reached in 15.3% / 18.3% / 15.8% of finales, won inside it 40.9% / 44.7% / 48.7%, a lost overtime lasts 2.77 / 2.82 / 2.80 enrage rounds. Typical finale win by boss (Tidal / Wyrm / Thornmother / Storm): leet 91.0 / 90.9 / 89.8 / 92.1, leet2 90.1 / 87.2 / 90.9 / 91.3, leet3 90.9 / 93.1 / 90.6 / 92.9. `gear-skill-day30` sits at the top of its band (6) on every seed.

  **Setup study** (`pnpm sim`, "Setups"; same rosters, sign-ups and dice for every row; typical groups, about 1180 finales per row; three seeds shown as leet / leet2 / leet3). The two setups are the best arrangement a seeded hill-climb finds for their own score: Greedy for reactions a round, with Guards and Supports at the row's edges; Protected for payoffs beside a Guard (in their own zone), Supports between payoffs, reactions second. "+N" is a boss N Boss Ranks above the rank the sweep fights at.

  | Boss         | Row       | Finale win         | Reactions a round | Payoffs beside a Guard | Knocked out        | Lost with over half the row down | Swing: win rate by cell (points) | Swing: knock-out share (points) |
  | ------------ | --------- | ------------------ | ----------------- | ---------------------- | ------------------ | -------------------------------- | -------------------------------- | ------------------------------- |
  | +0 (shipped) | Default   | 90.9 / 89.9 / 91.9 | 3.3               | 0%                     | 17.8 / 20.6 / 18.2 | 100%                             | 4.3 / 6.8 / 4.4                  | 27 / 29 / 27                    |
  | +0           | Greedy    | 98.6 / 97.3 / 98.6 | 6.9               | 13% to 14%             | 4.8 / 6.5 / 5.7    | 100%                             | 3.8 / 6.9 / 3.9                  | 14 / 18 / 16                    |
  | +0           | Protected | 99.4 / 97.2 / 98.5 | 6.9               | 35% to 38%             | 4.3 / 6.7 / 5.7    | 100%                             | 1.5 / 7.4 / 5.7                  | 12 / 19 / 16                    |
  | +1           | Default   | 14.4 / 13.5 / 12.3 | 3.1               | 0%                     | 89 / 90 / 91       | 100%                             | 12 / 12 / 10                     | 28 / 27 / 26                    |
  | +1           | Greedy    | 72.2 / 68.0 / 66.5 | 6.6               | 13% to 14%             | 33.3 / 36.7 / 37.5 | 100%                             | 33 / 32 / 35                     | 42 / 43 / 43                    |
  | +1           | Protected | 73.8 / 69.7 / 68.1 | 6.7               | 35% to 38%             | 30.1 / 34.4 / 34.6 | 100%                             | 33 / 32 / 35                     | 42 / 43 / 44                    |
  | +2           | Default   | 0.4 / 0.2 / 0.2    | 3.0               | 0%                     | 100                | 100%                             | 2 / 1 / 1                        | 4 / 3 / 3                       |
  | +2           | Greedy    | 8.6 / 8.7 / 5.9    | 5.9 to 6.0        | 13% to 14%             | 92.7 / 93.2 / 94.8 | 100%                             | 10 / 12 / 9                      | 23 / 23 / 19                    |
  | +2           | Protected | 10.8 / 10.3 / 7.3  | 6.0 to 6.2        | 35% to 38%             | 90.8 / 91.4 / 93.5 | 100%                             | 12 / 12 / 9                      | 26 / 26 / 21                    |

  What it says, honestly: (1) both arranged rows are worth far more than the default row: about double the reactions (6.9 against 3.3 a round), the boss at 25% of its HP when Sunday starts instead of 37%, and a boss one rank up that the default row beats 13% of the time is beaten about 70% of the time. A hand-built row is worth more than a Boss Rank, and the whole calibration is made on the default row. (2) Greedy does not hit harder than Protected: they make the same reactions (6.6 against 6.7 a round at +1), because a typical group has so few Guards and Supports that standing them beside payoffs costs almost no reaction. (3) Protected survives a little more and is never behind: no difference at the shipped bosses (both win 97% to 99%), +1.6 win points and about 3 fewer creatures knocked out of 100 at +1, +1.8 win points at +2. Neither is simply best, but only by a small margin; the trade Misa described (greedy hits harder but dies more) is not really there. (4) Swing: the two are alike. A lost finale is always a wipe (every loss has over half the row down), so the swing is between wins and wipes; the default row at +1 swings the least only because it nearly always loses.

  **High Boss Ranks** (`pnpm sim`, "High Boss Ranks"; typical groups on the leet seed's rosters of weeks 4 and 8, every boss, rank forced; static rosters, so it shows where wins collapse, not what a rank-9 server looks like; leet2 and leet3 are within a few points). The last column is the same study with the cap on and enrage 500% (e7afddb numbers on today's engine):

  | Boss Rank | Roster week | Phase 1 cleared | Finale win | Boss HP left at the finale | Knocked out | Overtime reached | Finale win, cap on |
  | --------- | ----------- | --------------- | ---------- | -------------------------- | ----------- | ---------------- | ------------------ |
  | 1         | 4           | 100%            | 100%       | 15%                        | 0.8%        | 0%               | 100%               |
  | 3         | 4           | 100%            | 99.7%      | 25%                        | 2.8%        | 0.3%             | 99.7%              |
  | 5         | 4           | 10.8%           | 8.4%       | 53%                        | 93.3%       | 94.5%            | 12.4%              |
  | 7         | 4           | 0%              | 0%         | 78%                        | 100%        | 84.2%            | 0%                 |
  | 9         | 4           | 0%              | 0%         | 91%                        | 100%        | 50.0%            | 0%                 |
  | 11        | 4           | 0%              | 0%         | 96%                        | 100%        | 7.7%             | 0%                 |
  | 1         | 8           | 100%            | 100%       | 15%                        | 0.6%        | 0%               | 100%               |
  | 3         | 8           | 100%            | 100%       | 15%                        | 1.2%        | 0%               | 100%               |
  | 5         | 8           | 87.1%           | 93.6%      | 37%                        | 13.5%       | 11.7%            | 96.3%              |
  | 7         | 8           | 0%              | 0%         | 67%                        | 100%        | 99.3%            | 0.2%               |
  | 9         | 8           | 0%              | 0%         | 86%                        | 100%        | 67.0%            | 0%                 |
  | 11        | 8           | 0%              | 0%         | 94%                        | 100%        | 22.3%            | 0%                 |

  Wins fall off a cliff between rank 5 and rank 7 for both roster weeks, with the cap on or off: the rank curve (boss HP x1.4 and Attack x1.2 a rank) does it, not the cap. Without the cap the row dies sooner at the high ranks (overtime is reached in 67% instead of 91% of rank-9 finales on week 8 rosters): the boss kills the row before its normal rounds run out. The rank curves are unchanged.

  **Progression of one active server** (8 players, everyone signs up every week, weeks 1 to 12, 200 servers averaged; the full table with a newcomer line is in the scratch file named in the report, `progression.json`): week 1 finale 5% won (a new server's first raid is a wipe: it is placed at rank 2 on creatures of level 5), weeks 2 to 7 94% to 100% won with 4% to 13% of the row knocked out (Phase 2 cleared in 16% to 54% of weeks), then the Boss Rank outgrows the creatures: week 8 68% won, week 10 72%, week 12 52%, with 35% to 52% of the row knocked out and overtime reached in 35% to 53% of finales. A newcomer with three level-1 starters has a creature knocked out in the finale 10% to 17% of the time in weeks 3 to 6, 39% to 54% in weeks 7 to 9 and 61% to 72% from week 10.

- **Follow-ups:** Misa's questions in the report (the enrage trade, the first raid week, the setups); watch live finale win rate, knock-outs and rank-ups against the sim; if the cap-off bites on the live server, the next lever is separate curves for boss HP and boss Attack by rank, and raid tiers for newcomers (decisions.md).
