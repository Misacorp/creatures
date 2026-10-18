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

### B-009: Weeks 2 to 6 are a walkover, week 1 a wipe (open)

- **Opened:** 2026-10-15, from the 12-week progression run of the retune (200 servers of 3 casual, 3 daily and 2 top players, everyone raids): the finale is won 5% to 8% in week 1, 94% to 100% in weeks 2 to 6, then 74% falling to 50% by week 12.
- **Finding** (a power study at d21fd40: mean raid team power, split by Shapley attribution):
  - Team power against week 1: 1.6x in week 2, 2.4x, 2.9x, 3.3x, 3.6x in week 6, 4.2x in week 8, 4.9x in week 12. Weekly growth +60%, +48%, +21%, +13%, +12%, then 9% falling to 4%. Boss HP grows about 15% a week once a server wins (one Boss Rank per win, 1.4x HP per rank). Wins start to fall when power over boss HP drops under about 2 and sit near 50% at about 1.5.
  - Weeks 1 to 4 (+290 power): levels +107, roster changes +66, evolutions +64, fusion +30, gear +22. Weeks 4 to 12 (+315): levels +187, evolutions +50, fusion +36, gear +35, roster +7. After week 6 growth is almost all levels. Top-3 swaps per player: 1.16 of 3 in week 2, 0.12 by week 6, 0 from week 8. Evolutions finish by week 6 (77% of the team is stage 2: every creature that can evolve). Each fusion step is worth less (+6%, 5, 4, 3, 2).
  - Levels slow because training costs 3 + 2 x level (14 to 51 Bait a level) against flat leet Bait (about 235 a week): 12.4 levels bought a week falls to 3.5. From week 8 the sim's policy spends more Bait on trip supplies than on training (a sim policy, not a rule).
  - Caps: in week 2, 23% of raid creatures (45% of top earners') wait at the stage-1 cap of 15 for 20 Essence to evolve; the stage-2 cap of 30 holds 32% of top earners' teams in week 12 (8% of daily, 0% of casual), so their growth stops around weeks 13 to 14.
  - Currencies: Essence piles up (6 to 131 by week 12), shards (3 to 41) and glimmer (0.2 to 8) too; scrap stays near 4 and blocks gear upgrades (40% blocked on scrap only, 45% on scrap and Essence). Worn gear: 60% common, 20% rare, 4% epic, 15% Festival.
  - Week 1: the placement rank (about 2) is set from creatures that are not yet strong, and a loss never lowers the rank, so week 2 meets the same boss about 1.7x stronger.
- **Options measured** (finale win weeks 3 / 4 / 5 / 6, then weeks 8 to 12): base 100 / 99 / 99 / 100, 74 to 49. Two ranks per win while rank is at most 4: 74 / 80 / 52 / 56, then about 50 flat. One extra rank when the finale starts with at most 25% of the boss's HP left: 99 / 94 / 84 / 76, then 50 to 63. A slower early level curve (13 + 2 x level, or 3 x level): still 95 to 100 in weeks 3 to 6 (weak: the rank lags, not the levels). A first-week boss 15% weaker (measured for the merge question): week 1 about 63% to 78% won, later weeks untouched.
- **Hypothesis:** the big-win extra rank plus an easier first week fit Misa's "kill or wipe, exciting" best; and players need sinks for the Essence, shards and glimmer they pile up (the creature progression revamp, roadmap 14) and more scrap for gear.
- **Outcome:** waiting for Misa.

### B-010: The raid curve by Boss Rank (open)

- **Opened:** 2026-10-16, from Misa's brief: no rank skipping, a custom difficulty curve we control and do not explain, every week winnable by a full tryhard team ("a large percent chance of winning every week, at least up to around week 5"), losing is fine, and a first week that mostly casual players can clear. Before is cd25e20 (compounding +40% HP and half that Attack a rank, placement by creature levels); the merged finale reward slot and the jackpot Essence (sim fixes, below) are in the after numbers only.
- **Method.** Whole 12-week servers of the journey simulator's players (`pnpm sim:curve`, `packages/sim/src/curve-study.ts`; the same study runs inside `pnpm sim` and feeds the `curve-*` targets). Three server mixes of 9 players: **casual-heavy** (1 engaged, 4 regular, 4 drop-in), **default** (1 min-maxer, 3 engaged, 3 regular, 2 drop-in) and **committed** (2 min-maxers, 4 engaged, 2 regular, 1 drop-in; the min-maxers arrange their rows). Allowance income, the real ladder and Festivals, a random start in the 5-week calendar, 400 servers a mix for the tuning runs (60 in `pnpm sim`). Rates are per raid week; rank tables count normal weeks only (a Festival fights an eased boss). Tuning was by rank: ranks 2 to 5 first, then the high ranks, using per-rank win rates and, to separate the week effect from the rank effect, runs with every rank above 1 set to the same boss.
- **Finding (before).** The old ladder was a wall at both ends and a walkover in the middle. Default servers: week 1 won 12% (placed at rank 2 on creatures that are not yet strong), weeks 2 to 6 won 93% to 99%, then 81% falling to 52% by week 12 (Phase 1 cleared 55%, 55%, 51% in weeks 10 to 12). Casual-heavy: week 1 won 1%. Committed: week 1 53%, weeks 2 to 6 96% to 100%, week 12 48%. Per rank (normal weeks): default 97% at rank 3, 94% at 4, 79% at 5, 13% at 6, 0% at 7; committed 98%, 100%, 96%, 64% at 6, 3% at 7. A committed server could not beat rank 7, and a new casual server could not beat rank 2. Three things explained it: the placement rank (the first boss was two ranks up), the +40% a rank (boss HP grows faster than player power after week 6, when growth slows to levels only: B-009), and Attack at rank 6 and up that wipes the row.
- **Findings (while tuning).**
  - Win rate is steep in boss HP, about 1 to 5 points a percent in the middle of the range, and steeper where player power has stopped growing (ranks 6 and up). A flat boss of rank-2 strength shows the week effect alone: default 39% in weeks 2 to 5, 65% in week 8, 80% by weeks 11 and 12 (committed 44%, then 92% from week 6). Player power keeps growing to week 12; it only slows.
  - The frontier is biased low: a server at its highest rank is there because it has not won yet, so the win rate at the top rank of a mix is always below the average of its band. The targets use bands (2 to 5, 6 and up) and the worst rank with at least 40 weeks.
  - Boss Attack matters less than HP in the middle of the table (ranks 7 and up with Attack held at the rank-6 value gave the same win rates), and the rank-7 moves change a committed server's rank-7 win rate by only about 3 points (moves off 59%, on 55% to 62%): the table carries the difficulty today. Phase 1 (Friday, 70% floor) tracks the finale closely, about 3 to 4 points lower.
  - First week: with a rank-1 boss at 35% of the calibrated pool and 65% Attack, a server with no engaged player at all (only regular and drop-in players) wins 87%; with one or two engaged players 97% to 100%. At 45% of the pool the all-casual servers won 63%.
- **Options.**
  - Keep a compounding step but lower it (for example 20%): rejected, one step cannot be right at both ends (rank 2 needs to be about 5x rank 1, rank 7 under 5% above rank 6).
  - HP only, or Attack only: the table keeps both columns, because Attack adds knock-outs, crits and drama without lengthening the fight; the second plain attack and the boss crit bonus only come in past rank 9.
  - Move the rank-gated moves (ranks 4 and 7): not needed by the data, left; the table is the lever for now.
  - Placement by roster strength: rejected by the brief (and it made week 1 a wipe); everyone starts at rank 1.
- **Action.**
  - `RULES.raid.curve` (the `rankStepBp`, `atkRankShareBp` and `bossAttacksByRank` fields are gone; `maxRank` stays 30; `placement.legacyHpPerLevelBp` became `startRank` 1). Rows are `hpBp`, `atkBp` (shares of the boss's `baseHp` and `baseAtk`, so rank 1 is 3500 and 6500, not 10000), boss attacks and crit bonus:

    | Rank | HP (bp) | Attack (bp) | Boss attacks | Crit bonus (bp) |
    | ---- | ------- | ----------- | ------------ | --------------- |
    | 1    | 3500    | 6500        | 1            | 0               |
    | 2    | 19200   | 11000       | 1            | 0               |
    | 3    | 29800   | 12500       | 1            | 0               |
    | 4    | 36000   | 14000       | 1            | 0               |
    | 5    | 43200   | 15500       | 1            | 0               |
    | 6    | 47000   | 17000       | 1            | 0               |
    | 7    | 47500   | 18500       | 1            | 0               |
    | 8    | 48500   | 20000       | 1            | 0               |
    | 9    | 49500   | 21500       | 1            | 250             |
    | 10   | 49500   | 23000       | 1            | 250             |
    | 11   | 49500   | 24500       | 1            | 500             |
    | 12   | 49500   | 26000       | 1            | 500             |
    | 13   | 49500   | 27500       | 1            | 500             |
    | 14   | 49500   | 29000       | 2            | 750             |
    | 15   | 49500   | 30500       | 2            | 750             |

    Above rank 15: HP +5% and Attack +3% a rank (`beyond`), second attack and crit bonus held. Ranks 10 to 13 were checked on 24 and 36 week runs of committed servers (about 65% to 77% won); rank 14 and up are extrapolation (about 50% to 60% in the 36 week runs, then falling).

  - Readers: `scaleBoss` (HP and Attack), the worker's fight input (`bossAttacks`, boss crit chance through `luckAtRank`; the readiness forecast uses the same input), the sim's `fightFor`. `placementRank` returns rank 1. `sweepRank` (sim) keeps the old per-level rule for the raid sweep only, over the new curve, so the sweep fights about the same boss HP as before. Boss `baseHp` and `fromRank` are untouched.
  - Sim fixes that feed the numbers: the finale reward slot (blueprints and pre-upgraded gear) and the jackpot Essence the worker pays are modelled; the long-run and pity sims play the default journey server instead of the legacy archetype servers (those open the game daily and are much stronger than the journey players the curve is tuned for).
  - Targets (`packages/sim/targets.json`): new `curve-week1-casual` >= 85%, `curve-week1-default` >= 90%, `curve-r2to5-default` 70% to 85%, `curve-r2to5-committed` >= 95%, `curve-r6up-default` 45% to 65%, `curve-r6up-committed` >= 80%, `curve-committed-worst-rank` >= 60%, `curve-default-phase1` >= 75%, `curve-default-phase2` 5% to 50%, `curve-default-ko` 10% to 35%. Re-based because the population and the ladder changed: `longrun-win-*` 40% to 60% became 60% to 85% (measured 74% to 77%), `longrun-rankup-gap` 2 to 4 became 1 to 2, `econ-hard-pity` 15% became 25% (it counts finale wins; the all-win ceiling is about 22%).
- **Expected:** every target passes on all three seeds.
- **Outcome:** 2026-10-16, 400 servers a mix, allowance income (before is cd25e20, 150 servers a mix; "-" is not measured or never played in 12 weeks):

  | Measure (normal weeks)               | casual-heavy before | casual-heavy after | default before | default after | committed before | committed after |
  | ------------------------------------ | ------------------- | ------------------ | -------------- | ------------- | ---------------- | --------------- |
  | Week 1 finale won                    | 1%                  | 98%                | 12%            | 100%          | 53%              | 100%            |
  | Rank 1 finale won                    | 92%                 | 99%                | 100%           | 100%          | 100%             | 100%            |
  | Ranks 2 to 5 finale won              | 51%                 | 44%                | 81%            | 82%           | 91%              | 97%             |
  | Rank 6 and up finale won             | -                   | -                  | 12%            | 56%           | 41%              | 86%             |
  | Worst rank (>= 40 weeks) finale won  | -                   | -                  | -              | 41% (rank 7)  | -                | 68% (rank 8)    |
  | Phase 1 cleared, all normal weeks    | -                   | 54%                | -              | 76%           | -                | 91%             |
  | Phase 2 cleared, all normal weeks    | -                   | 14%                | -              | 14%           | -                | 16%             |
  | Finale knocked out, all normal weeks | -                   | 47%                | -              | 23%           | -                | 9%              |
  | Finales won in overtime              | -                   | 5%                 | -              | 7% (1 in 14)  | -                | 3%              |
  | Mean rank after week 12              | 4.8                 | 4.1                | 6.0            | 6.5           | 6.7              | 7.8             |

  Finale win rate by week (weeks 1 to 12):

  | Mix          | Before                               | After                                 |
  | ------------ | ------------------------------------ | ------------------------------------- |
  | casual-heavy | 1 34 69 79 77 83 79 73 63 62 57 60   | 98 39 45 60 70 67 67 61 61 67 66 59   |
  | default      | 12 93 98 93 97 99 81 72 65 56 53 52  | 100 74 85 83 91 92 92 84 85 73 73 76  |
  | committed    | 53 97 99 99 100 96 88 84 74 63 49 48 | 100 96 98 98 97 95 100 99 98 83 88 86 |

  Phase 1 cleared by week, default: before 14 90 97 93 96 97 79 71 65 55 55 51, after 100 72 86 82 86 86 88 80 81 68 70 75. Finale knock-out share by week, default: before 88 15 5 11 7 8 25 35 41 51 50 52, after 1 31 16 20 14 14 12 19 19 32 28 26. The raid sweep (three seeds): boss spread 4% to 8%, typical finale 92% to 93%, 15 players 90%, knock-outs 11% to 13%. Full `pnpm sim` on leet, leet2 and leet3: 61 of 61 targets pass on each; thinnest margins: `curve-default-phase1` 75.5% to 77.8% (needs 75%), `curve-r2to5-default` up to 83.6% (needs 85%), `econ-hard-pity` 15.8% to 16.5%.

  **Week one of a new server** (rank 1, 300 servers each; this is the live server's first week). Friday is Phase 1 cleared, Saturday Phase 2 cleared, Sunday the finale won:

  | Server (players)                             | Friday | Saturday | Sunday | Knocked out | Reached overtime |
  | -------------------------------------------- | ------ | -------- | ------ | ----------- | ---------------- |
  | 5: 1 engaged, 2 regular, 2 drop-in           | 95%    | 66%      | 97%    | 6%          | 2%               |
  | 8: 1 engaged, 4 regular, 3 drop-in           | 99%    | 54%      | 99%    | 3%          | 1%               |
  | 12: 2 engaged, 5 regular, 5 drop-in          | 100%   | 50%      | 100%   | 2%          | 0%               |
  | 5, no engaged player (3 regular, 2 drop-in)  | 91%    | 30%      | 87%    | 20%         | 4%               |
  | 8, no engaged player (4 regular, 4 drop-in)  | 90%    | 15%      | 87%    | 23%         | 12%              |
  | 12, no engaged player (6 regular, 6 drop-in) | 89%    | 11%      | 87%    | 20%         | 17%              |

- **Follow-ups:** watch live week 1 and week 2 against these numbers (the presets are guesses until fitted to the live report); a fully casual server loses about half its weeks from rank 2 (44% at ranks 2 to 5), which is Misa's call (see the report); ranks 10 and up are not validated; the committed dip at week 10 (98% to 83%) is where its rows meet rank 6 or 7 as player growth plateaus, worth a look at live data.

### B-011: Supplies cannot be bought: the dungeon drops them and the Workshop makes them (open)

- **Opened:** 2026-10-16, from Misa's decision after the progression study (`docs/balance/progression-study-2026-10-16.md`, section 2).
- **Finding.** Buying supplies with Bait was a trap: a min-maxer who bought them was 13% weaker at week 6 (about a third of a supply's price came back through the duplicates it caught; the collection is complete at the same week with or without them), and in 30 weeks nobody crafted one because crafts and upgrades took the scrap first. Found on trips alone, supplies were 0.7 to 3 a week for a regular and 8 to 20 for a min-maxer.
- **Decision (Misa).** Remove buying with Bait; owned supplies keep working. Supplies come from elsewhere: a guaranteed supply from the daily dungeon (per clear or per room, the sim decides) with depth setting the tier odds, and crafting becomes a real option (more workshop use, more scrap and resources).
- **Method.** `pnpm sim:supplies` (`packages/sim/src/supplies-study.ts`): the default journey server (1 min-maxer, 3 engaged, 3 regular, 2 drop-in), 3 seeds x 20 servers x 30 weeks per variant (60 servers: 60 min-maxers, 180 engaged, 180 regular, 120 drop-ins), the same seeds for every variant and for main (paired until the dice diverge), allowance income, the shipped raid rules. Numbers are means per player. "main" is origin/main at c501df7 (Bait buys, nothing crafted) run through the same study. The sim's policy for the new economy: no Bait goes to supplies; a trip carries the supplies in stock that help; the workshop makes a supply (before it crafts gear, except a new player's first craft, which keeps the first-craft target) when fewer than 4 are in stock or being made, of the best tier its Crafting level, scrap and shards allow and, of that tier, the kind the player has least of; crafts and supplies leave alone the scrap of the next two upgrades of every worn item (the study's `q1-keep`, `GEAR_POLICY` in `packages/sim/src/gear.ts`). Variants change `RULES` or the recipes with `--set`.
- **Options (trigger).** Where the guaranteed supply comes from. Tier odds are the shipped ones, recipes and scrap as before (3, 6, 10 scrap; no scrap in the first room), only the trigger differs. Cells: supplies used a week (b bought, f found on trips, d dungeon, c crafted, g gifts), then scrap held / team power / upgrade levels on worn gear.

  **Min-maxer**: supplies used a week (b bought, f found on trips, d dungeon, c crafted, g gifts)

  | Variant          | w1               | w4                 | w6                 | w12                 | w20                 |
  | ---------------- | ---------------- | ------------------ | ------------------ | ------------------- | ------------------- |
  | main (Bait buys) | 12 (5b 8f 0d 0c) | 31 (18b 14f 0d 0c) | 36 (24b 12f 0d 0c) | 31 (18b 12f 0d 0c)  | 49 (27b 19f 0d 0c)  |
  | per clear        | 20 (7f 5d 8c)    | 31 (13f 2d 15c)    | 29 (12f 1d 16c)    | 35 (13f 0d 22c)     | 51 (19f 0d 28c 3g)  |
  | per run          | 21 (7f 6d 9c)    | 36 (13f 7d 15c)    | 35 (13f 7d 16c)    | 40 (14f 6d 19c 1g)  | 52 (19f 7d 24c 3g)  |
  | per room         | 27 (7f 12d 9c)   | 43 (15f 14d 15c)   | 41 (13f 13d 15c)   | 41 (13f 12d 15c 1g) | 53 (20f 13d 18c 3g) |

  **Min-maxer**: scrap held / team power / upgrade levels on worn gear

  | Variant          | w1             | w4             | w6             | w12            | w20            |
  | ---------------- | -------------- | -------------- | -------------- | -------------- | -------------- |
  | main (Bait buys) | 3 / 290 / 2.9  | 4 / 628 / 6.7  | 4 / 727 / 9.2  | 5 / 894 / 11.5 | 5 / 942 / 11.7 |
  | per clear        | 10 / 303 / 2.7 | 34 / 685 / 6.7 | 25 / 817 / 9.6 | 6 / 930 / 11.8 | 4 / 943 / 12.1 |
  | per run          | 9 / 303 / 2.8  | 34 / 684 / 6.6 | 27 / 817 / 9.3 | 8 / 931 / 11.9 | 4 / 943 / 12.2 |
  | per room         | 10 / 307 / 2.9 | 37 / 684 / 6.8 | 35 / 821 / 9.3 | 9 / 928 / 11.8 | 4 / 943 / 12.2 |

  **Engaged**: supplies used a week (b bought, f found on trips, d dungeon, c crafted, g gifts)

  | Variant          | w1              | w4              | w6               | w12               | w20                |
  | ---------------- | --------------- | --------------- | ---------------- | ----------------- | ------------------ |
  | main (Bait buys) | 5 (1b 4f 0d 0c) | 8 (3b 5f 0d 0c) | 17 (8b 9f 0d 0c) | 19 (9b 10f 0d 0c) | 32 (15b 15f 0d 0c) |
  | per clear        | 9 (4f 5d 3c)    | 14 (6f 1d 7c)   | 17 (9f 1d 7c)    | 21 (10f 0d 10c)   | 27 (15f 0d 10c 1g) |
  | per run          | 10 (4f 6d 3c)   | 20 (7f 7d 6c)   | 24 (10f 7d 8c)   | 26 (10f 7d 10c)   | 32 (16f 5d 10c 2g) |
  | per room         | 14 (4f 11d 2c)  | 25 (7f 13d 5c)  | 29 (10f 12d 7c)  | 32 (10f 12d 9c)   | 35 (16f 8d 9c 2g)  |

  **Engaged**: scrap held / team power / upgrade levels on worn gear

  | Variant          | w1             | w4             | w6             | w12             | w20              |
  | ---------------- | -------------- | -------------- | -------------- | --------------- | ---------------- |
  | main (Bait buys) | 9 / 270 / 1.4  | 11 / 532 / 4.4 | 14 / 619 / 7.0 | 19 / 790 / 10.9 | 39 / 937 / 11.7  |
  | per clear        | 19 / 272 / 1.5 | 47 / 542 / 4.5 | 57 / 642 / 7.1 | 73 / 857 / 11.4 | 339 / 943 / 12.5 |
  | per run          | 20 / 272 / 1.4 | 44 / 547 / 4.5 | 59 / 649 / 7.2 | 68 / 870 / 11.6 | 305 / 943 / 12.6 |
  | per room         | 21 / 274 / 1.2 | 47 / 552 / 4.3 | 57 / 654 / 7.0 | 64 / 880 / 11.4 | 258 / 944 / 12.0 |

  **Regular**: supplies used a week (b bought, f found on trips, d dungeon, c crafted, g gifts)

  | Variant          | w1           | w4            | w6           | w12           | w20           |
  | ---------------- | ------------ | ------------- | ------------ | ------------- | ------------- |
  | main (Bait buys) | 1 (1f 0d 0c) | 2 (2f 0d 0c)  | 2 (2f 0d 0c) | 2 (2f 0d 0c)  | 3 (3f 0d 0c)  |
  | per clear        | 1 (1f 1d 0c) | 4 (2f 2d 0c)  | 3 (2f 1d 0c) | 3 (3f 1d 0c)  | 4 (3f 0d 1c)  |
  | per run          | 1 (1f 1d 0c) | 7 (3f 4d 0c)  | 7 (2f 4d 0c) | 8 (3f 4d 0c)  | 8 (4f 4d 1c)  |
  | per room         | 1 (1f 3d 0c) | 10 (3f 8d 0c) | 9 (2f 8d 0c) | 12 (4f 7d 0c) | 12 (4f 6d 0c) |

  **Regular**: scrap held / team power / upgrade levels on worn gear

  | Variant          | w1             | w4             | w6             | w12             | w20              |
  | ---------------- | -------------- | -------------- | -------------- | --------------- | ---------------- |
  | main (Bait buys) | 17 / 153 / 0.2 | 40 / 308 / 2.8 | 56 / 373 / 4.6 | 104 / 532 / 8.5 | 190 / 675 / 10.9 |
  | per clear        | 18 / 155 / 0.2 | 48 / 312 / 2.6 | 68 / 378 / 4.8 | 134 / 541 / 8.9 | 271 / 676 / 11.7 |
  | per run          | 18 / 153 / 0.2 | 49 / 309 / 2.8 | 71 / 378 / 4.7 | 146 / 538 / 8.9 | 285 / 680 / 11.5 |
  | per room         | 18 / 157 / 0.3 | 50 / 315 / 2.8 | 74 / 382 / 4.8 | 156 / 552 / 8.8 | 277 / 687 / 11.5 |

  **Drop-in**: supplies used a week (b bought, f found on trips, d dungeon, c crafted, g gifts)

  | Variant          | w1           | w4           | w6           | w12          | w20          |
  | ---------------- | ------------ | ------------ | ------------ | ------------ | ------------ |
  | main (Bait buys) | 0 (0f 0d 0c) | 0 (0f 0d 0c) | 0 (0f 0d 0c) | 0 (0f 0d 0c) | 0 (0f 0d 0c) |
  | per clear        | 0 (0f 0d 0c) | 1 (0f 1d 0c) | 1 (0f 1d 0c) | 1 (0f 1d 0c) | 1 (0f 0d 0c) |
  | per run          | 0 (0f 0d 0c) | 0 (0f 1d 0c) | 1 (0f 1d 0c) | 2 (1f 1d 0c) | 1 (0f 1d 0c) |
  | per room         | 0 (0f 0d 0c) | 1 (0f 2d 0c) | 1 (0f 2d 0c) | 2 (0f 2d 0c) | 2 (1f 2d 0c) |

  **Drop-in**: scrap held / team power / upgrade levels on worn gear

  | Variant          | w1            | w4             | w6             | w12            | w20             |
  | ---------------- | ------------- | -------------- | -------------- | -------------- | --------------- |
  | main (Bait buys) | 14 / 68 / 0.0 | 23 / 168 / 0.1 | 31 / 214 / 0.4 | 59 / 324 / 1.8 | 101 / 422 / 3.7 |
  | per clear        | 14 / 68 / 0.0 | 23 / 168 / 0.1 | 32 / 217 / 0.4 | 63 / 326 / 1.7 | 108 / 426 / 3.8 |
  | per run          | 14 / 68 / 0.0 | 24 / 176 / 0.1 | 32 / 223 / 0.3 | 63 / 324 / 1.9 | 111 / 421 / 3.9 |
  | per room         | 14 / 68 / 0.0 | 24 / 176 / 0.1 | 32 / 223 / 0.4 | 64 / 330 / 1.9 | 112 / 426 / 4.0 |

- **Reading (trigger).**
  - **Per clear (boss room)** gives a min-maxer 4.6, 2.4, 1.3, 0.2 and 0.1 dungeon supplies a week at weeks 1, 4, 6, 12 and 20, and a regular 1.1, 1.8, 1.1, 0.5 and 0.3: the depth wall (full clears fall to about 1 a week by week 6 and 0.1 after week 12) dries it up, so "a guaranteed supply" would be false for most of a player's life.
  - **Per room (1, 1, 1)** pays a min-maxer 12 to 14 a week and a regular 7.5 to 8, more than they can carry: a regular's stock sits at 8 to 10 at weeks 4 to 12, a drop-in's climbs to 13 at week 12 and 22 at week 30, and an engaged player's crafted share over weeks 3 to 12 falls to 23% (target 25% or more) because the dungeon keeps the stock full.
  - **Per run (first room cleared)** pays 6 to 7 a week to a min-maxer and an engaged player (5 after week 20), 4 to a regular and about 1 to a drop-in, every week, because the first room is cleared in almost every run even at the wall. Stocks stay at 1 to 5. Picked. A run lost in the first room pays nothing.
- **Options (scrap and recipes, on "per run").** More scrap and cheaper recipes: +1 scrap in the first and second room of a run (the dungeon's scrap doubles, about 9 a week for a regular); recipes 2, 4 and 7 scrap instead of 3, 6 and 10 (shards unchanged); and "shipped": the cheaper recipes with +1 scrap in the first room only. Cells as above.

  **Min-maxer**: supplies used a week (b bought, f found on trips, d dungeon, c crafted, g gifts)

  | Variant                                                 | w1               | w4                 | w6                 | w12                | w20                |
  | ------------------------------------------------------- | ---------------- | ------------------ | ------------------ | ------------------ | ------------------ |
  | main                                                    | 12 (5b 8f 0d 0c) | 31 (18b 14f 0d 0c) | 36 (24b 12f 0d 0c) | 31 (18b 12f 0d 0c) | 49 (27b 19f 0d 0c) |
  | per run                                                 | 21 (7f 6d 9c)    | 36 (13f 7d 15c)    | 35 (13f 7d 16c)    | 40 (14f 6d 19c 1g) | 52 (19f 7d 24c 3g) |
  | per run + 1 scrap in rooms 1 and 2                      | 25 (7f 6d 12c)   | 39 (13f 7d 19c)    | 38 (13f 7d 19c)    | 40 (13f 6d 20c 1g) | 53 (19f 7d 24c 2g) |
  | per run + cheaper recipes                               | 26 (7f 6d 13c)   | 42 (14f 7d 21c)    | 41 (13f 7d 22c)    | 41 (14f 6d 20c 1g) | 53 (20f 7d 24c 2g) |
  | per run + cheaper recipes + 1 scrap in room 1 (shipped) | 28 (7f 6d 15c)   | 45 (14f 7d 25c)    | 43 (13f 7d 24c)    | 41 (14f 6d 20c 1g) | 53 (19f 7d 25c 2g) |

  **Min-maxer**: scrap held / team power / upgrade levels on worn gear

  | Variant                                                 | w1             | w4             | w6             | w12            | w20            |
  | ------------------------------------------------------- | -------------- | -------------- | -------------- | -------------- | -------------- |
  | main                                                    | 3 / 290 / 2.9  | 4 / 628 / 6.7  | 4 / 727 / 9.2  | 5 / 894 / 11.5 | 5 / 942 / 11.7 |
  | per run                                                 | 9 / 303 / 2.8  | 34 / 684 / 6.6 | 27 / 817 / 9.3 | 8 / 931 / 11.9 | 4 / 943 / 12.2 |
  | per run + 1 scrap in rooms 1 and 2                      | 10 / 304 / 2.8 | 34 / 699 / 6.7 | 30 / 829 / 9.2 | 7 / 929 / 11.7 | 5 / 942 / 12.0 |
  | per run + cheaper recipes                               | 9 / 306 / 2.8  | 31 / 696 / 6.8 | 28 / 824 / 9.2 | 6 / 930 / 11.8 | 4 / 943 / 12.1 |
  | per run + cheaper recipes + 1 scrap in room 1 (shipped) | 9 / 305 / 2.7  | 34 / 694 / 6.7 | 33 / 822 / 9.1 | 9 / 929 / 11.9 | 4 / 943 / 12.2 |

  **Engaged**: supplies used a week (b bought, f found on trips, d dungeon, c crafted, g gifts)

  | Variant                                                 | w1              | w4              | w6               | w12               | w20                |
  | ------------------------------------------------------- | --------------- | --------------- | ---------------- | ----------------- | ------------------ |
  | main                                                    | 5 (1b 4f 0d 0c) | 8 (3b 5f 0d 0c) | 17 (8b 9f 0d 0c) | 19 (9b 10f 0d 0c) | 32 (15b 15f 0d 0c) |
  | per run                                                 | 10 (4f 6d 3c)   | 20 (7f 7d 6c)   | 24 (10f 7d 8c)   | 26 (10f 7d 10c)   | 32 (16f 5d 10c 2g) |
  | per run + 1 scrap in rooms 1 and 2                      | 11 (4f 6d 4c)   | 21 (7f 7d 8c)   | 25 (9f 7d 9c)    | 26 (10f 7d 9c)    | 33 (16f 5d 10c 2g) |
  | per run + cheaper recipes                               | 10 (4f 6d 3c)   | 21 (7f 7d 8c)   | 24 (10f 7d 8c)   | 27 (10f 7d 10c)   | 33 (16f 5d 10c 2g) |
  | per run + cheaper recipes + 1 scrap in room 1 (shipped) | 11 (4f 6d 4c)   | 21 (6f 7d 8c)   | 25 (10f 7d 9c)   | 26 (10f 7d 10c)   | 32 (16f 5d 9c 2g)  |

  **Engaged**: scrap held / team power / upgrade levels on worn gear

  | Variant                                                 | w1             | w4             | w6             | w12              | w20              |
  | ------------------------------------------------------- | -------------- | -------------- | -------------- | ---------------- | ---------------- |
  | main                                                    | 9 / 270 / 1.4  | 11 / 532 / 4.4 | 14 / 619 / 7.0 | 19 / 790 / 10.9  | 39 / 937 / 11.7  |
  | per run                                                 | 20 / 272 / 1.4 | 44 / 547 / 4.5 | 59 / 649 / 7.2 | 68 / 870 / 11.6  | 305 / 943 / 12.6 |
  | per run + 1 scrap in rooms 1 and 2                      | 26 / 273 / 1.4 | 63 / 551 / 4.6 | 85 / 650 / 7.1 | 121 / 876 / 11.7 | 448 / 943 / 12.5 |
  | per run + cheaper recipes                               | 21 / 272 / 1.4 | 55 / 549 / 4.6 | 73 / 650 / 7.4 | 127 / 873 / 11.6 | 516 / 944 / 12.6 |
  | per run + cheaper recipes + 1 scrap in room 1 (shipped) | 24 / 272 / 1.4 | 67 / 548 / 4.5 | 92 / 648 / 7.0 | 166 / 872 / 11.7 | 604 / 944 / 12.6 |

  **Regular**: supplies used a week (b bought, f found on trips, d dungeon, c crafted, g gifts)

  | Variant                                                 | w1           | w4           | w6           | w12          | w20          |
  | ------------------------------------------------------- | ------------ | ------------ | ------------ | ------------ | ------------ |
  | main                                                    | 1 (1f 0d 0c) | 2 (2f 0d 0c) | 2 (2f 0d 0c) | 2 (2f 0d 0c) | 3 (3f 0d 0c) |
  | per run                                                 | 1 (1f 1d 0c) | 7 (3f 4d 0c) | 7 (2f 4d 0c) | 8 (3f 4d 0c) | 8 (4f 4d 1c) |
  | per run + 1 scrap in rooms 1 and 2                      | 1 (1f 1d 0c) | 7 (3f 4d 0c) | 7 (2f 4d 0c) | 8 (3f 4d 0c) | 8 (4f 4d 0c) |
  | per run + cheaper recipes                               | 1 (1f 1d 0c) | 7 (2f 4d 0c) | 6 (2f 4d 0c) | 7 (3f 4d 0c) | 8 (4f 4d 0c) |
  | per run + cheaper recipes + 1 scrap in room 1 (shipped) | 1 (1f 1d 0c) | 7 (2f 4d 0c) | 6 (2f 4d 0c) | 7 (3f 4d 0c) | 8 (4f 4d 0c) |

  **Regular**: scrap held / team power / upgrade levels on worn gear

  | Variant                                                 | w1             | w4             | w6              | w12             | w20              |
  | ------------------------------------------------------- | -------------- | -------------- | --------------- | --------------- | ---------------- |
  | main                                                    | 17 / 153 / 0.2 | 40 / 308 / 2.8 | 56 / 373 / 4.6  | 104 / 532 / 8.5 | 190 / 675 / 10.9 |
  | per run                                                 | 18 / 153 / 0.2 | 49 / 309 / 2.8 | 71 / 378 / 4.7  | 146 / 538 / 8.9 | 285 / 680 / 11.5 |
  | per run + 1 scrap in rooms 1 and 2                      | 21 / 154 / 0.2 | 71 / 310 / 3.0 | 107 / 378 / 4.9 | 224 / 544 / 8.9 | 424 / 680 / 11.6 |
  | per run + cheaper recipes                               | 19 / 154 / 0.2 | 51 / 312 / 2.6 | 71 / 381 / 5.0  | 147 / 542 / 8.9 | 289 / 681 / 11.6 |
  | per run + cheaper recipes + 1 scrap in room 1 (shipped) | 19 / 153 / 0.2 | 61 / 310 / 3.0 | 93 / 376 / 4.4  | 190 / 541 / 8.7 | 367 / 681 / 11.6 |

  **Drop-in**: supplies used a week (b bought, f found on trips, d dungeon, c crafted, g gifts)

  | Variant                                                 | w1           | w4           | w6           | w12          | w20          |
  | ------------------------------------------------------- | ------------ | ------------ | ------------ | ------------ | ------------ |
  | main                                                    | 0 (0f 0d 0c) | 0 (0f 0d 0c) | 0 (0f 0d 0c) | 0 (0f 0d 0c) | 0 (0f 0d 0c) |
  | per run                                                 | 0 (0f 0d 0c) | 0 (0f 1d 0c) | 1 (0f 1d 0c) | 2 (1f 1d 0c) | 1 (0f 1d 0c) |
  | per run + 1 scrap in rooms 1 and 2                      | 0 (0f 0d 0c) | 0 (0f 1d 0c) | 1 (0f 1d 0c) | 1 (0f 1d 0c) | 1 (0f 1d 0c) |
  | per run + cheaper recipes                               | 0 (0f 0d 0c) | 0 (0f 1d 0c) | 1 (0f 1d 0c) | 1 (1f 1d 0c) | 1 (0f 1d 0c) |
  | per run + cheaper recipes + 1 scrap in room 1 (shipped) | 0 (0f 0d 0c) | 0 (0f 1d 0c) | 1 (0f 1d 0c) | 1 (0f 1d 0c) | 2 (0f 1d 0c) |

  **Drop-in**: scrap held / team power / upgrade levels on worn gear

  | Variant                                                 | w1            | w4             | w6             | w12            | w20             |
  | ------------------------------------------------------- | ------------- | -------------- | -------------- | -------------- | --------------- |
  | main                                                    | 14 / 68 / 0.0 | 23 / 168 / 0.1 | 31 / 214 / 0.4 | 59 / 324 / 1.8 | 101 / 422 / 3.7 |
  | per run                                                 | 14 / 68 / 0.0 | 24 / 176 / 0.1 | 32 / 223 / 0.3 | 63 / 324 / 1.9 | 111 / 421 / 3.9 |
  | per run + 1 scrap in rooms 1 and 2                      | 14 / 68 / 0.0 | 27 / 174 / 0.1 | 41 / 225 / 0.6 | 86 / 327 / 1.9 | 148 / 424 / 4.0 |
  | per run + cheaper recipes                               | 14 / 68 / 0.0 | 24 / 170 / 0.1 | 31 / 218 / 0.4 | 62 / 326 / 1.9 | 108 / 423 / 3.9 |
  | per run + cheaper recipes + 1 scrap in room 1 (shipped) | 14 / 68 / 0.0 | 25 / 173 / 0.1 | 36 / 224 / 0.4 | 76 / 330 / 1.8 | 132 / 430 / 4.5 |

- **Reading (scrap and recipes).**
  - Scrap is not what limits crafting for engaged, regular and drop-in players: their scrap piles grow whatever is added (engaged 305 at week 20 and regular 285 with no extra scrap at all, against main's 39 and 190), because their workshop turns now make cheap supplies instead of gear that was salvaged back into scrap. What limits a min-maxer's crafting is that supplies and gear compete for the same scrap (scrap blocked the gear path on 82% of a min-maxer's days in main and 65% to 67% in every variant).
  - Extra scrap and cheaper recipes each raise a min-maxer's crafting by 20% to 45% in weeks 1 to 6 (9, 15, 16 crafted a week at weeks 1, 4, 6 on "per run" against 12, 19, 19 with the extra scrap and 13, 21, 22 with cheaper recipes), and shipped (both, with half the extra scrap) by 50% to 70% (15, 25, 24), all at main's gear pace (2.7, 6.7 and 9.1 levels at weeks 1, 4 and 6 against 2.9, 6.7 and 9.2; 11.9 and 12.2 at weeks 12 and 20 against 11.5 and 11.7). From week 12 a min-maxer's crafting is limited by the stock target (it makes what it uses), not by scrap.
  - The price is the piles of players who do not craft: shipped adds about 80 scrap to a regular's pile at week 20 (367 against 285 without it, main 190) and 300 to an engaged player's (604 against 305, main 39). The target "no new scrap pile for regulars beyond main's" is not met by any variant (the one with no extra scrap already holds 285 against 190); shipped keeps the extra small.
- **Action.**
  - `RULES.dungeon.perRoom[]` gained `supply` (1, 0, 0) and the first room pays 1 scrap (it was 0): a run that clears its first room brings home a supply, a lost run included. `RULES.dungeon.supplyTiers`: good tier from depth 4 (15% at depth 4, +4 points a depth, at most 50%), great from depth 12 (5% at depth 12, +2 points a depth, at most 25%), the rest basic, the kind drawn evenly. A new player gets basic supplies only until depth 4; a min-maxer at the depth wall (about 22) gets about 25% basic, 50% good and 25% great.
  - Supply recipes: scrap 2, 4 and 7 (`supplies.json`); shards and Crafting levels unchanged. The content field `price` became `worth` (sim only).
  - Supplies are not for sale: the send refuses `buy` with `supplies_not_for_sale`; the UI sells nothing. See `decisions.md` 2026-10-16.
  - Sim: the `supplyPercent` dial and the Bait budget are gone; `pnpm sim:supplies`; `pnpm sim` has a supplies study and five targets (`supplies-*`, 66 targets in all); the legacy digest was re-pinned.
- **Expected.** Every profile uses supplies every week (regular 3 or more, min-maxer 8 or more); at least a quarter of the supplies of engaged and min-maxer players are crafted; a min-maxer's gear levels are not behind main; the `curve-*` raid targets still pass (they did not: see the outcome).
- **Outcome (sim; the "shipped" rows above, the same run, against main).** Weeks 3 to 12: a regular carries 6.6 supplies a week (main 2), a min-maxer 42 (main 31), an engaged player 25 (main 15), a drop-in 1.0 (0.2); crafted share 55% for a min-maxer and 37% for an engaged player (main 0%); a min-maxer's upgrade levels at week 12 are 11.9 (main 11.5), team power at weeks 4, 6 and 12 is 694, 822 and 929 (main 628, 727 and 894: the Bait that no longer goes to supplies trains creatures). Currencies held, main against shipped (Bait / Essence / glimmer / shards / scrap):

  | Profile   | Week | main: Bait / Essence / glimmer / shards / scrap | shipped                     |
  | --------- | ---- | ----------------------------------------------- | --------------------------- |
  | Min-maxer | w12  | 25 / 323 / 33 / 112 / 5                         | 20 / 240 / 32 / 1 / 9       |
  | Min-maxer | w20  | 26 / 849 / 82 / 251 / 5                         | 3481 / 741 / 79 / 1 / 4     |
  | Min-maxer | w30  | 4709 / 1566 / 138 / 453 / 4                     | 14814 / 1391 / 130 / 1 / 5  |
  | Engaged   | w12  | 20 / 214 / 10 / 48 / 19                         | 27 / 196 / 11 / 2 / 166     |
  | Engaged   | w20  | 18 / 723 / 45 / 139 / 39                        | 22 / 632 / 46 / 6 / 604     |
  | Engaged   | w30  | 2362 / 1391 / 97 / 302 / 59                     | 7986 / 1267 / 97 / 5 / 1489 |
  | Regular   | w12  | 7 / 157 / 2 / 14 / 104                          | 7 / 176 / 2 / 14 / 190      |
  | Regular   | w20  | 12 / 320 / 4 / 25 / 190                         | 10 / 349 / 4 / 25 / 367     |
  | Regular   | w30  | 14 / 733 / 8 / 43 / 298                         | 17 / 770 / 9 / 39 / 604     |
  | Drop-in   | w12  | 4 / 310 / 1 / 6 / 59                            | 5 / 342 / 1 / 6 / 76        |
  | Drop-in   | w20  | 4 / 558 / 2 / 10 / 101                          | 4 / 598 / 2 / 10 / 132      |
  | Drop-in   | w30  | 4 / 892 / 4 / 15 / 169                          | 4 / 885 / 3 / 15 / 206      |

  Raid targets: the raid targets are NOT all met: players are 5% to 12% stronger at weeks 4 to 12 (the Bait that no longer goes to supplies trains creatures), and the raid curve (B-010, live) was left alone on the lead's instruction. Full `pnpm sim` on seeds leet, leet2 and leet3 (66 targets, 5 of them new): 62, 64 and 62 pass. Failing, with the value before the rework (B-010: 61 of 61 passing): `curve-r2to5-default` 86.3%, 85.3% and 87.0% (limit 85%; before 82%), `curve-r6up-default` 69.3% on leet3 only (limit 65%; 61.8% and 56.9% pass; before 56%), `raid-finale-typical` 97.5% and 97.9% on leet and leet3 (limit 97%; 97.0% passes on leet2; before 92% to 93%), `raid-ko-share` 7.1%, 7.5% and 6.8% (limit 10%; before 11% to 13%) and `choice-creature-min` 0.598x on leet (limit 0.60x). A retune of ranks 2 to 15 that fixes all of them (HP +4% to +6%, Attack +10% to +15%) puts every one of these inside its limit but pushes `longrun-loss-streak` to 15% to 27% on most seeds (limit 10%; 5% to 7.5% before), so it was not shipped (see the follow-ups).

- **Follow-ups.**
  - **Bait piles up once every creature is at its cap** (min-maxer: 3,481 at week 20 and 14,814 at week 30 against 26 and 4,709; engaged 7,986 at week 30 against 2,362): main spent 250 to 480 a week on supplies, and that was the only Bait sink at the ceiling. This is the "no endgame" finding of the progression study (levels 31 to 40 would use it); not caused by the dungeon or the workshop, but now it is not hidden.
  - **Scrap has no sink for players who do not craft** (regular 367 and 604 at weeks 20 and 30 against 190 and 298; engaged 604 and 1,489 against 39 and 59): a use for scrap beyond a full set of +5 upgrades, or salvaging scrap into shards, would fix it.
  - **Shards are the next limit on the higher tiers**: a min-maxer holds 1 shard from week 12 (main 112) because crafting good supplies spends them all, and great supplies are about one in twenty of what is crafted. More shard income if great supplies should be common.
  - **The raid is a little easier than the curve intends in weeks 4 to 12.** Misa's call whether to retune (the curve is live). A tested fix: ranks 2 to 5 HP +5% and Attack +15%, ranks 6 to 15 HP 0% to +4% and Attack +8% to +12%: every `curve-*`, `raid-finale-typical`, `raid-ko-share` and `choice-creature-min` target inside its limit on three seeds, but `longrun-loss-streak` then fails on most seeds (15% to 27% against 10%), so the loss-streak target would need re-basing as well.
  - Watch live: supplies per run (`dungeon_reward.supplies`), crafted supplies (`job_claim`) and the stock of regular players (the sim has them at 2 to 3).

### B-012: Gear A: Hat, Scarf and Charm with item levels and tiered lines (open)

- **Opened:** 2026-10-16, build step 2 of `docs/design/gear-and-creatures-v2.md` (section 14); the targets are section 4 ("Gear's share of power over the journey").
- **Finding.** Before Gear A, gear was a +5 ladder: the stat-power share of a daily player's raid team was 12.6% at week 8 and stopped growing at week 12 to 18 (the design's "13% at the plateau"). The design wants gear to be the main growth once creature growth slows: 5 to 10% at week 2 and 33 to 40% from week 30 for a committed player, less for the others.
- **Method.** `pnpm sim` (full) on seeds `leet` and `leet2`, and the same on the branch before Gear A (3387b71, "base") with the same seeds. The new gear study (`packages/sim/src/gear-study.ts`): 20 servers of the default journey mix (1 min-maxer, 3 engaged, 3 regular, 2 drop-in) for 30 weeks; the share is `1 - bare / full`, where `full` is the fight-scored power (`fight-power.ts`) of the three strongest creatures and `bare` the same three with their gear taken off; the median of a profile's players at the end of the week. The sim's policy: Equip best (the game's `planEquipBest`) for the three strongest creatures, dismantle everything unworn except the 3 best spares, a supply when fewer than 4 are in stock, else the craft whose plain item adds most to a team creature; drops, item levels and the trip and Workshop lines as the worker has them (`GEAR_POLICY` in `packages/sim/src/gear.ts`).
- **What shipped (starting values, `RULES.gear` and the content files).** Items of three slots with 22 bases and about 40 lines (more with the per-element ones); tier bands by item level (I at 1, II at 5, III at 10, IV at 15, V at 20) with roll weights 15 / 30 / 30 / 25 counted down from the best tier; item level by source (finale `3 + Boss Rank`, Festival `5 + Boss Rank`, dungeon by depth, trips twice the explorer rank, crafts twice the Crafting level); the wear rule (Hat 1, Scarf 7, Charm 13, item level at most the creature's level). Upgrades, Improve and enchants are gone. See `decisions.md` 2026-10-16 (Gear A built).
- **Outcome (sim): gear's share of fight-scored power against the targets.** Seed `leet`, medians; the target range in brackets.

  | Profile   | Week 2         | Week 8           | Week 20          | Week 30          |
  | --------- | -------------- | ---------------- | ---------------- | ---------------- |
  | Min-maxer | 6.0% (5 to 10) | 12.3% (15 to 22) | 22.9% (25 to 32) | 25.5% (33 to 40) |
  | Engaged   | 4.7% (5 to 10) | 9.9% (15 to 22)  | 15.1% (25 to 32) | 18.8% (33 to 40) |
  | Regular   | 1.6% (3 to 6)  | 6.2% (10 to 15)  | 10.4% (18 to 24) | 13.9% (28 to 34) |
  | Drop-in   | 1.0% (0 to 3)  | 4.1% (5 to 8)    | 6.7% (10 to 15)  | 9.8% (15 to 20)  |

  Seed `leet2` is within a point of every cell (min-maxer 4.9, 11.8, 22.5 and 25.1%; engaged 4.3, 9.8, 14.9 and 18.6%; regular 1.6, 6.2, 11.1 and 13.4%; drop-in 0.9, 3.1, 7.4 and 10.7%). **14 of the 16 targets fail on `leet` and 15 on `leet2`**: only the week 2 cells of the min-maxer (on `leet`) and the drop-in pass. Every profile is on the right shape (the share grows from week 2 to week 30 and the profiles keep their order), but short of the design by a third at the plateau (a min-maxer 25% against 33 to 40%, a regular 14% against 28 to 34%). Not tuned: these are the first numbers of the rules as designed.

- **Reading.**
  - The shortfall follows from item levels. A finale piece is `3 + Boss Rank`, so a server that climbs the rank ladder slowly gets pieces of item level 12 to 14: tier III at best (tier IV needs item level 15, V needs 20). What the players wear at week 30 (looked at for the min-maxer and three others) is mostly Rare pieces of item level 12 to 20 with tier II to III lines; the min-maxer wears a few tier IV and V lines (a tier V Attack on a level 20 Hat, a tier V Payoff's pounce).
  - Crafting adds little yet: a craft is Common at item level twice the Crafting level, and the Reach, the dismantle ranges and the well-thumbed marks of the crafting loop (Gear B) are what make crafting a way to reach good items. The design's plateau ("tier V lines and better-fitting items") assumes both.
  - The old stat-power share is 7.9% at week 8 (it was 12.6%): most of the new lines are conditional (Hunter, Ward, Reaction, position lines) and show up in fights, not in Attack plus HP. That is why the target moved to the fight-scored share.
  - Not measured: the three side conditions of section 4 (gear gives at least 70% of a committed player's further raid power growth once the trio is level 30; an upgrade worth at least 2% of team power every two weeks up to week 30; nobody completes a perfect set in 30 weeks). The share table above is the main evidence for them; they need a per-item study.
- **Outcome (sim): the other targets and the raid drift (report only).** 78 targets: 61 pass on `leet` (base: 62 of 66) and 59 on `leet2` (base 64 of 66); 14 or 15 of the failures are the gear share. Without them, the others, with the value on base:

  | Target                            | base `leet` | Gear A `leet` | base `leet2` | Gear A `leet2` |
  | --------------------------------- | ----------- | ------------- | ------------ | -------------- |
  | `raid-finale-typical` (85 to 97%) | 97.5%       | 96.9%         | 97.0%        | 98.3%          |
  | `raid-ko-share` (10 to 30%)       | 7.1%        | 6.8%          | 7.5%         | 6.1%           |
  | `curve-r2to5-default` (70 to 85%) | 86.3%       | 88.9%         | 85.3%        | 85.0%          |
  | `curve-r6up-default` (45 to 65%)  | 61.8%       | 59.7%         | 56.9%        | 68.8%          |
  | `choice-creature-min` (>= 0.60x)  | 0.598x      | 0.623x        | 0.610x       | 0.619x         |
  | `exp-casual-discovery` (<= 0.45)  | 0.36        | 0.52          | 0.42         | 0.59           |
  | `gear-first-craft` (<= 7 days)    | 1.4         | 1.4           | 1.4          | 1.4            |
  | `gear-newcomer-catchup` (>= 60%)  | 70%         | 92%           | 78%          | 83%            |

  The raid targets already failed on base (`raid-ko-share` and `curve-r2to5-default` on both seeds) and move by one to three points in either direction; the raid is a little easier from the gear (`curve-r6up-default` 68.8% on `leet2`, a fail; 59.7% on `leet`, a pass) and the expected retune comes with the raid and dungeon rebalance (build step 8), as the design says. `exp-casual-discovery` (casual players own up to 0.5 species more than today's expeditions give; the target's own noise is about half a species) crossed its limit on both seeds in the runs with the neutral welcome blueprint (0.38 on `leet` in the run before that change, 0.52 after it): the casual species counts differ by 0.1 to 0.2 species at weeks 9 to 12, which is the measure's noise, but I did not find a cause. No retune was made.

- **Action.**
  - The welcome kit's blueprint is now always a neutral piece (a Hat, Scarf or Charm, evenly), which costs scrap only: with a random one, about half of the new players needed a shard before their first craft and `gear-first-craft` read 9.8 days (limit 7); with it 1.4.
  - Targets: 16 added (`gear-share-<profile>-week<N>`); retired `gear-share-week8` (stat-power share), `gear-essence-week12` and `gear-essence-growth` (gear no longer sinks Essence: the Essence a player holds is now whatever evolution leaves, until the Reach and the dungeon's choice rooms use it) and `supplies-minmaxer-gear` (upgrade levels no longer exist). The legacy digest was re-pinned; the scalar files were regenerated.
- **Expected.** The gear share grows with the crafting loop (Gear B) and with higher Boss Ranks; revisit the numbers (item level by source, tier weights) with the raid and dungeon rebalance rather than before it.
- **Follow-ups.**
  - Gear B, then rerun the gear study: the Reach (a crafter can aim for a higher tier) and the dismantle ranges are the missing source of good items; expect the committed profiles to move most.
  - Decide whether the finale item level should follow the rank faster (`RULES.gear.itemLevel.finale.base`), or the tier bands move down, once the raid curve is retuned: at ranks 9 to 11 the finale cannot give tier IV.
  - A per-item study for the three side conditions of section 4 (growth share after level 30, upgrade cadence, perfect set).
  - `Growing` (creature experience from every activity) is not in the first gear release: it needs training by activity (Creatures B).

### B-013: Gear B: Reach, dismantle jobs and well-thumbed marks (open)

- **Opened:** 2026-10-16, build step 3 of `docs/design/gear-and-creatures-v2.md` (section 14); the targets are section 4. It reruns the Gear A gear share study (B-012) with the crafting loop in.
- **What shipped (starting values, `RULES.gear.craft` and `RULES.gear.dismantle`).** Reach for Rare (Crafting level 3, 25 Essence, 1 more shard, 6 hours: Rare 60%, Common 40%) and Reach for Epic (level 6, 70 Essence, 2 more shards, 1 glimmer, 10 hours: Epic 30%, Rare 55%, Common 15%); the one-step-up chance (1 point per Crafting level above 1, 1 per well-thumbed mark, at most 10 marks); dismantle as a Workshop job (Commons in bundles of 5 in 15 minutes, a Rare 1 hour, an Epic 2 hours; refund ranges with Essence, 1 scrap more at each end per 5 item levels, independent of the worker; 6% and 1 point per Crafting level to learn the blueprint or add a mark); repeat blueprint finds add marks. See `decisions.md` 2026-10-16 (Gear B built).
- **Method.** The gear study of B-012 unchanged (`packages/sim/src/gear-study.ts`: 20 servers of the default mix, 30 weeks, median `1 - bare / full` of fight-scored power per profile), seeds `leet:gear` and `leet2:gear`, and the same on Gear A (B-012) for the "before" column. The sim's workshop policy now aims each craft with the biggest Reach the creature's level, the parts and the Essence above 40 (kept for evolutions) allow, and takes spare items apart in dismantle jobs (first job of a check-in crafts, the second dismantles: a bundle of up to 5 Commons once 3 wait, or an Epic, Festival or Rare piece alone), instead of dismantling instantly. Per-profile counters from 6 servers of `leet:gear`.
- **Outcome (sim): gear's share of fight-scored power, before (Gear A) and after (Gear B), against the targets.** Seed `leet`, medians; the target range in brackets.

  | Profile   | Week 2               | Week 8                  | Week 20                 | Week 30                 |
  | --------- | -------------------- | ----------------------- | ----------------------- | ----------------------- |
  | Min-maxer | 6.0 → 5.1% (5 to 10) | 12.3 → 11.9% (15 to 22) | 22.9 → 25.7% (25 to 32) | 25.5 → 28.1% (33 to 40) |
  | Engaged   | 4.7 → 4.9% (5 to 10) | 9.9 → 10.1% (15 to 22)  | 15.1 → 15.3% (25 to 32) | 18.8 → 18.1% (33 to 40) |
  | Regular   | 1.6 → 1.1% (3 to 6)  | 6.2 → 6.1% (10 to 15)   | 10.4 → 10.1% (18 to 24) | 13.9 → 13.4% (28 to 34) |
  | Drop-in   | 1.0 → 1.2% (0 to 3)  | 4.1 → 3.2% (5 to 8)     | 6.7 → 8.1% (10 to 15)   | 9.8 → 10.6% (15 to 20)  |

  Seed `leet2` (Gear A → Gear B): min-maxer 4.9 → 4.5, 11.8 → 12.7, 22.5 → 26.2, 25.1 → 27.9%; engaged 4.3 → 4.2, 9.8 → 9.9, 14.9 → 15.6, 18.6 → 18.9%; regular 1.6 → 1.3, 6.2 → 6.3, 11.1 → 10.9, 13.4 → 13.0%; drop-in 0.9 → 0.9, 3.1 → 3.4, 7.4 → 7.2, 10.7 → 9.7%. **3 of the 16 targets pass on `leet` (before: 2) and 2 on `leet2` (before: 1)**: the min-maxer's week 20, the drop-in's and (on `leet`) the min-maxer's week 2. Only the committed profiles move, and only from week 20: a min-maxer gains about 3 points at weeks 20 and 30 on both seeds; the others stay within a point or two (noise). Not tuned: these are the numbers of the rules as designed.

- **Per player over 30 weeks (6 servers of `leet:gear`).**

  | Profile   | Crafts | Reaches (of them Epic) | Items dismantled | Essence from dismantling | Essence unspent at week 30 | Crafting level |
  | --------- | ------ | ---------------------- | ---------------- | ------------------------ | -------------------------- | -------------- |
  | Min-maxer | 1,089  | 17.0 (1.0)             | 1,159            | 1,521                    | 3,388                      | 10             |
  | Engaged   | 37     | 10.3 (3.0)             | 80               | 286                      | 2,073                      | 10             |
  | Regular   | 8      | 1.9 (0.0)              | 4                | 5                        | 1,560                      | 3              |
  | Drop-in   | 0      | 0                      | 0                | 0                        | 908                        | 1              |

- **Reading.**
  - **The Reach is barely used.** A min-maxer reaches 17 times in 30 weeks (one Epic), an engaged player 10: shards and glimmer limit it, not Essence (every profile ends with far more Essence than it spends: 3,388 for a min-maxer, 908 even for a drop-in). A Reach costs one or two shards more than a plain craft, and plain crafts, supplies and the earlier Reaches eat the same shards. So "spare Essence's main sink" does not yet sink much: at these numbers Essence is not scarce and the shard is the real price. The design's own estimate (about one Reach for Epic and one for Rare a week for a committed player) is far above what the sim's shard income allows.
  - **Plain crafting is nearly free at high item level, and that is what moves the share.** A min-maxer makes about 1,090 crafts and dismantles about 1,160 items in 30 weeks. A neutral Common costs 8 scrap and no shard; dismantled at item level 20 it returns 6 to 10 scrap (the 1 scrap per 5 item levels at both ends), so the loop is close to scrap-neutral, and only slot time limits it. Equip best then picks the best of a very large number of Commons. This is the "free lottery" the design wanted to avoid ("a bad one is dismantled for a fraction of its cost"). A variant that saves shards for the Reach (a player who can aim for a Rare never makes a plain craft) was measured: the min-maxer falls to 5.1, 9.9, 17.0 and 20.1% at weeks 2, 8, 20 and 30 (engaged 4.9, 9.2, 13.7, 17.7; regular 1.1, 5.9, 10.4, 12.3; drop-in 1.2, 2.6, 7.7, 9.8): a Reach, as priced, is worth less than the plain Commons its shards would make. The shipped policy is the greedy one (Reach when it can be paid, a plain craft otherwise).
  - **Engaged, regular and drop-in players barely move:** their supply of shards and glimmer is small, their Crafting level is 10, 3 and 1, and what they find decides their gear (finale pieces at `3 + Boss Rank`).
  - Not measured: the three side conditions of section 4 (growth share after level 30, upgrade cadence, perfect set); they need a per-item study.
- **Action.** Superseded by B-015, which closed the free lottery and made the Reach worth its price. As measured here: none tuned. The shortfall against the targets is mostly outside crafting (item level by source, B-012), and the two crafting findings above are for the lead and Misa to decide, not for a guess here: (1) the Common refund's scrap bonus by item level makes plain crafting free; (2) the Reach's price in shards keeps it from being the sink the design wants.
- **Expected.** The gear share grows further with the raid and dungeon rebalance (build step 8) and with the creature steps (talents and training by activity change who is worth gearing).
- **Follow-ups.**
  - Decide how to make the Reach the better use of a shard: options are no extra shard (Essence and glimmer only), a smaller scrap bonus for Commons (`RULES.gear.dismantle.scrapPerItemLevels`, or none for Commons), or a Common craft cost that rises with item level. Measure with this study (`--set` is not wired for it: change `RULES` and rerun).
  - A Boons step Market Day effect (`WorkshopMods`) only matters if crafting is a scarce activity; revisit after the point above.
  - Creature experience from Workshop jobs: the creatures step reads `workshop_jobs.work_minutes` (4 experience per hour).

### B-014: Creatures A: talents, the duplicate choice and fewer catches with Bait lures (open)

- **Opened:** 2026-10-16, build step 4 of `docs/design/gear-and-creatures-v2.md` (section 14) with the expedition change of 9.5. (The id is B-014 because Gear B took B-013 on its branch.)
- **Finding.** Before this step a trip always brought a creature: a min-maxer got about 84 creatures and 84 duplicates a week (an engaged player 60, a regular 11.5), nearly all duplicates fused or, at five fusions, turned into Bait, and the base catalogue (all 12 species a trip can find) was complete in week 3 for a min-maxer, 5 for an engaged player and 16 for a regular (the study with every roll bringing a creature; the brief's "today 6/12/40" comes from another measure, and the review target is about 9, 14 and 24). Misa asked for fewer catches and fewer duplicates, a mix of other finds, lures crafted from Bait, and a catch (even a duplicate) that matters through talents.
- **Method.** The new creatures study (`packages/sim/src/creatures-study.ts`, `pnpm sim:creatures`): the default journey server (1 min-maxer, 3 engaged, 3 regular, 2 drop-in), 3 seeds x 8 servers x 30 weeks, seeds `creatures` and `other`; weeks 3 to 30 averaged. "Before" is the same study with every roll bringing a creature (`catchBp` 10000), no lure effect and the old dupe shield of 4; duplicates are answered with Recommended in both. The sim player takes Recommended for every duplicate at once, fills open talent slots from the Talent Book for 10 Bait, and crafts a lure only with Bait in the purse and within a quarter of the week's Bait earned (training runs first). The talents' share of power is `1 - fightPowerNoTalents / fightPower` (the raid team's fight-scored power with its talents taken away, signature talents too, gear kept). The numbers were found with `--set` variants (about 20 runs of the study): catch chances by length, lure chances, and the dupe shield streak.
- **What shipped (starting values).** A catch roll brings a creature with chance Short 3%, Medium 6%, Long 18%, Day 18% (`RULES.expeditions.lengths.<length>.catchBp`), else a small find of 1 or 2 scrap (`findScrap`); the first expedition still guarantees the Zipmouse; the dupe shield starts at a streak of 3. Lures: Plain +5% to the roll and 25% to draw a species the player lacks, Sweet +9% and 45%, Golden +15% and 70%; they cost 12, 30 and 60 Bait and a little scrap (`supplies.json`). Talents: 1 in 20 golden at 1.5 times, slots at level 1, 20 and 25, 10 Bait to slot from the book, at most 10 cards waiting, Release pays 3, 6 or 12 scrap by rarity (`RULES.talents`). Lures are no longer dropped by trips or the dungeon.
- **Outcome (sim): what catching brings now** (seed `creatures`; seed `other` is within a few percent of every cell).

  | Profile   | Creatures a week (before) | Duplicates a week (before) | Taught / fused / released a week | Catalogue complete (week, share who did; before) |
  | --------- | ------------------------- | -------------------------- | -------------------------------- | ------------------------------------------------ |
  | Min-maxer | 15.2 (83.6)               | 15.0 (83.5)                | 1.4 / 2.0 / 11.6                 | 6, 100% (3, 100%)                                |
  | Engaged   | 10.4 (60.4)               | 10.1 (60.3)                | 1.4 / 2.1 / 6.7                  | 12, 100% (5, 100%)                               |
  | Regular   | 2.2 (11.5)                | 1.8 (11.2)                 | 0.6 / 0.9 / 0.4                  | 28, 29% (16, 97%)                                |
  | Drop-in   | 0.4 (1.5)                 | 0.2 (1.2)                  | 0.1 / 0.1 / 0                    | never, 0% (21, 2%)                               |

  Seed `other`: catalogue weeks 7, 12 and 26.5 (33% of regulars). The catalogue is complete in 6 to 7, 12 and 26 to 28 weeks for a min-maxer, an engaged player and a regular, against the review target of 9, 14 and 24: **the catalogue is 2 to 3 times slower than with a creature on every roll, and still short of the review target at both ends: the min-maxer is a little too fast and the regular too slow** (only a third of regulars finish within 30 weeks). Creatures a week fall 5 to 6 times for the committed profiles and regular (4 times for the drop-in), and the duplicates fall by the same factor.

- **Outcome (sim): Bait and talents.** Bait earned a week (levels, lures, talent slots): min-maxer 326 (330, 50, 4), engaged 299 (310, 27, 3), regular 169 (172, 1, 2), drop-in 47 (47, 0, 0): a min-maxer puts 15% of its Bait into lures (3 lures made and carried a week), an engaged player 9%, the others nothing; levels stay the main use of Bait for everybody. Talents' share of the raid team's fight-scored power at weeks 2, 8, 20 and 30: min-maxer 3.8%, 7.4%, 9.8% and 12.0%; engaged 2.3%, 3.9%, 7.5% and 11.5%; regular 2.1%, 3.3%, 4.0% and 4.8%; drop-in 1.1%, 2.3%, 3.7% and 3.8%. Golden talents rolled a week: 0.7 for a min-maxer, 0.5 for an engaged player.
- **Reading.**
  - **Most duplicates of a committed player are released.** With every species owned by week 6 to 12, a min-maxer's 15 duplicates a week are 1.4 taught, 2.0 fused and 11.6 released (before: 80.6 of 83.5 released): the 5 fusions of 12 lines and the talents it needs are done in about a month, and Release pays only scrap (3 for a Common). Release is the sink the design wanted, but 11.6 a week is a lot of scrap (about 35, against a Common craft costing a few). Either the catch chances for the committed fall further or Release pays something that does not flood the Workshop.
  - **The catalogue pace does not follow the catch chances much below a point.** A min-maxer rolls 80 times a week and an engaged player 56, so both complete the catalogue after about 70 to 100 creatures whatever the chance, because each place's deep and rarer species are what is missing; the regular rolls 11 times a week and is held back by the volume. In the variants tried, a min-maxer's week was 5 to 8.5 for 12 to 22 creatures a week, and a regular's 24 to 30 for 2 to 3.3 a week. Lures move the pace little (a min-maxer makes 3 a week; the dupe shield streak 2, 3 or 4 changed the weeks by about one). Getting both the min-maxer to 9 and the regular to 24 needs a different lever than the chance per roll (a "new species" pity for players with few rolls, or deeper species weighted by rank) and is left to Misa's review.
  - **Talents give a committed player about 10% of their raid power at week 30, and a regular 5%.** They start small (a talent is about a tier III line) and grow with the number of slots opened (level 20) and with golden ones; the share before week 20 is mostly slot 1.
  - **Fewer duplicates mean fewer fusions, and the raids feel it** (below): fusion was +20% stats on every creature of a player by week 2 to 3; now a min-maxer fuses 2 a week.
- **Outcome (sim): drift of the other targets (report only; the raid is not tuned in this step).** `pnpm sim` (full) on seeds `leet` and `leet2`: 89 targets, 66 pass and 23 fail on both (Gear A: 61 of 78 on `leet`, 59 of 78 on `leet2`). The gear share targets are as in B-012 (14 fail; engaged and regular a point or two higher or lower). A dash is a target B-012 did not list. The raid targets moved a lot, because the team is weaker without free fusions (the pinned legacy run's first player's top-3 power at week 8 is 430, was 595) and Bait no longer comes back from duplicates:

  | Target                            | Gear A `leet` | Creatures A `leet` | Gear A `leet2` | Creatures A `leet2` |
  | --------------------------------- | ------------- | ------------------ | -------------- | ------------------- |
  | `raid-phase1-typical` (>= 80%)    | -             | 55.2%              | -              | 59.1%               |
  | `raid-finale-typical` (85 to 97%) | 96.9%         | 60.7%              | 98.3%          | 65.8%               |
  | `raid-finale-15` (85 to 99%)      | -             | 63.4%              | -              | 63.6%               |
  | `raid-boss-spread` (<= 15 points) | -             | 14.9 (pass)        | -              | 24.4 (fail)         |
  | `raid-ko-share` (10 to 30%)       | 6.8%          | 36.4%              | 6.1%           | 33.6%               |
  | `curve-r2to5-default` (70 to 85%) | 88.9%         | 74.4%              | 85.0%          | 70.9%               |
  | `curve-r6up-default` (45 to 65%)  | 59.7%         | 53.5%              | 68.8%          | 47.5%               |
  | `curve-default-phase1` (>= 75%)   | -             | 72.2%              | -              | 69.0%               |
  | `longrun-win-typical` (60 to 85%) | -             | 86.1%              | -              | 85.2%               |
  | `choice-creature-min` (>= 0.60x)  | 0.623x        | 0.710x             | 0.619x         | 0.703x              |
  | `exp-casual-discovery` (<= 0.45)  | 0.52          | -0.71              | 0.59           | -0.71               |
  | `gear-first-craft` (<= 7 days)    | 1.4           | 1.4                | 1.4            | 1.4                 |
  | `gear-newcomer-catchup` (>= 60%)  | 92%           | 78%                | 83%            | 64%                 |

  (`exp-casual-discovery` is how many species a casual player owns ahead of the old expeditions: -0.71 means 0.7 fewer.) `econ-daily-species` (8 of 12 by week 6) still passes at 10; the two supplies targets and the supplies-crafted-share targets pass. The raid is clearly harder (finale 61% instead of 97%): the right fix is the raid and dungeon rebalance of build step 8 with the curve scalars, not a change here, as the design says. Two sources move it, not separated here: the free fusions (+20% stats on a creature by about week 3 for a committed player, now about 2 a week) and the Bait the old duplicate-to-Bait conversion paid (the old reports' "Bait from duplicates" column; the Bait earned counter did not include it, so the pinned run's `firstPlayerBaitEarned` is unchanged at 910 while its power fell).

- **Action.**
  - Targets: 11 `creatures-*` targets added (89 in all): catalogue weeks (min-maxer 7 to 11, engaged 11 to 17, regular 20 to 30), creatures and duplicates a week per profile, lures at most a quarter of a min-maxer's Bait, and the talents' share of a min-maxer's power at the end of the run between 5% and 20%. The min-maxer (6.5) and regular (31, since under half finish) catalogue targets fail on purpose: they record the review target against the shipped numbers. The scalar files and the legacy digest were regenerated; the `luck` study test compares knockouts without the retune now (the retune can lower them, as it keeps the mean damage); the journey test lets team power fall by up to 2% (Teach swaps a talent for a better-scoring one).
  - Sim: duplicates are answered with Recommended, lures need Bait, talents fold into every fight (`slotOfCreature`, `foldedCreature`, `creaturePower`), `baitConverted` is gone (`baitLures` and `baitSlots` replace it).
- **Expected.** More duplicates are worth less than fewer ones, so the next numbers to look at are what Release pays (scrap per Common) and the catalogue pace of the committed profiles, after the first staging week with real players. The min-maxer catalogue target needs a source of friction that is not a lower chance (see Reading).
- **Follow-ups.**
  - Decide the lever for the catalogue pace (min-maxer 9 weeks, regular 24): a pity counter for new species, deeper species by explorer rank, or fewer rolls for the committed (longer trips).
  - Decide Release's value once the Workshop (Gear B) is in: the scrap should matter without flooding.
  - Raid and dungeon rebalance (step 8): the finale and Phase 1 targets, around the new foundation of fusion by choice.
  - Keep: no line has a second branch yet; the first (Sunfawn for the Sproutle line) lights up the mechanism and the card's fourth button.
  - The deferred talents (Shade Napper, Light Sleeper, Gentle but Stubborn) and the Moonlit Reef condition of Patrols at Dusk.

### B-015: Gear B follow-up: no free lottery, and a Reach worth its price (open)

- **Opened:** 2026-10-16, from the lead's decision on B-013 (Misa's rule: a dismantle returns "a fraction of its costs").
- **Finding (B-013).** A neutral Common cost 8 scrap and no shard, and dismantled at item level 20 returned 6 to 10 scrap, so crafting it was scrap-neutral and only slot time limited it: a min-maxer made about 1,090 crafts and dismantled about 1,160 items in 30 weeks, and Equip best picked the best of all of them. Meanwhile the Reach (Essence plus 1 or 2 more shards) was used 17 times in 30 weeks and a min-maxer ended with 3,388 Essence unspent.
- **Action (starting values, `RULES.gear.craft` and `RULES.gear.dismantle`).**
  - A craft's scrap grows with the item level it makes: `6` (element base) or `8` (every other base) `+ floor(itemLevel / 4)`; a level 10 crafter (item level 20) pays 11 or 13. Dropped items use the same table (`craftScrapCost(base, itemLevel)`).
  - A dismantle's scrap is a share of that price, by rarity: Common 25 to 40%, Rare 35 to 45%, Epic and Festival 40 to 50% (rounded down, at least 1). Never half or more. The "+1 scrap per 5 item levels at both ends" is gone. A test checks every base, rarity and item level.
  - A Reach takes no extra shard: Reach for Rare is +25 Essence, Reach for Epic +70 Essence and 1 glimmer, on top of the plain craft's parts. Odds, levels and hours are unchanged.
- **Method.** The gear study of B-012 and B-013 (20 servers, 30 weeks, seeds `leet:gear` and `leet2:gear`), the counters of 6 servers of `leet:gear`, and the full `pnpm sim` alone on both seeds (about 26 minutes each).
- **Outcome (sim): gear's share of fight-scored power.** Seed `leet`; Gear A (B-012) → Gear B before this change (B-013) → now.

  | Profile   | Week 2           | Week 8              | Week 20             | Week 30             |
  | --------- | ---------------- | ------------------- | ------------------- | ------------------- |
  | Min-maxer | 6.0 → 5.1 → 5.1% | 12.3 → 11.9 → 12.6% | 22.9 → 25.7 → 22.4% | 25.5 → 28.1 → 24.6% |
  | Engaged   | 4.7 → 4.9 → 4.9% | 9.9 → 10.1 → 10.3%  | 15.1 → 15.3 → 16.6% | 18.8 → 18.1 → 20.2% |
  | Regular   | 1.6 → 1.1 → 1.1% | 6.2 → 6.1 → 5.9%    | 10.4 → 10.1 → 10.5% | 13.9 → 13.4 → 13.7% |
  | Drop-in   | 1.0 → 1.2 → 1.1% | 4.1 → 3.2 → 2.8%    | 6.7 → 8.1 → 7.1%    | 9.8 → 10.6 → 10.6%  |

  Seed `leet2`, now: min-maxer 4.5, 11.6, 23.1, 27.0%; engaged 4.1, 10.3, 17.2, 20.2%; regular 1.4, 5.8, 9.4, 12.7%; drop-in 0.9, 2.8, 7.2, 10.0%. The targets: 2 of 16 pass on `leet` (the min-maxer's and the drop-in's week 2) and 1 on `leet2` (the drop-in's week 2): the same count as Gear A. The 3 points the free lottery gave the min-maxer are gone, and the engaged player gains 1 to 2 points at weeks 20 and 30 because the Reach now costs no shards. Not tuned further.

- **Per player over 30 weeks (6 servers of `leet:gear`), B-013 → now.**

  | Profile   | Crafts      | Reaches (of them Epic) | Items dismantled | Essence from dismantling | Essence held at week 30 |
  | --------- | ----------- | ---------------------- | ---------------- | ------------------------ | ----------------------- |
  | Min-maxer | 1,089 → 174 | 17 (1) → 74 (29)       | 1,159 → 244      | 1,521 → 890              | 3,388 → 130             |
  | Engaged   | 37 → 34     | 10 (3) → 25 (18)       | 80 → 77          | 286 → 386                | 2,073 → 1,204           |
  | Regular   | 8 → 8       | 2 (0) → 2 (0)          | 4 → 5            | 5 → 7                    | 1,560 → 1,616           |
  | Drop-in   | 0 → 0       | 0 → 0                  | 0 → 0            | 0 → 0                    | 908 → 877               |

- **Reading.**
  - **The lottery is closed.** A min-maxer now makes 174 crafts in 30 weeks (about 6 a week) and is scrap-limited (it ends with about 4 scrap). Plain Commons are no longer free, so the Reach is the better use of a craft: it costs Essence the player has in plenty. A min-maxer reaches 74 times (29 Epics) and ends with 130 Essence (target: under about 500). The "save shards for the Reach" policy and the greedy one are now the same thing: with nothing extra to pay in shards, a Reach is a plain craft plus Essence.
  - **Engaged players still hold 1,204 Essence.** They make 34 crafts in 30 weeks and are limited by the one shard each craft takes, not by Essence. They are not the committed profile the target speaks of, and the way to spend their Essence is the same as for everybody: more crafts per week (shards) or other sinks (the dungeon's choice rooms, evolution). Regular and drop-in players do not craft at all (their profiles' craft dial), so their Essence is for evolution and later sinks.
  - **The full sim.** Seed `leet`: 60 pass, 18 fail (14 gear share, `raid-finale-typical` 97.2% against 97.0, `raid-ko-share`, `exp-casual-discovery` 0.56 and `curve-r2to5-default` 88.2%: the last four were already failing in B-012 with 96.9%, 6.8%, 0.52 and 88.9%). Seed `leet2`: 61 pass, 17 fail (15 gear share, `raid-finale-typical` 97.9%, `raid-ko-share` 6.9%); B-012 had 59. The raid targets stay for the raid and dungeon rebalance.
- **Expected.** The min-maxer's week 30 share (25 to 27%) is still below its target (33 to 40%); with the lottery closed the way to it is item level (finale pieces at `3 + Boss Rank`), the Reach and, later, the creature steps. Scrap now limits a min-maxer's crafts: watch scrap income against the new prices.
- **Follow-ups.**
  - If crafting should be faster for committed players, the levers are the scrap price (`scrapPerItemLevels`), the scrap income (trips, the dungeon) and the Reach's odds, not the dismantle refund.
  - Engaged players' Essence: more crafts a week need more shards (trips) or cheaper element crafts.

### B-016: Creatures B: training by activity, treats, ribbons and the new-species pity (open)

- **Opened:** 2026-10-17, build step 5 of `docs/design/gear-and-creatures-v2.md` (section 14), with the lead's new-species pity (the follow-up of B-014).
- **Finding.** Bait bought every level, so a committed player's creatures were at level 30 in about 4 weeks and levels said nothing about what a player did (spec 9.1). The base catalogue had no friction except a lower catch chance (B-014: complete in 7, 12 and 28 weeks for a min-maxer, an engaged player and a regular, against the review target of 9, 14 and 24).
- **Action (starting values, `RULES.experience` and `RULES.catching.pity`).**
  - Experience from level L to L + 1 is `25 L + 2 L^2`. Per creature that takes part: a trip by length 20 / 60 / 120 / 240, the dungeon 60 a room cleared plus 60 for a full clear, a raid stage 200 / 200 / 400 (times 1.5 cleared), a Workshop job 8 an hour of nominal work. The spec's first numbers (10 / 30 / 60 / 120, 20 + 20, 50 / 50 / 100, 4 an hour) were about half of what the pace needs from trips and jobs, a third from the dungeon and a quarter from the raid, found in about 20 sim runs (`--set experience.*`); with the final numbers a min-maxer's experience is 56% trips, 20% raids, 17% the dungeon and 8% jobs.
  - Treats: double the experience of one activity for one creature, `3 + ceil(level / 2)` Bait, paid at the start. Ribbons: Bronze at 10 (6 scrap, 2 shards), Silver at 20 (15 scrap, 5 shards, 1 glimmer, 5 finished trips); a stage-1 creature with an evolution also waits at 15. No catch-up bonus.
  - Pity: after 60 catch rolls without a new species the next roll brings one the player lacks; every 10th roll without any creature brings one. Server counters, no randomness drawn for a forced roll.
- **Method.** The creatures study (`pnpm sim:creatures`, seed `creatures`, 2 seeds x 6 servers x 30 weeks; weeks 3 to 30 averaged), the journey server of 1 min-maxer, 3 engaged, 3 regular and 2 drop-in; the full `pnpm sim` alone on seed `leet` (92 targets, 36 minutes) for the drift. The sim plays the same pure functions as the worker. Raids were not tuned.
- **Outcome (sim): the pace of the levels.** Weeks since joining (median) at which the best creature / the whole raid trio reached a level ("-" when under half did within 30 weeks); the plan of 9.2 in the last column.

  | Profile   | Level 10 | Level 15 (evolved) | Level 20 | Level 30 | Plan of 9.2                                                                  |
  | --------- | -------- | ------------------ | -------- | -------- | ---------------------------------------------------------------------------- |
  | Min-maxer | 1 / 1    | 1 / 3 (week 1)     | 2 / 4    | 8 / 10   | trio: level 10 in week 1, evolve week 2, level 20 about 5, level 30 about 11 |
  | Engaged   | 1 / 1    | 2 / 4 (week 2)     | 3 / 6    | 11 / 17  | between the committed trio and the regular                                   |
  | Regular   | 2 / 2    | 4.5 / 10 (week 5)  | 8 / 13   | 24 / -   | level 20 about week 10, level 30 about week 24                               |
  | Drop-in   | 4 / 6    | 13 / 23 (week 15)  | 21.5 / - | - / -    | about level 18 by week 20                                                    |

  The committed trio matches the plan from week 3 on; evolving happens in week 1, not 2, because a min-maxer's trips and jobs pay a lot. The regular's best creature matches (20 at week 8, 30 at 24), its raid trio lags by about 3 weeks. The drop-in is at level 18.5 by week 20 on its best creature. Levels of the best creature / the raid team's lowest, end of week, weeks 2, 4, 8, 12, 20, 30: min-maxer 20 / 13, 21.5 / 20, 30 / 25, 30 / 30, 30 / 30, 30 / 30; engaged 17.5 / 10, 20 / 16.5, 25 / 20, 30 / 23, 30 / 30, 30 / 30; regular 10 / 10, 14.5 / 10, 20 / 10.5, 20 / 19, 26 / 20, 30 / 25.5; drop-in 5 / 1, 10 / 7.5, 11 / 10, 14 / 10, 18.5 / 10, 20 / 17.

- **Outcome (sim): the longest stretch without an unlock.** The ladder (Hat 1, Scarf 7, ability and Bronze 10, Charm 13, evolution 15, Silver and talent slot 2 at 20, slot 3 at 25, Gold 30) has a widest gap of 6 levels (Hat to Scarf, the start; every other gap is 5 or fewer), against the aim of 5 (the spec itself puts Scarf at 7). In days the best creature goes without any unlock: min-maxer 22 (median over players of their longest), engaged 33, regular 72, drop-in 63; for the regular and the drop-in it is the ribbon gates and the evolution (a creature waits for parts) as much as the experience.
- **Outcome (sim): the catalogue and the pity** (weeks to own every species a trip can find: min-maxer / engaged / regular, share of regulars who finish in 30 weeks; creatures a week, min-maxer / engaged / regular):

  | Variant                      | Catalogue (weeks)   | Creatures a week (min-maxer / engaged / regular) |
  | ---------------------------- | ------------------- | ------------------------------------------------ |
  | No pity (Creatures A, B-014) | 7 / 12 / 28 (19%)   | 13.5 / 9.3 / 2.2                                 |
  | Floor of 10 only             | 7 / 11 / 28.5 (28%) | 14.9 / 10.9 / 2.4                                |
  | New after 20                 | 3 / 6 / 17.5 (100%) | 15.3 / 10.9 / 2.5                                |
  | New after 30                 | 4 / 7 / 20.5 (100%) | 15.2 / 11.0 / 2.4                                |
  | New after 40                 | 4 / 8 / 22 (97%)    | 15.1 / 10.9 / 2.5                                |
  | New after 50                 | 5 / 9 / 23 (94%)    | 15.1 / 10.8 / 2.5                                |
  | **New after 60 (shipped)**   | 5 / 9 / 24 (81%)    | 14.9 / 10.9 / 2.4                                |
  | New after 70                 | 5.5 / 9 / 27 (92%)  | 15.3 / 10.7 / 2.5                                |

  The regular's 24 weeks is reachable and shipped. **The review targets of 9 and 14 weeks for the committed profiles are not reachable with pity**: it can only make players faster, and a min-maxer already needs 7. The `creatures-catalogue-*` targets now say 4 to 8 and 7 to 12 weeks. A creature a week stays at 10 to 15 for the committed (14.9, 10.9), so there is no return of the old flood (84 a week before B-014); the floor of 10 is what adds about 1.5 a week. Pity forces a creature 2.4 times a week for a min-maxer, 1.7 for an engaged player, 0.3 for a regular, and a new species about 0.1 a week.

- **Outcome (sim): Bait.** Bait earned a week (weeks 3 to 30) and where it went, treats / lures / talent slots (the sum can pass the earned: rank gifts and the starting Bait are not counted as earned): min-maxer 326 (300 / 63 / 4), engaged 299 (287 / 44 / 4), regular 168 (0 / 4 / 0.5), drop-in 46 (0 / 0 / 0.1). A committed player packs about 22 treats a week and spends nine tenths of its Bait on them; a lure is 19% of a min-maxer's Bait (the target is at most a quarter). **Regular and drop-in players do not pack treats in the sim and let Bait pile up** (168 a week earned, about 5 spent): whether real regulars would use treats is for the live data, and the treat price (`3 + ceil(level / 2)`) is the lever.
- **Outcome (sim): experience by source** (a week, weeks 3 to 30): min-maxer trips 9,140, raids 3,205, dungeon 2,708, jobs 1,324; engaged 7,416, 3,205, 2,980 and 293; regular 801, 2,716, 1,597 and 12; drop-in 97, 1,491, 430 and 0. Level-ups a week: 10.7, 9.8, 5.3, 2.4. Ribbons earned a week: 0.8, 0.8, 0.3, 0.1.
- **Outcome (sim): drift of the other targets (report only; the raid is not tuned in this step).** `pnpm sim` (full) on seed `leet`: 92 targets, 63 pass, 29 fail (Creatures A: 66 of 89). The raid targets, B-014 (Creatures A) `leet` → now:

  | Target                            | Creatures A | Creatures B |
  | --------------------------------- | ----------- | ----------- |
  | `raid-phase1-typical` (>= 80%)    | 55.2%       | 65.5%       |
  | `raid-finale-typical` (85 to 97%) | 60.7%       | 66.8%       |
  | `raid-finale-15` (85 to 99%)      | 63.4%       | 61.4%       |
  | `raid-boss-spread` (<= 15 points) | 14.9 (pass) | 9.3 (pass)  |
  | `raid-ko-share` (10 to 30%)       | 36.4%       | 35.2%       |
  | `curve-r2to5-default` (70 to 85%) | 74.4%       | 72.0%       |
  | `curve-r6up-default` (45 to 65%)  | 53.5%       | 39.6%       |
  | `curve-default-phase1` (>= 75%)   | 72.2%       | 68.5%       |
  | `longrun-win-typical` (60 to 85%) | 86.1%       | 85.8%       |
  | `choice-creature-min` (>= 0.60x)  | 0.710x      | 0.806x      |

  The raid is a little easier at the start (more levels early for the committed) and harder in the long run (`curve-r6up-default` 53.5% to 39.6%: the teams now stop at 10 and 20 for ribbons and evolve at their own pace). Not tuned: the raid and dungeon rebalance (step 8) is the place. **Targets that passed after Creatures A and fail now**, all from how the sim player now spends its trips and Bait or from the level pace, not from a rule: `econ-casual-level-15` 11.5 (a casual player's best creature at the end of week 4, needs 15: the regular reaches 15 at week 4.5, and Bronze at 10 needs parts), `econ-power-ratio` 1.81x (<= 1.6: the top earner pulls ahead), `exp-slot-3` 56 days (23 to 37), `exp-slot-4` 308 (90 to 150) and `exp-slot-5` 999 (330 to 400): the policy now sends the creatures it trains first, so explorer ranks gather on three creatures and the rank-sum slots open later (the slots count the ranks above 1 of all creatures), `gear-newcomer-catchup` 58% (78%), `dungeon-first-week-clear` 79.1% (>= 80), `curve-r2to5-committed` 87.9% (>= 95), `choice-element-min` 13.9% (>= 15). The 14 gear share targets are as in B-015 (the engaged player lower at week 2 and 8).

- **Reading.**
  - **Trips are over half of a committed player's experience, which makes the trip the main way to level.** That is the design (spec 9.1: trips by length) but it also means a committed player's weeks are decided by how many long trips run; drop-in players get about three quarters of their experience from raids (1,491 of 2,018 a week).
  - **The ribbons, not the experience, are what regulars wait for.** A regular's best creature reaches 10 at week 2 and 20 at week 8, with a stretch of 72 days at the same levels, and the Silver Ribbon's 5 shards and 5 finished trips take weeks. The sim player now spends trips on places of the shard it needs.
  - **Pity does little for committed players and the most for regulars:** 4 weeks sooner (28 to 24) and 81% instead of 19% finishing.
  - **Evolving in week 1 for a committed player** (the plan says week 2) is the first number to look at in live data: it follows right after the Bronze Ribbon (level 10), and 15 is a short climb when trips pay what they do.
- **Expected.** Live: a new player reaches level 10 within the first week, the Bronze Ribbon button is the first thing they see on a creature card, and treats are used by the committed.
- **Follow-ups.**
  - Decide whether the sim's regular and drop-in should pack treats (their Bait piles up) and whether the exp-slot targets should follow the explorer's new order or the policy should spread trips.
  - The raid and dungeon rebalance (step 8): the finale and Phase 1 targets, `curve-r6up-default`, around the new level pace.
  - The Shade Napper talent and a "Growing" gear line (they wait on a number pass); raid experience in the raid result views; a treat for dismantle jobs in the UI.

### B-017: Boons and Omens: the valley's weather (open)

- **Opened:** 2026-10-17, build step 6 of `docs/design/gear-and-creatures-v2.md` (section 14, rules in section 10).
- **Finding.** Nothing varied from one day to the next: the same raid, the same dungeon and the same trips every day. The design adds a daily Boon and (from Boss Rank 3) an Omen, server-wide, drawn a day ahead, stronger at higher ranks (x1 to x1.5 for Boons, x1 to x2.5 for Omens), that touch the raid stage of the day, every dungeon run, trips and Workshop jobs.
- **Hypothesis.** Boons and Omens should roughly cancel on the raid, so the raid targets should not move much: half of the Omens (Cold Snap, Muddy Roads, the trip and Workshop halves) never touch a fight.
- **Action (starting values, `RULES.weather`).** The tiers of 10.1 (`boonBp` / `omenBp` 10000 / 0 from rank 1, 10000 / 10000 from 3, 12500 / 15000 from 6, 15000 / 20000 from 10, 15000 / 25000 from 14), a wild Omen from rank 10 with chance 2000 bp (at most one a raid week, known a day ahead, never in a Festival week). 9 of the 10 Boons and 8 of the 10 Omens are live (Kind Rain, Morning Haze and Bramble Season wait for engine work). No raid number was tuned.
- **Method.** The sim draws the days from a seeded stream of its own, a day ahead at the rank of the moment, and applies the game's own pure functions (`weather.ts`, `gear.ts`, `trips.ts`, `dungeon.ts`, `raid.ts`); the raid sweep draws three days in a row for each week. Weather is on by default; `--no-weather` plays the same seeds without it (before the base-stat gear of B-018 it reproduced B-016 exactly: 63 of 92 targets pass, `curve-r6up-default` 39.6%). Two reads, both on the code with B-018's gear: the full `pnpm sim` on seed `leet`, with and without weather, and the weather study (`pnpm sim:weather`, seed `weather`): 40 rosters from economy sims at weeks 4 and 8, every boss, played at Boss Rank 4 on the same seeds with one weather on all three stages (320 weeks a row, so one point is about 3 weeks: read differences under 3 points as noise), and the default journey server for 30 weeks, 20 servers, with and without weather.
- **Outcome (sim): what each weather does to a raid week** (one weather on all three stages, the strongest a week can be; a real week has a different sky each day). Finale win rate and the share of the boss's pool dealt, as points against no weather (48.1% and 88.1% without weather), at the strength of the fight's rank 4 (x1) and at rank 14 (Boons x1.5, Omens x2.5):

  | Weather          | Kind | Phase 1 (x1) | Finale won (x1) | Finale delta (x1) | Pool delta (x1) | Finale delta (rank 14) | Pool delta (rank 14) |
  | ---------------- | ---- | ------------ | --------------- | ----------------- | --------------- | ---------------------- | -------------------- |
  | No weather       | none | 44.4%        | 48.1%           | -                 | -               | -                      | -                    |
  | Fair Winds       | boon | 45.0%        | 48.8%           | +0.6              | +0.3            | +0.9                   | +0.4                 |
  | Warm Hearth      | boon | 45.0%        | 48.1%           | +0.0              | +0.2            | +0.6                   | +0.4                 |
  | Clear Skies      | boon | 45.0%        | 49.4%           | +1.3              | +0.6            | +2.2                   | +0.9                 |
  | High Water       | boon | 45.9%        | 50.0%           | +1.9              | +1.0            | +2.2                   | +1.5                 |
  | Bonfire Night    | boon | 45.0%        | 49.4%           | +1.3              | +0.5            | +1.9                   | +0.7                 |
  | Hearty Breakfast | boon | 44.4%        | 48.1%           | +0.0              | +0.0            | +0.0                   | +0.0                 |
  | Lantern Light    | boon | 44.4%        | 50.6%           | +2.5              | +1.2            | +2.5                   | +1.2                 |
  | Market Day       | boon | 44.4%        | 48.1%           | +0.0              | +0.0            | +0.0                   | +0.0                 |
  | Quiet Night      | boon | 44.4%        | 50.0%           | +1.9              | +0.7            | +2.5                   | +1.0                 |
  | Heatwave         | omen | 43.1%        | 47.2%           | -0.9              | -0.5            | -1.9                   | -1.1                 |
  | Static Sky       | omen | 44.4%        | 48.1%           | +0.0              | -0.1            | +0.0                   | -0.2                 |
  | Heavy Rain       | omen | 44.1%        | 48.1%           | +0.0              | -0.3            | -0.6                   | -0.7                 |
  | Long Shadows     | omen | 44.1%        | 48.1%           | +0.0              | -0.3            | -1.3                   | -0.6                 |
  | Restless Wind    | omen | 44.4%        | 48.1%           | +0.0              | +0.0            | +0.0                   | -0.0                 |
  | Cold Snap        | omen | 44.4%        | 48.1%           | +0.0              | +0.0            | +0.0                   | +0.0                 |
  | Muddy Roads      | omen | 44.4%        | 48.1%           | +0.0              | +0.0            | +0.0                   | +0.0                 |
  | Stormfront       | omen | 43.8%        | 47.5%           | -0.6              | -0.1            | -0.6                   | -0.1                 |

  Lantern Light (a Shield Wall lasts one more round), Quiet Night (the boss's adaptation 25% weaker), High Water (Steam and Overload +15%) and Clear Skies (crit +3 points) are the Boons that matter in a fight, each worth a point or two on its own; Market Day, Hearty Breakfast and the trip halves do nothing there, as designed. On the Omen side only Heatwave, Heavy Rain and Long Shadows bite, and only a little: about -2 points at the strongest. **Stormfront barely moves the raid** (-0.1 points of the pool, within noise on the win rate): one more plain attack a round is small next to a team of 9 to 15 creatures. If the wild Omen is meant to be a day to fear, it needs a stronger effect than one more plain attack.

- **Outcome (sim): whole servers** (the default journey server, 20 servers x 30 weeks, same seeds, normal weeks, 480 raids): Phase 1 83.1% to 82.3%, finale 87.1% to 89.8%, finale creatures knocked out 16.0% to 15.1%, overtime 18.8% to 18.1% (no weather to weather).
- **Outcome (sim): the targets** (`pnpm sim` full, seed `leet`, 92 targets). **64 pass with weather and 65 without.** The raid, no weather to weather:

  | Target                            | No weather   | Weather                |
  | --------------------------------- | ------------ | ---------------------- |
  | `raid-phase1-typical` (>= 80%)    | 68.9%        | 72.4%                  |
  | `raid-finale-typical` (85 to 97%) | 69.9%        | 74.9%                  |
  | `raid-finale-15` (85 to 99%)      | 66.5%        | 76.5%                  |
  | `raid-boss-spread` (<= 15 points) | 8.7 (pass)   | 8.8 (pass)             |
  | `raid-ko-share` (10 to 30%)       | 29.4% (pass) | 26.7% (pass)           |
  | `curve-r2to5-default` (70 to 85%) | 77.9%        | 78.5%                  |
  | `curve-r2to5-committed` (>= 95%)  | 89.9%        | **95.6% (now passes)** |
  | `curve-r6up-default` (45 to 65%)  | 62.0%        | **70.9% (now above)**  |
  | `curve-r6up-committed`            | 91.0%        | 93.2%                  |
  | `curve-default-phase1` (>= 75%)   | 74.3%        | **75.5% (now passes)** |
  | `longrun-win-typical` (60 to 85%) | 90.3%        | 92.4%                  |
  | `choice-creature-min` (>= 0.60x)  | 0.799x       | 0.848x                 |

  The raid gets easier: about 5 points on the typical finale, 10 on the 15-player finale, 9 at ranks 6 and up, and the committed servers at ranks 2 to 5 reach their target. Three targets that passed now fail, none of them a weather rule gone wrong: `curve-r6up-default` is now too easy (70.9% against a range of 45 to 65%), and `gear-share-drop-in-week8` and `gear-share-drop-in-week20` moved by 0.7 and 1.2 points across their edges (weather moves the drop-in's creature levels, which moves the share). `dungeon-first-week-clear` (78.6% to 77.4%, a target of 80% that already failed) is the other one that went down: at rank 1 only Boons exist and none of them makes the dungeon harder, so this looks like different levels downstream (a first week is a handful of runs), not a weather effect; check it on a second seed before acting.

- **Reading.**
  - The Boons help every day and half of them touch a fight; the Omens come only from rank 3 and most of them are about trips and experience. So the sky is a net help for raids, of about 5 points on the finale, more than the hypothesis expected. That is the opposite of "Omens are the risk": the raid-side Omens are weak, the trip-side ones (Muddy Roads, Cold Snap, Morning Haze when it ships) are what a player feels, and those change time and experience, not the raid.
  - Stormfront needs a stronger or a different effect to be the wild day the design wants.
  - The raid and dungeon rebalance (step 8) should start from the sim with weather on, which is the shipped game; `--no-weather` is for paired comparisons. With weather on, the finale targets are 5 to 10 points closer than without it, and `curve-r6up-default` needs the boss a little stronger at ranks 6 and up.
- **Expected.** Live: players notice the calendar and plan trips and crafts around Fair Winds, Warm Hearth and Market Day; the raid win rate rises by a few points. If the Saturday after a bad Omen feels unfair in feedback, the Omen raid effects (Heatwave, Heavy Rain, Long Shadows) are the first to soften.
- **Follow-ups.**
  - Stormfront's effect (above), and the three planned entries (Kind Rain, Morning Haze, Bramble Season) once the engine has the hooks.
  - The raid rebalance with weather on (step 8), starting from `curve-r6up-default` and the finale targets.
  - Check `dungeon-first-week-clear` on a second seed.
  - Live: the share of days with an Omen at each rank, trips sent on Market Day, and the raid win rate by Omen (`weather_draw` and `weather_use` events).

### B-018: Items carry base stats; local and global lines; Festival gear is special, not stronger (open)

- **Opened:** 2026-10-17, from Misa's direction of the same day ("Path of Exile style": base stats on items, local lines "this item", Festival at the normal level and rarity), and the lead's update the same afternoon (fixed base stats per base type, two or more stats, better bases unlocking at higher item levels). Design: `gear-and-creatures-v2.md` section 2.5; decision entry of 2026-10-17. (B-017 was left free for a parallel branch.)
- **Finding.** After B-016 the gear share sat far under the section 4 targets for everyone but the min-maxer's first 20 weeks (20 servers of `leet:gear`: engaged 3.0 / 9.7 / 16.6 / 20.0%, regular 0.9 / 6.3 / 12.0 / 16.7%, drop-in 1.0 / 2.0 / 7.4 / 11.6% at weeks 2 / 8 / 20 / 30). Gear was a few percent on top of a creature's own stats, and a drop only got better through the tiers of its lines.
- **Action (starting values; `gear.json`, `gear-lines.json`).**
  - **Base stats**, fixed per base, no item level scaling. Hats (Attack / HP): 2 / 4 at item level 1, 12 / 24 at 5, 24 / 48 at 10 (neutral and Tide); Scarves (HP / Attack): 12 / 1, 70 / 5, 150 / 12. Element bases lean a little (Ember Hats +20% Attack and 20% less HP, Grove Hats the other way and the sturdy Grove Scarf +20% HP, Spark a little glassy); the finer Hats and some Scarves add 1 to 3 points of crit chance or, on the Ember Hat of item level 10, 20 points of crit damage. The Festival Hearth Scarf has the plain first-make Scarf's stats.
  - **Better bases unlock at item levels 1, 5 and 10** (levels are content, `minItemLevel`); a craft needs Crafting level 1, 3 and 5.
  - **Local lines**, tiers I to V: share +20 / 40 / 60 / 90 / 120% (Attack, HP, crit chance, crit damage of the item), flat Attack +2 / 4 / 6 / 9 / 12, flat HP +12 / 25 / 40 / 55 / 75. Hats favour the Attack lines (weight 100 against 40), Scarves the HP lines. Creature Attack and HP: weight 6 on Charms only, values as the old Attack and HP lines (2 to 11%, 3 to 15%).
  - **Festival**: the finale's item level and rarity odds, one fixed unique line (Hearth warmth 2 to 4% dungeon rest, Lantern luck 0.5 to 1.5 points of Lucky find), a pool of five lines.
- **Method.** The gear study of B-012 to B-016 (`packages/sim/src/gear-study.ts`: 20 servers of the default mix, 30 weeks, median `1 - bare / full` of fight-scored power, seed `leet:gear`), then the full `pnpm sim` alone on seed `leet` (92 targets, 47 minutes) for the drift. The fold, the policies and the drops are the game's own pure functions; the only policy change is that the Workshop skips blueprints the crafter's level cannot make. Tuning was 8 runs of 6 servers varying the three make levels and the stat sizes, then the 20-server run below. Tried: the first model (stats growing with item level, Hat Attack 4 + level, Scarf HP 20 + 4 x level) gave a week 2 share of 8 to 10% for every profile (the stats were too big against level 1 to 5 creatures) and 26 / 22 / 17 / 14% at week 30; makes at levels 1, 8 and 15 left regulars and drop-ins on plain bases (week 20 regular 9.6%, drop-in 7.3%); makes at 1, 5 and 12 pushed the min-maxer's week 8 to 25%.
- **Outcome (sim): gear's share of fight-scored power**, 20 servers of `leet:gear`, before (B-016 branch head) → now, with the range of `gear-and-creatures-v2.md` section 4 (the engaged profile has the min-maxer's range in `targets.json`):

  | Profile   | Week 2 (range)          | Week 8 (range)         | Week 20 (range)            | Week 30 (range)        |
  | --------- | ----------------------- | ---------------------- | -------------------------- | ---------------------- |
  | Min-maxer | 5.5 → **9.6** (5 to 10) | 16.6 → 24.3 (15 to 22) | 26.0 → **30.6** (25 to 32) | 26.3 → 32.8 (33 to 40) |
  | Engaged   | 3.0 → 5.0 (5 to 10)     | 9.7 → 12.9 (15 to 22)  | 16.6 → 23.3 (25 to 32)     | 20.0 → 26.9 (33 to 40) |
  | Regular   | 0.9 → **3.5** (3 to 6)  | 6.3 → 9.1 (10 to 15)   | 12.0 → 17.4 (18 to 24)     | 16.7 → 23.7 (28 to 34) |
  | Drop-in   | 1.0 → 4.6 (0 to 3)      | 2.0 → **5.6** (5 to 8) | 7.4 → **14.0** (10 to 15)  | 11.6 → 21.9 (15 to 20) |

  Passing: 4 of 16 before, 6 now (bold, and the engaged week 2 is 5.0 against a limit of 5.0). Every cell moved toward its range except the drop-in's week 2 (the welcome Hat alone is worth 4 to 5% of a level 3 creature) and week 30 (over the range now). **What is not reachable with these rules alone**: the committed profiles and the regulars want opposite things (the min-maxer is over at week 8 while the engaged player is 2 points under; the drop-in is over at week 30 while the regular is 4 points under), because they differ in how many items they craft and how high a Crafting level they have, which the gear formulas cannot separate. The next levers are not formulas: the finale's item level by Boss Rank, the Reach odds and the crafting rate. Not tuned further on purpose; the numbers above are what to look at in live data.

- **Outcome (sim): drift of the other targets (report only; the raid is not tuned).** `pnpm sim` (full) on seed `leet`: 92 targets, 65 pass and 27 fail (B-016: 63 and 29). The raid targets, Creatures B (B-016) → now:

  | Target                            | Creatures B | Now                |
  | --------------------------------- | ----------- | ------------------ |
  | `raid-phase1-typical` (>= 80%)    | 65.5%       | 68.9%              |
  | `raid-finale-typical` (85 to 97%) | 66.8%       | 69.9%              |
  | `raid-finale-15` (85 to 99%)      | 61.4%       | 66.5%              |
  | `raid-boss-spread` (<= 15 points) | 9.3 (pass)  | 8.7 (pass)         |
  | `raid-ko-share` (10 to 30%)       | 35.2%       | 29.4% (now passes) |
  | `curve-r2to5-default` (70 to 85%) | 72.0%       | 77.9% (pass)       |
  | `curve-r6up-default` (45 to 65%)  | 39.6%       | 62.0% (now passes) |
  | `curve-default-phase1` (>= 75%)   | 68.5%       | 74.3%              |
  | `longrun-win-typical` (60 to 85%) | 85.8%       | 90.3%              |
  | `choice-creature-min` (>= 0.60x)  | 0.806x      | 0.799x (pass)      |

  The raid is easier everywhere (gear is a bigger share, and a team's gear now grows with the item level), which fixes the long-run target B-016 broke (`curve-r6up-default`) and moves the typical-week targets a few points toward their ranges; `longrun-win-typical` is now 5 points above its limit. One other target moved the wrong way: `dungeon-gear-share-week8` is 21.7% (limit 20%; it passed in B-016). `gear-newcomer-catchup` improved to 59.7% (limit 60%, was 58%). The raid retune after the revamps is the place for all of these.

- **Expected.** Live: a new player's first Hat is worth a few points of Attack (visible on the card as "Attack 2"), the first better make (a Felt Hat at item level 5) is a noticeable jump, and a committed player's best Hat has Attack in the tens by week 8; Festival pieces look special and are not better than any other finale piece of their level.
- **Follow-ups.**
  - Look at the week 2 share of drop-ins and regulars in live data: the welcome Hat's size is the lever (a first make of 1 Attack would read oddly on a card).
  - The item level of finale drops by Boss Rank and the crafting rate decide the spread between committed players and regulars, not the stat formulas.
  - A fourth make at item level 15 (and a Hat or Scarf for each element with its own third stat) would give the late game more to chase; it is a data change.

### B-019: Dungeon paths: a map, a camp and a pack need new foe numbers (open)

- **Opened:** 2026-10-18, build step of `docs/design/dungeon-paths.md` (Misa's ask of 2026-10-17: "a Slay the Spire style gameplay loop").
- **Finding.** The daily dungeon is no longer three rooms played at once. A run walks the day's map (7 floors, the camp on floor 3, the boss on floor 6): 3 to 6 fights, a mystery room or two, sometimes a cache, one or two elites, a camp where the player rests, swaps a fallen creature, takes a keepsake or heads home, and a pack of Bait, Essence and scrap that is kept whole at home or on a clear and by half (rounded up) after a defeat. With the foe numbers of the three-room model (`baseHpBp` 11750, `hpStepBp` 3000), a run of 4 to 5 fights is much harder to clear: the first week cleared depth 1 about 81% of the time (the target is 80%) and a median daily player gained 1.1 depths a week.
- **Hypothesis.** More fights per run make a clear harder, so the foe's HP must come down at depth 1 and rise faster by depth to keep the ladder as steep as before; the loot per room must be trimmed so that a full clear pays about what three rooms did (Bait 3, Essence 1, scrap 2, a supply, a 60% shard, a 15% gear drop); experience per fight must come down so a daily player's dungeon experience stays about 2900 a week.
- **Method.** `packages/sim/src/dungeon.ts` plays a map day with a policy, using the game's own pure rules (`generateDungeonMap` from a seed of the day, so every player of a server walks the same map; `roomSpecForNode`, `nodeLoot`, `keptOnDefeat`, `resolveEvent`, `campOffers`, `campRest`, `addFightsCleared`, `dungeonExperience`, `rollDungeonLoot`) and the engine's `simulateDungeonRoom` for each fight (HP carried, keepsakes folded in, rest from gear; the seed of a fight comes from the run's seed, one stream per fight). The policy (`POLICY` in `dungeon.ts`, all in the report's methodology):
  - Route: the foe the row's elements beat; an elite only above 70% average HP with nobody down; a mystery room or cache below 50%. `random` players pick at random and `best` players add half the best room one floor ahead.
  - Events: the costly or gamble option only above 60% average HP, a plain heal below 70%, otherwise the free option.
  - Camp: swap in the strongest unused creature for a fallen one, else rest below 60%, else the first keepsake (`best` takes the better by a simple score); then head home when 2 creatures are down or the average HP is under 35%.
  - Payout as the worker's `pay`: the kept pack, on a clear the boss chest (the boss's Essence and scrap, the full clear's Essence, the shard and gear dice, the landmark's extras), the run's supply once a fight is cleared, Market Day's scrap per fight cleared, the streak bonus on the first run of a day; experience per creature by the fights it stood in the row for, plus the full clear to the row that beat the boss; the free first-day retry only after a defeat.
  - Tuning used `pnpm sim:quick` and a dungeon-only study (8 to 40 economy sims of the default server, 12 weeks) for the knobs, then `pnpm sim` (full, seed `leet`) twice (two settings of the foe numbers). Dungeon numbers move by a few points between seeds (about 50 to 170 first-week runs): read differences of under 4 points as noise.
- **Options (sim, dungeon-only study, 16 to 40 sims).**
  - Heading home. The spec's rule alone (2 down or under 35% after the camp choice) sends a daily player home on 0% of runs: they reach the camp healthy and lose after it. A plain "under 60% (or 75%) after the choice" rule gives 7% or 32% but also sends first-week players home on depth 1 (first-week clear 70%). So the policy has one memory rule, `DungeonState.lostAt`: after a defeat at a depth the next run is **wary** (home with any creature down or under 75% after the camp choice; the same-day retry is not). That gives 18 to 20% of runs at home and leaves the first week alone.
  - Foe HP. At `hpStepBp` 3000 and the spec's home rule (4 sims): `baseHpBp` 11750 gives first-week 81% and growth 1.1; 8000 gives 86% and 1.4; 6000 gives 94% and 1.8. It is a cliff more than a slope (the foe must fall inside its rounds): 12000 with Attack 7500 gives 71%, and Attack alone does little (9000 with Attack 7500: +3 points). The elite's boost does not matter for the first week (no boost at all: 87% against 86%).
  - A steeper step keeps the ladder: `baseHpBp` 6500 with `hpStepBp` 4500 holds the first week at about 91% and growth at 1.7 to 1.8 a week (7500 and 4000: 88 to 89%, 1.7).
- **Action (starting values, `RULES`).**
  - `dungeon.baseHpBp` 11750 → **6500**.
  - `dungeon.hpStepBp` 3000 → **4500**.
  - `experience.dungeon.perRoom` 60 → **35** (per fight cleared; `fullClear` stays 60). A daily player's dungeon experience: 2917 → 2980 a week.
  - `dungeon.loot.elite.bait` 1 → **0** (an elite pays scrap 1 and a keepsake). A plain fight pays Bait 1 and a cache Bait 1 and scrap 1 as the design says (a pinned glossary test holds the cache); so a full clear pays Bait 3.8 instead of 3.
  - Not changed: `elite` (14000 / 12000), `camp.restBp` 4000, `defeatKeepBp` 5000, the map kind odds, `fullClear`, `bossShardBp`, `gearOdds`, `baseAtkBp`, `loot.boss` and `loot.fight`.
  - Also: new targets `dungeon-home-rate` (10 to 45%) and `dungeon-run-fights` (3 to 5.5), the metrics `dungeon.dailyHomeRate` and `dungeon.meanFights`, the report's "How runs end" table, and the `lostAt` field of `DungeonState`. The legacy digest was re-pinned (`legacy-unchanged.test.ts`).
- **Outcome (sim): the dungeon targets** (`pnpm sim` full, seed `leet`, 94 targets). Before: the three-room model, quick sim (the full run of B-017 had first-week 77.4%). After: full.

  | Target                                 | Before (quick, 3 rooms) | After (full)     |
  | -------------------------------------- | ----------------------- | ---------------- |
  | `dungeon-first-week-clear` (>= 80%)    | 88.9%                   | 89.4%            |
  | `dungeon-depth-growth` (1 to 2 a week) | 1.17                    | 1.83             |
  | `dungeon-essence-share` (<= 40%)       | 3.3%                    | 4.1%             |
  | `dungeon-gear-share-week8` (<= 20%)    | 23.6%                   | **22.8% (fail)** |
  | `dungeon-home-rate` (10 to 45%)        | n/a                     | 19.3%            |
  | `dungeon-run-fights` (3 to 5.5)        | 3 (fixed)               | 4.13             |

  The first full run (7500 and 4000) gave first-week 83.8%, growth 1.67 and the same others; it was moved to 6500 and 4500 for a wider margin on the first week (the 40-sim study put the two settings 2 to 3 points apart).

- **Outcome (sim): how a run ends and what it pays.** Daily player, all runs (full): cleared 28%, home 19%, defeat 53%; 4.17 fights, 0.46 elites and 1.09 keepsakes a run; the pack found is 4.2 (Bait, Essence and scrap added up) and 3.35 of it is kept; 89% of runs reach the camp, where the choices are rest 3%, swap 24%, keepsake 53% and home 21%. Casuals clear 61% and go home 9%. Players stop at the same wall as before (depth 14, the first landmark, clears 11 to 12% of runs). A full clear pays Bait 3.8, Essence 1.06, scrap 2.3, a supply, a 60% shard and a 15% gear drop (today's: 3, 1, 2, a supply, 60%, 15%). A run that heads home pays Bait 2.5 and scrap 0.5 after 2.4 fights; a defeat keeps Bait 1.8 and scrap 0.7 of 3.2 and 0.9.

  Per daily player and week (6 sims of seed `leet`, 12 weeks), three rooms → map:

  | Measure            | Before | After |
  | ------------------ | ------ | ----- |
  | Runs               | 6.84   | 6.82  |
  | Dungeon experience | 2917   | 2982  |
  | Bait               | 14.2   | 17.2  |
  | Essence            | 3.03   | 3.54  |
  | Scrap              | 11.9   | 12.0  |
  | Gear items         | 0.43   | 0.40  |

  Bait is the one that is not close (+21%): a fight pays Bait 1 and a path has 4 of them, against 3 rooms; it is about 5% of a player's weekly Bait, so it is left.

- **Outcome (sim): the other targets** (`pnpm sim` full, seed `leet`): 94 targets, 65 pass and 29 fail (B-018: 92 targets, 65 pass and 27 fail). The raid is easier again (phase 1 68.9% → 74.2%, finale typical 69.9% → 76.5%, finale 15 players 66.5% → 70.5%, `raid-ko-share` 29.4% → 26.3% and now passes) and `curve-r6up-default` is 72.7% (62.0% before; range 45 to 65%): the raid retune after the revamps is where all of these belong. The gear share targets, `gear-newcomer-catchup` (55.0%), the expedition slots and `creatures-talent-share-min-maxer` (-2.1%; 9.9% in the first full run) move by a few points whenever any number changes, because every journey server plays the dungeon: 5 targets differ between the two full runs of this entry (four gear and talent shares, and `curve-default-phase1`), none of them from a dungeon rule. The dungeon does not look like the cause of anything that moved on purpose; read the raid numbers against this entry's date.
- **What did not pass, and why.** `dungeon-gear-share-week8` (22.8%, limit 20%) was failing before (23.6% in the quick run, 21.7% in B-018's full run) and is not a loot number: with no gear drops, shards or scrap from the dungeon it is still 21.6%; with no dungeon experience it is 24.4% (experience lowers the share); with **no supply** from the dungeon it is 18.5%. The supply of the first fight cleared (`RULES.dungeon.perRoom[0].supply`, tiers by depth did not matter) feeds the trips, which feed the Workshop. That is a design question (a supply on some runs only, or a basic one only), not a tuning one; the shipped design keeps one supply per run, as B-011 decided.
- **Expected.** Live: most runs of a regular player end at the camp or just after it (a share of home runs near a fifth), a clear takes 4 to 6 fights, and players keep reaching a depth wall around depth 14. Watch the share of runs that head home, the share of defeats in a player's first run, and `dungeon_camp` choices.
- **Follow-ups.**
  - Worker parity: the sim's supply count reads `RULES.dungeon.perRoom[0].supply` (the worker pays a constant 1: both are 1) and the sim pays Market Day's scrap per fight cleared (the worker's `pay` does not appear to yet). Experience, the pack, the chest, the supply and the retry rule are as the worker's.
  - Gear share at week 8 and the raid retune (see above).
  - Keepsake and event balance (the sim picks the first keepsake, or the best by a flat score, and the free or costly option by health): a study of what each is worth would show if one is always right.
  - The wary rule is a stand-in for what players will do near their wall; replace it with live data (`dungeon_camp` by depth and by the previous run's outcome).
