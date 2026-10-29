# Questions for Misa: the ledger

How this works: [`deciding.md`](deciding.md). Questions are asked in rounds of one to three, numbered on across rounds; a question gets its number when it is asked. Each entry keeps the context it was asked with, so any session can pick up after a context compression. Answers are quoted in Misa's words and also go to `docs/design/decisions.md` (tagged "Valley").

Sections: **Waiting on Misa** (asked, not answered), **Queue** (to ask, in order), **Answered**, **Withdrawn**. `reader/build.py` reads the "Waiting on Misa" headings for the phone page, so keep them as `### Q<n>. <question>`.

## Waiting on Misa

### Q4. When the shared place blocks you, can you push it through yourself? (a challenge)

Status: asked, round 2 (2026-10-29). Challenges: Q1's "alternating blocker" against V-COM-5 ("one big giver cannot finish a project alone in a normal week"), F-5 (the fix is one tap) and F-6 (co-op without guilt). Replaces the queued **big-giver** question. Touches: `commons.md`, `forge.md`.

**Why it matters.** You want a player who outgrows the Forge to push for its upgrade. But the plan also says one player can't finish a project alone. Put together, a keen player on a quiet server is stuck waiting on friends, and the only thing they can do is nag them in Discord, which is the guilt we promised to avoid. The research found nothing showing that waiting on the group is fun; the common complaint is about being nagged.

- **A. Wait for the server.** Your gifts count less past a weekly share, so the upgrade needs others. Example: on a quiet 5-player server, Sanni has the resources for a third anvil and waits two weeks for the Forge's level 3.
- **B. You can carry it, slowly.** Your gifts count less past a weekly share, but never zero, so a keen player can finish it alone in a few weeks; with friends it takes days. Example: Sanni gets her anvil in about three weeks alone, or in four days if two friends chip in.
- **C. A rare find opens it.** The common route needs the group, but the place's keystone (a Heartcoal from the Ember Caves for the Forge) completes the step at once, and a dedicated scout finds one in a few weeks. Example: Sanni puts her best scout in the Ember Caves and gets the Heartcoal in week 3.

**Lead's pick: B, with C as well.** B keeps the alternating limit you want and keeps the group the fast way, but no one is held hostage by quiet friends. C gives a keen player a goal and an adventure instead of a grind. Projects are sized only for players who visited in the last week (lead's decision), so members who drifted away never make a project bigger.

### Q5. How long do stores and queues last before they need you? (a challenge)

Status: asked, round 2 (2026-10-29). Challenges: Q3's "storages likely fill up, crafting jobs default to less valuable processes... keep bringing players back" together with "daily check in for full exp", and F-1 (no must-check timers). Touches: `posts.md` V-POST-5 and V-POST-9, `forge.md`, `scouts.md`, `return.md`.

**Why it matters.** You expect full stores and finished queues to bring players back on their own. How fast they fill decides what kind of pull that is. Short stores become timers by another name: a twice-a-day player beats a daily one, which goes against "daily for full". The research names this as the most resented idle pattern (AFK Arena's 12-hour chest exists to force two visits a day). And for someone away a month, full stores, a low-value Forge and near-zero growth all hit at once, so the return story would read "nothing much happened".

- **A. About a day and a half.** A daily player never hits a full store or an empty queue. Stores and queues limit long absences; they don't pull you back daily. Example: Sanni plays every evening and always finds her scouts still picking things up.
- **B. About half a day.** Stores and queues are the reason to look in twice a day. Example: Sanni's scouts are full by lunch.
- **C. Several days.** They almost never fill. Only the away steps limit long absences. Example: away a long weekend, everything is still running.

**Lead's pick: A.** It keeps your rule that a daily visit gets everything, and leaves the pull to what you said brings players back: new choices, finds to use and orders to set. Even a month away still gets a proper story (who found what, how the server's places grew, what is waiting), never "nothing happened".

### Q6. Does a creature picked for the raid leave its post?

Status: asked, round 2 (2026-10-29). Was the queued **post-or-fight**. Touches: `posts.md` V-POST-7, `defence.md`.

