# Combat engine and balance

The shared combat engine, abilities, statuses, elements, the balance simulator, balance passes, and combat v2 in the lab.

<!-- Maintained with `pnpm decisions`; see README.md. Newest first. -->

## 2026-11-06: Combat v2 goes live with the valley rework in one reset [Misa]

ID: `2026-11-06-combat-v2-goes-live-with-the` · Status: current

**Decision.** Combat v2 does not go live on its own. It goes live with the valley rework, in the one reset Misa decided on 2026-10-31 (phase 6 of the combat roadmap), so players reset once. Until then, staging gets the tools for a playtest with a few testers: the dev tools only for server managers (Misa), roster presets that give any player creatures and gear, and an override of how many creatures each player brings to a raid.

**Reasoning.** Misa, 2026-11-06: "I think we could wait for the valley rework. The dev tooling needs some work because I don't want testers to have access to dev tools. Just me." Going first alone would mean two resets or bringing back the old migration plan (about a week of work).

## 2026-11-06: Talents' raid share back in band: Opportunist +50%, Steady Rhythm without its crit bonus

ID: `2026-11-06-talents-raid-share-back-in-band` · Status: current

**Decision.** The Opportunist talent's bonus on a mark cashed at 2 stacks or more goes from +100% to +50% (`cashHighBp` 10000 to 5000, `packages/game/src/combat-v2/data/talents.json`), and Steady Rhythm loses its +0.1x crit damage (`critDamageBp` 1000 removed; it is still a crit on every third hit that lands). Texts, `knacks.md`, the compendium and the lab's grammar copy follow. Parity digest rewritten.

**Reasoning.** The raid board's best-fit talent share read 24.0% on 2026-11-06 against a 17% to 23% band (22.3% on 2026-10-31), gauntlet 18.2%. Steady Rhythm is the most picked best-fit talent on the raid boards (21 of about 190 picks), Potent Mark and Opportunist follow. Opportunist's +100% on a 2-stack cash is what the new Knacks and cards feed most; cutting it alone gives raid 22.9%, adding the Steady Rhythm bonus cut 22.5%, gauntlet 18.0% (in band). Potent Mark 12 to 8 was tried and moved the share by 0.3 point, so it stays. The whole gate is as before (casual 1.42 is the known miss), `--rules` all met. The earlier idea of Steady Rhythm every 4th hit is an engine rule change and was not needed. To change back: set `cashHighBp` to 10000 and restore `critDamageBp` 1000.

## 2026-11-06: [Misa] Fizzle becomes a telegraphed boss move: immune to reactions every second turn

ID: `2026-11-06-fizzle-becomes-a-telegraphed-boss-move` · Status: current

**Decision.** Fizzle is a boss move, not a trail rule: a library move (`fizzle`, label "No reactions") with no slots and no damage. When it fires, on its `every` and `turn` like any move, the boss is immune to reactions until its next boss turn begins: a Payoff's hit sets off no reaction and the mark stays (marks still land). The card is renamed Quench (a card's name never equals a move's name) and adds the move every 2 rounds at the card's strength; the Ash Sprite keeps it. The old `fizzle` flag, the mark's `cashableAfterTurns` and the trail's Fizzle hook are removed. Its answers are Self-Starter and Twin Strike. The replay shows "Fizzle!" when it fires, "Fizzled!" when a reaction is blocked, and a Fizzling chip on the boss until its next turn; the tile and turn strip show it like any move. The Ash Sprite's own HP goes from 18000 to 16000 so its question (Heat, depth 30) still bites. No current raid boss carries it (measured: it costs the classic team 0.3 to 0.6%); a future raid boss (for example a Void boss) is planned to.

**Reasoning.** Misa's design (2026-11-06): the same pressure as before (do not rely on reactions in some rows), telegraphed through the move tiles and the turn strip, and it works in the dungeon, which has one row. Every 2nd round was kept as the one cadence: in the one-row dungeon it blocks every second round, and a raid boss can set `every` and `turn` for the row it wants to block (last turn blocks row 1, turn 0 blocks row 2). Measured numbers are in balance.md section 8, row 8d, and `for-misa.md`.

## 2026-11-06: Lab gate: dead Knacks are read on the track's weekends too

ID: `2026-11-06-lab-gate-dead-knacks-are-read` · Status: current

**Decision.** The lab gate's `dead-knack` item reads the best five lines of weekend-scored searches at the track slots 5, 6, 7, 8, 9, 13 and 14 (3 seeded searches each, `WEEKEND_SEARCH_SLOTS` in `packages/lab/src/gate.ts`) as well as the potential searches and the report's per-card best-team searches. The target is unchanged: every Knack picked somewhere. `dead-knack` leaves `KNOWN_MISSES`.

**Reasoning.** "No dead Knack" means picked somewhere a player would really play. Cool Head only works on Double Strike, and the report's per-card raid fights are short (about 5 boss crits), so those searches never pick it, while on the track's Double Strike weeks it is in many top lines. The gate was reading the wrong place, not a looser bar. Cost: the full gate went from 91.5 s to 115.7 s. Full gate after: 36 of 37 pass (`dead-knack` 0 of 47; only `casual`, accepted, misses).

## 2026-11-06: Combat v2: Cool Head turns a spared crit into a Sure Crit

ID: `2026-11-06-combat-v2-cool-head-turns-a` · Status: current

