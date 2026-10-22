# Lounge live: WebSocket push for the living room

Status: **on everywhere since 2026-10-20** (Misa asked for production with lounging XP, see `living-room.md`, "Lounging with company"). Built 2026-10-19 behind the `LOUNGE_LIVE` flag, at first off in production. Misa: "a prototype of websockets, but not in the raid yet. Try it in the lounge! Easier to test and opens up more cozy options." Builds on `living-room.md` (what the room shows) and `docs/research/platform.md` (what is known about Discord's proxy). The raid finale now uses the same sockets as a second topic: see `finale-live.md` (2026-10-22).

## What it does

While the living room is visible and somebody else is in it, the client keeps one WebSocket open to the guild's Durable Object. When a player changes something the room shows (moves their lounger, picks another creature, levels it up, changes its nickname or gear), the server pushes that player's new room entry to everyone else's socket, so the change appears at once instead of within 45 seconds. Joins and leaves still come from Discord's participant events, as before.

The socket is **an accelerator for the room view.** Everything it carries can also be fetched with `POST /api/room`. If the socket is off, unsupported, refused or dropped, the room polls exactly as it did before this change.

Lounging with company does not use the socket: it pays from Discord's participant list, which the lounge check reads about once a minute (`lounge-company.ts`, `living-room.md`). (For a few hours on 2026-10-20 it paid from the sockets; a hidden tab closes its socket, so that cost players their XP.)

## How it works

```
client                          Worker                         guild Durable Object
  | POST /api/lounge/ticket  -->  (session MAC check)  -->  makes a one-time ticket (in memory)
  | <-- { ticket }
  | GET /api/lounge/live?ticket=...  (Upgrade: websocket)
  |                              checks the ticket's MAC -->  redeems it, accepts the socket
  | <-- {"v":1,"type":"hello","serverNow":...}
  | ... any player's change -->  existing HTTP route  -->  state changes, then the push:
  | <-- {"v":1,"type":"resident","resident":{...}}
  | "ping" every 60 s            -->  answered with "pong" by the runtime, the object stays asleep
```

- **One object, no new class.** The sockets live in the existing `GuildWorld` object, so the push happens inside the same serialised path as the writes that cause it. The code is `apps/worker/src/live-socket.ts` (sockets, caps, topics), `lounge-live.ts` (the lounge's push), `live-ticket.ts` (tickets) and `live-routes.ts` (the ticket routes). Since 2026-10-22 the sockets carry a **topic** (`t:lounge`, or a party's finale, `finale-live.md`); everything below describes the lounge topic, whose behaviour did not change.
- **Hibernation API.** Sockets are accepted with `ctx.acceptWebSocket(ws, ['u:<userId>', 't:lounge'])`; the identity is stored with `serializeAttachment`; `webSocketMessage`, `webSocketClose` and `webSocketError` are class methods. The object sets `setWebSocketAutoResponse('ping' -> 'pong')` in its constructor. No timer, interval or outbound fetch is kept for the sockets, so the object can sleep while the sockets stay open.
- **When the push runs.** After a successful non-GET request (`GuildCore.handle`), if the guild has any socket belonging to someone else, the actor's room entry is read with the same code as `POST /api/room` and compared with the last one pushed for that player (kept in memory). Only a different entry is sent, once per request, as one frame, to every socket of the guild except the actor's own (their client draws their creature from its own state). `POST /api/room` and the ticket route are skipped. A guild with nobody listening pays one `getWebSockets()` call per write and nothing else.
- **The alarm.** Neither the lounge's upgrade nor a lounge push touches the alarm (the finale's sockets do arm it, `finale-live.md`). (`ensureAlarm` only calls `setAlarm` when the wanted time is earlier than the stored one, so a request does not write a row each time.)

## Messages

Server to client only, JSON text, `v: 1`:

