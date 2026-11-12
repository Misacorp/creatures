# Living room, lounge and Discord

The living room and lounging, the lounge message, Discord DMs and other social features.

<!-- Maintained with `pnpm decisions`; see README.md. Newest first. -->

## 2026-11-12: Housing: a ceiling and frame left as built are their starters; only a trim can be None

ID: `2026-11-12-housing-a-ceiling-and-frame-left` · Status: current

**Decision.** The client draws a ceiling or a frame left as built (stored null) as its starter in its first colour (Plain Ceiling in white and oak, Timber Frame in oak; `drawnLook` in `interior-art.ts`), shows it on the chip and in the picker as that starter, in use, and offers no "As built" choice for them. Only a trim can be bare; its choice is called "None". Picking the starter stores its look; the picture is the same. The server is unchanged (null stays valid). Alongside: four wallpapers whose names collided with the outside Walls were renamed (Tiled Wall, Plank Wall, Brick Wall, Panelled Wall became Glazed Tiles, Upright Boards, Bare Brick, Moulded Panels), and the tower's spire is drawn at the postcard's pitch (one pixel a side per row).

**Reasoning.** The review (2026-11-12) found "As built" and the starter side by side drawing the same picture, two choices that look identical. Making null mean the starter keeps every stored house valid with no migration and makes the picker honest; the bare day digests were re-pinned once for it. The renames and the spire are wording and art calls within the brief (scalars and small calls: best pick, listed for Misa).

## 2026-11-12: Ground skins fit room kinds and are owned by rule

ID: `2026-11-12-ground-skins-fit-room-kinds-and` · Status: current

**Decision.** A skin is owned by rule when it needs no row: a starter always, and a ground skin that comes with a part (`unlock: part`) once that part is built (`ownsSkin`/`ownedByRule`). No rows are written for either in `ensure()`; the own view lists them with the held skins and the catalogue's `owned` agrees. A ground skin lists the outdoor room kinds it fits (`fits`), the loader checks the list, and `skin()` refuses another room kind with 409 `skin_mismatch`. `groundChoices(content, roomKind)` lists a room's choices for the client. A stored look that no longer validates against content (shape, skin, kind, colour, fit) is shown as the room's default (trim, ceiling and frame bare), with no read.

**Reasoning.** Rows written only at house creation left houses made before a content addition unable to wear or craft its ground skins; a rule needs no migration and no backfill, and a part's room only exists once the part is built, so the skin route decides with data it already read. Matching by id prefix in the client listed nothing for `lawn` and `deck`, and any ground skin could dress any outdoor room. Looks stored under old content must not reach the client as ids it cannot draw.

## 2026-11-12: Room layers: generated patterns owned by pattern, colour free, stored in the existing columns

ID: `2026-11-12-room-layers-generated-patterns-owned-by` · Status: current

**Decision.** Housing C5 is wired for wallpaper and floor patterns, trim, ceilings and the house frame (ways through stay unwired). Each is a skin with a `gen` field (`pattern`, `colours`, `tier`, `family`): owning the skin owns the pattern in every listed colour, and a layer stores `<skin id>:<colour>` (`paper-damask:rose`; `looks.ts` in the game package reads and checks it). Rooms get `trim` and `ceiling`, the exterior gets `frame`, all nullable: null is "as built", so a house that chose nothing paints exactly as before (pinned by day-picture digests taken before the change). No migration: the trim and ceiling ride in the room's `wall` column (`<wall>;ceiling=…;trim=…`) and the frame in the house's `walls` column (`<walls>;frame=…`), read and written only by `housing-store.ts`; a plain column is unchanged. Starters are owned by rule (`ownsSkin`), not by row, so old houses have them. Earning reuses the skin machinery: workbench patterns are `part: hut` unlocks priced by tier (`HOUSING_RULES.price.pattern`), fancy ones are drop blueprints with their own `sources` (skins can now carry `sources`) or feat unlocks. The frame replaces the inner posts and the slabs; the cut edges keep the walls skin. The client generates tiles at runtime from the workshop's pure generators, cached per pattern, colour and size, in the housing chunk only. Cobble and harlequin are left out; starry comes in four dark colours.