**Decision.** Cool Head keeps its ward (crits on it and on the creatures beside it deal no extra damage) and adds: each crit it spares stores one Sure Crit (shared cap `sureCritMax`) on the creature the crit was aimed at (`target`, not the Guard that took it), only if that creature still stands and is not silenced (R12.2). One store per warded crit however many Cool Heads (the flag is read from the ward's giver). A Sure Crit deals the spender's own crit extra (a Perfect Timing creature's is 3x); the keyword row says so. The replay shows the save as the existing `cover` board event (new optional `byKnack`, so the Knack's name pops on the Cool Head creature) and a fully spared boss crit is drawn as a plain hit, not a crit. Double Strike's `answers` are now by Knack id (`cool-head`, `hide-in-mist`; Rolling Fog is not measured as an answer, and the family "Luck" lit Wild Swing). Cool Head stays on thornbuck only.

**Reasoning.** The card costs the classic line only 6-11%, so a ward alone could not reach any answer bar and the Guard slot is crowded (Wide Reach, Draw Fire). Turning the spared crit into a Sure Crit chains it into Perfect Timing, Hold the Line and Payoff crits without a bare number. Giving it to the creature aimed at (not the taker) makes a Payoff beside the Guard the placement choice. Measured on Storm Sovereign weekends (96 runs): damage share slot 8 0.770 (Wide Reach 0.642, none 0.635), slot 13 0.759 (0.584, 0.564); in the weekend-scored searches Cool Head is in 7 of 84 top lines on slot 8 and 14 of 84 on slot 13, the top line in 2 of 8 searches, so it is not an always-pick; no effect on any week without Double Strike. The gate's `dead-knack` still misses: the report's per-card fights are short (about 5 boss crits) and the Knack's card lift there is about 1.08, so no top-five line carries it; the miss stays in `KNOWN_MISSES` with that reason. Parity moved only `gauntlet:lucky-strike:answer0#1` and `#2` (the Cool Head answer line).

## 2026-11-06: Combat v2 second answers: answers by Knack id, Pin Down, Backlash, Aftershock, and what stays one-answer

ID: `2026-11-06-combat-v2-second-answers-answers-by` · Status: current

**Decision.** The second-answers pass (P-13) for the 11 one-answer cards, after the fun panel (balance-miss steps 6 and 7).

- **Answers by Knack id.** A card's `answers` may name a Knack id as well as a family or a talent, so an icon points at the Knack that was measured and not at its whole family (the "Support shape" answer on Elusive lit five Knacks nobody measured). Elusive and Slippery now list `clear-skies` instead of the family. A lab test (`answers.test.ts`) fails when a listed Knack or family has no measured line; a content test fails when a Knack, talent or keyword name equals or sits one edit away from another thing's name (a gear line included).
- **Pin Down** (Lead family; Splashet, Wickat, Solmane, kept by Tidewing): "After it leaves a {Mark}, the boss cannot dodge the next creature to act in its row this round." One flag (`leadUndodge`) cleared every round. Elusive (48 seeds): lift 1.40, SPEC 1.34, against the classic line 1.40; Slippery SPEC 1.19. Clear Skies on Elusive at 48 seeds: SPEC 1.26. Both answer Elusive and Slippery.
- **Backlash** (new family "Punish the clear"; Gaiadrake): "When the boss sheds a {Mark}, this creature strikes back for 20% of its Attack, ignoring armour. Once a round." A counter (`counter()`), once per round per creature on the first shed, whatever the marks and stacks. **Deviation from the brief:** the brief said "only on the boss turn after its own row"; measured, that gives SPEC 1.005 on the unsealed raid line (the Payoffs stand in the row after the Setters, so the shed is not after their row). Once a round gives 1.09 at 20% on a Cindle line and 1.11 on the Gaiadrake line; Brand's lift on the same line is 1.15. At 20% it stays at or below Brand on every stack of cards measured except Clean Scales with Stone Skin, where the two are level within seed noise (Clean Scales alone, with Stone Skin, with Thick Hide, with Elusive, with Stone Skin and Elusive: Backlash 1.11 / 1.12 / 1.20 / 1.17 / 1.19 against Brand 1.15 / 1.10 / 1.28 / 1.30 / 1.20), so the stacked cases do not add up past it. (At 25% it passed Brand on two stacks, so 20% it is.) The Mired half is dropped.
- **Aftershock** (Detonator family; Bloomback): "{Spend}s all the stacks of the mark it cashes, with a smaller bonus than Detonate. A hit cap holds its hit and its bonus apart." The bonus factor is 90% of Detonate's (`bonusBp` 6750); under a cap the plain hit and the bonus are each cut to the cap, and the bonus shows as its own number. Kept: on Stone Skin at 96 seeds its lift over the same line without it is 1.07 against 1.00 for Detonate, SPEC 1.19 (needs 1.15) and 1.27 against the classic line. Off the card it is 3% below Detonate, so Detonate stays the pick on a plain boss. It is on Bloomback because on Gaiadrake SPEC read 1.14, and not on Tempestray (which already has Detonate, Trail and Twin Strike).
- **Board events.** `sure` (the boss cannot dodge `who`, by whose Knack: Clear Skies and Pin Down), `counter` with `byKnack`, `mired` with `shook`, `hit` with `bonus`, `reaction` with `split`. The client names the Knack on the tile for a `sure` and a Knack's counter, shows Shake It Off as the existing reaction callout ("Shakes it off!", the stacks cleared), and shows Aftershock's bonus as a second number after the hit. A bonus hit stays in its creature's beat.
- **Data only.** Reflective Hide: Twin Strike (SPEC 1.35) and Curl Up (SPEC 1.08, 1.37 against the classic line: a general strength more than a card answer). Grudge: Returning Tide (SPEC 1.21) and Curl Up (SPEC 1.04, 1.27 against classic); the Draw Fire line now puts the Guard first (SPEC 1.47; the Guard last was 0.71). Breakwater: Night Watch, measured beside Full Sweep (`ANSWER_WITH`; alone it has nothing to answer, SPEC 1.00): with it SPEC 1.79. Breakwater only ever comes with the Tidal Colossus (slots 6 and 11), which sweeps with Wind-ups, so the second answer always has something to answer. Payoff Hunter: the card text says "A Guard there takes it." (placement: Guard in the middle, Payoff at the end, 1.45 against classic).
- **Stays one answer.** Bramble Bind: Unbothered does not answer it with one carrier (SPEC 1.04 to 1.05; the talent is only on Guard and Support lines, so the Setter and the Payoff at the ends cannot carry it), so no hint was added; Clear the Air SPEC 1.00. Wither: a Guard in the middle is general advice (SPEC 1.00 to 1.02, 1.11 to 1.16 against classic); report only. Shake It Off: on the Tidal Colossus it costs a Squelch Song line 10% and a Mud Wall line 13% of the weekend's HP share (SPEC 0.90 / 0.87), on Old Bogback 1% (SPEC 0.99); nothing but "do not lean on a debuff" answers it. Fizzle: kept; a reshape "a mark left by a reaction waits until the next round" costs a Chain raid line 10% (SPEC 0.90) but Detonate is still 7% behind Chain after it, so there is no second answer; not applied (see `for-misa.md`). Kindle was rejected by the panel and not built.

**Reasoning.** An icon that points at an unmeasured Knack is the "Night Watch shown but losing" failure P-13 names, so the answers are named by Knack and the lab test holds each one to a line. Each new Knack adds a mechanic with a visible beat (a hit that cannot miss, a strike back with the Knack's name, two numbers) and is capped by something: a flag that cannot stack, once a round per creature, a 90% bonus. Backlash is fired once a round because the literal "its own row" rule left it with no effect on the line it was meant for, and once per creature (not per stack) removes the Heavy Prime exploit the panel named. Aftershock went on Bloomback because the SPEC bar (1.15) is a property of the carrier too. The cards that stay at one answer do so because nothing measured as an answer; inventing a Knack that measured 1.00 would be a bare number in a new coat.

## 2026-11-05: Combat v2: the track's tuned table reaches slot 24

ID: `2026-11-05-combat-v2-the-track-s-tuned` · Status: current

**Decision.** `raid-track.json` lists slots 1 to 24, and the track tuner (`report -- --tune --track --slots 16-24 --write`, the journey pass as its second stage) owns the numbers of slots 16 to 24; slots 1 to 15 are unchanged. The new slots are at full strength with the boss's full set of rules and the escalation, and the extra cards the same boss had a lap before (the game's own rule past the data). The tuned HP, Attack and armour: slot 16 12400 / 142 / 55 (Tidal Colossus), 17 11600 / 185 / 52 (Cinder Wyrm), 18 7800 / 90 / 7 (Storm Sovereign), 19 31200 / 123 / 29 (Old Bogback), 20 8000 / 97 / 162 (Thornmother), 21 12400 / 142 / 56, 22 10200 / 199 / 53, 23 7800 / 90 / 8, 24 34300 / 105 / 33. `SLOT_WEEKS` has 24 entries (19, 21, 22, 23, 24, then 24 for slots 21 to 24: a dedicated server at the expected speed has not arrived there before the last week), `SLOT_MIXED_ANSWER` takes the second answer on slots 16, 21 (Tidal Colossus) and 23 (Storm Sovereign), and the parity corpus covers slots 1 to 24. Slot numbers past 24 still follow the boss's own high-rank numbers (the game and the lab agree on that).

**Reasoning.** Before, a slot past 15 took the boss's own high-rank numbers (`slotSpec` in the game, `rankNumbers` in the lab: the two agreed), which the tuner could not touch; the first slots of the fourth lap were harder than the third lap's (Tidal Colossus 19100 HP against 13100). A 24-week journey reaches slot 16 to about 20 at the expected speed and 24 at the fastest, so those slots are the ones in practice. Measured with the full gate (320 servers each): every item that passed still passes with the same numbers, the stuck shares are unchanged (the mixed slow server 3%, every other cell 0%), the one-weekend kills at slots 8, 11 and 14 are unchanged, the worst slot's median weekends to kill is 1 in every cell that had 2 (slots 16 and 18 were the worst), slots reached rise by 1 to 2 for several servers, and the 207 boss rules are all met. The tuner's known content misses at slots 16 and 21 (tool potential 34% and 35% against at least 35%, Tidal Colossus: the tool potential and the classic party's kill rate cannot both be met there) stay a content note. A best pick, tuned by the track tuner and listed in `for-misa.md`.

## 2026-11-05: [Misa] Combat v2 balance pass: slots 3 and 5 eased, Determination 15% a stack, Night Watch on Hearthshell, the casual miss kept

ID: `2026-11-05-combat-v2-balance-pass-slots-3` · Status: current · Amends: `2026-11-05-combat-v2-phase-5-step-5`

**Decision.** Misa answered the three misses of the gate (2026-11-05).

- **Slow servers getting stuck: option 2.** Only slots 3 and 5 are eased (slot 3 HP 13500 to 13100, Attack 53 to 51; slot 5 HP 6500 to 6400, Attack 155 to 153); slots 9 and 11 keep their numbers. Determination is 15% damage and healing a stack (`RULES.raid.v2.determination.stackBp` 1500; still from slot 6, at most 5 stacks, so at most +75%). The lab reads the game's rule instead of a copy, so they cannot drift. The tuner has a journey pass (`trackJourney.ts`, `--tune --track` with `--journey-only` and `--no-journey`); the committed numbers are option 2's, not the pass's full easing.
- **The Storm Sovereign's narrow answers: "A is good".** Hearthshell also knows the Knack Night Watch (`forms.json`, `ownKnacks`).
- **The casual metric: keep the miss.** `casual` stays in `KNOWN_MISSES` (1.41 creatures beyond the top three, target 1.5, no looser target).
- **The gate's journey reads 320 servers of each kind** (the rest of the report 40; the stuck share on 40 servers was noisy: one track read 18% on one draw and about 30% on another). In the full report the first 40 servers of each cell are the report's own jobs and the gate adds indices 40 to 319 by job id. A full `--gate` run takes about 170 s on 4 cores.

Measured, full `report -- --gate` at 320 servers: 36 of 37 pass. Mixed slow stuck 3% (was 18% on 40 servers), mixed one-weekend kill at slot 11 85% and `live10` 73%, small1 stuck 14%, small2 0%, the Storm Sovereign's top line Sproutle 32% (target 35%), all 207 boss rules met. Parity moved only for slots 3 and 5 and the Determination cases, and gained four Night Watch / Hearthshell sweep cases.

**Reasoning.** Option 2 gets the mixed slow stuck share to about 3% (limit 10%) with the smallest change to the track: slots 9 and 11 stay as they were, so the one-weekend kills at slot 11 do not move (the wide easing of 9 and 11 would have made them easier for everyone). A stronger Determination helps exactly the servers that fail a boss again and again, and nobody else. Night Watch on Hearthshell gives the Storm Sovereign a second answer that is not Sproutle's line without moving anything else. On the casual metric Misa said: "Keep the casual miss (... the dungeon depth picker still gives them meaningful content to play until they're ready for the depth increase)", and then: "The depth picker helps a lot and I wouldn't be too concerned about slower players not having meaningful content or ways to develop creatures, because the valley rework will introduce quite passive EXP and the dungeon depth picker will introduce a way to tackle it with any creature crew." So the number stays honest in the report and the target stays at 1.5.

## 2026-11-05: Lab foe questions test the game's v2 dungeon foes again

ID: `2026-11-05-lab-foe-questions-test-the-game` · Status: current

**Decision.** The lab's foe questions, the classic-line tests and the shipped-map run tests (camp, plan and bench, Undercroft order) test the game's v2 foes again; the stopgap of the old foe numbers (`OLD_PACK`) is gone. A question is asked of the game's foe in a form it has: the Undercroft's numbers, often as an elite (`RULES.dungeon.elite`), at a depth where the team with the tool wins at least 55% of its fights and 25 points more than without it (thresholds unchanged). Run tests ask at depth 64 on the base floors (their HP stops growing at about depth 56) or at depth 20 for the Undercroft's order. Findings, foes that ask nothing in the game: puddle-imp, ash-sprite and bog-toad (the team with and without the tool clears them at every depth to 100, normal or elite, base floors and Undercroft); their three questions stay on the old foe numbers (`OLD_FOES`, with a test that names them) until their cards change. static-bat and flicker-swarm ask only from Undercroft elite depth 50. One threshold changed its claim: "the classic line is under 0.1 by depth 5" is "under 0.35 at depth 64", because the classic line is above 0.1 at every base depth now.

**Reasoning.** Against the easier base every team clears, so tests pinned to the old numbers proved things about foes the game no longer has. The Undercroft and the deep base floors are where the game's foes still separate good play from bad, and they use only numbers the game has (the Undercroft curve, the elite boost), so nothing is invented. A foe that asks nothing is a content finding for the balance pass, not a reason to delete the proof of its question. `OLD_FOES` stays for the report's `old-shipped` scenario.

## 2026-11-05: Combat v2 phase 5 step 5: the gate report and known misses

ID: `2026-11-05-combat-v2-phase-5-step-5` · Status: current, amended by `2026-11-05-combat-v2-balance-pass-slots-3`

**Decision.** The phase 5 gate is one report section, `pnpm --filter @creatures/lab report -- --gate` (also in the full report): each gate item of `balance.md` section 3 with its measured value, its target (`targets.ts`, each with its source) and pass or miss. It reads the v2 journey (game rules, `HABITS`, Determination on, the dedicated, mixed and builder servers at three speeds, `live10`), the report's best-team and casual searches, and new potential searches on the five raid bosses (scored on damage potential so they do not saturate at a kill). A gate that misses is not a failing test: it is listed in `KNOWN_MISSES` (`gate.ts`) with the measure, the unchanged target and the reason, printed by the section, and one test checks the list names only real items. The step 6 balance pass empties it. Diversity thresholds (4 lines, 3 element sets, 4 Knack families, top line at most 35%) are the lab's proposal, since the roadmap names the gate and no number. The full run (2026-11-05): 34 of 37 items pass; the three misses are the mixed server on slow rosters (18% stuck against 10%), the Storm Sovereign's winning teams (top line 38% against 35%) and the casual metric (1.36 against 1.5).

**Reasoning.** The gate had to be one place the balance pass can be read against, without copying a measure that already exists: the journey, the best-team searches and the casual searches are reused with the same job ids, so the full report does not run them twice. Turning a miss into a red test would block CI on content the tuners have not touched yet, and loosening a target would hide a content problem (`balance.md` section 4), so the misses are data. Dead Knacks are read on potential as the lab follow-up asked, but on the potential searches alone five Knacks go unpicked; the gate passes only because the report's best-team searches pick them, and the section says so.

## 2026-11-04: Combat v2 phase 5 step 3: the dungeon over days in the lab

ID: `2026-11-04-combat-v2-phase-5-step-3` · Status: current

**Decision.** The lab simulates the dungeon over days (`packages/lab/src/dungeonDays.ts`, `pnpm --filter @creatures/lab report -- --dungeon-days`): each player of the journey servers (dedicated, mixed, `live10`) runs the daily dungeon over weeks 1 to 24 on the game's v2 rules through `runMap` (the day's map, HP carried, a knocked-out creature out until the camp swaps it, the worker's descent that heals only the standing (`descentBreathOf`, since the worker's `descentBreath` is not exported from the game package), a next Undercroft level only on a cracked floor). Progress is the worker's: one run a day, a retry on the first day after a defeat, a clear locks in depth + 1, a defeat leaves the depth. Levels come from the valley's roster profile, teams from the journey's column logic (prepared and builder players: the lab's all-round line and bench; casual players: their best three, no Knack), talents and Knacks from the habits.