| Message    | When                                      | Body                                                                                                                                                |
| ---------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hello`    | Once, right after the socket is accepted. | `{ v: 1, type: 'hello', serverNow }`                                                                                                                |
| `resident` | A player's room entry changed.            | `{ v: 1, type: 'resident', resident }`, where `resident` is exactly one entry of the `POST /api/room` answer (`userId`, `name`, `creature`, `spot`) |

The only thing a client sends is the text `ping`. The runtime answers `pong` without waking the object. Anything else makes the server close the socket (code 4002). Intents (moving, choosing a lounger) keep using their HTTP routes, so every rule, schema, idempotency key and rate limit stays where it was. This is deliberate: incoming socket messages are billed and would need their own schema and rate limit; outgoing ones are free.

A push is **not replayed.** The client fetches the whole room once after every (re)connect, and the push replaces whatever it knows about that player.

Close codes: `4000` replaced by a newer socket of the same player (the client does not fight it, it polls), `4001` stale, `4002` unexpected message.

## Auth

Identity comes from the verified session, never from the socket. A browser WebSocket cannot send an `Authorization` header, and Discord documents nothing about `Sec-WebSocket-Protocol` through its proxy, so the socket is opened with a **one-time ticket**:

1. `POST /api/lounge/ticket` is a normal authenticated route (bearer session token, per-player rate limit). The player is the session's. The object makes a ticket `l1.<guildId>.<secret>.<mac>`: 32 random bytes, an HMAC over `l1.<guildId>.<secret>` with its own HKDF key from the Discord client secret (a different label from the session token's, so the two can never be swapped).
2. The client opens `wss://<page host>/api/lounge/live?ticket=<ticket>` (relative to the page's own host, so inside Discord it goes through the proxy like every other request).
3. The Worker parses the ticket strictly (exactly one query parameter) and checks the MAC in constant time **before** addressing any Durable Object, so junk never wakes one. The object checks that the ticket is for its own guild, redeems it (the hash of the secret is in an in-memory map: removed on use, valid 30 s, at most 200 at once) and stores the user id with the socket.

