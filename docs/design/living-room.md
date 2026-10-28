# Living room

Status: **built 2026-10-14** (planned and revised the same day: lounging choice, creature permanence, wide screens, time of day). Misa: "a cozy place where the creatures chill during downtime, so everyone can see who else has the game open."

## What players see

- A **living room** strip at the top of the app on a wide window (on a phone it is the Lounge button's sheet since 2026-10-24), in pixel art. The title row ("Leet Creatures", the currency button and "?") sits on the room's top wall band, so the room costs little extra height. The tab row stays right under the room.
- For every player who has the Activity open in the same Discord activity instance (see "Who counts as here"), their **lounging creature** sits in one of the room's 16 fixed spots: on the couch, on a chair behind the table, on the rug, on the window sill and so on. A player whose starter is not chosen yet does not appear. If there are more players than spots, the extra ones are not shown. A small "N here" pill counts everyone present.
- The room is **layered**: back props (wall, window, shelf, couch back), then the creatures, then front props (table top, couch arm, a plant), so a creature on a chair sits behind the table.
- Creatures bob gently (off under `prefers-reduced-motion`) and now and then one shows a short **speech bubble** (an emote or a two-word line from the compendium). Bubbles are local flavour only: each viewer sees their own, nothing is sent.
- **Tapping a creature** opens the existing creature popover with: whose it is, its species and nickname, level, element, shiny, its **Crafting level** and its **Explorer rank**. It works for your own creature too.
- **Currencies** leave the page body. A **currency pile** button sits in the top right, left of "?". Tapping it opens a compact popover with Bait and Essence (and their glossary tags). It is reachable from every tab.

## Lounging and creature permanence

- Each player has one **lounger**, stored on the server (`players.lounger_id`). The first time it is needed, the server picks the newest-caught idle creature that is not Rested today (a Rested one only when no other is free) and stores it. It reads only that one creature, never the player's list (2026-10-25).
- **Creature permanence:** a creature does one thing at a time. A creature on an expedition or a workshop job cannot lounge. The raid is the only exception: raiders can lounge.
- If the lounger goes to work (or stops existing, for example fused away), the next read picks a new one the same way and stores it. The choice is not remembered for later: whoever is on the couch is the lounger.
- If every creature of a player is busy, their spot shows a small note on a cushion ("All out working").
- **Choosing (2026-10-20):** three ways, all `PUT /api/lounger` (the server checks ownership and idleness). (1) On the Creatures list, each free creature that is not the lounger has a quiet armchair at the end of its name's line (icon only, the page's own colour until hovered or focused, so the list does not grow a row of buttons). (2) The creature page's "Lounge" button at the top right. (3) In the living room, the player's own creature's popover has "Swap" next to "Move": it opens the lounge swap sheet ("Who lounges?", `LoungeSwap.tsx`) listing every creature with its experience bar (the card's `XpTrack`: level tag, bar and numbers) and a Rested tag; free creatures that still earn come first, lowest level first, then the Rested ones (they can still lounge), then the lounger and the busy ones, which cannot be picked. The lounger's card says "Lounging 34 / 60 XP" (green, `--lounge`); another creature that had its 60 today says "Rested" (the same green, outlined). Busy creatures show neither.
- **Moving:** a player can drag their lounger to another spot. A mouse lifts it after a small move, a finger after a short hold (a quicker swipe still scrolls the room). While carried, every empty spot shows a glowing marker and the one under the pointer lights up; a drop elsewhere or Escape puts it back. The creature's own popover has a "Move" button for keyboards and anyone who prefers tapping: it turns the empty spots into buttons. The drag reuses `use-drag-drop.ts` (now generic over the target type) and the server call is (`PUT /api/lounge-spot`, `{ spotId }`, or null to clear). The spot belongs to the player and stays when the lounger changes. The server stores the spot with the claim time and does not check occupancy; clients seat claims in `(at, userId)` order and the older claim keeps the spot (see `decisions.md`, 2026-10-15). The spot is in `loungeSpot` of the state and in `spot` of each `POST /api/room` resident.
- Others see a change within about 45 s: while at least one other participant is present and the page is visible, each client refetches the room every 45 s (Misa approved this low-frequency poll on 2026-10-15). Alone, or with the page hidden, nothing is sent and no timer waits. Joins and the tab-switch refresh still apply.
- **Live push (2026-10-19, flag `LOUNGE_LIVE`, on everywhere since 2026-10-20):** where the server offers it, a WebSocket to the guild's object pushes a player's changed room entry to the others at once, and the 45 s poll waits while it works. Any trouble falls back to the poll. See `lounge-live.md`.

