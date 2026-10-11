# M5 design: the live Sunday finale and the loot reveal

Status: **draft for M5**. Builds on `m3-combat.md` (engine, finale abilities), `m4-raids.md` (week, parties, resolve) and the decisions log. All times are in the guild's timezone.

## What players see

1. **Before Sunday 20:00:** in the Raid tab, each player picks their **finale ability** (Rally, Shield Wall, Re-mark, Purge). If they don't pick, they get the M4 default (round-robin). The pick locks when the finale starts.
2. **From 19:55 (lobby):** the Raid tab shows "Finale starts in 4:12" and connects to the live fight. Players see who else is watching. The lobby already shows the **stage as a preview**: the party's row as it would fight now, with the player's own creatures and their abilities. Tapping one opens a popover with only the **Auto fire** toggle (no Fire before the start).
   - **The last 30 seconds [Misa]:** a big countdown in the pixel display face covers the stage, driven by the server clock (`startsAt`, `serverNow` and the clock offset; no extra requests). From 30 to 11 a calm pulse; from 10 to 6 a faster pulse with the colour shifting from gold to orange; from 5 to 1 red, a stepped screen shake on each second and a bigger number each tick. At 0 it says "FIGHT!" for a moment and the stage takes over. With `prefers-reduced-motion` the number is still and only its colour changes. The overlay lets taps through, so Auto fire can be set during the countdown.
3. **20:00–about 20:03 (live):** the boss and the party's row. A round plays every **15 seconds** (12 rounds by default, the boss's `finaleRounds`, so about 3 minutes; the cap is 5 minutes) **[Misa, 2026-10-11]**. Players see the events of each round as they happen as effects on the stage (and, behind a Log toggle, as text), the boss HP bar and a round counter. Each player has **one ability button**.
   - **How a round plays [Misa]:** a big "Round N" in the pixel face covers the stage for 3 seconds, then the round's creature actions play, and their effects are over about 1.5 seconds before the next round. Details under "Playback" below.
4. **The end:** the fight ends after the last round or when the boss falls. Each player gets a **loot reveal**: the outcome and one Essence figure. The jackpot roll and the pity counter are **hidden from players [Misa]**: a jackpot is still rolled and paid, but the reveal only shows everything as one Essence total. Players who weren't there see the same reveal the next time they open the Raid tab.

The fight is the same for watchers and non-watchers: nobody's creatures are weaker for being absent **[Misa]**.

## Ability timing rules

Each ability has a **default round** (content). The live rules:

- **Absent players and players who do nothing:** the ability fires at its default round, at full strength **[Misa]**.
- **Fire:** a present player may press **Fire** at any time before their ability has fired. It takes effect at the **start of the next round**. Shield Wall asks for a zone and Re-mark for an element at that moment; the documented defaults apply otherwise.
- **Auto fire (was "Hold") [Misa]:** each ability has an **Auto fire** toggle, on by default. On, the ability fires by itself at its default round. Off, it waits for its owner and fires when they press Fire. If it is still unused at the start of the last round it fires then, so it is never wasted (the safety net).
  - The toggle works both ways, but only while the current round is before the ability's default round. After that only Fire remains.
  - On the wire the two directions are `hold` (auto fire off) and `unhold` (auto fire on again).

- **Preferences before the start [Misa]:** the toggle also works before the fight, in the lobby and in the Raid tab's "Your finale abilities" card at any time in the week. It is stored as a preference and sets each ability's first mode at the live start: off becomes `held` (with the last-round safety net), on stays `default`. After the start the live `hold` and `unhold` actions apply.

This keeps "absent players fire at default" and "present players choose when", and it can't punish someone whose connection drops. **[Misa: Hold became the Auto fire toggle, 2026-10-11]**

## How the server runs it

The engine stays pure and unchanged. The live finale relies on one property of it, the **prefix property**: rounds 1..r of a fight depend only on the input, the seed and the abilities that fire in rounds 1..r. A new engine test pins this down: adding an ability at round k leaves every event before round k unchanged.

