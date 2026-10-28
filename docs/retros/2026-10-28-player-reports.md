# Retro: player reports, raid damage and signature talents (2026-10-28)

Covers: 2026-10-26T10:19:55.034Z to 2026-10-28T21:20:14.289Z (session 7caf8ded-0ee3-573e-8a7c-51ab2b3a13c6)

Session: debug a failed `/feedback` export run, sort the open player reports, then fix the ones Misa picked; two days later, make signature talents readable. Outcome: #89 merged (real Damage plus a separate Score on the raid results, tap-to-sort, private creature notes, fixes for #77, #75 and #63; eight reports triaged on GitHub). #96 merged (tapping a signature talent opens a help popover).

## Where Misa stepped in

| When        | Kind     | What happened                                                                                                                                                                           | Cause                                                                                                                                                                                                                                                             |
| ----------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10-26 13:02 | Quality  | "The sort order chevron is massive." The new sort marker reused the Accordion's chevron (21 × 12 px) next to 12 px column headings.                                                     | The lead reached for the nearest existing glyph without judging its size against the text beside it. The screenshot it sent showed the problem, but nobody checked the size on it.                                                                                |
| 10-26 13:07 | Quality  | "Is this the same triangle we use elsewhere?" No: the lead drew a new 5 × 3 pixel triangle. The app already had one (the "Equip on" marker in `ItemDetail.tsx`) and two text triangles. | The search for existing triangles came only after Misa asked. The lookup table in `ux-patterns.md` has no row for small markers (triangles, chevrons), so nothing pointed at the existing ones. The "UI review checks reuse" rule added on 10-28 covers this now. |
| 10-26 13:08 | Redirect | Misa asked for a text triangle (▼). At 13:10, during that turn, he took it back: the pixel triangle looked better, just a bit smaller.                                                  | Normal design iteration, not a mistake. The second message arrived mid-turn, and the retro digest doesn't list mid-turn messages. Without it, the revert at 13:11 looks like the lead ignored Misa.                                                               |

## Other friction

- **A commit with 2 failing tests was pushed (10-26 13:10).** The ▼ commit and its push ran in one command chain that didn't stop when the tests failed: the test output was piped through `grep`, which hid the failing exit code. The lead caught it in the output, said so, and the next commit fixed it. The rule "push after the checks pass" (CLAUDE.md) was followed in spirit, but the command didn't enforce it.
- **The agent killed its own shell twice (10-28 18:53, 18:55).** `pkill -f "vite --port 5199"` and `pgrep -f … | xargs kill` matched the Bash command line itself, so the command died with exit 144 before it ran its other steps. A Vite server had been started by hand only to screenshot a popover after a tap, which `scripts/shoot.mjs` can't do (it has no click step).
- **`gh` GraphQL is blocked (10-28 18:51, 18:56).** `gh pr list` and `gh pr create` returned 403. Both worked at once through `gh api repos/Misacorp/creatures/pulls`. Each session learns this again.
- **The merged branch was reused (10-28).** PR #89 had already been merged when the signature work started, so the branch was restarted from `main`. Then `--force-with-lease` failed because GitHub had deleted the remote branch. A plain push worked.
- **A test-helper change broke an unrelated test (10-28 18:52).** Wrapping every creature page test in `PopoverHost` turned tags into buttons, and a test that counts "Ribbon" buttons failed. Making the host opt-in fixed it.
- **The full `pnpm check` lost its client typecheck partway through (10-26 10:56)**, probably killed for lack of memory (a guess, not confirmed). The checks passed when run one at a time.
- **Stop-hook nags (10-26 10:56)** about "no remote branch" came because the shallow clone didn't track the pushed branch. It was already pushed.

## What went well

- The feedback-run diagnosis (10:21) was exact: a 30 s timeout on one staging call, the 29 runs before it green, and no player involved.
- The triage (10:26) checked every claim against `main`, named the cause of each bug, and asked one clear question. Misa answered all of it in one message.
- #86 was answered with data: the fight log already had every hit. A test checks that Damage adds up to the HP the boss lost.
- On the signature popover, the lead's own screenshot caught a box drawn inside the popover. It switched to the shared `PopoverCard` before Misa saw it.
- Release notes for Discord came within a minute of the merge (13:23).

## Proposals

| #   | Change                                                                                                                                                                                                                                           | Where                                                                | Would have prevented                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | **One small pixel triangle for the whole app.** Move the "Equip on" triangle and the sort marker into one `ui/` component (with sizes) and add a lookup-table row: "A small marker (open, sort, more): the shared triangle; never draw another." | `apps/activity/src/ui/`, `docs/design/ux-patterns.md` (lookup table) | The chevron (13:02) and the new hand-drawn triangle (13:07). The next feature would find it in the table. |
| 2   | **The digest lists messages Misa sends mid-turn** (the `queued_command` attachments with a human origin), marked "mid-turn".                                                                                                                     | `.claude/skills/retro/digest.mjs`                                    | The 13:10 take-back almost read as ignoring Misa in this retro.                                           |
| 3   | **`shoot.mjs` gets `--click <selector>`** (tap it, wait, then shoot), for popovers, drawers and menus.                                                                                                                                           | `apps/activity/scripts/shoot.mjs`                                    | The hand-started Vite server and the two shell kills (18:53, 18:55).                                      |
| 4   | **A line under Commands:** check output piped into `tail` or `grep` needs `set -o pipefail`, and commit and push run only after `&&`. Never `pkill -f` or `pgrep -f` a pattern that also appears in the same command; stop servers by their PID. | `CLAUDE.md` (Commands)                                               | The ▼ commit pushed with failing tests (13:10) and the exit 144s.                                         |
| 5   | **A line under Pull requests:** `gh` GraphQL is blocked here; list and open PRs with `gh api repos/Misacorp/creatures/pulls` (GET with `head=Misacorp:<branch>&state=all`, POST with `title`, `head`, `base`, `body`).                           | `CLAUDE.md` (Pull requests)                                          | The two 403s on 10-28 and the time to find the REST route each session.                                   |

Status: proposals not applied; Misa decides.
