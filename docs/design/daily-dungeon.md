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
  - A zone attack hits the one creature at that place; "both ends" silence hits the left and right creatures; turn orders run along the row (left to right, right to left) or by speed.
- **Pre-run choices** replace live input, since there is none:
  - the basic ability pick;
  - Auto fire per ability: on, or a chosen fire round;
  - the order of the row.

  This keeps the "planning puzzle" feel that suits a predictable fight.

- **Dungeon:**
  - A short chain of **3 rooms**, generated from the seed: two encounters, then a room boss.
  - Each room is a small fight against content-defined dungeon foes (new content type, schema-validated), with an element, a turn order, gimmicks and an HP pool.
  - **Creature HP carries over between rooms**, and knocked-out creatures stay out, so order and guards matter.
  - Each room also rolls a **room modifier** from content, shown before the run: for example "Flooded: Tide +20%", "Dark: crits +5%", "Thorns: guards reflect".
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
  - Daily streaks: a small bonus for 3 and 7 days in a row; missing a day resets the streak, gently.
  - All payouts follow the existing ledger rules (integers, an idempotency key per (player, day)).

## Server (authoritative)

- `POST /api/dungeon/run { team: [id, id, id], abilities: {...}, idempotencyKey }` (`team` is the row, left to right; a body with a `formation` is refused as `invalid_body`):
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
  - ability pre-settings;
  - an **Enter** button.
- **Playback:**
  - The fight stage plays each room with the same pacing and effects as the live finale: shared `roundPlaybackMs`, telegraphs, lingering numbers.
  - The stage keeps one size for the whole run. A room opens with a banner drawn **over** the stage (the room number, the foe and its twist), then the fight plays under it; the playback controls never move.
  - At the end: the **rewards first** (the loot reveal), then a strip of the three rooms (each with its foe's sprite and a CLEARED, DEFEAT or LOCKED banner, left to right like a comic), then the team in its row with the HP each ended with.
- Skip and 2× controls. Leaving mid-playback is fine; the result is already stored, and coming back shows the summary with "Watch again".
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
