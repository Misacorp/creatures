# The raid board is live

Status: **built 2026-10-26 behind the `RAID_LIVE` flag, on in local, staging and production.** Builds on `lounge-live.md` and `finale-live.md` (the socket machinery, topics and tickets), `m4-raids.md` and the 2026-10-26 raid rework (you join by placing).

## What it does

While the Raid tab shows a party's board and the flag is on, the client keeps one WebSocket open to the guild's Durable Object. When a teammate places, moves, swaps or removes a creature, or joins or leaves the raid, the server pushes **what changed** (the affected cells and the roster change) to that party's other board sockets, and the client puts it into the board it shows. The board no longer waits for a reopen, an action of your own or a phase.

Out of scope on purpose: phase results, boss HP and the readiness band are not pushed (the tab already reloads shortly after each phase is due), and the finale has its own socket (`finale-live.md`).

The socket is **an accelerator.** If it is off, unsupported, refused or down, the tab behaves exactly as before; no polling was added.

## Topic and tickets

A new topic kind `raid` with `{ week, party }` (`t:raid:<week>:<party>`, `live-topic.ts`), separate from the finale topic of the same party (a finale socket never hears a board push and the other way round, tested).

| Route                              | Body              | Topic chosen by the server                                                                                                                                                                                                         |
| ---------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/raid/board/ticket`      | `{ week, party }` | `raid:<week>:<party>`, only if `week` is the current week and the raid view would show this player that party: they are in it, or they have not joined, joining is open, they have a creature and it is `partyToJoin` (`403` else) |
| `GET /api/raid/board/live?ticket=` | (upgrade)         | opens only a raid-board ticket                                                                                                                                                                                                     |

The ticket, caps (3 per player per topic kind, 64 per guild), stale pruning and hibernation are the lounge's. The body schema is the finale ticket's (`FinaleTicketBodySchema`: strict, `week`, `party`). `RAID_LIVE` not `"on"` makes both routes answer 404 at the Worker and the object, and `/api/config` omits `raidLive`.

## The message

Server to client, JSON text, `v: 1`, after the usual `hello`:

```
{ v: 1, type: 'raid', week, party,
  cells: [{ slot, creature: null | { ownerName, species, name, level, mine: false, reach? } }],
  rowLength?: number,
  member?: { displayName, joined: boolean } }
```

- `cells` are the slots whose cell changed, with the creature as the raid view's row shows it. They are built by the one function the view uses for a cell (`cellCreature` in `raid-view.ts`). A teammate sees the actor's creatures as `mine: false` with no creature id (those are only given for your own), so one message is right for every listener. No user id, creature id or seed leaves the server.
- `rowLength` is the party's row length after the change when it is known without a read (a placement has it; a leave computes it). A client whose board has another length reloads, because every zone would move.
- `member` is set when the actor joined (their first placement) or left (their last creature came off before Phase 1). The client adds or removes the roster entry and counts the party's size up or down.

## What the server does

`Raid.place` and `Raid.unplace` describe their change (`BoardChange`: slots, creature ids, the row length when in hand, joined or left) from data they already hold. **After the transaction commits** `Raid.pushBoard` asks the live hooks whether anybody other than the actor listens to that party's board (`raidBoardListening`: a socket lookup, no database). Only if somebody does, `boardPush` (`raid-board-change.ts`) builds the message and `RaidPush` (`raid-board-live.ts`) sends it to the party's board sockets except the actor's own (their HTTP answer carries the change). A placement that changed nothing or was refused pushes nothing. A push never throws: an error is logged by name and the placement stands.

### Reads per push

- Nobody listening: **0** rows.
- A move, swap or unplace: the placed creature(s) by id (`creatures`, its talents, its worn gear) and the actor's name: **about 10 rows for a two-creature swap**, fewer for one cell. Never a scan of placements, players or the roster (a test asserts at most 15 and that the placement itself reads the same with or without a listener, within that).
- A leave additionally works out the party's row length once (`partyRowLength`: the active roster and the party's members, about 60 rows in a 12 player guild). Leaves are rare (the last creature coming off before Phase 1).
- The `read-budget` hot paths do not change (the push only exists on placement writes).

## Client

- `use-raid-board-live.ts` (used by `Raid.tsx`) opens the socket when the server offers it (`/api/config` `raidLive`), a party is shown and the finale is not on screen, and closes it when the tab is left or the party changes. The socket is `raid-board-socket.ts`: `live-socket.ts` (the lounge's controller, heartbeat and backoff) with the board's ticket and address.
- A pushed message is checked strictly by `parseBoardPush` (exact keys, sizes, types; a teammate's cell is never `mine` and has no creature id) and applied in place by `applyBoardPush`. If it is junk or cannot be applied (another party or week, an unknown slot, another row length, a cell of yours it would overwrite, a leaver who is not on the roster) the tab does **one normal `fetchRaid()` reload** (one at a time).
- A socket that comes back after a drop reloads once, because pushes may have been missed meanwhile. The first connect does not (the view was just loaded; a placement in the fraction of a second between the load and the socket opening would show at the next refresh).
- Not done: answering the player's own placement with the same compact change instead of the full view. The HTTP routes keep returning the whole view; the client replaces its view with it as before. It would need the client to merge an answer into a view that may be stale, for a saving of one small response.

## Known limits

- Only the party of the board you look at is pushed. The roster and sizes of other parties are not (they refresh on a reload).
- A player previewing the party they would join keeps looking at it if another joiner makes a different party the smallest; the next reload corrects it.
- The unplace of a creature that does not leave the party does not send a row length; if that ever shrinks the row (a party that grew past its roster share), the empty slots at the end stay until a reload.
- The `guests` flag of the view is not updated by a push (the client does not use it).

## The flag

`RAID_LIVE` in `apps/worker/wrangler.jsonc`: `"on"` at the top level, in `env.staging` and in `env.production`. A test pins all three. Turning it off in a PR is the one switch; clients learn it from `/api/config`.

## Tests

- Worker (`apps/worker/test/raid-board-live.test.ts`): topic tags, the flag's pin, `/api/config` and the 404, the ticket (flag off, member, the party a newcomer would join, wrong party and week, no creature, joining closed, strict body, needs a session, opens its own route only), the push (one message to teammates and not to the actor, another party, the lounge or the finale sockets of the same player; both cells of a swap; a move; an unplace; a leave; nothing for a refused or unchanged placement; through the real route; the cell equals the view's cell; a failing push never breaks the placement; flag off), and the read counts.
- Client: `raid-board-live.test.ts` (parse, apply), `raid-board-socket.test.ts` (the socket, reloads), `use-raid-board-live.test.tsx` (lifecycle tied to the tab), `api.test.ts` (flag, message, ticket, address).