**Reasoning.** Owning by pattern keeps the content at 30 entries instead of hundreds and makes colour a free, playful choice. Nullable layers are the only way to keep every existing house pixel-identical (the shipped wallpapers bake their own trim and ceiling line). Packing two extra values into existing text columns avoids a migration on a branch where the next numbers belong to others; the codec is one small function with tests, and housing is still off in production. Starters by rule avoid writing rows to existing houses. Putting the workbench patterns behind the hut uses the existing "a built part teaches it" rule rather than a new unlock kind.

## 2026-11-12: Quiet Verge furniture set: tier 2, no element, stone and moonstone, from the Crossroads and the Reef

ID: `2026-11-12-quiet-verge-furniture-set-tier-2` · Status: current

**Decision.** The Quiet Verge set (the first made with the `furniture-set` skill, `docs/design/housing-next.md` C2) is tier 2 with no element, primary "any stone" and accent Moonstone, and its blueprints drop on trips, scouts and raids at the Old Crossroads and the Moonlit Reef (no boss). Every piece is generated from its style with part hooks; there is no hand override. The workshop's room sheet gained `--night`, which paints the rooms through the lighting pass.

**Reasoning.** The Void is not a shipped element and the Quiet Verge is not a shipped destination, so the set takes no element and drops from the two shipped places the compendium ties to it: the Crossroads (the fifth shadow that leads there) and the Reef (the other night place). It is a late place, like the Reef, so tier 2 like Moonlit, Ancient and Lantern Night. Its furniture is the Verge's stone, and Moonstone ("glows a little when the reef is dark") is the closest shipped material to its pale rims and warm star; a new Void material would need a resource, an icon and a glossary entry, which is for when the place ships. Each is one edit in `sets.json` if Misa wants it otherwise. The night view uses the pure functions of `house-light.ts` so a set is checked at night before it reaches the scene.

## 2026-11-11: Housing: tower, balcony, orchard and pond (prices, prerequisites, where they stand)

ID: `2026-11-11-housing-tower-balcony-orchard-and-pond` · Status: current

**Decision.** Four parts are added to player housing (work package C1 of `housing-next.md`, confirmed by Misa), all content with no migration (a built part is a row keyed by its id in the existing tables). **Tower** (kind `tower`, needs the House): a landing at floor 3 and an observatory at floor 4 on column 1, over the right half of the attic, under a spire; 300 Acorns, 2,000 scrap, 12 any stone, 8 any wood, 4 Bright Copper, 2 Moonstone. **Balcony** (kind `balcony`, side east, needs the House): one outdoor cell at floor 1 on the east edge of the rooms on that floor (core wall, east wing roof, or beside the guest room when the east upper floor is built); 150 Acorns, 1,000 scrap, 8 any wood, 4 any metal, 3 Lantern Silk. **Orchard** (grounds, east of the pool, needs the Garden): 200 Acorns, 1,500 scrap, 12 Grove shards, 8 any wood, 6 Heartbark, 4 Moss Velvet; its fruit (apple, plum, pear) is its ground skin, chosen from a Ground chip like wallpaper. **Pond** (grounds, west of the terrace, needs the Terrace): 250 Acorns, 1,500 scrap, 14 Tide shards, 8 any stone, 6 Driftwood, 4 Sea Glass. Thirteen grounds pieces came with them (beehive, fruit crate, garden swing, scarecrow, duck, lily cluster, lantern boat, fishing stool, stepping stones, sun umbrella, gazing ball, cone topiary, bistro table); the lantern boat is a light. The first eleven parts still total 2,000 Acorns and 13,000 scrap; the four add 900 and 6,000.

**Reasoning.** The tower on the core (a part kind of its own, so the postcard still names the house by its core) is the one change to the silhouette, so it is priced like a wing and asks for the rare Moonstone. The balcony is the first outdoor room above the ground, so it takes its place from the rooms beside it instead of a fixed column, which keeps it attached whatever wing is built and moves it when the east upper floor appears. Orchard and pond sit on the far outer blocks of each side so they never push the core. Prices are in the same loan-style lines as the late parts and are picks for Misa to glance at; each number lives in `parts.json`. A creature standing on the balcony or the bridge is not drawn: housemates only sleep in beds today.

