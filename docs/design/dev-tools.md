# Dev tools: a debug panel for every view (staging only)

Status: **shipped 2026-10-13**: the server side (the gate, the dev clock and every tool in the table below, as `/api/dev/*` routes; see "Dev tools: the gate, the dev clock and where forced state lives" in `decisions.md`) and the client panel (`apps/activity/src/dev/`, see "Dev tools: the client panel" in `decisions.md`). Limits: the clock only moves forward (plus a reset to zero), simulated raid players are auto-placed rather than placed by hand, and the Analytics "roll up now" tool answers 501 until the rollup hook is wired. Plan written 2026-10-13. Misa: "improve dev tooling in the dev app: running simulated raids, sped up expeditions, setting dungeon rank, raid boss difficulty tier, etc. Basically a debug panel into every view that lets me set the game into a desired state for testing. This needs to be strictly in the dev environment."

## Safety (non-negotiable)

- **Server gate:**
  - A new Worker var, `DEV_TOOLS`, is `"on"` only in the staging environment in `wrangler.jsonc`, and `"off"` at the top level and in production. This is the same pattern as `RAID_PRACTICE`.
  - Every dev route is under `/api/dev/*` and returns a plain 404 unless `DEV_TOOLS === "on"`. (Unknown `/api/*` routes answer 401, because the session check comes first, so this 404 is not hidden.)
  - A test checks that the production config has it off, and that every dev route refuses when it is off.
  - These changes need PR callouts for `wrangler.jsonc`.
- **Client gate:**
  - The panel's code is in a separate lazily loaded chunk, imported only when the server's session or config response says dev tools are on.
  - The production build also strips it, through a Vite define.
  - Production users never download it.
- **Scope:** dev routes act only on the caller's own guild. Most act only on the caller's own player data. These act on the **whole staging guild**, so they affect every player in it: the clock, raid-phase, raid-resolve, raid-simulate, raid-boss, raid-festival, dungeon-modifiers, dungeon-seed and the Valley Games tools (games-bots, games-run-now, games-reset). `GET /api/dev/events` shows the guild's recent events (kind, time and props), without actors. Identity comes from the session, as always.
- **Not idempotent:** dev POSTs carry no idempotency key, so a retry grants twice. Accepted for a staging test tool.
- **The ledger stays append-only:** set-balances and `dungeon-reset` append `dev` entries (a negative one for what a reset takes back, never below a zero balance) and never delete ledger rows. Because the credits keep their idempotency keys, a run of the same day and attempt after a reset is not paid Bait or Essence again (gear grants of the day are deleted, so those can be granted again). Rollups ignore `source = 'dev'` ledger rows.
- **The dungeon on a map (2026-10-18, `dungeon-paths.md`):** the day is one map, redrawn from the day's seed. _Re-roll the day's seed_ clears the stored map (`map_json`), so the next look draws a new map; a run that is open keeps the map it started with. _Pick the day's modifiers_ is laid over the map when it is read (never stored): the first two entrance rooms (left to right, a third takes the first again) and the room boss take the picked three, which are also the three entries old clients read; the other rooms keep what the seed drew. _Reset today's run_ also deletes a run that is still open and its steps (nothing was paid for it, and it never touched the progress; a treat it was paid with stays spent). _Force the first-day retry_ turns a run that went home or cleared into a defeat, since only a defeat opens the retry. The separate `dungeon-map` tool of the design is not built: re-rolling the seed does the same.
- **The Valley Games (2026-10-22, `valley-games.md`):** _games-bots_ `{ count? }` (1 to 12, default 6) makes sure the raid's guests `dev-guest-1` to `-<count>` exist with at least six creatures each and turns their auto-entry on (they stay in the raid roster as they were); bots appear in the show and the post and get no medals, records or experience. _games-run-now_ `{ showInSeconds? }` (5 to 120, default 15) locks the next show day now, as the scheduler would (auto-entry, snapshots, the live seed), and starts its show then; the award follows at its end, and the next day keeps its own 13:37 lock. _games-reset_ `{}` forgets the latest locked day (its results, placings, auto-entries and post) so it can be played again; what it paid stays. A day reset after its own lock time locks again at once (a late lock shows 15 s later, or at 13:40 if that is later).
- **Logging:** every dev action is logged as an analytics event kind, `dev_action`, flagged so reports exclude it. Staging data is never mixed into production reports.