Run frequency is data in `habits.ts` (`DUNGEON_RUNS`): daily players every day, weekly (semi-weekly) players 2 or 3 times a week (a seeded draw per week, equal chance, on seeded days). **Confirmed by Misa, 2026-11-04** (not an assumption). Assumptions, also in `habits.ts` (the lead's, to confirm): prepared players and builders plan their runs (pick rooms, bring a bench, swap at the camp), casual players take the first exit (`dungeonPolicy`); a player descends into the Undercroft while the standing creatures' mean HP share is above 50% (`DESCEND_ABOVE`, the design simulator's own number); a new player runs daily.

**Measured** (8 servers of each kind, daily players, expected speed; weekly in brackets where they differ; the table is in the report): first-week depth 1 clears 13% (dedicated), 5% (mixed), 4% (live10) against the target of at least 80%; median depth growth a week from week 2 to 8: 1.67 / 1.83 / 1.83 against 1 to 2 (weekly players 0.17); fights a run 3.3 (3 to 5.5, passes), 3.3 at depth 8 or more (at most 7, passes); descent rate of the runs that beat the boss at depth 8 or more: 79% / 82% / 78% (20 to 80%, at the top edge), with the first keeper beaten in only about 5% of descents (the v1 simulator had about a third); 90% of the daily players' runs are wipes, because players reach a depth wall (about depth 13 to 14 at week 8, 19 at week 24) and stay there; a run costs 2 to 4 ms of CPU in the lab. The first-week clear is low because the evolution gate fields the all-round line's stage 1 forms below level 15 (weeks 1 and 2), and that team wins 25% at depth 1; the same line at the roster's level from week 3 on clears 90% at depth 1. Nothing in the game was changed and no number was tuned.

**Reasoning.** Balance plan section 2, item 4: the valley owns how fast players level and combat v2 owns the rooms, so the question is whether the dungeon's targets (made on the v1 dungeon and the v1 economy) still hold at the valley's levels. Calling the game's own functions for the map, camp, descent and Undercroft keeps the simulator from drifting from the worker. The worker's v2 descent does not revive a fallen creature, the game's `catchBreath` does, so the lab's run has an option (`standingOnlyDescent`, off by default so earlier lab numbers do not move; the dungeon over days turns it on). Run frequency came from Misa; the policies are what a real player could plausibly do and are data so the report can move them. The first-week and weekly-player numbers are the ones to read first: they say the dungeon's early levels and the casual team are the weak spot, not the depth growth of daily players.

## 2026-11-04: [Misa] Combat v2 phase 5: weekly players replace 3 in 10, and Misa's server mix

ID: `2026-11-04-combat-v2-phase-5-weekly-players` · Status: current

**Decision.** The weekly players' replacement rate of 0.3 (three times in ten a weekly player brings a spare between stages) is confirmed by Misa and no longer an assumption (`REPLACE_CHANCE`, `habits.ts`); the new-player rate stays the lead's assumption. Misa's live server is the one to measure against: 10 players, 3 try-hard (prepared line, daily), 3 daily (builders), 4 semi-weekly (casual, weekly roster), all there from week 1. It is the journey server `live10`, in the `--journey` report under both habit sets.

**Reasoning.** Misa, 2026-11-04: "3 times in 10 seems legit" and "my player base right now is 3 try hard players, 3 daily players and 4 semi weekly players". A server that matches the real one tells more than the coverage mixes, which stay as they are.

## 2026-11-04: [Misa] Combat v2 small raid parties: curve only, no mechanics

ID: `2026-11-04-combat-v2-small-raid-parties-curve` · Status: current · Amends: `2026-11-04-combat-v2-phase-5-answers-small`

**Decision.** Small raid parties are not a priority. Below four players the boss's HP and Attack scale linearly with the players (`players / 4` for both: `SMALL_PARTY_HP_EXPONENT` and `SMALL_PARTY_ATK_EXPONENT`, both 1, in `resolve/track.ts`; `partyBossOf` is used by `trackBoss` with `followSmallParty` and by the lab's `partyBoss`). Four and above keep HP `(p / 4)^0.7` and Attack `(p / 4)^0.3`. No mechanical changes for small parties, such as column-hit counts, seats or cards.

**Reasoning.** Misa, 2026-11-04: "Small groups don't matter as the raid is something that by definition works better with lots of people ... you can accommodate the boss difficulty curve for those if it's trivial. No mechanical changes." Measured: on the old curve a solo player met 38% of the HP and 66% of the Attack with a quarter of the creatures, and small1 and small2 were 100% stuck; on the linear curve small3 matched the four-player server and small1 and small2 improved but stay mostly stuck, which Misa accepts.

## 2026-11-04: Combat v2 phase 5 step 2: player habits in the journey simulator

ID: `2026-11-04-combat-v2-phase-5-step-2` · Status: current

**Decision.** The journey simulator (`packages/lab/src/journey.ts`, new `habits.ts`) models what each kind of player does, as data (`Habits`), and plays the same seeded servers with step 1's "everyone replaces" and with the habits:

- **Replacements** by roster kind (`REPLACE_CHANCE`): daily 1.0, weekly 0.3, new player 1.0. **An assumption to confirm with Misa.** One seeded draw per player and stage break; a player who logs in fills every empty seat from their own spares.
- **Knacks** per role: best for the board (prepared, builder), none (casual); "first known" is available and has a report row.
- **Talents** per role: prepared players keep their line as written; builders and casual players roll from the creature's line pool at the valley's rate (the roster profile's open talent slots that week, capped by the level's and the species' slots; the valley's data says random rolls throughout). Golden at the game's chance (`RULES.talents.golden`, 1 in 20), played at the engine's x1.25 (the game's `goldenBp` says 1.5x: the two disagree and are left for the lead to settle).
- **Placement**: prepared and builder follow the board; casual players stand in random rows of their column.
- **The finale**: every player's basic ability fires at its default round, dealt rally, shield wall, purge by place in the party as the worker does (Auto fire on, nobody touching it). "Best for the board" for daily players is not modelled (it needs a search per party).
- **Small parties** fight `partyBossOf` for the party size (what `trackBoss` builds with `followSmallParty`): `wideBoss` on the 0.7 and 0.3 curves from four up, HP and Attack linear in the players (`SMALL_PARTY_HP_EXPONENT`, `SMALL_PARTY_ATK_EXPONENT`, both 1) below four.

**Reasoning.** Step 1 assumed every player replaces; weekly players probably do not, and no retune may happen before the habits are modelled. Measured (40 servers, mixed server's one-weekend kill at slots 8 / 11 / 14): everyone replaces 68% / 53% / 93%; only the replacement habit 25% / 48% / 48%; all habits 45% / 75% / 83%; casual players on their first known Knack 85% / 98% / 100%. Replacement alone is the big drop; the pool talents (more of them than step 1's one), golden talents and the finale's actions give some back, and a casual player's Knack is worth far more than the rest, so the policy matters. The model is not a target: the rates are assumptions, and the balance pass uses it only once Misa has confirmed them.

## 2026-11-04: Combat v2 phase 5, slice 1: the path's weekend plays the game's raid rules (journey.ts)

ID: `2026-11-04-combat-v2-phase-5-slice-1` · Status: current

**Decision.** The lab's path gets a second weekend, `packages/lab/src/journey.ts`, that plays the worker's raid rules with the engine's `stageV2` and its carry: a player brings the seats of the boss's arena piece (`piece.rows`), the party is locked at stage 1 and sets the weekend HP, and between stages each player replaces their own knocked-out creatures from their own spares (the next ranks of their roster, each used once), with Knacks and talents as they fought. The lab's older weekend stays (the tuner and the tuned numbers still use it); the report's "Journey on the game's rules" section plays both on the same seeds. Real party sizes are the valley's coverage servers of 5, 8 and 15 (with one new player who joins in week 4) and parties of one to three. Under four players the engine's `trackBoss` still fights at four columns; `partyBoss` in `journey.ts` is the one place to switch when the smaller boss lands.

**Reasoning.** The simulator must play the code the game plays, or it drifts. Measured: the game's spares (up to a seat's worth each, instead of one shared-bench creature) lift the mixed server's one-weekend kill at slots 8, 11 and 14 from 8%, 23% and 25% to 68%, 53% and 93% (40 servers; limiting the spares to one gives the lab's numbers back), so the track's three misses were partly the lab's bench, not the bosses. No tuned number changed: the balance pass comes after the policies and the dungeon steps.

