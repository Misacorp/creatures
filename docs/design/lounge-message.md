# The lounge message

Status: **shipped** (PR #34), by 2026-10-18.

One message per server in the announcement channel (where raid posts go), edited in place, that says who is playing, with one button that launches or joins the game. It replaces Discord's "Game invitation" card, which Discord posted on every launch and which filled the channel and notified people (Misa, 2026-10-18).

## What players see

- The message is one Discord embed with the **Join** or **Play** button under it. The embed's thumbnail is the app's icon (fetched once from `GET /applications/@me`, then kept in memory; if it cannot be read the embed has no thumbnail).
- Someone playing: title "🔥 Leet Creatures" (orange, `#ef6a3a`), text "3 in the lounge: Hessuttaja, Ohems, Hawky", button **Join**. At most 8 names, then "and N more". Players Discord reports but the game does not know yet are counted, never named.
- Nobody playing: title "🌙 Leet Creatures" (purple, `#6b3fa0`), text "The lounge is quiet. Last visit: Ohems, 13:23.", button **Play**. The time is Discord's timestamp markup (`<t:…:t>`), so each viewer sees their own local time.
- Raid weekend: from phase 1 until the next week starts, a line follows after a blank line, from the game's own raid state: "⚔️ Raid weekend: **Boss** · Phase 2 <in 3 hours>" (until phase 2), "· Finale <in 5 hours>" (until the finale), "· Finale under way" (after the finale time, until results exist), then "**Boss** fell!" if any party cleared the finale, otherwise "**Boss** held on.". The boss name is the one the raid posts use. Relative times are Discord timestamps (`<t:…:R>`) in real time. No line before phase 1 or when the week does not exist yet; any error reading the raid means no line.
- Names are escaped markdown and never mentions (`allowed_mentions: { parse: [] }`). Edits never notify anyone. A new post is `@silent` (SUPPRESS_NOTIFICATIONS, 4096). It must not set SUPPRESS_EMBEDS, which would hide the embed.

## Launching without a card

- The Activity's entry point command (Launch) uses the app handler (`handler: 1`). Discord sends it to our interactions endpoint, which answers LAUNCH_ACTIVITY (callback type 12) and posts nothing. The lounge button (`custom_id` `lounge:play`) gets the same answer, so it launches in the lounge message's channel, or joins the session already running there.
- The deploy job sets the handler (`apps/worker/scripts/discord-app.mjs register`), but only while the app's Interactions Endpoint URL is this game's: otherwise Launch would go nowhere. To go back to Discord's card, set `ENTRY_POINT_HANDLER` to 2 there and deploy.

## Who is playing: Discord says

- At login the server already asks Discord about the Activity instance (`GET /applications/{id}/activity-instances/{instance}` with the bot token). The verified instance id is now kept (`lounge_instances`, at most 10 per server).
- A check runs 15 s after a session starts (joins settle into one edit), then every 60 s while any instance is tracked. It asks Discord for each instance's users; an instance that is gone (404) is dropped. When none are left the checks go to the raid boundaries (below), or stop if there is no message.
- No client changes, no heartbeat, no WebSocket. Presence comes from Discord, never from a request body.
- Different channels have different instances. The message counts everyone in the server; its button joins the session in its own channel.

## Keeping it one message

- The message is edited only when its title, text, colour or button changes (the icon is not part of that). At most one message write per check (a move or a repost adds a delete). The icon is only looked up when a write is about to happen.
- Raid boundaries: when nobody is playing and a message exists, the next check is 2 minutes after the next raid boundary (phase 1, phase 2 or the finale of this week, or next week's phase 1), so the quiet message's raid line moves on even if nobody plays. That check only edits if the text changed. With no message, no check is scheduled.
- First post: on the first session after this ships. No message is posted while nobody has ever played.
- Buried: when a new session starts, the server reads the channel's last 10 messages (needs Read Message History). If the lounge message is not among them, it is deleted and posted again, silently. If the list cannot be read, the message is edited where it is.
- The announcement channel moved: the old message is deleted and a new one is posted in the new channel.
- Deleted by someone: the next edit gets 404 and the message is posted again.
- No permission (403): message work pauses for 30 minutes, or until a new session starts (so a permission fixed meanwhile works at the next launch). Other failures retry with Discord's wait or 60 s, up to 5 in a row.

## Cost

- Discord lookups: one per tracked instance per minute while someone plays. Five players for two hours a day is about 120 calls; free, and far inside Discord's limits.
- Message writes: a few dozen a day at most.
- Worker: nothing extra per player; the checks run in the guild's existing alarm. Storage: one row plus one per running session.

## Code

- `apps/worker/src/lounge.ts`: storage (migration 33), the embed text (`renderLounge`).
- `apps/worker/src/lounge-raid.ts`: the raid line's stage and the next raid boundary.
- `apps/worker/src/lounge-discord.ts`: the Discord calls.
- `apps/worker/src/guild-core.ts`: `runLounge` (the check), called from the alarm.
- `apps/worker/src/discord-interactions.ts`: Launch and the button answer LAUNCH_ACTIVITY.