1. **Start (the finale event at 20:00, from the guild alarm):** for each party, in one transaction:
   - build the fight input exactly as M4 does: row from the creatures' current stats, carried HP pool, Phase 2 adaptation. From here on the row is frozen;
   - draw the seed from live crypto randomness;
   - store both in `raid_live`, with `started_at`, `round_ms` (15 000, `LIVE_ROUND_MS`; a stored fight keeps the value it started with), the round count and each member's ability state (`abilityId`, `mode` default | held | fired, `fireAtRound`, `params`).

   The seed never leaves the server before the fight has resolved.

2. **The current round comes from the clock:** `round = min(rounds, floor((now - started_at) / round_ms) + 1)`. Nothing has to tick. Every read runs `simulateFight` on the stored input with the abilities known so far, and returns the events of rounds 1..round. Held abilities count as firing at the last round in that simulation. Re-running a 12-round fight is cheap (well under a millisecond of work per party).
3. **Fire and the Auto fire toggle** are written in a transaction, with the round taken from the clock at that moment: Fire sets `fireAtRound = round + 1`. Fire in the last round, or after the end, gets `too_late`. `hold` (auto fire off) is only allowed while the current round is before the ability's default round (`hold_too_late` otherwise). `unhold` (auto fire on) is only allowed while the ability is held, unused and before its default round (`not_held`, `already_fired` or `hold_too_late` otherwise). The default round comes from a new engine helper, `defaultAbilityRound(boss, ability, rounds)`, which shares the engine's own logic, so Shield Wall's "first zone hit" default can never disagree with the fight.
4. **End:** the fight is over once round `rounds` has played, or as soon as the events up to the current round show the boss falling. The server then resolves the party with the stored input, the stored seed and the final ability list, through the same code as M4: Essence, jackpot rolls (fresh live randomness at that moment), pity, server firsts and the Discord post. The result row stores the input with the final `fireAtRound` values, so the replay shows exactly what players watched. Resolution happens on whichever comes first: a live read that sees the end, or the guild alarm, which is armed for `started_at + rounds × round_ms` (multiplexed with the other schedules, as ever).
5. **Idempotency:** the result row is still the done marker. A crash mid-fight leaves `raid_live` in storage, and the clock carries the fight on.

`resolveParty` is split into `buildPhaseInput` (shared by phases and the live start) and `settleParty` (shared by phases and the live end). Phases 1 and 2 keep resolving instantly.

## Transport: short polling (WebSocket push later)

Discord's proxy does support WebSockets, but it documents little about them: the URL form, limits, mobile behaviour (`docs/research/platform.md`, live-finale section). Plain HTTPS through the proxy already works for everything else. So M5 uses **short polling**, which needs nothing new from the proxy:

- `GET /api/raid/live` (bearer session, as for every API call) returns the caller's party's live state:
  `{ status: "none" | "lobby" | "live" | "done", practice, week, party, you, startsAt, roundMs, rounds, round, serverNow, boss: { id, name, element, hpMax, hpStart }, row, names, abilities: [{ alias, abilityId, mode, fired, firedAtRound }], events: FightEvent[], bossHp, watching: [displayName], loot }`.
  - `events` holds every event up to the current round. Each response is the full snapshot, so a client that misses a poll or reconnects just catches up.
  - `loot` is null until the end. Then it is the caller's own loot: `{ cleared, essence, rankChange, festivalGrant }`. `essence` is the caller's whole payout for the finale, the jackpot Essence included. The jackpot roll, whether it hit, and the pity counter are never sent (they stay in storage).
  - `watching` lists the players who polled in the last 10 s, tracked in memory in the guild object (best effort).
  - The lobby is from 5 minutes before the start. `none` means there is no finale soon.
