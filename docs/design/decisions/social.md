# Living room, lounge and Discord

The living room and lounging, the lounge message, Discord DMs and other social features.

<!-- Maintained with `pnpm decisions`; see README.md. Newest first. -->

## 2026-10-25: Opt-in Discord DMs, derived from the game's tables

ID: `2026-10-25-opt-in-discord-dms-derived-from` · Status: current

Misa chose four kinds of DM from the game's bot, all off by default: a trip comes home, a Workshop job is done, the raid finale starts in 10 minutes, the Prize Stall opens. Design in `dm-notifications.md`.

- **Derived, not hooked.** No hook goes into sending, starting a job or claiming. A scan reads the trips, jobs, raid week and stall day for events that came due for opted-in players (run in one transaction from the alarm and `ensureAlarm`, never throwing). It keeps the existing paths untouched and makes a late or repeated alarm harmless.
- **One DM per scan per player.** A player's new lines go into one message, so three trips ending together are one DM, not three pings.
- **Never twice, never old.** `dm_sent` holds one row per notified event. An event counts only if it came due after its kind was turned on (`<kind>_on_at`, so turning one on never floods old events) and within the last 12 hours (a long outage sends no stale pings). A trip that was claimed, recalled or cancelled first is never pinged; a chosen push-on pings again at its own end. The finale and stall keys include the player (`finale:<week>:<user>`), as `dm_sent` has one key space.
- **Server state, in the guild's Durable Object** (migration 41: `dm_prefs`, `dm_outbox`, `dm_sent`, and partial indexes on open trips and jobs so the alarm's "next due" lookup stays cheap). The queue, claims, backoff and give-up mirror the announcement posts; the sender is separate (`dm-send.ts`) so a DM can open a channel first, but reuses `createPostSender` for the message (no mentions, 429 handling).
- **Blocked players.** Discord answers 403 when a member does not accept DMs from this server. The player is marked blocked, nothing more is queued for them, and Settings explains how to allow DMs; changing any setting clears the block and tries again with a welcome DM. A 404 on a cached DM channel is forgotten and opened again once.
- **Welcome DM** when a player turns on their first kind (and when they try again after a block), at most once an hour. It tells them what they will get and proves DMs reach them; a block shows in the UI.
- **No sender, no DMs.** Without a configured sender (tests, local dev) nothing is queued or scheduled, and the API says `available: false`, which hides the section.
- **An exception to "settings stay on the device".** The Discord DMs section of Settings holds server settings (loaded when the page opens, saved on each change). The board's display options stay on the device. `ux-patterns.md` says so.
- **Privacy.** Logs and analytics hold kinds only (`dm_pref`, `dm_result`); no ids, tokens or text.

## 2026-10-22: Lounging time is stored at every check

ID: `2026-10-22-lounging-time-is-stored-at-every` · Status: current · Amends: `2026-10-20-lounging-xp-the-evening-check`

Misa: "the lounge experience counting is definitely flawed in some way". The cause: company time collected in memory until it made one XP (2 minutes), while the lounge check runs a minute apart. The live sockets (2026-10-19) use the Hibernation API, which lets the runtime evict the object while it sleeps between two alarms, and then the collected minute was lost every time: two players could sit together for an hour and earn nothing. A test that restarts the object between every check paid 0 XP for 20 minutes together before the fix and 10 after.

- **Every check stores what it credits.** Whole XP go to the lounger and the remainder goes to `lounge_company.carry_ms` in the same transaction, which already existed for the remainder. Nothing is held in memory, so the "flush at the player's own request" is gone too.
- **Cost:** one small transaction per player in company per minute (at most about 15 in a guild), plus the XP row every 2 minutes. That is fine for a Durable Object's SQLite.
- **Kept:** company is still needed at two checks in a row (a new arrival earns from their second check), and the 3 minute gap cap stays.

## 2026-10-20: Lounging XP, the evening check

ID: `2026-10-20-lounging-xp-the-evening-check` · Status: current, amended by `2026-10-22-lounging-time-is-stored-at-every` · Amends: `2026-10-20-lounging-xp-fixes-after-the-first`

Misa: "People report not getting as much exp as they expect, and even losing some if the game disconnects… I want to make sure our end of the deal is solid." The production report could not help yet (it covers days up to two days back; lounging went live today), so the code was audited for every way our end loses time.

