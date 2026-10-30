# Combat engine and balance

The shared combat engine, abilities, statuses, elements, the balance simulator, balance passes, and combat v2 in the lab.

<!-- Maintained with `pnpm decisions`; see README.md. Newest first. -->

## 2026-10-30: A boss's tool line must be ownable at the week its slot arrives (the roster comes from the valley)

ID: `2026-10-30-a-boss-s-tool-line-must` · Status: current

**Decision.** The combat lab's roster is the valley's: `packages/lab/data/valley/roster-profile.json` and `server-coverage.json`, copied from the valley branch (`ccr-93a1de17-yutb1a`, commit `8ffe5d0`) and read by `src/valley.ts`, replacing the placeholder curves. The speeds (slow, expected, fast) stay as sensitivity factors on the valley's levels. A slot's **tool line** (the boss's first answer) must be **ownable** at the slot's arrival week: the chance that a mixed server of 8 owns every non-common line it uses is at least 50%. Ownership is counted per line (an evolved form is owned by owning its line's stage 1 form, with that form's rarity); the chance is the product, over the distinct non-common lines, of that rarity's coverage at that week. An all-common answer is always ownable. The numbers are `OWNABLE_CHANCE_MIN` and `OWNABLE_SERVER` in `targets.ts`; the check is `ownability.ts`, held by `test/ownability.test.ts` and printed by `--path` and the full report.

**Reasoning.** Misa's constraint in the valley's round 15: it is fine to require a rare here or there, because players pool their rarer creatures in the raid roster, but a 100% common requirement is too limiting, and epics should not be needed early. One rare line is fine once rare coverage reaches 50% (about week 6 on a server of 8), two need about 71%, an epic is out until late. The valley counts 34 forms as 34 species; reading its share as the chance a given line is owned is an accepted approximation. The classic party also uses Tempestray; it measures an unprepared but decent team and is left alone.

## 2026-10-30: Luck is a build: crit builds, crit charges, boss crits and evasion **[Misa]**

ID: `2026-10-30-luck-is-a-build-crit-builds` · Status: current

**Decision (Misa).** Luck in combat v2 is something players build, not only noise:

- **Crit builds:** crit chance and crit damage come from talents, Knacks, creatures and gear rolls (new gear lines for crit chance and crit damage), and stack, so a creature built for crits can deal +200% or more on a crit; +50% alone is underwhelming. A crit machine may hit less hard but crits often.
- **Crit charges:** effects that store a charge from what happened to a creature in a round and spend it on a crit, for example a dodge that gives a charge for a bigger crit next round, or a Guard that gains a guaranteed crit after blocking enough damage. They tie crits to other mechanics.
- **Boss luck:** a boss can crit, and some bosses dodge more (luck-based rule cards).

**Reasoning.** Misa likes luck and swings; the lab barely used it (5% crit for +50%, a few talents, one gear line, no boss crits). Luck that players can build for is a choice, and more swing inside a weekend also widens the raid's win cliff a little. Crit builds stay within the talent share rule (talents about a fifth of a team's result).

## 2026-10-30: How the boss track is tuned: welcome boss, tool by card strength, a 60% first-weekend aim

ID: `2026-10-30-how-the-boss-track-is-tuned` · Status: current, amended by `2026-10-30-raids-are-tuned-on-damage-potential` · Amends: `2026-10-30-the-boss-track-is-tuned-against`

**Decision (lead).** The track tuner (`packages/lab/src/trackTuner.ts`) tunes each slot for the roster a dedicated server has when it arrives there, in one sweep up the track, with these choices (all data in `targets.ts`; Misa can change any of them):

- **The first slot is a welcome boss:** a new server has its starters, so on slot 1 there is no limit on the unprepared party winning; a prepared team must still win within two weekends.
- **The tool a slot asks for scales with its card strength:** 6, 8 and 10 points of HP at 30%, 65% and 100% cards (the line the rank tests already use), down to 3 points at 0%.
- **Tuned for the expected roster; slow and fast are a sensitivity check.** The path is run at all three speeds (levels 20% behind or ahead) and reported, but the numbers are not tuned for them: a slow server arrives at a slot later and keeps growing while a failed boss returns, and the numbers are re-tuned when the valley's real roster data arrives.
- **No numeric lap floor:** a later lap's card strength never falls, but its HP, Attack and armour may be lower than an earlier lap's when its stronger cards make up for it.
- **Difficulty aim:** among numbers that meet every target, the tuner prefers a prepared team's first-weekend kill rate near 60% (about 84% within two weekends), not the easiest numbers.

**Reasoning.** "Rule cards ask before they require" (Misa, 2026-10-29) means early slots cannot demand a tool's full worth, and at week 1 a prepared team and an unprepared one have the same starters. A raid weekend is a cliff: a prepared team's kill rate goes from almost always to almost never over about a tenth of the boss's HP, and a roster 20% behind moves that edge by 15% to 20% of the HP, so no numbers give a 60% kill at all three speeds; tuning for all three made every boss trivial. Tuning for the expected roster and re-tuning when real data arrives wastes nothing, because only the numbers move. Holding later laps' numbers at the earlier lap's level made Storm Sovereign's later laps, with near-full cards, almost unbeatable. The first tuning picked the most comfortable numbers, so every boss fell on the first weekend and tools mattered only near the kill line; aiming at about 60% keeps Misa's "a prepared team usually wins within two weekends" and lets a returning boss show progress.

## 2026-10-30: The boss track is tuned against a roster profile the valley will supply

ID: `2026-10-30-the-boss-track-is-tuned-against` · Status: current, amended by `2026-10-30-how-the-boss-track-is-tuned`

