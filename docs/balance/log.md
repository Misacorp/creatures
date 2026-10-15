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
- **Follow-ups:**

### B-003: Row order decides whether a team reacts at all (closed)

- **Opened:** 2026-10-14, from the role assessment, with the dungeon moving to always left to right.
- **Finding:** under left to right the same trio swings 30–55 clear points by order. The starters in the old suggested order (Splashet / Sproutle / Cindle) never react: at depth 5, level 8, they clear about 3% against about 47% for Cindle / Sproutle / Splashet.
- **Hypothesis:** the suggested order ignored elements.
- **Options:** element-aware suggested order; an in-setup hint that names the reaction or warns that none is possible.
- **Action:** both, in the left-to-right dungeon PR: `rowScore` / `dungeonRowOrder` in `packages/game/src/rules/dungeon.ts`, and the reaction hint in team setup.
- **Expected:** sim targets hold (they do: 47 of 47 on seeds leet, leet2, leet3).
- **Outcome:** shipped with the PR; watch live `dungeon.team_species` and clear rates by depth.
- **Follow-ups:**

### B-004: Guard and support barely matter in the raid (open)

- **Opened:** 2026-10-14, from the role assessment.
- **Finding:** removing guard or support mechanics changes the finale win rate by 0–1.2 points, even with boss Attack ×5. Contribution credit pays a guard about 0.3–0.55× and a support about 0.25–0.75× of a payoff per creature.
- **Hypothesis:** one boss hit a round can't threaten a row of 15–45 creatures.
- **Options:** attack patterns that hit many creatures at once (`docs/design/attack-patterns.md`); a credit multiplier for guard and support.
- **Action:** none yet; attack patterns are in design (prototype: guard + support + Shield Wall worth about 11 finale-win points with good formation, against 5 today).
- **Expected:**
- **Outcome:**
- **Follow-ups:**

### B-005: Three sim targets just outside their limits after row-edge adjacency (open)

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
- **Outcome:**
- **Follow-ups:**

### B-006: Fallen creatures no longer absorb boss abilities (open)

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
- **Follow-ups:** B-005 (its three edge cases are now: leet finale passes, leet2 and leet3 `exp-casual-discovery` / `raid-boss-spread` swap places).
