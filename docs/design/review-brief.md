# Review brief: Misa's standing priorities

Give this file to every agent asked to review UX, UI, art or game feel (paste it into the prompt, or point the agent at it). A reviewer weighs each suggestion against these priorities and says which one it trades against, if any. The lead applies a suggestion that trades against one only as a choice put to Misa, never as the new default (retro 2026-10-24: a reviewer pick took the screen away from the boss).

The rules behind each line are in `ux-patterns.md` and `decisions.md`; this is the short list.

## What matters most

- **The thing being played is the focus.** In a fight the boss and the creatures are the main event: the boss sits in the middle, and side elements (the move track, effect icons) stay small and float around it, never taking its room.
- **Show, don't tell.** Icons and places over words; tiny labels if text is needed. No titles where a fixed place already says what something is (buffs at the top, debuffs at the bottom). No prose about what just happened when the screen shows it.
- **Fewer boxes, less noise.** No boxes in boxes, no frames for the sake of frames, few coloured outlines. A clear look beats a busy one.
- **Pixel style.** Hard edges, no soft glows or blurs, two or three colours per thing, motion that steps where it suits. Reuse and tint sprites instead of adding image files.
- **Light, fun and predictable.** No hidden rules or surprises a player cannot reason about; a fun idea that makes the game harder to read is a trade, say so.

## How it is checked

- **Phone first, desktop too.** 390 px wide (and 360 px for tight spots), and 1100 px, every time.
- **Nothing overflows its parent,** names cut with "…", nothing scrolls sideways by accident.
- **One frame.** A new screen or feature uses the dock or rail, the HUD and Home's notices (`ux-patterns.md`, "The frame"): no second navigation, no footer, no bar of its own.
- **Reuse what exists.** A new screen or part uses the existing component or layout for the same job (`ux-patterns.md`, "Shared components").
- **Match the scope of Misa's examples.** "For example …" sets the size and tone of the change, not a template to repeat per case.
- **Accessibility is not traded away:** colour is never the only cue, reduced motion is respected, and every control has a spoken name.

## What reviewers report

For each suggestion: what to change, why it helps the player, and which priority above it supports or trades against. Judge from the screenshots and videos given; say what cannot be judged from stills.