## The dev clock

A per-guild **time offset** is stored in the Durable Object on staging only. `now()` is the real time plus the offset, so time-based features can be fast-forwarded without special cases:

- expeditions and push-on goals;
- Workshop jobs;
- the 13:37 daily reset and the dungeon day;
- raid week phases.

A "+1 h, +6 h, +1 day, next 13:37, next phase" control moves it, and "reset clock" clears it. Alarms re-arm from the shifted clock.

## Panel

A floating "DEV" button opens a drawer with a section per view and shared controls. These tools come from the "How to test" sections of PRs #5–#11:

| View        | Tools                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Everywhere  | Set Bait and Essence. Grant parts, supplies and blueprints. Dev clock. Reset local flags (coach marks, the slot-wipe notice, the welcome kit). Reset my account on this guild, after an in-panel confirmation.                                                                                                                                                                                   |
| Creatures   | Grant any species (shiny or Festival). Set level, fusion and evolution. Set explorer rank, XP and familiarity per place. Set Crafting XP.                                                                                                                                                                                                                                                        |
| Workshop    | Finish all jobs now. Grant a gear item (base, rarity, item level). Fill the bag to test the cap.                                                                                                                                                                                                                                                                                                 |
| Expeditions | Finish trips now. Force a push-on offer, with a chosen goal or a forced success or failure. Force night or a Festival week. Set slots or the rank sum. Unlock or reset journal pages. Trigger the slot-wipe notice.                                                                                                                                                                              |
| Dungeon     | Set depth (and jump to the next landmark). Reset today's run. Set the streak. Force the first-day retry. Pick the day's modifiers. Re-roll the day's seed.                                                                                                                                                                                                                                       |
| Raid        | Jump the week to Preparation, Phase 1, Phase 2, finale day or week done. Resolve Phase 1 or Phase 2 now. Set the boss and Boss Rank (difficulty tier). Toggle Festival week. Fill the roster with N simulated players (guests with placed teams). Start a live finale now with a short countdown, the existing practice mode extended. Run a full simulated raid week and show the after-action. |
| Analytics   | Show the last 50 events this guild wrote, then the next rollup. Trigger a rollup now.                                                                                                                                                                                                                                                                                                            |

## Tests

- Dev routes refuse when the flag is off.
- Each tool's state change works.
- The dev clock moves expeditions, jobs, the dungeon day and raid phases correctly.
- The production bundle contains no panel code: a build-time test greps `dist/` for a marker.

## How to test with the dev panel

The panel exists only on staging (`creatures-staging.misacorp.dev`, whichever branch was last put on staging with the `deploy` workflow's manual run). Production has neither the routes nor the panel code.

1. Open the Activity on staging. A small orange **DEV** button sits at the bottom right. Tap it to open the drawer; **Close** shuts it.
2. At the top is the **Dev clock**: it shows the game time, the game day, how far the clock is shifted and the raid week. Use +1 h, +6 h, +1 day, Next 13:37 or Next phase to move time forward (expeditions, jobs, the daily reset and raid phases follow). Reset clock puts it back to real time. The clock never goes back; use Reset clock and set the state you need again.
3. The section for the tab you are on opens first (Creatures, Workshop, Expeditions, Dungeon or Raid); the others are folded. Fill in a form and tap **Apply**; the result or the error code shows at the top of the drawer, and the screen reloads so the change shows at once. A field left empty means "leave as it is".
4. **Bait, parts, supplies, blueprints** (folded, at the top) sets Bait and Essence and grants goods.
5. **This browser and my account**: _Reset local flags_ makes the Raid tab's tag hint and the slot-wipe notice show again. _Reset my account_ deletes your data on this server (creatures, gear, trips, raid, dungeon, and so the welcome kit comes back); type `RESET` to enable it.
6. **Analytics** lists the last 50 events this server wrote (dev actions are logged as `dev_action`) and has Roll up now.
7. Nothing else is needed: the panel uses your normal session, so it only changes your own player and your own server.

How the panel is kept out of production: `apps/activity/vite.config.ts` sets `__DEV_TOOLS_BUILD__` to true only for the dev server, tests and a build with `TARGET_ENV=staging` (the deploy job already sets that). Otherwise the dynamic `import()` in `src/dev-gate.ts` is dead code and the chunk is not built. `src/dev-build.test.ts` builds both ways and searches the output for the panel's marker string.
