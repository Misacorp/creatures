# Component workbench (staging only)

Status: **built 2026-10-14**. Misa: "see every reusable UI component, learn its name, try its props, and give feedback so agents can iterate."

## What it is

A gallery of the game's reusable components, on its own page: `https://creatures-staging.misacorp.dev/workbench.html` (locally `pnpm dev`, then `/workbench.html`). It needs no Discord and no sign-in, uses fixture data only and makes no `/api` calls. It is home-grown, with no new dependency.

- **The list** groups components by kind: Bars, Tags & chips, Popovers, Slots, Loot & reveals, Headings & banners, Icons, Controls, Creatures & game pieces. A search box filters it.
- **A component page** shows its name as written in code, its file, a plain sentence saying what it is and where it appears, a live preview, **presets** ("Empty", "Half", "Festival"...), **controls** for its props (slider and number, select, toggle, text), a width switcher (360, 390, full) and a background switcher (the panel colours of the app).
- **The preview is an iframe** of the chosen width (`?frame=1` of the same page), so the game's media queries see a real phone-sized window and the layout is the one a phone gets. Interactive pieces really work (Popover, DungeonTeam and RaidBoard with picker and drag, ToggleButton, PlaybackControls, AbilityChip, glossary tags, SmallCreature).
- **The address holds the view**: `#c=<Name>&p=<changed props as JSON>&w=<width>&bg=<background>`. Copy it to share or bookmark a view. Props from an address are cleaned (unknown names, wrong types and out-of-range values are dropped).
- **Feedback**: "Give feedback" opens a prefilled GitHub issue (`Misacorp/creatures`, label `ui-feedback`, title `UI: <Name>`) with the component, file, changed props as JSON, width, the workbench link and a "What I'd like changed:" line. "Copy details" puts the same text on the clipboard for pasting into a Claude chat. No token, no API call: it is a plain link. An agent picks the issues up with the `ui-feedback` skill (`.claude/skills/ui-feedback/SKILL.md`).
- **DEV panel**: the "Component workbench" section shows the address, with Open (through the Discord SDK's `openExternalLink` inside Discord, a new tab elsewhere) and Copy link.

## Staging only

The workbench is a second Vite entry (`apps/activity/workbench.html`, code in `apps/activity/src/workbench/`). `vite.config.ts` adds it to the build inputs only when `__DEV_TOOLS_BUILD__` is true (dev serve and `TARGET_ENV=staging`), so a production build emits no `workbench.html`, no workbench script and no workbench styles. `src/dev-build.test.ts` builds both ways and checks the page, a marker string (`WORKBENCH_MARKER_5c1e`) and a stylesheet class. If someone opened `/workbench.html` on production, the Worker's single-page-app fallback would serve the game's `index.html` (harmless; `wrangler.jsonc` is unchanged). Staging serves it as a static asset, since only `/api/*` runs the Worker first.

## How to add a component

1. Write an entry in the file of its group under `apps/activity/src/workbench/entries/` (`bars.tsx`, `tags.tsx`, `popovers.tsx`, `slots.tsx`, `loot.tsx`, `headings.tsx`, `icons.tsx`, `controls.tsx`, `creatures.tsx`). An entry has: `name` (the exported component name), `file`, `group`, a one-sentence `description`, `controls` (one per prop to edit), `defaults` (a value for every control), `presets` and `render(props)`. Read props with `num`, `str` and `bool` from `props.ts`; use fixture data from `data.ts`. A component that holds state (open or closed, selected) gets a small wrapper component in the same file.
2. If the entry is new, it is already in the list: each group's array is in `registry.ts`.
3. `registry.test.ts` fails when a component exported from `src/ui/*.tsx` has no entry (use `covers` for a helper shown on another page), when a default does not fit its control, or when a preset names a prop that does not exist. A hook or helper that is not a component goes in the test's `NOT_COMPONENTS` list.
4. Render text as text only, with no inline `style=` attributes (use classes or `cssVars`).

## Not covered

`CreatureCard`, `CreatureFinder` and `Collection` (the Creatures tab with sample creatures, from `creature-card-sample.ts`) are covered since 2026-10-17. Other whole screens and the fight stage (`Stage`, `LiveStage`, `Dungeon`, `Workshop`, `Expeditions` and the like) need a full game state. Also left out: `HaulStrip`, `SlotsStrip`, `InventoryGrid`, `ItemDetail`, `JobSlots`, the pickers and the How to play page. They can be added as entries when feedback asks for them.

`FlipNav` (with `FlipArea` and `FlipLive`; 2026-10-18) shows how the creature page and the item drawers flip between things: the arrow looks, a swipe pad (with a switch that lets the mouse drag, since a finger is the normal pointer), the real creature page over a sample roster and the Workshop item drawer (the item picker no longer flips; 2026-10-18).

`Switch` (2026-10-18; Controls) is the small pixel switch of the item picker's Compare: off, on and disabled, with a row showing all three side by side so the knob's gap to the edge can be compared. `CreaturePage` scenes W4 to W7 show the Workshop item drawer's content: W4 the "Equip on" list, a view of the item drawer, for a Guards-only Charm (every reason: Guards only, Needs level, Away on a trip, On a job), W5 the same for a worn item (Take off first), W6 the dismantle panel open (the yields as badges, the time, quality) and W7 the Equip on row closed (all four in a real drawer); K8 is the item picker with an item that cannot be worn and K9 the picker on open, with nothing selected. `RosterList` has its own page: the list the raid and dungeon sheet and the item drawer's Equip on view share. The font guard `apps/activity/scripts/font-audit.mjs` opens these presets and checks the fonts (see decisions.md, 2026-10-18).

`Slot`, `SlotRow` and `Drawer` have pages (2026-10-17), and `CreaturePageV3` shows the creature page design round with scenes (H header, G gear slots, P item picker options, T talents and the Talent Book, F full page); its code is in `src/workbench/creature-v3/` and its stylesheet is imported by the workbench only.

`ScrollHint` (2026-10-18; Controls) is a box that scrolls without a scrollbar and shows it does: after a rest the content moves down very slowly until the bottom, any touch, wheel, key or focus stops it for good, and a fade shows while there is more below (the only hint under reduced motion). Its page has controls for the number of lines, the delay, the speed and reduced motion, a "New content" button that starts the hint again from the top, and presets (long, fits, reduced motion, quick). The rules and the options are in `src/ui/use-scroll-hint.ts`; the item picker's detail panel uses it (preset K7 of `CreaturePage` shows it on a long Epic).
