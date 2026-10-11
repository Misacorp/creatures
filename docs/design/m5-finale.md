# M5 design: the live Sunday finale and the loot reveal

Status: **draft for M5**. Builds on `m3-combat.md` (engine, finale abilities), `m4-raids.md` (week, parties, resolve) and the decisions log. All times are in the guild's timezone.

## What players see

1. **Before Sunday 20:00:** in the Raid tab, each player picks their **finale ability** (Rally, Shield Wall, Re-mark, Purge). If they don't pick, they get the M4 default (round-robin). The pick locks when the finale starts.
2. **From 19:55 (lobby):** the Raid tab shows "Finale starts in 4:12" and connects to the live fight. Players see who else is watching. The lobby already shows the **stage as a preview**: the party's row as it would fight now, with the player's own creatures and their abilities. Tapping one opens a popover with only the **Auto fire** toggle (no Fire before the start).
   - **The last 30 seconds [Misa]:** a big countdown in the pixel display face covers the stage, driven by the server clock (`startsAt`, `serverNow` and the clock offset; no extra requests). From 30 to 11 a calm pulse; from 10 to 6 a faster pulse with the colour shifting from gold to orange; from 5 to 1 red, a stepped screen shake on each second and a bigger number each tick. At 0 it says "FIGHT!" for a moment and the stage takes over. With `prefers-reduced-motion` the number is still and only its colour changes. The overlay lets taps through, so Auto fire can be set during the countdown.
3. **20:00–about 20:03 (live):** the boss and the party's row. The rounds are **paced by their content** (12 rounds by default, the boss's `finaleRounds`): a round lasts as long as its events take to show, 6 to 22 seconds, so a finale of 3 players (a row of 9) takes about 2:00, 5 players about 2:35, 8 players about 3:35, and from 12 players on rounds hit the 22 s cap and the finale takes the longest possible 4:24, under the 5 minute cap **[Misa, 2026-10-11]**. Players see the events of each round as they happen as effects on the stage (and, behind a Log toggle, as text), the boss HP bar and a round counter. Each player has **one ability button**.
   - **How a round plays [Misa]:** a big "Round N" in the pixel face covers the stage for 1.5 seconds, then the round's creature actions play, and the next round starts 2 seconds after the last effect of this one appears. A boss attack is telegraphed first (red reticles on its targets), and the stage always shows what the boss will do next round. Details under "Playback" below.
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
   - store both in `raid_live`, with `started_at`, the round count, `pacing` (1: rounds last as long as their content; see below; `round_ms` then only holds the upper bound, 22 000, `LIVE_ROUND_MS`) and each member's ability state (`abilityId`, `mode` default | held | fired, `fireAtRound`, `params`).

   The seed never leaves the server before the fight has resolved.

