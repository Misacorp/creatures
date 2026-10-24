# Retro: raid finale visuals (2026-10-24)

Covers: 2026-10-22T23:10:20.059Z to 2026-10-24T15:56:09.577Z (session 54601dac-344d-5838-9625-fb5785194f8b)

Session: the stretch after the overnight round on the raid finale: the reviewer-led pixel attacks, then staging feedback rounds on the boss barrier, the move tracker and the board. Outcome: PR #74 (raid finale rework, merged) and PR #78 (creature names on the raid board, tiny HP bars).

## Where Misa stepped in

| When        | Kind       | What happened                                                                                                            | Cause                                                                                                                                                                                  |
| ----------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10-24 06:22 | Correction | The "clipped creature" I listed as a bug was the board scrolled sideways on a phone.                                     | I judged one phone screenshot without asking how the board scrolls; the behaviour was known (Stage follows the acting creature).                                                       |
| 10-24 06:22 | Redirect   | The move list "takes up a ton of screen space that should belong to the boss"; the boss should always sit in the middle. | The reviewer agents' pick (countdown with names and bigger text) was applied as the default without weighing it against his standing rule that the boss and roster are the main focus. |
| 10-24 06:22 | Redirect   | Make the barrier a generic, configurable component for all similar effects, not a Backdraft one.                         | I had planned it generic but described it as Backdraft's; the proposal did not lead with "one component, configured per move".                                                         |
| 10-24 07:17 | Quality    | The barrier's border was too pronounced; build it from shimmering triangles instead.                                     | First version reused a CSS dome with a border; fine in stills, heavy on a phone.                                                                                                       |
| 10-24 07:43 | Quality    | Triangles looked like pixels; the shatter was cropped to the boss's box.                                                 | 9 px triangles chosen without relating them to the screen; the canvas was only as big as the dome. My own stills showed the crop and I missed it.                                      |
| 10-24 07:59 | Quality    | Shield too small and hard to see, a rough square, shimmer direction.                                                     | The dome hugged the sprite; the shape test only checked "inside a dome".                                                                                                               |
| 10-24 08:08 | Correction | The hexagon's edges were spiky.                                                                                          | The triangle grid was half a triangle off the hexagon's centre. No geometric test of the outline; the screenshot I judged was at 1x and looked fine.                                   |
| 10-24 08:24 | Repeat     | "How does it look on desktop?"                                                                                           | Screenshots were phone-only again, the same gap the Valley Games retro (10-23) named.                                                                                                  |
| 10-24 11:59 | Quality    | Default names on the raid board; no way to see who has taken damage.                                                     | The placement board printed species names by design (an old comment), never revisited; raid creatures had no HP on the client at all.                                                  |

## Other friction

- **No way to check the staging footer.** CLAUDE.md asks to check the footer's branch and commit after a staging deploy; both curl attempts to the staging host were denied (10-24 05:49), so every deploy ended with "please confirm the footer".
- **Waiting on the deploy run took 30+ polling calls** to the Actions API (no `gh`, no event for workflow runs).
- **`pnpm lint` runs out of memory** with Node's default heap; every full check needed `NODE_OPTIONS=--max-old-space-size=8000` by hand.
- **The full checks take about 15 minutes**, and the stop hook nagged six times while they ran.
- **Late surprises from repo checks:** the workbench registry test fails for any export of `src/ui` without a page (twice: the new bar, then a helper); the worker's live API contract test wants every key in every status (the lobby's missing `hp`); the client fixtures are hand-kept, not captured. Each cost a round after the "done" moment.
- **The fake test DOM drops style values and creature labels**, so a cssVars-driven component and the spoken order could not be asserted directly; tests were rewritten two or three times.
- **Two merges of main** (Valley Games, then its polish) with conflicts in docs, the registry glob and the sim's headline numbers (re-measured).

## What went well

- Four reviewer agents with distinct personas gave sharp, consistent feedback, and the pixel-style pass came straight out of it.
- Short videos and stitched stills let Misa judge motion without staging; each round turned around in under 30 minutes.
- A failing-first test for the hexagon outline caught the grid offset for good.
- Main was merged before each staging deploy and before the PR, so both PRs opened conflict-free.

## Proposals

| #   | Change                                                                                                                                                                                                                                 | Where                               | Would have prevented                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | "Every screenshot round includes a desktop width (1100 px) next to the phone (390 px)." A line in the "Showing work to Misa" section.                                                                                                  | `docs/design/ux-patterns.md`        | The 08:24 desktop ask (and the same ask in the 10-23 retro).                                        |
| 2   | Allow read-only `curl -s https://creatures-staging.misacorp.dev/*` (or add a tiny `scripts/staging-footer.mjs` that prints the deployed branch and commit) so the footer check CLAUDE.md asks for can be done.                         | `.claude/settings.json` or a script | Ending every deploy with "please check the footer".                                                 |
| 3   | Put the heap size in the lint script (`NODE_OPTIONS=--max-old-space-size=8192 eslint .`) and add `pnpm check` that runs format, lint, typecheck, build and the tests in order.                                                         | `package.json`                      | The lint OOM and hand-built check commands; fewer misses like the typecheck count read as a pass.   |
| 4   | Keep set style values in the test DOM (`style.setProperty` / `getPropertyValue` backed by a map).                                                                                                                                      | `apps/activity/src/test-dom.ts`     | Rewriting the TinyHp and stage tests around class names and helpers.                                |
| 5   | A short "before you call it done" list for UI and API changes: a `src/ui` export needs a workbench page (helpers go outside `ui/`); a change to a live or replay response updates the worker contract test and the hand-kept fixtures. | `docs/design/testing.md`            | The late registry and contract failures after the work looked finished.                             |
| 6   | When applying a review agent's recommendation, check it against Misa's standing priorities first and say which one it trades against.                                                                                                  | `CLAUDE.md` (Agent roles)           | Making the bulky countdown the default, then the 06:22 "give the screen back to the boss" redirect. |

Status: all six applied on 2026-10-24, some in a smarter form Misa asked for: lint split per package with a cache instead of more memory; a staging check script and skill, plus a check in the deploy workflow; `pnpm check:changed`; the registry test counting only components; a screenshot script; the review brief; the test page keeping style values (decisions.md, 2026-10-24).
