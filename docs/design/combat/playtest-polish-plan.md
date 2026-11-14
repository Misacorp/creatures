# Playtest polish plan (2026-11-13)

Misa's feedback from the first staging raid playtest (2026-11-13), turned into one overnight plan. Everything stays behind the staging-only switches; production plays as before. One branch, `combat-v2-playtest-polish`, one PR. Staging is deployed by Misa or the valley session, never from here without Misa asking.

## Work streams

Each stream is one implementer in its own worktree; the lead reviews every branch (screenshots at 390 px and desktop for UI, the reuse list against `ux-patterns.md`) before merging.

### 1. Bugs (server and client)

| #   | Bug                                                                                                          | Plan                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | An item can't be worn: "Needs Lv 1" on a level 12 creature (valley on).                                      | Find the client or server check that still applies a level or slot rule under V-GEAR-3 and fix it; a test that a low-level creature equips a high-level item through the item card with the valley on.                            |
| B2  | Empty seats on the raid board are removed when the fight starts; rows compress.                              | A fight keeps every creature on its placed seat; empty seats stay empty (rows, "beside" and front/back read from the real seats). Engine and resolver fix with a test; the lab's parity digest is re-read and any move explained. |
| B3  | "Play the live finale" says it started but nothing shows; "Play the finale" then says it is already running. | The bench's live finale opens the live finale view for everyone in the party (as the real Sunday does); the bench shows a "Watch the finale" step while it runs. Test on the worker and an e2e check on the client.               |
| B4  | A swap request disappears for the player who asked, once it is accepted.                                     | The asker sees the outcome (accepted, declined, expired) once, as a notice row; check the request's whole life in one worker test.                                                                                                |
| B5  | Shiny creatures don't look shiny on the raid board.                                                          | The board uses the same creature art component as the roster, with its shiny state.                                                                                                                                               |

### 2. Raid screen polish (client)

- **Swap request marker:** a circling "swap" icon (two arrows) on a creature someone asked to swap. A tap opens a popover: who asks, which seats, Accept / Decline (for the owner), or "Waiting for X" (for the asker). Reuses the board's popover and icon pipeline.
- **Boss move tiles:** remove "Aimed when it comes" and the double highlight box. A tap on a move opens a popover that explains the words on it (Every 4, One-shot, Barrage...), from the keyword help the game already has.
- **Knacks that skip an attack** (forgo): the creature still gets its moment: a short "acts" animation (hop and glow, the Knack's name as a callout), so it never looks like a skipped turn.
- **Replay speed:** stages 1 and 2 play at the finale's pace (one speed constant for all).
- **Fight layout:** the team's board is centred under the boss.

### 3. Rename (content)

- The Mire debuff "Mired" becomes **Bogged Down**; the Mire mark "Muddied" becomes **Mired**. Names, ids, keyword help, compendium, How to play and tests in one change, done in two steps so no name means two things halfway. Old staging fights may show the old words in replays; staging only.

### 4. Dev panel (staging only)

- **Full screen on desktop** (a sheet on phones as now), organised in sections with a **target player picker at the top** (default: you; any player; "everyone" where it makes sense) that every grant tool uses.
- **Give a player anything:** creatures (species, level, form, shiny), items, currencies and parts, XP, Knacks and talents, roster presets. The grant creature tool gets the target player first.
- Designed against `ux-patterns.md` and `review-brief.md`, with screenshots before merging.

### 5. Boss attack animations (the flair)

- **One animation per attack pattern, data-driven.** Each move shape the engine knows (a lance on a row, a column, an area, one target, a sweep...) gets a generic timeline: **wind-up** (the weapon appears in the boss's hand) → **aim** (the existing down-pointing triangle marks the row or cells it will hit) → **throw** (the weapon leaves the screen upwards) → **strike** (it comes down through the marked cells) → **impact**. The same behaviour takes different art per boss: the Storm Sovereign's lance is a lightning-tipped spear, a Tide boss's could be a trident.
- **Tooling for later bosses:** a workbench page that plays any pattern with any boss and asset, frame by frame, and saves screenshots; adding a boss's look is one data entry plus its art.
- **Prototype:** the boss with the most different attack patterns gets its own assets first. Screenshots for Misa in the morning message.
- **Art:** ask the art session whether it has newer tools for making such assets (and use `pnpm art` per `art-studio.md`); check `docs/art/README.md` for art already drawn.

## Order and checks

1. Streams 1 to 4 start in parallel (bugs first in review order); stream 5 starts with the pattern list and the tool, then the prototype boss.
2. Each stream ends with `pnpm check:changed` and `pnpm fixtures:capture --check`; the lead runs one full check after merging.
3. One PR with every stream; the morning message lists what was done, the screenshots of the boss animations, and numbered open questions with picks.

## Calls made without asking (listed for a glance)

- B2 is treated as a bug (seats keep their places), not a rule change.
- The rename changes ids too, not only the shown names, so code and words never disagree.
- Stage replays take the finale's pace; if that makes a stage feel too long, a "skip to the end" stays as it is.
