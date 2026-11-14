# Housing: the next round (content, polish and how we make it)

Status: **accepted by Misa** (2026-11-11: "Your four picks are good"), with the room-interior work (C5) added at his request ("wallpapers and other sorts of things that can change the base house interior"); C5's list is the lead's proposal. Misa chose the scope: night for the house, a repeatable way to make furniture, more to build, then porch visitors as a design round. The four picks under "Open for Misa" are confirmed. Work continues on PR #133 (branch `ccr-fd78f187-exje5j`), with housing still off in production. The feature itself is described in [`housing.md`](housing.md).

## What Misa asked for

- Content and polish, isolated from the combat and valley sessions.
- Find improvements to **our processes and the rendering engine** within housing's scope, so they can be applied elsewhere later.
- He will not test much while the work is drawing pieces and making the drawing easier.
- Not in this round: showing finds on reward screens, the price and drop-rate pass, the house on the valley map. They stay on the list below.

## What the first night taught us (the reasons for this round)

| What happened                                                                                                                       | What it costs                                                          | Fix in this round |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------- |
| Every artist wrote throwaway drawing scripts in a scratch folder; only the finished pixels were committed                           | A piece cannot be changed or re-skinned without redrawing it by hand   | A                 |
| The eight sets share one skeleton per form (bed, cupboard, table ...), redrawn eight times                                          | A new set is nine fresh drawings instead of one style applied to forms | A                 |
| The house has one light. The living room's three lights are three hand-made copies of every prop                                    | Night would mean redrawing about 200 sprites twice                     | B                 |
| The house needed its own painter because the shared one refuses sprites wider than 128 px                                           | Two painters to keep in step                                           | B                 |
| Set sheets are one strip 5,000 px wide; reviewers saw them tiny, and weak pieces were found only later in real screenshots          | Late rework                                                            | A                 |
| The content JSON for 114 pieces was also made by an uncommitted script                                                              | Adding a set by hand means editing five files and hoping they agree    | A                 |
| The rules and the content were built in parallel from the spec and disagreed on what a room's column means                          | An integration pass and a broken branch for an hour                    | D                 |
| A container restart stopped two agents with finished, uncommitted work; agents shared log file names; one merge broke the typecheck | Two finisher agents, one failed full check                             | D                 |

## A. The furniture workshop (the process)

Aim: **a new set is a theme, a palette and a few motifs, not nine drawings.** Adding one takes one command and one review.

- **A1. Drawing tools in the repo.** The shapes the artists kept re-inventing (legs, panels, trims, cushions, drapes, shelves with things on them, dither rings) become a small drawing library the art studio can call. A piece is then a short recipe that anyone can edit and re-render.
- **A2. Forms and styles.** Each form (bed, cupboard, table, shelf, stool, lamp, rug, frame, curtains, and the outdoor forms) gets one skeleton with named parts. A **style** gives the palette, the leg, the trim, the ornament and the silhouette quirks. Form plus style draws the piece; a piece can still be overridden by hand where a set needs something special. The eight shipped sets are re-expressed this way and must come out pixel-identical or better (side by side, checked by eye).
- **A3. One command.** `pnpm housing new-set <id>` writes the style file, the art pack, the content entries (pieces, wallpaper, floor, keepsake, blueprints, sources), the compendium rows and the tests, then renders the review sheet.
- **A4. A review sheet at real size.** Each set is rendered **in a room** (on its own wallpaper and floor, next to a creature, at phone scale and at 1x) plus the catalogue tiles, in place of the long strip. The studio also reports which pieces are too close to another set's piece or unreadable at 1x.
- **A5. A skill.** `.claude/skills/furniture-set`: the steps an agent follows to add a set (theme from the compendium, style, render, look, an art-director pass against `review-brief.md`, content, checks). Adding or changing files under `.claude/` is called out in the PR.

Done when: two new sets are made with the skill alone, each in one agent session, and pass review without a second art pass.

## B. Light: night and twilight (the rendering engine)

Aim: **the house follows the server's clock like the living room does, without redrawing anything.**

- **B1. A lighting pass in the painter.** Sprites keep their day colours. The scene is given a phase (day, twilight, night) and the painter maps each colour through that phase's ramp, by material where it matters (wood, cloth, glass, metal, sky), then draws light sources on top: lamps, the hearth, windows glowing from outside, the lantern post. Lit areas keep their day colours inside the light's hard-edged, stepped shape (pixel style: no blur).
- **B2. One painter.** The house's painter and the shared sprite painter become one layered scene painter (back, creatures, front, light), with cached bitmaps and no size limit that forces a second copy. The living room is moved onto it only if its three hand-made lights can be reproduced closely; otherwise it stays as it is and we say so.
- **B3. The outside view (the postcard) and the valley.** The postcard gets the same phases, with lit windows at night. This is the piece the valley map can use later.