- **Deploys lost up to 10 minutes a player.** Collected time was paid every 10 minutes and lived in the guild object's memory; every deploy restarts the object (and closes every socket, which players see as a disconnect). There were three deploys on the first evening. **Fix:** each XP is paid as soon as it is earned (`LOUNGE_FLUSH_MS` is one XP, 2 minutes), so a restart loses under one XP. Writes stay bounded by the cap (60 payments a creature a day), and a Rested lounger now collects nothing and writes nothing.
- **A tag that seemed to go back a step.** Two background state reloads at once (the 2-minute one and a tab switch) could answer out of order, and the older one landed last. Only the newest reload is applied now (`refreshState` in `Game.tsx`).
- **Not ours, but worth knowing:** "Lounging 34 / 60" starts over at the daily reset (13:37); the XP bar drops at a level-up; a creature waiting at a ribbon or its evolution keeps only the next level's XP, as from any activity; the first minute after someone joins and the last before they leave count for nobody (company is measured at two checks a minute apart); and when Discord drops a player from the Activity (a crash, a reload into a new session), they stop counting until it lists them again.

## 2026-10-20: Lounging XP fixes after the first production test

ID: `2026-10-20-lounging-xp-fixes-after-the-first` · Status: current, amended by `2026-10-20-lounging-xp-the-evening-check` · Amends: `2026-10-20-lounging-with-company-earns-xp-the`

Misa and a friend lounged together in production and saw no XP ("My friend said they had to swap their lounging creature to another one in order to start gaining experience"). Then: "Let's say I never actually disconnect from the lounge, just switch tabs… When I return to the game, can we sync the missing intermediate time… Ideally other players who don't know that I'm in another browser tab would see their EXP tick up naturally."