## 2026-11-04: Combat v2 phase 5 plan: extend the lab's path into the v2 journey simulator; the valley keeps the roster and economy

ID: `2026-11-04-combat-v2-phase-5-plan-extend` · Status: current

**Decision.** Phase 5 follows `docs/design/combat/balance.md`:

- **The v2 journey simulator is the lab's path, extended,** not the v1 journey sim ported. It adds:
  - the worker's raid rules, shared where possible: seats per piece, locks at stage 1, the spare, replacements from each player's spares;
  - real party sizes from the valley's coverage;
  - players' choices as policies: Knacks, talents from pools, placement, the finale's action;
  - the dungeon over days;
  - rewards recorded against the valley's assumptions.
- **The valley keeps the roster and the economy:** levels per week come from its roster profile, and phase 5 hands it reward numbers instead of feeding XP back into levels.
- **The v1 journey sim stays for the live game** until v2 ships (phase 8); its combat targets retire then.
- **The gate's measures** (raid by rank, the classic trio, diversity, no dead Knack) become report sections and lab tests. One balance pass follows, run by the tuners, with Misa choosing where numbers trade against feel.

**Reasoning.** The journey sim's strength comes from the v1 economy and v1 combat, which the valley is redesigning. Porting it would rebuild what the valley replaces. The lab's path already plays v2 on the valley's roster with the track, attrition and Determination, so it is the shortest way to a v2 journey. Sharing the worker's rules keeps the simulator from drifting from the game.

## 2026-11-03: Golden v2 talents read from the line book, numbers x1.25, flags unchanged

ID: `2026-11-03-golden-v2-talents-read-from-the` · Status: current

**Decision.** A learned v2 talent is golden when the line's Talent Book (`line_talents`) holds it golden; nothing new is stored per creature (no migration). The engine's `Placement.goldenTalents` (default none) marks the golden ids, and the resolver multiplies every number of a golden talent's effects by 1.25 (rounded half up) before the merge. Flags and the count `firstMarkExtra` stay as they are, so golden is a no-op for talents with no number (the proposal's small golden extras for them are not in the data).

**Reasoning.** A creature learns "the talent of its line's book", and the book already keeps golden once per line and talent (a golden find upgrades it), so reading it there needs no second copy to keep in step and the page's badge already shows the book's value. Golden off by default keeps the lab's parity digest identical. The raid, the dungeon and the creature page all build the fighter through `buildFighter`, so the page shows the fight's numbers.

## 2026-11-03: Culling Strike stays as an enabler: in one line's pool per role and per element, never buffed for its solo value **[Misa]**

ID: `2026-11-03-culling-strike-stays-as-an-enabler` · Status: current

**Decision (Misa).** Culling Strike (`cull`) stays in the talent library and goes into the pools of a few lines, as a trial:

- **Where:** at least one line of each role (Setter, Payoff, Guard, Support) and at least one line of each element (Tide, Ember, Grove, Spark, Mire) has it in its pool. A few lines can cover both splits; the lead picks them with the lab.
- **What it is:** a utility talent with no payoff of its own today (a hit that leaves the foe below a small share of its HP defeats it). It is an **enabler**: effects are meant to stack on it later (killing-blow triggers, R21.5).
- **For balance passes:** Culling Strike is **not intended to be used alone**. A weak result for it on its own is expected and is **not a reason to buff it**. Judge it only with the effects that build on it, once they exist. Its `intent` in `talents.json` says the same, so the lab report shows it.
- It may be dropped later if nothing comes to build on it.

**Reasoning.** It was in the library but in no line's pool, so no creature could find or learn it (found by the valley session, 2026-11-03). Misa wants it in play somewhere so later effects have something to stack on, and wants the note so a balance pass does not misread its solo numbers.

## 2026-11-02: Combat v2 engine slice 1: carry keyed by creature key, board events beside the log, live actions as one boost or cut each

ID: `2026-11-02-combat-v2-engine-slice-1-the` · Status: current

**Decision.** Slice 1 of phase 4 (`integration.md`, section 3) is in `@creatures/engine/v2`, and the lab's parity digest was identical after every part.

