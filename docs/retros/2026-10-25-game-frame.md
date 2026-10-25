# Retro: game frame and Home board (2026-10-25)

Covers: 2026-10-23T21:49:39.224Z to 2026-10-25T09:51:07.983Z (session 4d6a6acb-a5d1-53c2-aef5-3547c3eeb39c)

Session: Valley Games polish, then a new game frame (phone dock with Collection / Home / Adventure, Home notice board, HUD with Settings, no footer), iterated with Misa on staging. Outcome: PR #72 (Games polish) and PR #73 (game frame) merged.

## Where Misa stepped in

| When        | Kind       | What happened                                                                                                                   | Cause                                                                                                                                                                                 |
| ----------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10-24 12:04 | Quality    | "Awkward space below the bottom bar", six dock items too many                                                                   | The dock was judged in workbench frames, which have no phone corners, no Discord safe areas and no real window scroll.                                                                |
| 10-24 20:08 | Quality    | Tilted notices "kind of wonky" on desktop                                                                                       | Guess: desktop shots were taken, but the tilt was tuned on phone-width papers and not judged again at full width.                                                                     |
| 10-25 04:37 | Correction | Journal and Stats pins "aren't a good fit" under Needs you; ribbon covers the Journal title; text "takes a tiny time to settle" | The pins' teasers loaded after the page (layout jump), and a decoration (`::after` ribbon) sat over text. Neither the ui-audit (overflow only) nor a still screenshot catches either. |
| 10-25 05:51 | Quality    | Content seeps above the How to play bar; the search field looks cut under the HUD                                               | Discord's top safe area and real document scroll were never simulated; the sticky bars were only seen inside workbench frames.                                                        |
| 10-25 06:05 | Redirect   | No sticky header: fixed, full width, same at every scroll position                                                              | Design choice; the earlier patch (a fixed strip behind a sticky bar) treated the symptom.                                                                                             |
| 10-25 06:23 | Quality    | Gear "says spaceship"; taps on the dock ignored during momentum scroll                                                          | Glyph drawn on the 8 x 8 grid without a check that it reads at size; click-only buttons lose taps that stop a fling (only visible on a real phone).                                   |
| 10-25 08:49 | Repeat     | "Can we accept your earlier draft of a larger" gear; settings button misaligned with the currency box                           | The 10 x 10 draft failed the 8 x 8 glyph test, and the agent quietly redrew it on 8 x 8 and shipped that without saying the shown design had changed.                                 |

## Other friction

- **Stop-hook nagging, six times** (10-23 21:57 to 10-24 22:37): commits left unpushed or files uncommitted at the end of a turn.
- **Force push denied** (10-24 05:50): handled by a merge commit, as the rules want.
- **Node's `EventTarget` ignores a boolean `capture` on remove** (10-25 06:25): a test of `instant-press.ts` failed until listeners used `{ capture: true }` objects. A quirk of the test runtime, not of browsers.
- **The digest's "most edited files" was near empty** because most edits ran through implementer worktrees and Python/sed in Bash, so it says little about rework.

## What went well

- Implementers in worktrees, one brief per round, lead review before each merge: 18 subagents, no broken tree.
- An independent review of the PR #73 diff found six real issues (stale streak, misleading labels, focus return, raid refresh, Bait filter, a UTC default), all fixed with tests before merge.
- Every round ended with screenshots at 390 and 1280 px, `pnpm check:changed`, a staging deploy and `deployed.mjs --expect HEAD`, so Misa always tested what was described.
- The momentum-scroll fix (`ui/instant-press.ts`) came with a rule in "The frame" and a touch test in `main-nav.test.tsx`, so it should not be undone.
- A one-off Playwright script that rebuilt the real shell in a plain document with a fake 40 px Discord inset showed the fixed HUD at the top and scrolled before shipping it.

## Proposals

| #   | Change                                                                                                                                                                                                                                                                            | Where                                                              | Would have prevented                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | A `--shell` mode for `scripts/shoot.mjs`: lift the entry's HUD, screen and dock into a real `main.card` in the document, set `--discord-safe-area-inset-top/bottom` (e.g. 40 px / 24 px), and shoot at scroll 0 and scrolled. Use it for any change to the HUD, dock or page top. | `apps/activity/scripts/shoot.mjs`, `ux-patterns.md`                | The seep above the bar, the cut search field and the dock's bottom gap, found by Misa on his phone (10-24 12:04, 10-25 05:51). |
| 2   | Rule: "When a check forces a visible change to a design Misa has seen (size, shape, art), say so in the same message and show the new version; never ship the downgrade silently."                                                                                                | `CLAUDE.md`, "The owner and how we work"                           | The gear repeat (10-25 08:49).                                                                                                 |
| 3   | Rule in "The frame": "A card on Home never fills in text after the page has drawn (no teasers that load later); if it needs data, reserve its line or leave it out." Plus a ui-audit check that flags a decoration (`::before`/`::after` with a background) overlapping text.     | `docs/design/ux-patterns.md`, `apps/activity/scripts/ui-audit.mjs` | The layout jump and the ribbon over "Journal" (10-25 04:37).                                                                   |
| 4   | Commit and push at the end of every turn that changed files (implementer merges included), not at the end of a batch.                                                                                                                                                             | `.claude/agents/implementer.md` brief template, lead habit         | Six stop-hook reminders.                                                                                                       |

Status: Misa applied 1, 2 and 3 (the Home rule only; the overlap check in ui-audit was dropped as too noisy, since many overlaps are on purpose) and dropped 4 (the stop hook already covers it).