**Decision (lead, from Misa's direction of 2026-10-30).** Combat v2 owns the challenges and the valley owns the roster, with one data shape between them (`docs/design/combat/boss-track.md`). The boss track (which boss at which Boss Rank, with its card strength), the bosses' numbers and the targets are lab data. A **roster profile** says what each kind of player (daily, weekly, new) has at each week: the levels of their 1st, 3rd, 10th and 20th creature, roster size, available forms, talent slots and gear. A path simulator plays servers week by week against the track (a failed boss returns), and the tuner sets each slot's numbers for the roster a dedicated server has when it usually arrives there. Until the valley's economy lab exists, the roster profile is placeholder data from the valley docs' worked examples, with slow, expected and fast speeds (levels 20% behind or ahead).

**Reasoning.** Misa: two big systems are changing independently, and balance against player progression is not possible until they talk; combat v2's role is to set the challenges, make them easy to configure, and find the expected path for a server. The valley's planned economy lab already reports the 1st, 3rd, 10th and 20th creature's level per week, so the same shape lets its output replace the placeholder with no change to the track, the bosses' content, the targets or the path code; the numbers are re-tuned in minutes. Tuning at three speeds shows how sensitive the raid is to the valley's pace before either ships.

## 2026-10-30: The combat lab runs on every core, with a speed budget

ID: `2026-10-30-the-combat-lab-runs-on-every` · Status: current

**Decision (lead).** Misa asked why the bosses work took about 14 hours of agent time. A profile showed 95% of the lab report's 585 s was fight simulation on one of four cores, and each tuning step reran the whole report. The fight engine is now about 2.25x faster (caches and scans, same random draws in the same order) and the report runs as independent jobs on worker threads, assembled in the original order, so its output is byte-identical to the serial run. The full report takes 80 s, the quick one 13 s, one raid boss 17 s (`--bosses --boss <id>`), the lab tests 11 s. **Budget:** full report under 2 minutes, quick under 20 s, lab tests about 10 s; a change that breaks it profiles first. Caching results by input hash was dropped: only about 15% of the simulated weekends were repeats. The next fix is the automatic tuner, so agents change rules and content while a search sets the numbers against targets Misa has agreed.

## 2026-10-29: The lab's raid roster levels follow Boss Rank

ID: `2026-10-29-the-lab-s-raid-roster-levels` · Status: current

**Decision (lead).** In the lab, the roster's level grows with Boss Rank (low, mid, high: levels 12, 18 and 25; casual players scale the same way). With a level 25 roster at every rank, a softer low-rank boss was a walkover, so the old ladder had given low rank more HP than high. Now HP, Attack, armour and rule-card strength all rise from low to high (a test enforces it), as a real server's creatures grow with the weeks. Known gaps: at high rank the unprepared party still removes about two thirds of Tidal Colossus's and Old Bogback's HP; at low rank a mixed server reaches 61% to 79%, not the 85% tier, because the boss's tool must stay worth 10 points or more. Wide Warmth reaches the far hitter at full strength (Tar Leech asks for it); Guard's Shadow is +10% with Armour -10; Living Shelter is the new most-picked Knack (Ancientshell's only one in the lab's searches).

## 2026-10-29: Measure HP removed; rule cards ask before they require

ID: `2026-10-29-measure-hp-removed-rule-cards-ask` · Status: current

**Decision (Misa).** Boss fights should not be all-or-nothing. Getting the boss to 10% left is very different from doing nothing, and players should feel their choices move the result ("just a little more of this and next week we beat it"). So:

- **The main raid measure is the share of the boss's HP removed** (with the retreat tiers beside it); every choice's impact is shown as HP removed, not only as kills.
- **Rule cards have a strength**, not an on/off switch (reflection returns a share of the damage, armour grows by a share, a one-shot becomes a heavy hit, and so on). A card **asks** for a tool at low strength and **requires** it at high strength.
- **Strength rises with Boss Rank.** Early raids must not expect servers to have an answer to every problem (they lack creatures, talents and gear): a server without the answer still does real damage, and the right tools turn it into a kill. Hard requirements are a challenge for the later stages and the endgame.

## 2026-10-29: Raid tuning aims at success tiers and robustness

ID: `2026-10-29-raid-tuning-aims-at-success-tiers` · Status: current, amended by `2026-10-30-a-failed-raid-boss-returns-next` · Amends: `2026-10-29-combat-v2-raid-boss-hp-grows`

**Decision (lead).** The honest measures after panel 5 showed the raid fights are knife-edge damage races: prepared answers won 92% to 100% with their exact talents but 0% to 28% with random legal talents, and one HP rule for all bosses emptied mixed servers. Two changes of aim for the lab:

- **Success tiers, as the shipped raid has them:** the boss retreats at 70% and at 15% of its HP left, and is defeated at 0 (`RULES.raid.phases[].clearAtLossBp`). The lab reports the share of weekends reaching each tier, not only the kill: a prepared team usually kills, a mixed server usually reaches the second retreat and sometimes kills, an unprepared party may reach the first.
- **Robustness:** prepared answers are tuned to win with random legal talents too (about 60% or more), since a talent is meant to be about a fifth of a result, not the whole weekend.

Also: Stubborn is once per weekend and never heals; further anchors of a move skip creatures already in its shape; moves on one boss turn land in the boss card's order (R8.3); one HP exponent (0.7) for every boss.

## 2026-10-29: Opt-in harder raids belong to the endgame

ID: `2026-10-29-opt-in-harder-raids-belong-to` · Status: current

**Decision (Misa).** An optional harder version of the week's boss (an extra rule card, a better chest) is a good idea, but for the endgame: once players have crafted gear, max-level creatures and less to strive for, choosing more difficulty means more. Not in combat v2's first release.

## 2026-10-29: Combat v2 balance pass against the real bosses

ID: `2026-10-29-combat-v2-balance-pass-against-the` · Status: current · Amends: `2026-10-29-combat-v2-raid-boss-hp-grows`

**Decisions (lead).** Lab rules from the balance pass: aimed boss moves may pick several targets per 4 columns, so a wide raid does not thin them out (R2.1); boss HP grows in a straight line past 10 players (R14.1); raid measures report HP left after each stage beside knockouts (Misa's note). Content: Thornmother's armour is 98, so only a Pierce line gets through (her tool); Storm Sovereign's Judgement Bolt is a one-shot on the strongest Payoff that only Night Watch takes (so Night Watch has a boss); Primed by Pain marks at every interception (x2, once a round); Baked Shell builds Heat at round start; Circle Round heals 14%; Lightning Ears costs 8 armour; Zigzag is +12 dodge and +1 count. Results: prepared teams win 98% to 100% and lose 1 to 7 creatures; mixed servers win 36% to 65% and lose 22 to 33. Storm Sovereign's mixed result (36%) is below the aim; raising it lets the classic party win in wide rows, so it stays for the panel.

## 2026-10-29: Raid losses: mixed servers should feel them; measure HP left

ID: `2026-10-29-raid-losses-mixed-servers-should-feel` · Status: current

**Decision (Misa).** A prepared team losing about 1 to 5 creatures a weekend is fine, but mixed servers should feel losses more; creature losses may go up if that makes an impact. Also measure creatures' HP left after each raid stage: everyone alive but low on health is a good result too.

## 2026-10-29: Combat v2 raid boss HP grows with the number of players

ID: `2026-10-29-combat-v2-raid-boss-hp-grows` · Status: current, amended by `2026-10-29-combat-v2-balance-pass-against-the`, `2026-10-29-raid-tuning-aims-at-success-tiers`

**Decision (lead).** In the lab, a raid boss's weekend HP grows with the arena's width, as (players / 4) to the power of a per-boss exponent (0.55 to 1.23), like the shipped game's `hpExponent` (1.1). With a fixed HP, the classic party won every weekend in rows 10 and 15 wide, since more creatures simply deal more damage. Move counts scale with width too (`perColumns`), so a pattern covers the same share of a wide row as of a four-wide one. The exponents are lab numbers, tuned per boss; the port (roadmap phase 4) sets them with the shipped scaling.

## 2026-10-28: Announced random attacks; dungeon clear target; the camp stays

ID: `2026-10-28-announced-random-attacks-dungeon-clear-target` · Status: current

**Decision (Misa).** Every random boss attack is shown at round start, with the attack's icon on each targeted creature (players cannot stop it, but watching it come is exciting). A dungeon clear is beating the day's floor boss; with the map's agency (route, skipped fights, safe mystery options, keepsakes, the camp) a good all-round team clears over 50% of runs at depths 1 to 8, and the Undercroft is where success drops. The camp keeps today's choices (rest, swap a creature, take a keepsake; push on or head home).

## 2026-10-28: A well-prepared raid team should usually win

ID: `2026-10-28-a-well-prepared-raid-team-should` · Status: current

**Decision (Misa).** A well-picked team built for the week's boss should win most weekends: finding the way to beat the boss and pulling it off is the reward, and that is the player agency combat v2 is for. Unprepared rosters (the same three creatures every week) should not stand much of a chance. The lab's raid targets follow: the best focused team wins most weekends (about 85% to 100%), the classic party rarely or never, and creatures are still knocked out along the way.

## 2026-10-28: Combat v2 content direction: raids hyper-focused, dungeons all-round

ID: `2026-10-28-combat-v2-content-direction-raids-hyper` · Status: current

**Decision (Misa).**

- **Existing foes are not sacred**: names, elements, gimmicks and numbers may all change for combat v2.
- **The raid** is announced in advance: one known boss, so players build a hyper-focused roster against it. Raid bosses get stronger and many more attacks, especially area attacks in varied patterns (rows, columns, several columns, chains, several random targets). Creatures should be knocked out in raids.
- **The dungeon** shows its encounters up front but sends many different foes, so it asks for an all-round team. Dungeons are tough, so the camp between rooms matters. The Undercroft stays a mystery: a push-your-luck choice players may skip.
- **Every mechanic matters somewhere**: each Knack family, talent kind, keyword, armour, silence, Mired, marks, Charged moves, Taunt, intercept and cover is the answer (or the problem) for at least one boss or foe.
- **Spiky is fine**: perfect balance is impossible; fun swings are welcome.

## 2026-10-28: Random talent rolls stay situational

ID: `2026-10-28-random-talent-rolls-stay-situational` · Status: current

**Decision (Misa).** A casual player with random talents gaining about 7% to 9% (against about 20% for the best fit) is fine: random rolls should stay well away from the best fit, so talents stay situational rather than flat. Finisher, picked by 9 of the 15 best teams, is fine for now; watch it. The lab's team check now asks that random rolls gain something but at most 60% of the best fit's share (the old 10% floor is gone).

## 2026-10-28: Talent strength is a share of the team's result

ID: `2026-10-28-talent-strength-is-a-share-of` · Status: current · Amends: `2026-10-28-how-strong-a-talent-should-be`

**Decision (Misa).** "About 20%" means the share of a team's success that comes from talents, on average: the same team with its talents taken away does about 20% worse (talents' share = 1 - without / with, the measure the journey sim's creatures study already uses). A single talent may spike above that on the week it fits best (option B), as long as no pool has a single must-pick. This replaces the earlier reading of +20% as a per-card ceiling.

**How the lab checks it (lead).** The report adds a team measure: for each card, the best gauntlet and raid teams with their creatures' best-fitting talents from their pools, against the same teams with no talents; the talents' share averages about 20% over the cards. The per-talent table stays to find duds and must-picks.

## 2026-10-28: How strong a talent should be

ID: `2026-10-28-how-strong-a-talent-should-be` · Status: current, amended by `2026-10-28-talent-strength-is-a-share-of`

**Decision (Misa).** Talent choice should feel like it has a big impact. Roughly **+20%** on a team's result is the upper target for a talent at its best (Misa's guess, to be checked in play). Power comes from many sources (Knacks, gear, placement and synergies, stats, levels), so what talents gain is taken from those. Too strong and players think each creature has only one valuable talent, so no pool may have a single must-pick.

**How the lab checks it (lead).** In the report's talent section (best legal board with against best legal board without, on a boss the classic line kills in about 8 rounds): a talent's gain on its best card is at most about +20%; the good talents of each role sit at about +8% to +15% where they fit; in each line's pool, every role has at least two talents within a few points of its best one. Raid-shaped talents (neighbours, row ends, long fights) are measured on a raid row as well.

## 2026-10-28: Armour per species; talents go into the line's book automatically

ID: `2026-10-28-armour-per-species-talents-go-into` · Status: current · Amends: `2026-10-27-combat-v2-which-talents-can-appear`

**Decision (Misa).**

- **Armour is a species stat**, in the stat block like HP, Attack and Speed. Each line has its own base; lines that start as Guards lean higher; an evolution never lowers it. The Armor gear line works for every creature going forward (changed with the engine port, not now). Variety is the point: the species with the most armour is a choice to build around, not a default.
- **Found talents are recorded automatically** in that line's Talent Book; the duplicate choice is only about the creature (Fuse, Release, Keep). A creature learns a talent from the book for Bait the first time; afterwards swapping among its learned talents is free (before the raid locks). This answers panel 3's question on swap costs.
- **Idea for later:** if creatures ever "work" at places, a school where a creature learns a random talent from its line's book after some time.

**Notes (lead).** Both change the live game's systems (stats, the duplicate flow), so they are built with the game integration (roadmap phase 4) and the migration (phase 6). The lab gets per-species armour now, so the numbers reflect it.

## 2026-10-28: Armour works for every creature; the first talent batch is in the lab

ID: `2026-10-28-armour-works-for-every-creature-the` · Status: current

**Decision (Misa).** Armour is a stat of every creature: Guards have the most, and talents, Knacks and gear may raise anyone's. No armour effect is limited to Guards (R13). The shipped gear line Armor still says "Guards only"; it changes with the engine port.

**The batch (lead).** 35 talents in the lab from `modifiers.md`, with the engine hooks they need (neighbour, position, round, boss-HP and mark conditions; triggers; Flank Guard and Long Shadow; shared armour; Thick Skull; Brace; Bright Boost, Kindred Boost, Triage, Overheal Spill; Heavy Hand, Clinging, Light Sleeper; Cull and the killing blow). Rules: Mired fades one stack per round, the Shake It Off card cleanses debuffs on an announced round, cover is capped at 75% (R8.6, R15, R21). Twelve old lab talents were folded in or dropped. The report: talents add +0% to +22% on their boards; Lone Wolf, Flank Guard (Left) and Shoulder to Shoulder are best on most cards of their role (measured on boards chosen to show them, so a ceiling); Share the Load, Long Shadow and Thick Skull are near zero on plain boards; Shake It Off has no working answer yet.

## 2026-10-27: Combat v2: which talents can appear on which creatures

ID: `2026-10-27-combat-v2-which-talents-can-appear` · Status: current, amended by `2026-10-28-armour-per-species-talents-go-into`

**Decision (Misa).** A line's talent pool says which talents can appear on its creatures. A creature starts with the talent it was found with (a starter with a set talent), and grows its own Talent Book through Teach: a found talent goes only into the book of the creature it was found for, and must be found again for another creature. When an evolution changes the role, slotted talents that become idle are rerolled from the pool among the talents that work for the new role, shown as unknown cards on the evolution screen (phase 4); until then idle talents after a role change are accepted.

**Notes (lead).** Teach already works per creature today (`catch-choices.ts`: a duplicate's talent goes into the book of the player's creature of that line), so only the starter's set talent and the evolution reroll are new; both are recorded in R20 and built in roadmap phase 4. Which talent each starter gets is content, chosen with the starter list.

## 2026-10-27: Combat v2: Knacks grow on evolution, talents by line, golden stays golden

ID: `2026-10-27-combat-v2-knacks-grow-on-evolution` · Status: current · Amends: `2026-10-26-combat-v2-knacks-for-every-species`

**Decision (Misa).** (1) A creature knows its form's Knacks from the catch, and evolving adds the new form's own Knacks (R11), so base forms work from day one and evolving brings something new. (2) Talent pools are per creature line, drawn from one shared library with one name per effect (R20), so two lines of the same role can roll different tools. (3) At the migration a golden talent rolls golden.

**How (lead).** The lab stores each form's own Knacks (`OWN_KNACKS`) and works out the full list from the evolution line (`knacksOf`); on a role change only the new form's own Knacks count, since the old role's would do nothing. The talent library grows from 11 to 18 talents (new effects: Max HP, crit damage, low-HP damage, an own area cut, Hold On, a reaction bonus, area dodge), each marked with the roles it works for; each line has a pool of seven with at least three that fit each of its roles (a test). The wiki shows the line pools and marks idle talents. In the lab report, Tidewing keeping Lead the Way moved Bloomback from 10 of 14 best gauntlet lines to 6.

## 2026-10-26: Combat v2: Knacks for every species, talents by role (panel 2)

ID: `2026-10-26-combat-v2-knacks-for-every-species` · Status: current, amended by `2026-10-27-combat-v2-knacks-grow-on-evolution`

Tagged combat v2. Lead agent, after the second panel (`docs/design/combat/reviews/2026-10-26-panel-2.md`); proposal v0.6.

- **The roadmap** (`docs/design/combat/roadmap.md`, agreed with Misa): eight gated phases from the lab to shipping, and the migration (creatures and levels stay; talents reroll; Knacks start as none; raid planning resets).
- **Every form has Knacks** in the lab. New: Guard's Shadow, Crown of Embers, Hide in Mist, Thick Fog, Drizzle, Living Shelter, Territorial, Carry Them, Starlight, Lantern Glow, Hearth. Families live in the data (`FAMILIES`), and a test fails on a family that is not defined.
- **Combat talents are by role, one name per effect** (R20): four per role from eleven, shared by every species; a talent never repeats a Knack and Seal is never a talent, so a roll never decides the Knack choice. Per-species flavour talents were tried and dropped: they copied Knacks and each other under other names (P-06) and each would need its own rule (P-09). **Misa (2026-10-26): use shared names everywhere**, so the shipped species-named talents (Splashet's "Playful" and the rest) take the shared name of their effect at the migration.
- **Ohmouse loses Double Mark** (a Guard that marks x2 was P-02's Fail example); **All at Once needs x3**; **Tidewing gets Double Mark**; Retaliate ignores armour; crit talents stay inside the reaction cap; reaction-fed Stores gain at most 1 per round.
- **Still open:** Bloomback in 10 of 14 best gauntlet lines, with Voltaro's Zigzag; the next slice.

## 2026-10-26: Combat v2: Misa's answers to the first panel

ID: `2026-10-26-combat-v2-misa-s-answers-to` · Status: current

**Decision (Misa).** (1) Raid attrition stays as written: a knocked-out creature is out for the weekend, with no "tired" return; players have spare creatures by week 2. (2) Silence stops the role's verb as well as the Knack, talents and gear effects: a silenced Setter does not mark, a Payoff does not cash, a Guard does not intercept or cover, a Support does not boost or heal; the creature still makes its plain hit. (3) Raid swaps across players are wanted: "we do it manually now; a system would help". Recorded in proposal 001 v0.5 (R12, R14, R19) and in the lab (`packages/lab/src/fight.ts`, test "silence stops the role"). Swap requests move up from "not a priority" on the roadmap.

## 2026-10-26: Combat v2 is designed in a lab before it touches the engine

ID: `2026-10-26-combat-v2-is-designed-in-a` · Status: current

**Decision (Misa, 2026-10-25 and 26).** The combat rework (species Knacks instead of finale abilities, primer and detonator marks, slot-based boss targeting, a boss turn after each row, armour with Blocked hits, raid attrition, healing as a pillar) is iterated as a proposal with a reviewer panel and a prototype simulator before any of it reaches `@creatures/engine`. Misa's calls so far: only Setters mark and only Payoffs cash marks (Anthem's primers and detonators); a hit that cashes a reaction leaves no mark by the base rules, but effects may add marks; no Swift or Last; targets are slots, and a slam is three slot targets that each roll dodge; dodge before intercept; armour is a flat stat and a hit at or below it is Blocked; the raid arena's row count varies by boss, and the boss acts after each row; in a raid weekend HP carries over, nobody heals between stages and knocked-out creatures are out; the dungeon keeps its structure; the same effect keeps the same name everywhere; counts shown as numbers (x3); strong combos may stand out (answer them with counter cards before nerfing); the live finale keeps Rally, Shield Wall and Purge for now.

**How it is built (lead's calls).**

- **Docs** in `docs/design/combat/`: `README.md` (North Star, which document wins, reading order, the loop), `principles.md` (P-01 to P-12, each with pass and fail examples and a review question; only Misa accepts one), `grammar.md` (families, limits, templates), `keywords.md`, `proposals/001-combat-v2.md` (the numbered rules R1 to R18, drawbacks, alternatives, open questions, testing plan), `reviews/` (panel results). `knacks.md` and `lab-report.md` are generated; never edited by hand. The structure follows research on rules references (one definition per keyword, a named authority), design pillars as filters with examples, ADR-style proposals and small always-loaded context.
- **`packages/lab`**: a pure prototype of the draft rules (no I/O, injected RNG, its own small rule set), separate from the shipped engine on purpose. It reads species stats from `@creatures/game`. Knacks are data with a small effect grammar (`KnackFx`) plus player text and design intent. `pnpm --filter @creatures/lab report` writes the report (scenarios per rule card, a best-team search per card for a one-row gauntlet and a three-row raid, Knack usage, a raid weekend) and the generated Knack catalogue; `test` checks the rules and the content rules (keywords exist, names unique, intent written). Pyrelynx and Bloomback carry shared family Knacks as placeholders so Grove and Ember marks have a Payoff.
- **The reviewer panel** is a skill, `.claude/skills/design-panel`: four reviewers (rules, player experience, systems and exploits, readability) judge against the principles; the lead writes one review file with a verdict per finding.

## 2026-10-22: Guards have a reach

ID: `2026-10-22-guards-have-a-reach` · Status: current

Misa found that one Guard per row was enough: a Guard stepped in for an aimed hit on any creature in its whole zone row, and the boss's plain attack went straight for the Guard of the front-most row. A Guard now **protects the creatures near it**, and where it stands matters.

- **One reach for both protections.** A Guard protects the creature directly to its left and directly to its right in its own row (1 each side). The same reach decides who it takes aimed hits for (`guardFor`) and whom it covers from area hits (`coverGuardFor`); the old "beside, plus `coverReach` one further" cover logic is replaced. Reach never crosses a zone edge or the end of the board, and an empty board slot breaks it (the walk of `zoneNeighbours`); a knocked-out creature still holds its slot, so it does not. The dungeon's line of three uses the same walk with no zones, so the default is exactly what it was.
- **Per side, and changeable.** `SlotMods.reachLeft` and `reachRight` are changes added to the base of 1; each side ends up between 0 and 3 (`guardReachOf`). Three sources add up: gear lines, a talent, and the Warden's Watch three-piece bonus (set effect `coverReach` renamed `guardReach`: +1 each side, "Protects one more creature on each side of it.").
  - Lines (Guard-only, Charm-only, rolled): **Wide stance** (+1 each side, rare, item level 10), **Long arm (left)** and **Long arm (right)** (+2 on that side, epic, item level 15), **Flank guard (left)** and **Flank guard (right)** (reach becomes 2 on that side and 0 on the other, rare, item level 10). A line names its side because a card has no room for a choice; two lines are clearer than one that rolls a side. They use a new line effect, `reach` (`left` and `right` changes), so no engine knowledge leaks into the data.
  - Talent: **Wide as a Puddle** (Wide stance) in the Mudlump pool, the Guard line's pool, which had room (7 of 8).
- **Reach only for the plain attack.** The boss's plain attack (and a slam aimed `front`) goes for the front-most standing creature, the rule it already used with no Guard, and a Guard steps in only if that creature is in its reach. A Lance still stops at the first Guard in its lane. With several Guards in reach, the existing `pickGuardWith` rule stands (left first without dice, the slot's die with rules).
- **Stored fights replay as they were.** The new rule is a field of the stored combat rules, `rules.guardRule: 'reach'` (not a field of `FightInput`: the rules are already what every builder copies, so the raid, the dungeon run input and every sim fight get it from `liveFightRules()` with no extra wiring, and a fight stored without it plays the whole-zone rule, byte for byte). The reach itself is frozen into each creature's sheet (`reachLeft`, `reachRight`) like `coverReach` was, so later gear changes cannot change a stored fight; the old `coverReach` is still read by old fights and ignored by new ones. `replay-rules.test.ts` is untouched except that one pinned sheet now carries the new fields, and its 200 hashes did not move, which proves an old-shaped input plays the same; `guard-reach.test.ts` proves the new rule.
- **Boards show it.** `guardReachSlots` (`zones.ts`) is the one pure function that walks a Guard's reach; the fight and `affects` (the boards' shading and the picker's line) both call it, so the shading is exactly the slots the fight protects. A slot with a Guard in it is never shaded (a hit aimed at a Guard stays on it). The server sends a Guard's reach on its board tiles and team creatures and on the collection's creatures (`reach`, `guardReach`; Guards only), so the shade and the lines ("Takes the boss's hits for the 2 creatures on its left") show the real gear.
- **Balance:** the simulator ran before and after (`pnpm sim:quick`, seed "leet") and nothing was retuned: the typical group's finale win rate went from 94.6% to 91.2%, and the Guard role's worth (win points lost with the Guard off, spread Guards) from 4.14 to 2.07. The numbers are in the PR.

## 2026-10-20: Riposte stops the boss's turn; Mire passives in every fight

ID: `2026-10-20-riposte-stops-the-boss-s-turn` · Status: current

**Decision.** A boss that falls or retreats during its own turn (a Riposte on a dodged hit) stops there: no later hit, gimmick, plain attack or enrage hit, and no tick of its effects. `on_hit_taken` passives no longer fire on a hit that deals 0 damage. Passives (the Mire Guard and Support signatures) now work in Phase 1 and Phase 2 of a raid too, through a new `FightInput.passives` field, so those phases do not get the fireable finale ability.

**Why.** Review findings: a Riposte could end the fight while the boss kept hitting (and the dungeon carried that damage to the next room); the passives were built only for the finale though speed-and-dodge.md 5.3 calls them always-on. Stored fights replay as before (new field optional, no dice moved).

## 2026-10-19: The element chart is content, and a mark can have several triggers

ID: `2026-10-19-the-element-chart-is-content-and` · Status: current

**Decision.** `element-chart.json` is a list of `{ attacker, defender, bp }` pairs (valibot, strict); a pair not listed deals 10000. The old `strongAgainst` field and `RULES.combat.strongBp` / `weakBp` are gone; the same numbers (15000, 7500) live in the chart, and "strong" means exactly 15000 (`CHART_STRONG_BP`) for reactions, Hunter and Ward lines. `reactions.json` keeps one entry per (mark, trigger) pair, each with its own id and name; entries of one mark repeat its mark id and name. The engine looks a reaction up by (mark element, trigger element). Content tests check every reaction's trigger is strong against its mark and every strong pair has a reaction. Hunter folds onto every element the wearer's element is strong against, Ward onto every element strong against it, and Reaction lines onto every reaction the element sets off. No player-visible change yet: the four-element chart is the old wheel.

**Why.** Slice 2 of `speed-and-dodge.md`: the chart lets Mire and later elements pair up freely. Numbers moved to content so the balance simulator can tune any pair; they are listed in `docs/balance/scalars.md`.

## 2026-10-19: Serpentine, dodge, status effects and Mire

ID: `2026-10-19-serpentine-dodge-status-effects-and-mire` · Status: current

**Problem.** Speed only sorted the turn order on a boss with `speed` order (only Cinder Wyrm), so the stat and the Zoomies talent did nothing three weeks in four, and an order by Speed is not fun to plan around (Misa). The four-element wheel cannot stretch to the many elements Misa plans.

**Decision.** Plan in `speed-and-dodge.md`, built in one PR. Cinder Wyrm gets **Serpentine** order (front row first, rows alternate direction, every row flips each round). Speed becomes the base of a **dodge** chance for creatures and foes (Speed x 10 bp to start, hard cap 50%; full chance on aimed hits, charges and enrage hits, half on area hits, never on reflected hits or a Guard's step-in; a Setter's dodged hit still leaves its mark). **Status effects** arrive as a general system: stacks up to a cap, a duration in the target's own turns, application power in basis points (140% is one stack plus a 40% chance of another), every application refreshes the timer, all stacks fall off together, purge moves and Support cleanse remove them. Matchups become an **element chart** of attacker-to-defender pairs. **Mire** joins: Mire and Ember deal 150% to each other, Tide deals 75% to Mire; its mark Muddied, its debuff Mired, the reactions Smother (Mire on Scorched, applies Mired) and Flare (Ember on Muddied, burns the Mired stacks for damage); a Guard line, a Support line, the raid boss Old Bogback, dungeon foes, the Mud room and the Sunken Fen.

**Why.** Speed should matter every day and reward commitment; durations in the target's own turns keep "3 turns" the same length in a raid of any size and in the dungeon; a chart of pairs lets each new element interact with the others without forcing a cycle (Misa: "we have to rip the bandaid off"). The engine keeps `speed` order and new dice sit behind stored flags, so old fights replay.

## 2026-10-19: `fight.ts` split into modules (B13 step 2); Lantern Light lengthens basic abilities too

ID: `2026-10-19-fight-ts-split-into-modules-b13` · Status: current · Amends: `2026-10-18-engine-and-test-cleanup-from-the`

- **`fight.ts` split.** `simulateFight` was one closure of about 1900 lines over about 30 mutable variables. They are now one explicit `FightState` object (`fight-state.ts`, with the creature and mark types and the small shared helpers: crediting, mutator hooks, who stands beside whom). `hurt` and its Guard helpers are in `fight-damage.ts`, `hitBoss` in `fight-strike.ts`, the boss's gimmicks, charges and attacks in `fight-boss.ts`, and the round-start work (Support buffs, Kind Rain, gear lines, finale abilities) in `fight-round.ts`. `fight.ts` keeps the input checks, the dice draws in their fixed order, the round loop and the totals. Behaviour-neutral: both replay locks (`replay.test.ts`, `replay-rules.test.ts`) pass byte for byte with no re-pin, every other engine test is unchanged, and the engine's public exports are unchanged.
- **Lantern Light lengthens basic abilities too (Misa: yes).** New optional `FightInput.lingerAllRounds` (0 to 3; absent: 0, so every stored fight replays as it was) adds rounds to the Rally, Shield Wall and timed Purge of every ability, basic ones included. One source only: `weatherSky` carries it (`lingerAllRounds`) and the raid, the dungeon run and the simulator pass it on with the other sky fields. `weatherSheet` no longer puts the day's linger on a creature's sheet, so a creature's own ability is not lengthened twice; gear and set linger (`lingerRounds`) stay per creature and add on top. The weather text is back to the full promise: "Shield Walls and other lasting abilities last 1 more round, basic abilities too."

## 2026-10-19: The simulator picks second forms like players, and the legacy digest is retired

ID: `2026-10-19-the-simulator-picks-second-forms-like` · Status: current · Amends: `2026-10-18-branch-evolutions-built-sunfawn-and-ohmouse`, `2026-10-18-second-forms-for-the-six-other`

Two changes to the balance simulator, neither touching a game rule or content (the lead's calls from the cleanup night, approved by Misa).

- **Branch style.** A player profile has a `branch` dial: `first`, `role` or `mixed`; the default for every preset and archetype is `mixed`. `first` takes the original form of a line that grows two ways (`firstForm`); `role` takes the form whose role the team's other top three lack (`pickBranch`); `mixed` gives each player one or the other with a fair coin drawn from the run's seed and the player's id, so a seed gives the same players and about half of a server picks by role (`usesRoleBranch`, `SimPlayer.roleBranch`). The 2026-10-18 decisions kept `firstForm` so the baselines stayed put while the dungeon was reworked; that reason is gone. What moved is in `docs/balance/log.md`, B-022: a few points on the raid and gear targets, one more target failing than before on one seed (66 to 65 of 96 pass), no rule changed.
- **Keep is still not simulated, on purpose.** Keep adds a second creature of a line once both forms are wanted. The sim keys creatures (`<player>/<line>`), explorer XP, familiarity, the duplicate rules (`collect`) and the creatures and gear studies by line, with one creature per line, so a min-maxer with two creatures of a line would be a change to the player state and every study that reads it, not a policy. It would also need the pick of which duplicate to keep and which creature to train, with no live data yet on what players do. Revisit when live data shows Keep is common.
- **The legacy digest is gone** (`legacy-unchanged.test.ts`, `legacy-digest.ts`, `fixtures/legacy-digest.json`). It pinned hashes of four configs that all asked for the old leet-only income (`income: 'current'`), which players no longer have, and about 20 deliberate re-pins in three days showed that it fired on every rule change and was updated by hand each time, so it guarded nothing. Its cost was about 70 s of CI. In its place `run.test.ts` asserts eleven headline numbers of a tiny run on the shipped income (readable, not a hash), with the rule that a change to them is explained in the PR (`docs/design/testing.md`). Determinism, the shipped horizons and the targets stay covered by `run.test.ts`, the targets tests and the `sim` workflow.

## 2026-10-18: Engine and test cleanup from the audit (E2 to E7, E9, B13 step 1)

ID: `2026-10-18-engine-and-test-cleanup-from-the` · Status: current, amended by `2026-10-19-fight-ts-split-into-modules-b13`

- **A second replay lock.** `packages/engine/test/replay-rules.test.ts` hashes the whole result of 200 fixed seeded fights that use what `replay.json` leaves out: the combat `rules`, every attack pattern and charge, sparse boards, the phase floor, enrage, extra boss attacks, luck of every kind, the day's sky, adaptations, creature abilities, partial HP and modifier sheets that stand for gear, sets, talents and weather. Everything the fights read from outside the engine is pinned in the test file, so a content retune never moves it; coverage tests fail if a new `SlotMods` field is not exercised. It is the gate for splitting `fight.ts` later (B13 step 2).
- **Backdraft is announced once a round (E3).** The duplicate `gimmick` event on the boss's turn is gone; the trap is announced when it is armed. 120 fights of `replay.json` and 20 of the new lock changed their event lists only: outcome, HP and credit are identical (checked by hashing each result with its events removed, before and after). Fights stored before this change still carry the second event, so the stage keeps its one-cue-a-round de-dup for them.
- **Hollow Weave heals through `healReceivedBp` (E4).** Like Mend, Kind Rain, Second wind and Second breath, so Well-fed makes it stronger and Long Shadows weaker. The event is unchanged (no `cause`). The six 3-piece set effects are now in `combat-rules.md` 10.10.
- **Two texts now say what the engine does (E2, E5).** Lantern Light: "Creature abilities last 1 more round (Rally, Shield Wall, Purge). Basic abilities do not." (basic abilities belong to no creature, so they never got longer). Lantern Night: "Guards in its row: their abilities last 1 more round." The behaviour is unchanged. Making the basic abilities longer too stays a proposal.
- **Tests do their work, not their bookkeeping (E6, E7, E9).** Hot loops collect problems and assert once (engine `property.test.ts` 18 s to 3 s; game `rng.test.ts` from 12 s to no longer among the slowest files). The game package is back on the default timeout (one test of a million rolls asks for 20 s). The 45-player perf test uses warm-ups and a median like the one above it. The simulator's tests share one run per file, and `RunSettings` gained optional horizons (`pityWeeks`, `longRunWeeks`, `tripLongWeeks`, `studyWeeks`) that default to the shipped constants, so `pnpm sim` is unchanged while the tiny test run plays 6 weeks, not 20 to 60.

## 2026-10-16: groundwork built: the modifier sheet in the engine, the Guard's shadow line, fight-scored power

ID: `2026-10-16-groundwork-built-the-modifier-sheet-in` · Status: current

Step 1 of the build order in `gear-and-creatures-v2.md` (section 14). Nothing is player-facing yet: no gear or talent data fills the sheet. Technical decisions, made by the lead and implementer:

- **The sheet is `FightSlot.mods`** (`SlotMods`, `packages/engine/src/types.ts`, checked by `resolveMods`). Plain integers in basis points, optional, strict (unknown fields, fractions and out-of-range numbers throw). A slot without `mods`, with `{}` or with all zeros replays byte for byte as before (the replay fixture is untouched and a new test checks the three cases on random fights). The full field list and what each field changes is `combat-rules.md` section 10.
- **Conditions are resolved before the fight.** The two that cannot be are keyed tables: `vsElementBp` and `wardBp` by the boss's element (so one sheet serves a dungeon's three rooms), `reactionBp` by reaction id, `besideRoleBp` by role.
- **The hit's bonuses add to the hit's one combined bonus** (with boost, Rally, crit and mutators), not multiply, to stay consistent with 2.4.3. A reaction's extras (`reactionBp`, `ownerMarkBp`, Spark's share and `shareBp`) add into the one factor on the reaction's bonus; the pounce is added to the multiplier's percentage next to a Payoff's own 110%.
- **The taker's order is fixed:** Shield Wall, armor, cover, then the sheet (element ward, charged, shape, every hit), then the single-hit cap, then HP. Each step rounds down. The cap comes after so that it still means "at most this much of max HP". Armor and cover credit is what they really saved given the sheet's later steps, so the sheet never moves credit.
- **The position line for Gear A is "Guard's shadow":** Attack +4/7/10/13/17% (tiers I to V) while a living Guard stands beside the wearer, resolved by the engine from the board (`besideRoleBp: { guard }`, checked at every hit). It uses the same adjacency as Support boosts and cover (same row in the raid, the plain line in the dungeon). It is Misa's own example ("stronger when a Guard stands beside it") and the adjacency sibling of "Lane anchor" in 6.1; the field takes any role, so the other adjacency lines in 6.1 need no engine work.
- **Silence ignored writes no event.** The client rejects event types it does not know, and a `silence` event makes it draw the creature silenced, so an Unbothered creature simply gets no event. "Ignores the first silence in each fight" (the Light Sleeper and Gentle but Stubborn talents) needs `ignoreSilence` to become a count; left for the talents step.
- **Fight-scored power** (`packages/sim/src/fight-power.ts`) plays the raid team (the three strongest creatures) in one line, each beside the next, through a full finale against each of the four bosses at the server's Boss Rank, 3 fixed seeds each, with an unbeatable pool, live rules, live luck, the creature abilities and enrage. The score is the damage dealt before the team falls, per finale round, with the share of HP kept shown beside it. The boss's Attack is divided by the typical server size, because three creatures alone would take every hit a whole raid spreads out (without that, the team is wiped by rank 2 and the score says nothing). It is computed on the last day of each sim week (12 fights per score, about 15 ms) and shown in the journey report and its Markdown next to the old Attack + HP score, which stays so the existing targets still pass.
- **Not done yet, on purpose:** a gear or talent share of fight-scored power (a with-and-without comparison) for the section 4 targets; that is the first thing the Gear A step needs once items exist. The 6.1 "while it stands" lines other than the adjacency ones, sets, chance and trigger lines stay later.

## 2026-10-15: Guard follow-ups: one pick rule, healing credit, the client reads the fight's Guard

ID: `2026-10-15-guard-follow-ups-one-pick-rule` · Status: current

- **One pick rule for several Guards.** With `rules`, every hit that goes to "the Guard" uses one rule (`pickGuardWith` in `patterns.ts`): the die of the slot the hit is aimed at picks among the living candidates. That covers the plain attack, a random-target plain attack, a slam aimed `front` (the front-most creature's slot, so it picks the same Guard as the plain attack that round), `strongest`, `left` and `random`, a chain's first hit, and a reflected hit. A lance has no pick (the first Guard in its lane stops it, by geometry), and chain jumps, splash, sweeps and enrage are area hits that no Guard steps in for. Cover is not a hit taken: its credit still goes to the left-most Guard beside the creature. Without `rules` nothing changed (replay fixture green).
- **Healing credit is new credit, not a move.** The property test's "credit is zero-sum" failure with the live Support effects was Mend (Tide, Grove): the HP a Support really restores is credited as `supportCredit` by design (`attack-patterns.md` section 5), like what a Guard absorbs, so it was never part of the damage dealt. Spark's Overcharge and the buffs were zero-sum all along (a focused test and a 1500-fight stress run with a phase floor confirm it). The invariant now subtracts the healed HP (from the `heal` events), and the property test runs with the live rules again.
- **The client reads the fight's Guard.** The replay and live views carry `rules: { guardHpBp, guardArmorBp }` (null for a fight stored without rules). The stage's HP estimate uses them (the content's old +30% only without rules), and Guard text on the boards (before any fight) uses `RULES.combat.guard`: "takes 25% less damage from every hit". A boss hit that a Guard's armor reduced shows a small shield pip on the Guard's left (`armored` on `boss_hit`).
- **Rules fixes from the rules reference** (`docs/design/combat-rules.md`, written from the engine). With fight rules: a Shield Wall protects the creature that **takes** the hit, after a Guard steps in (the research's "the final recipient's modifiers apply"; it only changes the dungeon, where a Guard stands in another row); a chain never hits the same creature twice, including a Guard that took its first hit; the killing blow on the boss counts only the HP it had left (no overkill, as at a floor). A hit on a creature still **shows its full damage** (a 300 hit on a creature with 130 HP shows 300, as in card games damage dealt can exceed what is left), while HP lost and credit stop at the HP left. Terms: **row** is Front, Middle or Back (as the forecasts say), **line** is the whole formation; code still says zone.

## 2026-10-15: boss and foe abilities only ever target living creatures

ID: `2026-10-15-boss-and-foe-abilities-only-ever` · Status: current

**Decision.** Every targeting rule in the engine picks among living creatures only, in the raid and the dungeon (one fight engine). Misa saw boss abilities aimed at "the leftmost creature of a row" still land on a creature that was already knocked out, which made the boss easier (the fallen creature acted as a flesh wall). The rules, and what each does when its whole target set is down:

- **Row ends** (`silence_ends`: Bramble Bind, Sea Mist, Thorn Snap, Tangle): the leftmost and the rightmost _living_ creature, not slots 0 and n-1. One creature standing is silenced once. (Before, a fallen end creature made the silence miss.)
- **Zone attack** (`hit_zone`: Undertow, Thorn Rain): hits every living creature of the aimed zone. If nobody in that zone is standing, it falls to the nearest zone that has someone (one step away first; on a tie Front before Back), so a wiped-out zone does not make the attack miss. On the dungeon's row of three (one creature per zone) a fallen creature at that place passes the attack on to the next one. Nothing happens only when the whole row is down (the fight is over then). Misa confirmed the fallback over "do nothing" (2026-10-15). The client forecast uses the same `nearestLivingZone`, so its warning names the zone really hit.
- **Strongest** (`strike_highest_atk`), the **plain attack** (front-most living, or the Guard of its zone), a **random target** (luck): already chose living creatures; now pinned by tests.
- **Guard cover**: only a living Guard intercepts (already true; tested for zone and adjacent reach, and for a Guard knocked out mid-fight).
- **Support buffs**: a living Support buffs its living neighbours; beside a fallen creature it buffs nobody there (no skipping over the fallen, that would change the board's adjacency).
- **Re-mark's owner default** (`own`, no chosen element): the element of the player's first _living_ creature.
- **Left as they were:** a creature ability's own `strike` still lands if its creature is knocked out (an explicit design rule, the source is not a target), and Shield Wall `own` covers the zone of its creature even when it fell (a zone, not a creature).

**Result.** No golden or hand-checked fight changed; one test did (`hit_zone` skips knocked-out creatures: it used to expect no strike once the back zone was wiped out, now it expects the strike on the living Middle). New tests in `packages/engine/test/targets-alive.test.ts`, each with the would-be target already down. Full sim, before (79584b2) to after, seeds leet / leet2 / leet3: typical finale win rate 60.25% / 52.2% / 52.6% to 56.1% / 50.6% / 49.3%; typical Phase 2 clear 82.9% / 79.2% / 81.7% to 79.8% / 75.7% / 77.2%; boss spread 9.8% / 13.2% / 18.1% to 7.0% / 17.2% / 12.2%; `exp-casual-discovery` 0.32 / 0.32 / 0.25 to 0.18 / 0.14 / 0.302. Raids got a little harder, as expected, since bosses lose their flesh wall. No retune: see B-006. **Cost to know:** the Activity's boss warning for a zone attack names the aimed zone; when that zone is empty the hit now lands on another one, so the text is then slightly off (not changed here).

## 2026-10-13: Scalars registry and patch notes draft (balance loop, parts 1 and 3)

ID: `2026-10-13-scalars-registry-and-patch-notes-draft` · Status: current

The scalars registry and the patch notes generator from `docs/design/balance-loop.md` are in. Misa wanted a list of the knobs and patch notes once balance patches roll out.

- **Where the code lives.** `packages/sim` (`src/scalars.ts`, `src/patch-notes.ts`, run through `scripts/*.mjs` the same way as `pnpm sim`). The sim already depends on the game package and on `typescript`, so no new dependency was needed. `pnpm scalars` writes `docs/balance/scalars.md` and `docs/balance/content-ids.md`. A test in the sim package fails with "run pnpm scalars" when either is stale, and `pnpm scalars --check` does the same from the shell.
- **What is a scalar.** Every number under `RULES`, plus every numeric field of the content data that tunes the game (creature stats and growth, bosses, reactions, dungeon foes, room modifiers, enchants, destinations, supplies, push-on goals, weekly twists). Journal pages, lore and art briefs are left out. Values come from the validated runtime objects, so they cannot drift from the code.
- **Paths and rows.** Arrays of objects that all have unique ids are keyed by id (`RULES.raid.phases.finale.rounds`, `content.bosses.tidal-colossus.baseHp`), so a reordered list is not a change. Other arrays use `[i]`. An array of at most 8 numbers is one row with the array inline; a longer one has a row per element.
- **Meaning.** The first sentence of the comment on the field (read from the TypeScript source with the compiler API, not a regex), joined with the next sentence when the first is very short. A field without a comment of its own takes the nearest parent's comment below the system level; a system's own comment is not copied onto every number in it. Content fields take the comment of the same field name in the schema files, only when the name has one meaning everywhere. Units come from the key name (`Bp` basis points, `ms`, `Hours`, `Days`, else count).
- **Sim targets** come from a small hand-kept map (`packages/sim/scalar-targets.json`, path prefix to target ids; `raid-*` means every target with that prefix). A test fails when an id matches no target or a prefix matches no scalar.
- **Patch notes.** `pnpm patch-notes [from..to]` reads the two generated files at both refs with `git show` (git is run with argument arrays, never a shell, and refs must match a strict pattern), lists the pull requests named `(#NN)` in the range, the balance log entries whose Action names them, content ids added, removed or renamed, and changed numbers. With no range it starts at the latest `balance-*` tag; with no tag yet it starts at `origin/main` (or the root commit if that is the end of the range), and says so. A start with no registry says "no baseline" and lists the current values. Drafts go to stdout, or with `--out <folder>` to `draft.md` and `draft.json`, which are gitignored.
- **The skill** (`.claude/skills/patch-notes/SKILL.md`) writes the player-facing notes into `docs/patch-notes/YYYY-MM-DD.md`. It never posts to Discord without Misa approving the exact text, and tags `balance-YYYY-MM-DD` only after merge and only when asked.

## 2026-10-11: Crits, boss crits, knockouts and guards measured (study, nothing switched on)

ID: `2026-10-11-crits-boss-crits-knockouts-and-guards` · Status: current

**Decision.** Misa prefers crits to Fortune streaks, so crits were built as stats and measured together with boss crits and boss lethality (`docs/design/luck.md`, second study). Built, all default off and replay-safe: per-creature crit chance and crit damage (baseline in `RULES.combat.luck`, optional `crit` bonus on species and bosses in the content, caps 30% and +150%), boss crits (own chance and damage), "Critical!" on hits and boss hits, a prototype random boss target, and study-tool support for boss Attack dials, knockout targets, boss HP retuning and guard and shield measures. Four payoff species carry a +5% / +25% crit bonus, inert while luck is off.

**Result.** Crits plus boss crits plus any boss lethality (up to 9 knockouts per finale, even with random targets) leave 74% to 94% of typical inputs decided and only 2% to 17% in the 15% to 85% band: the boss knocks out low-Attack front creatures, the same ones every seed, so knockouts are neither big nor random. Fortune streaks (17% each, plus or minus 60%, 3 rounds) on top reach 61% (finale) and 74% (week) in the band with a skilled uplift of +29 and +24. Boss Attack x3 (about 4 knockouts) makes Shield Walls count (leaving them out costs 8 points instead of 3) but the guard role stays worth about 1 point at any lethality.

**Recommendation to Misa (pending his call).** Ship streaks plus crits as flavour; leave boss Attack at x1 until harder bosses arrive; for guard creatures to count, harder bosses need several hits a round or hits that reach key creatures and zone hits a guard can intercept.

**Reasoning.** Variance has to be shared by the whole team to move outcomes; per-hit luck averages out and knockouts with front-first targeting are deterministic and cheap.

## 2026-10-11: Crits are in; progression proposal

ID: `2026-10-11-crits-are-in-progression-proposal` · Status: current

- **Crits** go into combat regardless of the luck study: a small baseline crit chance and crit damage for every hit, crit stats with caps, and boss crits **[Misa]**. They are being built behind config on branch `luck-crits`. Boss HP is retuned when they are switched on.
- **Pre-decided fights** are acceptable if the week-to-week path is visible and honest **[Misa]**. The research-backed proposal in `docs/design/progression.md` replaces the current "boss follows average level" scaling with a visible per-server Boss Rank ladder, with Resolve after a loss, Festival weeks, rank-scaled rewards and a readiness band. Waiting for Misa's calls on its five questions.

## 2026-10-11: Ability weight, defence and luck (Misa)

ID: `2026-10-11-ability-weight-defence-and-luck` · Status: current

- **Ability weight:** creature and basic abilities at about a fifth of finale damage is right **[Misa]**.
- **Defence:** keep it as it is. Harder future bosses will hit harder, which gives guard creatures and shields more value and a reason to build them for harder content **[Misa]**. Revisit when harder bosses arrive.
- **Luck:** player skill (ability timing, coordination on defence) should push the odds up, not decide the outcome. A fight should keep an element of randomness **[Misa]**. Next step: measure how much a fixed roster's outcome varies with the seed alone, and if it is close to all-or-nothing, propose a small visible luck element (for example crits or a damage spread), tuned with the simulator.

## 2026-10-11: Creature abilities, phase 2 (server and client)

ID: `2026-10-11-creature-abilities-phase-2-server-and` · Status: current

**Decision.** The live finale and the Activity now use creature abilities, following `docs/design/creature-abilities.md`. Interpretations and choices:

- **Building.** Each member's abilities are built once in `buildPhaseInput`, so the live start, the instant late path (event more than 10 minutes late) and practice all share it: the basic pick (key `<alias>:basic`) plus `abilitiesFor(frozen team, levels)`. A creature ability's key is `<alias>:c<n>`, where `n` is the creature's index in the member's effective team (0 to 2, not its position in the ability list), so a locked creature leaves a gap (`m1:c0`, `m1:c2`) and no raw creature id is in a key. The choice's `creatureId` is the creature id, which is also the frozen row slot id. A creature that is not in the row would be skipped (it cannot happen with a row of 3 slots per player).
- **Storage.** The `abilities` JSON of `raid_live` holds `key`, `alias`, `abilityId`, `creatureId`, `mode`, `fireAtRound` and `params` per use. No migration is needed (it is JSON).
- **Snapshot.** `abilities[]` has one entry per use: `{ key, alias, abilityId, creature, mode, fired, firedAtRound, fireAtRound, defaultRound }`. `fired` and `firedAtRound` are found by the ability event's `key`.
- **Action.** `POST /api/raid/live/action` takes a required `key` (at most 16 characters, shape `m<n>:basic` or `m<n>:c<digit>`, strict schema). A well-formed key that is not the caller's, or does not exist, gets 409 `not_your_ability` (the same answer for both, so a key reveals nothing). A caller who is not in the fight still gets 409 `not_in_fight` first. Fire and Hold apply per key. `zone` and `element` are accepted only when the ability's effects use `choose`, so for all shipped creature abilities they are 400 `invalid_body`.
- **Raid view.** `you.abilities` is `[{ key?, abilityId, creatureId | null, species | null, unlocked, unlockLevel }]`: the basic ability first (`creatureId` and `species` null, `unlockLevel` 1), then one entry for each team creature whose species has an ability, in team order. A locked entry has no `key` because it will not be in the fight. It is empty for players who are not in a party. It previews the current effective team, so it can differ from the frozen fight if the team changes, which is only allowed before the finale.
- **Collection.** Each creature in the state response has `ability: { id, unlocked, unlockLevel, nextId? } | null`. `nextId` is the evolved species' ability and is absent for stage 2 and for species that never evolve.
- **Legacy rows.** `raid_live` rows from before this change (no `key`, no `creatureId`) are read through `normalizeAbilities`: a choice without a key becomes `<alias>:basic`. A choice is dropped when its ability no longer exists in the content, its key repeats, its creature is not in the frozen row, or it is a creature ability without a creature. If the engine still refuses the stored fight, the fight is simulated without abilities (and the error kind is logged) instead of failing every read. Stored results (`raid_results`) are never re-simulated, so replays from before still read as they were.
- **Client.** The live panel has one card per own ability, labelled "Cindle's Flare Strike" (the creature's fight name, so nicknames show as set) or "Rally (basic)", with the effect line from the content description, its state and its own Fire and Hold. A lock per key stops a double tap on one ability while another stays pressable. Other players show as "2 of 4 used. Latest: Rex's Flare Strike (round 5)". The Raid tab card "Your finale abilities" keeps the basic picker and lists the creature abilities, locked ones as "Unlocks at level 10 (now level 7)". Collection cards show "<Name>: <effect>" when unlocked, "Finale ability: unlocks at level 10" when locked, and "Evolves into: <stage 2 species> (<stronger ability>)" for a creature that can evolve. All text is rendered as text.
- **Client bug found on the way.** The state parser refused `kind: 'jackpot'` in `serverFirsts`, so after any jackpot hit on a server, `GET /api/state` would have failed to parse in the Activity. The parser and type now accept it (a test uses a real response).
- **Fixtures** in `apps/activity/src/fixtures` were re-captured from real server output (live, action, practice, raid view, a new `collection-state.json`, and the new `not_your_ability` error). A lost finale's `pity` is 0 now (wins-only pity).

**Reasoning.** One place builds abilities, so the live, instant and practice finales cannot differ. Keys by team slot are short, stable within a fight and leak nothing. Tolerant reading of old rows means a deploy during a live finale cannot break it, and old replays are plain stored data.

## 2026-10-11: Creature abilities, phase 1 (content, engine, simulator, pity)

ID: `2026-10-11-creature-abilities-phase-1-content-engine` · Status: current, amended by `2026-10-18-branch-evolutions-built-sunfawn-and-ohmouse` · Amends: `2026-10-10-balance-simulator-m3b-interpretations`

**Decision.** The spec is `docs/design/creature-abilities.md` (agreed with Misa). Phase 1 implements the content, engine and simulator side; the live server and client follow in phase 2. Implementation choices:

- **Content.** `FinaleAbilityDef` has `kind: 'basic' | 'creature'` and `effects` (1 to 3 of `rally`, `shield_wall`, `re_mark`, `purge`, `strike`; strict schemas, integer basis points; `rounds` defaults to 1 for rally and shield wall, absent for purge means the rest of the fight). Species have an optional `ability: { id }`. `RULES.abilities.unlockLevel` is 10. `abilitiesFor(team, levelOf)` returns a team's creature abilities. `loadContent` checks that referenced abilities exist, belong to one species and are `creature` abilities, that basic abilities have one effect with a player choice, and that a stage-2 ability is stronger than the stage-1 one (same ops and choice, no amount or duration lower, at least one higher or an extra effect). All 20 species have an ability.
- **Engine.** `AbilityChoice` gains `key` (unique in a fight, 1 to 64 characters, duplicates throw) and an optional `creatureId` (a slot of the same player; required for strike and `own` zone or element). A player may hold several choices. Timed effects run from the round they fire in: rallies add up, Shield Walls on one zone multiply (two 50% walls leave 25%), the longest purge wins (a `restored` adaptation event marks the end of a timed purge). A strike is a hit by its creature at `atk x atkBp / 10000`: it can cash in the mark, applies marks like a hit, credits contribution like a hit, leaves the creature's support buff for its normal turn, lands even if the creature is knocked out, and is never reflected by Backdraft when the creature is down. An `re_mark` by a creature credits setup to that creature. A strike that kills the boss ends the fight. Events carry `key` and `creature`; strike hits carry `ability` and `key`; `describeEvent` says "Cindle's Flare Strike".
- **Balance.** Numbers come from the simulator (`docs/balance/report-2026-10-11-abilities.md`): basic abilities are weak (Rally +10% for 1 round instead of the starting +15%, because +15% made a basic Rally better than most creature abilities), creature abilities add about 20% of finale damage for a week-8 roster. Boss base HP was re-tuned (the abilities lift each boss differently). The ability damage share is reported as information, not a target.
- **Pity: finale wins only** **[Misa]**. The counter advances only on a win without a jackpot; a loss changes nothing; soft pity starts at raid 5 (`softPityFromRaid` 5). `PITY_COUNTS_LOSSES` is removed from the simulator and the worker's `rollJackpots` does the same. This makes both pity targets pass (jackpot rate 12.4%, hard pity 11.9%). It replaces the earlier "pity counts participation" choice.
- **Worker and client in this phase.** Only what keeps them working: each member brings their basic ability with key `<alias>:basic`; the ability picker and `PUT /api/raid/ability` accept basic abilities only; the Fire/Hold parameter checks read `effects`. The live snapshot, `key` in the action body and creature abilities in the finale are phase 2.

**Reasoning.** Effects as data keep new abilities a content change. Giving every ability its own key and creature makes replays and descriptions exact. Weak basics plus unlockable creature abilities give training a visible payoff without making the finale depend on rare creatures.

## 2026-10-11: Second balance tuning pass

ID: `2026-10-11-second-balance-tuning-pass` · Status: current, amended by `2026-10-11-progression-phase-1-rules-content-simulator`, `2026-10-17-creatures-b-built-training-by-activity` · Amends: `2026-10-10-first-balance-tuning-pass`

**Decision.** From the simulator (full run, seed `leet`: 12 of 21 targets passed before, 19 after; `docs/balance/report-2026-10-11.md`):

- Training costs `3 + 2 x level` (was `10 + 5 x level`). The simulator's players now push one creature at a time to its evolution level before spreading Bait over the team; the old "always train the weakest of the top 3" rule kept every casual's best creature at level 4.
- Boss HP grows with `N^1.2` (was `N^0.9`) and 12% per average creature level (was 7%). Bigger servers earn more Bait per player, so with a sub-linear exponent 15-player raids were won 99% of the time; at 1.2 the finale win rate is flat from 5 to 15 players. The raid is now equally hard for a week-4 and a week-8 roster.
- Phase 1 clears at 18% of the pool (was 20%), Phase 2 at 54% (was 45%).
- Reactions deal x4.5 (was x2.5) and payoff creatures get an extra x1.1 (was x1.25). Setters now earn a real share of the credit (16.6%, target 15%) and no creature runs away from its rarity (highest 1.41x).
- Boss base HP: Tidal Colossus 4724, Cinder Wyrm 2710, Thornmother 4296, Storm Sovereign 4380. Mistnewt and Fogwyrm get more Attack (a guard nobody picked), Gaiadrake and Pyrelynx a little less, Sproutle a little more.

**Left failing on purpose.** The jackpot rate per finale win (18.9%, target 6-15%) and players reaching hard pity (66%, target <= 15%) cannot both be met while a lost finale advances the pity counter without a jackpot roll: at a 50% finale win rate a guaranteed jackpot every 10 raids is already 20% of a player's wins, and most players reach it. Counting only finale wins toward pity would pass both (measured: rate 11%, hard pity 18%, about 7% with soft pity starting at raid 5). That changes the pity rule, so it is an owner decision; nothing was changed in the worker.

**Reasoning.** One lever at a time, checked on six seeds, with the fixed owner decisions (leet points table and cap, Bait per point, hard pity at 10 raids, 70/30 Essence split, schedule) untouched. Tests that hard-coded the old numbers now read them from `RULES`; the engine's hand-checked combat tests use a pinned copy of the original reaction multipliers so retuning the shipped content does not break them.

## 2026-10-10: First balance tuning pass

ID: `2026-10-10-first-balance-tuning-pass` · Status: current, amended by `2026-10-11-second-balance-tuning-pass`

**Decision.** From the first simulator run (`docs/balance/report-2026-10-10.md`): Phase 1 now clears at 20% of the boss pool and Phase 2 at 45% (were 30% / 60%), and Cinder Wyrm's base HP drops from 8500 to 6000. Result (`docs/balance/report-2026-10-10-tuned.md`): typical-group Phase 1 and the boss spread now meet their targets; Phase 2 (≈94%) and the typical finale (≈68%) run slightly easy, and 15-player raids are much too easy.

**Not yet changed (needs a dedicated tuning pass):** boss HP scaling for 15 players, small servers earning far less Bait (5-player servers are much weaker than 10-player ones), guard creatures almost never being picked, casual progression to level 15, Essence piling up unused, and the pity targets. Difficulty is cliffy: ±15% boss HP swings win rates widely.

**Reasoning.** Fix the largest violations with the smallest changes first; leave economy-shaping changes for Misa to weigh in on.

## 2026-10-10: Balance simulator (M3b) interpretations

ID: `2026-10-10-balance-simulator-m3b-interpretations` · Status: current, amended by `2026-10-11-creature-abilities-phase-1-content-engine`

**Decision.** `packages/sim` (`pnpm sim`, `pnpm sim:quick`) is deterministic for a seed and uses only `createSeededRng`. Where the design left room, it does this (all documented in the report's Method section):

- **Spending policy** is the same for every archetype: up to 3 expeditions funded from 50% of the Bait held (best expected rarity score the slot's share can buy), the rest trains the weakest of the 3 strongest trainable creatures. Players with a complete, fully fused collection stop sending expeditions (they would only convert to Bait at a loss).
- **Pity counter** advances on every raid a player takes part in without a jackpot, win or loss ("counts participation"). `PITY_COUNTS_LOSSES` in `packages/sim/src/raid.ts` switches to counting finale wins only.
- **Typical group** means a raid week with 5 to 10 signed-up players on rosters from the end of week 4 or 8. "Casual first creature reaches level 15" is measured as the casual's highest creature level at the end of week 4 (median over casuals). "Hard pity" means the counter reached 9 (the next win is guaranteed) within 20 weeks, over players who joined in week 1.
- `baitForDay` is imported straight from `apps/worker/src/economy.ts` (it has no dependencies) so the sim and the game cannot drift apart; it should move to `@creatures/game` as that file's comment says.
- The CLI runs TypeScript through Vite's SSR loader (Vite is already a pinned devDependency). Node's type stripping cannot resolve the extensionless imports in the workspace packages, and `tsx` is not installed.

**Reasoning.** The simulator only reports; changing game numbers or targets is a separate decision. Keeping the policy simple and written down makes the report's results explainable.
