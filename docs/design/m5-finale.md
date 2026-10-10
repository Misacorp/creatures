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

The engine stays pure and unchanged. The live finale uses one property of it, the **prefix property**: rounds 1..r of a fight depend only on the input, the seed and the abilities that fire in rounds 1..r. A new engine test pins this down: adding an ability at round k leaves every event before round k unchanged.

1. **Start (the finale event at 20:00):** for each party, in one transaction:
   - build the fight input exactly as M4 does: row from the creatures' current stats, carried HP pool, Phase 2 adaptation. From here on the row is frozen.
   - draw the seed from live crypto randomness;
   - store both in `raid_live` with `started_at`, `round_ms` (10 000), the round count, and each member's ability state (`abilityId`, `mode` default | held | fired, `fireAtRound`, `params`).
     The seed never leaves the server before the fight has resolved.
2. **Ticks:** the guild alarm wakes every `round_ms` while a fight is live (one alarm, multiplexed with the other schedules). On each tick, the server works out the current round from the wall clock: `round = floor((now - started_at) / round_ms) + 1`. It runs `simulateFight` on the stored input with the abilities known so far, and broadcasts the events of every round that has newly started. Held abilities count as firing at the last round while the simulation runs; abilities fired after round r was broadcast take `fireAtRound = r + 1`. Re-running a 12-round fight on each tick is cheap and keeps the code simple.
3. **Late or missed ticks:** if a tick is late, the next tick catches up and broadcasts all the rounds it missed at once. If the object wakes after the fight should have ended, it resolves at once.
4. **End:** when the last round has played, or the boss has fallen, the server resolves the party with the stored input, the stored seed and the final ability list, through the same code as M4's resolve: Essence, jackpot rolls (fresh live randomness at that moment), pity, server firsts and the Discord post. The result row stores the input with the final `fireAtRound` values, so the replay shows exactly what players watched.
5. **Idempotency:** the result row is still the done marker. A crash mid-fight leaves `raid_live` in storage, and the next wake carries on from the wall clock.

`resolveParty` is split into `buildFinaleInput` (shared by phases and the live start) and `settleParty` (shared by phases and the live end). Phases 1 and 2 keep resolving instantly.

## Transport: WebSockets on the guild Durable Object

- **Ticket:** a browser WebSocket can't send an `Authorization` header. The client first calls `POST /api/raid/live/ticket` with its bearer session and gets a **one-time ticket**: `w1.<guildId>.<secret>.<mac>`, the session-token format with its own HKDF info string. It lasts 60 s, only its SHA-256 is stored, and it is consumed on use. The client then opens `wss://<same host>/api/raid/live?ticket=…`.
- **Upgrade:** the Worker checks the ticket's MAC before waking any object (like sessions), then forwards the upgrade request to the guild object. The object consumes the ticket, checks that the user is a member of a party this week, and accepts with the Hibernation API. The socket is tagged `party:<n>`, and its attachment is `{ userId, party, alias }`.
- **Limits:** at most 3 sockets per user (the oldest is closed) and 64 per party. Client messages are at most 512 bytes, schema-validated (strict), and limited to 5 per second per socket. Above that the socket is closed with 1008.
- **Origin:** the upgrade must come from our own origins: the custom domain or `<client_id>.discordsays.com`. Anything else is refused.
- **CSP:** `connect-src` gains an explicit `wss:` source for the same host if research shows `'self'` isn't enough in every Discord client.

### Messages (JSON)

Server → client:

- `{ t: "hello", week, party, you, status: "lobby" | "live" | "done", startsAt, roundMs, rounds, row, boss: { name, element, hpMax, hpStart }, abilities: [{ alias, name, abilityId, mode, fired }], watching: [displayName] }`. Sent on connect. It is the full snapshot, so a reconnect is just a fresh hello.
- `{ t: "round", round, at, events: FightEvent[], bossHp }`. Sent once per round, in order. A reconnecting client gets a hello and then every round so far.
- `{ t: "ability", alias, mode }`. Someone held or fired an ability (the effect shows up in the next round's events).
- `{ t: "watching", names }`. Who is connected.
- `{ t: "done", cleared, bossHpEnd }`, followed by `{ t: "loot", essence, jackpot: null | { essence, firstOnServer }, pity }`, which only goes to that player's own sockets.
- `{ t: "error", code }`, for example `already_fired`, `too_late` or `rate_limited`.

Client → server:

- `{ t: "fire", zone?, element? }` fires the player's own ability.
- `{ t: "hold" }` holds the player's own ability.

Player identity always comes from the socket's attachment, never from a message.

## The loot reveal for people who missed it

- The result read model (`GET /api/raid`) gains `you.reveal: null | { week, cleared, essence, jackpot }` for the latest finale the player took part in and hasn't seen yet.
- `POST /api/raid/reveal-seen { week }` marks it as seen (idempotent).
- Only the player's own reveal is ever sent.

## Testing on staging: practice finale

Waiting for Sunday is too slow for testing, so staging gets a **practice finale**. It only exists when the Worker var `RAID_PRACTICE` is `"on"` (staging only, in `wrangler.jsonc`; production returns 404).

- `POST /api/raid/practice` starts a live practice fight for the caller's party now. It uses this week's boss and the party's current row, at full HP, without the adaptation.
- It runs the same live loop, but it doesn't pay rewards and doesn't store a result.
- It is limited to one practice per party per 10 minutes.

## Not in M5

- Swap requests between players (M6).
- Spectating other parties.
- Sound.
