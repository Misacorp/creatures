# Boss move animations

Status: 2026-11-13. Misa's brief: a boss's attacks should show how they work (a lightning-tipped spear appears in the Storm Sovereign's hand, a down-pointing marker shows the lane it will strike, the spear flies up off the screen and comes down through the lane), with a generic version per attack pattern that a boss can later dress in its own art.

Code: `apps/activity/src/boss-anim/`. Client only: it draws from the events the replay already has and changes no rule.

## The model

A move is **five phases**, timed in one place (`timeline.ts`; `BOSS_MOVE_MS`, 1.7 s at 1x, split by weights):

1. **windup**: the weapon appears in the boss's hand.
2. **aim**: the cells the move will hit are outlined and the down-pointing marker (the popover's stepped pixel arrow, `styles/components/boss-anim.css`) sits over them.
3. **throw**: the weapon leaves the screen upwards.
4. **strike**: it comes through the marked cells (down a column, across a row, onto a creature, hopping along a chain).
5. **impact**: a burst on each creature hit. The beat lands (HP, damage numbers, callouts) as this phase begins: the playback holds the beat back for the first four phases, inside the beat's own time (`BEAT_MS.boss` is `BOSS_MOVE_MS`), so a round's length and the live finale's budget do not change.

The **motion belongs to the move's shape** (`plan.ts`: the table at the top says what every shape does). The **look only chooses the art** (`looks.ts`): weapon sprite and impact sprite, with the lookup move id, then shape, then the generic art of the shape's weapon form (`spear`, `wave`, `orb`, `chain`, `nova`) in the boss's element colours.

Pure pieces: `bossAimOf` (a boss beat's events to the move and the creatures it hit), `planOf` (grid terms: marks, pointers, strikes, impacts), `frameAt` (the picture at time `t`). `BossAnimLayer.tsx` measures the stage (`.stage-boss-art`, `[data-slot]`) and draws; `use-playback-v2.ts` starts a run before a boss beat lands (`bossRun`). Reduced motion: no run, the board's own flash and numbers say it. A dungeon foe passes no `bossAnim` setup and keeps today's look.

## Trying a look: the workbench and the screenshots

- Workbench page **BossAnimFrame**: any look (or generic), any shape, a move id, any cells (`auto` or `row:col row:col`), play with 0.25x to 2x, step a frame at a time, or hold a phase.
- `cd apps/activity && node scripts/boss-anim-shots.mjs [--look storm-sovereign] [--moves id:shape,...] [--shapes columns,row,...] [--phases aim,throw,strike]` saves a picture per phase (and a sheet) at 390 px, at 2x density, under `screenshots/boss-anim/`.

## Adding a boss's look

1. Draw its weapons in `src/boss-anim/` (a new file, or `assets.ts`): sprites **pointing up, gripped at the bottom centre** (the frame turns them), with their own palette (`k` ink; see `STORM_SPEAR`). Draw with `pnpm art` if you want the cards; check them in the workbench page.
2. Add one entry to `BOSS_LOOKS` in `looks.ts`, keyed by the boss id: `shapes` for a shape's art (`columns`, `single`, ...) and `moves` for a single move by id (a heavier bolt for the one-shot). Anything left out plays the generic art.
3. Look at every move with the script above and send Misa the pictures.

Bosses with a look: Storm Sovereign. The others play the generic art in their element's colours.

## Known limits

- A boss turn that holds several moves animates the first that hit someone (the engine's own events do not mark where the plain attack starts, apart from the `target` lines `bossAimOf` reads for the move id).
- A move that hits nobody (Fizzle) has no animation.
- A beat squeezed below 500 ms (a very crowded round) is not animated.
