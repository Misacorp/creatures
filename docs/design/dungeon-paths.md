# Dungeon paths: a daily map with camps and a pack

Status: **shipped** (PR #32), by 2026-10-18; weather and gear in rooms came with PR #35. It replaces the fixed three-room run of `daily-dungeon.md`. Everything there that is not changed here still holds: one run a day (the game day from 13:37), the row of three acting left to right, foes, floor bosses and room modifiers, depth and landmarks, the streak, treats, weather, the first-day retry, the saved team. Misa asked for it on 2026-10-17 ("a Slay the Spire style gameplay loop, where players can push on and make intermittent choices on where to go"). His earlier notes are in `player-agency.md`, section 1. The research is summarised at the end.

## Terminology

Player text and code use these words differently. Player text:

- A **room** is one encounter on a map: a fight, elite, mystery room, cache, camp, door, epic fight or boss.
- A **floor** is the whole set of rooms at one depth. The day's map is one floor; each Undercroft level is another floor below it ("Undercroft 1"). Going down is "going down a floor".
- Each floor ends in its own **floor boss**. The Undercroft's floor boss was called the "keeper" in this doc and in the code; players never see that word.
- Progress along a path counts rooms: "Room 3 / 7", "Undercroft 1 · Room 2 / 4", "Room 7 / 7, floor boss".

In code and below, the old words stay (they are in stored run state and the API): `floor` is a row (step) of a map, `floors` the number of steps of a map, and `level` an Undercroft floor (1 to 3; 0 is the day's map). `keeper` (`isKeeper`, `openKeeperChest`, the `uc-keeper` workbench stage, `fixtures/dungeon-act-keeper.json`) is the Undercroft floor boss. Where this doc says "floor" in a node id or a rules key, it means the row.

## The loop in one paragraph

Every day the server draws one **map** for the whole server: the day's map is one floor, with seven rows of rooms from an entrance to a floor boss, two or three rooms in most rows and paths between them. Everyone on the server sees the same map ("same map, different dice"). A player picks a team of three as today and enters. At each step they tap one of the rooms the path allows. A **fight** plays out at once on the server and the client shows it as today. An **elite** is a fiercer fight that also gives a **keepsake** (a buff for the rest of the run). A **mystery** room is a small event with a choice. A **cache** is free loot. Halfway, every path meets at the **camp**: rest, swap a creature, or take a keepsake, and then **push on or head home**. Loot found on the way goes into the **pack**. Heading home keeps the whole pack. A defeat keeps half of it. Beating the floor boss keeps everything, opens the boss chest and goes one depth deeper.

## Why this shape

- **Short.** A path has 3 to 6 fights including the boss. A fight plays in about 20 to 25 seconds, so a run takes 3 to 5 minutes.
- **One real gamble, at a visible point.** Before the camp the player is planning a route (which foes suit my team, do I take the elite?). At the camp they face the real gamble: the pack so far against the three rooms beyond, the boss chest and a depth. This is Misa's "push on or come home safely".
- **No feel-bad zero.** A defeat never loses everything. Experience and the supply are always safe, and half the pack comes home. Today a lost run keeps what its cleared rooms paid, so a defeat costs a little more than today. Heading home costs less: the player keeps everything found.
- **An answer to the depth wall.** A player stuck at a depth used to watch the same loss every day. Now they take the gentle route, bank at the camp and go home with a full pack. The depth waits for a better team or better weather.

## The map

`DungeonMap` is pure data. It comes from `generateDungeonMap(rng, content)` in `packages/game/src/rules/dungeon-map.ts`.

- **Floors 0 to 6, lanes 0 to 2.** A node id is `f<floor>l<lane>`, for example `f2l1`.
  - Floor 3 is the **camp**, a single node in lane 1.
  - Floor 6 is the **floor boss**, a single node in lane 1.
  - Floors 0, 1, 2, 4 and 5 have **2 or 3 nodes** each. Each floor has a 35% chance of 2 nodes. When a floor has only 2, the lane left out is 0 or 2.
- **Edges** go from a node to nodes on the next floor whose lane differs by at most 1.
  - Every node on floor 0–1 and 4–5 has 1 or 2 exits.
  - Every node except the floor-0 nodes has at least one way in.
  - Floor-2 nodes lead only to the camp. The camp leads to every floor-4 node, and every floor-5 node leads to the boss.
  - Edges never cross: if a→c and b→d with lane(a) < lane(b), then lane(c) ≤ lane(d).
  - Generation: start from all allowed edges, then drop random edges while the rules still hold, until each node has at most 2 exits.
- **Node kinds:** `fight | elite | mystery | cache | camp | boss`.
  - Floor 0 is all `fight`.
  - Floors 1, 2, 4 and 5 roll each node: fight 55%, mystery 25%, cache 10%, elite 10%.
    - Elites can only be on floors 2, 4 and 5, at most one per floor and at most 2 per map.
    - At least one elite per map: if none rolled, one fight on floor 2 or 4 becomes an elite.
    - Caches: at most one per map.
    - Mysteries: at least one and at most 3 per map.
    - Two nodes on the same floor joined to the same node above cannot both be a cache or both be a mystery. This keeps exits different, as in Slay the Spire.
  - Each kind's percentage lives in `RULES.dungeon.map`.
- **What a node holds:**
  - A `fight` or `elite` holds a normal foe id and a room modifier id.
    - The same foe is not used twice on one floor.
    - All of a map's fights together use at least 3 different elements.
  - A `mystery` holds an event id (no event twice on a map).
  - The `boss` holds a floor boss id and a modifier id. At a landmark depth the player's run uses the landmark boss instead (`landmarkBossId`), as today, and the player's view of the map shows it.
  - `camp` and `cache` hold nothing.
- **The same for everyone on the server.** The map is drawn from the day's seed (`dungeon_days.modifier_seed`, drawn with crypto on the day's first look), stream `<seed>:map`. Showing it before the run is safe: it decides only what is where, never a fight's dice. Every fight's seed is a fresh crypto draw at the moment the player steps into the room, as today. The map is stored in `dungeon_days.map_json` once it is drawn, and copied into each run at its start, so a content change during the day never changes a running map.

## Rooms

- **Fight:** a normal foe at the player's depth (`scaledFoe`) with the room's modifier, folded as today (`buildRoomInput`).
- **Elite:** a normal foe at the player's depth with `RULES.dungeon.elite` on top (HP +40%, Attack +20%), shown as "Fierce <foe name>". It plays the foe's normal rounds. A clear gives its pack loot and a random keepsake, drawn with live randomness at the moment of the clear.
- **Floor boss:** as today: 8 rounds, the enrage, and the signature move at a landmark.
- **Between-room rest** (the gear line, Sunny Nap and Hearth warmth) heals as each fight starts, except the run's first fight. Rooms that are not fights do not trigger it.
- **A lost fight ends the run** (the foe survives its rounds or every creature is knocked out). That is a **defeat**.
- **Knocked-out creatures stay out** until the camp (Swap) brings a fresh one in.
- **Experience (changed 2026-10-21, B-028):** each creature that stood in the row for a room earns that room's amount, by kind (`RULES.experience.dungeon`: `fight` 32, `elite` 48, `epic` 58, `keeper` 58, `boss` 105, `cache` 10). A cache pays a little and less than a fight, a mystery room pays through its own `xp` effect, a lost fight pays nothing, and the old separate full-clear bonus is folded into the boss's amount. The run keeps each creature's own earnings (`RunState.earned`), so a creature sent home at a camp keeps what it had and one swapped in earns only for the rooms after. Treats and the day's Boons and Omens multiply the total once, at the end; a creature swapped in cannot be treated. The end screen recaps every creature that earned any (`DungeonRewards.recap`).
- **Supply:** as today, the first fight cleared drops the run's supply (the tier is rolled by depth). It is **safe**: it never goes into the pack.

## Mystery rooms (events)

Content: `packages/game/src/content/data/dungeon-events.json`, with its schema in `dungeon-schema.ts`.

- Each event has `id`, `name`, `text` (the scene, at most 160 characters) and exactly **two options**.
- Each option has a `label` (at most 24 characters), a `description` (the exact outcome, at most 90 characters, shown before the player picks) and `effects`.
- At least one option of every event costs nothing.
- **Effects:**
  - `pack {bait?, essence?, scrap?}`: loot into the pack.
  - `heal {bp}`: standing creatures recover bp/10000 of their max HP.
  - `hurt {bp}`: standing creatures lose bp/10000 of their max HP, never below 1.
  - `keepsake {}`: a random keepsake the run does not have.
  - `gamble {chanceBp, win: Effect[], lose: Effect[]}`: rolled with live randomness when picked; the description states the odds.
  - `nothing {}`.
  - `treasure {}`: takes the treasure the room rolled when the player stepped in (see "The Blue Chasm"). One per event.
  - `fall {}`: the whole team falls (HP 0) and the run ends as a defeat. It counts as a cost for "an option that costs nothing".
- **Rare events:** an event may carry `rare: {chanceBp, fromDepth}`. A rare event is **never drawn onto a map**. Each time a run steps into a mystery room it may turn into a rare event (`rollRareEvent`: `chanceBp` drawn live, once the run's depth is `fromDepth` or more, each rare event at most once a run). The map and the other players are not affected: it is the player's own dice.
- **8 common events and 2 rare ones** in the game's voice. Read `docs/compendium/` first and add the events to `docs/compendium/dungeon.md`.
- The odds of every gamble are shown ("2 scrap, or a 40% chance every creature loses 15% HP"). Risky options are worth about the same as safe ones on average, so neither is always right.

### The Blue Chasm (the rare room, 2026-10-21)

"A narrow wooden plank crosses a bottomless chasm whose walls are lined with pale glowing crystals. There's a valuable treasure on the other side." **Cross the plank**: 50% the team crosses and takes the treasure, 50% the whole team falls and the run ends as a defeat (half the pack kept). **Don't risk it**: nothing happens.

- **Rarity:** each mystery room a run steps into becomes the chasm with 15% (`chanceBp: 1500`), from depth 3, at most once a run: about one run in six to seven that walks a mystery room at depth 3 or more. Content: `rare` on the event; the odds of the crossing are the gamble's `chanceBp` (5000).
- **The treasure** is rolled when the room opens (`rollTreasure`, live gear rng), stored in the run's pending state and shown in the room before the choice (a gear piece as its full item card, tap or hover, no Equip: the rolled item is the one a won run grants). One kind is drawn evenly among those that apply to the player:
  - an **Epic gear piece** at the item level of the run's depth (`rollDungeonItem`), tagged with the element of one team creature;
  - a **blueprint** the player does not know, one tier above their best (a base's tier is its `minItemLevel`: 1, 5, 10, and the gear sets' 12; the nearest unknown tier above the best known one, else the highest unknown one); only when they lack one;
  - **two great supplies** of one kind (never a lure);
  - **6 shards** (two per creature of a team of three, by its element) and **4 glimmer** (`RULES.dungeon.treasure`).
  - A creature of a species the player lacks is not in the table yet: granting a creature from a run needs its own grant path (collection rules, talents, server firsts) and is a follow-up.
- **Delivery:** a won treasure is kept in the run state (`treasures`) and paid at the run's end through the run's own grant (`dungeon:<day>:<attempt>`), so a replay pays nothing twice. It is part of the pack in spirit: a run that ends in a defeat (the fall, or any later one) **does not win it** (an item cannot be halved). Heading home, a clear, or a run left open and closed pays it. The end screen shows it as finds (gear, blueprint, supplies, parts) and says when it was lost.
- **Old runs:** a run saved before this change has no `treasures` or `rare` list and loads as having none.

## Keepsakes (run buffs)

Content: `packages/game/src/content/data/dungeon-keepsakes.json`.

- Each keepsake has `id`, `name`, `description` (one plain line, the exact effect, at most 90 characters) and `effects`, using the **room modifier effect schema** (`team_stat`, `foe_stat`, `team_crit`, `foe_gimmick` is not allowed).
- It lasts until the run ends and folds into every later fight exactly as a modifier does (`DungeonRoomSpec.keepsakes`). An HP keepsake raises max HP; carried HP is not raised by it.
- **About 8 keepsakes:**
  - all creatures Attack +12% and HP +12%;
  - crits +5 points;
  - one per element, that element's Attack +25%;
  - foe Attack −10%;
  - foe HP −10%.
- A run cannot hold the same keepsake twice.
- Keepsakes come from elites, the camp and some events. A run usually ends with 1 to 3.

## The camp (checkpoint)

When the run reaches the camp, the player picks **one** of these. They may also reorder the row for free: the row sits on the same board as the dungeon entry (drag a creature onto another; a tap opens the creature's popover and never moves it, 2026-10-21), with each creature's current HP under it. The order goes along with the choice in the same act; there is no separate reorder step.

- **Rest:** standing creatures recover `RULES.dungeon.camp.restBp` (40%) of max HP.
- **Swap:** one creature in the row (knocked out or not) goes home. One of the player's other creatures, not already in the row, takes its place at full HP. Its stats and gear are loaded at that moment and frozen for the rest of the run.
- **Keepsake:** choose one of two keepsakes. The two are drawn with live randomness when the camp is reached and stored, so reloading does not reroll them.

Or the player **heads home**: the run ends there and keeps the whole pack.

## The pack (push your luck)

- **Into the pack:** the Bait, Essence and scrap that fights, elites, caches and events give.
- **Safe:** experience and the run's supply.
- **How a run ends:**
  - **Cleared** (the boss is beaten): the run keeps the whole pack and the boss chest, and goes one depth deeper (+1).
    - The boss chest is what today's full clear pays: the boss room's Essence and scrap, the shard chance, the gear chance (certain at a landmark) and the landmark extras.
  - **Home** (from the camp): the run keeps the whole pack. Depth is unchanged.
  - **Defeat:** the run keeps **half the pack**, each amount rounded **up** (1 Bait stays 1, 3 scrap becomes 2).
    - Rounding up is generous on purpose: an early defeat in a small run costs almost nothing, and the loss grows with how much the player risked.
    - Depth is unchanged.
  - **Left open** (the day ended with the run still open, for example the player closed the app): closed the next time the server looks at that player's dungeon, or at the guild alarm. A run resting at the camp with its choice pending closes as **home** (the player could have headed home there); anywhere else it closes as a **defeat** (half the pack). Otherwise quitting the app would be a free safe exit at every step and the camp's choice would mean nothing. Experience and the supply earned are paid either way.
- **Loot per room** (`RULES.dungeon.loot`). B-024 (Misa, 2026-10-20): a full clear of the main map pays about 1.5 crafts of parts (about 10 scrap and 1.4 shards on the safe path) and one gear piece, and the choices pay more:
  - fight: Bait 1, scrap 1, and a 15% chance of a shard of its foe's element (elite 40%, epic fight 60%, floor boss and Undercroft keeper a sure one; `RULES.dungeon.shardBp`); shards are in the pack and at risk like the rest;
  - elite: Bait 1, scrap 4, and a keepsake;
  - cache: Bait 1, scrap 3;
  - mystery: by option (the safe option 1 to 2 scrap, the risky one about 1 to 3 scrap more on average);
  - boss chest: Essence 1, scrap 3, a sure shard of the boss's element, a gear piece on every full clear (`fullClear.gearBp` 10000; landmark extras as before);
  - Market Day: +1 scrap for each fight cleared, as today.
- **The streak, the first-day retry and treats** are unchanged. Any finished run, home included, counts for the streak. The first-day retry opens only after a **defeat** in the player's first run.

## The Undercroft (deeper, optional floors)

Misa, 2026-10-18: runs should grow longer as players progress (more rooms mean more experience and loot), but by the player's choice, so the daily run never gets too long for anyone who does not want it. The deeper area must say it is harder, and a rare roll can open yet another one. The expeditions already say "deeper area", so this is the **Undercroft**.

- **Unlocked** after the first landmark, from depth 8 (`RULES.dungeon.undercroft.fromDepth`).
- **The descent.** When the floor boss falls, the run is cleared: depth +1 is locked in, and the boss chest opens.
  - The chest's gear and supply are banked at once.
  - Its Bait, Essence and scrap go into the pack.
  - Then the player chooses: **head home** with everything, or **descend into the Undercroft**.
  - On the way down, standing creatures catch their breath (`catchBreathBp`, 20% of max HP) and knocked-out creatures get back up at `reviveBp` (10% of max HP, at least 1 HP). The history entry says how many got up (`revived`). Misa's call, 2026-10-18 (B-021): try it, unless it makes going deeper too easy. It does not: more rows go down, and fewer of them clear the first floor boss.
- **It is harder, and says so.** Undercroft foes are scaled as if the depth were higher (`depthBonus`, +1; it was +3 at first, but the floor boss then stood five times in six, so the simulator's tuning lowered it, see `docs/balance/log.md` B-020), and the run strip says "Foes are fiercer here" while the map and the room banner name the floor "Undercroft 1".
- **Its length grows with landmarks:**
  - 2 steps along the path (rows in code), plus 1 for every landmark passed after the first, at most 5 (`baseFloors`, `perLandmark`, `maxFloors`). The player counts them as rooms: "Room 2 / 4".
  - Then the **Undercroft floor boss** (`keeper` in code): a floor boss at the Undercroft's depth, with its landmark signature.
  - Each of those steps has 2 rooms side by side. A carved door's room gets a step of its own.
  - Its map is drawn with live randomness when the player descends (it is the player's own, not the server's), and it is stored with the run.
- **Carved doors add a room.** From depth 8, the main map may hold one **carved door** on floor 4 or 5, at most one per map (`doorBp`, 35% of maps). It is a room with no fight, and the player does not choose anything there.
  - Stepping through resolves at once, like a cache. It adds ONE room to the first Undercroft floor, of a kind drawn with live randomness at that moment: a fight, a fierce foe (elite), a mystery, a cache, a camp or an epic fight, never a boss (`markOdds`: fight 30, elite 15, mystery 15, cache 10, camp 15, epic 15).
  - The player is told only what it could be ("A carved door. Step through to add one room to the first Undercroft floor: a fight, a fierce foe, a mystery, a cache, a camp or an epic fight."), and the history says only that a room was added. Which kind shows when the Undercroft is drawn on descent.
  - The added room is a row of its own with one room, before the floor boss (camps last: a rest before the floor boss). A run holds at most `maxMarks` (2); past it the door adds nothing and says so. Only the first Undercroft takes marks; a deeper floor has its own two rooms.
  - The room only counts if the player descends. Below depth 8 a door is a quiet room: its view is a mystery room named "Quiet room" (no scene), and nothing happens in it.
  - The room kinds of an added room: **an epic fight** (one fierce foe at boss strength, paying Essence 1, scrap 5 and a keepsake), **a camp** (rest, swap or a keepsake, and the only place in the Undercroft to head home), or any other kind, which plays as on the main map (fights, elites and caches there pay double).
- **Loot.**
  - Undercroft fights put twice their usual loot into the pack.
  - Every fight there pays experience as usual.
  - The Undercroft floor boss's **Undercroft chest** is better: Essence 2, scrap 7, and an 80% gear chance with better rare and epic odds and +2 item level.
  - There is no extra depth: depth moves only by the main boss.
- **No guaranteed camp below** (Misa, 2026-10-18). A camp in the Undercroft comes only from a carved door (about 5% of descents), so a descent is close to all-in. The layout and its odds are kept as design space for future gear lines, after the gear branch in progress merges.
- **Risk.** The pack, now holding the boss chest's currencies, stays at risk all the way down:
  - A defeat keeps half of it, rounded up.
  - Heading home is only possible from an Undercroft camp, or before descending.
  - A run left open in the Undercroft closes as a defeat unless it rests at a camp.
- **A cracked floor (rare).** When an Undercroft map is drawn, 15% of the time (`crackBp`) its floor boss's room shows a **cracked floor**. Beating that floor boss offers another descent, down to another Undercroft floor:
  - its foes are fiercer again (`depthBonus` more depth, +1);
  - it has 2 rooms and its own floor boss and chest;
  - there are at most 3 Undercroft floors in a run.
- **Client.**
  - After the boss, a descent card: what is banked, what stays at risk, "foes are fiercer", and two buttons.
  - The Undercroft map continues below the main map's boss, in a darker palette with a band labelled "Undercroft 1".
  - A carved door's drawer says what stepping through could add (the six kinds). Stepping in shows one line ("a room was added"), never which.
  - The results show how deep the run went ("1 Undercroft floor cleared").
- **Simulator.**
  - The policy descends when the team is healthy enough after catching its breath (average HP over 50%; the fallen are already back up).
  - It draws doors (`{ doors: true }`) and takes one on its route (it costs no fight). The door's room is drawn when stepped through, not chosen.
  - At Undercroft camps it heads home under the main camp's rule.
  - The targets must still hold, and the experience and gear targets are watched closely.
  - The numbers above are starting values for the tuning.

## Server (authoritative)

- **Migration 34** (32 and 33 went to the raid's `placed_by` and the lounge message on `main`; the migration checks each step and adds what staging skipped, because staging ran it as 32 and then 33 first):
  - `ALTER TABLE dungeon_runs ADD COLUMN status TEXT NOT NULL DEFAULT 'done'` (`'active' | 'done'`), `ADD COLUMN state_json TEXT` and `ADD COLUMN outcome TEXT` (`'cleared' | 'home' | 'defeat'`, null for old runs).
  - `ALTER TABLE dungeon_days ADD COLUMN map_json TEXT`.
  - `CREATE TABLE dungeon_steps (run_id TEXT NOT NULL, step INTEGER NOT NULL, idempotency_key TEXT NOT NULL, act_json TEXT NOT NULL, node TEXT, seed TEXT, input_json TEXT, result_json TEXT, created_at INTEGER NOT NULL, PRIMARY KEY (run_id, step), UNIQUE (run_id, idempotency_key))`.
  - Old runs (status `done`, no `state_json`) still show their summary and their three-room replay.
  - The 90-day prune also empties `dungeon_steps.input_json` and `result_json`.
- **`POST /api/dungeon/start {team, treats?, idempotencyKey}`** (strict).
  - Same checks as today's run: allowance, team, treats spent with key `treat:dungeon:<runId>`.
  - Loads the team (gear and weather sheet frozen), copies the day's map and creates an **active** run at step 0, standing before floor 0.
  - Returns `{ state: DungeonRunState, today: DungeonToday }`. A retry with the same key returns the same run's current state.
  - A new start while a run is active is `409 run_active`.
- **`POST /api/dungeon/act {runId, step, idempotencyKey, act}`** (strict). `step` must equal the run's step, otherwise `409 stale_step`, and the client reloads `today`. `act` is one of:
  - `{type:'move', node}`: the node must be reachable from where the run stands, and nothing may be pending.
    - `fight | elite | boss`: draws the seed from crypto, plays the room (`simulateDungeonRoom`), stores the step with its input and result, updates HP and the pack, and ends the run on a defeat or a boss clear.
    - `cache`: adds its loot.
    - `mystery`: sets `pending = {kind:'event', ...}`.
    - `camp`: draws the two keepsake offers and sets `pending = {kind:'camp', ...}`.
    - `door`: from depth 8, draws a mark and records it (nothing is pending; below depth 8 it is a quiet room).
    - `epic`: an Undercroft room played as a fight.
    - The node id may be an Undercroft node (`u1f0l0`).
  - `{type:'event', option: 0|1}`: resolves the pending event.
  - `{type:'camp', choice:'rest'|'swap'|'keepsake', order?: [id,id,id], out?, in?, keepsake?}`: resolves the pending camp.
    - `order` is a permutation of the row **as the choice leaves it**, applied after the choice and free (no HP, gear or other change). For Rest and Keepsake that is the row as it stands. For Swap it is the row after the swap: it holds `in` and not `out`, so the creature that comes in can stand in any place in the same act. Anything else (an unknown or repeated id, the creature that left, the wrong length) is `invalid_act`/`invalid_body` and changes nothing. Downed creatures may stand anywhere and stay down. A retry with the same key returns the stored answer.
    - `swap` needs `out` (in the row) and `in` (the player's own creature, not in the row).
    - `keepsake` must be one of the two offers.
  - `{type:'home'}`: only while a camp or the descent card is pending. Ends the run: `home` before the main boss was beaten, `cleared` after it.
  - `{type:'descend'}`: only while the descent card is pending (see "The Undercroft on the server" below).
- **Act responses:**
  - Each act returns `{ state, room?: DungeonReplayRoom, summary?: DungeonRunSummary, today? }`.
    - `room` is the fight just played, in today's replay shape, so the client plays it at once.
    - `summary` and `today` come only when the run ended.
  - A retry with the same key returns the stored response of that step. Store it in `act_json` with the act, or rebuild it.
- **Ending a run** happens in one transaction:
  - set `outcome`, `cleared`, `rooms_cleared` and `status='done'`;
  - pay the kept pack, the boss chest and the supply through `grantDungeonRun` (ledger keys unchanged: `dungeon:<day>:<attempt>...`);
  - pay experience per creature;
  - pay the streak bonus;
  - update depth and progress;
  - write `summary_json` and `rewards_json`;
  - log analytics.
  - The pack and experience accrue only in `state_json` until then.
- **`GET /api/dungeon/run/:id`** returns the replay of every fight played so far, in order. It works for active runs, and for old runs as today.
- **`GET /api/dungeon/today`:**
  - **New fields:**
    - `map: DungeonMapView`. It shows the player's depth: foe HP at that depth, elite flags, and the landmark boss when the depth is a landmark.
    - `active: DungeonRunState | null`.
  - **Kept:** `modifiers`, filled from the boss and the first fight for old clients; the new client ignores it.
  - `canRun` is false while a run is active.
- **`POST /api/dungeon/run`** answers `410 gone` (old clients).
- **Analytics:**
  - `dungeon_run` gains:
    - `outcome`;
    - `path`, the node kinds in order;
    - `keepsakes`, their ids;
    - `campChoice`;
    - `elites`, how many cleared;
    - `packKept` and `packFound`, as totals.
  - New events: `dungeon_event {event, option, won?}` and `dungeon_camp {choice}`.
  - Content ids and numbers only. The privacy scan covers them.
- **Dev tools:**
  - `dungeon-reset` also deletes the day's active run and its steps.
  - New `dungeon-map {seed?}`: rerolls today's map for the guild by redrawing the day seed. `dungeon-seed` already does this; make sure it clears `map_json`.

### The Undercroft on the server

- **Rules** (`RULES.dungeon.undercroft`, `packages/game/src/rules/dungeon-map.ts`, `dungeon-run.ts`): `fromDepth 8`, `catchBreathBp 2000`, `reviveBp 1000`, `depthBonus 1` (3 at first: the keeper stood five times in six, B-020), `baseFloors 2`, `perLandmark 1`, `maxFloors 5`, `deeperFloors 2`, `maxMarks 2`, `lootMultiplier 2`, `crackBp 1500`, `maxLevels 3`, `epic {hpBp 16000, atkBp 13000, loot {0, 1, 5}}`, `chest {essence 2, scrap 7, gearBp 8000, rareBonusBp 1500, epicBonusBp 500, itemLevelBonus 2}`, `doorFloors [4, 5]`, `doorBp 3500`, `markOdds`.
  - The first Undercroft has `min(maxFloors, baseFloors + perLandmark x (landmarks passed - 1))` floors of two rooms, where the landmarks passed by a run at depth d are `floor((d - 1) / 7)` (depth 8 to 14: 2 floors, 15 to 21: 3, up to 5), plus one floor for each mark, plus the keeper's floor. A deeper level has `deeperFloors` floors plus the keeper, and no marks.
- **The main map's door** is drawn last in `generateDungeonMap`, only when the caller asks (`{ doors: true }`: the server and the simulator both do), so a map without a door is the map it was before doors: a fight on floor 4 or 5 becomes a `door` node (no foe, modifier or event). `mapView(map, depth)` shows it as `door` at depth 8 and over, and as a `mystery` node with no event below it.
- **Undercroft maps** come from `generateUndercroftMap(rng, {level, floors, marks})`: node ids `u<level>f<floor>l<lane>`; rows of two rooms in lanes 0 and 2 that lead straight up their lane (the first floor is all fights, the rest roll like the main map's rooms with caps of 2 elites, 1 cache and 2 mysteries per level, none beside its mate); a floor of one room (lane 1) for each mark (camps last); the keeper alone on the last floor (a floor boss, its own foe whatever the depth, with its `signature` on). `crack` is drawn last with `crackBp` (never on level `maxLevels`). `undercroftMapValid` checks it.
- **Rooms.** Foes there are scaled at `depth + depthBonus x level`. An epic room is a normal foe with `epic` on top (stronger than an elite), shown as `elite: true` with `epic: true`.
- **The boss clear at depth 8 and over** (main boss, or a keeper with a crack and levels left, and someone standing):
  - Main boss: `cleared`, depth + 1 is written to `dungeon_progress` at once (`MAX`, never lowered, so a later defeat or a left-open close cannot undo it), and the chest opens: its gear, shard, landmark glimmer and supply are paid now under the grant key `dungeon:<day>:<attempt>:chest`; its Essence and scrap (the boss's, the full clear's, a landmark's) go into the pack.
  - Keeper: its gear (`rollUndercroftChest`) is paid under `dungeon:<day>:<attempt>:u<level>`; its Essence and scrap are already in the pack (the keeper's room pays them).
  - Then `pending = {kind:'descend', level}` waits. `{type:'descend'}` draws the level with live randomness, heals standing creatures `catchBreathBp`, gets knocked-out ones back up at `reviveBp` (the log entry's `revived` counts them) and stands the run before the new map's floor 0. `{type:'home'}` ends the run as `cleared` and keeps the whole pack.
  - A keeper without a crack (or the deepest level, or nobody standing) ends the run as `cleared`. A main boss below depth 8 ends it as before (the chest is paid with the run).
- **The end of such a run** pays the pack through the ledger under the usual keys `dungeon:<day>:<attempt>:bait|essence`, scrap and anything else through the grant `dungeon:<day>:<attempt>`; what the chests paid on the way is added to the summary's rewards and not paid again. Experience: the full-clear bonus is for the row that beat the main boss, whatever happens below.
- **Outcomes.** `outcome` stays `cleared | home | defeat`. A run that beat the main boss ends `cleared` when it heads home or is closed at a safe point, and `defeat` when it is lost below (half the pack, rounded up; its summary still has `cleared: true`, and the depth stays). `deepest` counts the Undercroft levels cleared (keepers beaten).
- **Left open:** a run waiting at a camp or the descent card closes with the whole pack (`home` before the main boss, `cleared` after it); anywhere else it closes as a defeat.
- **Analytics:** `dungeon_run` gains `deepest` (number) and `marks` (room kinds the door added); new `dungeon_descend {level}`. `path` may be up to 24 kinds. Content ids and numbers only.

### The Sealed Vault (the second rare room, 2026-10-22)

"A round stone door, sealed with grey wax and old rope, stands in the wall. Something heavy shifts behind it." **Break the seal**: the next fight you enter is epic: a tougher foe, epic experience and double rewards. **Leave it sealed**: nothing happens. Misa's idea; it is the first room that changes a later room.

- **Rarity (Misa's rule: the more drastic a room, the rarer, and each drastic room at most once a run).** Medium-drastic: `rare: { chanceBp: 2500, fromDepth: 1 }`, so each mystery room a run steps into becomes the vault one time in four (tried after the Blue Chasm's own draw), at most once a run (`rareSeen`). It is never drawn onto the day's map. A mystery room with no fight on any path ahead (only the floor boss) never turns into it (`rareEventsAt`), because it would do nothing.
- **Which rooms are marked** (`sealTargets`, `rules/dungeon-seal.ts`, run when the seal is broken): the fights and elites among the rooms the vault leads to, all of them (branching map: two or three). If none of the next rooms is a fight or an elite (a cache, a camp, another mystery room), the nearest fight or elite on each path. A path ends at a floor boss or an Undercroft epic fight (nothing there to mark). The floor boss is never marked.
- **The mark is used up by the first marked room the run steps into** (`RunState.sealed` is cleared by `applyMove`); the other marked rooms go back to normal. A descent into the Undercroft clears it too. Marks live in the run state (`sealed`: node ids; an older run loads as none).
- **Epic fight on the floor.** The engine already has an epic tier: a normal foe scaled to the depth with `RULES.dungeon.undercroft.epic` (160% HP, 130% Attack) on top. A marked room uses that, on its own foe: `roomSpecForNode(..., sealed)`; an elite's boost is replaced, not stacked. No content change and no "strongest tier plus a fold" was needed. The spec is flagged `epic` (and `elite` for the display), so the fight, the replay and the end screen show an epic fight.
- **Rewards are doubled, server side, with live dice** (`RULES.dungeon.seal.rewardMultiplier`, 2): the room's Bait, Essence and scrap (the day's per-room scrap too) in the pack are multiplied by 2, and the room's shard chance is rolled twice (live gear rng, so up to two shards). The pack is paid by the run's own grant at the end, once (a retry returns the stored result). Not doubled: the run's supply, gear, keepsakes (an elite's keepsake stays one) and the boss chest. In the Undercroft the room's own loot doubling (x2) stacks (x4).
- **Experience:** the room pays the epic amount (`RULES.experience.dungeon.epic`, 58) in place of fight (32) or elite (48).
- **The schema:** a new plain effect `{ op: 'seal' }` (also allowed in a gamble branch). It counts as a cost for the "every event has a free option" rule (it adds danger).
- **The map badge, shared.** A map node view may carry `marks: [{ kind, text, label }]` (`RoomMark`, `rules/dungeon-seal.ts`; validated by the client parse): `text` is up to 8 characters drawn on the badge ("x2"), `label` the spoken line and the drawer's explanation. It is data, so a later effect only has to send a mark. `ui/RoomMark` draws it (gold pixel text on an ink pill at the lower right of the room's button), the room's accessible label adds the labels, and the drawer shows the badge and its line. A marked room is told as an epic fight ("Fierce Drift Wisp (epic fight)", title "Epic fight", Epic tag, foe HP with the epic boost). The fight's log entry carries `sealed: true`, so the drawer and the Rooms recap keep saying "Epic" once the mark is gone. `mapView(map, depth, marksOf)` takes the run's marks; the pre-run map has none.
- **The simulator does not play the vault** (a rare room is not on its maps), so it is unchanged by construction; the estimate is in `docs/balance/log.md`, B-029.

### Shapes (the client mirrors these by hand in `dungeon-types.ts`)

```ts
type NodeKind = 'fight' | 'elite' | 'mystery' | 'cache' | 'camp' | 'boss' | 'door' | 'epic';
interface DungeonMapNode {
  id: string; // 'f2l1', or 'u1f0l0' on an Undercroft level
  floor: number; // 0..6
  lane: number; // 0..2
  kind: NodeKind;
  next: string[]; // node ids on floor+1
  marks?: { kind: string; text: string; label: string }[]; // badges the room wears (the Sealed Vault's "x2")
  foe?: {
    id: string;
    name: string;
    element: Element;
    kind: 'foe' | 'boss';
    hpMax: number;
    elite: boolean; // an elite or an epic fight
  };
  modifier?: { id: string; name: string; description: string };
  event?: { id: string; name: string }; // the scene and options appear only once the player is in the room
}
interface DungeonMapView {
  floors: number;
  nodes: DungeonMapNode[];
  // An Undercroft level only (absent on the main map):
  level?: number; // 1..3
  label?: string; // 'Undercroft 1' ('Undercroft 2' below a cracked floor)
  crack?: boolean; // the keeper's floor is cracked (only present when true)
}
interface DungeonPack {
  bait: number;
  essence: number;
  scrap: number;
}
interface DungeonRunCreature {
  id: string;
  name: string;
  speciesId: string;
  element: Element;
  role: Role;
  level: number;
  hp: number;
  hpMax: number;
  treat: boolean;
}
interface DungeonKeepsakeView {
  id: string;
  name: string;
  description: string;
}
interface DungeonEventView {
  id: string;
  name: string;
  text: string;
  options: { label: string; description: string }[];
}
interface DungeonRunState {
  id: string;
  day: string;
  attempt: number;
  depth: number;
  landmark: boolean;
  status: 'active' | 'done';
  outcome: 'cleared' | 'home' | 'defeat' | null;
  step: number;
  map: DungeonMapView; // the day's main map (always)
  level: number; // 0 on the main map; 1.. in the Undercroft (the last of undercroft.maps)
  undercroft: { maps: DungeonMapView[]; marks: number } | null; // levels drawn so far; marks = rooms the door added (not which); null with neither
  at: string | null; // the node the run stands on (null before floor 0 of the main map or of a new level)
  path: string[]; // nodes visited, in order
  reachable: string[]; // nodes a move may go to now (empty while something is pending or the run is done)
  pending:
    | null
    | { kind: 'event'; event: DungeonEventView }
    | { kind: 'camp'; offers: DungeonKeepsakeView[]; restBp: number }
    | {
        kind: 'descend'; // head home ({type:'home'}) or go down ({type:'descend'})
        level: number; // the level it opens (1, or 2 and 3 after a cracked floor)
        floors: number; // its floors, the keeper's included
        depthBonus: number; // foes are this many depths harder per level
        catchBreathBp: number; // HP the standing creatures recover on the way down
        reviveBp: number; // HP a knocked-out creature gets back up with on the way down
        newDepth: number; // the player's depth now (locked in)
        banked: {
          gear: { baseId: string; rarity: string; itemLevel?: number }[];
          supplies: string[];
          parts: Record<string, number>;
        }; // already paid
      };
  team: DungeonRunCreature[]; // the row now, left to right
  keepsakes: DungeonKeepsakeView[];
  pack: DungeonPack; // at risk
  roomsCleared: number;
  supply: boolean; // the safe supply is earned
  lastEvent: { name: string; option: string; outcome: string } | null; // the plain line of what the last event did, until the next move (a move clears it)
  history: DungeonStepLog[]; // one entry per visited room, see dungeon-types.ts
}

// New history entries of the Undercroft (the full union is in apps/worker/src/dungeon-types.ts):
//   { node, kind: 'door', result: 'door', added: boolean }                    // which room it added is NOT said
//   { node, kind: 'boss', result: 'chest', level, loot, gear: {baseId, rarity, itemLevel?}[] } // level 0: the main boss's
//   { node, kind: 'descend', result: 'pending' | 'home', level }
//   { node, kind: 'descend', result: 'descend', level, healed, revived? }
//   fight entries may be of kind 'epic'
// The summary gains `deepest: number` (levels cleared) and `route.undercroft?: DungeonMapView[]`.
```

## Client

Reuse what exists: the pre-run card, the team board, `DungeonPlayback`, `Drawer`, `GlossaryTag`, `CountItem`, `RevealShell`, `LootList`, `TeamBreakdown` and `StreakTrack`.

- **The map (`DungeonMap.tsx`):**
  - A vertical map, the boss at the top and floor 0 at the bottom, drawn in one SVG layer for the paths with round node buttons (at least 44 px) on top.
  - Each kind has its own icon: crossed blades for fight, a horned skull for elite, `?` for mystery, a chest for cache, a campfire for camp, a crown for boss. Fight and boss nodes are tinted by the foe's element.
  - Nodes the run can reach glow, and their paths are bright. Visited nodes are filled and the path taken is drawn in gold. Other nodes are dimmed.
  - It fits a 390 px-wide phone without sideways scrolling.
  - Tapping any node opens a `Drawer` with what is there:
    - fight, elite or boss: the foe sprite (`bossArt`), name, element tag, trick, modifier tag and foe HP;
    - mystery: "Something stirs. You'll see when you step in." and the event's name;
    - cache: "Free loot";
    - camp: its three choices and "head home".
  - When the node is reachable the drawer has a primary **Go** button.
- **Before the run:** the pre-run card shows the map instead of the three-room strip (preview only, no Go). Below it: the team board, treats and "Enter the dungeon", as today.
- **During the run** (the same tab):
  - At the top, a strip with the row (`SmallCreature` with HP bars, knocked-out ones greyed), the keepsakes as chips (tap for their text), and the pack ("In your pack: 2 Bait · 1 scrap", tagged "at risk" when it is not empty).
  - Then the map.
  - Fight: Go plays `DungeonPlayback` with just that room (the `room` from the act response), with the same banner and pacing, then returns to the map. Leaving mid-fight is fine: the state is already stored.
  - Mystery: a card with the scene and two buttons with their exact outcomes. Then the outcome line appears on the map screen.
  - Camp: a camp card.
    - The row board to reorder (the entry's `RaidBoard` in its single large row, with the HP under each creature, moving with it), above the three choices as buttons. Keepsake opens the two offers. Swap opens the `RosterPicker` for the creature to bring in, asks which to send home, then shows the row as the swap leaves it (the new creature in the place of the one that left, at full HP) to arrange before "Swap and push on". The strip above the card hides its own row at the camp, so the row is not shown twice.
    - A clear secondary-danger choice: **"Head home with your pack"**, plus a line: "Push on and you risk half your pack."
  - When the run ends: today's results screen with these changes:
    - The headline says the outcome: "Cleared! Depth 8 →9", "Home safe with your pack", "Defeated: half your pack made it home".
    - The room strip shows the rooms on the path taken.
    - The pack shows what was found and what was kept.
- **Old runs** in `today.last` (status done, no state) still show as today's summary.
- **Errors:** `run_active`, `stale_step` (reload quietly), `gone` (ask to reload the Activity), `invalid_act`. Also add the missing `invalid_treat` and `insufficient_funds`.

## Glossary and How to play

- New glossary entries: `dungeon-map`, `dungeon-camp`, `dungeon-pack`, `keepsake`, `elite`, `mystery-room`, `cache`, plus one per keepsake (`keepsake-<id>`) and one per event (`event-<id>`).
- Update the `dungeon` entry: it is now a path with a camp, played step by step, not three rooms played at once.
- The How to play "Daily dungeon" section has at most 5 lines. Its picture becomes a small map.
- Update the pinned glossary tests: `rooms === 3` goes away, and the floors, camp, pack and half-on-defeat rules get pinned.

## Simulator

- `packages/sim` plays a map day with a policy:
  - **Route:** prefer the foe whose element the team beats. Take an elite when the team's HP is over 70% and nobody is knocked out. Prefer a mystery or cache when HP is under 50%.
  - **Events:** take the costly option only above 60% HP.
  - **Camp:**
    - Swap if someone is knocked out and a fresh creature is available.
    - Otherwise Rest below 60% HP, otherwise take a keepsake.
    - Head home when two creatures are knocked out after the camp choice, or when average HP is under 35%.
    - `random`-skill players pick at random; `best` uses the same heuristic but looks one floor ahead.
- **Targets:**
  - The four dungeon targets stay.
  - Add `dungeon-home-rate` (a daily player heads home on 10 to 45% of runs from week 2), so the camp choice is real.
  - Add `dungeon-run-fights` (mean fights per run 3 to 5.5).
  - The economy targets must still hold.
- Tune the foe strength (`baseHpBp`, `elite`) and the per-room loot to meet them.

## Research summary (2026-10-17)

- **Slay the Spire** shows the whole map up front. Its floor 1 is all monsters, and there is always a rest before the boss. Elites are optional risk for better loot. Exits from one node lead to different room types. Planning happens on the map, not in the fight, which suits an auto-battler.
- **Hades** shows the reward on the door before you choose, which makes choices informed on a small screen.
- **Loop Hero** retreats keep 100% at the camp, 60% elsewhere and 30% on death. A partial loss plus a safe exit is the proven push-your-luck shape. Total loss (Dark and Darker) splits players.
- **Quacks of Quedlinburg** makes a bust cost a part, not all, and has a safety net.
- **Daily runs** (the Slay the Spire daily climb, Spelunky) use the same seed for everyone, so people can compare. Our rule (live randomness is never computable) keeps the map shared and the dice fresh.
- **Pitfalls for casual phone players:**
  - a choice that is always right;
  - total loss;
  - more than 2 or 3 options with numbers;
  - long sessions.
