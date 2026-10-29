# Combat v2 roadmap: from the lab to the game

Status: agreed with Misa, 2026-10-26. How the new combat system replaces the old one: eight phases, each ending at a gate that says when it is good enough to go on. Phases 1 to 3 may overlap. The proposal (`proposals/001-combat-v2.md`) holds the rules; this page holds the order.

## The phases

| #   | Phase                       | What happens                                                                                                                                                                                                                                                                                                                                                                                  | Gate                                                                                                                                                                                                                                                                                                                              | Misa's part                                                                    |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | **Finish the design** (lab) | Knacks and combat talent pools for every species; the bosses and the dungeon foes as slot patterns, arenas and rule cards; Mire's place (its Setter path and its reactions); the gear plan as a table; the panel after each slice.                                                                                                                                                            | The panel has no must-fix findings. The lab report shows: every card's intended answers beat the classic line (P-13); no Knack used almost everywhere without a counter card, none never used (P-05, P-10); the casual roster uses at least 1.5 of 3 creatures beyond its top three; the classic line loses on most cards (P-11). | Accept principles and the proposal; approve names in batches; play in the lab. |
| 2   | **Engine v2**               | Port the lab's rules into `@creatures/engine` as a new rules version. Stored fights keep their rules version and replay as they were. The lab's tests move down to the engine.                                                                                                                                                                                                                | Lab parity: the engine gives the lab's exact results on the same seeds and inputs. Every engine and replay test green.                                                                                                                                                                                                            | None.                                                                          |
| 3   | **Content as data**         | Knacks, talents, rule cards and v2 bosses as schema-validated content files in `@creatures/game`; compendium entries; icons for keywords and attack shapes.                                                                                                                                                                                                                                   | Content tests: unique names (P-06), every keyword defined, every card has answers, every form has its Knacks.                                                                                                                                                                                                                     | Approve new names and flavour.                                                 |
| 4   | **Game integration (flag)** | Behind a `COMBAT_V2` flag, on staging only. Server: a saved Knack per creature, raid stages with attrition (R14), swap requests (R19), the dungeon on the new rules, new analytics events (Knack picks and swaps, creatures used beyond each player's top three). Client: the raid board (slot highlights, the mark strip, the turn strip), the Knack picker, the creature page, How to play. | The full suite, the read budget and the query plan checks green. A whole raid weekend runs on staging with bots.                                                                                                                                                                                                                  | Test the screens on staging.                                                   |
| 5   | **Simulation and balance**  | The journey simulator on engine v2: the Boss Rank curve, dungeon depths, week-by-week progress per play style, the raid weekend with attrition. One balance pass, spiky, not flat (P-10).                                                                                                                                                                                                     | Sim targets: weekly raid win rates in band at each rank, the classic trio not best everywhere, diversity of winning teams, no dead Knack.                                                                                                                                                                                         | Choose where numbers trade against feel.                                       |
| 6   | **Migration**               | A one-time conversion per server (below), tested on staging data with a dry-run report first.                                                                                                                                                                                                                                                                                                 | The conversion is tested, idempotent (a second run changes nothing) and reported per server.                                                                                                                                                                                                                                      | Decide the two open points below.                                              |
| 7   | **Staging playtest**        | A real raid weekend on staging with Misa and testers, plus a few dungeon days.                                                                                                                                                                                                                                                                                                                | Misa's go.                                                                                                                                                                                                                                                                                                                        | Play; feel feedback.                                                           |
| 8   | **Ship**                    | Merge; announce as an experimental season; weekly retunes in patch notes; watch the signals and a "was this fun?" after the raid.                                                                                                                                                                                                                                                             | None: after this, the loop is live feedback.                                                                                                                                                                                                                                                                                      | Merge; react to feedback.                                                      |

## The migration (Misa, 2026-10-26)

Players keep their creatures: species, form, level, ribbons, evolutions, fusions, nicknames, quirks, shinies and private notes. Everything that changes is rolled fresh with live randomness, as if the creature had just been found:

- **Talents** roll from the new line pools (the Talent Book starts again). A golden talent rolls golden (Misa, 2026-10-27). Each line's Talent Book then holds every talent the player's creatures of that line had (golden kept); each creature has learned the ones it had.
- **Knacks:** every creature knows its form's Knacks (R11) and has none equipped (P-14): players choose.
- **Finale abilities** go.
- **Raid planning resets**: placements, the open week, the after-action history stays readable under its old rules.
- **The dungeon run in progress** finishes under the old rules, or is voided (decide in phase 6).
- **A one-time notice** explains the change, like the level reset's card.

Open for Misa before phase 6:

1. **Boss Rank:** keep each server's rank, or reset everyone to rank 1?
2. **Gear:** convert existing items to the new lines (the proposal's gear plan), or reroll them completely like talents?

## How we know it is good

Three layers, from cheapest to most real:

1. **The lab** (automatic, every change): the report's gates in phase 1, the tests.
2. **The panel** (every slice): four reviewers against the principles; findings with verdicts in `reviews/`.
3. **Play** (Misa, testers, then players): the lab page now, staging in phases 4 and 7, live signals after phase 8.

Big simulations come in phase 5 on purpose: week-by-week and Boss Rank numbers mean something only once every species, boss and foe exists in the new system.

## Progress

| Phase | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | In progress (2026-10-29). Done: rules v0.8; Knacks for every form, growing on evolution (R11); the talent library with line pools, tuned so talents are about 20% of a team's result (R20, `modifiers.md`); armour per species; the five raid bosses and fifteen dungeon foes with Build-up, new attack shapes and announced attacks (R2, R8, R22, R23); a dungeon map model with the camp; panels 1 to 4. Next: see "Where we are" below. Content gap: Mire has no Setter or Payoff (new species and art). |
| 2–8   | Not started                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## Where we are (handoff, 2026-10-29)

**Merged:** PR #92 (design docs, the lab, the wiki) and PR #104 (the five raid bosses, the fifteen dungeon foes, Build-up, new attack shapes, announced attacks, rule-card strength by Boss Rank, the dungeon map model, panels 4 and 5 with their fixes). Next work goes on a new branch from `main` (`combat-v2-next`).

**Where the numbers stand** (`lab-report.md`; the main measure is the share of boss HP removed, with the retreat tiers 30%, 85% and the kill; Boss Rank low / mid / high sets rule-card strength, boss stats and the lab roster's level 12 / 18 / 25):

- A prepared team removes 98% to 100% at every rank and kills 73% to 100% of weekends; with random legal talents it still removes 84% to 100%.
- Without the boss's tool a team still removes 67% to 90%: the tool adds 9 to 33 points ("asks" at low rank, closer to "requires" at high).
- A mixed server (10 players) removes 56% to 79%; the unprepared classic party never kills, removing 14% to 76%.
- No Knack family gates more than 2 bosses; talents are about 20% of a team's result.
- The dungeon: careful routes clear 99% at depth 1 down to 52% at depth 8; every foe asks for something; the Undercroft drops to 19%, 4%, 1%.

**Next steps, in order:**

0. **First: find and fix drastic inefficiencies in the lab setup** (Misa, 2026-10-29). The bosses work took about 14 hours of agent time, mostly serial; the full lab report took 517 to 585 s on one of 4 cores. **Done (2026-10-30):**
   - **Profiled:** 95% of the time was the fight simulation itself, on one core (raid boss sections 62%, talent section 25%); only about 15% of weekends were exact repeats, so caching results would not have helped much.
   - **Faster fights** (about 2.25x): a cached list of living creatures, scans instead of sorting, memoised effects and stats, and passes skipped for effects nobody carries. Same random draws in the same order: the report is byte-identical.
   - **All cores:** the report is a plan of independent jobs (per boss search and study, per foe, per talent form, per card) on worker threads, assembled in the original order; `--jobs 1` gives the same output. `--bosses --boss <id>` runs one raid boss; every run ends with per-section timings and the longest jobs.
   - **Tests split:** the 22 s boss test file is six files by topic.
   - **Result** (4 cores): full report 585 s to **80 s**, quick report 76 s to **13 s**, one boss 17 s (5 s quick), lab tests 25 s to **11 s**. **Speed budget:** full report under 2 minutes, quick under 20 s, one boss under 20 s, lab tests about 10 s (`docs/design/testing.md`). A change that breaks the budget profiles first (`node --cpu-prof scripts/report.mjs --quick`) and says why in its PR.
   - **Still to do:** the **automatic tuner** (targets as data in `src/targets.ts`, a search over boss HP, Attack and armour per rank that reports the best fit and which targets conflict), in progress; and **the success targets need Misa's confirmation before the next tuning pass** (moving targets cost the last pass most of its time). Caching by input hash is not needed at these speeds.

1. **Leftovers from the bosses:**
   - At high rank the unprepared party still removes about two thirds of Tidal Colossus's and Old Bogback's HP, more than a mixed server: they need a gate the classic trio lacks, and re-searched answers.
   - A low-rank mixed server reaches 61% to 79%, not the 85% tier.
   - Living Shelter is now the most picked Knack (Ancientshell's only one in the searches).
   - Zigzag still near the "stands out" line (idea: separate its Taunt).
   - Baked Shell and Crown of Embers still rarely picked.
2. **The gear plan:** which shipped gear lines change, merge with a talent's name or retire in combat v2 (proposal, "Gear: what changes"), with the lab measuring the main ones.
3. **Panel 6** on the leftovers and the gear plan.
4. **Phase 1 gate check** (the phase 1 row above): panel without must-fix findings, every card's answers beat the classic line, no Knack used almost everywhere and none never used, the casual roster beyond its top three, the classic line losing on most cards. Then a PR, and phase 2 (the engine port) can start.
5. **Later content:** a Mire Setter or Payoff (needs art); the Undercroft's own foes; an opt-in harder boss for the endgame (Misa, 2026-10-29).

**Open questions for Misa:** none waiting.
