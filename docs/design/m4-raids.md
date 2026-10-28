# M4 design: the weekly raid

Status: **shipped** in #5 and #7 (M4). Later changes live in `decisions.md` and the newer docs named there; who takes part, parties and teams were changed on 2026-10-26 (you join by placing, and you can join until the finale starts; a new server starts at Rank 1). Builds on `m3-combat.md` (engine, loot rules) and the decisions log. All times are in the **guild's timezone** (default Europe/Helsinki) and come from a per-guild schedule config.

## The week

| When (guild-local)    | What happens                                                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mon 13:37             | New raid week. The week's boss is revealed (rotation in content order by week number) with the server's Boss Rank (a new server starts at Rank 1). Nobody is in it yet: a player joins by placing a creature on the board. |
| Mon–Fri               | Prep: players place up to three creatures. Placing the first one joins the week's raid.                                                                                                                                    |
| Fri 13:37             | **Phase 1** resolves on the server. Replay and log are available; Essence is paid. A summary posts to Discord.                                                                                                             |
| Fri 13:37 – Sat 13:37 | Adjustment window: players can still move or swap their own creatures, and new players can still join. The boss's Phase 2 counter-move is shown.                                                                           |
| Sat 13:37             | **Phase 2** resolves the same way.                                                                                                                                                                                         |
| Sun 20:00             | **Finale**. In M4 it auto-resolves with every ability at its default round, so the whole week is playable. M5 makes it live. Loot (Essence and the jackpot roll) is paid.                                                  |
| Mon 13:37             | Next week starts.                                                                                                                                                                                                          |

- The schedule is config: `{ weekStart: "mon 13:37", phase1: "fri 13:37", phase2: "sat 13:37", finale: "sun 20:00" }`.
- Every scheduled job is **idempotent per (week, event)**: it runs at most once, even if an alarm fires twice or late.
- **One alarm per guild object, several schedules.** The guild's single alarm is always set to the next due event among the leet sync and the raid events. When it fires, it runs everything that is due, then re-arms. A missed event (for example the object was asleep) runs on the next wake-up or request. Missed phases still resolve, in order.

## Who takes part: you join by placing

**[Misa, 2026-10-26: "Their occupied slots only hinder the active players. Therefore let's only add players to the raid if they legitimately actually assign their creatures to the board."]** This replaces the earlier "no sign-up, everyone active is in" rule (2026-10-10). See `decisions.md`, 2026-10-26.

- **Placing a creature on the board joins the week's raid.** There is no sign-up screen and nothing is filled in for anyone: a player brings exactly the creatures they placed, one to three.
- **Only joined players count:** the boss's HP scaling by head count (`scaleBoss`), Essence and loot, gear, the jackpot and the Festival creature, the finale abilities, the party's size and the Discord posts and finale pings. A player who did not place anything gets nothing and does not make the boss harder.
- **Joining stays open until the finale starts** (amended 2026-10-26, "join until the finale"): a player who has not joined can place their first creature at any time before the week's status becomes `finale`, in Phase 1's lead-up and after Phase 1 and Phase 2 alike. Once the finale has started the placement is refused with `locked`, as for everyone.
- **A late joiner fights from the next stage they are in.** Stages that already resolved are not redone: they are not in those results and get no Essence, experience or loot for them. The boss's HP pool is scaled and stored when a party first fights (Phase 1 for a party that exists then) from the members then, and a later joiner does **not** rescale it. A party made after Phase 1 (all others full, or the roster needs a second party) scales its own pool at its first fight. A late joiner's finale ability is the default like everyone else's (`abilityIdsFor`, by join order), with the same Auto fire default.
- **Leaving:** before Phase 1 a player who takes all of their creatures off the board leaves the raid again. From Phase 1 a member stays in their party and can still move, swap, add (up to three) and remove their own creatures until the finale starts; with nothing left on the board they do not fight. A placement of a creature that was released does not fight either.
- **The active roster** (a creature and activity in the last 14 days, `eligiblePlayerIds`) no longer puts anyone in the raid. It decides how much room the board has (see Parties) and who the Raid tab's pip and the Home notice nudge ("creatures to place") until the finale starts, and a joined player with fewer than three placed (up to the creatures they own) until the finale starts.
- A visible **roster** shows who has joined.
- A week where nobody joined has no fight: no results, no loot, no post, and the server's rank does not move (as for any week without a finale).

## Parties

- A raid party holds at most **15 joined players** (45 creatures). One party is the normal case for a 5–15-player server.
- Parties are made when their first player joins, not when the week opens. The number of parties follows the active roster as it stood when the week opened: the smallest number of parties of at most 15 (`partyCountFor`).
- **A player who places their first creature joins the party with the fewest joined players** (the lowest number on a tie; `joinSmallestParty`). A full party is skipped, and a new one opens if all are full. There is no snake draft on power any more. A player who has not joined sees the board of the party they would join.
- Each party fights the same boss with its own HP pool, its own row and its own results.
- A party's members only grow after Phase 1 (a late joiner goes to the party with the fewest joined players); nobody is moved.
- **Board size.** The row has room for three creatures of every player the board is made for: the party's share of the active roster (counted when the week opened, so the board never shrinks because someone stopped playing, and it grows only if someone new becomes active) or the joined players, whichever is more, at most 15 players (45 slots). With fewer than three players the row is nine slots and **guests** fill free slots up to nine creatures, as before. It is never shorter than the highest slot in use, so no placement is cut off. A party where nobody has a creature on the board has no fight and no guests.

