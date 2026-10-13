# Dev tools: a debug panel for every view (staging only)

Status: **plan**, 2026-10-13. Misa: "improve dev tooling in the dev app: running simulated raids, sped up expeditions, setting dungeon rank, raid boss difficulty tier, etc. Basically a debug panel into every view that lets me set the game into a desired state for testing. This needs to be strictly in the dev environment."

## Safety (non-negotiable)

- **Server gate:**
  - A new Worker var, `DEV_TOOLS`, is `"on"` only in the staging environment in `wrangler.jsonc`, and `"off"` at the top level and in production. This is the same pattern as `RAID_PRACTICE`.
  - Every dev route is under `/api/dev/*` and returns 404 unless `DEV_TOOLS === "on"`.
  - A test checks that the production config has it off, and that every dev route refuses when it is off.
  - These changes need PR callouts for `wrangler.jsonc`.
- **Client gate:**
  - The panel's code is in a separate lazily loaded chunk, imported only when the server's session or config response says dev tools are on.
  - The production build also strips it, through a Vite define.
  - Production users never download it.
- **Scope:** dev routes act only on the caller's own guild. Most act only on the caller's own player data. Guild-level ones (raid week state, boss) act on the staging guild the caller is in. Identity comes from the session, as always.
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
| Workshop    | Finish all jobs now. Grant a gear item (base, rarity, level, enchant). Fill the bag to test the cap.                                                                                                                                                                                                                                                                                             |
| Expeditions | Finish trips now. Force a push-on offer, with a chosen goal or a forced success or failure. Force night or a Festival week. Set slots or the rank sum. Unlock or reset journal pages. Trigger the slot-wipe notice.                                                                                                                                                                              |
| Dungeon     | Set depth (and jump to the next landmark). Reset today's run. Set the streak. Force the first-day retry. Pick the day's modifiers. Re-roll the day's seed.                                                                                                                                                                                                                                       |
| Raid        | Jump the week to Preparation, Phase 1, Phase 2, finale day or week done. Resolve Phase 1 or Phase 2 now. Set the boss and Boss Rank (difficulty tier). Toggle Festival week. Fill the roster with N simulated players (guests with placed teams). Start a live finale now with a short countdown, the existing practice mode extended. Run a full simulated raid week and show the after-action. |
| Analytics   | Show the last 50 events this guild wrote, then the next rollup. Trigger a rollup now.                                                                                                                                                                                                                                                                                                            |

## Tests

- Dev routes refuse when the flag is off.
- Each tool's state change works.
- The dev clock moves expeditions, jobs, the dungeon day and raid phases correctly.
- The production bundle contains no panel code: a build-time test greps `dist/` for a marker.