Why not the session token in the URL or a subprotocol: a URL is logged by proxies and Cloudflare; the ticket is worth nothing after one use or 30 seconds, and it is not a session token (no other route accepts it, and a session token is not a ticket). Why no origin check: Discord does not document which `Origin` its proxy forwards, and the ticket already stops cross-site opening (an attacker page cannot get a ticket, because the bearer token never leaves the Activity's memory). A ticket made before the object restarts is lost, which costs the client one retry.

A socket is closed by the server after 12 hours (the longest a session lives), and a deploy closes every socket (clients reconnect).

## Limits

- 3 sockets per player per guild; a fourth closes the oldest with 4000.
- 64 sockets per guild; further upgrades answer `503 live_full` and the client polls.
- A socket with no ping and no open for 150 s is stale (clients ping at 60 s). Stale sockets are closed when someone connects or when a push goes out; there is no timer.
- Frames are small: one resident (a few hundred bytes up to a few KB with gear).

## Client (`apps/activity`)

- `live-socket.ts` (was `lounge-socket.ts`; framework-free, everything injected): fetches a ticket, opens the socket, goes live on `hello`, hands pushed residents to the room, pings every 60 s (also while pushes arrive: the ping is the server's only sign that the player is still there; skipping it while pushes arrived made two busy players look gone, fixed 2026-10-20), treats 150 s of silence as dead, and reconnects with backoff 1 s, 2 s, 4 s up to 30 s with half-to-full jitter (dice from `crypto.getRandomValues`). It gives up after 6 tries in a row that never got a `hello` and when the ticket route says 404 (flag off). Code 4000 also stops it.
- `room-loader.ts`: `setLive(true)` stops the 45 s poll and fetches everyone once; `setLive(false)` brings the poll back; `applyResident` merges a pushed resident for someone present (never the player; their creature comes from their own state). Joins are still fetched by the debounced newcomer request, because presence is not pushed.
- `use-room.ts`: opens the socket only while the server offers it (`/api/config` has `loungeLive: true`), the page is visible and somebody else is here (`shouldOpenSocket`). Hidden or alone: no socket, no timer, no request, like the poll.
- CSP: `connect-src` lists `wss://creatures.misacorp.dev`, `wss://creatures-staging.misacorp.dev` and `wss://*.discordsays.com` next to `'self'` (older browsers do not let `'self'` cover `wss:`).

## Fallback

Anything that goes wrong lands on the old polling, never on a broken room: no `WebSocket` in the browser, flag off (the ticket route answers 404, the client stops), proxy refuses or silently drops frames (no `hello` within 15 s, or silence for 150 s), guild full, a drop. While the socket is live there is no poll; the moment it is not, the poll takes over again. The unknowns about Discord's proxy (query strings, idle timeout, mobile backgrounding) are meant to be tested by Misa on staging; the design is safe whichever way they fall.

## The flag

`LOUNGE_LIVE` in `apps/worker/wrangler.jsonc`: `"on"` at the top level (local `wrangler dev`), in `env.staging` and, since 2026-10-20, in `env.production`. A test pins that. Anything other than `"on"` makes `/api/lounge/ticket` and `/api/lounge/live` answer 404 and leaves `loungeLive` out of `/api/config`, so the client never tries. **To turn it off again:** change `env.production.vars.LOUNGE_LIVE` to `"off"` in a PR, update the pin in `apps/worker/test/lounge-live.test.ts`, and merge (a deploy also closes every socket). Lounging XP does not depend on it.

## Cost and limits

We are on the Workers **Free** plan (Misa, 2026-10-19). Figures are from Cloudflare's Durable Objects pricing and limits pages (pricing page updated 2026-10-18), the Workers pricing and limits pages, and Discord's Activities networking docs, read 2026-10-19. Redo the sums with the formulas below when the assumptions change.

**The Free limits that matter** (account-wide, all reset at 00:00 UTC, 02:00 or 03:00 in Helsinki):

| Limit                   | Free                                                      | What happens when it runs out                                                  |
| ----------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Worker requests         | 100,000 / day                                             | Error 1027: the whole Activity stops answering until the reset. The worst one. |
| Durable Object requests | 100,000 / day                                             | Further DO requests fail until the reset.                                      |
| DO duration             | 13,000 GB-s / day (an object is billed at a fixed 128 MB) | Same.                                                                          |
| SQLite rows written     | 100,000 / day                                             | Same.                                                                          |

**What the live socket costs** (this design: server to client only, hibernation, the ping answered by the runtime):

- Opening it: one `POST /api/lounge/ticket`, the upgrade, and one full room fetch. That is about 3 Worker requests and 3 DO requests. A socket closes at 12 h, on a deploy and when a phone sleeps, so count about 3 opens a day for a player who never closes the game.
- Pushes: outgoing messages are free and need no request of their own. A push rides on the HTTP request that made the change, which the game paid for before this too.
- The heartbeat: a text "ping" every 60 s, only while the lounge is visible and someone else is in it. The runtime answers it without waking the object, so it costs no duration. **Unknown:** whether such a ping counts as a DO request on Free, and whether Free applies the 1-in-20 rate for incoming messages that billing uses. So we count it both ways.
- Duration: the object hibernates between requests about 10 s after the last one, and an idle object waiting to hibernate is not billed. The socket adds no awake time beyond the requests the lounge already makes. Without hibernation (`ws.accept()`) one guild's 24/7 socket would cost 11,059 GB-s a day, 85% of the Free allowance, so hibernation is required, not an optimisation.
- Rows written: the socket itself stores nothing (tickets and the last pushed view are in memory) and never re-arms the alarm. Lounging with company writes when it pays (at most 4 rows: the player's `lounge_company` row, the creature's `lounge_rest` row, the creature row and one analytics event): once per XP earned (every 2 minutes of company), and at each of a player's own requests. A Rested lounger collects nothing and writes nothing, so a creature writes at most 60 × 4 = 240 rows a day; a player who swaps in a fresh creature every 2 hours all day writes about 30 × 4 = 120 rows an hour; the lounge check itself already wrote its instance rows once a minute.

- Lounging XP on screen (2026-10-20): while your lounger earns (someone else here, page visible, not Rested), the client reloads `GET /api/state` every 2 minutes: 30 requests an hour, and none once Rested (2 hours of company per creature), so 60 requests per creature rested. For 15 players resting one creature each a day, 900 Worker and DO requests a guild a day, far under the old poll.

**What it saves:** today's lounge polls every 45 s while anyone else is there. A player who leaves it open all day makes 86,400 / 45 = 1,920 Worker requests and 1,920 DO requests a day. The socket replaces that poll.

**Worst case: 15 players per guild with the lounge open 24/7** (per guild per day):

|                            | Polling (today)                       | Live socket, ping not counted, or counted at 1 in 20 | Live socket, every ping counted   |
| -------------------------- | ------------------------------------- | ---------------------------------------------------- | --------------------------------- |
| Worker requests            | 15 × 1,920 = 28,800                   | 15 × 9 = 135                                         | 135                               |
| DO requests                | 28,800                                | 135 + 15 × 1,440 / 20 = 1,215                        | 135 + 15 × 1,440 = 21,735         |
| DO duration                | small (awake per poll)                | about 0                                              | about 0                           |
| Guilds before a Free limit | 3 (Worker requests, 100,000 / 28,800) | about 80 (DO requests)                               | 4 (DO requests, 100,000 / 21,735) |

**A normal evening: five players for two hours:** polling costs 5 × 7,200 / 45 = 800 Worker requests. The socket costs about 5 × 3 = 15 Worker requests, plus at most 5 × 120 = 600 pings (30 if the 1-in-20 rate applies). Either way that is well under 1% of a day's allowance.

**Formulas.** P is players with the lounge open, T the seconds it is open, R the opens per player (about 3 a day all day, 1 for an evening). Polling: Worker = DO = P × T / 45. Socket: Worker = 3 × P × R; DO = 3 × P × R + pings, where pings ≤ P × T / 60, divided by 20 if the rate applies. The lounge's own changes (moving a creature, joining) are HTTP requests the game made before the socket and still makes. Each costs one Worker request, one DO request and the rows it writes.

**Paid plan ($5 a month, approved in decisions.md "Plan tier").** 10 million Worker requests and 1 million DO requests a month included, 400,000 GB-s a month and 50 million rows written. Even 20 guilds of 15 players with the lounge open all day and every ping counted (about 13 million DO requests a month) would cost about $5 + 12 × $0.15 = $6.80. With hibernation, duration stays a few hundred GB-s a month. Upgrade when the dashboard shows Worker requests or DO requests above about half the daily Free allowance. Note: the dashboard shows raw message counts, not the 1-in-20 billed figure.

**Still to measure on staging:** whether Discord's proxy keeps the `?ticket=` query, its idle timeout, and what a phone does when the app goes to the background. Then look at Cloudflare's dashboard after a day with the flag on, to see how pings count on Free.

## The raid finale

Done on 2026-10-22 as a second topic on the same sockets, ticket mechanism and client controller: see `finale-live.md`. What the lounge prototype settled (the proxy carries the socket and the query string, hibernation, the fallback to polling) is what the finale relies on. The finale's broadcaster is the Durable Object alarm at each round start instead of a request.

## Tests

- Worker (`apps/worker/test/lounge-live.test.ts`; the finale's are in `finale-live.test.ts`): the flag's configuration pin and 404s, ticket auth (no session, forged, replayed, wrong guild, extra parameters, not an upgrade), ticket expiry and bound, the push reaching the other sockets of the guild and never another guild's or the actor's own, no push for a change of nothing or for a read, the auto-response pair, closing an unexpected message, the per-player and per-guild caps, stale pruning.
- Client: `live-socket.test.ts` (was `lounge-socket.test.ts`: connect, hello, fallback, backoff, give-up, heartbeat, dead connection, replaced), `room-loader.test.ts` (live stops the poll, applies pushes, falls back), `api.test.ts` (message parsing, flag, address), `room-data.test.ts` (when the socket opens).
