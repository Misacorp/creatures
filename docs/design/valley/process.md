# How we work on the valley

The lead (Opus) plans, delegates and reviews, following `CLAUDE.md`. This page is the loop for this project and the reviewer panel, so any session can run it.

## The loop

1. **Propose.** Write or change a system doc in `systems/` (status `idea` to `proposed`). Rules in numbered lines (V-POST-1, V-BON-2...) so reviews and the lab can point at them.
2. **Research when unsure.** A researcher agent (read-only web) answers a narrow question; its report is filed in `docs/research/` with sources and confidence marks.
3. **Simulate.** Once the economy lab exists: change its data, run it, read the report against the targets in `goals.md` (T-1...). Before it exists: a back-of-envelope table in the system doc, marked as examples.
4. **Review.** Run the panel (below) on the doc or the prototype shots. Findings go to `reviews/YYYY-MM-DD-<topic>.md`.
5. **Decide.** The lead folds in what clearly follows the goals and filters. Anything that trades against a filter, changes a design Misa has seen, or is a question of game feel goes to `open-questions.md` for Misa. Misa's answers become entries in `docs/design/decisions.md` (tagged "Valley") and the doc's status moves to `accepted`.
6. **Prototype.** When a system's rules are accepted, show its feel in the valley prototype (`apps/activity/src/proto/valley/`) on fixture data, and shoot it (`node apps/activity/scripts/proto-shoot.mjs`).
7. **Log.** Every session ends with an entry in `log.md`: what was done, what was decided, what is next. This is what makes context compression safe.

## The reviewer panel

Five personas, each a fresh read-only agent (`general-purpose` or `researcher` type, told to edit nothing), given `docs/design/review-brief.md`, the doc or shots to judge, and its persona below. They report: ranking or verdict, top concrete problems with the element named, what cannot be judged, and the one most important change. The lead writes one review file from the five.

| Persona                          | Who                                                                                                                                     | Judges                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Owner's proxy**                | Thinks like Misa: the review brief first; suspicious of decoration and of timid changes alike.                                          | Does it serve the goals? Fewer boxes, show don't tell, the played thing as focus. |
| **Sanni, the casual player**     | 29, plays two or three minutes at a time on her phone on the bus; cozy games; skips long text; wants to see at a glance what needs her. | Can I tell what to do? Is coming back a delight or a chore?                       |
| **Joonas, the genre veteran**    | 34, every Pokémon, Slay the Spire, Balatro, TFT, Cassette Beasts, Dragon Quest; 1440p desktop.                                          | Does it feel like a game? Is there depth and a reason to choose?                  |
| **Aino, the pixel art director** | Shipped two pixel-art indie games.                                                                                                      | Palette, pixel scale, frames, hierarchy, whether chrome fights the art.           |
| **Eero, accessibility**          | Deuteranopia, mild low vision, 125% zoom and a 360 px phone.                                                                            | Contrast, state shown by more than colour, legibility, tap targets.               |

For economy and systems docs, add a sixth, **Pia, the systems designer**: has shipped idle and live-service economies; judges sinks and faucets, exploits, the pace over twelve weeks, the free-rider problem in the commons, and whether a rule can be simulated and computed lazily on the server.

## Simulations

- **The economy lab** (to build in phase 2, [`economy/model.md`](economy/model.md)): pure, deterministic, seeded, no I/O; models the proposed rules, not the shipped ones; reports per week for each player profile and for the server.
- **The shipped simulator** (`packages/sim`, `docs/design/player-journey-sim.md`): models today's game. Its profiles (`profiles.ts`) and income models are reused as inputs; once the valley rules are accepted, they are ported into it the way combat v2's lab is ported into the engine.

## Keeping track

- `log.md`: one dated entry per session (newest last).
- `open-questions.md`: questions waiting for Misa, removed once answered (the answer goes to `decisions.md`).
- `systems/*.md`: each with a status line at the top.
- `reviews/`: one file per panel run.
- The roadmap's "State" column and "Order inside phase 1".
