# Questions for Misa: the ledger

How this works: [`deciding.md`](deciding.md). Questions are asked in rounds of one to three, numbered on across rounds; a question gets its number when it is asked. Each entry keeps the context it was asked with, so any session can pick up after a context compression. Answers are quoted in Misa's words and also go to `docs/design/decisions.md` (tagged "Valley").

Sections: **Waiting on Misa** (asked, not answered), **Queue** (to ask, in order), **Answered**, **Withdrawn**. `reader/build.py` reads the "Waiting on Misa" headings for the phone page, so keep them as `### Q<n>. <question>`.

## Waiting on Misa

### Q1. One valley for the whole server, or one valley each?

Status: asked, round 1 (2026-10-29). Touches: `systems/valley.md`, `commons.md`, `later.md` (housing).

**Why it matters.** It decides what you see when you open the game, and how co-op idling can work. Today each player has their own creatures and pages; only the raid, the lounge and the dungeon's daily map are shared.

- **A. One shared valley.** Everyone's creatures live and work in the same places, and the places belong to the server. Your own space is your house. Example: you open the game and see your Pip at the Forge next to Sam's Mossback; the Forge got its new anvil because the whole server built it.
- **B. Your own valley, plus a shared town.** Your places and posts are yours alone; a shared square holds the communal projects and the Watchtower. Example: Clash of Clans, a village each plus the clan's castle.

**Lead's pick: A.** The co-op idling Misa wants only feels real when friends' creatures are visibly in the same world, and a 5 to 15 player server is small enough to share one place. Cost: on a 15-player server the valley gets crowded, so it shows your creatures first and a few friends' at a time. If A, whether each post has a seat per player or seats are shared is decided in the posts doc.

### Q2. Do job posts replace every timed task?

Status: asked, round 1 (2026-10-29). Touches: `posts.md`, `scouts.md`, `forge.md`; scraps today's Expeditions and Workshop jobs if A.

**Why it matters.** Today creatures go on trips of 2 to 24 hours and do Workshop jobs on timers, and you come back to claim the result. Posts replace that with creatures who stand at a place and work all the time. This decides whether Expeditions and the Workshop survive in their current form.

- **A. Posts replace all of it.** Trips and Workshop jobs go away. Example: instead of sending Pip on a 6-hour trip to the Tidepools, Pip is the Tidepools scout and brings finds home as she goes.
- **B. Posts, plus a few timed specials.** Most work is posts, but rare events still take a creature away for a set time. Example: a weekend voyage to a far island that takes your best scout for two days.

**Lead's pick: A.** Two systems doing one job split attention, and timers you must come back to claim are what the research names as the thing that turns idling into a chore (`docs/research/idle-job-posts.md`). Special events can come later as visitors on a visible rhythm, which give the same surprise without a timer. Items players earned on trips stay theirs.

### Q3. How much should opening the game matter? (a challenge)

Status: asked, round 1 (2026-10-29). Challenges: Misa's "don't limit daily XP" (2026-10-29) together with G-3 and F-1, "being away never costs anything". Touches: `bonfire.md`, `posts.md`, `return.md`, T-2 in `goals.md`; replaces today's lounge cap (60 XP a creature a day).

**Why it matters.** No daily limit plus "away costs nothing" means a player who opens the game once a week grows exactly as fast as one who opens it every day. Then nothing but the raid pulls anyone back, and the "coming back is the reward" idea has nothing to reward. Most idle games answer with a store that fills up; players resent short ones (AFK Arena's 12-hour chest exists to make people log in twice a day).

- **A. Pure idle.** Posts work at full speed forever; opening the game only lets you make choices (a better post, a new catch put to work) that speed things up. Example: away a week, you come back to a full week of growth.
- **B. A day's store.** Posts fill for about a day, then wait for you. Example: a daily player gets everything; someone who looks in every three days gets about a third.
- **C. Rested.** Full speed for the first day away, then half speed, never zero. Example: daily gets everything, every other day about 75%, once a week about 57%.

**Lead's pick: C.** It gives a gentle reason to look in once a day without punishing anyone who can't, and a weekly player still brings a grown roster to the raid. It bends "away costs nothing" into "away never takes away what you have". All numbers are examples; the economy lab sets them.

## Queue

In order. Each becomes a numbered question when asked; entries name what they wait on.

- **scrap-list (lead's work first).** A keep, rework or scrap table of today's game against the vision: Expeditions, Workshop jobs, the lounge and its cap, the daily dungeon, Bait, Essence, scrap and the other materials, leet points, gear, the Journal, weather, Home's board. Live numbers and player feedback next to each. Misa is asked only about the rows where the call is not obvious. After round 1.
- **post-or-fight.** Does a creature picked for the dungeon or the raid leave its post, or does its post wait for it? (`posts.md` V-POST-7.)
- **bonfire.** Is the bonfire a flat floor for every creature, or a communal hearth the server feeds? (`bonfire.md`.) Waits on Q1 and Q3.
- **big-giver.** One generous player in the commons: gifts past a weekly share count less (soft), or a hard weekly cap? (`commons.md` V-COM-5.) Waits on Q1.
- **place-max.** Do places have a max level, after which projects turn cosmetic? (`commons.md`.) Waits on Q1.
- **battlegrounds.** Battlegrounds for Tide, Ember and Mire: a drowned sea gate, a caldera, a sunken shrine; or other ideas? (`defence.md`.)
- **sentries.** Should sentries posted at the Watchtower add to the server's raid readiness, or should the raid stay purely the weekend's fight? (`defence.md` V-DEF-4.)
- **targets.** What the economy lab measures and which numbers feel right (T-1 to T-5 in `goals.md`). Asked with the lab's first report, as concrete examples, not as a list to approve.

## Answered

None yet.

## Withdrawn

- **"Are the goals G-2 to G-4 and G-6 right as written?"** (old open question 1, 2026-10-29). Too big to answer at once; the goals are now settled through the concrete questions above, and `goals.md` changes with each answer.
- **"Are T-1 to T-5 the right things to measure?"** (old open question 2). Moved to the queue as **targets**, to be asked with the lab's numbers.
