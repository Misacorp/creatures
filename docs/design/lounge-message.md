# The lounge message

One message per server in the announcement channel (where raid posts go), edited in place, that says who is playing, with one button that launches or joins the game. It replaces Discord's "Game invitation" card, which Discord posted on every launch and which filled the channel and notified people (Misa, 2026-10-18).

## What players see

- Nobody playing: "🌙 **Leet Creatures** / The lounge is quiet. Last visit: Ohems, 13:23." with a **Play** button. The time is Discord's timestamp markup (`<t:…:t>`), so each viewer sees their own local time.
- Someone playing: "🔥 **Leet Creatures** / 3 in the lounge: Hessuttaja, Ohems, Hawky" with a **Join** button. At most 8 names, then "and N more". Players Discord reports but the game does not know yet are counted, never named.
- Names are escaped markdown and never mentions (`allowed_mentions: { parse: [] }`). Edits never notify anyone. A new post is `@silent` (SUPPRESS_NOTIFICATIONS, 4096) and has no link previews (SUPPRESS_EMBEDS, 4).

## Launching without a card

- The Activity's entry point command (Launch) uses the app handler (`handler: 1`). Discord sends it to our interactions endpoint, which answers LAUNCH_ACTIVITY (callback type 12) and posts nothing. The lounge button (`custom_id` `lounge:play`) gets the same answer, so it launches in the lounge message's channel, or joins the session already running there.
- The deploy job sets the handler (`apps/worker/scripts/discord-app.mjs register`), but only while the app's Interactions Endpoint URL is this game's: otherwise Launch would go nowhere. To go back to Discord's card, set `ENTRY_POINT_HANDLER` to 2 there and deploy.

## Who is playing: Discord says

- At login the server already asks Discord about the Activity instance (`GET /applications/{id}/activity-instances/{instance}` with the bot token). The verified instance id is now kept (`lounge_instances`, at most 10 per server).
- A check runs 15 s after a session starts (joins settle into one edit), then every 60 s while any instance is tracked. It asks Discord for each instance's users; an instance that is gone (404) is dropped. When none are left the checks stop.
- No client changes, no heartbeat, no WebSocket. Presence comes from Discord, never from a request body.
- Different channels have different instances. The message counts everyone in the server; its button joins the session in its own channel.

## Keeping it one message

- The message is edited only when its text or button changes. At most one message write per check (a move or a repost adds a delete).
- First post: on the first session after this ships. No message is posted while nobody has ever played.
- Buried: when a new session starts, the server reads the channel's last 10 messages (needs Read Message History). If the lounge message is not among them, it is deleted and posted again, silently. If the list cannot be read, the message is edited where it is.
- The announcement channel moved: the old message is deleted and a new one is posted in the new channel.
- Deleted by someone: the next edit gets 404 and the message is posted again.
- No permission (403): message work pauses for 30 minutes. Other failures retry with Discord's wait or 60 s, up to 5 in a row.

## Cost

- Discord lookups: one per tracked instance per minute while someone plays. Five players for two hours a day is about 120 calls; free, and far inside Discord's limits.
- Message writes: a few dozen a day at most.
- Worker: nothing extra per player; the checks run in the guild's existing alarm. Storage: one row plus one per running session.

## Code

- `apps/worker/src/lounge.ts`: storage (migration 33), the text (`renderLounge`).
- `apps/worker/src/lounge-discord.ts`: the Discord calls.
- `apps/worker/src/guild-core.ts`: `runLounge` (the check), called from the alarm.
- `apps/worker/src/discord-interactions.ts`: Launch and the button answer LAUNCH_ACTIVITY.
