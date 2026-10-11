# Research: platform (Discord Activities, Cloudflare, GitHub Actions)

Researched 2026-10-10 by research subagents; reviewed by the lead agent. Unconfirmed points are marked **(unconfirmed)**. Discord docs now live at `docs.discord.com/developers/...` (appending `.md` gives raw markdown).

## Discord Activities

- **SDK:** `@discord/embedded-app-sdk` 2.5.0 (2026-05-05). `new DiscordSDK(clientId)` → `await ready()` → `commands.authorize({ client_id, response_type: 'code', state: '', prompt: 'none', scope: ['identify', ...] })` → backend code exchange → `commands.authenticate({ access_token })`. `instanceId`, `channelId` and `guildId` are on the SDK (`guildId` is null in DMs). Once the SDK is added, the app doesn't run in a plain browser tab.
- **Code exchange:** `POST https://discord.com/api/oauth2/token`, **form-encoded** (`client_id`, `client_secret`, `grant_type=authorization_code`, `code`). The official starter omits `redirect_uri`. Verify identity with `GET /api/v10/users/@me`.
- **Instance check:** `GET /applications/{app_id}/activity-instances/{instance_id}` (bot token) returns location (guild, channel) and `users[]`; 404 if the instance isn't active. Use it to confirm the player is really in a live instance in that guild.
- **Proxy signature headers** (`X-Signature-Ed25519`, `X-Signature-Timestamp`, `X-Discord-Proxy-Payload`) exist, but the docs don't say when they're sent **(unconfirmed)**. Not relied on.
- **URL mappings:** prefix → target (no protocol). `/` → `creatures.misacorp.dev` serves the app; relative `/api/...` requests are same-origin through the proxy, so no extra mapping is needed. `patchUrlMappings` is only for external domains.
- **CSP/proxy:** everything not URL-mapped is blocked (`blocked:csp`), except some Discord endpoints. Bundle all assets ourselves. **WebSockets are the only real-time transport** (no WebRTC/WebTransport). The proxy strips cache headers on `text/html`; use hashed asset filenames. Cookies need `SameSite=None; Partitioned` on the discordsays.com domain (we use bearer tokens instead).
- **Launching:** Activities launch from channels, DMs or the App Launcher. Enabling Activities creates a "Launch" entry-point command. Web, iOS and Android toggles live under Activities → Settings.
- **Unverified apps** (from a support-article snippet, **unconfirmed**): playable only by the team and up to 50 invited App Testers, and only in servers under 25 members. Fine for testing; for wider play the app may need verification later.
- **Local testing:** `cloudflared tunnel --url http://localhost:PORT` and point the dev app's `/` mapping at the tunnel host. Developer Mode is required for debugging.
- **Posting messages:** bot token, `POST /channels/{id}/messages`. Bot messages default to parsing `@everyone`, roles and users, so always send `allowed_mentions: { parse: [] }`. Limit 2,000 characters.
- **Rate limits:** 50 requests/second globally per bot plus per-route buckets; honour `Retry-After`. More than 10,000 401/403/429 responses in 10 minutes triggers a temporary Cloudflare ban.
- **Gotchas:** an instance ends when everyone leaves (new `instanceId` next time), so persistent state is keyed by guild, not instance. `getInstanceConnectedParticipants` was renamed `getActivityInstanceConnectedParticipants` (2026-10-06). Mobile: safe-area CSS variables `--discord-safe-area-inset-*`. Server egress from shared IPs may occasionally inherit a Discord rate-limit ban; handle 429s gracefully.

## Cloudflare

