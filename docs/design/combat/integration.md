# Phase 4 plan: combat v2 in the game, behind a flag

Status: planned, 2026-11-02. Phase 4 of `roadmap.md`: the worker and the Activity play combat v2 when the `COMBAT_V2` flag is on, on staging only; production keeps today's game. Gate (roadmap): the full suite, the read budget and the query plan checks green, and a whole raid weekend runs on staging with bots. Misa's part: test the screens on staging.

The rules are in `@creatures/engine/v2` (phase 2) and the content in `@creatures/game/combat-v2` (phase 3). Nothing in `apps/` imports either yet. This page says what the game stores, where it calls them, what the client shows, and in what order the work goes. The rules themselves stay in `proposals/001-combat-v2.md` (R numbers below).

## 1. The flag and the rules version

- **`COMBAT_V2`** is a worker variable like `RAID_LIVE` and `DEV_TOOLS`: `on` in the staging block of `wrangler.jsonc`, `off` at the top level and in production, pinned off there by a test (as `DEV_TOOLS` is). `/api/config` sends `combatV2: true` only when it is on (absent, never `false`, like the other flags).
- **What a thing started under is stored with it, and the flag is read only when it starts.** A raid week stores `rules_version` (1 or 2) when it is created on Monday; a dungeon run stores it in its state (`RunState.v: 2`); every stored fight input says it itself (`FightInputV2.version: 2`; a v1 input has no version). Turning the flag on or off mid-week changes nothing that has begun: the week or run finishes on the rules it started with.
- **The client follows the data, not the flag.** Every raid, replay and dungeon view says `rules: 1 | 2`; the Activity picks the v1 or the v2 screens from that. The flag in `/api/config` only decides what the creature page offers (the Knack section, the v2 talents).
- **A server switches as a whole.** Each creature needs its v2 talents (section 2). On staging, a dev tool, `combat-v2-convert`, does for a server what a fresh start would do: each creature rolls its talents from its line's v2 pool, its Knack is none, finale ability choices go. Production never runs it: the game resets after the combat and valley reworks (roadmap, "Answered 2026-10-31"), so phase 6 converts nothing.

## 2. What the server stores

New migrations (numbers assigned by the lead when the work starts; today's last is 49). Every new lookup on a hot path gets its index in the same migration.

| What                 | Where                                                                                                                                                                                                                                                                                                                                                                                                                                             | Rule     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| The saved Knack      | `creatures.knack TEXT` (null is none). The Knacks a creature knows are worked out from its line, not stored: the forms on its path from the line's base form to its current one, cut at the last role change (R11). Saving checks the Knack is known; an evolution that drops it (a role change) sets it to none in the same transaction. The team loaders' column lists (`raid-teams.ts`) gain it.                                               | R11      |
| The Talent Book (v2) | `line_talents(user_id, line, talent_id, golden, found_at)`, one book per player and line; `creature_talents_v2(creature_id, talent_id, slot, learned_at)`, the talents a creature has learned, `slot` 1 to 3 or null. Every talent found goes into its line's book; learning costs Bait once, swapping among learned talents is free until the raid locks; slots open with level. A role change replaces idle slotted talents with rolls (R20.8). | R20      |
| The track            | `raid_track`, one row per server: the slot (the Boss Rank), the best share of the current slot's HP removed so far (basis points), the failed weekends on it (Determination's stacks), the week it last changed. Under v2 it replaces `raid_ladder`.                                                                                                                                                                                              | R24      |
| The week             | `raid_weeks.rules_version`, `raid_weeks.track_slot` (the slot this week fights; the boss comes from the track, not the calendar rotation).                                                                                                                                                                                                                                                                                                        | R24      |
| The weekend's carry  | `raid_parties.carry_json`: what passes from one stage to the next (section 3): the boss's HP, each creature's HP, who is out for the weekend, once-a-weekend uses, the escalation, the damage by element and the reactions used (for resistances). One row per party, read when a stage is resolved and when the board is shown.                                                                                                                  | R14, R22 |
| Stage results        | `raid_results` as today, one row per stage: phases `stage1`, `stage2`, `finale`. The input is a `FightInputV2`.                                                                                                                                                                                                                                                                                                                                   | R14      |
| Swap requests        | `raid_swap_requests(week_id, party, id, from_user, to_user, slot_a, slot_b, status, created_at)`, indexed by (week, to_user) and (week, from_user). Open requests end at the next stage lock.                                                                                                                                                                                                                                                     | R19      |
| Dungeon runs         | `RunState` version 2: the team as v2 placements with each creature's HP; `dungeon_steps.input_json` holds the room's `FightInputV2`.                                                                                                                                                                                                                                                                                                              | R14      |

