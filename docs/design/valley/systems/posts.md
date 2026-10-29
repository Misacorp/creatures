# Job posts

Status: **proposed**; posts replacing every timed task is **accepted** (Misa, round 1, Q2). Evidence: `docs/research/idle-job-posts.md`.

## The idea

A creature is given a post somewhere in the valley and works there on its own until you move it. A post produces something (finds, crafted items, XP, help for the server) and the creature earns XP and grows in what the post asks of it. Posts replace every timed task: today's trips and Workshop jobs go away (round 1, Q2). Misa: "It's laid back, works passively, and we can still build e.g., queue systems and configuration options to give players agency over what and how they're doing things. Example: which blueprints are being crafted, which areas are being explored."

## Rules (draft)

- **V-POST-1** A creature holds at most one post. Moving it is one drag or two taps. There is no priority grid or schedule (F-4).
- **V-POST-2** A post has a small number of seats (example: 1 to 3). Seats grow with the place's level (see `commons.md`) and with player milestones, never with fetch quests.
- **V-POST-3** Every seated creature earns XP at the post's steady rate (see `bonfire.md` for how this sits with the roster-wide floor). Combat (raid, dungeon) pays more than any post, so using a creature still matters.
- **V-POST-4** Fit: each post names **one** thing it likes (a role, an element or a trait). A creature that fits works faster; the preview shows the change before you commit (Fallout Shelter's hover preview). Differences are small, so no post is a trap and any creature can work anywhere.
- **V-POST-5** Output accumulates into the post's store, computed lazily from timestamps on read (F-9). The store has a generous cap shown in advance; when full, the post pauses, nothing is lost, and its bubble says "full" (F-1).
- **V-POST-6** No upkeep: no food, sanity, sickness or rest needed (F-2).
- **V-POST-7** A creature on a post can still be picked for the dungeon or the raid; while away it leaves its seat warm (its post pauses for it) and returns to it after. (Open: or does it leave the post?)
- **V-POST-9** Agency lives at the place, not on the creature: what a place works on is set there (the Forge's orders and queue of blueprints, which destination a scout explores). When a queue runs out, the post falls back to a plainer, less valuable default and keeps working (never idle by mistake); setting a new order is the reason to look in, never a timer. Queues stay short (example: up to 3 orders) so a place never turns into a schedule to fill (F-4). The chained output (scouts filling the stockpile the Forge draws on, with the away steps changing the rate) is computed lazily in one pass on read and priced against `docs/design/database-reads.md` before it is built (F-9).
- **V-POST-10** Away growth in steps (round 1, Q3): every idle gain (posts and the bonfire) runs at the full rate for the first day after a visit, then drops in a few steps the longer the player is away, to near zero after about a month. One plain scalar from the time since the last visit, the same for every post. It applies to idle gains only, never to what fights pay. Example steps (the economy lab sets them): 100% for the first day, 50% to day 3, 25% to day 7, 10% to day 30, then near zero. A daily player gets everything; every other day about 75%; once a week about 43%.
- **V-POST-8** A post that inputs something (the Forge needs scrap) slows when its input runs low and says why in a few words; a small fallback keeps it from stopping dead (F-5, see `forge.md`).

## Candidate posts

| Post                               | Place          | Produces                                                                 | Likes (example)                   |
| ---------------------------------- | -------------- | ------------------------------------------------------------------------ | --------------------------------- |
| Scout (one per destination)        | Signpost       | finds over time: Bait, parts, scrap, lore pages, now and then a creature | the destination's element         |
| Smith                              | Forge          | crafts the set blueprint on a loop                                       | Crafting level / a Workshop trait |
| Sentry                             | Watchtower     | raid readiness for the server (see `defence.md`)                         | guards                            |
| Keeper                             | Paddock        | new arrivals start stronger; catches settle faster                       | supports                          |
| Teacher, student                   | School         | talents (see `school.md`)                                                |                                   |
| Lounger                            | House          | rest XP (today's lounge)                                                 |                                   |
| Later: gardener, angler, stargazer | see `later.md` | cosmetics, rare finds, forecasts                                         |                                   |

## Open questions (also in `../questions.md`)

- V-POST-7: does a raid or dungeon pick pull a creature off its post?
- How many seats per post at the start, and how fast do they grow?
