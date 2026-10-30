# Job posts

Status: **proposed** (written in full 2026-10-30, for the panel). Accepted by Misa so far: posts replace every timed task (round 1, Q2), agency at the place (Q2), away growth in steps (Q3), stores of a day and a half and "being present pays a little" (round 2, Q5), a raider's seat waits (Q6). Evidence: `docs/research/idle-job-posts.md`.

## The idea

A creature is given a post somewhere in the valley and works there on its own until you move it. A post produces something (finds, crafted items, help for the server), and the creature earns XP and grows in the work the post asks of it. Posts replace every timed task: today's trips and Workshop jobs go away (round 1, Q2). Misa: "It's laid back, works passively, and we can still build e.g., queue systems and configuration options to give players agency over what and how they're doing things. Example: which blueprints are being crafted, which areas are being explored."

What a player does with posts, in one breath: put creatures where they fit, tell each place what to work on, spend what comes home on small upgrades, and move a creature when something better turns up. Nothing needs them on a timer.

## Rules

- **V-POST-1** A creature holds at most one post. Moving it is one drag or two taps. There is no priority grid or schedule (F-4). Moving never loses anything: its skill (V-POST-12) stays with it.
- **V-POST-2** Seats. Each post has a number of seats per player, set by the place's server level (V-COM-10); each player unlocks their own seats up to that limit with their own Acorns and parts, each seat dearer than the last. Never fetch quests. The table below gives the examples.
- **V-POST-3** XP. Every creature on a post earns the post rate of XP; every creature without one earns the bonfire rate (`bonfire.md`). Fights pay on top and pay most per creature per day, so using a creature in the dungeon and the raid still matters. All posts pay the same XP: where a creature works changes what comes home, never how fast it grows, so no post is a trap.
- **V-POST-4** Fit. Each post names **one** thing it likes (an element or a role). A creature that fits produces more (example: +25%); dragging a creature over a post previews the change before you commit (Fallout Shelter's hover preview). Any creature can work anywhere.
- **V-POST-5** The store. Output collects in the post's store, computed lazily from timestamps on read (F-9). The store holds at least about a day and a half of output (round 2, Q5), so a daily player never meets a full one; when full, the post stops picking up finds, nothing is lost, and its bubble says "full" (F-1). XP is never stored: a creature keeps earning on the away steps whether or not its store is full. Collecting is walking past the post or one tap on the return story, never a button per post.
- **V-POST-6** No upkeep: no food, sanity, sickness or rest (F-2).
- **V-POST-7** Fights. A creature on a post can still fight (round 2, Q6). The dungeon is a quick run and pauses nothing. A creature in the raid is away from the first stage's lock (Friday) to the end of the finale (Sunday): its seat is kept and its post pauses. The player may name a stand-in for the seat, once, from creatures without a post; it steps in at the lock and back to the bonfire when the raider returns, both on their own, and the return story mentions it. A named stand-in stays named for later weekends. Placing a creature in the raid early in the week pauses nothing. A creature knocked out stays out for the weekend (combat v2) and comes home the same way.
- **V-POST-8** Inputs. A post that consumes something (the Forge needs scrap) slows when its input runs low and says why in a few words; a small fallback keeps it from stopping dead (F-5, `forge.md`).
- **V-POST-9** Agency lives at the place, not on the creature: what a place works on is set there (the Forge's queue of orders, which destination a scout explores). When a queue runs out, the post falls back to a plainer, less valuable default and keeps working; setting a new order is a reason to look in, never a timer. Queues stay short (example: up to 3 orders) so a place never becomes a schedule (F-4). Chained output (scouts filling the stockpile the Forge draws on, with the away steps changing the rate) is computed lazily in one pass on read and priced against `docs/design/database-reads.md` before it is built (F-9).
- **V-POST-10** Away steps (round 1, Q3): every idle gain (posts, the bonfire, their XP and their output) runs at the full rate for the first day after a visit, then drops in a few steps the longer the player is away, to near zero after about a month. One plain scalar from the time since the last visit. Never applied to what fights pay.
- **V-POST-11** Being present pays a little, through choices (round 2, Q5, a loose guideline). Each seat can hold a **tool** bought with Acorns (a lantern for a scout, tongs for a smith); each tool level adds a little output and costs more than the last, cost rising faster than output (example: +5% output for x1.15 cost per level, up to level 10). A player who looks in more often buys sooner and gains slightly more, never through a faster rate or a timer (T-2: under 10% over a daily player).
- **V-POST-12** Skill. A creature grows a rank in each kind of work it does (scouting, smithing, keeping, teaching, lamplighting) by time at a post of that kind; each rank adds a little output at that kind of post (example: rank r needs 20 x r hours; +3% output per rank; rank 10 at most, about 46 days of work). Today's explorer ranks and Crafting skill become two of these. This is how creatures "focus on different things" (Misa, 2026-10-29) without locking them in: a creature moved elsewhere keeps its ranks and starts a new one.
- **V-POST-13** Communal posts (`commons.md`): some seats send their output to a server project instead of the player (haulers at the Forge's project, road menders at the Signpost, the lamplighter at the bonfire). The creature earns the post rate of XP and its skill like any post. One communal seat per player per place (example).

## Places, posts and seats (examples)

Seats per player by the place's server level (levels 1 to 5, V-COM-11). "Unlock" is what a player pays for each of their own seats past the first, up to that limit.

| Place      | Post                   | Likes (one)                  | Seats per player at level 1 → 5 | Personal unlock (example)                       | Default when its queue runs out         |
| ---------- | ---------------------- | ---------------------------- | ------------------------------- | ----------------------------------------------- | --------------------------------------- |
| Signpost   | scout, per destination | the destination's element    | 2 → 6 (one more a level)        | 2nd seat 150 Acorns, each next x1.5             | none: a scout always explores its place |
| Forge      | smith, per anvil       | the Crafting role (or trait) | 2 → 4 (levels 2 and 4 add one)  | 2nd anvil 200 Acorns + 10 scrap, each next x1.5 | refine or recycle (V-FORGE-1)           |
| Paddock    | keeper                 | supports                     | 1 → 2 (level 3 adds one)        | 300 Acorns                                      | none                                    |
| School     | teacher, student       | (waits on combat v2)         | 1 teacher, 2 students → more    | waits on `school.md`                            | a teacher reads (a little skill to all) |
| House      | the couch (lounger)    | none                         | 1                               | none                                            | none                                    |
| Bonfire    | everyone else          | none                         | no seats                        | none                                            | none                                    |
| Each place | communal seat          | the place's like             | 1                               | none                                            | none                                    |

A month-old player with about 15 creatures and level-1 places has 2 scouts, 2 smiths, a keeper, a lounger and a communal seat posted: 7 at work and 8 at the bonfire. The bonfire is where most of a roster grows early on, which is why its rate and catch-up matter (`bonfire.md`).

## Example numbers (the economy lab sets the real ones)

| What                        | Example                                                        | Per day at full rate |
| --------------------------- | -------------------------------------------------------------- | -------------------- |
| Post XP                     | 6 an hour                                                      | 144                  |
| Bonfire XP (hearth level 1) | 4 an hour (`bonfire.md`)                                       | 96                   |
| Dungeon run, per creature   | today's rooms (32 a fight, 105 the boss), a typical run        | about 200            |
| Raid weekend, per creature  | today's 200 + 200 + 400                                        | about 115 averaged   |
| Fit                         | +25% output                                                    |                      |
| Skill                       | +3% output a rank, up to rank 10                               |                      |
| Tool                        | +5% output a level for x1.15 cost, up to level 10              |                      |
| Store                       | 36 hours of output                                             |                      |
| Away steps                  | 100% day 1, 50% to day 3, 25% to day 7, 10% to day 30, then ~0 |                      |

For scale: today's curve needs about 1,700 XP for level 10, 9,700 for level 20 and 28,000 for level 30.

### A worked day: Sanni, a daily player, week 4

Sanni opens the game once each evening. She has 15 creatures: her best three hold posts (two scouts and a smith) and also run the dungeon; four more hold posts; eight sit at the bonfire.

- Her best three earn 144 (post) + about 200 (dungeon) + about 115 (raid, averaged) = about 460 a day: about level 22 by the end of week 4.
- Her other posted creatures earn 144 a day: about level 14 by week 4.
- Her bonfire creatures earn 96 a day, doubled by catch-up while they are well behind her middle (`bonfire.md` V-BON-2): level 13 to 16 by week 4.
- So her 10th creature is about 6 to 8 levels behind her 3rd. T-1 asks for about 5, so these example rates are a little short; the lab tunes the bonfire and catch-up to meet it.
- Coming back, she sees what her scouts found and what the Forge made, buys a tool level or a seat with the Acorns, maybe moves one creature to a better fit, and runs the dungeon. Nothing was waiting on a timer.

### The same week for a weekly player

Juho opens the game on Sundays only. Idle gains run at 43% of Sanni's (the away steps). Juho's best creatures still fight in the raid; on Sunday Juho buys upgrades and moves creatures, and on the days Juho visits, catch-up toward the server (V-BON-6) speeds them up.

## What it replaces

Expeditions' timed trips, trip slots, the Workshop's timed jobs and job slots, treats, and the lounge's daily cap (`scrap-list.md`). Explorer ranks and the Crafting skill become skills (V-POST-12).

## Open (for the panel and the lab)

- Do equal XP on every post and the fit bonus on output alone give enough reason to care where a creature works?
- Is the tool upgrade the right "small constant upgrade" (V-POST-11), or should it be seats and place-specific gear?
- Starting seats: enough to feel the valley working on day one without making the bonfire feel like the bench of the unwanted?