- **Workers Static Assets:** `assets.directory`, `not_found_handling: "single-page-application"`, `run_worker_first: ["/api/*"]`. Static asset requests are free and unlimited. Wrangler 4.x, `wrangler.jsonc` preferred.
- **Custom domains:** `routes: [{ pattern: "creatures.misacorp.dev", custom_domain: true }]`. Cloudflare creates the DNS record and certificate automatically; fails if a conflicting record exists.
- **Durable Objects:** available on the Free plan (SQLite-backed). Free: 100k requests/day, 5 GB storage. Single-threaded per object; `transactionSync` for atomic SQL; WebSocket Hibernation API; one alarm per object (at-least-once, retried).
- **D1:** no interactive transactions (`batch()` is atomic but can't branch). Not used for game state (see `decisions.md`).
- **Cron triggers:** UTC only; 5 per account on Free. Hence alarms computed in the guild's timezone.
- **Rate limiting:** Workers `ratelimit` binding is GA but per-location and approximate; Free-plan availability **(unconfirmed)**. Exact per-player limits go in the Durable Object.
- **Plans:** Free gives 100k requests/day and **10 ms CPU per request**. Paid ($5/month per account) gives 10M requests/month plus CPU up to 5 minutes. Risk on Free: raid simulation CPU. Measure in M3.
- **Testing:** `@cloudflare/vitest-pool-workers` is deprecated, replaced by `@cloudflare/vitest-plugin` (Vite plugin `cloudflareTest()`).
- **API token for CI:** Account → Workers Scripts: Edit; Zone (misacorp.dev) → Workers Routes: Edit, DNS: Edit, Zone: Read. Whether DNS Edit is strictly needed for custom-domain attach is **(unconfirmed)**; included to be safe.

## GitHub Actions pricing (public repos)

- Standard GitHub-hosted runners remain **free and unlimited for public repositories** (docs.github.com billing, checked 2026-10-10). A planned $0.002/min charge for self-hosted runners (announced December 2025) was postponed. Hosted-runner prices for private repos were cut from 2026-01-01.
- So CI cost here is effectively zero, but **concurrency** is shared across Misa's account, so we still keep workflows lean: one CI job plus one security job per PR, pnpm cache, cancel superseded runs, simulations only when engine or content files change.
- Dependabot, secret scanning, push protection, code scanning and dependency review are free for public repos.

## Live finale transport (researched 2026-10-10)

- **Discord proxy:** WebSockets are the only real-time transport Discord supports for Activities (WebTransport planned, no WebRTC). Its networking guide documents nothing else about them: not the URL form (bare path vs `/.proxy/`), query strings, `Sec-WebSocket-Protocol`, the `Origin` the backend sees, idle timeouts, message size or mobile behaviour. Secondary sources disagree on `/.proxy/`. Cookies would need `SameSite=None; Partitioned` on the discordsays domain, so we don't use them. Source: https://docs.discord.com/developers/activities/development-guides/networking
- **Durable Object WebSocket Hibernation:** `ctx.acceptWebSocket(ws, tags)` (up to 10 tags), attachments up to 16 KiB, `setWebSocketAutoResponse` for a text ping/pong that doesn't wake the object, up to 32,768 sockets per object. An alarm wakes a hibernated object, but scheduling one doesn't block hibernation. Each `setAlarm` costs one row write. Incoming messages are billed 20:1; outgoing ones are free. Sources: https://developers.cloudflare.com/durable-objects/best-practices/websockets/ , https://developers.cloudflare.com/durable-objects/api/alarms/ , https://developers.cloudflare.com/durable-objects/platform/limits/
- **Auth for a browser WebSocket:** it can't set `Authorization`. The usual patterns are a short-lived one-time ticket in the query string, or a token in `Sec-WebSocket-Protocol`, which must be echoed back in the 101 response. A ticket doesn't depend on how Discord's proxy treats that header.
- **CSP:** per spec, `connect-src 'self'` covers same-origin `wss:`, and Chromium and WebKit (fixed in 2022) follow it. MDN still warns that older browsers differ, so if we add WebSockets, list `wss://` for the host explicitly.
- **Consequence:** M5 uses short polling over plain HTTPS. WebSocket push comes after a staging spike inside real Discord on desktop, iOS and Android (`docs/design/m5-finale.md`).
