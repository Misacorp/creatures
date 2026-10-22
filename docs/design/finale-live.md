# Finale live: WebSocket push for the Sunday finale

Status: **built 2026-10-22 behind the `FINALE_LIVE` flag: on locally and in staging, off in production** until Misa has watched a finale (or a practice finale) on staging. Builds on `lounge-live.md` (the socket machinery, in production since 2026-10-20), `m5-finale.md` (the fight, its schedule and its snapshot) and `docs/research/platform.md`.

## What it does

While the finale screen shows a lobby or a fight and the server offers the socket, the client keeps one WebSocket open to the guild's Durable Object. The server pushes the caller's own snapshot (the answer of `GET /api/raid/live`, built by the same code) when:

1. **A round starts**, when the lobby turns into the fight, and when the fight ends (the done snapshot with the player's loot). Nothing ticks: the fight is derived from the clock (`evaluate`, `roundStartsOf`, `nextRoundAt`), and the Durable Object **alarm** wakes the object at the next round start while any finale socket is open.
2. **Someone in the party presses Fire, Hold or Unhold** (or starts a practice fight): the party's _other_ sockets get a fresh snapshot right after the action succeeded. The actor gets the HTTP answer.
3. **A socket opens or closes**: the whole party gets a snapshot (the "watching" list changed; the opener gets its first snapshot without a request).

Practice fights (staging) work the same: the practice start, its rounds and its end are pushed to the party's sockets.

The socket is **an accelerator.** Everything it carries can also be fetched with `GET /api/raid/live`. If the socket is off, unsupported, refused or dropped, the screen polls every 2 s exactly as before. While it is live, the 2 s poll stops and a slow **safety poll** stays (every 15 s, and once 2.5 s after the next round boundary if no push arrived), so a missed alarm or push can never freeze the fight.

## One socket module, topics

The lounge's machinery is generalised, not copied:

- `live-socket.ts` (server): the sockets of a guild, the tickets, the caps, stale pruning, the upgrade. Every socket is tagged `u:<userId>` and `t:<topic>`: `t:lounge` or `t:finale:<week>:<party>` (`live-topic.ts`). Pushes go to the sockets of one topic: a lounge socket never gets a finale message and the other way round (tested).
- `lounge-live.ts`: the lounge's push (`LoungePush`), unchanged in behaviour: it writes to `t:lounge` sockets only.
- `finale-live.ts`: the finale's push (`FinalePush`).
- `live-hub.ts`: owns the three for `GuildWorld`; `GuildCore` sees it as `LiveHooks`.
- `live-ticket.ts` (was `lounge-ticket.ts`) and `live-routes.ts` (was `lounge-live-routes.ts`).
- Client: `live-socket.ts` (was `lounge-socket.ts`; one controller with an `onMessage`), `finale-socket.ts` (the finale's ticket, address and message check), `finale-poller.ts` (the poll and the socket together), `live-flags.ts` (the flag from `/api/config`).

### Tickets and topics

The ticket mechanism is the lounge's: `l1.<guildId>.<secret>.<mac>`, one use, 30 s, MAC checked at the Worker before any object is addressed. The **topic is not in the ticket string**: the object stores it next to the user id in its in-memory ticket book when it mints the ticket, so a client cannot pick or change it.

| Route                          | Body              | Topic chosen by the server                                                                                                                                                     |
| ------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/lounge/ticket`      | none              | `lounge`                                                                                                                                                                       |
| `POST /api/finale/ticket`      | `{ week, party }` | `finale:<week>:<party>`, only if `week` is the current raid week and the session's player is a member of that party (`403 forbidden` otherwise; strict schema, `400` for junk) |
| `GET /api/lounge/live?ticket=` | (upgrade)         | opens only a lounge ticket                                                                                                                                                     |
| `GET /api/finale/live?ticket=` | (upgrade)         | opens only a finale ticket (a ticket of the other kind answers `401`)                                                                                                          |

A practice fight needs no topic of its own: it is the same party, and each socket's snapshot is whatever `selectLive` shows that player (the real fight, or the practice fight). Each route has its flag: `LOUNGE_LIVE` for the lounge routes, `FINALE_LIVE` for the finale routes (a flag that is not `"on"` makes them answer 404 at the Worker and at the object).

## Messages

Server to client, JSON text, `v: 1`:

| Message  | When                                                                  | Body                                                                                                     |
| -------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `hello`  | Once, right after a socket is accepted (both kinds).                  | `{ v: 1, type: 'hello', serverNow }`                                                                     |
| `finale` | Round start, start, end, someone's action, a socket opened or closed. | `{ v: 1, type: 'finale', snapshot }`: exactly what `GET /api/raid/live` answers for this socket's player |

The client sends only `ping`, answered by the runtime; anything else closes the socket (4002). Intents stay on their HTTP routes with their schemas, idempotency and rate limits. The snapshot can be large (every event up to the current round), so the client accepts a finale frame up to 1 MB (the lounge's frames stop at 64 KB).

The snapshot is **per player**: the server builds it with `raid.liveSnapshot(userId)` for each socket's own user (a user with several tabs gets one build). It holds that player's abilities and never the seed or another player's private data, exactly as the poll route.

## The alarm

`GuildCore.desiredAlarmAt` gets one more candidate: `live.nextFinaleAt()`, the earliest `Raid.nextPushAt(week, party, tz)` over the finale topics that have an open socket (the lobby opening, the start, the next round's start, the end of the fight; read-only, always after now). With no finale socket it is null, so the schedule is exactly what it was. The leet sync, the raid events, `unresolvedReal` settling, posts, the lounge check and the rollup are untouched and share the one alarm.

`GuildCore.alarm()` runs `catchUpRaid()` (which starts the fight and settles a fight that ended) and then `live.tickFinale()`: for each topic with sockets, if the stage (`status`, `practice`, `round`, `startsAt`) moved since the last push, every socket gets its own snapshot. The last pushed stage is kept in memory (an object that slept loses it, which costs one repeated push, never a missed one). A finale upgrade calls `ensureAlarm()` so the alarm is armed for the next round start. No `setInterval`, no `setTimeout` in the object: it can hibernate between rounds, and the alarm wakes it.

"Watching" (the names in the lobby) counts a player as watching while their finale socket is open (`RaidDeps.socketWatchers`), as well as for 10 s after a poll.

## Limits

- 64 sockets per guild, whatever their topics; 3 per player **per topic kind** (a player may hold a lounge socket and a finale socket at once, 6 at most). The 4th socket of a kind closes the oldest of that kind with 4000.
- Stale sockets (no ping for 150 s) are closed when someone connects, when a push goes out and when the alarm ticks.
- A socket is closed at 12 hours and on a deploy; the client reconnects (or polls).

## Client

- `Live.tsx` runs a `FinalePoller` (`finale-poller.ts`): the poll as before (`nextPollDelay`), or (`setLive(true)`) the safety poll (`nextLiveDelay`, `live.ts`). A pushed snapshot goes through the same `accept` as a polled one, so "newer snapshot wins" (`pickNewer`) covers both.
- It opens the socket (`finale-socket.ts`) only while the server offers it (`/api/config` has `finaleLive: true`) and the screen shows a lobby or a fight (`finaleSocketTarget`); a done or empty finale closes it. Dropping the socket polls at once and goes back to the 2 s pace; a 404 on the ticket (flag off) or a replaced socket stops it for good, as in the lounge.
- The socket controller is the lounge's (`live-socket.ts`): heartbeat 60 s, 150 s of silence is dead, jittered backoff, give-up after 6 failed tries.

## The flag

`FINALE_LIVE` in `apps/worker/wrangler.jsonc`: `"on"` at the top level (local `wrangler dev`) and in `env.staging`, **`"off"` in `env.production`**. A test pins all three. **To turn it on in production:** change `env.production.vars.FINALE_LIVE` to `"on"` in a PR and update the pin in `apps/worker/test/finale-live.test.ts`. Nothing else changes; the clients learn it from `/api/config`.

Why production stays off for now: the lounge proved that Discord's proxy carries the socket (query string, idle timeout), but the finale is the one moment a bug is expensive (a Sunday evening with everyone watching), and the pacing of the finale is being changed in parallel. Misa should watch a practice finale on staging (start one from the Raid tab, with a second player if possible), then production can follow.

## Cost

Per finale per guild, a handful of Worker and DO requests more (a ticket and an upgrade per watcher) and about one alarm per round (12 to 16) plus one wake for each socket close; the pushes themselves are free outgoing messages. The 2 s poll (15 players x 0.5 requests a second for 2:35 to 4:24 minutes, about 1,200 to 2,000 requests per guild per finale) drops to a request per 15 s. The socket is open only while the finale screen shows a lobby or a fight.

## Tests

- Worker (`apps/worker/test/finale-live.test.ts`): topic tags, the flag's configuration pin and 404s (independent from the lounge's), the ticket (flag off, non-member, wrong party and week, strict body, needs a session, a ticket opens its own kind of route only), the push (greeting with the player's own snapshot and no seed, the alarm waking at the lobby, the start, each round and the end with a socket's own snapshot and no repeat, no alarm without a socket, Fire to the other sockets and not the actor's, a refused action pushes nothing), the lounge and the finale never hearing each other, caps per kind, watching by socket and the close announcement, the practice fight, and one end to end run through the Worker. The lounge's own tests (`lounge-live.test.ts`) run unchanged apart from imports.
- Client: `live-socket.test.ts` (the controller, with finale messages), `finale-poller.test.ts` (poll and socket switching, newer wins, errors), `finale-socket.test.ts` (the socket wired to the poller; when the socket opens), `live.test.ts` (`nextLiveDelay`), `api.test.ts` (the flag, finale messages, ticket, address).