- `POST /api/raid/live/action` with `{ key, action: "fire" | "hold" | "unhold", zone?, element? }` (strict schema) returns the new snapshot. The player's identity always comes from the session.
- The client polls every 2 s in the lobby and during the fight, a little after each round boundary (it knows `serverNow`, `startsAt` and `roundMs`), and stops at `done`. That is at most 15 players × 0.5 requests per second per party, well inside the per-player rate limit (burst 30, 1 per second).
- **Later (M5.1):** a WebSocket push channel on the same object (Hibernation API, one-time ticket in the query string because a browser WebSocket can't send `Authorization`, origin check, app-level ping), once a staging spike shows it works in Discord on desktop, iOS and Android. The snapshot format stays the same, so the client only swaps how it receives it.

## Playback on the client [Misa, 2026-10-11]

The server only says what happened; the client decides how to show it (`stage.ts`, `stage-fx.ts`, `use-live-stage.ts`). Two clocks are kept apart:

- **Stagger:** how long after a beat starts the next one starts. 500 ms for a plain turn, up to 700 ms for a crit, reaction, ability, knockout or gimmick; compressed to fit the round, never below 250 ms.
- **Visible duration:** how long a beat's effects stay. Damage numbers float for 1.3 s; a crit for 2 s with a big "CRITICAL!" pop; a reaction shows a large burst with its name ("Conduction!") in its two element colours for 1.5 s; a knockout is held (a "KO!" tag) for 1 s; an ability shows the creature's name and the ability for 1.5 s. Effects overlap the beats that follow.
- **Budget per live round (15 s):** 3 s "Round N" intro, then the beats, and the last beat's effects end about 1.5 s before the next round (10.5 s for the beats and their effects). A round with very many beats runs at the 250 ms minimum and the next round simply replaces what is left.
- **Replays** show the same intro for 1.5 s and the same visible durations. At 2x the stagger is halved, the durations are about 30% shorter and the intro is 0.9 s. Before a round's intro the previous round's effects get time to finish.
- **Reduced motion:** the intro is plain text for the same time, and the newest beat's effects are shown without movement.
- The intro waits for the countdown's "FIGHT!" to finish when a fight starts.

## Auto fire preferences

- Table `raid_autofire` (migration 14): (week, user, target) with `auto_fire` 0 or 1. The target is `basic` or the id of one of the player's own team creatures. No row means on.
- `PUT /api/raid/autofire { target, on }` (strict schema; the player is the session's). The target must be `basic` or a creature in the caller's team this week (`409 not_your_creature` otherwise). It is allowed until the finale starts and is `409 locked` afterwards. It answers with the Raid view. A practice fight that is still in its lobby takes the change too.
- The live start (`startFinaleParty`), the instant late finale (`resolveParty`: held abilities fire in the last round) and the practice start read the preferences. A preference for a creature that has left the team is never read.
- The Raid view's `you.abilities[].autoFire` and the lobby snapshot's abilities (`autoFire`, plus `mode` default or held) show them. Every live ability also has `autoFire` (true unless its mode is `held`).
- The lobby snapshot carries the preview: `row`, `names`, the boss pool and only the caller's own abilities, built read-only with the same code as the start (`buildPhaseInput`). `you` is the caller's player key.

## The loot reveal for people who missed it

- The result read model (`GET /api/raid`) gains `you.reveal: null | { week, party, cleared, essence, rankChange, festivalGrant }` (`essence` includes the hidden jackpot Essence) for the latest finale the player took part in and hasn't seen yet.
- `POST /api/raid/reveal-seen { week }` marks it as seen (idempotent).
- Only the player's own reveal is ever sent.

## Testing on staging: practice finale

Waiting for Sunday is too slow for testing, so staging gets a **practice finale**. It only exists when the Worker var `RAID_PRACTICE` is `"on"` (staging only, in `wrangler.jsonc`; production returns 404).

- `POST /api/raid/practice` starts a practice fight for the caller's party. It begins after a **30 second lobby** with the same countdown (`startsAt` is now plus 30 s and the snapshot is a lobby until then; Fire is refused with `not_started` before it). The preferences apply at its start. It uses this week's boss and the party's current row, at full HP, without the adaptation.
- It runs the same live loop (`practice: true` in the snapshot), but it doesn't pay rewards and doesn't store a result or a Discord post.
- It is limited to one practice per party per 10 minutes (counted from the request).

## Not in M5

- Swap requests between players (M6).
- Spectating other parties.
- Sound.
