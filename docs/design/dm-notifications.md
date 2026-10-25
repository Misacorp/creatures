# Discord DMs (opt-in)

Status: **built** (2026-10-25). Migration 41. Code: `apps/worker/src/dm-notify.ts` (preferences, scan, texts), `dm-queue.ts` (the outbox), `dm-send.ts` (Discord calls), `dm-routes.ts` (the API), the `*Dm*` methods of `guild-core.ts`; client `apps/activity/src/settings/DiscordDms.tsx` and `notifications-api.ts`.

## What players see

In Settings, a section **Discord DMs** with four rows, each Off or On, all **Off** until the player turns them on (per player, per server):

| Row           | Hint                                                | DM text                                                                                                                         |
| ------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Trips home    | A DM when a creature comes home from an expedition. | `🧭 Moss is home from Tidepools.` and, when a chosen push-on is over, `🧭 Moss is back from pushing on at Tidepools.`           |
| Workshop jobs | A DM when a job at the Workshop is done.            | `🔨 Pip finished crafting at the Workshop.` (also: making supplies, taking things apart, reworking parts; else a plain "a job") |
| Raid finale   | A DM 10 minutes before Sunday's raid finale starts. | `⚔️ The raid finale starts in 10 minutes.`                                                                                      |
| Prize Stall   | A DM when the Prize Stall opens on Wednesday.       | `🏅 The Prize Stall is open today. Spend your medal points before it closes <Discord time>.`                                    |

Every DM ends with `Turn these off in the game: Settings, Discord DMs.` Names are the creature's nickname or species name, escaped as in other bot text; places are the destination's name. The DM comes from the game's bot, plain text, no mentions, no embeds.

Turning on the first kind sends a welcome DM, `👋 You'll get a DM here when a creature comes home from a trip or a Workshop job is done.` (the kinds that are on), then the footer. It doubles as the check that DMs reach the player. At most one welcome an hour, however often a switch is flipped.

If Discord refuses the bot's DM (the player does not accept DMs from server members of this server), the Settings section shows a warning: allow direct messages from server members in Discord's privacy settings for this server, then flip a setting to try again. Nothing is queued for a blocked player; any change of a setting clears the block and sends a new welcome, which tests it again. The section is hidden where the server has no DM sender (local dev, tests).

## How it works

- **Derived, not hooked.** Nothing hooks into sending a trip, starting a job or claiming. A **scan** (`scanDm`, run inside one transaction from the alarm and from `ensureAlarm`, never throwing; failures are logged by kind only) reads the tables the game already keeps and finds what came due for opted-in, non-blocked players:
  - trip end: an `active` trip with no push-on chosen whose `ends_at` passed; push end: an `active` trip with a chosen push-on whose `push_ends_at` passed. A trip claimed, recalled or cancelled first is never pinged.
  - job: `workshop_jobs` with `claimed_at IS NULL` and `ends_at` passed.
  - finale: this week's raid week exists and its finale has not been fought; due from `eventTimes(week).finale` minus 10 minutes, never once the finale has started.
  - stall: `stallWeek().opensAt` has passed and `closesAt` has not.
- **On-at guard.** `dm_prefs.<kind>_on_at` is the game time the kind was turned on (NULL: off); an event only counts if it came due at or after it, so turning a kind on never floods old events. Turning on a kind that is on keeps its time.
- **Stale guard.** An event that came due more than 12 hours before the scan is dropped: a long outage does not send old pings.
- **Never twice.** Each event is one row in `dm_sent` (`trip:<id>:end`, `trip:<id>:push`, `job:<id>`, `finale:<week>:<user>`, `stall:<week>:<user>`, pruned after 30 days). Only new rows make lines.
- **One DM per scan per player.** The new lines of a player, in the order trips, jobs, finale, stall, go into one message in `dm_outbox` (so three trips ending together are one DM; more than 12 lines become "and N more").
- **Alarm.** With a DM sender, `desiredAlarmAt` also wakes at the earliest future due time of an opted-in player (partial indexes on the open trips and jobs, `dm-migration.ts`) and at the next pending outbox row (a row that is due but still pending is looked at a minute later, not in a loop). The game clock drives due times; alarms go through `realAt`.
- **Delivery** (`deliverDms`, its own in-flight guard, at most 20 per run, outside transactions) mirrors the announcement posts: the DM channel is the cached `dm_channel_id`, or opened with `POST /users/@me/channels`; the message goes through the same `createPostSender`. 403 (the player's DMs are closed) sets `blocked_at` and fails the message; 404 on a cached channel forgets it and opens a new one once; 429 and server errors back off like posts (1 min, 5 min, 30 min, 2 h, then given up). Sent and failed outbox rows are pruned after 7 days.
- **Privacy.** Logs and analytics carry error kinds only: never user ids, channel ids, tokens or text. Analytics: `dm_pref` (which kind, on or off) and `dm_result` (sent, retry, failed or blocked, error kind, attempts).

## API

- `GET /api/notifications` answers `{ kinds: { trip, job, finale, stall }, blocked, available }`.
- `PUT /api/notifications` takes `{ kinds: { trip?, job?, finale?, stall? } }` (strict, at least one key, booleans) and answers the same view. Only the session's own player. Clears `blocked_at`.
