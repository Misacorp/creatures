# UX pass 1 (Misa's review, 2026-10-13)

Status: **in progress**. Misa reviewed production after PR #10 and asked for a UX pass before he advertises the new features. This file is the spec: his feedback, plus the lead's decisions where he left the call to us. Principles that run through it: show, don't tell; one thing per place; discovery is part of the fun (no chance percentages on screen); progressive disclosure over walls of text.

## Shared components (build first)

- **`ProgressTrack`**: a horizontal rank or depth timeline. It shows the previous step (dimmed), the current step (highlighted) and the next step only, each with a small icon and a short label for what it unlocked or will unlock. Nothing past the next step is shown. It is used by the explorer rank (Expeditions) and the dungeon landmark depths. It is generic: steps are `{ label, unlocks: { icon, text }[] }`.
- **`XpBar`**: a thicker bar with `0 of 200 XP` drawn on top of the fill. The text stays readable at any fill, with an inner margin so the fill shows at both ends. Optional end caps sit just outside the bar: the current rank on the left (the start point) and the next rank on the right (the destination).

## Expeditions

1. **"Where to" order:**
   1. The area selector strip (element icons and locks; today it sits last).
   2. The banner as a hero carousel, with the ‹ › arrows overlaid on its left and right edges.
   3. The area name as a **title plate** under the banner, like a playing-card title (MTG or Arkham Horror style), with `1 / 7`.
   4. Area information: the element chip, the description, and "Lives here" with silhouettes until found.
2. **Familiarity is a creature trait.** Remove the stars and the trip count from the location section. Show them per creature in "Who goes" (below).
3. **Drop the location help popup** (the "?" next to the name). It spoiled who lives there, and its text differed from the description. Any mechanical fact goes into the description in plain, non-italic text under the italic flavour line. Only Moonlit Reef needs one: its night window.
4. **Familiarity glossary entry:** each star on its own bullet (the 2-star text is currently inline with the 1-star text), and drop "up to 3 stars" from the short line.
5. **"Who goes"**, one creature row:
   1. name and level;
   2. current explorer rank;
   3. `XpBar` with the current and next rank as end caps;
   4. "Familiarity" (a tag with its popup), the stars and the trip count for the chosen place.
6. **Explorer rank progress:** a `ProgressTrack` for the selected creature, showing the previous, current and next rank and what each unlocks.
   - **Every rank unlocks something deterministic.** Today the unlocks are:
     - rank 2: Old Crossroads and the "Scout ahead" goal;
     - rank 3: the "Shortcut" and "Lost cache" goals;
     - rank 4: Moonlit Reef, plus the "Linger" and "Press deeper" goals;
     - rank 5: 24 h trips;
     - rank 6: the "Ancient vault" goal;
     - ranks 7–10: nothing.
   - Add a **one-time rank-up gift** at every rank from 2 to 10: a fixed bundle of supplies, Bait or parts, growing with rank. It is server-granted and idempotent per (creature, rank). Ranks 7–10 get the bigger gifts.
7. **Remove chance and percentage displays** from the Expeditions screens:
   - how much faster a rank makes trips;
   - "24 h trips open at rank 5" (it becomes a `ProgressTrack` unlock);
   - deeper-area percentages;
   - push-on odds. Show risk as words and a mark instead: Safe, Risky, Very risky. The failure line stays ("may fail and bring nothing back").
   - Supplies keep "Choice likely" and "Choice guaranteed", which are words, not numbers.
8. **Deeper area:**
   - Today, once a creature has a star at a place, each catch roll has a 30–50% chance (by stars) to come from the deeper area's pool.
   - On screen, say only "Deeper area open: its rarer creatures can turn up" once unlocked, with no numbers.
   - The mechanics stay as they are (lead's call).
9. **"How long":** one value per option (the clock icon and "2 h"), not two. Drop the "24 h opens at rank 5" line.
10. **Trip strength:** the "A 12 h trip is good for" strip moves to the very end, just above the Send button.
    - It is titled "Expected haul".
    - It includes the effects of the chosen supplies (computed by a pure helper).
    - Every icon gets a label or a popover saying what it is.
11. **Supplies:** unchanged (Misa likes them).
12. **Journal:** the icon sits on the same row as the "Journal" heading.

## Dungeon

1. **Less text.** The pre-run screen leads with the comic-strip **three-room panel**: room 1, room 2 and the boss, as silhouettes or "?" before the run. The day's modifiers live on those panels (an icon with a tap popover). Most of the explanatory text goes.
2. **Landmark depths** use `ProgressTrack`: the previous, current and next landmark, and what a landmark gives.
3. **Streak and reset time** move to the end report, which is where "when can I go again?" is asked. The pre-run screen keeps at most a tiny streak pip row.
4. **Team picker:** three small slots like the raid placement rectangles. No text about rows.
5. **Abilities:**
   - The basic-ability pick and the per-ability fire-round settings are removed from the dungeon.
   - Unlocked creature abilities fire automatically at their default round.
   - The run request no longer carries `abilities` (strict schema, old bodies refused).
   - The sim checks that the dungeon targets still hold without the basic ability, retuning `RULES.dungeon` if needed.

## Raid

1. **The "This week" timeline gets a Preparation step:**
   - Preparation runs from Monday 13:37 to Friday 13:37;
   - then Phase 1 (Friday), Phase 2 (Saturday) and the Finale (Sunday 20:00).
   - Phase 1 must not show as active before Friday.
2. **Streamlining proposals R1–R6** went to Misa (see `decisions.md` when he answers):
   - R1. The week timeline becomes the top of the Raid tab, with one "what to do now" action.
   - R2. A compact boss card: gimmicks and turn order become icons with popovers.
   - R3. "My team" and "The party row" merge into one placement step; the roster becomes an avatar strip.
   - R4. Abilities fold into one "Abilities: Auto" chip that expands.
   - R5. The readiness word sits next to the Rank.
   - R6. Phase results become ticks on the timeline, and the full after-action card shows after the finale.
