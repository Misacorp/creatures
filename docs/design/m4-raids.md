# M4 design: the weekly raid

Status: **draft for M4**. Builds on `m3-combat.md` (engine, loot rules) and the decisions log. All times are in the **guild's timezone** (default Europe/Helsinki) and come from a per-guild schedule config.

## The week

| When (guild-local)    | What happens                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mon 13:37             | New raid week. The week's boss is revealed (rotation in content order by week number). Roster and teams are filled in automatically.                                      |
| Mon–Fri               | Prep: players check their auto-picked team and placement and can change them.                                                                                             |
| Fri 13:37             | **Phase 1** resolves on the server. Replay and log are available; Essence is paid. A summary posts to Discord.                                                            |
| Fri 13:37 – Sat 13:37 | Adjustment window: players can still change their own team and placement. The boss's Phase 2 counter-move is shown.                                                       |
| Sat 13:37             | **Phase 2** resolves the same way.                                                                                                                                        |
| Sun 20:00             | **Finale**. In M4 it auto-resolves with every ability at its default round, so the whole week is playable. M5 makes it live. Loot (Essence and the jackpot roll) is paid. |
| Mon 13:37             | Next week starts.                                                                                                                                                         |

- The schedule is config: `{ weekStart: "mon 13:37", phase1: "fri 13:37", phase2: "sat 13:37", finale: "sun 20:00" }`.
- Every scheduled job is **idempotent per (week, event)**: it runs at most once, even if an alarm fires twice or late.
- **One alarm per guild object, several schedules.** The guild's single alarm is always set to the next due event among the leet sync and the raid events. When it fires, it runs everything that is due, then re-arms. A missed event (for example the object was asleep) runs on the next wake-up or request. Missed phases still resolve, in order.

## Who takes part: no sign-up

**[Misa: agreed to drop sign-up]**

- Every player who has a starter and has been **active in the last 14 days** is in the week's raid automatically. Active means they opened the game or leeted.
- Players can **opt out** for the week ("sit this week out") until Phase 1 locks, and opt back in.
- A visible **roster** shows who's in this week.
- Players who join mid-week (new starter or newly active) join the roster up to the Phase 1 lock.
- Long-inactive players are not included, so they don't make the boss harder or collect loot for nothing.
- Players on the roster who never open the game that week still take part with auto-placed creatures. They earn the base reward and their finale ability fires at its default round **[Misa]**.

## Parties

- A raid **party** holds at most **15 players** (45 creatures). One party is the normal case for a 5–15-player server.
- If more than 15 players are on the roster when the week starts, the roster is split into the smallest number of parties of at most 15. Parties are balanced by **snake draft on team power**.
- Each party fights the same boss with its own HP pool, its own row and its own results.
- Late joiners go to the party with the fewest players.
- Party membership is fixed after the Phase 1 lock.

## Teams and placement

- **Auto team:** the player's 3 highest-power creatures that are not away on an expedition when a phase resolves. Players can pick their own 3 instead.
- **Away creatures:**
  - A creature on an expedition still fights if it was in the team when the phase resolves. Expeditions and raids don't block each other: raids are a weekly event and blocking would make them a chore.
  - Training is unaffected by raids.
- **The row:** one shared row per party with front, middle and back zones, as in `m3-combat.md`.
  - Each player places only their own creatures.
  - Slots are first come, first served.
  - A player can move their creatures to any empty slot, or swap places among their own creatures.
  - Unplaced creatures are auto-placed with the engine's `autoPlace` at resolve time.
  - Swap requests with other players come later (M6).
- **Stats** are read at the moment each phase resolves, so training during the week counts.

## Resolving a phase

At the scheduled time, in one go per party:

1. Build the row (placements, auto-place, guests if fewer than 3 players).
2. Draw a fresh 128-bit seed from `crypto.getRandomValues`.
3. Run `simulateFight` with the carried HP pool and, for Phase 2, the adaptation chosen after Phase 1.
4. Store the inputs, seed, result and event log.
5. Pay Essence through the ledger, keyed `raid:<week>:<party>:<phase>`, so it pays exactly once.
6. Queue the Discord post.

**Replays** re-run the engine from the stored inputs and seed, or read the stored events. Both give the same output.

## Loot in M4

- Essence per cleared stage, as in `m3-combat.md` (about 70% flat, 30% by contribution).
- The jackpot roll after a finale win, with pity tracked per player. In M4 a jackpot pays a large Essence bundle plus a "Jackpot" record. Gear and jackpot items arrive with the gear step.
- **"First on server"** for jackpots: everyone who hits it in the same finale shares it.

## Evolution

- Now that Essence exists, the Evolve button unlocks: level 15 plus the Essence cost from content.
- Evolution is spent through the ledger, idempotent and race-safe.
- The first evolution of each line records "First on server".

## Discord posts

- **Channel:** the guild's announcement channel is the channel the Activity was most recently launched from. It comes from Discord's verified instance location, never from the client. An admin override comes later.
- **Posts:**
  - Monday boss reveal;
  - Friday and Saturday phase summaries: cleared or not, the top contributors, the best reaction and a key moment;
  - Saturday counter-move;
  - Sunday finale result and loot highlights;
  - shiny, jackpot and first-on-server announcements, batched into the phase posts.
- **Safety:**
  - All player-provided text (display names, nicknames) is markdown-escaped.
  - Every post sends `allowed_mentions: { parse: [] }`.
  - Posts stay under 2,000 characters.
- **Failures:** posting runs after the phase is committed and retries on failure. A failed post never blocks the raid.
- The bot needs **Send Messages** in that channel (already in the install settings).

## API

- `GET /api/raid`: the current week.
  - Boss, schedule with timestamps, and phase.
  - Roster (display names) and parties.
  - The player's party row with owners.
  - My team and opt-out state.
  - Results so far and the Phase 2 counter-move.
- `PUT /api/raid/team` `{ creatureIds: [3] | null }`: `null` means automatic.
- `PUT /api/raid/placement` `{ creatureId, slot }` / `DELETE` to unplace.
- `PUT /api/raid/opt-out` `{ optOut: boolean }`.
- `GET /api/raid/replay/{week}/{party}/{phase}`: events, names and the summary.
- `GET /api/raid/stats/{week}/{party}/{phase}`: the after-action stats of a resolved stage (members of that party only; 404 otherwise).
- `POST /api/creatures/{id}/evolve` `{ idempotencyKey }`.

All of these are validated and rate-limited. Changes are allowed only before the relevant lock, and identity comes from the session.

## UI (placeholder visuals)

- **Raid tab:**
  - boss card (element, gimmicks in plain words, turn order);
  - countdown to the next phase;
  - roster;
  - the party row as slots with owner colours and zone labels;
  - my team picker;
  - opt-out toggle.
- **Replay viewer:**
  - turn-order strip and the boss mark;
  - play, pause, 2× and skip;
  - sentence log via `describeEvent`;
  - a Key Moments summary.
- Phase results with a personal recap.
