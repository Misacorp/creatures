# Job posts

Status: **proposed**, revised after the panel (`reviews/2026-10-30-posts-bonfire.md`). Accepted by Misa so far: posts replace every timed task (round 1, Q2), agency at the place (Q2), away growth in steps (Q3), stores of a day and a half and "being present pays a little" (round 2, Q5), a raider's seat waits (Q6). Work identity decided in round 7 (Q19, V-POST-12). Evidence: `docs/research/idle-job-posts.md`.

## The idea

A creature is given a post somewhere in the valley and works there on its own until you move it. A post produces something (finds, crafted items, help for the server), and the creature grows in the work the post asks of it. Posts replace every timed task (round 1, Q2). Misa: "It's laid back, works passively, and we can still build e.g., queue systems and configuration options to give players agency over what and how they're doing things. Example: which blueprints are being crafted, which areas are being explored."

What a player does with posts, in one breath: put creatures where they fit, tell each place what to work on, pick what each seat leans toward, and move a creature when something better turns up. Nothing waits on a timer.

## Rules

- **V-POST-1** A creature holds at most one post. Moving it is one drag or two taps; there is no priority grid or schedule (F-4). Moving never loses anything: its skill (V-POST-12) stays with it.
- **V-POST-2** Seats. Each post has a number of seats per player, set by the place's server level (V-COM-10); each player unlocks their own seats up to that limit with their own Acorns (and parts at the Forge), each seat dearer than the last. Never fetch quests.
- **V-POST-3** XP. Every creature earns the same idle XP rate wherever it is, at a post or resting at the bonfire (`bonfire.md`). Where a creature works changes what comes home, never how fast it grows. Fights pay on top and are the fastest way to grow.
- **V-POST-4** Fit. Each post names **one** thing it likes (an element or a role), drawn as an icon on the post. A creature that fits produces more (example: +25%); dragging a creature over a post previews the change as one arrow and one number. Any creature can work anywhere. (Q17 may replace this with species work perks.)
- **V-POST-5** The store. Output collects in the post's store. It holds at least about a day and a half of output (round 2, Q5), and about three days in the examples, so a weekend off fills nothing (round 6, Q18; Misa in Q5: "keep the rewards rolling even longer"); when full, the post stops picking up finds, nothing is lost, and its bubble says "full" (F-1). XP is never stored, so a full store never cuts growth. Coming home brings everything home: the return walk shows creatures carrying their piles home (`return.md` V-RET-4); between visits the pile grows visibly at the post. There is no collect button.
- **V-POST-7** Fights. A creature on a post can still fight (round 2, Q6). The dungeon is a quick run and pauses nothing. A creature in the raid is away from the first stage's lock (Friday) to the end of the finale (Sunday); its seat is kept and its post pauses, and the post says who is away defending. One tap seats a resting creature there until the raider returns, which it does on its own; nothing to set up in advance. Only a creature without a post and not in the raid can fill in. A creature knocked out stays out for the weekend (combat v2) and comes home the same way.
- **V-POST-8** Inputs. A post that consumes something (the Forge needs scrap) slows when its input runs low and says why in a few words; a small fallback keeps it from stopping dead (F-5, `forge.md`).
- **V-POST-9** Agency lives at the place: what a place works on is set there (the Forge's queue of orders, which destination a scout explores). Queues stay short (example: up to 3 orders). When a queue runs out, the post falls back to a plainer, less valuable default and keeps working; the fallback needs no attention (no "empty" bubble, no story line), and only a finished order is mentioned.
- **V-POST-10** Away steps (round 1, Q3; made gentler in round 6, Q18): every idle gain (XP, output, skill time) runs at the full rate for the first day or two after a visit, then drops gently (about 15% first) and further the longer the player is away, to near zero after about a month. A player can take a weekend off and come back on Monday to almost no drop. One plain scalar from the time since the last visit, never applied to what fights pay, and never shown as a meter of what was lost. Candidate curves and what they give are below; the economy lab picks one.
- **V-POST-11** Kit: being present pays a little, through choices (round 2, Q5). Each seat may hold one kit item, bought once with Acorns and kept at the post, that tilts what comes home rather than adding a flat bonus. Examples: at a scout, a **lure** (a better chance of a creature, with a hint of which), a **lantern** (rarer finds), a **satchel** (more Acorns and scrap); at a smith, **tongs** (faster common pieces) or a **loupe** (better rarity, slower). A player who looks in more often re-tilts their seats to what they need now (scrap for the Forge, a missing species) and so gains a little more (T-2: under 10% over a daily player). Kit replaces today's supplies (V-SCOUT-5).
- **V-POST-12** Mastery (round 7, Q19). A creature grows in each kind of work it does (scouting, smithing, keeping, teaching) in three visible steps, counted in effective hours (the away steps apply). Examples: **Skilled** after 2 days of work (+5%), **Expert** after 7 (+10%), **Master** after 21 (+15%), always below fit. Mastery is of the kind of work in general ("Smithing", not one recipe) and is permanent: a Master wears the badge and the title ("Pip, Master Smith") for good. Mastering a kind opens a small perk at another kind of post (example: a Master Smith brings home a little more scrap when scouting), and the creature's card says "ready to learn something new". So a Master moving on frees its seat for a newcomer to the same work (Misa: "a nice way of opening the floor for newcomers into the same profession"). Moving is always free. A species can lean toward a kind (learns it faster) but is never barred from any. Today's explorer ranks and Crafting skill become these steps.
- **V-POST-13** Communal posts (`commons.md`): some seats send their output to a server project instead of the player (haulers at the Forge's project, road menders at the Signpost, the lamplighter at the bonfire). The creature earns XP and skill like any post. One communal seat per player per place (example).
- **V-POST-14** One lazy pass (F-9): a player's valley is computed on read from timestamps in one pass. The catch-up multiplier and the hearth level are stored at each visit and held until the next; time is split only where something changes (an away-step boundary, a skill step, a full store, an empty stockpile); communal output is credited when its contributor visits. Priced against `docs/design/database-reads.md` before it is built (example: one player row, about 15 creature rows and a few post and place rows per read).
- No upkeep (F-2): no food, sanity, sickness or rest.

## Places, posts and seats (examples)

Seats per player by the place's server level (levels 1 to 5, V-COM-11).

| Place    | Post                   | Likes (one)                  | Seats per player, level 1 → 5  | Default when its queue runs out         |
| -------- | ---------------------- | ---------------------------- | ------------------------------ | --------------------------------------- |
| Signpost | scout, per destination | the destination's element    | 2 → 6 (one more a level)       | none: a scout always explores its place |
| Forge    | smith, per anvil       | the Crafting role (or trait) | 2 → 4 (levels 2 and 4 add one) | tinkering (V-FORGE-2)                   |
| Paddock  | keeper                 | supports                     | 1 → 2 (level 3 adds one)       | none                                    |
| School   | teacher, student       | (waits on combat v2)         | 1 teacher, 2 students → more   | a teacher reads (waits on `school.md`)  |
| Bonfire  | everyone resting       | none                         | no seats                       | none                                    |
| Each     | communal seat          | the place's like             | 1                              | none                                    |

## Example numbers (the economy lab sets the real ones)

| What                       | Example                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Idle XP, any creature      | 5 an hour, 120 a day at full rate (hearth level 1)                                                          |
| Fights, per top creature   | dungeon about 120 a day, raid about 70 a day averaged (combat v2 sets them)                                 |
| Catch-up                   | x2 at 6 or more levels below the target, fading to x1 at it (`bonfire.md`)                                  |
| Fit / skill / kit          | +25% / +5 to +15% / a tilt, not a bonus                                                                     |
| Store                      | about 3 days of output, so a weekend off fills nothing                                                      |
| Away steps                 | 100% for 48 h, 85% to day 4, 60% to day 7, 30% to day 14, 10% to day 30, then near zero (candidate B below) |
| Acorn income, daily player | about 150 a day (the allowance building up, scouts' finds, leets)                                           |
| Seats                      | a player's own seats cost about three weeks of Acorn income in all                                          |

For scale: today's curve needs about 1,700 XP for level 10, 9,700 for level 20 and 28,000 for level 30.

### A worked month: Sanni, a daily player

Sanni opens the game once each evening and has 15 creatures by week 4.

- Her best three also run the dungeon and the raid: about 310 a day, so about level 19 at week 4, 25 at week 8 and 29 at week 12 (T-6: still growing in week 12).
- Everyone else earns 120 a day, doubled while 6 or more levels behind her 3rd-best creature: her 10th creature is about level 15 to 17 at week 4, within the 5 levels T-1 asks for.
- A visit: the return story tells what her scouts found and what the Forge made, one resting creature's small moment, and one choice (a hinted visitor she could lure, or a new order). She might swap a lantern for a lure, put a new catch at the Tidepools, and run the dungeon. Nothing was waiting on a timer.

### The same month for a weekly player

Juho opens the game on Sundays only. Idle gains run at about 75% to 80% of Sanni's (the away steps), and catch-up only runs in the day after a visit. Juho's best creatures still fight in the raid. On Sunday Juho re-tilts a seat or two and places new catches.

## The away steps: candidate curves

Misa, round 6, Q18: "the drop to half is quite strong to begin with, so I would explore something like a 15% drop after 24 hours or 48 hours. The idea is that let the players keep a weekend off, so when they log in on Monday morning after the weekend, they'll not see a significant drop in economy." Share of a daily player's idle gains (computed by the lead; the lab confirms):

| Curve                                                                      | Every 2 days | Weekend off (60 h) | Every 3 days | Weekly | A month away gives   |
| -------------------------------------------------------------------------- | ------------ | ------------------ | ------------ | ------ | -------------------- |
| A: 100% for 24 h, 85% to day 3, 60% to day 7, 30% to day 14, 10% to day 30 | 92%          | 91%                | 90%          | 73%    | about 9 days' growth |
| B: 100% for 48 h, 85% to day 4, 60% to day 7, 30% to day 14, 10% to day 30 | 100%         | 97%                | 95%          | 79%    | about 9 days' growth |
| Round 1's steps (for comparison): 100% for 24 h, then 50%, 25%, 10%        | 75%          | 70%                | 67%          | 43%    | about 5 days' growth |

The lead leans to B, which meets the weekend-off goal best; a month away still gives only about nine days of growth, so a returning player still recognises their game.

## What it replaces

Expeditions' timed trips and slots, the Workshop's timed jobs and slots, treats, supplies packed per trip, and the lounge's daily cap (`scrap-list.md`). Explorer ranks and the Crafting skill become skill steps (V-POST-12).