## Teams and placement

- **A team is the placed creatures.** The player's raid creatures are the ones they placed on the board, at most three, strongest first. Nothing is auto-picked and nothing is auto-placed: unplaced creatures do not fight. There is no "choose team" and no "automatic team". A creature already on an expedition and placed still fights (expeditions and raids don't block each other). Training is unaffected by raids.
- **The row:** one shared row per party with front, middle and back zones, as in `m3-combat.md`.
  - Each player places only their own creatures.
  - Slots are first come, first served. A player can move their creatures to any empty slot, or swap places among their own creatures. An empty slot where an away player's creatures used to be auto-placed is just free.
  - One shared builder, `buildPartyBoard`, makes both the fight and the board view: the placements, then guests when fewer than three players fight. Members with no creature left on the board are left out of the fight (and of the head count).
  - Teams are loaded by creature id, with their gear and talents, from the party's placements. No raid read loads a player's whole collection.
- **Stats** are read at the moment each phase resolves, so training during the week counts.

## Resolving a phase

At the scheduled time, in one go per party:

1. Build the row (the placements, guests if fewer than 3 players). A party where nobody placed anything has no fight.
2. Draw a fresh 128-bit seed from `crypto.getRandomValues`.
3. Run `simulateFight` with the carried HP pool and, for Phase 2, the adaptation chosen after Phase 1.
4. Store the inputs, seed, result and event log.
5. Pay Essence through the ledger, keyed `raid:<week>:<party>:<phase>`, so it pays exactly once.
6. Queue the Discord post.

**Replays** re-run the engine from the stored inputs and seed, or read the stored events. Both give the same output. The inputs, seed and events are kept for the current week and the one before; older weeks keep only their summary (decisions.md, 2026-10-25), so their replay and stats are not found.

## Loot in M4

- Essence per cleared stage, as in `m3-combat.md` (about 70% flat, 30% by contribution).
- The jackpot roll after a finale win, with pity tracked per player. In M4 a jackpot pays a large Essence bundle plus a "Jackpot" record. Gear and jackpot items arrive with the gear step.
- **"First on server"** for jackpots: everyone who hits it in the same finale shares it. (Still recorded, but no longer shown to players: see `decisions.md`, 2026-10-11, "Slower, readable fights, and a hidden jackpot".)

## Evolution

- Now that Essence exists, the Evolve button unlocks: level 15 plus the Essence cost from content.
- Evolution is spent through the ledger, idempotent and race-safe.
- The first evolution of each line records "First on server".

## Discord posts

- **Channel:** the guild's announcement channel is the channel the Activity was most recently launched from. It comes from Discord's verified instance location, never from the client. An admin override comes later.
- **Posts** are one embed each, with the boss's portrait in the corner and a "Play Leet Creatures" button (2026-10-18 entry in `decisions.md`). They sum up; the details live in the raid view.
  - Monday boss reveal: the boss, its element and turn order, its moves, the three fight times in columns (weekday and time, "Fri 13:37"), and how many players are in.
  - Friday and Saturday: the boss retreats or holds firm, with an HP bar; the top three fighters, the big hit and the next fight in columns; after Phase 1, the counter-move.
  - Sunday finale: defeated or survived, the server's rank, when the next boss comes, the top three fighters, the big hit and the top reaction, and the creatures first caught or evolved on the server this week.
  - Never in a post: Essence amounts, the day's weather, contribution numbers, the jackpot.
- **Safety:**
  - All player-provided text (display names, nicknames) is markdown-escaped.
  - Every post sends `allowed_mentions: { parse: [] }`.
  - Posts stay within Discord's embed limits.
- **Failures:** posting runs after the phase is committed and retries on failure. A failed post never blocks the raid.
- The bot needs **Send Messages** in that channel (already in the install settings).

## API

- `GET /api/raid`: the current week.
  - Boss, schedule with timestamps, and phase.
  - Roster (display names: players who joined) and parties.
  - The player's party row with owners, or, before they join, the party they would join.
  - My team (the creatures I placed) and whether I have joined.
  - Results so far and the Phase 2 counter-move.
- `PUT /api/raid/team` is retired (it validates and changes nothing).
- `PUT /api/raid/placement` `{ creatureId, slot }` / `DELETE` to unplace. The first placement joins the player (any time before the finale starts, `locked` after); only the player's own creatures can be placed (`not_your_creature` otherwise). Taking the last one off before Phase 1 leaves the raid.
- `GET /api/raid/replay/{week}/{party}/{phase}`: events, names and the summary.
- `GET /api/raid/stats/{week}/{party}/{phase}`: the after-action stats of a resolved stage (members of that party only; 404 otherwise).
- `POST /api/creatures/{id}/evolve` `{ idempotencyKey }`.

All of these are validated and rate-limited. Changes are allowed only before the relevant lock, and identity comes from the session.

## UI (placeholder visuals)

- **Raid tab:**
  - boss card (element, gimmicks in plain words, turn order);
  - countdown to the next phase;
  - roster;
  - the party row as slots with owner colours and zone labels, where the player places their creatures (the first one joins them).
- **Replay viewer:**
  - turn-order strip and the boss mark;
  - play, pause, 2× and skip;
  - sentence log via `describeEvent`;
  - a Key Moments summary.
- Phase results with a personal recap.
