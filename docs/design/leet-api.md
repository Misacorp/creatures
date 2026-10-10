# Leet bot API contract (proposal)

Status: **live**. Implemented in `Misacorp/leetbot-aws` (PR #21, merged and deployed). Staging reads the dev API and production reads the prd API (`LEET_SOURCE=http`); local development uses the mock. The response also carries `timezone`, the IANA zone that `date` refers to.

## Principles

- The leet bot stays its own application on AWS. **This game never writes to the leet ledger.** The API is read-only.
- The API reports **facts**: who leeted successfully, in which Discord server, on which day. It does not compute game currency. The game owns all scoring rules (multi-leet bonuses, solo bonus, conversion rate) as balance config, so we can rebalance without touching the leet bot.
- The game pulls on its own schedule and converts each fact exactly once, keyed by IDs from this API. Retries and overlapping pulls can't double-count.

## Authentication

- A bearer API key per consumer: `Authorization: Bearer <key>`.
  - Leet bot side: SHA-256 hashes of valid keys in the SSM SecureString parameter `/leetbot/<env>/api/consumer-key-hashes` (comma-separated, at most two, for rotation), compared in constant time. `scripts/createApiKey.sh` creates a key and stores its hash. Key changes take up to 5 minutes to apply (SSM cache).
  - Game side: the key is a Cloudflare Worker secret `LEET_API_KEY`, set from GitHub environment secrets by CI. One key for staging, one for production.
- Keys are read-only and scoped to the API; they grant nothing else.
- HTTPS only. API Gateway HTTP APIs have no per-key throttling; the stage is throttled to 5 requests/second, burst 10.
- Why not AWS IAM (SigV4): the caller is a Cloudflare Worker, so IAM would need long-lived AWS access keys stored in Cloudflare anyway. A dedicated API key is simpler and just as narrow.

## Endpoints

Base URL: chosen by the leet bot stack (for example `https://leet-api.misacorp.dev`). All responses are `application/json`. All timestamps are ISO 8601 UTC. Discord IDs are strings (snowflakes exceed 2^53).

### `GET /v1/guilds/{guildId}/days?after={cursor}&limit={n}`

Finalised leet days for a server, oldest first. A day is **finalised** once its leet window (13:37–13:38 in the server's timezone, Europe/Helsinki by default) has closed and the bot has recorded all results. Days in progress are never returned.

- `after` (optional): opaque cursor from a previous response. Omit to start from the beginning (or from `since`, below).
- `since` (optional): `YYYY-MM-DD`; only used when `after` is absent. Lets a new server start from its install date.
- `limit` (optional): 1–100, default 31.

Response `200`:

```json
{
  "guildId": "123456789012345678",
  "days": [
    {
      "id": "123456789012345678:2026-10-09",
      "date": "2026-10-09",
      "participants": [
        { "userId": "234567890123456789", "leetAt": "2026-10-09T10:37:12.345Z" },
        { "userId": "345678901234567890", "leetAt": "2026-10-09T10:37:40.002Z" }
      ]
    },
    { "id": "123456789012345678:2026-10-10", "date": "2026-10-10", "participants": [] }
  ],
  "nextCursor": "eyJkIjoiMjAyNi0xMC0xMCJ9",
  "hasMore": false
}
```

- `id` is stable and unique per server and day. The game uses `(day id, userId)` as the idempotency key for the Bait credit.
- Days with no participants are **omitted** (the bot stores leet messages, not days). Days are derived by grouping the guild's 13:37 leet messages by server-local date, earliest leet per user. A day is finalised after 13:40 server-local time.
- Once a day is returned, it is **immutable**. If the bot ever corrects a past day, it should be a new, explicit mechanism (out of scope for now).
- `404` if the bot doesn't know the server. `401` for a missing or invalid key.

### `GET /v1/guilds/{guildId}/seasons/current` (later, for the season-winner feature)

```json
{
  "seasonId": "2026-10",
  "startsOn": "2026-10-01",
  "endsOn": "2026-10-31",
  "standings": [{ "userId": "234567890123456789", "points": 412, "rank": 1 }]
}
```

Not needed until the seasonal-feature system (post-MVP). Listed so the leet bot can plan for it.

### `GET /v1/health`

`200 { "ok": true }`. No auth.

## How the game uses it

1. A per-server Durable Object alarm runs daily at about 13:40 in the guild's timezone (default Europe/Helsinki; after the leet window closes), plus a throttled pull when a player opens the Activity.
2. It requests `days?after=<stored cursor>`, and for each participant of each day computes leet points with the game's rules (see `decisions.md`), converts to Bait, and appends a ledger credit with idempotency key `leet:<day id>:<userId>` and `source = "leet"`.
3. It stores `nextCursor` only after the credits commit, in the same transaction.
4. Players who haven't opened the game yet still accrue: credits are keyed by Discord user ID and become visible when they first launch.

## Questions for the leet bot side

- Does DynamoDB already store per-day, per-user leet records with the guild ID and timestamp? If it only stores monthly totals, the API needs a new daily record (or a stream from the existing writes).
- Which date convention does the bot use for a "day" (the server-local calendar date is assumed; the game uses the guild's timezone, Europe/Helsinki by default)?
- Is there an existing custom domain for the leet bot's API Gateway?