## Lounging with company (2026-10-20)

Misa: "a passive EXP tick for a creature that is lounging IF there is another creature present. An empty lounge earns no experience, but lounging with a friend does. It needs to be quite small." He chose option C of the numbers below.

- **The rule** (`RULES.experience.lounge`): the lounger earns **1 XP every 2 minutes** while its player has the room open together with at least one other player who has a creature in the room. **At most 60 XP a game day per creature** (2 hours of company); then the creature is **Rested** until the daily reset (13:37 guild time) and another creature can take its place. No cap per player, no treats, no Boons or Omens. A Rested creature can still lounge; it just earns nothing more today.
- **Why per creature, not per player.** A cap per player (60 a day whatever lounges) gives a reason to stop lounging after an hour, the opposite of the goal. A cap per creature never does: when one is Rested, swap in another. A flat amount is worth far more to a young creature (60 XP is two levels at level 1, a twentieth of one at level 20), so swapping pulls the low-level creatures into the room.
- **Where it puts a creature.** 12 hours of back-to-back 2 hour trips give one creature 120 XP (240 with treats). One creature's lounging maximum is 60, so lounging never beats playing that creature. A 3 hour evening with friends gives 90 (one creature filled, a second half); a 12 hour day of swapping every 2 hours, 360 spread over six creatures; the room left open around the clock with a friend, at most 720 over twelve creatures. The ribbons are the backstop: lounging cannot take a creature past Bronze (level 10) or Silver (20) without the ribbon's parts and trips.

| Option (2026-10-20)                     | 3 h evening       | 12 h day | Open 24/7 | Reason to stop               |
| --------------------------------------- | ----------------- | -------- | --------- | ---------------------------- |
| A. 1 / min, 60 per player a day         | 60                | 60       | 60        | after 1 h                    |
| B. 1 / min, 60 per creature a day       | 180 (3 creatures) | 720      | 1,440     | never, but a swap every hour |
| **C. 1 / 2 min, 60 per creature a day** | **90**            | **360**  | **720**   | **never; a swap every 2 h**  |
| D. 1 / 5 min, no cap                    | 36                | 144      | 288       | never; nothing to manage     |

