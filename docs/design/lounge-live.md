# Lounge live: WebSocket push for the living room

Status: **prototype, 2026-10-19.** Built behind the `LOUNGE_LIVE` flag: on locally and on staging, **off in production** until Misa says so. Misa: "a prototype of websockets, but not in the raid yet. Try it in the lounge! Easier to test and opens up more cozy options." Builds on `living-room.md` (what the room shows) and `docs/research/platform.md` (what is known about Discord's proxy). The raid finale stays on polling.

## What it does

While the living room is visible and somebody else is in it, the client keeps one WebSocket open to the guild's Durable Object. When a player changes something the room shows (moves their lounger, picks another creature, levels it up, changes its nickname or gear), the server pushes that player's new room entry to everyone else's socket, so the change appears at once instead of within 45 seconds. Joins and leaves still come from Discord's participant events, as before.

The socket is **only an accelerator.** Everything it carries can also be fetched with `POST /api/room`. If the socket is off, unsupported, refused or dropped, the room polls exactly as it did before this change.

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
  | "ping" every 60 s of silence  -->  answered with "pong" by the runtime, the object stays asleep
```

- **One object, no new class.** The sockets live in the existing `GuildWorld` object, so the push happens inside the same serialised path as the writes that cause it. The code is `apps/worker/src/lounge-live.ts` (sockets, caps, push), `lounge-ticket.ts` (tickets) and `lounge-live-routes.ts` (the ticket route).
- **Hibernation API.** Sockets are accepted with `ctx.acceptWebSocket(ws, ['u:<userId>'])`; the identity is stored with `serializeAttachment`; `webSocketMessage`, `webSocketClose` and `webSocketError` are class methods. The object sets `setWebSocketAutoResponse('ping' -> 'pong')` in its constructor. No timer, interval or outbound fetch is kept for the sockets, so the object can sleep while the sockets stay open.
- **When the push runs.** After a successful non-GET request (`GuildCore.handle`), if the guild has any socket belonging to someone else, the actor's room entry is read with the same code as `POST /api/room` and compared with the last one pushed for that player (kept in memory). Only a different entry is sent, once per request, as one frame, to every socket of the guild except the actor's own (their client draws their creature from its own state). `POST /api/room` and the ticket route are skipped. A guild with nobody listening pays one `getWebSockets()` call per write and nothing else.
- **The alarm.** Neither the upgrade nor a push touches the alarm. (`ensureAlarm` only calls `setAlarm` when the wanted time is earlier than the stored one, so a request does not write a row each time.)

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

- `lounge-socket.ts` (framework-free, everything injected): fetches a ticket, opens the socket, goes live on `hello`, hands pushed residents to the room, pings after 60 s of silence (skipped while other frames arrive), treats 150 s of silence as dead, and reconnects with backoff 1 s, 2 s, 4 s up to 30 s with half-to-full jitter (dice from `crypto.getRandomValues`). It gives up after 6 tries in a row that never got a `hello` and when the ticket route says 404 (flag off). Code 4000 also stops it.
- `room-loader.ts`: `setLive(true)` stops the 45 s poll and fetches everyone once; `setLive(false)` brings the poll back; `applyResident` merges a pushed resident for someone present (never the player; their creature comes from their own state). Joins are still fetched by the debounced newcomer request, because presence is not pushed.
- `use-room.ts`: opens the socket only while the server offers it (`/api/config` has `loungeLive: true`), the page is visible and somebody else is here (`shouldOpenSocket`). Hidden or alone: no socket, no timer, no request, like the poll.
- CSP: `connect-src` lists `wss://creatures.misacorp.dev`, `wss://creatures-staging.misacorp.dev` and `wss://*.discordsays.com` next to `'self'` (older browsers do not let `'self'` cover `wss:`).

## Fallback

Anything that goes wrong lands on the old polling, never on a broken room: no `WebSocket` in the browser, flag off (the ticket route answers 404, the client stops), proxy refuses or silently drops frames (no `hello` within 15 s, or silence for 150 s), guild full, a drop. While the socket is live there is no poll; the moment it is not, the poll takes over again. The unknowns about Discord's proxy (query strings, idle timeout, mobile backgrounding) are meant to be tested by Misa on staging; the design is safe whichever way they fall.

## The flag

`LOUNGE_LIVE` in `apps/worker/wrangler.jsonc`: `"on"` at the top level (local `wrangler dev`) and in `env.staging`, `"off"` in `env.production`. A test pins that. Anything other than `"on"` makes `/api/lounge/ticket` and `/api/lounge/live` answer 404 and leaves `loungeLive` out of `/api/config`, so the client never tries. **To turn it on in production:** change `env.production.vars.LOUNGE_LIVE` to `"on"` in a PR, update the pin in `apps/worker/test/lounge-live.test.ts`, and merge. To turn it off again, change it back (a deploy also closes every socket).

## Cost and limits

TODO (the lead fills this in from the research: Free plan request and duration limits, the billing of incoming messages and auto-responses, how many requests an evening of five players costs).

## Extending this to the raid finale

The finale snapshot (`GET /api/raid/live`) is a full state each time, which is the same shape of problem: a push channel that says "something changed" or carries the new snapshot. The same pieces carry over: the ticket and upgrade, the object's sockets (a tag per party instead of per user), the client controller and the fall back to polling. What changes is the broadcaster (a round tick instead of a request), which would need an alarm per round (an alarm does not block hibernation) and a decision about where the fight's state is derived. Not done now; the finale keeps polling every 2 s until the lounge prototype has proved itself inside Discord on desktop, iOS and Android.

## Tests

- Worker (`apps/worker/test/lounge-live.test.ts`): the flag's configuration pin and 404s, ticket auth (no session, forged, replayed, wrong guild, extra parameters, not an upgrade), ticket expiry and bound, the push reaching the other sockets of the guild and never another guild's or the actor's own, no push for a change of nothing or for a read, the auto-response pair, closing an unexpected message, the per-player and per-guild caps, stale pruning.
- Client: `lounge-socket.test.ts` (connect, hello, fallback, backoff, give-up, heartbeat, dead connection, replaced), `room-loader.test.ts` (live stops the poll, applies pushes, falls back), `api.test.ts` (message parsing, flag, address), `room-data.test.ts` (when the socket opens).
