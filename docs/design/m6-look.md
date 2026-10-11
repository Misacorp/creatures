# M6 design: the look and feel

Status: **direction agreed with Misa 2026-10-11** (style sample: `docs/design/assets/style-sample.html`, published as a private artifact for Misa).

## Principles

1. **Show, don't tell [Misa].** The core game shows what happens: sprites, HP bars that drain, hit flashes, floating damage numbers, crit pops, ability effects, loot reveals. Text logs remain available on demand: a "Log" toggle in the live finale, replays and after-action cards. Over time, rely less on text and more on visual cues.
2. **Clear and readable first [Misa: "a nice mix between stylish and readable"].**
   - A pixel display face is used for names, numbers, buttons and headings.
   - A plain reading face is used for anything longer than a few words.
   - Contrast stays high.
3. **Element colours are never status colours.**
   - Each element always shows with its **icon** (Tide, Ember, Grove, Spark) next to its colour.
   - Good and bad states use their own colours (green and red) and shapes (check, cross, arrows).
4. **Motion is short, stepped and optional.**
   - Animations use `steps()` timing for a pixel feel. Small movements (hops, flashes) last at most about 600 ms; the effects players have to read (numbers, crits, reactions, abilities) stay for 1 to 2 seconds.
   - Nothing important is shown only through motion.
   - `prefers-reduced-motion` turns animations into instant state changes.
5. **Phones are first-class.** Everything works at 360 px wide and by touch.

## Visual system

- **Ground:** a dithered night-sky background with dusk panels in chunky pixel frames (hard steps, no rounded corners). Single dark theme, on purpose.
- **Palette tokens:** `night`, `dusk`, `dusk-2`, `ink` (outline), `bone` (text), `haze` (muted), `gold` (accent: Bait, crits, highlights), the element colours `tide`, `ember`, `grove` and `spark`, and the status colours `good` and `bad`.
- **Type:** Pixelify Sans (display) and Atkinson Hyperlegible (reading), both under the SIL Open Font License.
  - The fonts are **self-hosted** in the Worker's static assets, because the Activity's CSP allows only `font-src 'self'`.
  - Add them as pinned `@fontsource` packages, or as checked-in woff2 files with their licence text.
- **Sprites:**
  - Pixel grids with a per-sprite palette, stored as data and rendered to a canvas with nearest-neighbour scaling. A shared `<Sprite>` component draws them.
  - Sizes: creatures 16×16, bosses 24×24, element icons 8×8, UI glyphs 8×8.
  - Each sprite is drawn from its species' visual brief (`docs/design/creatures.md`, `species-lore.json`).
  - Shiny variants are palette swaps.
  - Stage 2 forms keep the stage 1 silhouette's key features.
- **Components:**
  - pixel frame;
  - buttons: primary (gold) and ghost;
  - element chip (icon plus name);
  - level tag;
  - segmented HP bar;
  - progress bar;
  - season pips;
  - rank tag;
  - readiness word;
  - tabs.

## Screens

- **Collection:**
  - a sprite portrait with an idle bob;
  - an element chip with icon, role and level;
  - training progress;
  - the ability line;
  - the About disclosure (description, traits, quirk).
- **Expeditions:** sprites of the creatures away, a timer bar and a catch reveal with sprite pop-in.
- **Raid:**
  - **Boss card:** boss sprite, rank tag, HP bar, element and turn-order icon, gimmicks shown as icons with short labels.
  - **Placement:** the row as a strip of slots by zone (front, middle, back), with sprites. **Drag and drop [Misa]** uses pointer events, so it works with mouse and touch. It has a ghost image while dragging, valid and invalid drop highlights, auto-scroll at the strip's edges, and a swap when dropping on your own creature. Tap-to-select-then-tap-slot and keyboard (arrow keys plus Enter) remain as alternatives. The server still validates every move.
  - **Live finale and replay:** a stage with the boss sprite, the row of sprites and the round timer.
    - Hits flash the target and float a damage number (1.3 s); crits float a bigger gold "CRITICAL!" (2 s).
    - Reactions burst in the element colours with the reaction's name in big letters (1.5 s).
    - Ability cards show the creature's name and the ability (1.5 s) and an effect over the affected zone.
    - Every live round opens with a big "Round N" for 3 seconds (1.5 s in replays). Effects overlap the following beats so combos and crits can be read; see `m5-finale.md`, "Playback".
    - The text log is behind a "Log" toggle.
  - **Loot reveal:** a stepped orb animation, Essence counting up as one figure. No jackpot or pity cue: the jackpot is hidden from players **[Misa]**.

## Order of work

1. The visual system foundation (tokens, fonts, frame, buttons, chips with element icons) and the `<Sprite>` component with element icons, plus drag-and-drop placement.
2. Sprites for every creature, guest and boss, drawn from the visual briefs.
3. Restyle every screen with the components.
4. The live finale and replay stage (show, don't tell), and the loot reveal animation.
