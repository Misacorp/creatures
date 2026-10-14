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
7. **Sit-out removal** (client). Misa said yes.
8. **Visual placement cues** (decided 4): the reaction pair highlight and badge on drag, tap and hover, in the dungeon setup first (removing the text line), then on the raid board.
9. **Influence highlight** (decided 6): a shared `affects(creature, row)` helper and a tile shade on hover or popover, for the dungeon and the raid.
10. **Hide the tag coach mark** (decided 5), and change the stage head to room or phase top left and round top right, in the dungeon and the raid (decided 3).

After that comes the attack-pattern build (`attack-patterns.md`, section 6), **together with the raid structure change** (phase floors and enrage, above), as one raid retune. Its slices already assume rows, lanes and row-edge neighbours.

## Decided (Misa, 2026-10-14)

1. **Remove sit-out.** Do it in slice 7, client first, and drop the server table in a later migration.
2. **Owner on a tile: initial plus colour,** with the full name in the creature popover.
3. **Stage head, in the dungeon too:** the room or phase goes top left ("Room 1 / 3", "Phase 1 / 3") and the round top right ("Round 2 / 2"). This replaces the joined "Room 1 / 3 · Round 2 / 2" shipped in PR #18. It goes in slice 4, and the dungeon change rides along.
4. **Reaction hints become visual cues at the placement, not a line of text.** Misa doesn't like the hint text under the big area. Show the cue on the slots themselves:
   - **When:** while a creature is dragged over a slot, when it is tapped or selected, and on hover (desktop).
   - **What:** the creatures that would react light up as a pair, joined by a small badge naming the reaction ("Steam") between or above them.
   - **No reaction:** if the order can't react, the row gets a subtle "no reaction" mark.
   - **Where:** the dungeon team setup (replacing the text line under the slot row, shipped in PR #18), and later the raid board.
   - **Logic:** the same `rowReactions` logic; the text stays only as the aria live announcement.
5. **Hide the "Tap any tag to learn what it means" coach mark** (`CoachMark`). Keep the code and its workbench entry, but don't render it anywhere for now. Use one flag in code.
6. **Show what a creature affects on the board:**
   - **Trigger:** hovering a creature, or opening its popover.
   - **Highlight:** the tiles it affects get a soft shade. That covers a Support's buff targets, a Guard's covered neighbours and interceptable allies, and a creature's reaction partners. The popover explains the effect in words.
   - **Scope:** the dungeon row and the raid board, using the same mechanism (one shared "affects" helper per role, from the engine's own rules, so the UI can't drift from the fight).
   - **Ties:** this pairs with Support reach shapes later (`attack-patterns.md`, section 7), where reach becomes visible this way too.

## Raid structure: always a finale, and an enrage (new, Misa 2026-10-14)

Misa's intent:

- **Always a finale.** Today a strong server can empty the boss's pool in Phase 1 or 2, and the week ends without a finale. The boss should go **immune at a floor** in each phase, so every phase has something to rally around and the boss (hopefully) falls during the live finale. For the finale's share he suggests about 10–20% of HP, to be tuned.
- **Enrage.** Today a finale that runs out of rounds with both sides standing just ends. Instead, the boss **enrages**: massive damage and frequent multi-target attacks, which wipe the row in 2–3 rounds. There is still a slight, exciting chance that the creatures finish it first.

Facts:

- `RULES.raid.phases` clears Phase 1 at 18% of the pool lost and Phase 2 at 52%; the finale needs the whole pool.
- The pool is carried through the week (`raid-resolve.ts`), and damage past a phase's threshold still comes off the pool. That is why an early kill is possible.

Proposal (needs a sim pass; numbers are starting points):

- **Phase floors:**
  - Each phase gets a floor the pool can't go below. Once the boss reaches it, it turns **immune and the phase ends**. There is **no overkill**: damage past the floor is not counted for loot, credit or the after-action card (Misa: counting it would be unintuitive).
  - **Say it clearly.** The replay shows the moment: the boss goes immune, the reason in one line, and what happens next, so players never wonder why it stopped taking damage. Each boss can dress it up in its own way, as content data (a line per boss, with a shared fallback). Examples: "Tidal Colossus sinks beneath the waves. It will rise again in Phase 2." "Cinder Wyrm takes flight, out of reach. Face it in the finale on Sunday." The phase result card says the same ("Phase 1 cleared: the boss retreated").
  - Starting numbers: Phase 1 floor at 70% HP left, Phase 2 floor at **15%** (Misa: "lots to do and it's still exciting"), finale to 0. The thresholds (`clearAtLossBp`) become the floors, so "cleared" means "drove it to its floor".
  - New scalars: `RULES.raid.phases[].floorBp`. Tune from the live finale win rate and close calls.
- **Enrage (raid finale):**
  - When the finale's rounds run out, it goes to **enrage rounds** (`RULES.raid.enrage`: `rounds` 3, `atkBp` per round, `multiTargetEveryRound: true`).
  - The boss uses its multi-target moves from the attack-pattern catalogue (Sweep, Barrage, Pincer) every round at a large multiplier, tuned so a typical row is wiped in 2–3 rounds.
  - The fight ends on a wipe or a kill. Shown as a red "Enraged" banner on the stage and in the forecast, with one line on why ("Out of time: the Wyrm is enraged!").
  - **An enrage loss is a normal loss** for Boss Rank and rewards.
  - Phases 1 and 2 have no enrage: they end at their round limit or their floor.
- **Enrage (dungeon boss room), to teach the mechanic:**
  - Today a room whose rounds run out with the foe standing ends the run. In the **boss room only**, the boss enrages instead (`RULES.dungeon.enrage`: about 2 rounds, a big Attack multiplier, hits every creature). Normal rooms keep today's rule.
  - Same banner and wording as the raid, so players meet enrage first in the daily dungeon and recognise it on Sunday.
  - The dungeon rule (always left to right) stays simple: enrage is announced when it happens, as the left-to-right decision requires of a change to the normal rules.
  - Balance: a few more boss rooms get cleared at the frontier. Check the `dungeon-*` sim targets.
  - Misa may walk this back if it plays badly. Keep it behind its own scalar so it can be switched off.
- **Balance impact:**
  - Floors move damage from phases 1 and 2 into the finale, so the finale needs more of the week's work. The finale win rate and its band (`raid-*` targets) must be re-tuned.
  - Enrage adds a few late wins. This **is** the full raid retune.
- **Do it once, together with the attack patterns** (`attack-patterns.md`): both change raid lethality and the win band, and enrage uses the pattern moves.

**Decided (Misa, 2026-10-14):**

1. **No overkill.** Reaching a floor ends the phase. Damage past it counts for nothing. The game explains why the boss is gone and what comes next.
2. **Finale share: 15%** of the boss's HP (Phase 2 floor).
3. **Enrage in the raid finale only, and in dungeon boss rooms** (to teach it). Reversible.
4. **An enrage loss is a normal loss.**

## Open questions for Misa

- None open. The raid-structure questions are decided above.