- **The stage carry** (`StageCarry`) is plain JSON and names creatures by `FighterSpec.key` (the worker's creature id), falling back to the `uid`. `weekendV2` loops over `stageV2` and gives its own creatures the keys `team:i` and `bench:j` (their identity, which a slot is not once a replacement takes it). A creature knocked out is in the carry's `out` and is left out of later stages by `stageV2`.
- **Board events** are the optional `FightEvent.board`, only with `log` on. An event that had a text line carries its board part beside it; the rest (a creature's hit on the boss, a heal, a Store, round start, boss turn, shed marks, resistance, the end) are events of kind `board` with empty text. The digest leaves out both, so it did not change. Mired and the live actions also get board events.
- **The live finale's actions** (`{round, kind, row?, by}`) act from their round on and draw no dice, so adding one at round r changes no event before r. Rally is one more hit boost inside the +150% cap, Shield Wall one more cut inside the 75% cap and before armour, Purge lifts both resistances for `purgeRounds` rounds. Two of the same in a round do not stack. The numbers (`rallyBp` 1000, `shieldWallBp` 5000, `purgeRounds` 2) are in `rules.json`.
- **The track's boss** is read from `raid-track.json` through the pack by `trackBoss`/`slotSpec` in `resolve/track.ts`; after the data's last slot the track goes on at full strength with the boss's own numbers and its last lap's extra cards. A party under four fights at four columns. The lab keeps its own slot derivation (orders, tuner tables, the rank ladder) and a test checks the two agree for slots 1 to 40.

**Reasoning.** Keys by creature id are what the worker has between Saturday and Sunday, and a key that is not a slot survives swaps. Putting board events beside the text keeps one ordered list for the client to fold and costs nothing when the fight does not log. Keeping the actions to one boost or cut each, inside the caps the rules already have, means none can be stacked into something the lab did not measure. The CPU numbers are in `integration.md` section 8: warm medians of 0.3 to 1.8 ms per stage or finale replay, far under the Free plan's 10 ms.

## 2026-11-02: Combat v2 phase 4 plan: the game plays v2 behind a staging flag, rules version stored per week, run and fight

ID: `2026-11-02-combat-v2-phase-4-plan-the` · Status: current

**Decision.** Phase 4 follows `docs/design/combat/integration.md`:

- **A `COMBAT_V2` worker variable**, on in staging only and pinned off in production by a test. It is read only when something starts: a raid week stores `rules_version` when it is created, a dungeon run stores it in its state, and a fight input carries `version: 2`. The client picks its v1 or v2 screens from the view's `rules`, not from the flag.
- **Storage:** the saved Knack is a column on `creatures` (the known Knacks are worked out from the line, not stored); the v2 Talent Book is per player and line (`line_talents`) with each creature's learned talents (`creature_talents_v2`); a `raid_track` row per server replaces `raid_ladder` under v2; the weekend's carry is JSON on `raid_parties`; swap requests get their own table.
- **Engine:** `stageV2` plays one stage and returns a JSON carry (`weekendV2` loops over it); typed board events sit beside the log text and stay out of the parity digest; the live finale's Rally, Shield Wall and Purge become v2 inputs with the prefix property; `slotBoss` and `wideBoss` move from the lab to `resolve/`.
- **Calendar (Misa's direction):** stage 1 Saturday 13:37, stage 2 Sunday 13:37, the finale Sunday 20:00, with no HP floors.
- **Under v2 in phase 4:** gear counts only its stat lines, weather does not touch fights (question for Misa), and creature finale abilities and Re-mark are not used. A dispatcher `replayFight` runs v1 or v2 by the stored input.
- **Production is never converted.** The game resets after both reworks, so a staging-only dev tool (`combat-v2-convert`) rolls v2 talents for a staging server.

**Reasoning.** Storing the rules version at the start of each week, run and fight means a flag flip never changes a fight already under way, and old v1 rows still replay. Splitting the weekend into stages is the one engine change the live calendar needs, because stages happen a day apart. Keeping board events out of the digest lets the 1,299-fight parity check prove that adding them changed no result. Gear effects and weather were never measured in the lab, so turning them off keeps staging honest until phase 5. The CPU of a v2 stage is measured first: the Free plan allows 10 ms per request, and Misa approved Workers Paid in advance if a measured limit blocks us.

## 2026-11-01: [Misa] Combat v2 icons: shapes, the sword, the Store box, claw Pincer, Leap as a chain

ID: `2026-11-01-combat-v2-icons-shapes-the-sword` · Status: current

**Decision.** Misa reviewed the combat v2 icon concepts in two rounds (2026-11-01; the set `combat-icons`, the audit `docs/design/combat/icons.md`). Approved: Quake, Cross, Checker and One-shot; Slam as a big square with a short bar each side (the target and its neighbours); Strike as a crosshair without its ring (distinct from Cross); Lance pointing down (the boss attacks from the top); Pincer as two claws (no centre dot); Barrage and Sweep as shipped; Crit; the plain attack as a sword (it differs from a Strike, since plain attacks and moves can have different effects); the three Store heads as one shared box holding Heat, Calm or Static. Leap is three squares joined by a faint zigzag, with the bottom square moved right so it reads as a chain, not a fork. **A count is text beside an icon ("x3"), never drawn into it.** The six target words (Front, Rear, Payoff, Nemesis, Wild, Vulture) have no icon: the board lights the slots a move hits. Combat v2 gets its own versions; the shipped v1 glyphs stay until v1 goes. The icons stay concepts until the phase 4 board uses them.

**Reasoning.** Misa's calls on look and feel. Fewer icons to learn, each shape drawn the way a move hits the board.

## 2026-11-01: [Misa] Combat v2 names: a card never shares a move's name (Full Sweep), Barrage and Leap are both keyword and shape word, the Puddle Imp asks for a Guard

ID: `2026-11-01-combat-v2-names-a-card-never` · Status: current

**Decision.** Misa left these to the lead (2026-11-01: "make up the rules and the names; we can change them later"):

- **A rule card's name never equals a move's name.** The card Great Wave becomes **Full Sweep** (it adds a Wild Sweep); the Tidal Colossus keeps its tide move Great Wave. The content test checks the rule.
- **A shape's keyword and its label word are the same word.** The keyword Scatter becomes **Barrage** (the label word), and the label word Leaping Strike becomes **Leap** (the keyword), so every shape is one word: Slam, Lance, Sweep, Barrage, Quake, Strike, Hush, Pincer, Leap ("Nemesis Leap").
- **The Puddle Imp asks for a Guard** (Wide Reach) since its splashes became a Barrage of hits on different creatures (2026-11-01 retune): Misa, "dodging and a Guard both help, so that's fine".

**Reasoning.** One word per idea for players; a card that shares a move's name would read as that boss's move.

## 2026-11-01: [Misa] Combat v2 move library: a themed name per behaviour and element, the behaviour fixed

ID: `2026-11-01-combat-v2-move-library-a-themed` · Status: current · Amends: `2026-11-01-combat-v2-names-batches-3-and`

**Decision.** Boss and foe moves form one library (Misa, 2026-11-01: "the thematic name is just a coat of paint", and move animations go with the name, so raid and dungeon bosses share them when they share moves). Each move in the library has a themed name and a fixed behaviour: its shape and whom it picks (and whether it silences). A boss or foe uses a library move with its own numbers (power, rhythm, count, Wind-up, crit chance). A behaviour has one name per element, shared by every boss and foe of that element; a card has no element, so a card's move keeps the plain behaviour name. The plain behaviour names of the earlier decision (Front Slam, Nemesis Lance, Wild Sweep, ...) stay as the label the board can show under a move's own name ("Deepwater Spear · Nemesis Lance"); they are no longer the moves' names. Where one boss had two moves of one behaviour, they merge into one (the lab retunes): the Colossus's Tidal Pull and Deepwater Spear, Thornmother's Seed Burst and Bloom Storm (Second Bloom strengthens the one), and the landmark moves of the Drowned Warden and the Fen Lurker, which repeated their own Quake and get a different shape.

The library (behaviour: tide, ember, grove, spark, mire, card):

| Behaviour (label)              | Tide            | Ember           | Grove          | Spark            | Mire        | Card        |
| ------------------------------ | --------------- | --------------- | -------------- | ---------------- | ----------- | ----------- |
| Hush (silences the row's ends) | Deafening Mist  |                 | Bramble Hush   |                  |             | Hush        |
| Pincer (the row's two ends)    |                 |                 | Briar Pincer   |                  |             |             |
| Front Slam                     |                 | Anvil Fall      |                |                  | Belly Flop  |             |
| Payoff Slam                    |                 | Volcanic Meteor |                | Static Strike    | Bog Lob     | Payoff Slam |
| Nemesis Slam                   |                 | Slag Spill      | Vengeful Roots | Thunderclap      |             |             |
| Wild Lance                     | Riptide         | Scorch Lane     | Grasping Vines | Lightning Bolt   | Mud Slide   |             |
| Nemesis Lance                  | Deepwater Spear |                 |                |                  |             |             |
| Front Lance                    | Sluice Pull     |                 |                |                  |             |             |
| Front Sweep                    | Undertow        |                 | Thorn Wall     |                  |             |             |
| Rear Sweep                     | Backflow        |                 | Spiky Spine    |                  | Peat Wave   |             |
| Payoff Sweep                   | Rogue Wave      |                 |                |                  |             |             |
| Wild Sweep                     | Great Wave      |                 |                |                  | Sinking Mud | Wild Sweep  |
| Barrage                        | Spray           | Cinder Fall     | Thorn Rain     | Forked Lightning | Mud Spit    |             |
| Quake                          | Deluge          | Eruption        |                | Storm Front      | Sink Down   |             |
| Leaping Strike                 |                 | Ember Leap      | Thorn Lash     | Arc Lash         |             |             |
| Payoff Strike                  |                 |                 |                | Thunderbolt      |             |             |
| Vulture Strike                 |                 |                 |                |                  | Sinkhole    |             |
| Nemesis Strike                 |                 |                 |                |                  |             | Crush       |
| One-shot (Payoff, Wind-up)     |                 |                 |                | Judgement Bolt   |             |             |
| Checker                        |                 | Ash Cloud       |                |                  |             |             |
| Cross                          |                 |                 | Bramble Cross  |                  |             |             |

Who uses what follows from each boss's and foe's element and its moves today (for example the Bramble Hound and the Bramble Matron use Bramble Hush, the Ember Mite Cinder Fall, the Flicker Swarm Storm Front, the Static Bat Arc Lash, the Tar Leech Belly Flop). In the data, the library is one file of moves (id, name, element, behaviour), and a boss or foe refers to a move by id with its own numbers, so a name cannot drift from its behaviour.

**Reasoning.** One behaviour per name keeps the board readable and lets one animation serve every boss that uses a move; themed names keep each boss's flavour.

## 2026-11-01: [Misa] Combat v2 rule changes from the names review: Mired fades every round, Swarm is a Scatter, Back-most is the last to act

ID: `2026-11-01-combat-v2-rule-changes-from-the` · Status: current

**Decision.** From Misa's notes on names batches 3 and 4 (round 2, 2026-10-31):

- **Mired fades every round**: it loses 1 stack at the end of every round, every 2nd round while a living creature has Clinging (was every 2nd and every 3rd). With up to 45 creatures acting a round, Mired is put back often and need not linger.
- **Swarm is a Scatter**: its plain attack becomes a Scatter of small hits on different creatures (was separate hits on random slots, where one creature could take several).
- **Back-most is the last creature to act**: the back row's rightmost by default, since creatures act row by row, left to right (was the leftmost). If a boss's attack order ever differs, it is still the last to act.
- Kept as they are: Slippery and Elusive (two cards, reworded so neither names Mired: Elusive is Speed that debuffs lower, Slippery a flat dodge that debuffs do not lower), Crusher and Grudge with Crusher's 3-round rhythm, Retaliate ignoring armour, Breakwater (reworded only).

These change fight results: the lab measures them, the tuners retune, and the parity digest is rewritten in the same change.

**Reasoning.** Misa's calls on game feel. Each one makes a rule simpler to read or closer to what a player expects.

## 2026-11-01: [Misa] Combat v2 names, batches 3 and 4: keywords, rule cards, and moves named by shape and target

ID: `2026-11-01-combat-v2-names-batches-3-and` · Status: current, amended by `2026-11-01-combat-v2-move-library-a-themed`

**Decision.** Misa went through the 27 keywords and 19 rule cards (batch 3), the 69 moves, Build-ups and phases of the raid bosses and dungeon foes (batch 4), and a round 2 on his notes (2026-10-31).

- **Moves are named by what they do, and who they pick** (Misa: unify the moves that do the same thing, and show the target in the name): Slam (the target and those beside it), Lance (whole columns), Sweep (whole rows), Barrage (several random creatures), Quake (every creature), Hush (silences the row's ends), Leaping Strike (the strongest, then leaps to creatures nearby). The target word comes first: **Front** (the first to act, or the front row), **Rear** (the back row), **Payoff** (the strongest Payoff), **Nemesis** (the strongest), **Wild** (random), **Vulture** (the weakest). Misa named Front Sweep, Rear Sweep, Payoff Slam and Nemesis Slam; Wild, Vulture, Pincer and Strike follow them. Each boss hits with its own power, and Wind-up is a marker on a move, not another move. So a name stands for a shape and a target (P-06 for moves), never for one number.
- The mapping: Front Slam (Coil Crush, Belly Flop, Tar Cling, Anvil Fall); Payoff Slam (Magma Spit, Static Field, Bog Lob, Payoff Hunter's move); Nemesis Slam (Thunderclap, Root Grab, Slag Spill, Coil Burst); Wild Lance (Riptide, Scorch Lane, Root Snare, Forked Lightning, Mud Slide); Nemesis Lance (Tidal Pull, Deepwater Spear); Front Lance (Sluice Pull); Front Sweep (Undertow, Thorn Wall); Rear Sweep (Breaker, Back Thorns, Peat Wave); Payoff Sweep (Spring Tide); Wild Sweep (Great Wave and the Great Wave card's move, Sinking Mud); Barrage (Spray, Cinder Fall, Seed Burst, Bloom Storm, Ball Lightning, Rising Bubbles, Flare Up, Mud Spit, Thorn Rain); Quake (Eruption, Storm Front, Buzz Cloud, Flood Gate, Sluice Surge, Sink Down, Fen Tug); Hush (Bramble Hush, Sea Mist, Thorn Snap, Tangle, Bramble Bind's move); Pincer (Briar Pincer, Briar Cage); Leaping Strike (Ember Leap, Thorn Lash, Zap Dive, Arc Lash); Payoff Strike (Spark Dive); Vulture Strike (Sinkhole); Nemesis Strike (Crusher's move). Kept as they are: Judgement Bolt (a one-shot), Ash Cloud, Bramble Cross. This supersedes the batch 4 renames of those moves (Volcanic Meteor, Static Strike, Lightning Strike, Tar Toss, Backflow, Rogue Wave, Deluge, Bramble Bind for Thorn Snap).
- **Build-ups:** all approved; Rising Water is now **Maelstrom**. The keyword Build-up is now **Escalating**.
- **Rule cards:** approved, except Lucky Strike is now **Double Strike** ("The boss's hits sometimes Crit for double damage; can you turn them away or take the sting out?"). New texts: Great Wave and Shake It Off drop "announced at round start" (every move is announced); Breakwater: "Row Wards are up to 3 times as strong against its Area hits"; Elusive and Slippery reworded so neither names Mired.
- **Keywords:** approved, with new texts for Reaction ("A Payoff hits a Mark its element is strong against: bonus damage, and the mark loses 1 stack"), Intercept ("Takes a hit meant for a creature in its Reach"), Taunt ("The boss's plain attack, its basic hit, not its named moves, aims at this creature. With several Taunts, the first to act draws it"), Boost ("A Support's bonus damage on a creature's next hit"). A mark's size is its **stacks** everywhere (was "count").
- **Guard's Shadow** (the Knack) is now **Reliably Covered**: the gear line Guard's shadow keeps its name.

**Reasoning.** Fewer names for players to learn and for the content to keep in step: a name says what a move does and whom it picks, the same everywhere.

## 2026-10-31: [Misa] Combat v2 names, batch 2: talents

ID: `2026-10-31-combat-v2-names-batch-2-talents` · Status: current

**Decision.** Misa went through all 34 combat talents on the names page. 28 keep their names. Renamed (ids stay):

| Was           | Now             | Note                                                                                                                                |
| ------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Crit Damage   | Amplified Crits |                                                                                                                                     |
| Cull          | Culling Strike  |                                                                                                                                     |
| Heavy Hand    | Wicked          | Its text now says "its debuffs" instead of Mired (Misa: it applies to all debuffs; Mired is the only one today, so no number moves) |
| Hold the Line | Easily Provoked |                                                                                                                                     |
| Owner's Mark  | Potent Mark     |                                                                                                                                     |
| Stubborn      | Refuse to Fall  | Second Wind was wanted, but it is a shipped gear chance line with another effect (P-06)                                             |

Crit Damage, Owner's Mark, Heavy Hand and Stubborn are also the names of shipped gear lines with the same effect. By the standing rule (a talent and a gear line with the same effect share one name, 2026-10-28), the combat v2 gear lines take the new names when gear moves to combat v2 (`gear-plan.md`); the shipped v1 lines keep theirs until then.

**Reasoning.** Phase 3's gate needs approved names before the compendium entries. Ids do not change, so a rename is a data edit.

## 2026-10-31: [Misa] Combat v2 names, batch 1: Knacks and families

ID: `2026-10-31-combat-v2-names-batch-1-knacks` · Status: current

**Decision.** Misa went through all 44 Knacks and 24 families on the names page (two rounds). Approved as they are: 23 families and 27 Knacks. Renamed (ids stay; only the shown name changes):

| Was              | Now               | Why (Misa's note, round 2)                               |
| ---------------- | ----------------- | -------------------------------------------------------- |
| Ward (family)    | Silence Guard     | Row Ward is damage reduction; this is different          |
| All at Once      | All In            |                                                          |
| Steady Mark      | Brand             |                                                          |
| Keep the Heat In | Barricade         |                                                          |
| Mud Wall         | Sticky Mud        |                                                          |
| Thick Fog        | Rolling Fog       |                                                          |
| Tunnel Through   | Sense Weakness    |                                                          |
| Wide Warmth      | Wide Embrace      |                                                          |
| Baked Shell      | Boiling Point     | make it about pent-up anger                              |
| Carry Them       | Unlikely Guardian | it is a surprise; put that in the name                   |
| Catch the Bolts  | Take It All       | bolts is too narrow                                      |
| Circle Round     | Returning Tide    | give it Tide flavour                                     |
| Gather Calm      | Eye of the Storm  | turning reactions into damage is mayhem, not calm        |
| Gnaw Through     | Find the Gap      | Sharp Claws was wanted, but it is a talent's name (P-06) |
| Hide in Mist     | Mist Veil         | a mist noun                                              |
| Lightning Ears   | Drop Guard        | did not fit the effect                                   |
| Puddle Maker     | Self-Starter      | a puddle makes no sense here                             |
| Ready the Mark   | Stack Up          | adding is not readying                                   |

The shipped v1 finale ability Mud Wall keeps its name until v1 goes (phase 8); only the combat v2 Knack is renamed.

**Reasoning.** Phase 3's gate needs approved names before the compendium entries and the icons. Ids do not change, so a rename is a data edit and stored choices keep working.

## 2026-10-31: Combat v2 content as data: a separate game entry, the resolver beside the engine, cards as operations

ID: `2026-10-31-combat-v2-content-as-data-a` · Status: current

**Decision.** Phase 3 follows `docs/design/combat/content-as-data.md`. The combat v2 content (rules numbers, Knacks, per-form armour, own Knacks and stat changes, talents and line pools, rule cards, raid bosses, dungeon foes, keywords, the boss track) becomes JSON files in `packages/game/src/combat-v2/data/`, checked by valibot schemas and cross-reference checks at load, behind a separate entry point `@creatures/game/combat-v2`. The code that turns content into an engine input (`formStats`, the fighter resolver, card application, the boss and foe builders) goes to `packages/engine/src/v2/resolve/`, taking the content pack as an argument. A rule card becomes a list of operations (`add`, `set`, `raise`, `flag`, `mod`, `cap`, `move`, `plain`), scaled by strength; applying any card sets the boss's strength to the card's. The engine's types stay the source of the rules' shapes, and a type test checks the game's schemas against them both ways. Ids, names and numbers move unchanged, and the lab's parity digest holds through every slice. Intent text (`intent`, `asks`) stays next to its entry in the data and is never shown to players.

**Reasoning.** The roadmap put the resolver in the game, but the engine already depends on the game, and the resolver needs the engine's effect merge; next to the engine, taking the content as an argument, it stays pure and testable with tiny packs, and the worker can use it in phase 4. A separate entry keeps the v2 files out of the shipped worker until phase 4. Cards as operations make a card a data edit and let the content tests read what each card does. Keeping the engine's types as the source (instead of deriving them from the schemas) leaves the rules where phase 2 put them, and the type test catches a field added on one side only. Intent beside the entry keeps one place to edit, and the lab report prints it.

## 2026-10-31: Talent share: three raid-heavy talents cut, the raid share measured on 40 seeds

ID: `2026-10-31-talent-share-four-raid-heavy-talents` · Status: current

**Decision.** Catch Breath heals 30% (was 40%), Owner's Mark gives +12% (was +15%) and Opportunist +100% (was +120%). The report's raid share of the talent check uses 40 final seeds (was 12). The best-fit talents' share of a raid result went from about 24.0% to 24.7% (60-seed readings) with the roster branch and failed the 17% to 23% band in the report (24.4%); it is now 22.3% (raid) and 17.6% (gauntlet), both in band.

**Reasoning.** A bisect of the 19 lab-changing commits of the roster branch (#114) found no single cause: the share was already about 24.0% before it (the old check passed at 23.5% on 12 seeds by luck of the seeds and rounding), and the fight-rule commit (Sure Crit, crit step, silence stat lines, Steady Rhythm on landed hits) added about 0.7, Breakwater's card another 0.3. The raid share is a plain damage ratio with no compression, and 12 seeds swing a card's share by 5 points; 40 seeds make the average steady to about half a point. Catch Breath, Steady Rhythm, Owner's Mark and Opportunist carry 16 of the 25 points in the raid and under 3.5 of the 17.6 in the gauntlet, so the cuts leave the gauntlet in place. Steady Rhythm's period is a fight rule (`fight.ts`); a period of 4 would take the raid share to 21.0% and is left for the engine port. Hardy at +18% (was +22%) would lower the raid share by another 0.7 but breaks the written Storm Sovereign answer with Night Watch (its share falls under 90%) and was not taken.

## 2026-10-31: Combat v2 engine port: v2 beside v1, whole inputs, parity by a result digest

ID: `2026-10-31-combat-v2-engine-port-v2-beside` · Status: current

**Decision.** Phase 2 follows `docs/design/combat/engine-port.md`. The combat v2 rules go into `packages/engine/src/v2/` beside the v1 engine, which stays untouched until phase 8. A v2 fight input is whole: it carries `version: 2`, its rules numbers, the element chart it uses, resolved fighters and the boss with its cards applied, with no optional "rule before this one" fields. Content lookups (form, Knack and talent ids to stats and effects) stay outside the engine: the lab resolves them now, the game in phase 3. Parity is proven by a committed digest of a fixed corpus of lab results, taken on the lab's own code before the move and reproduced exactly after every slice. The board's structured events wait for the board (phase 4).

**Reasoning.** The lab's fight is already pure; only `placeFighters` looks content up, so that is the natural seam, and it lets rule tests name effects instead of catalogue entries. A whole input replays exactly whatever later changes in content or rules; v1's optional fields show what happens otherwise. A digest over many seeded fights proves "the same results" far more tightly than re-running the lab's tests, and it guards every later refactor too. Events draw no dice, so designing them with the board changes no result.

## 2026-10-31: Phase 1 passes with the casual metric at 1.41; 1.5 stays a target for the balance phase **[Misa]**

ID: `2026-10-31-phase-1-passes-with-the-casual` · Status: current

**Decision (Misa, 2026-10-31).** Combat v2's phase 1 (design in the lab) is accepted with the casual metric at **1.41** of 3 creatures from outside a casual player's top three by level, against the gate's 1.5. Phase 2 (the engine port) can start. 1.5 stays a target for phase 5 (simulation and balance), where real rosters and the board's hints exist. The other four gate items pass (`docs/design/combat/roadmap.md`, "Where we are").

**Reasoning.** The metric now reads 32 rosters with its spread (±0.14); the old 1.5 came from 4 rosters and was a lucky draw (20 redraws averaged 1.31), so the miss is the measure getting honest, not the design getting worse. The port moves rules, not numbers, so the target can still be reached in the balance phase.

## 2026-10-31: Phase 1 gate: five intended answers fixed, and four Knacks given a real use (Catch the Bolts, Night Watch, Cool Head, Twin Strike)

ID: `2026-10-31-phase-1-gate-five-intended-answers` · Status: current

**Decision (implementer, for the lead's review).** Phase 1 gate, items 1 and 2:

- **Intended answers: 23 of 23 beat the classic line (was 18).** Four were lines, not Knacks: Swarm's Zoom put Voltaro (a Spark Setter) with Tempestray (Spark), so the line never reacted (now Bloomback, Grove, +14%); Reflective Hide's Clear the Air, Elusive's Clear Skies and Great Wave's Keep the Heat In stood at the end of the line, where the Support or Guard reaches one neighbour (now in the middle, beside both: +31%, +10%, +43%; Clear the Air keeps the classic Detonate Payoff, Keep the Heat In uses Hearthshell). One was a number: Twin Strike 55% to 58% per hit (Stone Skin, -1% to +3%). 60% gave +6% but took the Storm Sovereign's Draw Fire tool test below its 10 points (9.7), so 58% is the highest value that keeps both.
- **Catch the Bolts** takes the area hit it intercepts with its own cover's cut (it used to take the whole hit and was worse than no Knack on Great Wave). Night Watch takes the Wind-up hit it intercepts at a quarter (the largest cut there is) instead of the cover's 40% (`watchCutBp`). **Cool Head** removes the whole extra damage of a crit on it and its neighbours (was half). All three keep their family and intent.
- **Primed by Pain is not dead:** it is the best thornbuck Knack on 12 of 17 cards in an exhaustive search of every line (`best` studies, 2026-10-31) and in the report's card usage (within form 0.8 to 1.7); on the bosses the foe searches miss lines that win (Bramble Matron at depth 7: the report's best line wins 45%, a Primed by Pain line wins 93%), so its boss usage is the search's, not the Knack's. No change.

**Reasoning.** The lab's own tools, not a guess: each Knack taken in and out of the same line on its own card, and an exhaustive search over every pair of partners with the Knack fixed (a Knack that ties with no Knack outside its card is a niche answer; one that loses to no Knack is a trap, as Catch the Bolts was). Night Watch and Cool Head are single-card answers (Great Wave and the Wind-up bosses; Lucky Strike), so a team search of the whole pool can pick them on only that card: their within-form ratio is capped near 0.3 to 0.5 unless the card set grows. They do win on their card against their form-mates (Night Watch 4238 against Primed by Pain 4174 on Great Wave; Cool Head 4221 against 4197 on Lucky Strike). The casual metric ("1.3 of 3 beyond the top three") is noise: over 20 re-drawn sets of rosters (320 searches) the mean is 1.31 before and after this change, one set of four rosters ranges 0.8 to 1.8 (sd 0.25), and 6 of 20 draws reach 1.5; main's 1.5 was a high draw of the same rosters. Open for Misa and the lead: the Lucky Strike entry above measured Cool Head at 9 points of potential at slot 8 with the half ward; it is worth more now, so slots 8 and 13 want a `--tune --track` look.

## 2026-10-31: Slots 1 and 2 field stage 1 lines; the mixed server fields the written answer that suits it

ID: `2026-10-31-slots-1-and-2-field-stage` · Status: current

**Decision (lead).** Two changes to the boss track in the lab, design panel 6's last integration pass:

- **Slots 1 and 2 name stage 1 lines** (`SLOT_LINE` in `track.ts`): the gated version of the line each had (each stage 2 form its stage 1 form, with the Knack and talents the gate keeps). A week-1 or week-2 server has no evolved forms (the evolution level is 15; a daily player's best creature is level 11 in week 1 and 14 in week 2). Slot 2's line keeps its tool, Squelch Song on three Squelch. The ownability test's evolved half passes for every slot.
- **The mixed server fields the written answer that suits it** (`SLOT_MIXED_ANSWER`, `slotAnswersOf` in `track.ts`; `measureSpeed` in `trackTuner.ts`). The mixed server's min-maxers and builders field whichever of the boss's written answers gives the mixed server the best kill rate at the slot's numbers and week, chosen once per slot in the tuner's full measurement. Only answers a mixed server of 8 can own at the week are candidates, and another answer replaces the first only by 5 points of kill rate. The dedicated server keeps the slot's prepared line.

Result: both slots tune to every target (slot 1 3,800 HP / 83 / 19, with the HP at the search's lower limit; slot 2 7,500 / 80 / 42). **No second answer beats the first at any slot**, so `SLOT_MIXED_ANSWER` is empty, and the mixed server stays at 0% and 1% on Tidal Colossus's laps 2 and 3 (slots 6 and 11), on the valley's roster at `fb0b3c3`: a content problem, reported in `boss-track.md`, "Results".

**Reasoning.** The gate had made slots 1 and 2's lines stage 1 lines in practice; the data now says so, and slot 2's line is measured and ownable as what a week-2 server fields. A team search over the common stage 1 forms found lines with more raw potential at equal numbers (slot 1 277% against 132%, slot 2 177% against 132%) but retuned they were worse where the tuner looks (the lower limit of the search again, and 107% to 115% with random talents), so the gated lines stay. The panel guessed the Colossus's mixed failure was the first answer's Wide Reach Guard in every column, which casual columns leave gaps in, and that the second answer's Row Ward could carry them. Measured, the second answer is no better (Keep the Heat In takes 15% off a row's area hits), and the mixed server is weaker against the Colossus than the classic party, while ten prepared players kill it every weekend; so the cause is the five casual columns against its sweeps, not which answer the other five bring.

## 2026-10-31: Combat v2: Knack usage is read within the form

ID: `2026-10-31-combat-v2-knack-usage-is-read` · Status: current

**Decision.** The Knack usage tables of the lab report (the full report's "Knack usage in the top 5 teams" and the boss report's "Knack usage across the real bosses") now read each Knack within its form: the Knack's picks over what random would give among the choices of the forms that can equip it, "no Knack" counted as one of the choices. "Stands out" (2 or more) and "rarely chosen" (under 0.3) apply to that within-form ratio; the overall ratio (share of all picks over share of the pool) stays as context. The boss table also gets raid-only columns (raid picks, raid ratio) and names the raid bosses and foes that pick each Knack, and says the raid searches are saturated. Knack numbers are unchanged: Living Shelter stays at 25% and Thick Fog at +8. The same change takes the festival-prize line Hearthshell out of the written answers (four boss answers now use Kilnmole, one with Baked Shell in place of Hearth) and adds a test that no written answer needs a line nobody can own at the last slot's week. Cinder Wyrm's slots 2, 7 and 12 were retuned on the track tuner's table.

**Reasoning.** Living Shelter read 3.7 and Thick Fog 3.4 on the overall ratio, the two highest. Taking each off the lines that picked it showed it was worth about 0 there (under 1.3 points of score on foe lines, about 165 a line), so the searches picked it at random, and within its form it was chosen 34% (Living Shelter, of Ancientshell's picks) and 40% (Thick Fog, of Fogwyrm's) against 25% at random. The overall ratio followed how often the two forms are picked (Ancientshell 67 picks, Fogwyrm 52, about 27 on average), which no Knack number changes: cutting the numbers to 18% and +6 moved the foe picks not at all (15 and 13 at every value tried) and made the answers that use Living Shelter fragile. A Knack of a popular form therefore read high whatever it did. Reading within the form removes that. The raid searches are saturated (every boss at 100% kill, a raid line scoring about 140), so near-worthless Knacks are picked about at random there and one run of the table moves a ratio by about 1 (Drizzle read 2.1, 4.0, 3.7 and 1.4 in runs that changed only other Knacks); a Knack is to be judged on the within-form ratio and on what taking it out costs a line, not on a single raid run. Hearthshell is a festival prize that scouts cannot find, so an answer that needs it can never be owned.

## 2026-10-30: Ownability reads the valley's launch coverage per line; a festival prize is never ownable

ID: `2026-10-30-ownability-reads-the-valley-s-launch` · Status: current · Amends: `2026-10-30-a-boss-s-tool-line-must`

**Decision.** The lab reads the valley's new economy-lab output (branch `ccr-93a1de17-yutb1a`, commit `dbc62bb`) and changes three things in the entry it amends:

- **Coverage is per creature line, and ownability reads its `launch` shares.** The valley now gives `unit: "line"` and, per week, the shares over all lines released so far (which dip at content drops), the old per-form shares (`forms`), and `launch`: the shares over the 14 launch lines scouts can find (8 common, 3 rare, 3 epic). The answer lines use only launch creatures, and a launch line once owned stays owned, so the `launch` share is exact for them and never dips. `coverageAt` returns it as it is; the running-maximum workaround is gone (a test keeps that the launch share never falls). The loader checks `unit`, `forms` and `launch`, each share from 0 to 1.
- **A festival prize is never ownable.** A line whose stage 1 form is not `catchable` (Lanternfin, Hearthshell; read from `content.creatures`) cannot be found by scouts, so its ownable chance is 0 and the report shows it as "festival prize". A boss must not need it. The chance of an answer is still the product over its non-common lines, so an answer with one of them has a chance of 0.
- **A level of 0 in the roster profile means no such creature.** The loader accepts 0 for the 3rd, 10th and 20th creature's level (the 1st is at least 1). `levelOfCreature` skips a 0 anchor and never interpolates toward it: a creature ranked past the last non-zero anchor takes that anchor's level (the old flat-beyond-the-20th rule, applied at the last rank that exists), and the roster size still limits the count. The new player is not clamped in the valley's file; `rosterWeek` still caps them at the daily player's levels and size.

**Reasoning.** The first version read the all-forms share as a running maximum, a lower bound that hid the dips; the valley can now report the launch content on its own, which is exact and needs no workaround. Counting per line matches how the lab counts ownership (a form is owned by owning its line). A festival prize cannot be scouted, so requiring one would make a boss unbeatable for players who have none; the 0 keeps such an answer out of the tool line and flags it for whoever writes the answer. Reading a 0 as a low level would have made the creatures of a rank nobody has reached slide toward level 0 in the roster; skipping it keeps the levels the profile really gives.

## 2026-10-30: A boss's tool line must be ownable at the week its slot arrives (the roster comes from the valley)

ID: `2026-10-30-a-boss-s-tool-line-must` · Status: current, amended by `2026-10-30-ownability-reads-the-valley-s-launch`

**Decision.** The combat lab's roster is the valley's: `packages/lab/data/valley/roster-profile.json` and `server-coverage.json`, copied from the valley branch (`ccr-93a1de17-yutb1a`, commit `8ffe5d0`) and read by `src/valley.ts`, replacing the placeholder curves. The speeds (slow, expected, fast) stay as sensitivity factors on the valley's levels. A slot's **tool line** (the boss's first answer) must be **ownable** at the slot's arrival week: the chance that a mixed server of 8 owns every non-common line it uses is at least 50%. Ownership is counted per line (an evolved form is owned by owning its line's stage 1 form, with that form's rarity); the chance is the product, over the distinct non-common lines, of that rarity's coverage at that week. An all-common answer is always ownable. The share is read as its running maximum over the weeks (`coverageAt`): a species in the pool never becomes less owned, and the valley's share dips every 4th week only because a content drop adds unowned species to the denominator, so the maximum is a lower bound for a species from the first content (exact if the valley reports the first content's coverage separately). The rule holds on every slot for the line the tuner measures: the boss's first answer, or the slot's own line (`SLOT_LINE` in `track.ts`, read by the tuner and the path). Slot 1 names one, all common (Geyserpup with Puddle Maker in place of both Tempestrays), because the tutorial boss is tuned for what a week-1 server has: a server of 8 owns Tempestray with a chance of 14% in week 1, and without it the first answer's line reached only 90% potential at the old numbers. Slot 1 was retuned for it (12,400 HP, 89 Attack, 31 armour). The numbers are `OWNABLE_CHANCE_MIN` and `OWNABLE_SERVER` in `targets.ts`; the check is `ownability.ts`, held by `test/ownability.test.ts` and printed by `--path` and the full report.

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
