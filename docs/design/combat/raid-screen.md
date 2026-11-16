# The raid screen as a place (2026-11-16)

Status: **proposal, being built behind `COMBAT_V2` (staging only).** Misa's brief (2026-11-16): "make the entire raid experience one that's enjoyable to use, clear, doesn't offer too much information (e.g., stuff that isn't time sensitive), plays raid stages as they're happening (yes, even phase 1 and 2 despite there not being live abilities) and overall just cuts down on the noise and lets players focus on the experience. Use inspiration from the left and right panels on the forge screen as UX and also think about all the possible actions a user might want to do on the raid screen, as it's about managing their own creatures, understanding other players creatures, their interactions, their equipment, knacks, talents, etc."

The model is the valley's Forge (`valley/PlaceCanvas.tsx`, ux-patterns "A place is a canvas"): one scene in the middle that keeps its size; a left drawer for collections and overviews; a right drawer for the one thing tapped; drawers over the scene's edges on a wide window, a full page on a phone; a name plate on every clickable thing; no focus rings in the art.

## 1. The screen

- **The scene (centre, never resizes):** the arena. The boss on top with its HP bar under it, the board of seats below. It is the same scene in every state: placing, a stage playing, between stages, the finale. Nothing about a fight opens a separate page any more.
- **The now line (one line above the scene):** the only text on the main view, always time-sensitive. One of: "Place up to 3 creatures · Stage 1 Saturday 13:37"; "2 / 3 placed"; "Mira asks to swap"; "Stage 1 is playing · round 3 / 8"; "Stage 2 Sunday 13:37"; "Finale at 20:00 · your order: Shield Wall"; "The boss fell in Stage 2". Tapping it opens what it names.
- **The tray (below the scene, while you can place):** your creatures, the valley's `Tray`. Drag onto a seat to place; tap a seat to pick. During a stage and the finale the tray gives way to the stage's strip (round, the finale order).
- **Left drawer (collections and overviews), from plates on the scene's frame:**
  - **Weekend:** the timeline (Preparation, Stage 1, Stage 2, Finale), each played stage with its result and Watch, last week's best.
  - **Boss:** the boss's rule cards, all its moves with when they come, Escalating, the Boss Rank and the lap (the track).
  - **Players:** everyone on the board, their creatures and what they wear (read-only).
  - **Log:** during a stage, what happened so far (the fight log).