Done when: a hut, a house and a mansion look right at day, twilight and night on a phone, with no new sprite files for the phases; the lighting pass has tests; a before and after sheet goes to Misa. The lead decides by eye whether B2's living room move is good enough, and shows Misa the comparison.

## C. More to build and to own (content)

Aim: **more ways for two players' houses to differ.**

- **C1. New parts** (lead's pick, to confirm): a **tower** on the core, a **balcony**, an **orchard** and a **pond with a bridge**. Each brings its own room or grounds spots, default look, price and a place in the outside view.
- **C2. New sets**, made with workshop A (lead's pick, to confirm): **Quiet Verge** (the Void place, whose art Misa liked), **Fairground** (bright, striped, from the Valley Games) and **Schoolhouse** (desks, chalk, a bell).
- **C3. Grounds.** More garden, orchard, pond and pool pieces, so grounds are not the same arbour and lounger.
- **C5. The room itself** (Misa, 2026-11-11). Today a room has one wallpaper and one floor. The base interior becomes something the player shapes, in layers that are each a small choice:
  - **Wallpaper as pattern plus colour.** A library of patterns (plain, stripes, damask, panels, tiles, brick, planks, starry, floral) in a range of colours, drawn by the workshop from a pattern and a palette, so there are dozens without dozens of drawings. Set wallpapers stay as they are.
  - **Floors the same way** (planks, parquet, tiles, stone, carpet, in colours).
  - **Trim.** The skirting, the wainscot and the cornice of a room become a choice of their own (none, painted wood, dark panelling, stone).
  - **The frame of the house.** The posts and floor slabs between rooms take a material for the whole house (timber beams, stone, painted), like the roof and walls do outside.
  - **Ways through.** Doorways between rooms on a floor and a staircase between floors, drawn as part of the base (look only), so the cutaway reads as a house people move through. A few styles to choose from.
  - **Ceilings.** Plain, beamed or vaulted where the room is under the roof.
  - Each is a skin kind in the content, picked from the room like wallpaper is today, earned the same ways (starter, part, set, drop, feat) and shown in the catalogue. The lead brings Misa a sheet of each layer before the full library is drawn.
- **C4. Loose ends from the first night:** wall material as trim on the gable ends; a how-to-play entry and glossary check for housing; measure what loading the housing content costs the server when its object starts.

Done when: content tests and the art cross-check pass, the catalogue shows the new things, the dev tools can build and furnish them, and a room can be made to look unlike any default with base choices alone.

## D. How the crew works (the process, part two)

Small rules for the agents, to be proposed to Misa as changes to `CLAUDE.md` through a retro (never applied without his OK):

- **Contract first.** When two packages are built in parallel from one spec, a third small package lands the shared types and one tiny end-to-end fixture first; nobody builds against prose.
- **Commit as you go.** An agent commits to its worktree branch at each working step, so a restart loses minutes, not the work.
- **Own log names.** Every background job writes to a log named after its agent.
- **Merge, then typecheck.** After merging two branches that touched one file, the lead runs typecheck before anything else.
- **Generators are code.** A script that produces committed art or content is committed with it.

## E. Porch visitors (a design round, after A to C)

Misa's idea: porch items draw rare, mysterious visitors who offer a choice with an unknown outcome, for example sending one of your creatures to meet someone and come back having learned a talent. It touches combat v2's talents, so it starts as two or three questions to Misa with examples, then a spec, then the build. Nothing is built before he answers.

## Order and crew

1. **A1 and A2** (drawing library, forms and styles) and **B1** (lighting pass) start together: different files.
2. **A3, A4, A5** once A2 holds; **B2, B3** once B1 holds.
3. **C** uses A's tools: sets first (they prove the skill), then parts and grounds.
4. Independent reviews as before: an art-director pass on every sheet, a code review of the painter, the full check, then a summary to Misa with before and after pictures.
5. **E** as a question round.

The lead orchestrates; implementers (Sonnet) build in their own worktrees; Opus is used for the workshop's design (A2) and the reviews; nothing is deployed unless Misa asks.

## Decided, and what is still open

1. **New parts:** tower, balcony, orchard, pond with a bridge. **Confirmed.**
2. **New sets:** Quiet Verge, Fairground, Schoolhouse. **Confirmed.**
3. **Night at home:** follows the server's clock, like the living room. **Confirmed:** yes, with no setting.
4. **Generated or hand-drawn:** pieces come from forms and styles, with hand overrides where a set needs them. **Confirmed:** yes; the shipped sets must not get worse.
5. **Open, C5:** which interior layers to keep after Misa sees the sheets (the lead's pick: all six).
6. **Still open from the first night:** the seven questions in the PR summary (gift reward, housemates at the bonfire, raiders at home, one gift a day, the trophy hall behind the west wing, the valley House as your own, when to turn housing on). The lead's picks are built in.

## Left for later

Finds shown on reward screens and in the Gazette; the price and drop-rate pass with the economy lab; the house on the valley map.
