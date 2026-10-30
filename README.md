# Leet Creatures

A Discord Activity for small communities: collect creatures, send them on expeditions, and take on a weekly co-op raid boss together. Runs on Cloudflare at `creatures.misacorp.dev`.

- Rules for contributors and agents: [`CLAUDE.md`](CLAUDE.md)
- Design decisions: [`docs/design/decisions/`](docs/design/decisions/README.md) (by topic; query with `pnpm decisions`)
- Security: [`docs/security.md`](docs/security.md)
- Research: [`docs/research/`](docs/research/)

## Development

Requires Node 22 and pnpm (version pinned in `package.json`; `corepack enable` picks it up).

```sh
pnpm install --frozen-lockfile
pnpm build        # builds the Activity, then dry-runs the Worker bundle
pnpm test
pnpm --filter @creatures/worker dev     # Worker + built Activity on http://localhost:8787
```

To try it inside Discord locally, run `cloudflared tunnel --url http://localhost:8787` and point the **dev** Discord app's `/` URL mapping at the tunnel host. Remember to set it back to `creatures-staging.misacorp.dev` afterwards.

Deploys happen only in CI: merging to `main` deploys production; staging is deployed by hand (GitHub, Actions, deploy, "Run workflow" on a branch). Pushing a branch deploys nothing.