**Why it matters.** Most creatures will hold a post all week. The raid weekend (and the daily dungeon) picks a team from them. This decides whether fighting costs the valley anything, which shapes how much a big roster is worth.

- **A. Fighting costs nothing.** The creature fights and keeps working. Example: Pip smiths all weekend and is in the raid too.
- **B. Its post waits for it during the raid.** The post pauses for the raid weekend and resumes on its own; the dungeon is a quick run and pauses nothing. Example: you take your best smith to the raid, and the Forge is slower until Monday unless another creature takes the anvil.
- **C. It leaves its post.** You reassign it after the raid. Example: on Monday you move Pip back to the Forge yourself.

**Lead's pick: B.** It fits the story (creatures leave the valley to defend it) and makes a bigger roster worth something (G-2: cover both the raid and the Forge), and it needs nothing from you: the post resumes by itself. C is a chore (F-1, F-5), and A makes the choice weightless.

## Queue

In order. Each becomes a numbered question when asked; entries name what they wait on.

- **scrap-list (lead's work first).** A keep, rework or scrap table of today's game against the vision: Expeditions, Workshop jobs, the lounge and its cap, the daily dungeon, Bait, Essence, scrap and the other materials, leet points, gear, the Journal, weather, Home's board. Live numbers and player feedback next to each. Misa is asked only about the rows where the call is not obvious. In progress while round 2 waits.
- **returners.** A weekly or returning player brings a smaller roster to the raid (V-POST-10: about 43% of a daily player's idle growth in a week). Does the raid even it out (level sync, a catch-up toward the server), or is that the honest cost of playing less? A seam with combat v2. After round 2.
- **bonfire.** Is the bonfire a flat floor for every creature, or a communal hearth the server feeds? (`bonfire.md`.) Waits on Q1 and Q3.
- **place-max.** Do places have a max level, after which projects turn cosmetic? (`commons.md`.) Waits on Q1.
- **battlegrounds.** Battlegrounds for Tide, Ember and Mire: a drowned sea gate, a caldera, a sunken shrine; or other ideas? (`defence.md`.)
- **sentries.** Should sentries posted at the Watchtower add to the server's raid readiness, or should the raid stay purely the weekend's fight? (`defence.md` V-DEF-4.)
- **targets.** What the economy lab measures and which numbers feel right (T-1 to T-5 in `goals.md`). Asked with the lab's first report, as concrete examples, not as a list to approve.

## Answered

### Q1. One valley for the whole server, or one valley each?

Status: answered, round 1 (2026-10-29). Touches: `systems/valley.md`, `commons.md`, `later.md` (housing).

**Why it matters.** It decides what you see when you open the game, and how co-op idling can work. Today each player has their own creatures and pages; only the raid, the lounge and the dungeon's daily map are shared.

- **A. One shared valley.** Everyone's creatures live and work in the same places, and the places belong to the server. Your own space is your house. Example: you open the game and see your Pip at the Forge next to Sam's Mossback; the Forge got its new anvil because the whole server built it.
- **B. Your own valley, plus a shared town.** Your places and posts are yours alone; a shared square holds the communal projects and the Watchtower. Example: Clash of Clans, a village each plus the clan's castle.

**Lead's pick: A.** The co-op idling Misa wants only feels real when friends' creatures are visibly in the same world, and a 5 to 15 player server is small enough to share one place. Cost: on a 15-player server the valley gets crowded, so it shows your creatures first and a few friends' at a time. If A, whether each post has a seat per player or seats are shared is decided in the posts doc.

**Answer (2026-10-29): A.** "Let's walk the line between personal progress and shared progress, making each an alternating blocker (on a new server). Example: A player might have all the resources to unlock a third anvil, but the forge may not be able to fit three anvils per player yet. This hopefully motivates the player to push for the shared forge building upgrade."

Became: G-4 accepted; one shared valley (`systems/valley.md`); V-COM-10, personal and shared progress take turns being the limit; V-FORGE-6.

### Q2. Do job posts replace every timed task?

Status: answered, round 1 (2026-10-29). Touches: `posts.md`, `scouts.md`, `forge.md`; scraps today's Expeditions and Workshop jobs if A.

**Why it matters.** Today creatures go on trips of 2 to 24 hours and do Workshop jobs on timers, and you come back to claim the result. Posts replace that with creatures who stand at a place and work all the time. This decides whether Expeditions and the Workshop survive in their current form.

- **A. Posts replace all of it.** Trips and Workshop jobs go away. Example: instead of sending Pip on a 6-hour trip to the Tidepools, Pip is the Tidepools scout and brings finds home as she goes.
- **B. Posts, plus a few timed specials.** Most work is posts, but rare events still take a creature away for a set time. Example: a weekend voyage to a far island that takes your best scout for two days.

**Lead's pick: A.** Two systems doing one job split attention, and timers you must come back to claim are what the research names as the thing that turns idling into a chore (`docs/research/idle-job-posts.md`). Special events can come later as visitors on a visible rhythm, which give the same surprise without a timer. Items players earned on trips stay theirs.

**Answer (2026-10-29): A.** "It's laid back, works passively, and we can still build e.g., queue systems and configuration options to give players agency over what and how they're doing things. Example: which blueprints are being crafted, which areas are being explored."

Became: posts replace every timed task (Expeditions' trips and Workshop jobs are scrapped); V-POST-9, agency lives at the place (orders, queues, destinations), and a finished queue falls back to a plainer default; V-FORGE-1.

### Q3. How much should opening the game matter? (a challenge)

Status: answered, round 1 (2026-10-29). Challenges: Misa's "don't limit daily XP" (2026-10-29) together with G-3 and F-1, "being away never costs anything". Touches: `bonfire.md`, `posts.md`, `return.md`, T-2 in `goals.md`; replaces today's lounge cap (60 XP a creature a day).

**Why it matters.** No daily limit plus "away costs nothing" means a player who opens the game once a week grows exactly as fast as one who opens it every day. Then nothing but the raid pulls anyone back, and the "coming back is the reward" idea has nothing to reward. Most idle games answer with a store that fills up; players resent short ones (AFK Arena's 12-hour chest exists to make people log in twice a day).

- **A. Pure idle.** Posts work at full speed forever; opening the game only lets you make choices (a better post, a new catch put to work) that speed things up. Example: away a week, you come back to a full week of growth.
- **B. A day's store.** Posts fill for about a day, then wait for you. Example: a daily player gets everything; someone who looks in every three days gets about a third.
- **C. Rested.** Full speed for the first day away, then half speed, never zero. Example: daily gets everything, every other day about 75%, once a week about 57%.

**Lead's pick: C.** It gives a gentle reason to look in once a day without punishing anyone who can't, and a weekly player still brings a grown roster to the raid. It bends "away costs nothing" into "away never takes away what you have". All numbers are examples; the economy lab sets them.

**Answer (2026-10-29): C, with steeper steps.** "C sounds good, though the fall off could be larger toward longer idle periods and even drop to near zero after a long time. A player who was away for a month might lose the feeling of control if they don't recognize the game they came back to, because the game has moved them forward so much. Daily check in for full exp is good, then drop in a few steps. I'd expect that our other systems will keep bringing players back organically because their storages likely fill up, crafting jobs default to less valuable processes, expeditions don't get player input, and so on. This all stems from the systems and doesn't need to influence the plain simple scalar we apply to long idling players' gains."

Became: G-3 accepted as reworded; F-1 and T-2 changed; V-POST-10, away growth in steps (full for a day, near zero after about a month); the lounge's daily cap goes.

## Withdrawn

- **"Are the goals G-2 to G-4 and G-6 right as written?"** (old open question 1, 2026-10-29). Too big to answer at once; the goals are now settled through the concrete questions above, and `goals.md` changes with each answer.
- **"Are T-1 to T-5 the right things to measure?"** (old open question 2). Moved to the queue as **targets**, to be asked with the lab's numbers.