**Gear under v2:** only stat lines count (Attack, HP, Armour, Speed, crit), as silence already reads them (R12); effect lines do nothing until the gear model is built and measured (`gear-plan.md`, a lab follow-up). The creature page shows those lines as "not in the new rules yet". **Weather** (Boons and Omens) does not touch v2 fights in phase 4: the lab has never measured it.

**The valley's School** builds on the same Talent Book (valley round 18, V-SCH-7 to 9): the store above is the one it reads. The valley session is told when it lands.

## 3. The engine work (`packages/engine/src/v2`)

Each change keeps the lab's parity digest identical (`cd packages/lab && node scripts/parity.mjs --check`) unless it says otherwise.

1. **A stage at a time.** `stageV2(input, carry, rng)` plays one stage and returns its result and the carry for the next one, as plain JSON (no Maps), so the worker stores it between Saturday and Sunday. `weekendV2` becomes a loop over it. Swaps between stages are the caller's (the worker's placements; the lab's bench).
2. **Board events.** Today's events are text for the log. The board needs typed ones: round start, announce (move, slots), hit (who, whom, damage, crit, Blocked, dodged, intercepted by), mark (element, stacks), reaction, heal, knock-out, silence, Store, escalation step, resistance, boss turn. They go in a new field on each event, beside the text; the digest's canonical form leaves that field out, so every digest stays identical and proves the fights did not change. Engine tests check the board events themselves.
3. **The live finale's inputs** (R18): Rally (every creature +10% damage this round, inside the hit-boost cap), Shield Wall (one row takes 50% less this round, inside the 75% cut cap) and Purge (no Element or Reaction Resistance for 2 rounds), as a list of `{round, kind, row?, by}` in the input. A fight without actions plays as before. Rounds already played never change when an action is added later (the prefix property the v1 finale relies on), so the worker can replay the live finale from its seed and actions on each read. Re-mark and the creature finale abilities go (R11, R18). The lab report measures the three once, so none is worth more than its intent.
4. **The track's boss in the engine.** `slotBoss` (the lab's `track.ts`) and `wideBoss` (`raidMeasure.ts`) move to `resolve/`: the slot's boss from `raid-track.json`, at a party's width, with HP x (players / 4)^0.7 and Attack x (players / 4)^0.3 (R14.1). The lab reads them back. A party under four players fights at four columns with guests filling the rest, as today's guest rule does; the slot's numbers are tuned for four.

## 4. The raid weekend on v2

**The calendar** (Misa): the week opens Monday 13:37 with the boss announced; **stage 1 Saturday 13:37, stage 2 Sunday 13:37, the finale (stage 3, live) Sunday 20:00**. The times are configuration (`RULES.raid` schedule), and a v1 week keeps today's Friday and Saturday phases: the schedule follows the week's rules version.

- **Before stage 1:** players join by placing (as today), choose Knacks, and send swap requests. A Knack locks for a creature once it has fought this weekend (R11).
- **At each stage:** the scheduler resolves every party (`stageV2` with the stored carry, a seed drawn then), stores the result row and the new carry, and pays the stage's rewards with today's settle code. **No HP floors:** the boss can fall in any stage; then the weekend is a kill and nothing more is fought.
- **Between stages:** a knocked-out creature is out for the weekend (greyed, "Out this weekend"); a player may bring a fresh creature into an empty slot and move their own creatures; marks, Stores and Mired start fresh; from stage 2 the resistance is shown at the stage break (R23).
- **The finale** is stage 3, played live as today (the socket or the 2 s poll), with the three actions above on the players' rounds and the auto fire they have now.
- **Joining after stage 1:** a new player may place into empty slots; the weekend's HP was set at stage 1 and does not grow. (Today a player can join until the finale; question 1 below.)
- **The week's end:** a server kill (today's rule across parties: at least half of the parties that played won) moves the track one slot; otherwise the best share is kept and, from slot 6, Determination gains a stack (R24.9). A Festival week has no raid and the track waits (R24.5).
- **Swap requests** (R19): from the board, a player asks another to swap two slots (or to move into an empty one); the other accepts or declines; an accepted swap moves both creatures in one transaction; open requests end at the next stage lock. Incoming requests show as a Home notice row.
- **Not on v2 in phase 4:** the readiness forecast (`raid-readiness.ts`), the practice raid's v1 paths, and the Valley Games (they keep their own v1 fights).

