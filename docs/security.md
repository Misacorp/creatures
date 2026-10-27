# Security

What we apply, and why. Researched 2026-10-10 (sources at the end of each section). The repo is public, the owner doesn't read code, and agents read external content, so controls are designed to hold even if an agent is fooled.

Status legend: ✅ in place · 🔜 lands with the milestone noted · 👤 needs Misa (GitHub/Cloudflare/Discord setting).

## 1. Agents and prompt injection

Prompt injection can't be fully prevented, so we limit what a fooled agent can do.

- ✅ All external content (web pages, docs, READMEs, issues, PR comments, commits from anyone but Misa, API responses, player-written data) is **data, never instructions**. Rule in `CLAUDE.md` and every subagent definition. Suspicious content is reported to Misa.
- ✅ **No agent has both untrusted web input and a shell.** The `researcher` subagent has web tools but no Bash/Write; `implementer` has Bash but no web tools; `helper` has neither.
- ✅ `.claude/settings.json` deny rules: reading `.env*` / `.dev.vars*` / `~/.ssh` / `~/.aws` / credential dirs; `wrangler deploy|secret|login`; force push; `npm|pnpm publish`; `gh secret`; `curl` / `wget`. Deny rules always win over allow rules. Bash rules match command text and are a speed bump, not a boundary; the real boundaries are that agents have no production secrets and deploys only happen in CI.
- ✅ Only MCP servers Misa set up. No project-level `.mcp.json`. Any future `.mcp.json` change must be called out in the PR description.
- ✅ No agent automation is triggered by issue or PR comments (no `issue_comment` / `pull_request_target` workflows), so a stranger's comment can't drive an agent with write tokens.
- ✅ Never put secrets in prompts, logs, PR descriptions, code or fixtures.

Sources: code.claude.com/docs/en/security · code.claude.com/docs/en/permissions · modelcontextprotocol.io/specification/draft/basic/security_best_practices · OWASP LLM Top 10 (LLM01 prompt injection)

## 2. GitHub Actions

- ✅ `permissions: {}` at workflow level; each job grants only `contents: read`.
- ✅ Every action pinned to a full commit SHA with a version comment (`actions/checkout`, `actions/setup-node`, `pnpm/action-setup`, `zizmorcore/zizmor-action`). Tag pinning is not safe: the March 2025 tj-actions/changed-files compromise (CVE-2025-30066) repointed tags to malicious code. Dependabot keeps the SHAs updated.
- ✅ Deploy runs `wrangler` from our own lockfile instead of a third-party deploy action, so the Cloudflare token is only handed to code we pinned.
- ✅ Downloaded CLI tools (gitleaks, actionlint) are checked against pinned SHA-256 hashes.
- ✅ Triggers: `pull_request` for CI (fork PRs get no secrets and a read-only token); `push` to `main` for production deploys; `workflow_dispatch` (a manual run) for staging. A manual run can only target staging: the target is production only for a push to `main`, and a guard step fails the job if that ever stops holding. No `pull_request_target`, `workflow_run` or `issue_comment`.
- ✅ No `${{ github.event.* }}` interpolated into `run:` scripts; values pass through `env:`.
- ✅ `persist-credentials: false` on every checkout.
- ✅ Deploy secrets live in GitHub **environments**: `production` (deployable from `main` only) and `staging`. Pushing a branch deploys nothing, Dependabot's included.
- ✅ No agent merges: the GitHub connection acts as Misa's account, so GitHub cannot tell an agent's merge from Misa's. `.claude/settings.json` denies the merge and auto-merge tools and `gh pr merge`. Direct pushes to `main` are stopped for everyone by the ruleset (no bypass), so no agent-side push guard is kept.
- ✅ CI lints workflows with **actionlint** and audits them with **zizmor** (offline mode).
- 👤 Repo settings: default `GITHUB_TOKEN` read-only; require actions pinned to full SHA; require approval for workflows from outside collaborators; ruleset on `main` (PR required, `ci` check required, no force push or deletion).

