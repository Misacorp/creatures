# Living room

Status: **planned 2026-10-14**. Misa: "a cozy place where the creatures chill during downtime, so everyone can see who else has the game open."

## What players see

- A **living room** strip at the top of the app, in pixel art. The title row ("Leet Creatures", the currency button and "?") sits on the room's top wall band, so the room costs little extra height. The tab row stays right under the room.
- For every player who has the Activity open in the same Discord activity instance (see "Who counts as here"), their **showcase creature** sits in one of the room's fixed spots: on the couch, on a chair behind the table, on the rug, on the window sill and so on. A player whose starter is not chosen yet does not appear. If there are more players than spots, the extra ones are not shown.
- The room is **layered**: back props (wall, window, shelf, couch back), then the creatures, then front props (table top, couch arm, a plant), so a creature on a chair sits behind the table.
- Creatures bob gently (off under `prefers-reduced-motion`) and now and then one shows a short **speech bubble** (an emote or a two-word line from the compendium). Bubbles are local flavour only: each viewer sees their own, nothing is sent.
- **Tapping a creature** opens the existing creature popover with: whose it is, its species and nickname, level, element, shiny, its **Crafting level** and its **Explorer rank**. It works for your own creature too.
- **Currencies** leave the page body. A **currency pile** button sits in the top right, left of "?". Tapping it opens a compact popover with Bait and Essence (and their glossary tags). It is reachable from every tab.

## Who counts as here

The Discord Embedded App SDK already knows who is in the Activity: `commands.getInstanceConnectedParticipants()` returns the instance's participants, and the `ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE` event fires on every join and leave. Discord pushes this to each client for free, so the server needs **no presence tracking, no heartbeat, no WebSocket and no polling**.

Limit: this is per **activity instance**. People who opened the game from different channels of the same server are in different instances and do not see each other. For a 5 to 15 player server that usually plays together this is fine; a guild-wide room would need a server heartbeat and is not worth its cost now.

## Server load

- One new endpoint, `POST /api/room`, asked **only for players this client does not know yet**: once when the game opens (everyone present) and once per join (just the newcomer, debounced 2 s so a burst is one request). Leaves cost nothing (the client drops the creature).
- About `n` requests per join across `n` open games. Ten players drifting in over an evening is about 50 small requests in total. No timers, no repeat fetches while idle.
- Your own creature comes from your own game state, so it updates when you train it without any request.

## Design details (for implementers)

### Shared rule (`packages/game`)

`showcaseCreature(creatures)`: the highest level; ties by more fusions, then shiny, then oldest catch (lowest id order the server already uses). Pure, tested, used by the server and by the client for the player's own creature.

### Worker

- `POST /api/room`, body `{ userIds: string[] }` with a strict valibot schema: 1 to 25 unique snowflakes, unknown keys rejected. Normal session auth and the per-player rate limit. Identity comes from the session; the ids are only who to look up.
- The guild's Durable Object answers `{ residents: [{ userId, name, creature: { species, shiny, level, nickname, element, craftingLevel, explorerRank } }] }` for the ids that are players of **this guild** with a starter; other ids are left out silently. `name` is the stored, sanitised display name. One read-only query batch, no writes.
- Privacy: this shows one creature of a guild-mate, which is the same kind of data the raid roster already shows to the server. A client can ask about any guild member id; that is acceptable for this data and capped at 25 ids a request.

### Activity

- `boot()` keeps the `DiscordSDK` and hands a small `ParticipantSource` (current ids plus subscribe/unsubscribe) to the game, so tests and the workbench use a fake. Outside Discord, or if the SDK call fails, the room shows only your own creature.
- `room-layout.ts` (pure): the room's spots (`x`, `y`, layer order) and the assignment. Each participant gets a preferred spot from a hash of `instanceId + userId` (FNV-1a, no `Math.random`), then the next free spot. Everyone with the same participant list sees the same room, and it reshuffles per session. Tested.
- `room-art.ts` (sprite data, `SpriteDef`s in the existing format, each prop at most 64x64): room about 112x56 logical pixels with a plain wall band of about 14 pixels for the title row; 8 spots for 16x16 creatures. Drawn at the largest integer scale that fits the card width (3 at 390 px).
- `LivingRoom.tsx`: back canvas, creatures as `SmallCreature` buttons (accessible names like "Misa's Splashet, level 12") placed with `cssVars`, front canvas. Bubbles: one timer, a random gap of 8 to 20 s (from `crypto.getRandomValues`), paused while `document.hidden`.
- `CurrencyPile.tsx`: an icon button with an accessible label carrying both amounts, opening a popover through the existing popover shell. `Game.tsx` stops drawing the two balance lines; the header moves into a small `AppHead` that gets the balances when the game is loaded.
- The creature popover's `CreatureInfo` gains optional `owner`, `craftingLevel` and `explorerRank`.
- Workbench entries for `LivingRoom` (presets: alone, 4 players, full room, overflow) and `CurrencyPile`.
- Compendium: the room's name and the bubble lines go in `docs/compendium/places.md`.

## Not in this version

Real chat, choosing which creature to show, guild-wide presence across channels, creatures walking between spots, and avatars.
