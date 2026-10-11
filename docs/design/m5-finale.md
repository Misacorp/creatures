# M5 design: the live Sunday finale and the loot reveal

Status: **draft for M5**. Builds on `m3-combat.md` (engine, finale abilities), `m4-raids.md` (week, parties, resolve) and the decisions log. All times are in the guild's timezone.

## What players see

1. **Before Sunday 20:00:** in the Raid tab, each player picks their **finale ability** (Rally, Shield Wall, Re-mark, Purge). If they don't pick, they get the M4 default (round-robin). The pick locks when the finale starts.
2. **From 19:55 (lobby):** the Raid tab shows "Finale starts in 4:12" and connects to the live fight. Players see who else is watching.
3. **20:00–about 20:02 (live):** the boss and the party's row. A round plays every 10 seconds (12 rounds by default, the boss's `finaleRounds`). Players see the events of each round as they happen (the replay viewer's event text), the boss HP bar and a round counter. Each player has **one ability button**.
4. **The end:** the fight ends after the last round or when the boss falls. Each player gets a **loot reveal**: the outcome, their Essence, and the jackpot roll. On a hit it shows a big reveal and "First on server" if theirs is the first. Players who weren't there see the same reveal the next time they open the Raid tab.

The fight is the same for watchers and non-watchers: nobody's creatures are weaker for being absent **[Misa]**.

## Ability timing rules

Each ability has a **default round** (content). The live rules:

- **Absent players and players who do nothing:** the ability fires at its default round, at full strength **[Misa]**.
- **Fire:** a present player may press **Fire** at any time before their ability has fired. It takes effect at the **start of the next round**. Shield Wall asks for a zone and Re-mark for an element at that moment; the documented defaults apply otherwise.
- **Hold:** before the default round arrives, a present player may press **Hold** to keep the ability past its default. A held ability fires when its owner presses Fire. If it is still unused at the start of the last round, it fires then, so it is never wasted.

This keeps "absent players fire at default" and "present players choose when", and it can't punish someone whose connection drops. **[Misa to confirm the Hold rule]**

## How the server runs it

The engine stays pure and unchanged. The live finale relies on one property of it, the **prefix property**: rounds 1..r of a fight depend only on the input, the seed and the abilities that fire in rounds 1..r. A new engine test pins this down: adding an ability at round k leaves every event before round k unchanged.

1. **Start (the finale event at 20:00, from the guild alarm):** for each party, in one transaction:
   - build the fight input exactly as M4 does: row from the creatures' current stats, carried HP pool, Phase 2 adaptation. From here on the row is frozen;
   - draw the seed from live crypto randomness;
   - store both in `raid_live`, with `started_at`, `round_ms` (10 000), the round count and each member's ability state (`abilityId`, `mode` default | held | fired, `fireAtRound`, `params`).

   The seed never leaves the server before the fight has resolved.

2. **The current round comes from the clock:** `round = min(rounds, floor((now - started_at) / round_ms) + 1)`. Nothing has to tick. Every read runs `simulateFight` on the stored input with the abilities known so far, and returns the events of rounds 1..round. Held abilities count as firing at the last round in that simulation. Re-running a 12-round fight is cheap (well under a millisecond of work per party).
3. **Fire and Hold** are written in a transaction, with the round taken from the clock at that moment: Fire sets `fireAtRound = round + 1`. Fire in the last round, or after the end, gets `too_late`. Hold is only allowed while the current round is before the ability's default round. The default round comes from a new engine helper, `defaultAbilityRound(boss, ability, rounds)`, which shares the engine's own logic, so Shield Wall's "first zone hit" default can never disagree with the fight.
4. **End:** the fight is over once round `rounds` has played, or as soon as the events up to the current round show the boss falling. The server then resolves the party with the stored input, the stored seed and the final ability list, through the same code as M4: Essence, jackpot rolls (fresh live randomness at that moment), pity, server firsts and the Discord post. The result row stores the input with the final `fireAtRound` values, so the replay shows exactly what players watched. Resolution happens on whichever comes first: a live read that sees the end, or the guild alarm, which is armed for `started_at + rounds × round_ms` (multiplexed with the other schedules, as ever).
5. **Idempotency:** the result row is still the done marker. A crash mid-fight leaves `raid_live` in storage, and the clock carries the fight on.

`resolveParty` is split into `buildPhaseInput` (shared by phases and the live start) and `settleParty` (shared by phases and the live end). Phases 1 and 2 keep resolving instantly.

## Transport: short polling (WebSocket push later)

Discord's proxy does support WebSockets, but it documents little about them: the URL form, limits, mobile behaviour (`docs/research/platform.md`, live-finale section). Plain HTTPS through the proxy already works for everything else. So M5 uses **short polling**, which needs nothing new from the proxy:

- `GET /api/raid/live` (bearer session, as for every API call) returns the caller's party's live state:
  `{ status: "none" | "lobby" | "live" | "done", practice, week, party, you, startsAt, roundMs, rounds, round, serverNow, boss: { id, name, element, hpMax, hpStart }, row, names, abilities: [{ alias, abilityId, mode, fired, firedAtRound }], events: FightEvent[], bossHp, watching: [displayName], loot }`.
  - `events` holds every event up to the current round. Each response is the full snapshot, so a client that misses a poll or reconnects just catches up.
  - `loot` is null until the end. Then it is the caller's own loot: `{ cleared, essence, jackpot: null | { essence, firstOnServer }, pity }`.
  - `watching` lists the players who polled in the last 10 s, tracked in memory in the guild object (best effort).
  - The lobby is from 5 minutes before the start. `none` means there is no finale soon.
- `POST /api/raid/live/action` with `{ action: "fire" | "hold", zone?, element? }` (strict schema) returns the new snapshot. The player's identity always comes from the session.
- The client polls every 2 s in the lobby and during the fight, a little after each round boundary (it knows `serverNow`, `startsAt` and `roundMs`), and stops at `done`. That is at most 15 players × 0.5 requests per second per party, well inside the per-player rate limit (burst 30, 1 per second).
- **Later (M5.1):** a WebSocket push channel on the same object (Hibernation API, one-time ticket in the query string because a browser WebSocket can't send `Authorization`, origin check, app-level ping), once a staging spike shows it works in Discord on desktop, iOS and Android. The snapshot format stays the same, so the client only swaps how it receives it.

## The loot reveal for people who missed it

- The result read model (`GET /api/raid`) gains `you.reveal: null | { week, cleared, essence, jackpot }` for the latest finale the player took part in and hasn't seen yet.
- `POST /api/raid/reveal-seen { week }` marks it as seen (idempotent).
- Only the player's own reveal is ever sent.

## Testing on staging: practice finale

Waiting for Sunday is too slow for testing, so staging gets a **practice finale**. It only exists when the Worker var `RAID_PRACTICE` is `"on"` (staging only, in `wrangler.jsonc`; production returns 404).

- `POST /api/raid/practice` starts a live practice fight for the caller's party now. It uses this week's boss and the party's current row, at full HP, without the adaptation.
- It runs the same live loop (`practice: true` in the snapshot), but it doesn't pay rewards and doesn't store a result or a Discord post.
- It is limited to one practice per party per 10 minutes.

## Not in M5

- Swap requests between players (M6).
- Spectating other parties.
- Sound.
