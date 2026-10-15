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