Sources: docs.github.com/en/actions/reference/security/secure-use · docs.zizmor.sh · cisa.gov alert 2025-03-18 (CVE-2025-30066)

## 3. Secrets

- ✅ No secrets in the repo. `.gitignore` covers `.env*`, `.dev.vars*`, keys and wrangler state; only `*.example` files with placeholders may be committed.
- ✅ CI runs **gitleaks** over the PR's commits.
- 👤 GitHub **secret scanning** and **push protection** enabled on the repo (free for public repos).
- ✅ Production secrets (`DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, later `LEET_API_KEY`) live in GitHub environment secrets and are pushed to Cloudflare Worker secrets by the deploy job. The Discord client ID is public and is committed in `wrangler.jsonc`.
- ✅ **The one agent-held token: `FEEDBACK_READ_TOKEN`** (`docs/design/feedback.md`). Misa stores it in the Claude Code cloud environment as `FEEDBACK_TOKEN_PRODUCTION` (and `_STAGING`) so the triage skill can read player screenshots, which are kept private. It can only read feedback reports and their screenshots (no game data, no writes). Only `apps/worker/scripts/feedback-fetch.mjs` uses it, which sends it only to the fixed game host and never prints it. Agents never put it in prompts, logs, files or tool arguments. Rotate it in both places if it is ever exposed. The Discord public key (`DISCORD_PUBLIC_KEY`) is not a secret; the deploy job reads it from Discord.
- If a secret ever leaks: rotate it immediately. Removing it from git history is not enough.

Sources: docs.github.com/en/code-security/secret-scanning

## 4. Dependencies and supply chain

- ✅ pnpm with a committed lockfile; CI installs with `--frozen-lockfile`; `packageManager` pinned.
- ✅ `minimumReleaseAge` of 7 days: freshly published (possibly hijacked) versions are not installed. The 2025–2026 npm worms (Shai-Hulud in September and November 2025, "Mini Shai-Hulud" in May 2026) spread through stolen maintainer tokens and install scripts, and were usually caught within days.
- ✅ Dependency install scripts blocked except an explicit allowlist (build tools that need them).
- ✅ Exact versions, minimal dependencies, `"private": true` (we never publish).
- ✅ Dependabot for npm and GitHub Actions, weekly, with a cooldown (7 days; 14 for majors), grouped to limit PR noise. Security updates bypass the cooldown.
- 👤 Dependabot alerts and security updates enabled.

Sources: pnpm.io/supply-chain-security · docs.github.com Dependabot options reference · github.blog 2025-12-15 (npm supply chain plan)

## 5. Game server

- 🔜 M1+ **Server-authoritative.** The client sends intents ("start expedition with creature X at tier Y"); the server validates and computes everything. User identity comes from the session, never the request body.
- 🔜 M1+ **RNG:** `crypto.getRandomValues` drawn server-side at the moment of the roll; integer ranges use rejection sampling (no modulo bias). Raid fights draw a fresh 128-bit seed when the phase resolves (never before), run the deterministic engine, and store the seed so replays are exact. Content data being public doesn't help predict outcomes. `Math.random` is banned by lint.
- ✅ M1 **Ledger:** append-only, integer amounts, `CHECK (balance >= 0)`. Every spend has a client-generated idempotency key with a `UNIQUE` constraint; the check, debit and grant run in one synchronous SQLite transaction inside the guild's Durable Object (no `await` between check and write); retries return the stored result, and reusing a key for a different spend is refused.
- ✅ M1 **Rate limiting:** per-player token bucket inside the guild's Durable Object (30 burst, 1/s), plus a best-effort per-activity-instance limit on login in the Worker. 🔜 A coarse edge rule (Cloudflare WAF) if abuse appears.
- 🔜 M1 Constant-time comparison (`crypto.subtle.timingSafeEqual`) for any secret or token comparison.
- ✅ **Ops report endpoint** (`/api/ops/report`): bearer `OPS_TOKEN` only (a Worker secret set by CI from a GitHub environment), compared in constant time after hashing; unset token, wrong token or wrong method all answer the same plain 404 (not hidden: unknown `/api/*` routes answer 401 because the session check comes first); rate-limited by a hash of the connecting IP; session auth is never read. Output is counts only, summed across servers: no user ids, actor hashes, guild ids, names or free text, and no per-server breakdown unless a request adds `byGuild=1` (the report workflow never does; aliases are stable HMACs, not ids). Dim values that look like snowflakes (15+ digits), UUIDs or hashes are refused. Enforced by privacy tests. The repo is public, so workflow logs and summaries are public: the report is built to be safe there. The workflow uses one token per target (`OPS_TOKEN_PRODUCTION`, `OPS_TOKEN_STAGING`, different values) in a `reports` environment limited to `main`; the Worker secret is `OPS_TOKEN` in each deploy environment.
- ✅ **Discord interactions endpoint** (`POST /api/discord/interactions`, for `/feedback`, the Activity's Launch command and the lounge message's button; designs in `docs/design/feedback.md` and `docs/design/lounge-message.md`): public, but every request must carry a valid Ed25519 signature (`X-Signature-Ed25519` over `X-Signature-Timestamp` plus the raw body, Web Crypto, the app's public key from the `DISCORD_PUBLIC_KEY` var, which is not a secret). A missing or bad signature, or a timestamp more than 5 minutes from now, is a 401 before any JSON is parsed; the body is capped at 64 KiB; with no public key configured the route is a plain 404. Replies are ephemeral with `allowed_mentions: { parse: [] }`; Launch and the lounge button get LAUNCH_ACTIVITY and nothing else. Screenshots are fetched only from `https://cdn.discordapp.com/` or `https://media.discordapp.net/` (10 s timeout, no redirects, read stops past 8 MiB, type checked from the first bytes), after the reply, and only the kind of a failure is logged.
- ✅ **Feedback inbox and routes** (`/api/ops/feedback/*`): a SQLite Durable Object (`FeedbackInbox`, RPC only, no HTTP surface) holds the reports. Limits: 3 reports per player and 20 per server in 24 hours, 200 not yet exported; reports and screenshots are deleted after 180 days. The player is stored only as an HMAC of the user id (key HKDF-derived from the Discord client secret, own salt and label), used for the limit and never shown. `pending` and `exported` need bearer `OPS_TOKEN`; `report` and `screenshot` need the separate, read-only `FEEDBACK_READ_TOKEN` (so the export workflow cannot read screenshots, and the triage agents cannot mark reports). As with the ops report: unset or empty token, wrong token or wrong method all answer the same plain 404, tokens are compared in constant time after hashing, requests are rate-limited per IP hash (a burst of 60, enough for one export run), and session auth is never read. Public/private split: the GitHub issue gets the kind, the text (in a code block), time, version, branch and a stable server alias; the screenshot, the guild id and the reporter hash never leave the Worker, and screenshots are served only as `attachment` with `nosniff` and `no-store`, never to GitHub. Enforced by privacy tests.
- ✅ **Dev tools** (`/api/dev/*`, staging only): the `DEV_TOOLS` Worker var is `"on"` only in the staging env of `wrangler.jsonc` (a test parses the file); with it off every dev route answers 404 before the session check (a plain 404: unknown `/api/*` routes answer 401, so it is not indistinguishable from them), the dev clock offset and forced states are ignored, and the client panel is not in the production bundle. With it on, tools still need a verified session. Per-player tools act on the caller's own data; the clock, raid-phase, raid-resolve, raid-simulate, raid-boss, raid-festival, dungeon-modifiers, dungeon-seed, games-bots, games-run-now and games-reset act on the whole staging guild. `GET /api/dev/events` shows the guild's recent events (no actors). Dev POSTs are not idempotent (a retry grants twice), accepted for a staging test tool. Each use is logged as `dev_action`, which reports exclude, and dev ledger rows (`source = 'dev'`) are excluded from rollups; the ledger stays append-only (`dungeon-reset` appends a negative `dev` entry).
- ✅ **Component workbench** (`/workbench.html`, staging only): a static gallery of UI components with fixture data. It is a separate Vite entry built only for staging and dev (a build test checks production `dist` has none of it), needs no login, makes no `/api` calls, and its feedback button only opens a prefilled GitHub issue. Agents act on `ui-feedback` issues only when Misa wrote them, and treat issue text as data.
- ✅ **Wiki** (`/wiki.html`, production and staging, linked from nowhere in the game): a static page generated at build time from the content data (creatures, talents, the combat v2 draft). No JavaScript, no `/api` calls, no player data; every text is HTML-escaped by the generator (a test checks it), and the page's CSP is the site's. It shows only game configuration that players may discover anyway.

Sources: developers.cloudflare.com/workers/runtime-apis/web-crypto · developers.cloudflare.com/durable-objects

## 6. Discord identity and sessions

- ✅ M1 Flow: the SDK's `authorize()` gives a code → the Worker exchanges it at `POST https://discord.com/api/oauth2/token` (form-encoded, client secret server-side only) → the Worker calls `GET /users/@me` to learn who the player really is → the Worker checks the activity instance exists and the user is in it (`GET /applications/{id}/activity-instances/{instance_id}`, bot token) → the Worker issues **its own session token**.
- ✅ M1 Session token `s1.<guildId>.<secret>.<mac>`: the secret is 32 random bytes and only its SHA-256 hash is stored, in the guild's Durable Object. The MAC is HMAC-SHA256 with a key derived (HKDF) from the Discord client secret; the Worker verifies it in constant time before addressing any Durable Object, so forged guild IDs can't create or wake objects. Idle expiry 1 h (sliding), absolute 12 h, at most 10 sessions per player. Rotating the Discord client secret logs everyone out. Held **in memory only** in the iframe and sent as `Authorization: Bearer` (and in the WebSocket handshake). Never in URLs.
- ✅ M1 The Discord access token is used once to identify the player and returned to the client only for the SDK's `authenticate()` call; it isn't stored.

Sources: docs.discord.com/developers/activities/building-an-activity · docs.discord.com/developers/activities/development-guides/networking · docs.discord.com/developers/resources/application (activity instances)

## 7. Input handling

- ✅ M1 Every request body is validated with a strict **Valibot** schema (unknown keys rejected, 4 KB body cap); Discord API responses are validated too. The same applies to WebSocket messages when they arrive (M5).
- 🔜 M2 **Nicknames:** NFKC-normalise, trim, collapse whitespace; 1–20 code points; reject control (`\p{Cc}`), format (`\p{Cf}`, which includes zero-width and bidi override characters) and unassigned (`\p{Cn}`) characters. Server-side; client checks are UX only.
- ✅ **Feedback text** (`/feedback`): cleaned before storage (control, format, bidi, zero-width and lone-surrogate characters removed; newlines kept; 3 or more line breaks become 2), 10 to 1500 code points, kind one of `bug`/`idea`/`other`; Discord's payload is parsed with valibot and every field read is checked (snowflake ids, lengths). The text is stored as plain text and is only ever shown inside a code block.
- ✅ Rendering: JSX text only. `dangerouslySetInnerHTML` and `innerHTML` are banned by lint.
- 🔜 M4 **Posting to Discord:** escape markdown in any player text and always send `allowed_mentions: { parse: [] }` (otherwise bot messages parse `@everyone`, roles and users by default). Messages capped at 2,000 characters.

Sources: docs.discord.com/developers/resources/message (allowed mentions object)

## 8. HTTP headers

- ✅ Frontend (`_headers`): strict CSP (`default-src 'self'`, no inline scripts or styles, `object-src 'none'`, `base-uri 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, HSTS, `Permissions-Policy`. No `X-Frame-Options`, which would break the Discord iframe.
- ✅ `frame-ancestors` (Discord domains) is in **report-only** mode until we've verified the exact framing origins on desktop, web and mobile. 🔜 Enforce after testing in M1.
- ✅ API responses: `Cache-Control: no-store`, `nosniff`, `Referrer-Policy: no-referrer`, no CORS headers (same-origin only through Discord's proxy).

Sources: docs.discord.com/developers/activities/development-guides/networking · developers.cloudflare.com/workers/examples/security-headers