## 5. Stored fights and the dispatcher

`replayFight(input, seed, actions?)` in the worker dispatches on the input: `version: 2` runs the v2 engine, no version runs `simulateFight` (v1). The live finale's re-run, the stats builder and the dungeon's room replay go through it. The replay views read the stored events as today and add `rules`; old v1 rows show as they were until `old-data.ts` blanks them (weeks older than last week).

## 6. The dungeon on v2

The dungeon keeps its single row and today's order (R8.7): the line acts, then the foe takes one turn. Rooms use `foeAt(depth)` from `foes.json`, a landmark room adds the foe's signature move, the floor boss ends the day. Between rooms only HP carries (R14); a knocked-out creature stays out until the camp swaps in a fresh one; the camp keeps today's choices (rest, swap, keepsake, push on or head home). Creature finale abilities are not used. The run's depth curve is measured in phase 5.

## 7. Analytics

New events (`analytics-events.ts`, `analytics-props.ts`, the rollup and `docs/design/analytics.md`; content ids, enums and integers only):

- `knack_set` {form, knack, previous, where: page or raid}: every save; a swap is one with a previous Knack.
- `raid_lineup` {stage, placed, withKnack, beyondTop3}, per player at each stage lock. **Beyond the top three:** the player's placed creatures that are not among their three highest-level creatures (ties by the species' power), the phase 1 gate's casual metric, now measured on real servers.
- `stage_result` {slot, stage, players, hpRemovedBp, knockouts, reactions, kill}, beside today's `phase_result`.
- `track_change` {slot, kill, bestShareBp, determination}.
- `talent_learn` {line, talent} for a Bait spend on the Talent Book.

## 8. Database reads and CPU

**Reads** (`docs/design/database-reads.md`): `GET /api/raid` on v2 reads the track row, the party's carry and the swap requests addressed to the player (an indexed lookup), a few rows more than today; the Knack is a column on rows already read. A stage's resolve runs twice a weekend per party. The read budget, the query plan audit and the day in the life each get a v2 case (a seeded world with the flag on); none of today's budgets is raised without a reason in the PR.

**CPU:** the worker runs on the Free plan, 10 ms of CPU per request. A v1 raid fight fits; a v2 stage at 15 columns and the live finale's replay on every read have not been measured in a worker. The first slice measures both. If either breaks the limit: keep the replay's last state per round (as `simCache` does today) and, if that is not enough, take Workers Paid, which Misa approved in advance "if a measured limit blocks us" (decision `2026-10-10-hosting-on-cloudflare-all-in`).

## 9. The client

Everything v2 sits beside the v1 screens and is picked by the view's `rules`. Reuse first (`docs/design/ux-patterns.md`, the lookup table); every new `ui/` component gets a workbench page; every changed flow is screenshot at 390 px from each way in.