2. **The current round comes from the clock and a cumulative schedule [Misa, 2026-10-11]:** round 1 starts at `started_at`, and round r+1 starts at `start(r) + roundPlaybackMs(events of round r)`. `roundPlaybackMs` is a pure function in the engine package (`packages/engine/src/playback.ts`), shared with the client, so the two cannot disagree:
   - **Length of a round** = the intro (1.5 s live) + the staggers of every beat but the last visible one + that beat's wind-up (600 ms, for boss actions) + a **2 s tail** after the last effect appears, **clamped to 6..22 s**. A beat's stagger is 500 ms for a plain turn and up to 700 ms for a crit, reaction, ability, knockout, boss gimmick or luck banner. If the round would pass 22 s, the staggers are squeezed in proportion (keeping at least 250 ms each where that fits).
   - The beat boundaries (`beatEnds`: a round opening, a creature's turn, a boss attack, a boss gimmick, the round's end) live in the same module and are the replay's steps too.
   - This is sound because of the prefix property: round r's events are fixed once round r has started, and Fire only takes effect from the next round on, so a press never changes the length of the round it is pressed in, nor the start of the next one. The schedule up to the current round and the start of the next never changes.
   - **Current round** = the last round whose start is not after `now`. A read re-runs `simulateFight` on the stored input with the abilities known so far (the simulation is remembered for a few reads, keyed by seed, input and abilities) and returns the events of rounds 1..round. Held abilities count as firing at the last round in that simulation.
   - **The snapshot carries the schedule:** `roundStarts` (the start of every round that has begun) and `nextRoundAt` (the next round's start, or the end of the fight during its last round; the start in the lobby), so the client's countdown and polls line up with the server.
   - **Legacy rows:** a `raid_live` row stored before this change has `pacing` 0 (migration 15 adds the column with that default) and keeps its fixed `round_ms` schedule and its old end rule; its snapshot sends `roundMs` and a `roundStarts` / `nextRoundAt` computed from it. New rows (and practice fights) store `pacing` 1 and send `roundMs: null`.
3. **Fire and the Auto fire toggle** are written in a transaction, with the round taken from the clock at that moment: Fire sets `fireAtRound = round + 1`. Fire in the last round (the 12th, or the round the boss falls in), or after the end, gets `too_late`. `hold` (auto fire off) is only allowed while the current round is before the ability's default round (`hold_too_late` otherwise). `unhold` (auto fire on) is only allowed while the ability is held, unused and before its default round (`not_held`, `already_fired` or `hold_too_late` otherwise). The default round comes from a new engine helper, `defaultAbilityRound(boss, ability, rounds)`, which shares the engine's own logic, so Shield Wall's "first zone hit" default can never disagree with the fight.
4. **End:** the fight is over once its last round has played out: round `rounds`, or the round in which the boss falls (or everyone is knocked out), **plus that round's playback**. So the loot reveal comes after the last effects, not at the start of the round the boss falls in. The server then resolves the party with the stored input, the stored seed and the final ability list, through the same code as M4: Essence, jackpot rolls (fresh live randomness at that moment), pity, server firsts and the Discord post. The result row stores the input with the final `fireAtRound` values, so the replay shows exactly what players watched. Resolution happens on whichever comes first: a live read that sees the end, or the guild alarm. The alarm is armed for the end of the schedule computed from the stored fight (multiplexed with the other schedules, as ever); every request re-arms it, so a press that changes the later rounds moves it, and setting it again changes nothing.
5. **Idempotency:** the result row is still the done marker. A crash mid-fight leaves `raid_live` in storage, and the clock carries the fight on.

`resolveParty` is split into `buildPhaseInput` (shared by phases and the live start) and `settleParty` (shared by phases and the live end). Phases 1 and 2 keep resolving instantly.

## Transport: short polling (WebSocket push later)

Discord's proxy does support WebSockets, but it documents little about them: the URL form, limits, mobile behaviour (`docs/research/platform.md`, live-finale section). Plain HTTPS through the proxy already works for everything else. So M5 uses **short polling**, which needs nothing new from the proxy:

- `GET /api/raid/live` (bearer session, as for every API call) returns the caller's party's live state:
  `{ status: "none" | "lobby" | "live" | "done", practice, week, party, you, startsAt, roundMs | null, rounds, round, roundStarts: number[], nextRoundAt | null, serverNow, boss: { id, name, element, hpMax, hpStart }, row, names, abilities: [{ alias, abilityId, mode, fired, firedAtRound }], events: FightEvent[], bossHp, watching: [displayName], loot }`.
  - `events` holds every event up to the current round. Each response is the full snapshot, so a client that misses a poll or reconnects just catches up.
  - `loot` is null until the end. Then it is the caller's own loot: `{ cleared, essence, rankChange, festivalGrant }`. `essence` is the caller's whole payout for the finale, the jackpot Essence included. The jackpot roll, whether it hit, and the pity counter are never sent (they stay in storage).
  - `watching` lists the players who polled in the last 10 s, tracked in memory in the guild object (best effort).
  - The lobby is from 5 minutes before the start. `none` means there is no finale soon.
- `POST /api/raid/live/action` with `{ key, action: "fire" | "hold" | "unhold", zone?, element? }` (strict schema) returns the new snapshot. The player's identity always comes from the session.
- The client polls every 2 s in the lobby and during the fight, and once just after `nextRoundAt` (it knows `serverNow`; a few hundred milliseconds later, again at once if the server has not moved on yet), and stops at `done`. That is at most 15 players × 0.5 requests per second per party, well inside the per-player rate limit (burst 30, 1 per second).
- **Later (M5.1):** a WebSocket push channel on the same object (Hibernation API, one-time ticket in the query string because a browser WebSocket can't send `Authorization`, origin check, app-level ping), once a staging spike shows it works in Discord on desktop, iOS and Android. The snapshot format stays the same, so the client only swaps how it receives it.

## Playback on the client [Misa, 2026-10-11]

The server only says what happened; the client decides how to show it (`stage.ts`, `stage-fx.ts`, `use-live-stage.ts`, `telegraph.ts`). Two clocks are kept apart:

- **Stagger:** how long after a beat starts the next one starts. It comes from the engine's pacing (see "How the server runs it"), so a live round on the stage lasts exactly as long as the server gives it: `liveTimeline(beats)` schedules the intro, every wind-up and landing from the engine's plan, and its end equals `roundPlaybackMs` of the round.
- **Visible duration:** how long a beat's effects stay. Damage numbers 2.5 s; a crit 3 s with a big "CRITICAL!" pop; a reaction shows a large burst with its name ("Conduction!") in its two element colours for 2.5 s; a knockout "KO!" tag 1.5 s; an ability card (creature name and ability) 2 s; a boss attack's label 2 s. Effects overlap freely, and the next round does not clear them.
- **Rounds:** a 1.5 s "Round N" intro (1 s in replays), the beats, then a **2 s tail** after the last effect appears and straight on to the next round: no idle wait beyond it. At 2x everything (intro, staggers, wind-ups, tail) is halved and the visible durations are about 30% shorter.
- **Numbers rise continuously** from where they spawn (3.5 rem over their whole time on a creature, 2.25 rem on the boss), so a newer number on the same creature spawns at the base and sits below the older ones. On the boss the numbers stand side by side in four lanes, reusing the lane whose newest number has risen furthest.
- **Smoothness:** floats, fades, bursts and scale pops use smooth easing (linear for the rise, ease-out for the pops) and change only `transform` and `opacity` (`will-change` on them), never `steps()`. `steps()` stays for sprite hops, flashes and shakes. Numbers are keyed by their event index (never re-keyed mid-animation), each effect keeps one ref function for its whole life, and a beam's positions are measured once before its first paint.
- **Replays** play the same pacing (`buildBeats(..., { introMs: 1000, speed })`). Replays step with per-beat timers, so they run a couple of hundred milliseconds per round slower than the timeline (rendering between steps).
- **Reduced motion:** the intro is plain text for the same time; the stage shows the round's boss actions and the newest beat's effects without movement (static frames on the targets, the label, the zone outline and the forecast).
- The intro waits for the countdown's "FIGHT!" to finish when a fight starts.

### The boss telegraph

Every boss action is shown in three steps, from the events themselves (`strikesOf` in `stage.ts`; the words are in `telegraph.ts`):

1. **Wind-up, 600 ms before the hit** (part of the beat's stagger, so part of the server's round length): red reticles on exactly the creatures it will hit (the crosshair frame on one creature, an outline of the whole zone for a zone hit, the frame on both ends for a silence), and the boss leans in.
2. **Hit:** a beam from the boss to each target (a shockwave band across the whole row for a zone hit), a slash and a red frame on the target, and a label in the boss's line under its HP bar: "Undertow · whole FRONT row", "Lightning Rod · Cindle", "Bramble Bind · both ends", "Attack · Cindle" (with ", guarding Name" when a guard took the hit), "Backdraft · reflected onto Name", and at the start of a round "Backdraft · reflects the first reaction" (the trap being set has no wind-up).
3. **Result:** the damage numbers on each target, and a blocked mark (a shield) on a creature a Shield Wall protected or that a guard stepped in for.

**One round ahead:** gimmicks are deterministic per round (`every N` triggers), so during round r the stage shows what round r+1 will bring, derived purely from the boss content and the round number (`bossWarnings` in the engine, `forecastNextRound` on the client): a banner "Next round: Undertow hits FRONT" with a warning glyph and an amber dashed frame on the zone; "Next round: Bramble Bind silences both ends" with the glyph on the creatures at the two ends that are still up; "Next round: Lightning Rod strikes your strongest" (the creature with the highest Attack is not known on the stage, so it is worded generically); "Next round: Backdraft reflects the first reaction". This lets players time Shield Wall (a press in round r takes effect in round r+1). While an attack's label shows, it sits over the forecast.

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
- It runs the same live loop and the same content pacing (`practice: true` in the snapshot), but it doesn't pay rewards and doesn't store a result or a Discord post. Even the longest practice (the 30 s lobby plus 4:24) is over inside its 10 minute window.
- It is limited to one practice per party per 10 minutes (counted from the request).

## Not in M5

- Swap requests between players (M6).
- Spectating other parties.
- Sound.