## 2026-11-09: Housing server: how the rules of the first build read

ID: `2026-11-09-housing-server-how-the-rules-of` · Status: current

**Decision.** The worker's housing module (`apps/worker/src/housing*.ts`, migration 67, flag `HOUSING`) reads the spec this way where it was open:

- **Placing.** A piece goes where it fits (`canPlace`) and a copy is free. When every copy is placed the answer is `none_free`; the client empties the other spot first (there is no move across rooms). Replacing a piece frees its copy. One bed per room, enforced as `spot_mismatch`. A bed keeps its sleeper only when another bed replaces it.
- **Housemates.** At most three per house. Putting a creature on a second bed moves it (the old bed is made up); `already_housemate` is never answered. A creature that is gone drops off its bed on the next read of the own house.
- **Payments.** `applyPayment` never refuses; the route answers `insufficient_funds`, `insufficient_parts` or `insufficient_materials` when nothing at all could be taken because the player holds none of what the offer named, `nothing_to_pay` when the offer names nothing still owed. A part that is built teaches its exterior skin as a learned blueprint.
- **Crafting.** A family line of a piece's price takes the family's common materials before rare ones, then the most plentiful.
- **Feats.** Run when the own house is opened, in the same transaction. The starter set (tier 0) is whole from the first minute, so it does not count for the Matched Set stamp; it does show in the cabinet (`setsComplete` lists it).
- **Visiting.** The visit path takes a Discord snowflake or a staging dev guest (`dev-guest-<n>`), so the guests the dev tool makes can be opened. The list and the guestbook read each house by index; the guestbook keeps 30 with one boundary read.
- **Reads.** Measured on 15 full houses (`apps/worker/test/housing-reads.test.ts`): the own house 541 rows, a visit 317, the list 220, the catalogue 350, a partial payment 45. Nothing runs on `/api/state`, the alarm or the start.
- **The drop hook** never throws into the reward that calls it: a failed drop rolls back its own savepoint, logs the error's name and the reward goes on.
- **Migrations.** Housing is migration 67; versions 64 to 66 are reserved as no-ops for the valley branch's three migrations, which replace them at the merge.

**Reasoning.** The spec left these open or contradicted itself (`none_free` against "moves it"; `already_housemate` against "it moves"). Each pick keeps the server authoritative and the answers small and strict, and none changes a rule a player must learn. The reads were priced before shipping (`docs/design/database-reads.md`) and are tested against budgets, so a change shows up as a failing test.

## 2026-11-09: Player housing: what is built and its standing rules **[Misa]**

ID: `2026-11-09-player-housing-what-is-built-and` · Status: current

**Decision.** Misa read the housing research (`docs/research/player-housing.md`) and asked for items 1 to 5, 7 and 8 of its ranking to be built as one shippable feature; porch visitors wait. The spec is `docs/design/housing.md`. His rules:

- The house grows visibly as it is built, beyond floors: wings, pools, decorative gardens.
- Scouts and trips bring luxury materials (exotic woods, gemstones, rare metals) that fuel housing alone.
- Furniture comes in sets whose pieces look alike, plus wild pieces; the fun is collecting and crafting everything, and only cost needs balancing. Art is not a limit.
- The house gives no power, ever.
- The guestbook is stamps, not text. Stamps are collectibles from feats (the journal especially) and rare drops.
- The bonfire is not emptied at night, and there is no reason to send a creature home over the bonfire.
- Porch visitors, later: rare, mysterious choices with unknown outcomes (for example sending a creature on a quest to meet the visitor and learn a talent).

The lead's picks, for Misa to change: housing is self-contained behind a `HOUSING` flag (off in production); a bed holds a housemate for show only; crafting is instant at a workbench, with no timer; a part is paid into at any pace and built when fully paid; one free gift a day; displays (raid plaques, medals, keepsakes) fill themselves.

**Reasoning.** The research found homes are loved when they record what a player did and hold something of theirs, and resented when they charge rent, run out or turn decorating into a score. Keeping housing in its own modules, with one hook per reward path, lets it ship while combat and the valley are being reworked in other sessions.

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