- **Who counts as here: Discord's participant list** (since the fix of 2026-10-20; at first it was the live sockets). The server never trusts a client's list. The lounge check (`guild-core.ts`), which runs about once a minute while anyone plays to keep the lounge message true, asks Discord with the bot token who is in each tracked Activity instance (an instance is tracked from a login whose instance the server verified). Discord keeps a player listed while their tab is hidden or their phone sleeps, until they leave the Activity, so switching tabs or a dropped connection costs nobody anything, and the others keep earning with you. When Discord cannot be asked, the last list stands. Company is per instance: another player in the same instance whose lounger exists (one with every creature busy, or no creatures, keeps nobody company). The live socket is only for instant room updates now; with it off, lounging still pays.
- **Paid as time passes** (`apps/worker/src/lounge-company.ts`). At each check, everyone who was in company at the previous check and still is earns the time between (at most 3 minutes, `LOUNGE_MAX_GAP_MS`, so a stalled alarm never pays a long gap; never time from before the game day's start). The time is stored at the check that credits it: whole XP go to the lounger at once and the rest waits in the player's `carry_ms` for the next check, so nothing lives in memory and neither a deploy nor the object sleeping between checks loses any of it. (Until 2026-10-22 the time collected in memory until it made one XP, 2 minutes, while checks run a minute apart. Since the live sockets use the Hibernation API the object may be evicted between two checks, and then the time was lost every time: players in company earned little or nothing.) A Rested lounger collects nothing and writes nothing. Each player's row (`lounge_company`) keeps the time short of the next XP; each creature's row (`lounge_rest`) what it got that day. The XP goes through `awardExperience` (source `lounge`), so it banks at a ribbon or an evolution like any other.
- **On screen.** The state carries `loungeXp` (creature id to today's lounging XP). While your lounger earns (someone else in the room by Discord's list, page visible, not Rested) the server pushes each payment to your own lounge socket (`lounge-xp`: creature, XP paid today, level and experience) and the client writes it into the state, so the tag and the bar move a step each time without a reload (a level-up does one normal reload). Without the live socket (flag off, or reconnecting) the client reloads the state every 2 minutes instead (`LOUNGE_REFRESH_MS`, one XP); opening Swap reloads it too. A player in another tab is paid all the same and sees it on return.

- **Why a check a minute, not a timestamp.** Discord answers "who is in the Activity now", never "who was here since when". A single "last paid at" timestamp compared on return would pay time nobody can vouch for (did the friend leave after five minutes?). So the server samples Discord once a minute and pays the minutes between two samples that both show company: that is the timestamp idea with a witness every minute. It runs on the server whatever the players' tabs do, so nothing has to be caught up on return.
- **What players can expect** (Misa asked for the limits to be said plainly; the glossary entry says the first four):
  - 1 XP every 2 minutes while Discord shows you and another player with a creature in the same Activity; up to 60 a creature a day, then Rested until 13:37.
  - It keeps going while the game is in another tab or the phone is locked, as long as Discord keeps you in the Activity. Closing the Activity, leaving the call, or the app being shut by the phone stops it; it starts again about a minute after you are back.
  - About the first and last minute of each stretch together does not count (it takes two checks to see company).
  - A game update (a deploy) can cost up to one XP for everyone lounging at that moment.
  - Your number on screen updates about every 2 minutes; the server has it either way.
  - A creature waiting for a ribbon or its evolution keeps only the next level's XP, as from any other activity.

## Wide and narrow screens

- One canonical room, about 288x56 logical pixels, built from five furniture bays (window, couch, table, fireplace, bookshelf) with 16 spots. Every viewer has the same room and the same spot assignment, whatever their width.
- **Wide enough** (the whole room fits at an integer scale of 2 or more): the largest scale up to 4 that fits, centred, with the wall and floor continuing in plain repeating tiles to both edges so there is no letterbox.
- **Narrow** (phones, under about 576 px): scale 3, and the room scrolls sideways. Touch swipes natively; a mouse drags (a small move threshold so a tap still opens a creature). It starts centred on your own creature. Left alone for 10 s it pans slowly back and forth; any touch stops it. No pan under `prefers-reduced-motion` or while the page is hidden.
- The title row is laid over the wall band and does not scroll with the room.

## Who counts as here

The Discord Embedded App SDK already knows who is in the Activity: `commands.getInstanceConnectedParticipants()` returns the instance's participants, and the `ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE` event fires on every join and leave. Discord pushes this to each client for free, so the server needs **no presence tracking**. Presence is never carried by the live socket (see `lounge-live.md`), which only pushes changes of a resident's room entry. Without the socket, the only repeated request is the 45 s room refresh while someone else is here (see "Server load").

Limit: this is per **activity instance**. People who opened the game from different channels of the same server are in different instances and do not see each other. For a 5 to 15 player server that usually plays together this is fine; a guild-wide room would need a server heartbeat and is not worth its cost now.

## Server load

- One new endpoint, `POST /api/room`, asked **only for players this client does not know yet**: once when the game opens (everyone present) and once per join (just the newcomer, debounced 2 s so a burst is one request). Leaves cost nothing (the client drops the creature).
- About `n` requests per join across `n` open games. Ten players drifting in over an evening is about 50 small requests in total. No timers, no repeat fetches while idle.
- Your own creature comes from your own game state, so it updates when you train it without any request.
- A tab switch refreshes the room data only when it is over 60 s old (one request for everyone present).
- With the live socket (flag on): no poll while it works; one ticket request and one room fetch per (re)connect, then pushes. Costs and limits: `lounge-live.md`.
- While others are present: one request every 45 s per open, visible game. Five players for two hours a day is about 800 requests a day (about 24,000 a month), far inside the free plan's 100,000 a day and about 0.2% of the paid plan's monthly Worker requests.

## Design details (for implementers)

### Shared rule (`packages/game`)

None any more: the pick is one indexed query in the worker (`Lounge.pickFree`). Until 2026-10-25 `pickLounger(idleIds, rng)` drew one id at random.

### Worker

- `POST /api/room`, body `{ userIds: string[] }` with a strict valibot schema: 1 to 25 unique snowflakes, unknown keys rejected. Normal session auth and the per-player rate limit. Identity comes from the session; the ids are only who to look up.
- Migration: `ALTER TABLE players ADD COLUMN lounger_id TEXT` (nullable).
- `resolveLounger(userId)`: returns the stored lounger if it exists, belongs to the player and is idle; otherwise picks the newest idle one that is not Rested today, stores it (or null) and returns it. Used by `GET /api/state` (new field `loungerId`) and `POST /api/room`.
- `PUT /api/lounger`, body `{ creatureId }`: 404 `creature_not_found` unless the player owns it, 409 `creature_busy` if it is on an expedition or a job. Answers `{ loungerId }`.
- `POST /api/room` answers `{ residents: [{ userId, name, creature }] }` for the ids that are players of **this guild** with a starter; other ids are left out silently. `name` is the stored, sanitised display name. `creature` is null when everything is busy, else `{ id, species, shiny, level, nickname, quirk, craftingLevel, explorerRank, firstOnServer, gear }` (`firstOnServer`: its owner holds the "first on server" record for its species or line; the popover shows the tag).
- Privacy: this shows one creature of a guild-mate, which is the same kind of data the raid roster already shows to the server. A client can ask about any guild member id; that is acceptable for this data and capped at 25 ids a request.

### Activity

- `boot()` keeps the `DiscordSDK` and hands a small `ParticipantSource` (current ids plus subscribe/unsubscribe) to the game, so tests and the workbench use a fake. Outside Discord, or if the SDK call fails, the room shows only your own creature.
- `room-layout.ts` (pure): the room's spots (`x`, `y`, layer order), the scale and scroll mode for a width, and the assignment. Each participant gets a preferred spot from a hash of `instanceId + userId` (FNV-1a, no `Math.random`), then the next free spot. Everyone with the same participant list sees the same room, and it reshuffles per session. Tested.
- `room-art.ts` (sprite data, `SpriteDef`s in the existing format, each prop at most 64x64, placed on a back or front layer): the 288x56 room with a plain wall band of about 14 pixels for the title row, repeating wall and floor edge tiles, 16 spots for 16x16 creatures, and the cushion note.
- `LivingRoom.tsx`: back canvas, creatures as `SmallCreature` buttons (accessible names like "Misa's Splashet, level 12") placed with `cssVars`, front canvas. Bubbles: one timer, a random gap of 8 to 20 s (from `crypto.getRandomValues`), paused while `document.hidden`.
- `CurrencyPile.tsx`: an icon button with an accessible label carrying both amounts, opening a popover through the existing popover shell. `Game.tsx` stops drawing the two balance lines; the header moves into a small `AppHead` that gets the balances when the game is loaded.
- The creature popover's `CreatureInfo` gains optional `owner`, `craftingLevel` and `explorerRank`.
- Workbench entries for `LivingRoom` (presets: alone, 4 players, full room, overflow) and `CurrencyPile`.
- Compendium: the room's name and the bubble lines go in `docs/compendium/places.md`.

## Time of day

The room has a day, a twilight (dawn and dusk) and a night scene, chosen from the guild-local hour by `roomPhase` in `packages/game` (night is `isNightHour`, the Moonlit Reef's window; twilight is `RULES.room.twilightHours` on each side). The window has its own rows per scene; everything else is a palette swap. The client swaps scenes with one timeout at the next boundary (`room-phase.ts`, `use-room-phase.ts`); no request is made.

## As built

- The room band is full-bleed: it spans the window width, while the title row stays aligned with the card column (`use-bleed.ts`, `AppHead.tsx`). Scale 3 with scrolling below 576 px, scale 2 to 4 above.
- `CreatureInfo` gained `ownerName`, `shiny`, `craftingLevel` and `explorerRank` (the first name was taken by replay entries). Your own creature's Crafting level shows once the gear view has loaded.
- The currency popover has its own small shell, because the glossary tags inside it open popovers of their own.
- `POST /api/room` rejects duplicate ids (400) rather than merging them.
- The popover also shows the **items the creature wears**, one row each (picture in its rarity frame, name, rarity and slot badges, item level and the text of its lines): the standard gear list (`GearList`), locked and listing only what is worn. The room's `creature.gear` is the state view's `Creature.gear` (a list, at most one item per slot) plus `lines`, the text of each item's lines, because a guild-mate's gear list is not available to the client. Nothing shows when nothing is worn; no ids of unworn items leave the server.

## Not in this version

Real chat, guild-wide presence across channels, creatures walking between spots, and avatars. The live socket does not carry presence either; it only speeds up changes.