- **The bug: the client skipped its ping while pushes arrived.** The server counted a socket as present only while it pinged (150 s), but the client pinged only after 60 s with nothing received. Two players moving creatures push to each other often, so neither pinged: the server saw both as gone (no company time), and the next push closed their sockets as stale. **Fix:** the client pings every 60 s whatever arrives (`lounge-socket.ts`), which keeps the live room healthy too.
- **Presence moves to Discord's participant list**, which the server already reads with the bot token about once a minute for the lounge message. A hidden tab closes the socket on purpose (to save requests), but Discord keeps the player listed until they leave the Activity, so now a tab switch, a sleeping phone or a dropped connection costs nobody XP, and the others' XP keeps going up. The sockets are only for instant room updates again (the socket presence code of the first version is gone).
- **Paid as it happens, not when you return:** each check credits the minute to everyone together at both ends of it (at most 3 minutes for a late check; never before the day's start); it is paid every 10 minutes, when someone leaves company, at the daily reset (to the old day), and at the start of the player's own request. If the guild's object is evicted, under 10 minutes of unpaid time can be lost. When Discord cannot be asked, the last list stands.
- **Showing it:** the client reloads the state every 2 minutes (one XP) while it earns (someone else here by Discord's list, page visible, not Rested) and when Swap opens. Misa asked why 4: it was to halve requests; 2 minutes shows every step.
- **Trade-off:** someone who leaves the Activity open while away counts as present, as before; the 60-per-creature daily cap bounds it.

## 2026-10-20: Lounging with company earns XP; the live lounge goes to production

ID: `2026-10-20-lounging-with-company-earns-xp-the` · Status: current, amended by `2026-10-20-lounging-xp-fixes-after-the-first` · Amends: `2026-10-19-websocket-push-for-the-lounge-as`

Misa: "Let's enable the websocket based lounge for production… I'd also like to include a passive EXP tick for a creature that is lounging IF there is another creature present. An empty lounge earns no experience, but lounging with a friend does. It needs to be quite small." On the cap: "If we cap it at 60 EXP per day, then that means that players will have the incentive to stop lounging at some point. If we can give each creature 60 daily EXP for lounging, we'll encourage leveling up those lower leveled creatures." He chose option C of `living-room.md`, "Lounging with company".

- **The rule:** 1 XP every 2 minutes with company, at most 60 a game day **per creature** (then Rested), no cap per player, no treats or weather. `RULES.experience.lounge` (`msPerXp`, `dailyCap`); the glossary entry `lounging` says the same numbers and a test keeps them in step.
- **Presence came from the live sockets, not the client** (replaced the same day by Discord's participant list, see "Lounging XP fixes after the first production test"). The participant list is the client's word; a socket's owner is proven by a ticket of an authenticated request and its lifetime is the server's own record. So lounging pays only through the socket, and `LOUNGE_LIVE` is now on in production too (`wrangler.jsonc`, pinned by a test). Polling clients see the room but earn nothing. A script holding a socket open with a friend's earns at most 60 per creature a day and cannot pass a ribbon: not worth more defence.
- **Paid lazily, without timers or alarms** (`lounge-company.ts`): on every socket join and leave (the leaver still counts until then) and at the start of a player's own request (so a swap pays the old lounger first). Per player, `lounge_company` keeps up to when they were paid; per creature, `lounge_rest` keeps today's XP. Time before the current game day's start is never paid, so a session across the reset loses its last few minutes of the old day rather than paying them to the new one. Spans use real time; the game day follows the dev clock where it runs. Migration 35.
- **The state** has `loungeXp` (creature id to today's XP); it refreshes with any request of the player (not pushed).
- **UI.** The lounger's tag: "Lounging 34 / 60 XP", then "Lounging · Rested" (filled green); another creature at the cap: "Rested" (outlined green). Both open the `lounging` glossary entry. Colour token `--lounge` (today `--good`), so lounging can change colour in one place. **Choosing:** a quiet icon-only armchair at the end of a free creature's name line on the Creatures list (Misa wanted a Lounge button there without noise or bloat: no button face, no words, the page's colour until hovered or focused; the lounger and busy creatures have none, a Rested one keeps it); the page's Lounge button; and "Swap" beside "Move" in the popover of your own creature in the room, opening the "Who lounges?" sheet (the raid picker's `RosterPicker`, with each creature's experience bar (as on the card) and Rested; free ones that still earn first, lowest level first; reasons on the right). The popover takes several actions now (`action` may be a list).
- **The creature popover, brought up to date** (Misa: "change the name color to match the rarity and add a tag for the rarity too… consider using the new data table"). Everywhere a small creature opens its popover (the room, the raid board, the dungeon team, the stage): the name in its rarity's colour at the heading size, as on the card; the tags under it are the rarity, the element and role, and Shiny, each a chip that opens its explanation inside the popover; the facts (Level, Owner, Species of a nickname, Crafting level, Explorer rank) are a `DataTable` in the pixel font, as the creature page's tables (the body font looked wrong to Misa); a board's effect stays one sentence under it; worn items and the buttons as before. `creatureFactRows` replaces the bullet lines of `creatureFacts`.
- **Your own lounger's popover in the room** has its card's Lounging tag too ("Lounging 34 / 60 XP", then "Lounging · Rested"; Misa: "Just for my own creature though"). Other players' creatures show none: their XP is not sent to you.
- **A long name and the card's armchair:** the armchair never moves or wraps; the name gives way. At 390 px a 20-letter name still fits; at 360 px the longest names end in "…" a few letters earlier than before (the full name is the button's title and on the page).

## 2026-10-19: WebSocket push for the lounge, as a prototype behind a flag

ID: `2026-10-19-websocket-push-for-the-lounge-as` · Status: current, amended by `2026-10-20-lounging-with-company-earns-xp-the` · Amends: `2026-10-15-a-45-s-living-room-refresh`

Misa: "a prototype of websockets, but not in the raid yet. Try it in the lounge! Easier to test and opens up more cozy options." Misa is on the Cloudflare Workers Free plan, and nobody deploys staging or production overnight. Design in `docs/design/lounge-live.md`.

- **What.** The guild's `GuildWorld` object accepts lounge sockets with the **Hibernation API** (`acceptWebSocket`, per-socket identity in the attachment, `setWebSocketAutoResponse('ping', 'pong')` as the heartbeat). After a successful change request it pushes the actor's room entry (the same shape as one `POST /api/room` resident) to the guild's other sockets. No new Durable Object class: the push belongs to the same serialised path as the write that causes it.
- **Server to client only.** A client sends only `ping`. Intents stay on their HTTP routes, so no new schema or rate limit is needed and incoming socket messages (billed) stay near zero. Any other incoming text closes the socket (4002).
- **Auth by one-time ticket.** `POST /api/lounge/ticket` (normal session auth) makes a 30 s, single-use ticket with its own MAC; the socket opens with `?ticket=`. A browser cannot set `Authorization`; Discord documents nothing about `Sec-WebSocket-Protocol`; a URL may be logged, so the ticket must be worthless after use. The Worker checks the MAC before waking any object. No origin check (Discord does not say what origin its proxy forwards; the ticket already blocks cross-site use).
- **Limits.** 3 sockets per player (oldest closed, the client does not fight), 64 per guild (503, the client polls), stale after 150 s without a ping (checked on connect and on push, no timers), 12 h maximum age.
- **Cheap on Free.** Hibernation, a 60 s client ping that the runtime answers without waking the object, no timers or outbound fetches for the sockets, no push when nobody else listens, no push for a change of nothing, no alarm writes (`ensureAlarm` already only sets an earlier alarm). The client opens the socket only while the page is visible and somebody else is in the room.
- **Fallback is the old poll.** While the socket is live the 45 s poll waits; on any failure (unsupported, flag off, refused, no hello in 15 s, silent for 150 s, drop) the poll comes back. Reconnects use backoff 1 s to 30 s with jitter, give up after 6 failures in a row, and fetch the whole room once after each connect (a push is not replayed).
- **Flag.** `LOUNGE_LIVE`: on locally and on staging, **off in production** (pinned by a test). Off means both routes answer 404 and `/api/config` omits `loungeLive`. `wrangler.jsonc` gained this var, `worker-configuration.d.ts` was regenerated, and the activity's CSP `connect-src` lists `wss://` hosts explicitly.
- **Not done.** Presence is not pushed (Discord's participant events stay the source). The raid finale keeps polling; the design doc says how it could reuse the pieces.

## 2026-10-18: The lounge message replaces Discord's launch card

ID: `2026-10-18-the-lounge-message-replaces-discord-s` · Status: current

**Problem.** Discord's default Launch command posts a "Game invitation" card on every launch, which later reads "Game ended. Start a new one?". In an active server the channel filled with these cards and people got notified each time someone started playing.

**Decision.** Launch uses the app handler and is answered with LAUNCH_ACTIVITY, which posts nothing. The game keeps one message per server in the announcement channel, edited in place, showing who is playing, with a Play/Join button that launches the same way (design in `docs/design/lounge-message.md`). Presence comes from Discord's activity instance API, already used at login, polled once a minute while a session is tracked: no client heartbeat and nothing a client could fake. A buried message is reposted silently when a new session starts; Misa chose silent reposting over pinning, and the raid post channel over the last launch channel.

**Why.** It keeps joining one click away (the lounge) without a new message per launch. Edits never notify, and a repost is `@silent`. The deploy job switches the handler only while the Interactions Endpoint URL is ours, and going back is one constant.

## 2026-10-15: A 45 s living-room refresh while others are present

ID: `2026-10-15-a-45-s-living-room-refresh` · Status: current, amended by `2026-10-19-websocket-push-for-the-lounge-as` · Amends: `2026-10-14-living-room-presence-comes-from-the`

**Decision.** While at least one other participant is in the activity instance and the page is visible, each client refetches `POST /api/room` every 45 s (one `setTimeout` chain in `room-loader.ts`). Alone or hidden, no timer waits. Misa approved low-frequency polling so lounger and spot changes reach others without a join.

**Cost.** Five players for two hours a day is about 800 requests a day, about 24,000 a month: well inside the free plan's daily limits and a fraction of a percent of the paid plan's included requests.

**Alternative kept for later.** Durable Object WebSockets with the Hibernation API would make updates instant and allow guild-wide presence at near-zero cost, but they need reconnect handling, a heartbeat through Discord's proxy, careful upgrade auth and a guard that nothing keeps the object awake. Not done until planned.

**Also.** `useDragDrop` is generic over the target type: the raid board and the dungeon keep their slot targets by default, and the living room passes its own `locate` (spot ids).

## 2026-10-15: A player's living-room spot is stored per player; the client settles conflicts

ID: `2026-10-15-a-player-s-living-room-spot` · Status: current

**Decision.** A player can drag their lounging creature to another spot of the living room, and everyone sees it there. The spot belongs to the **player**, not to the creature: it is stored on the player (`players.lounge_spot`, an id from `ROOM_SPOT_IDS` in `packages/game`, and `players.lounge_spot_at`, the server time of the claim; migration 23, both nullable) and stays when the lounger changes. `PUT /api/lounge-spot` takes `{ spotId: string | null }` (a string must be one of the 16 ids; null clears both columns) and answers `{ spot: { id, at } | null }`. `POST /api/room` residents carry the same `spot`, and the player's own state carries `loungeSpot`. A stored id that is no longer a known spot reads as null.

**Conflicts.** The server does not check whether a spot is taken: presence is per Discord activity instance (see `living-room.md`) and the server does not know who is in which instance, so it cannot tell who competes for a spot. Instead every client uses the same rule, so everyone with the same participant list sees the same room. It seats the present players in `(at, userId)` order (a player with no claim sorts last): each keeps their claimed spot unless an earlier claim already holds it, in which case they, like everyone who never chose, get the hash-based spot (`instanceId + userId`, then the next free one). The older claim keeps the spot. Nobody is ever shown twice on one spot, and nothing is lost: the stored claim stays and takes effect again when the earlier claimer is not in the instance.

**Why.** It is one small write per drag and no presence tracking, heartbeat or WebSocket, which keeps the idle game silent. The ids are duplicated in the Activity's `ROOM_SPOTS`; a test in `apps/activity` checks that both lists match in order. The spot ids are also the data of the schema, so removing a spot later only makes old claims read as null.

## 2026-10-14: Living room presence comes from the Discord SDK, not the server

ID: `2026-10-14-living-room-presence-comes-from-the` · Status: current, amended by `2026-10-15-a-45-s-living-room-refresh`

**Decision.** Who is "here" is the activity instance's participant list from the Embedded App SDK (`getInstanceConnectedParticipants` plus `ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE`). The server keeps no presence: no heartbeat, no WebSocket, no polling. A client asks `POST /api/room` once at start, then only for newcomers (debounced 2 s); leaves cost nothing; a tab switch refetches only when the data is over 60 s old.

**Why.** Misa wants idle games to cost nothing. Discord already pushes joins and leaves to every client.

**Tradeoff.** Presence is per activity instance: players who opened the game from different channels do not see each other. Misa accepted this. A guild-wide room would need a server heartbeat.

**Also.** Spot assignment is client-side and deterministic (FNV-1a of instance id and user id), so everyone in an instance sees the same room. Speech bubbles and the idle pan are local cosmetics using browser crypto randomness; they are not game state, so the server-RNG rule does not apply to them.

## 2026-10-14: The living room's lounger and `/api/room`

ID: `2026-10-14-the-living-room-s-lounger-and` · Status: current, amended by `2026-10-25-lounge-reads-one-row-lounger-xp`

**Decision.** Each player has one **lounger**, the creature that sits in the living room, stored on the player (`players.lounger_id`, a nullable column from migration 21, no backfill). It is picked lazily: whenever `GET /api/state` or `POST /api/room` reads it and finds it missing, gone (fused away) or busy, the server picks a new idle creature of the player at random (`crypto.getRandomValues` through `pickLounger` in `@creatures/game`) and stores it, or stores NULL when every creature is busy. A player with no creatures gets null and nothing is written. The choice is not remembered for later: whoever is on the couch is the lounger. `PUT /api/lounger` lets the player choose (404 `creature_not_found` unless theirs, 409 `creature_busy` on an expedition or a workshop job).

**Creature permanence.** A creature does one thing at a time, so one on an expedition or an open workshop job cannot lounge. The raid is the one exception: raiders can lounge, so a raid team never changes who is idle. The rule reuses the "busy" meaning of the state view (`away_expedition_id` or an open `workshop_jobs` row).

**`POST /api/room` trusts the ids the client sends.** The body is up to 25 distinct snowflakes (duplicates are a 400, not merged); they only say who to look up, never who is asking (that comes from the session). The answer covers players of this guild who chose a starter; everything else is left out silently, so the endpoint does not reveal which ids exist. It shows one creature of a guild-mate (species, level, nickname, quirk, Crafting level, Explorer rank) plus the sanitised display name: the same data class the raid roster already shows, scoped to the guild's own Durable Object and capped at 25 ids a request. It goes through the normal session auth and per-player rate limit. It reads in bounded queries (one for players, one per looked-up player to resolve the lounger, three for the creature details) and may write, so it runs in one transaction.
