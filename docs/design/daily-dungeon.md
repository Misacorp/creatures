# Daily dungeon

Status: **built** (engine, content, server, balance model and Activity UI), 2026-10-13. Numbers and choices as built: `decisions.md`, 2026-10-13, "Daily dungeon v1" and, for the single row, "Daily dungeon: one row, a constant stage and a fuller end report". Roadmap item 3.

## Idea (Misa)

A solo daily mode in which a player takes **their own team of three creatures** into a dungeon:

1. The server generates a dungeon seed and simulates the run with the player's creatures.
2. The client shows the battles and events **as if they were happening in real time**.
3. The run ends with results and rewards.

No real-time backend is needed.

## Shape

- **Once per day per player.** The day is the guild-local game day, which starts at the daily reset, 13:37 in the guild timezone (`RULES.daily.reset`; the timezone is passed explicitly). Before 13:37 it is still the previous date's game day.
- **Team:** the player picks 3 of their creatures and puts them **in one row, left to right**. The order is the only formation choice (`team[i]` is position i). The team is frozen at the run start.
  - The row is the engine's row of three, used as it is: the left creature is in the Front zone, the middle one in Middle and the right one in Back, one creature each.
  - The foe's plain attack goes for the left creature first. A Guard covers the creatures **right beside it** (`guardReach: 'adjacent'`), so it likes the middle.
  - A zone attack hits the one creature at that place; "both ends" silence hits the left and right creatures.
  - **Order of play (Misa, 2026-10-14): always left to right, then the foe.** It is `RULES.dungeon.turnOrder`, a rule of the dungeon and not content: a dungeon foe has no turn order and no room modifier can change it. The raid keeps its bosses' turn orders (left to right, right to left, by speed): a raid is one fight people prepare for, a dungeon is three changing rooms, so the dungeon stays the simple one and its modifiers are what make it interesting. Players plan their loadout and the row's order, and the dungeon rewards it (a Setter on the left marks before the creatures after it cash the mark in).
  - **The order decides whether reactions happen at all.** Marks carry on from round to round and stay on the foe until a Setter replaces one or a creature of the cashing element sets it off. Splashet, Sproutle, Cindle (a Tide Setter first) never react, because Tide marks and nobody has Spark; Cindle, Sproutle, Splashet (Cindle marks Scorched, Splashet sets off Steam) reacts every round, and the same three can swing tens of clear points by order alone. So `dungeonRowOrder` (the suggested order and the default team, also the simulator's players) picks, of the six orders, the ones that set off the most reactions under left to right (`rowReactions`: pure, from the reaction table in content), and uses the role order (setters and supports left, a Guard in the middle, payoffs right) only to break ties. The setup shows one line under the slot row for the order the player has: "Cindle marks Scorched → Splashet sets off Steam." or "In this order nobody can set off a reaction.", from the same function.
- **The pre-run choice** replaces live input, since there is none: the order of the row. (The basic ability pick and the fire rounds were removed in UX pass 1: unlocked creature abilities fire at their default round.)

- **Dungeon:**
  - A short chain of **3 rooms**, generated from the seed: two encounters, then a room boss.
  - Each room is a small fight against content-defined dungeon foes (new content type, schema-validated), with an element, gimmicks and an HP pool (no turn order: see above).
  - **Creature HP carries over between rooms**, and knocked-out creatures stay out, so order and guards matter.
  - Each room also rolls a **room modifier** from content, shown before the run: for example "Flooded: Tide +20%", "Echoing: Guards and supports +50%", "Dark: crits +5%", "Thorns: the foe turns the first reaction of each round back on your team". There are 8, three are rolled per day, all different.
  - **Any change to the normal rules must be shown before the run** (a modifier's one plain line), or, if a mystery modifier ever exists, announced in the room banner when it happens. None changes who acts when. (Fog, which set the order, was retired on 2026-10-14 and replaced by Echoing; old runs that rolled it still show its name and text.)
- **Depth ladder (personal):**
  - Each player has a **dungeon depth**, like the raid Boss Rank but personal.
  - Clearing all rooms gives +1 depth. Failing keeps the same depth.
  - Depth scales the foes with its own step, tuned by the sim.
  - Every 7th depth is a "landmark" with a better reward chest.
  - This is the "get better over time" loop of the solo mode.
- **Rewards:**
  - Per cleared room: a little Bait or Essence and **gear materials**.
  - A full clear adds a chance at a **gear drop** (see `gear.md`).
  - Landmark depths: a guaranteed gear drop.
  - Daily streaks: a small bonus on the 3rd and 7th day of each 7-day cycle (the cycle length is `RULES.dungeon.streak.cycleDays`); missing a day starts the count again, and depth is kept.
  - All payouts follow the existing ledger rules (integers, an idempotency key per (player, day)).

## Server (authoritative)

- `POST /api/dungeon/run { team: [id, id, id], idempotencyKey }` (`team` is the row, left to right; a body with `formation` or `abilities` is refused as `invalid_body`):
  1. Validates the team (the caller's own creatures; one away on an expedition or a job can still enter, because the run is instant) and that no run exists today.
  2. Draws the seed from `crypto.getRandomValues` at that moment.
  3. Generates the dungeon from the seed and the content.
  4. Simulates all rooms with the engine.
  5. Stores the input, seed and result, and pays the rewards in **one transaction**.
  6. Returns the run id.
- A retry with the same key returns the stored run.
- Because the result is final on creation, the client can show it at any pace without the server.
- `GET /api/dungeon/today` returns today's state: not run yet (with today's modifiers preview, which is safe because it is derived from a separate daily seed used only for room modifiers), or done (the run summary).
- `GET /api/dungeon/run/:id` returns the full events for playback. It is owner-only; others can see the summary on a server leaderboard later.
- **Engine needs:**
  - multi-room runs: chain `simulateFight` calls with the creatures' **current HP carried in** (a new optional `hp` per slot in `FightSlot`);
  - a solo row of 3;
  - dungeon foes as a new boss-like content kind.

  The engine stays pure. The prefix property is not needed here (no live input).

- **Tables (migration):** `dungeon_runs (user, day, depth, seed, input, result, rewards, created_at)` and `dungeon_progress (user, depth, streak, last_day)`.

## Client

- A **Dungeon** tab or card:
  - today's modifiers;
  - the team picker: one row of three slots, reusing the drag-and-drop code;
  - an **Enter** button.
- **Playback:**
  - The fight stage plays each room with the same pacing and effects as the live finale: shared `roundPlaybackMs`, telegraphs, lingering numbers.
  - **The order is visible:** the pre-run screen says "Your creatures act left to right, then the foe." under the team (a tag that opens the "Your row" glossary entry); the playback writes the acting order under each creature of the stage's row ("1st", "2nd", "3rd") and outlines the creature acting now. The stage's head reads "Room 1 / 3 · Round 2 / 2", the foe's name is under its sprite and its HP is written on the bar ("62 / 337"). Pause, 2x and Skip are hidden (`DungeonPlayback`'s `showControls`). The "Next round" forecast names the gimmick a modifier gives the foe (Thorns) as well as the foe's own.
  - **Pre-run screen:** the header is the title; under the rooms the depth progress runs from the depth now to the next landmark across the whole width, with a small pip for each depth between ("Depth N" opens the Dungeon depth entry). A modifier's popup is only its text. The end report repeats the depth progress with the depth after the run and shows the streak as a row of seven days with a gift under the reward days (3rd and 7th).
  - The stage keeps one size for the whole run. A room opens with a banner drawn **over** the stage (the room number, the foe and its twist), then the fight plays under it; the playback controls never move.
  - At the end: the **rewards first** (the loot reveal), then a strip of the three rooms (each with its foe's sprite and a CLEARED, DEFEAT or LOCKED banner, left to right like a comic), then the team in its row with the HP each ended with.
- Skip and 2× controls (hidden for now, see above). Leaving mid-playback is fine; the result is already stored, and coming back shows the summary with "Watch again".
- A Discord post is optional, later: a weekly "deepest diver" note in the raid channel.

## Balance and sim

- The sim gains a dungeon model: win rate per depth for casual, daily and top players, depth reached after N weeks, and the reward flow per day (economy targets must still hold).
- **New targets:**
  - first-week players clear depth 1 at least 80% of the time;
  - the median player's depth grows about 1–2 per week;
  - dungeon Essence stays at most about 40% of a daily player's Essence income.

## Open questions for Misa

- Once a day or a few attempts? This plan assumes one, plus a free retry on the first day.
- Should the dungeon use raid creatures freely? Assumed yes: no locking, since the run is instant.
- Leaderboards or bragging posts?