- **Right drawer (the thing tapped):**
  - **Your creature:** its role, Knack, talents and gear, changeable while the board is open (the configurator in a drawer, the slim item card beside the bag with `showHeader`/`showPager` off); "Remove from board"; "Creature page".
  - **Another player's creature:** owner, level, role, Knack, talents and worn gear, read-only; "Ask to swap".
  - **A seat:** empty, pick one of your creatures; another player's free seat says whose it is.
  - **A boss move (from the boss's plate or a lit move):** what it does, its keywords, the slots it hits lit on the board.
  - **A swap request:** who asks, which seats, Accept / Decline (or Cancel for the asker).
  - **The finale order:** Rally, Shield Wall (with the row), Purge, Auto fire.

## 2. Every action, where it lives

| Action                                              | Today                                               | Goes to                                                                                  |
| --------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Place a creature                                    | Board tile, picker, drag                            | Drag from the tray to a seat (scene); tap a seat → right drawer picker                   |
| Move or remove your creature                        | Drag, popover, configurator                         | Drag on the scene; tap → right drawer "Remove from board"                                |
| Change Knack, talents, gear                         | Inline configurator under the board                 | Tap your creature → right drawer                                                         |
| See what your creature will do                      | Board tile chips, popover                           | Plate on the seat (role, Knack); tap → right drawer                                      |
| See another player's creature, gear, Knack, talents | Popover with name/level/owner only                  | Tap → right drawer (read-only, now with talents and gear)                                |
| See all players and teams                           | Board only                                          | Left drawer "Players"                                                                    |
| See interactions (reach, marks, lit moves)          | Move tile lights slots                              | Tap a move or a creature → slots and reach lit on the scene                              |
| Ask, accept, decline, cancel a swap                 | Popover, Swap requests list                         | Swap mark on the creature → right drawer; the now line names an incoming request         |
| Read the boss: cards, moves, Escalating             | Boss card beside the board, move tiles              | Tap the boss → left drawer "Boss"; the next move shows on the scene during a stage only  |
| Boss Rank and the lap                               | Track strip (always)                                | Left drawer "Boss"                                                                       |
| Watch a stage as it happens                         | Only the finale; stages were replays after the fact | The scene plays stages 1, 2 and the finale live; late arrivals join at the current round |
| Watch a past stage                                  | Results row → Watch                                 | Left drawer "Weekend" → Watch (plays on the scene)                                       |
| See the result                                      | Results rows, reveal card                           | Now line after a stage; reveal card after the finale (unchanged); details in "Weekend"   |
| Set the finale order                                | Ability chip beside the board                       | Now line before the finale → right drawer; during the finale, the stage strip            |
| Raid news channel (admins)                          | Under the board                                     | Left drawer "Weekend", at the bottom, admins only                                        |

## 3. Taken off the main view

The help prose and placed count text (into the now line as "2 / 3"), the track strip and Boss Rank (Boss drawer), the full boss card (Boss drawer; the HP bar stays on the scene), the move tiles (Boss drawer; the next move on the scene during a stage), the timeline and season pips (Weekend drawer), the results list (Weekend drawer, and no result text before a stage has played out), the swap requests list (the mark on the creature and the now line), the ability chip (now line, right drawer), the bag-full note (right drawer when it matters), the raid news picker (Weekend drawer, admins).

## 4. Stages 1 and 2 play as they happen (server)

No new timer. A stage still resolves at its time (the guild alarm, `runEventV2`), but its result is **played out** over the next `boss.rounds × liveRoundMs` (the boss's **full** round count, 8 rounds, about 4 minutes), like the finale:

- During that window `/api/raid/replay/...` (and a small live view) serve only the events up to the current round, without the end, the cleared/kill flags, the boss's end HP or the carry; they add `startsAt`, `roundMs` and `nextRoundAt`. The client fetches at each `nextRoundAt`, never on a 2 s poll.
- `/api/raid` treats the stage as playing: no result row, HP from before the stage, the board as it stood (knocked-out creatures still shown), the now line "Stage N is playing".
- The stage's Discord post waits until the window ends (`next_attempt_at`).
- The window is the boss's full length **on purpose**: a window of the rounds actually played would give the outcome away (a short window means an early kill or a wipe). A stage that ended early has no more events after its last round, and the replay shows nothing new until `endsAt`. One helper (`windowRoundsOf`, stored as `v2.windowRounds` in the stage's summary) sets it for the view, the stats, the lock and the post.
- The reveal (`you.reveal`) and its seen mark skip a stage that is still playing, so a stage 1 or 2 kill is not announced early.
- **What still lands at resolve time** (a few minutes before the replay finishes): the Essence payout, creature XP (and a level it brings), the threshold scrap and the kill-bonus gear in the bag, the away summary, and the valley trial tick. **Misa's choice: accept, or pay out at the end of the reveal.** The guild alarm already wakes at `endsAt` for the Discord post, so deferring needs no new timer, only a second write at that wake. Not built.
- **Reads:** about 90 rows per fetch; 10 watchers × 9 fetches ≈ 8,000 rows per stage, against a worst day of about 145,000. A 2 s poll would cost about 108,000 and is not used.

## 5. Choices for Misa (variations on the review page)

1. **Boss moves on the scene:** (A) only the next move, during a stage; the rest in the Boss drawer (pick). (B) the move tiles always under the boss.
2. **The finale order:** (A) a strip under the scene during the finale, in the tray's place (pick). (B) the right drawer opens by itself at the finale.
3. **Arriving during a stage:** (A) join at the current round, as live (pick). (B) start from round 1 and catch up fast.

## 6. After the UX review (2026-11-16, adopted)

A review against `review-brief.md` found holes; these are now part of the proposal.

1. **The board locks while a stage plays out.** Place, move, remove, swaps and a placed creature's Knack, talents and gear refuse (`stage_playing`) until the window ends. Every outcome signal waits for the end: the "Out this weekend" marks in the tray and pickers, XP shown on cards, Home notices, and the Essence in the HUD (held on the client, no second server write).
2. **While placing, the boss's moves show as small glyphs beside the boss**; tapping one lights its slots on the board and opens it in the right drawer. The full move tiles stay in the Boss drawer. (Section 5 choice 1 becomes A with these glyphs.)
3. **Phone, 390 px:** the board pans sideways (boss and HP bar pinned), opens centred on your column, shows the pan hint, and keeps 44 px seats; sprites never below scale 2.
4. **The now line** is a caption on the scene (a `Nameplate`), not a strip of its own, and a polite live region. When several messages apply, the first wins: an incoming swap request, a stage playing, still to place, the next time. The round number shows only in the now line.
5. **A stage on the scene shows:** the HP bar, the next move, the mark strip, small effect icons, and Escalating only when it changes. No turn strip. Reduced motion is respected.
6. **Between stages**, carried HP and "Out" stay on the seats.
7. **States written in:** Festival or no raid (the scene shows the next boss, the now line says when the next raid is); the boss fell early (the scene shows the fallen boss until Monday, "The boss fell in Stage 2"); the finale result is the scene's big moment (the existing reveal, played over the scene); stage 1 drops the spare column (the board narrows with a short slide).
8. **The tray:** raid marks (on the board, out this weekend, away), a tap opens that creature in the right drawer, a drop on the tray removes it from the board.
9. **Players drawer:** each player with their creatures' sprites and levels; a tap opens one in the right drawer.
10. **Help:** a "?" in the Boss drawer opens How to play's raid sections; keywords carry glossary tags (the removed help prose is not brought back).
11. **Another player's empty seat** shows a popover ("Mira's seat"), not the right drawer.

**Choices that stay Misa's** (variations on the review page): **seat plates** (on every seat, or only your own creatures with others relying on the board itself); **a creature tap on a phone** (opens the full-page drawer, or first shows a popover and lights its reach on the board, with Open for the full view).
