# UX patterns: how Leet Creatures screens are built

The standing rules for the Activity's UI, learned from Misa's play-test feedback (October 2026). Read this before any UI work, together with `decisions.md` (the reasoning and history behind each rule). When a rule here and a screen disagree, the screen is the bug. When a new pattern is settled, add it here in a line or two and link its decision.

Everything is checked at 390 px wide first (Discord on a phone), in the component workbench (`docs/design/workbench.md`).

## Layers: drawers, sheets and popovers

- **One drawer at a time.** A drawer never opens another drawer or sheet. A choice inside a drawer opens _inside the same drawer_ as a drill-in view with "‹ Back" at the top left (Back or Escape returns without a change). Example: "Equip on" in the Workshop item drawer. A sheet may open from a page (the raid and dungeon creature picker), never from a drawer.
- **Drawers have no X.** A tap outside, the handle (tap or drag down) or Escape closes them; the close button stays for the keyboard and screen readers and shows only when focused. A _panel inside_ a drawer that has no other visible way to close may have a small X (the item picker's detail panel).
- **Small help popovers** (glossary tags) may float over anything.
- If a flow starts to need layers on layers, stop and redesign it (drill-in, inline expansion), don't stack.

## Layout

- **Equal edges.** Every block in a drawer or card shares the same left and right edges (`--drawer-pad`). Pixel rings are drawn outside their box (3 px on buttons, 2 px on accordions): sit ringed elements in by the ring so they line up with text and cards.
- **Never clip a border.** A scroll or clip container (swipe area, scroll box) gets a few pixels of inline padding with a matching negative margin, so frames and rings at the edge show whole.
- **Order of a detail view:** what it is (the card), what you do with it (Equip on, …), Details, then the **destructive action last, centred, apart from the rest** (Dismantle).
- **A long panel scrolls inside itself**, capped so the context above stays visible (at least two grid rows). No scrollbar: use `ui/ScrollHint` (a slow drift after 2.5 s that stops on any touch; a fade under reduced motion).

## Text

- **Less text.** Drop anything the screen already says (no "Needs level 12" next to an icon that reads "Lv 12"; no "Next: …" lines). Requirements and refusal reasons stay, short.
- **Numbers and resources are badges with pictures** (`ui/CountBadge`: parts, shards, Essence, ranges like "3–4"), never prose like "Gives 3 to 4 scrap…". A duration is a badge with the clock glyph.
- **Terms players meet get a tap-for-help tag** (a glossary entry, one short line), and player-facing names are plain words: "blueprint quality", not "well-thumbed marks". Code names may stay; only what players read changes.
- **Counts read "3 / 12"**, never "3 of 12".

## Fonts and sizes

- **The pixel font is set per panel, not per element.** Game panels carry `.pix-panel` (everything inside inherits Jersey 10); long reading text opts out with `.prose`. Never rely on adding `.pix` to each new line: that is how wrong fonts kept slipping in.
- **Sizes come from the type scale** in `styles/base/tokens.css`: `--fs-title` (titles), `--fs-heading` (item and sheet names), `--fs-row` (rows, lines, options, panel buttons), `--fs-small` (notes, badges, reasons). Don't add raw `font-size` values in new code.
- Run the font audit after UI changes: `CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/font-audit.mjs` in `apps/activity` (add the new presets to it).

## Choosing things

- **Pick lists show everyone.** Who can do it comes first; who can't is listed after, greyed, with a short reason on the right of the row ("Needs level 7", "Guards only", "Away on a trip", "On a job"). No separate "who cannot" section. Pass the server's actual refusal rules through as reasons, so a tap never fails afterwards.
- **A pick acts right away** (no extra confirm button), unless the action is destructive or costs something; then one clear button with the cost.
- **A trigger that opens a list looks like a dropdown** (current choice with sprite and name, a chevron), not a native `<select>`.
- **Grids open with nothing selected.** Tapping an item shows its details; tapping it again (or the details' X) closes them.
- **Keep the player anchored.** The item or creature shown last stays marked (light edge inside the rarity edge) and in view after its details close; going back to a list restores where it was and marks the creature viewed last.

## Shared components (use these, don't rebuild them)

| Need                                 | Component                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A drawer                             | `ui/Drawer` (`flip`, `titleHidden`)                                                                                                                                                                                                                                                                                                                 |
| Flip between things in a detail view | `ui/Flipper` (Prev / Next full-width row, swipe, keys); detail views only, never grids or pickers                                                                                                                                                                                                                                                   |
| An item in a grid                    | `ItemTile` in `.item-grid` (square, rarity as the single edge, slot icon and level in the corners, a "Worn" flag)                                                                                                                                                                                                                                   |
| An item's full card                  | `ItemCard` (with optional inline compare)                                                                                                                                                                                                                                                                                                           |
| A creature list to pick from         | `ui/RosterList` (rows, reasons) / `ui/RosterPicker` (as a sheet from a page)                                                                                                                                                                                                                                                                        |
| An on/off setting                    | `ui/Switch` (knob evenly inset on and off)                                                                                                                                                                                                                                                                                                          |
| Counts and resources                 | `ui/CountBadge`                                                                                                                                                                                                                                                                                                                                     |
| XP gained                            | `ui/XpGain` in `XpList`: label, levels, "+N", an automatic green "Level up!", tags, the bar. Each kind of XP has its colour, one token each in `tokens.css` (experience gold, explorer orchid, Crafting leather), on its bar and level tags: pass `kind` to `XpBar` / the `XpGainBar`; each label on its own line, then the level row, then the bar |
| An expandable section                | `ui/Accordion`                                                                                                                                                                                                                                                                                                                                      |
| A long scrolling panel               | `ui/ScrollHint`                                                                                                                                                                                                                                                                                                                                     |
| A tag, badge or chip                 | `ui/Tag`                                                                                                                                                                                                                                                                                                                                            |

## Showing work to Misa

- Screenshots at 390 px from the workbench, several side by side, each labelled, and choices marked as choices.
- Look at every screenshot before sending it: clipped borders, misaligned edges, wrong fonts and odd states (a "waiting" with a level-up that can't happen) are caught here, not by Misa.
- Workbench presets show real states the game can produce.