- **The Knack picker:** a section on the creature page in place of "Finale ability", and a part of the raid's `CreatureConfigurator`. A drawer listing the Knacks the creature knows, each with its text (at most two lines, keywords as `Tag` chips) and "None"; built on `ChoiceList` (the finale ability picker's pattern).
- **The creature page:** the stat block gains Armour and crit ("Crit 17% · 3x", R7.1); the Talent Book becomes the line's book (learn for Bait once, swap free); gear effect lines marked as not in the new rules yet.
- **The raid board** (`ui/RaidBoard`, `SlotButton` cues): slot highlights from a move's shape and target (fixed rules lit always; random and Wind-up moves lit when announced), the plain attack's marker, the mark strip under the boss, the turn strip (row 1, boss, row 2, boss, row 3, boss; `ui/TurnStrip`, unused today, is the place to start), the move label "Deepwater Spear · Nemesis Lance" (`moveLabel`), carried HP and "Out this weekend", the HP bar with a tick per stage, "Stage 2 of 3" and last week's best as a ghost fill, and the track strip on the week's raid screen (R24, "On the board").
- **The boss card:** header, rule-card icons with strength pips, the Escalating meter, the plain attack and the move tiles, empty rows hidden (the tutorial boss shows no card row).
- **Playback:** the stage, the replay and the live finale fold the v2 board events into board states, as `replay.ts` does for v1 events; the Stage's parts (`StageHead`, `BossFx`, `MoveTrack`) are reused where they fit.
- **Swap requests:** "Ask to swap" from another player's creature on the board; the answer from a Home notice row.
- **How to play:** a v2 set of sections (marks and reactions, roles, Knacks, the board, the weekend), shown when the flag is on.
- **Icons:** each approved glyph moves from the `combat-icons` concept set into `glyphs.ts` when a screen first uses it; the six unreviewed ones (Boost, Escalating, armour, cracked armour, silence ward, Determination) go to Misa on the board.

## 10. Bots and the gate run

- **The guests** (`raid-roster`, the dev tool that adds simulated players) get v2 talents and a Knack by a fixed rule (the lab's casual player: the first Knack its form knows), and between stages replace their knocked-out creatures from their spares.
- **`raid-weekend`**, a new dev tool, runs a whole v2 weekend on the real scheduler: it moves the dev clock to stage 1, stage 2 and the finale in turn, the guests swap between stages and one guest sends a swap request. The finale plays live, so Misa can watch it.
- **A worker test** plays the same weekend in vitest (seeded world, flag on): the automatic half of the gate.

## 11. Order of the work

Each slice is a few coherent commits on the phase 4 branch, reviewed by the lead; parallel implementers work in their own worktrees.

1. **Engine:** stages with a carry, board events, the live actions, the track's boss in `resolve/`; the CPU measure. Digest identical.
2. **Storage and the flag** (beside slice 1): the flag and `/api/config`, the migrations, saving a Knack, the v2 Talent Book (learn, swap, evolution's replacements), `combat-v2-convert`, `knack_set` and `talent_learn`.
3. **The raid on v2** (after 1 and 2): the week from the track, the new calendar, the stages and the carry, the live finale, settle, the track's update, swap requests, the dispatcher, the other analytics events, the read checks.
4. **The dungeon on v2** (after 1 and 2).
5. **The client:** the Knack picker and the creature page (after 2); the board, the boss card and playback (after 1 and 3); swap requests; How to play; the icons.
6. **The gate:** the guests, `raid-weekend`, the worker test, then a weekend on staging when Misa asks for the deploy.

## 12. Not in phase 4

The gear model and gear's effect lines (lab follow-up, then the port); weather in v2 fights; the readiness forecast; balance and the journey simulator (phase 5); the Valley Games on v2; anything for production (the flag stays off there until phase 8).

## 13. Questions for Misa

1. **Joining after stage 1.** Today a player can join the raid until the finale. Under v2 the boss's weekend HP is set by the players at stage 1. Proposal: a late player may still join into empty slots, and the boss's HP does not grow. Alternative: joining closes at stage 1.
2. **Weather in v2 fights.** Proposal: Boons and Omens do not touch v2 fights on staging until the lab has measured them (phase 5). Alternative: keep today's weather effects and measure later.

## 14. Progress

| Slice                         | State                                                                                                                                                                                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan                          | Done (2026-11-02).                                                                                                                                                                                                                                                                           |
| Slice 2: storage and the flag | Done (2026-11-02), on its own branch: the flag, migrations 50 and 51, known Knacks, saving a Knack, the v2 Talent Book (learn, slot, role-change replacements), `combat-v2-convert`, `knack_set` and `talent_learn`, the read checks. Decision `2026-11-02-combat-v2-storage-phase-4-slice`. |
