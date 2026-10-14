# Raid UX pass 2: a readable board, familiar patterns, a leaner page

Status: **plan, 2026-10-14.** Nothing here is built. It comes from Misa's review of the raid page on a phone. It is the next build after PR #18 (the left-to-right dungeon), and it goes **before or together with** the attack-pattern build (`attack-patterns.md`), because the patterns need a board where rows, lanes and neighbours are easy to see.

## Misa's asks (verbatim intent)

1. **Raid rows wrap uncomfortably on mobile, so adjacency is hard to read.** In the placement board, the Front, Middle and Back zones each wrap into lines of four, then three. Slot 4 and slot 5 are neighbours in the engine but sit on different lines, and slot 11 (the end of Front) is a neighbour of slot 12 (the start of Middle).
2. **Remove "Who's in this week"** (`RosterStrip.tsx`). It is unusable on mobile (its count text wraps one letter per line) and bloats the page.
3. **Use the lessons of the dungeon screen refactor** (PR #18) on the raid screens, aiming for familiar UX patterns across the app.
4. **Sitting a week out:** Misa isn't sure what it's for. Game balance relies on everyone's creatures being placed, including those of less active players, so don't jeopardise that. Discuss before removing.

## Facts (checked in code, 2026-10-14)

- The raid board is **one line of slots** in the engine. `packages/engine/src/zones.ts` splits it into three contiguous zones: Front and Back get `floor(n / 3)` slots each, and the rest go to Middle. `neighbours(i)` is `i - 1` and `i + 1` across zone edges. Each player places 3 creatures, so `n = 3 × players` and every zone has one slot per player (33 slots for 11 players).
- The attack-pattern design already treats the zones as **three rows** and defines a **lane** as the same position in every row (`attack-patterns.md`, section 1). The UI should show exactly that grid.
- **Sit out:** `POST` opt-out writes `raid_opt_outs`, and `eligiblePlayerIds` in `apps/worker/src/raid-roster.ts` leaves that player out of the week's parties. Only players active in the last `RULES.raid.activeWindowDays`, through a session or leet income, are eligible anyway. The button lives in `RosterStrip.tsx`. Analytics: `roster_optout`.

## Lessons from the dungeon refactor (PR #18) to carry over

| Dungeon pattern (shipped)                                                        | Raid equivalent                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One straight row, slot numbers under it, no wrapping                             | A **3-row × N-column board**: each zone one horizontal line, scrolled sideways together so lanes line up (below)                                                                                                       |
| "Room 1 / 3 · Round 2 / 2" at the top left of the stage                          | "Phase 1 / 3 · Round 4 / 12" at the top left of the raid stage and replay                                                                                                                                              |
| Foe name under its sprite, HP written on the bar (shared bar-with-text)          | Same for the boss on the stage, the replay and the boss card (`ui/Bar` / `SegmentBar`, one component)                                                                                                                  |
| Acting-order ordinals under creatures instead of a turn strip                    | Ordinals on the stage and replay (1st, 2nd, …). The raid keeps varied turn orders, so the boss card's turn-order icon stays, and the ordinals follow it. Drop the turn strip from the replay once the ordinals are in. |
| Hidden replay controls (Pause, 2×, Skip)                                         | Hide them in the raid replay too. The live finale keeps its ability buttons.                                                                                                                                           |
| Glossary popups show only the description                                        | Same for every raid glossary entry: drop the generic "how it works" bullets                                                                                                                                            |
| Reaction hint under the team ("Cindle marks Scorched → Splashet sets off Steam") | Placement hint for **your** creatures and their neighbours, including other players' creatures: which reactions your spot sets off, and "beside a Guard" or "row end (Pincer)" once patterns ship                      |
| Depth progress and streak row after a run                                        | Boss Rank progress and season pips after the finale, in the same visual language (`ui/PipRow`, the depth track)                                                                                                        |
| Counts as "1 / 3"                                                                | Already enforced by the guard tests                                                                                                                                                                                    |
| Workbench entries for every shared piece                                         | The board and the hint must get workbench entries; the registry test enforces this for `src/ui/`                                                                                                                       |

## The board (the main change)

- **Grid:**
  - Three labelled rows: **Front**, **Middle** and **Back**, one line each, no wrapping.
  - Columns are the lanes: column k is slot k of every row.
  - The three rows scroll sideways **together**, in one horizontal scroller, so a lane stays a vertical line.
- **Phone width:**
  - Tiles shrink to a compact size, so a 360 px screen shows about 4 to 5 columns.
  - On open, the board scrolls to your own creatures.
  - A small **overview strip** above the board shows every column as a pip: yours highlighted, empty ones hollow. Tap a pip to jump to that column. This reuses the scroll-sideways behaviour of the living room (`LivingRoom.tsx`).
- **Adjacency, the one engine rule change:**
  - Make `neighbours()` stop at row edges in the raid, so "beside" means left or right **in the same row**.
  - Today the last slot of Front is beside the first slot of Middle, which can't be shown honestly on a grid.
  - This touches the Support buff and Guard intercept in the raid only (the dungeon's row of 3 is unaffected).
  - It needs a sim check of the raid targets, and an entry in `decisions.md`.
  - It ships with this pass, because the attack-pattern build (cover, Slam splash) depends on it.
- **Placement interaction:** keep the shared `ui/SlotRow` behaviours (tap, drag with mouse and touch, keyboard). Left and right move within a row, up and down move between rows in the same lane.
- **What a tile shows:** sprite, name, level and owner initial (not the full name), with the element ring, as now. The owner's full name goes in the creature popover.
- **Your team panel** (the three cards above the board) stays, with "slot 12" replaced by "Middle, lane 1" in plain words.

## Remove "Who's in this week"

- Delete `RosterStrip` from the raid page, along with its workbench entry and styles. Keep the server's roster data (parties are still formed from it).
- The player count moves to one plain line on the boss card ("11 players this week") if it is still useful there.

## Sitting a week out: my view (for Misa)

- **What it does today:** an active player can remove themselves from this week's parties. Their creatures aren't placed, and the boss is sized for one fewer player.
- **Why it existed:** a courtesy for someone going away. Their auto-placed creatures would make the party bigger, and the boss's HP scales with the number of players, while they contribute nothing by hand in the finale.
- **Why it can go:**
  - Inactive players already drop out on their own: eligibility needs activity in the last `activeWindowDays`.
  - Auto-placement and Auto-fire mean an absent player's creatures still pull their weight. The sim's balance assumes they are on the board.
  - Discord posts never ping anyone (`allowed_mentions: { parse: [] }`).
  - The opt-out mostly offers a way to hurt the party by accident, and it adds UI.
- **Recommendation:** remove the button and the route from the client. Keep the table and the server check for one release, so nothing breaks mid-week, then drop them in a later migration. If Misa ever wants a "vacation" feature, it should be a time-boxed status on the player, not a weekly button.
- **Waiting for Misa's OK** before removing the server side.

## Build slices (in order)

Each slice is one commit, with tests and a workbench entry where a shared component changes.

1. **Board grid:**
   - `ui/RaidBoard` (3 rows × N lanes, one scroller, overview strip), replacing the wrapped zone grids in `Placement.tsx`;
   - keyboard map: arrows within a row, up and down between rows in a lane;
   - before and after screenshots at 360, 390 and 1024 px;
   - the request bodies stay byte-identical (`placement-requests.test.ts`).
2. **Row-edge adjacency:**
   - `neighbours()` takes a row width for the raid (the dungeon is unchanged);
   - the Support buff and Guard intercept use it;
   - `pnpm sim` on seeds leet, leet2 and leet3, reporting the raid targets: typical-group finale win and Phase 2 were at their edge on seed leet after PR #18;
   - a decision entry.
3. **Remove `RosterStrip`;** move the player count onto the boss card.
4. **Stage and replay head:** "Phase N / 3 · Round x / y", the boss name under its sprite, HP on the bar, ordinals instead of the replay's turn strip, replay controls hidden.
5. **Placement hint:** the reactions your three creatures set off with their actual neighbours, from the same `rowReactions` logic as the dungeon, generalised to a row with other players' creatures in it.
6. **Glossary cleanup** for raid entries (description only), and the post-finale Boss Rank and season row in the dungeon's visual language.
7. **Sit-out removal** (client), after Misa's OK.

After that comes the attack-pattern build (`attack-patterns.md`, section 6). Its slices already assume rows, lanes and row-edge neighbours.

## Open questions for Misa

1. **Sit out:** remove it? Recommended: yes, as above.
2. **Owner on a tile:** is an initial plus a colour enough, with the full name in the popover? Recommended: yes.
