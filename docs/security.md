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
- ✅ Triggers: `pull_request` for CI (fork PRs get no secrets and a read-only token); `push` for deploys. No `pull_request_target`, `workflow_run` or `issue_comment`.
- ✅ No `${{ github.event.* }}` interpolated into `run:` scripts; values pass through `env:`.
- ✅ `persist-credentials: false` on every checkout.
- ✅ Deploy secrets live in GitHub **environments**: `production` (deployable from `main` only) and `staging`. Dependabot branches are excluded from deploys.
- ✅ CI lints workflows with **actionlint** and audits them with **zizmor** (offline mode).
- 👤 Repo settings: default `GITHUB_TOKEN` read-only; require actions pinned to full SHA; require approval for workflows from outside collaborators; ruleset on `main` (PR required, `ci` check required, no force push or deletion).

Sources: docs.github.com/en/actions/reference/security/secure-use · docs.zizmor.sh · cisa.gov alert 2025-03-18 (CVE-2025-30066)

## 3. Secrets

- ✅ No secrets in the repo. `.gitignore` covers `.env*`, `.dev.vars*`, keys and wrangler state; only `*.example` files with placeholders may be committed.
- ✅ CI runs **gitleaks** over the PR's commits.
- 👤 GitHub **secret scanning** and **push protection** enabled on the repo (free for public repos).
- ✅ Production secrets (`DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, later `LEET_API_KEY`) live in GitHub environment secrets and are pushed to Cloudflare Worker secrets by the deploy job. The Discord client ID is public and is committed in `wrangler.jsonc`.
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
- 🔜 M1 **Ledger:** append-only, integer amounts, `CHECK (balance >= 0)`. Every spend has a client-generated idempotency key with a `UNIQUE` constraint; the check, debit and grant run in one synchronous SQLite transaction inside the guild's Durable Object (no `await` between check and write); retries return the stored result.
- 🔜 M1 **Rate limiting:** per-player token bucket inside the Durable Object (exact), plus a coarse per-IP limit at the edge.
- 🔜 M1 Constant-time comparison (`crypto.subtle.timingSafeEqual`) for any secret or token comparison.

Sources: developers.cloudflare.com/workers/runtime-apis/web-crypto · developers.cloudflare.com/durable-objects

## 6. Discord identity and sessions

- 🔜 M1 Flow: the SDK's `authorize()` gives a code → the Worker exchanges it at `POST https://discord.com/api/oauth2/token` (form-encoded, client secret server-side only) → the Worker calls `GET /users/@me` to learn who the player really is → the Worker checks the activity instance exists and the user is in it (`GET /applications/{id}/activity-instances/{instance_id}`, bot token) → the Worker issues **its own session token**.
- 🔜 M1 Session token: 32 random bytes, opaque; only its SHA-256 hash is stored server-side, bound to user ID and guild ID; short idle expiry with sliding renewal and an absolute maximum. Held **in memory only** in the iframe and sent as `Authorization: Bearer` (and in the WebSocket handshake). Never in URLs.
- 🔜 M1 The Discord access token is used once to identify the player and returned to the client only for the SDK's `authenticate()` call; it isn't stored.

Sources: docs.discord.com/developers/activities/building-an-activity · docs.discord.com/developers/activities/development-guides/networking · docs.discord.com/developers/resources/application (activity instances)

## 7. Input handling

- 🔜 M1 Every request body, query and WebSocket message is validated with a strict **Valibot** schema (unknown keys rejected, size limits).
- 🔜 M2 **Nicknames:** NFKC-normalise, trim, collapse whitespace; 1–20 code points; reject control (`\p{Cc}`), format (`\p{Cf}`, which includes zero-width and bidi override characters) and unassigned (`\p{Cn}`) characters. Server-side; client checks are UX only.
- ✅ Rendering: JSX text only. `dangerouslySetInnerHTML` and `innerHTML` are banned by lint.
- 🔜 M4 **Posting to Discord:** escape markdown in any player text and always send `allowed_mentions: { parse: [] }` (otherwise bot messages parse `@everyone`, roles and users by default). Messages capped at 2,000 characters.

Sources: docs.discord.com/developers/resources/message (allowed mentions object)

## 8. HTTP headers

- ✅ Frontend (`_headers`): strict CSP (`default-src 'self'`, no inline scripts or styles, `object-src 'none'`, `base-uri 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, HSTS, `Permissions-Policy`. No `X-Frame-Options`, which would break the Discord iframe.
- ✅ `frame-ancestors` (Discord domains) is in **report-only** mode until we've verified the exact framing origins on desktop, web and mobile. 🔜 Enforce after testing in M1.
- ✅ API responses: `Cache-Control: no-store`, `nosniff`, `Referrer-Policy: no-referrer`, no CORS headers (same-origin only through Discord's proxy).

Sources: docs.discord.com/developers/activities/development-guides/networking · developers.cloudflare.com/workers/examples/security-headers
