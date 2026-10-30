# Questions for Misa: the ledger

How this works: [`deciding.md`](deciding.md). Questions are asked in rounds of one to three, numbered on across rounds; a question gets its number when it is asked. Each entry keeps the context it was asked with, so any session can pick up after a context compression. Answers are quoted in Misa's words and also go to `docs/design/decisions.md` (tagged "Valley").

Sections: **Waiting on Misa** (asked, not answered), **Queue** (to ask, in order), **Answered**, **Withdrawn**. `reader/build.py` reads the "Waiting on Misa" headings for the phone page, so keep them as `### Q<n>. <question>`.

## Waiting on Misa

Nothing waiting.

## Queue

In order. Each becomes a numbered question when asked; entries name what they wait on.

- **school.** Keep the School, fold it into another place, or scrap it (Misa in Q32: "Is it a dumb way to do things that I just came up with because it felt cool?"). Waits on combat v2's talents; the lead's first take is in `systems/school.md`.
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

### Q4. When the shared place blocks you, can you push it through yourself? (a challenge)

Status: answered, round 2 (2026-10-29). Challenges: Q1's "alternating blocker" against V-COM-5 ("one big giver cannot finish a project alone in a normal week"), F-5 (the fix is one tap) and F-6 (co-op without guilt). Replaces the queued **big-giver** question. Touches: `commons.md`, `forge.md`.

**Why it matters.** You want a player who outgrows the Forge to push for its upgrade. But the plan also says one player can't finish a project alone. Put together, a keen player on a quiet server is stuck waiting on friends, and the only thing they can do is nag them in Discord, which is the guilt we promised to avoid. The research found nothing showing that waiting on the group is fun; the common complaint is about being nagged.

- **A. Wait for the server.** Your gifts count less past a weekly share, so the upgrade needs others. Example: on a quiet 5-player server, Sanni has the resources for a third anvil and waits two weeks for the Forge's level 3.
- **B. You can carry it, slowly.** Your gifts count less past a weekly share, but never zero, so a keen player can finish it alone in a few weeks; with friends it takes days. Example: Sanni gets her anvil in about three weeks alone, or in four days if two friends chip in.
- **C. A rare find opens it.** The common route needs the group, but the place's keystone (a Heartcoal from the Ember Caves for the Forge) completes the step at once, and a dedicated scout finds one in a few weeks. Example: Sanni puts her best scout in the Ember Caves and gets the Heartcoal in week 3.

**Lead's pick: B, with C as well.** B keeps the alternating limit you want and keeps the group the fast way, but no one is held hostage by quiet friends. C gives a keen player a goal and an adventure instead of a grind. Projects are sized only for players who visited in the last week (lead's decision), so members who drifted away never make a project bigger.

**Answer (2026-10-29): B, without diminishing returns.** "B, I think. Individual players can slowly accumulate the resources and there's no need to obfuscate it behind diminishing returns unless research calls for it. Let's not block the player, but encourage them to engage with the community and coordinate efforts."

Became: V-COM-5, gifts always count in full; a lone player is slowed only because projects are sized for the server's active players; the scene shows who builds and what is missing; the lab reports the top giver's share. Keystones stay as in `commons.md`.

### Q5. How long do stores and queues last before they need you? (a challenge)

Status: answered, round 2 (2026-10-29). Challenges: Q3's "storages likely fill up, crafting jobs default to less valuable processes... keep bringing players back" together with "daily check in for full exp", and F-1 (no must-check timers). Touches: `posts.md` V-POST-5 and V-POST-9, `forge.md`, `scouts.md`, `return.md`.

**Why it matters.** You expect full stores and finished queues to bring players back on their own. How fast they fill decides what kind of pull that is. Short stores become timers by another name: a twice-a-day player beats a daily one, which goes against "daily for full". The research names this as the most resented idle pattern (AFK Arena's 12-hour chest exists to force two visits a day). And for someone away a month, full stores, a low-value Forge and near-zero growth all hit at once, so the return story would read "nothing much happened".

- **A. About a day and a half.** A daily player never hits a full store or an empty queue. Stores and queues limit long absences; they don't pull you back daily. Example: Sanni plays every evening and always finds her scouts still picking things up.
- **B. About half a day.** Stores and queues are the reason to look in twice a day. Example: Sanni's scouts are full by lunch.
- **C. Several days.** They almost never fill. Only the away steps limit long absences. Example: away a long weekend, everything is still running.

**Lead's pick: A.** It keeps your rule that a daily visit gets everything, and leaves the pull to what you said brings players back: new choices, finds to use and orders to set. Even a month away still gets a proper story (who found what, how the server's places grew, what is waiting), never "nothing happened".

**Answer (2026-10-29): A.** "We could probably take a page out of an idle game's book here and keep the rewards rolling even longer, but if our progression model lets players make constant small upgrades by being present more often, they could get slightly more efficient gains that way by using the collected resources to upgrade their setup. Treat this as a loose design guideline."

Became: V-POST-5 and V-FORGE-1, stores and queues last at least about a day and a half; V-POST-11, being present pays a little through small upgrades, never through rate or timers (a guideline).

### Q6. Does a creature picked for the raid leave its post?

Status: answered, round 2 (2026-10-29). Was the queued **post-or-fight**. Touches: `posts.md` V-POST-7, `defence.md`.

**Why it matters.** Most creatures will hold a post all week. The raid weekend (and the daily dungeon) picks a team from them. This decides whether fighting costs the valley anything, which shapes how much a big roster is worth.

- **A. Fighting costs nothing.** The creature fights and keeps working. Example: Pip smiths all weekend and is in the raid too.
- **B. Its post waits for it during the raid.** The post pauses for the raid weekend and resumes on its own; the dungeon is a quick run and pauses nothing. Example: you take your best smith to the raid, and the Forge is slower until Monday unless another creature takes the anvil.
- **C. It leaves its post.** You reassign it after the raid. Example: on Monday you move Pip back to the Forge yourself.

**Lead's pick: B.** It fits the story (creatures leave the valley to defend it) and makes a bigger roster worth something (G-2: cover both the raid and the Forge), and it needs nothing from you: the post resumes by itself. C is a chore (F-1, F-5), and A makes the choice weightless.

**Answer (2026-10-29): B.** "Thematically leaving on a raid quest would remove the creature from a post. However, the raid fights happen in just a few minutes and a creature can even be knocked out during one. The plan in the combat branch is to not allow a knocked out creature to return the same weekend, but another can take its place. Maybe option B sounds best and an active player would just replace the posts vacancy with another creature."

Became: V-POST-7, a raider's seat is kept for the weekend, a stand-in may hold it, the raider returns on its own; the dungeon pauses nothing; V-DEF-3.

### Q7. Should a missed day still cost a dungeon run? (a challenge)

Status: answered, round 3 (2026-10-29). From the scrap list. Challenges: today's daily dungeon against F-1 and G-3 as Misa reworded them in round 1 ("being away never takes away what a player already has"). Touches: the Cave in `systems/valley.md`, `scrap-list.md`.

**Why it matters.** Today you get one dungeon run a day, on a map the whole server shares, reset at 13:37. A missed day is a run gone for good, and it resets your streak (a small bonus on the 3rd and 7th day in a row). Everything else in the valley now waits for you, so the dungeon would be the one place that punishes a day off.

- **A. Keep it daily.** One run a day; a missed day is gone. It stays the game's daily habit. Example: Sanni skips Saturday and that run is lost.
- **B. Missed runs wait for you.** Runs bank up (example: up to 3); you play them on the current day's map. The streak becomes "runs played this week". Example: Sanni skips the weekend and plays three runs on Monday.
- **C. A weekly delve.** One bigger run a week, played any day. Example: a seven-floor delve that Sanni plays on Wednesday evening.

**Lead's pick: B.** It keeps the shared daily map (people compare routes) and the daily rhythm for those who like it, without taking anything from someone who skips a day. A 3-run bank means nobody has to visit daily, and the run isn't spread so thin that it loses its weight.

**Answer (2026-10-29): B, with past maps.** "B, but keep the dungeon seeds for the last 3 days so the player can run the same content as everyone else did. We can basically give players "dungeon passes" that stack up when needed."

Became: dungeon passes, one a day, stacking to 3; a pass runs today's map or one of the last 3 days' maps (the stored day seeds; every fight's seed is still a fresh draw on entry); the streak becomes runs played in a week (lead's call). `systems/valley.md`, `scrap-list.md`.

### Q8. What happens to the Valley Games?

Status: answered, round 3 (2026-10-29). From the scrap list. Touches: the Fairground in `systems/valley.md`, `scrap-list.md`; today's Games, Prize Stall, medals and badges.

**Why it matters.** The Games are a daily show of three events (four on Wednesdays) where level doesn't matter and "good fit" does; medals buy prizes at the Wednesday stall. They were built to make low-level creatures worth using, which posts and the bonfire now do for the whole roster. A daily show is also one more daily habit next to the dungeon.

- **A. Keep them daily** at the Fairground, as today. Example: you enter three creatures each day and see the results next visit.
- **B. A weekly fair.** One bigger show midweek, with entries open all week and the stall on the same day. The week gets a rhythm: the fair midweek, the raid at the weekend. Example: Wednesday is fair day; Sanni sets her entries on Monday and sees the medals Wednesday evening.
- **C. Scrap them.** Posts already make every creature useful. Medals, badges and the stall go; players keep their medals as mementos.

**Lead's pick: B.** The "good fit" puzzle is a different kind of fun than the raid's power, and worth keeping. Weekly makes it an event instead of a chore, and gives the quiet middle of the week something to look forward to. Today you said four events "felt like a bit much"; a weekly fair can be bigger without that feeling.

**Answer (2026-10-29): B.** "Wednesday is good. Increase the number of events to maybe 5 to compensate."

Became: the Valley Games are a weekly fair every Wednesday with about 5 events, entries open all week, the Prize Stall the same day. `systems/valley.md`, `scrap-list.md`.

### Q9. What is Bait for in the valley?

Status: answered, round 3 (2026-10-29). From the scrap list. Touches: `commons.md`, `scouts.md`, `posts.md`; today's allowance (25 a day for opening the game) and leet bonus (15 to 32).

**Why it matters.** Today Bait mostly buys treats (double XP for one activity), lures and talent slots. Treats go with posts, so Bait would pile up with nothing to buy (the simulator already shows it piling up). Bait is also the game's link to leeting, so it should stay worth earning.

- **A. Bait builds the valley.** It is what you give to the server's projects, next to parts. Example: Sanni drops 200 Bait in the Signpost's donation bowl toward a new road.
- **B. Bait goes to your posts.** You spend it on things that stay at a post: a lure at a scout's post that attracts a particular creature (shown with a hint), a better tool for a smith. Example: Sanni puts a Kelp Lure at the Tidepools and a rare Tide creature starts turning up.
- **C. Both.** Bait is the everyday currency: your own setup and the server's projects compete for it.

**Lead's pick: C.** A real choice between "my valley" and "our valley" every time you spend is the heart of co-op idling, and lures at posts give the discovery puzzle the research recommends. Leets keep paying Bait. The daily allowance would stop being a reward for opening the game and arrive like any other idle gain instead (lead's call, unless you object), so it isn't one more thing that punishes a day off.

**Answer (2026-10-29): C.** "We don't have to keep calling it bait either."

Became: Bait is the everyday currency for a player's own posts (lures, tools, supplies) and the server's projects; leets keep paying it; the daily allowance builds up like an idle gain (the lead's call stood, Misa did not object). A new name is queued (**currency-name**). `commons.md`, `scouts.md`, `scrap-list.md`.

### Q10. Does a player who plays less get help catching up?

Status: answered, round 4 (2026-10-29). Was the queued **returners**. Touches: `bonfire.md` V-BON-2, `posts.md` V-POST-10, `defence.md`; a seam with combat v2 (what a level is worth in the raid).

**Why it matters.** With the away steps, a once-a-week player grows about 43% as fast as a daily one, and someone back after a month has barely grown. Everyone fights the same raid boss together, so a roster far behind adds little and can feel like dead weight. Today's plan only helps a player's own weakest creatures catch up to that player's best.

- **A. No help: that is the cost of playing less.** Example: Juho plays on Sundays; Juho's creatures are ten levels behind the server's, and Juho knows why.
- **B. Catch-up toward the server.** Creatures behind the server's middle grow faster while their player is present, fading as they close in. Example: Juho comes back after a month; within about a week of daily visits Juho's best team is close to the server's middle again.
- **C. Level sync in the raid.** In the raid every creature fights at the server's level, so levels matter only outside it. Example: Juho's level 12 Pip fights as level 20 on Sunday.

**Lead's pick: B.** A returning player gets back into the fight quickly, which is what keeps a small server's raid alive, and levels still mean something in the raid, so growing your roster stays rewarding. C would make the raid ignore the growth the whole valley is built around. The catch-up only runs while the player is present, so it never undoes the away steps.

**Answer (2026-10-29): B.**

Became: V-BON-6, catch-up toward the server's middle while the player is present; no level sync in the raid.

### Q11. Is the bonfire the same for everyone, or something the server builds?

Status: answered, round 4 (2026-10-29). Was the queued **bonfire**. Touches: `bonfire.md`, `commons.md`.

**Why it matters.** Creatures without a post sit at the bonfire and grow slowly; it's the floor that keeps a whole roster useful. It is also the one place every player's creatures share, so it's a natural first project for the server.

- **A. A flat floor.** Every idle creature grows at the same fixed rate on every server. Nothing to build. Example: Sanni's bench grows the same on a busy server and a quiet one.
- **B. A communal hearth.** The server raises the bonfire's level with gifts and a lamplighter post; each level makes everyone's bench grow a little faster and adds something to see (a bigger fire, benches, lanterns). Example: the server feeds the fire for a week and every player's idle creatures grow 10% faster from then on.
- **C. Your own campfire.** Each player upgrades their own fire with their own resources. Example: Sanni buys a better log pile and her bench grows faster.

**Lead's pick: B.** It is the project that helps everyone most evenly, newcomers included from day one, and the easiest one for a new server to rally around in its first week. The floor stays: a level-1 hearth is A's flat rate, so a quiet server is never worse off.

**Answer (2026-10-29): B.** "This could be slightly incremental."

Became: V-BON-7, the communal hearth: a server level raised like any place, each level a slight increase to every idle creature's growth; level 1 is the flat floor.

### Q12. Do the server's places stop growing at some level?

Status: answered, round 4 (2026-10-29). Was the queued **place-max**. Touches: `commons.md`, `later.md`, goal G-7 (the endgame is cosmetic).

**Why it matters.** Places grow through the server's projects. If they grow forever, every level adds a little power, the economy has to keep finding new bonuses, and an old server pulls ever further ahead of a new one. If they stop, the server needs something else to build.

- **A. A max level, then projects turn cosmetic.** After the last level, projects add banners, statues, a fountain, seasonal decorations everyone sees. Example: the Forge maxes at level 5; the next project is a copper weathervane on its roof.
- **B. No max.** Every level adds a small bonus forever, idle-game style. Example: Forge level 23 gives +1% speed.
- **C. A max level, then a new place opens.** Finishing the valley's places unlocks a new place to build. Example: when every place reaches level 5, the road to the Lighthouse opens.

**Lead's pick: A now, with C as later content.** A matches your endgame (cosmetics, housing and decorations) and keeps the balance in one known range the economy lab can test, so old and new servers stay comparable. New places can arrive later on top of the same system (G-6).

**Answer (2026-10-29): A, with new places any time.** "Your take is good. We can open new places even before max level, but these shared upgrades should get increasingly difficult over time."

Became: V-COM-11, a max level per place, each level's project bigger than the last, cosmetic projects after the max; new places can open as content at any time. G-7 accepted in part.

### Q13. What do we call the currency that replaces Bait?

Status: answered, round 5 (2026-10-30). Was the queued **currency-name**. Touches: every doc and screen that says Bait; the compendium (`docs/compendium/world.md`, `items.md`).

**Why it matters.** It's the word players see most. In the valley it pays for your own posts (lures, tools) and the server's projects, and leets keep paying it. The compendium's rule: it's an in-world thing, and the lore never says where it comes from.

- **A. Acorns.** Small, everywhere, every creature wants one. Example: "Sanni dropped 200 acorns in the Signpost's bowl."
- **B. Kindling.** Everything in the valley runs on it: the bonfire, the Forge, the beacon. Example: "the hearth needs 2,000 kindling for level 3."
- **C. Buttons.** What the valley's folk trade among themselves, odd and charming. Example: "a Kelp Lure costs 40 buttons."
- **D. Coppers.** A plain coin, clear at once. Example: "40 coppers."

**Lead's pick: A, Acorns.** It reads as money at a glance, fits a valley of creatures, and works for both uses (you spend acorns on a lure, you give acorns to the Forge). Kindling is lovely for the bonfire but odd for buying a lure; Coppers is clear but has no character.

**Answer (2026-10-30): A, Acorns.** "Acorns is fine but make sure we have some kind of resource library acting as a source of truth so we can easily change it later. It needs to be pretty generic."

Became: Bait is renamed Acorns in the plan; a resource library (one data file naming every resource) is the first build task of phase 4 (`roadmap.md`, `decisions.md`).

### Q14. Are these the right battlegrounds for the other three bosses?

Status: answered, round 5 (2026-10-30). Was the queued **battlegrounds**. Touches: `defence.md` (battlegrounds table), `docs/compendium/bosses.md`; art for each.

**Why it matters.** You set the first two: the Thornmother (Grove) in an ancient temple swallowed by roots, the Storm Sovereign (Spark) on a thunderous mountaintop. The other three need a place where the valley meets the threat. Each is a full scene to draw.

- **A. Yes to all three:**
  - Tidal Colossus (Tide): a drowned sea gate past the Tidepools' shelf.
  - Cinder Wyrm (Ember): a caldera below the Ember Caves.
  - Old Bogback (Mire): a sunken shrine in the Sunken Fen.
- **B. Swap some:**
  - Tide: a lighthouse on a storm-beaten cape.
  - Ember: a forest's burning edge, where the fire reaches the valley.
  - Mire: a drowned battlefield of old banners and broken spears.
- **C. Your own ideas** for any of them.

**Lead's pick: A, with Ember from B.** A drowned sea gate and a sunken shrine fit "the threat comes to the valley's door" well. For Ember, a caldera is far away, while a forest's burning edge is the fire arriving at the valley itself, which is the defence story you asked for. Mix and match freely.

**Answer (2026-10-30): A.** "The raid is proactive defense and happens in far away places."

Became: the three battlegrounds accepted (`defence.md`, compendium `bosses.md`); G-5 says the raid is proactive defence in far away places, so the lead's Ember swap (a threat at the valley's edge) did not fit.

### Q15. Should creatures guarding the Watchtower during the week help in the raid?

Status: answered, round 5 (2026-10-30). Was the queued **sentries**. Touches: `defence.md` V-DEF-4, `posts.md` (sentry post); a seam with combat v2, which owns the raid's numbers.

**Why it matters.** A sentry is a post at the Watchtower. If sentries help the raid, everyone's idle creatures contribute to the weekend fight, which fits the server defending together. But anything that changes the raid's power has to be balanced in combat v2's lab, and makes the raid depend on how much the server idled.

- **A. A small power bonus.** Example: each sentry on the server takes a sliver off the boss's HP at the first stage.
- **B. A scouting report.** Sentries spot the threat early: the more sentries, the more of the boss's first moves are shown before the weekend. Example: with 6 sentries posted, Friday's stage shows the boss's first three moves ahead of time.
- **C. Nothing for the raid.** The raid stays purely the weekend's fight; sentries do something else (watch for rare visitors, read the weather).

**Lead's pick: B.** Information fits the defence story ("we saw it coming"), helps every player plan their column, and changes no raid numbers, so combat v2 can stay balanced on its own. A would tie the raid's difficulty to idling.

**Answer (2026-10-30): no post.** "I'm still skeptical about the watchtower concept in general. It needs to provide benefits across the entire week if it is to be a post. The raid has limited options for player agency beyond its "rule cards" and we need to give players the entire week to prepare for those, so I'd want any hypothetical watchtower to give that info already on Monday. If we can't find a use for the watchtower, drop it as a post. No need to shoe horn it in."

Became: V-DEF-4, no sentry post; the boss and its rule cards are known to everyone from Monday (a wish for combat v2); the Watchtower stays only as the raid's place in the valley, its name and role to revisit with the art; Watchtower projects and the Stormglass keystone removed from `commons.md`.

### Q16. What should the couch give now that XP has no daily cap?

Status: answered, round 6 (2026-10-30). From the panel (`reviews/2026-10-30-posts-bonfire.md`, finding 5). Revisits Misa's choice of 2026-10-20, "lounging with company". Touches: `bonfire.md` V-BON-4, today's lounge.

**Why it matters.** Today a lounger earns 1 XP every 2 minutes while you and a friend are both in the Activity, up to 60 a day. The cap was what kept it small. With no daily caps in the valley, two friends (or one player with a second account) leaving the Activity open all day would earn about 720 XP a day for one creature, more than fights. It also only works when friends are online at the same moment, which casual players rarely are.

- **A. Keep it, with today's cap.** Company time pays up to 60 XP a day, as now. Example: Sanni and Juho are both online for an hour, and both loungers earn 30.
- **B. Company over a day, not a moment.** If a friend also visited today, at any time, your lounger and theirs each get a small fixed bonus. Example: Sanni plays at 8 in the morning and Juho at 9 at night; both loungers get +60 XP.
- **C. Social only.** No extra XP. Friends see who is lounging, and visiting a friend's house leaves a small gift (a few Acorns) once a day.

**Lead's pick: B.** It keeps your idea that company matters, works for friends whose evenings never overlap, and can't be farmed by leaving a tab open (F-8).

**Answer (2026-10-30): no couch.** "I think the couch is kind of outdated at this point. The idea was that it's fun to be in a social setting, but this entire thing, like the bonfire and everything, moves that setting into the valley itself. So what I'm thinking is that eventually it'd be cool if people could leave gifts at each other's houses or something like that, but we're not gonna go there at this point. So maybe just show who's online and have them visible around the bonfire or something as we originally planned, but no need for any kind of mechanical experience boosts or stuff like that."

Became: V-BON-4, no couch and no company XP; who is online shows in the valley, their creatures around the bonfire; gifts at houses in `later.md`; the lounge mechanic scrapped (`scrap-list.md`).

### Q17. What decides where a creature works?

Status: answered, round 6 (2026-10-30). From the panel (finding 6, Joonas). Touches: `posts.md` V-POST-4, `scouts.md`, `forge.md`; content work per species (the compendium); a seam with combat v2 (what counters a boss).

**Why it matters.** In the draft, each post likes one element or role, and a creature that fits produces 25% more. The veteran reviewer called that sorting, not choosing: you match elements once and never look again. This decides whether placing creatures stays a real choice after the first evening, and whether each species you catch adds something new.

- **A. Fit by element**, as drafted. Simple, and solved once.
- **B. Species work perks.** Every species brings something of its own to work, as in Pokémon Sleep. Example: Mossback turns up pearls at water places; Sparkit brings double scrap but no Acorns. Each new species is a new option. Cost: a perk for each species (34 today).
- **C. B, plus weekly demand.** The week's raid threat, known from Monday, makes the finds and recipes that counter it worth more, so moving a few creatures before Friday pays off. Example: in a Cinder Wyrm week, Tide shards and Kelp gear are in demand, so Sanni moves her pearl-finder to the Tidepools on Tuesday.

**Lead's pick: C.** It gives a real decision, a reason to look again each week, and a value for every species caught (G-2). It also gives the valley the week-long role in raid preparation you wanted from the Watchtower (Q15), without a post. Cost: a perk per species, and combat v2's lab must say what counters each boss.

**Answer (2026-10-30): open; research asked for.** "This is honestly a tough one, and I guess it really matters where players find it fun. So, you know, the sorting versus matching or whatever argument that was raised doesn't really hold up if we just make it based on another stat instead of element or role or whatever... I just think it would be nice to have these creatures grow into some kind of an identity that they're good at something. And with the forge, I was thinking, well, what if we don't have a crafting level per creature that actually brews something, but they just get proficient with a single recipe? So then you could have the guy who crafts this item, and then you could have the other guy who crafts that other item. Might be too granular, not sure, but just trying to find a way that players still feel encouraged to do something else with their creatures. Instead of just having them in a single place all the time. But if research points that that's the best way to go, then let's do that. So maybe you can get back to me with more information."

Became: research on worker identity against rotation (`docs/research/`); asked again with the findings as **work-identity** at the head of the queue. Misa's point stands: matching on any single stat is the same sorting problem, so the answer has to come from how the identity grows, not which stat it reads.

### Q18. Should one missed day already slow the valley? (a challenge)

Status: answered, round 6 (2026-10-30). From the panel (finding 7, Sanni). Challenges: Misa's round 1 answer to Q3, "Daily check in for full exp is good, then drop in a few steps". Touches: `posts.md` V-POST-10, T-2.

**Why it matters.** With the steps as drafted, skipping one day puts the valley at half speed for that day. The casual reviewer called it "the you fell behind feeling I quit over". The research points the same way: absence should feel safe, and Pokémon Sleep deliberately avoided rewarding perfect daily schedules. Your reason for the steps, that someone back after a month shouldn't find a game they don't recognise, is about long absences, not one busy day.

- **A. Keep it: full for 1 day, then steps.** Every other day gets about 75%; once a week about 43%.
- **B. Full for 2 days, then steps** (half to day 4, a quarter to day 7, a tenth to day 30). Every other day gets everything; every third day about 83%; once a week about 54%.
- **C. Full for 3 days, then steps.** Once a week about 64%.

**Lead's pick: B.** A busy day costs nothing, so missing one never feels like falling behind, while daily players still lose nothing and the month-away drop you wanted stays as it is.

**Answer (2026-10-30): gentler.** "I think the drop to half is quite strong to begin with, so I would explore something like a 15% drop after 24 hours or 48 hours. The idea is that let the players keep a weekend off, so when they log in on Monday morning after the weekend, they'll not see a significant drop in economy. We'll run some numbers on that. I know Opus Miner does 15% decrease while you're offline... It could be good, and then go down from there. The instant drop to half is quite a lot."

Became: V-POST-10 with candidate curves in `posts.md` (A: full for 24 h then 85%...; B: full for 48 h then 85%..., the lead's lean: a weekend off keeps 97%, weekly about 79%, a month away about nine days of growth); T-2 restated; stores about three days so a weekend off fills nothing (the lead's call, from Misa's Q5 "keep the rewards rolling even longer"). The economy lab picks the curve.

### Q19. How does a creature grow into "the one who's good at something"?

Status: answered, round 7 (2026-10-30). Q17 again, with research (`docs/research/worker-identity.md`). Touches: `posts.md` V-POST-4 and V-POST-12, `forge.md`, `scouts.md`, the creature card.

**Why it matters.** You want creatures to "grow into some kind of an identity that they're good at something", and players to be "still encouraged to do something else with their creatures". The research found one pattern that serves both: mastery that is permanent, where mastering one thing opens something elsewhere, so moving on gains instead of loses (Final Fantasy's jobs, Kairosoft's management games). Per-item mastery (Melvor Idle) turns out to be the player's checklist rather than a unit's identity, and players complain about the number of counters. Hidden numbers and random-roll traits are disliked everywhere.

- **A. Per recipe, as you floated.** Each creature gets better at each recipe it makes. Example: Pip becomes "the Kelp Cap maker". Many counters, and it only covers the Forge.
- **B. Mastery per kind of work, with a signature and carry-over.** About four kinds (scouting, smithing, keeping, teaching), each shown as a badge on the creature. It fills fast at first. A mastered kind is permanent, earns a **signature** from what the creature did most (your "the guy who crafts this item", without a counter per recipe), and opens a small perk at another kind of post. The card then says "ready to learn something new". Moving is always free, and a species can lean toward a kind (learns it faster) without being barred from any. Example: Pip masters smithing in three weeks, mostly making Kelp Caps, and becomes "Pip, Kelp Cap smith": a little better at Kelp Caps for good. Sent scouting, Pip keeps all that and, as a master smith, brings home a little more scrap.
- **C. Species perks and earned titles.** Each species has one fixed work perk (Mossback finds pearls at water places), and each creature earns a title from deeds ("Far-Walker") that is flavour only. Easy to read, but it is the sorting you were wary of, and nothing asks a creature to move.

**Lead's pick: B.** It gives identity (badges and a signature you can name) and a reason to move (the carry-over perk and "ready to learn something new") with the fewest counters. It builds on the skill steps already in `posts.md`. The weekly demand idea from Q17 can still sit on top later, if the raid needs it.

**Answer (2026-10-30): B, mastery of the work in general.** "B sounds like a good way to go. Maybe not kelp cap mastery specifically but Smithing in general (though that was probably your proposal all along). A maximum level reached in a certain profession is a nice way of opening the floor for newcomers into the same profession."

Became: V-POST-12, mastery per kind of work (scouting, smithing, keeping, teaching) in three visible steps; a Master keeps the badge and title for good, gets a small perk at another kind of post, and its card says "ready to learn something new", so it makes room for a newcomer; no per-recipe signature.

### Q20. Where do numbers live, for players who want them?

Status: answered, round 8 (2026-10-30). From the return moment's panel (`reviews/2026-10-30-return.md`, finding 8). Touches: `return.md`, `posts.md`, the place scenes; `docs/design/review-brief.md` (fewer boxes, show don't tell).

**Why it matters.** The return walk now shows a story and never a number that could feel like a loss. The veteran reviewer pointed out that a player who likes to plan then has nowhere to see how fast a post works, why (fit, mastery, kit), when its store fills, or how far the next server project is. Sanni never needs any of it.

- **A. Only what the world shows.** Piles at posts, bubbles, badges and the places' looks. No numbers beyond counts.
- **B. Details inside each place.** Tap the Forge and its scene shows each anvil's pace and what makes it up, when its store fills ("full in 2 days 14 hours"), and the Forge's next project ("level 4: 70%, short on scrap"), always phrased as what happens next, never as what was lost.
- **C. B, plus one ledger screen.** A single overview of every post, rate and event since your last visit, one tap from the valley (a side panel on desktop).

**Lead's pick: B.** It gives planners everything at the place it belongs to, keeps the valley free of tables, and keeps your "fewer boxes" rule. C is a web form by another name.

**Answer (2026-10-30): B.**

Became: V-RET-9, numbers live inside each place, phrased as what happens next; no overview screen.

### Q21. Does the return walk ask you to prepare for the raid?

Status: answered, round 8 (2026-10-30). From the panel (finding 9: Joonas for, Sanni against). Touches: `return.md` V-RET-3 and V-RET-8, `defence.md`; Misa's Q15 answer ("we need to give players the entire week to prepare").

**Why it matters.** From Monday everyone knows the week's threat and its rule cards. The veteran wants "prepare for the raid" to be the week's most important decision. The casual player says rule cards are "reading I will skip", and a fight she wasn't in makes her feel behind. The walk ends at one decision, so this decides how often that decision is the raid.

- **A. Every visit until you've chosen defenders.** From Monday, the walk ends at the Watchtower until you place your creatures (unless a new species turns up).
- **B. Once a week.** The first visit after the threat is sighted ends at the Watchtower: the threat, its rule cards, and "choose your defenders". After that, the beacon simply stays lit.
- **C. Never.** The walk shows the threat on the horizon and the lit beacon; preparing is something you go and do.

**Lead's pick: B.** One clear nudge gives everyone the whole week to prepare, as you wanted, without the walk nagging a player who isn't joining this week.

**Answer (2026-10-30): B.**

Became: V-RET-3, the first visit after the threat is sighted ends at the Watchtower once a week; after that the beacon stays lit.

### Q22. What should the Forge make?

Status: answered, round 9 (2026-10-30). From the panel on scouts and the Forge (`reviews/2026-10-30-scouts-forge.md`, finding 2, all four reviewers). Touches: `forge.md`, gear (combat v2 owns gear's lines and stats), the bag.

**Why it matters.** A Forge that works all day makes far more gear than a roster can wear. Two anvils at today's pace would make 40 to 60 pieces a week; a player's fighting creatures have about 15 gear slots, full within days. The rest is dismantled (a chore) or fills the bag. So the question is what the Forge's steady work is _for_.

- **A. New gear, made slowly.** One piece takes most of a day, so two anvils make about three a day, and pieces worse than what is worn go straight to scrap if you tick a box (a salvage bin). Example: Sanni's Forge makes a few hats a week; the duds melt down by themselves.
- **B. New gear on order, and improving what is worn the rest of the time.** When there is no order, smiths improve the gear your creatures already wear, a little at a time (its item level creeps up). Example: Pip's old Kelp Cap slowly becomes a better Kelp Cap while Pip wears it. Today gear has no upgrades by design, so this is new.
- **C. B, plus parts for the server.** Smiths can also forge the beams, bolts and fittings the server's projects ask for, as a communal order (`commons.md`). Example: the Signpost's new road needs 40 iron fittings; Sanni's spare anvil makes them for a week.

**Lead's pick: C.** Improving worn gear turns the Forge's steady work into something you feel on your favourite creatures (identity, G-2), with no flood and no dismantling chore. Parts for projects tie the Forge to the server (G-4). It is a change to gear that combat v2 must agree to; A is the safe fallback if it does not.

**Answer (2026-10-30): a vision, with directions asked for.** Misa described his gear vision, inspired by Path of Exile: small fixed base stats, item level deciding how strong rolled modifiers can be, rarity deciding how many, "big rolls, big lottery", many chances to roll from the Forge's steady work ("give it a blueprint and say, hey, craft these until you find the best item"), the best results shown first and celebrated, no currency orbs at the start, improving existing items as a later Forge job, a bigger reward and more items than a bag of 60 can hold, and item level as quality only, with no level requirement to wear ("What determines item level? I don't know. Maybe it's a combination of many things... maybe tied to some kind of a server item level cap"). His full words are in `systems/gear.md`.

Became: `systems/gear.md` (the direction and what is open); research on item volume, item level sources, craft-until loops and keeping a lottery fun; directions come back as round 10.

### Q23. Should what you can craft depend on where your scouts are?

Status: answered, round 9 (2026-10-30). From the panel (finding 3: the owner's proxy against, Joonas and Pia for). Touches: `forge.md` V-FORGE-4, `scouts.md` V-SCOUT-2; Misa's original Forge idea (2026-10-29).

**Why it matters.** Today a common piece costs scrap and one shard of its element, and shards come only from that element's places. Scrap will be plentiful, so shards are what the Forge actually waits on. That links where your scouts are to what your smiths can make. Your first description of the Forge was exactly this: players "wouldn't have to intervene unless their workers are in the wrong positions and the workshop is lagging behind".

- **A. No: common pieces cost scrap only.** Shards are needed only when reaching for a better rarity. Scouting and crafting stay mostly separate. Example: Sanni chases a Reef creature with lures, and her Forge never minds.
- **B. Yes: each piece needs a shard of its element.** The Forge says "waiting for Reef shards" inside its scene, and the fix is one tap (move or re-kit a scout, or change the order). Example: Sanni orders Kelp Caps while both scouts are in the Ember Caves; the Forge slows and suggests the Tidepools.

**Lead's pick: B.** It is your original idea, and it is what makes where a scout stands matter all game, not just until the collection is done. The research's conditions for a fun chain hold: the bottleneck is named, the fix is one tap, and nothing stops dead (the smith tinkers meanwhile). A is calmer but leaves scouting and crafting as two separate lists.

**Answer (2026-10-30): B, with stockpiles.** "I think we do need to build some kind of a production chain here. So depending on the blueprints that you're crafting, you should be able to source those resources from somewhere... if you're waiting for Reef shards, then you need to have explorers out in the Reef finding those Reef shards for you. Or then maybe you've stockpiled a lot of them up and then you just want to use them, then sure, let's go."

Became: V-FORGE-4, the Forge waits on the element shards its orders need, named inside its scene, with the one-tap fixes; a stockpile of shards carries an order without scouts at that place.

### Q24. How do a lot more items fit, and which go away by themselves?

Status: answered, round 10 (2026-10-30). From Misa's gear vision (Q22) and research (`docs/research/gear-lottery.md`). Touches: `gear.md`, `forge.md`, the bag (today 60 items, worn ones included).

**Why it matters.** You want many more rolls, and a roster of 20 or more creatures already fills a bag of 60 with what it wears. Diablo IV's lesson was "spend more time obliterating and less time sorting"; idle players' worst story is losing a great item to a bag full of junk.

- **A. A bigger bag, sorted by hand.** Example: the bag holds 200; you dismantle what you don't want.
- **B. Worn gear off the bag, plus a keep rule.** Items a creature wears don't count. The Forge's batch comes home best first, and pieces that are neither an upgrade nor carry a strong roll melt into materials on arrival, by a sensible default rule you can change. Rare and epic pieces and anything with a 4- or 5-pip line are never melted and never lost to a full bag. The same rule is what "craft until" stops on. Example: Sanni's Forge made 20 Tide Scarves this week; she sees the best three, one an upgrade for Mossback; the other 17 became scrap and shards.
- **C. B, but you set every rule yourself** (a loot filter, Last Epoch style).

**Lead's pick: B.** It keeps the lottery's thrill (the best first, nothing good ever lost) and removes the sorting chore, with no setup needed. The rule can be changed by anyone who cares to.

**Answer (2026-10-30): worn gear off the bag, a bag of 200, and tools instead of rules.** "Let's make the bag not count worn items... 200 is fine. And then we need to give players more control over the bag... we don't have any filtering or searching or sorting of any kind... make these basic filter controls, so you can filter by rarity, you can sort by rarity, you can sort by item levels, you can find the item with the most attack or speed or crit chance, or find items from gear modifier rolls... bring back the options to just, you know, destroy common items or destroy items in bulk... filter to see only common items and only items whose item level is below a certain threshold... select all and delete those items, dismantle them... The loot filter rule is kind of cool, but it's ultimately made for an even bigger item type of thing... over here, there's like no game being played behind the scenes... What we can do is build a system that visually highlights the items that are actually exciting... a common item with a high item level is more valuable than an epic item with a low item level." Also: stats on hover rather than a drawer per click ("the stats comparing is really good"), and a flow from the creature's side to find its best item.

Became: V-GEAR-6 and V-GEAR-7 in `gear.md`.

### Q25. What sets an item's level, now that it means quality only?

Status: answered, round 10 (2026-10-30). From Misa's gear vision (Q22: "maybe a combination of many things... tied to some kind of a server item level cap... increase this slowly"). Touches: `gear.md`, the raid (Boss Rank), the dungeon, the Forge's server level; combat v2 (how strong a modifier tier is).

**Why it matters.** Item level decides how big the rolls can get, so it is the long-term ladder of the whole gear chase. The research found nothing on server-wide caps that rise in other games: it's a bet. The one clear lesson is that hard gates on progress annoy players (Diablo IV removed its world-tier level gates within days).

- **A. Each source sets its own.** A smith's level at the Forge, the depth in the dungeon, the Boss Rank in the raid. No server cap.
- **B. The source sets it, under a server cap that rises.** Nothing made or found goes above the server's item level cap. The cap rises a step with each raid win and slowly with time even for a server that struggles, never falls, and is shown at the Forge with its next step. Example: the cap reaches 12 after Sunday's win; Monday's batch can roll 12s, and the Forge shows "next: 13".
- **C. The server cap alone.** Everything made or found is at the current cap.

**Lead's pick: B.** It is your combination, and it turns each raid win into a moment the whole server feels at the Forge on Monday. The slow rise with time keeps a struggling server from stalling. We would watch it closely, since no game has proven it.

**Answer (2026-10-30): B, tried and watched.** "Do players actually feel like it's a good thing that they're all progressing together to defeat bosses and then unlock higher item levels? Or will they just feel like... this perfect craft that I finished last week already is kind of outdated. Maybe not... So I am a bit skeptical, and I would like to encourage players to rather roll for new items and craft new items as time goes on. So maybe option B here is the one that does feel best, or something that we could try. How much of a difference going from item level 12 to item level 13 makes, I honestly don't know. There might be a reason why Path of Exile has item levels that go up to like 100, and there's bigger gaps between each item."

Became: V-GEAR-8; the scale asked as Q27.

### Q26. Should the lottery have a floor? (a challenge)

Status: answered, round 10 (2026-10-30). Challenges: Misa's "Big rolls, big lottery. It's based on luck... the perfect item would obviously be just down to luck" (Q22) against F-10 (light, fun and predictable) and the research. Touches: `gear.md`, `forge.md`.

**Why it matters.** Pure luck can mean weeks of misses for a casual player, which the research ties to the slot-machine feeling players resent. Pity floors are widely approved (86.9% in one survey) and every recent crafting overhaul (Last Epoch, Diablo IV) removed loss and dread while keeping the jackpot random.

- **A. Pure luck.** Visible odds, no floor.
- **B. A soft floor per blueprint.** A bar fills with each piece made; when full, the next piece is guaranteed a strong line (example: one 4-pip line within 30 pieces). The perfect item, five pips on every line of an epic, stays pure luck.
- **C. B, plus misses that add up.** Every melted piece also adds to a small bar that pays a bonus (example: a free reach for Rare).

**Lead's pick: B.** It guarantees a good result, not the best one, so the jackpot stays luck and every week still has a win to show. It's a counter, not an orb, so it fits "no orbs at the start".

**Answer (2026-10-30): no pity floor; partial wins and a consolation instead.** "I do like the mechanic of pity timers, but then that would just make good rolls more guaranteed... kind of like not a fan of introducing a pity timer into this particular mechanic, but I would love to be proven wrong... it could be a cool idea to just add more lines to the gear... if an epic rolled four lines or five lines, maybe we could have three good lines out of those five... There needs to be some sort of determinism here... maybe lock some modifiers out... the slots themselves either just exclude or include rolls, but they don't favor rolls based on slots. Favoring can be done by elements... should we just exclude modifiers from elemental gear as well? So a Tide scarf would only roll Tide modifiers... if you craft junk, and you dismantle junk, you'll increase your blueprint quality... that's acting as a consolation prize... lots of scalars here that we can tweak." He asked how Path of Exile does it: it has no floor; its control comes from currency and a deterministic crafting bench.

Became: V-GEAR-9; blueprint quality (marks) restored as the consolation (`forge.md` V-FORGE-8 and V-FORGE-9); line counts asked as Q29, element pools as Q28.

### Q27. How long should the item level ladder be?

Status: answered, round 11 (2026-10-30). From Q25 ("How much of a difference going from item level 12 to item level 13 makes, I honestly don't know. There might be a reason why Path of Exile has item levels that go up to like 100"). Touches: `gear.md` V-GEAR-8; combat v2 (line values per tier).

**Why it matters.** Today item level runs 1 to 20, and each modifier tier unlocks at 1, 5, 10, 15 and 20. With a server cap that rises, the ladder's shape decides how a rise feels: a small number creeping up, or a big moment. It also decides your worry, whether last week's perfect craft becomes outdated. In Path of Exile, item level runs to about 100 and each modifier tier has its own item level threshold, so most levels change little and a threshold is a jump.

- **A. Keep 1 to 20.** The cap rises a level at a time; each level matters a little. Example: the cap goes from 12 to 13, and the new pieces are a bit better.
- **B. A longer ladder with thresholds.** Item level runs to about 100; the cap rises often in small steps; each modifier tier (pips 1 to 5) unlocks at a threshold, so only a threshold makes old pieces look dated. Example: the cap climbs from 58 to 61 over a week of raids; at 60 the Forge announces "4-pip lines can now roll".
- **C. A few grades.** Item level is a short list of named grades (Plain, Fine, Masterwork...) that the cap unlocks one by one.

**Lead's pick: B.** Small steps give the server something every week, and the big moments come at thresholds everyone can see coming. A perfect piece only falls behind at a threshold, so "the craft I finished last week is outdated" stays rare.

**Answer (2026-10-30): B, and a step can be several levels.** "Longer ladder is good. And we could even do it in a way where a win doesn't necessarily increase the max item level by just one. It could go up multiple levels, whatever seems fit." With it, about the cap: "let's give players the option of raising the item level cap in a multitude of ways... making the track for upgrading the item level cap something that's based on generally improving the valley or improving the player's own levels... not just a fixed relationship to the raid. Because that would just mean that if players can't beat the raid, tough luck... maybe it can be building upgrades that are done by resources or these really rare dungeon finds that players have to collect five of different types, like a Stardew Valley type of thing where you upgrade the community house... the more intertwined they are, probably better... I do have a lot of trust in your ability to figure these out and then just stick to systems that make sense intuitively for players."

Became: V-GEAR-8 (the ladder to about 100 with tier thresholds; steps of several levels) and V-GEAR-10 (the cap raised by many systems, designed with the commons).

### Q28. Should an element's piece roll only its own element's lines?

Status: answered, round 11 (2026-10-30). From Q26 ("should we just exclude modifiers from elemental gear as well? So a Tide scarf would only roll Tide modifiers"). Touches: `gear.md` V-GEAR-9, `gear-lines.json`; combat v2.

**Why it matters.** Today each line has a weight per slot (0 means it never rolls there), and an element piece makes its own element's lines three times as likely. You asked for slots to include or exclude lines without favouring, and wondered whether element pieces should be exclusive. This decides how well a player knows what they're chasing, and it ties straight into the chain: scout the Tidepools, get Tide shards, craft Tide pieces.

- **A. Elements favour.** An element piece rolls its own element's lines more often (as today), and other elements' lines rarely.
- **B. Elements own their lines.** An element piece rolls its own element's lines and neutral lines, never another element's. Example: a Tide Scarf can roll Tide damage but never Ember damage.
- **C. No element lines on pieces.** Elements only change the base; every piece rolls from the slot's neutral pool.

**Lead's pick: B.** It is the determinism you asked for: a player who wants a Tide line knows to craft Tide pieces, and the whole chain from scouting to crafting points at one goal. Neutral lines keep every piece useful to any creature.

**Answer (2026-10-30): B.** "The most logical and intuitive system for a player would be that elements own their own lines. But this would also mean that so far we've been giving out Ember gear from Ember Caves all the time, that we would also be dropping gear that's neutral or rarer, other elements maybe less often from Ember Caves... Further systems in the future could maybe open up the ability to craft other gear lines onto different elements... Wouldn't look into it too much right now."

Became: V-GEAR-11: an element piece rolls its own element's lines and neutral lines only; places and bosses drop mostly their element's pieces, plus neutral pieces and now and then another element's; cross-element lines are a later idea.

### Q29. How many lines should each rarity roll?

Status: answered, round 11 (2026-10-30). From Q26 ("if an epic rolled four lines or five lines, maybe we could have three good lines out of those five"). Touches: `gear.md` V-GEAR-9, `RULES.gear.rolledLines`; combat v2 (line values must shrink if pieces carry more lines).

**Why it matters.** Today a common rolls 1 line, a rare 2 and an epic 3. More lines make partial wins common (a piece with a few great lines and some duds), which is your answer to having no pity floor. But more lines means more power per piece, so combat v2 has to scale line values down to match.

- **A. Keep 1 / 2 / 3.**
- **B. 1 / 3 / 5.** An epic has five chances; three great lines make it great. Rarity matters a lot.
- **C. 2 / 3 / 4.** A smaller gap between rarities; every piece has a little something.

**Lead's pick: B.** It is your "three good lines out of five", it makes an epic a real event, and it gives a lot of partial wins along the way. The line values are combat v2's to tune.

**Answer (2026-10-30): B, 1 / 3 / 5.** "Definitely more than today... 1, 3, 5 is good, so rares are already really good at that point, and then epics at 5 are actually a really exciting drop."

Became: V-GEAR-12; the line values are combat v2's to scale.

### Q30. One project at a time for the whole valley, or one per place?

Status: answered, round 12 (2026-10-30). From the commons panel (`reviews/2026-10-30-commons.md`, finding 1: the owner's proxy and Pia). Touches: `commons.md` V-COM-5, the fire (V-COM-13), T-3.

**Why it matters.** The server's giving is one pot (about 150 Acorns' worth a day for 8 players). Split over five places' project boards, every place crawls: by week 12 each would be at level 2, and the fire that place levels warm would barely move. One project at a time puts the whole server behind one visible build.

- **A. Every place has its own open project.** Players pick where to give; progress is spread thin. Example: by week 12, five places at level 2.
- **B. One project at a time for the whole valley,** in an order shown in advance. Everyone's gifts and communal seats go to it. Example: "Now building: the Forge's second chimney (70%). Next: the Signpost's new road." By week 12, about five level-ups (two places at level 3).
- **C. One at a time, and the server chooses the next.** When a project finishes, the next is the place most givers pointed their gifts at during the last one, a quiet vote with no deadline.

**Lead's pick: B.** One shared build is easy to see and rally around, it is what makes "the server built this" feel real, and it fixes the pace and the hoarding hole together. C adds a choice, but also a vote someone can lose; it could come later.

**Answer (2026-10-30): A, every place its own project, with a guided start.** "Players on the Discord server would just communicate on what they want to figure out first and focus on. They can build all five at the same time, and kind of reap less benefits if they all finish by week 12. Or they could pool their resources into one... Not sure if we need a valley level or something to keep the Forge from becoming level 10 before some Watchtower still sits at level 1. Or maybe that's the fun of it... let's not take the agency out of players' hands by holding their hand through this stuff. It could be a good idea to have this sort of a new player experience where the very first levels of these buildings are built within one or two or three weeks, and those could be handheld, so players start off with a single type of a shared building that's being upgraded, and the first level doesn't necessarily have to be quite big... then as each building has increased its level, or maybe the first two buildings have been increased by one level, then the remaining buildings that can still be increased would open up... and discuss it together."

Became: V-COM-5 and V-COM-15 in `commons.md`: every place has its own open project and players choose together; a new server starts with one small project, a second opens when it is done, and the rest open once those two have levelled. A place's max level (V-COM-11) already keeps one place from running far ahead. Each place builds for three days between its levels (the hoarding guard), so a hoard raises at most one level per place.

### Q31. When your creature helps build the server's project, does that cost you one of your own seats?

Status: answered, round 12 (2026-10-30); reworded after Misa asked for it to be opened up. From the commons panel (finding 13: Sanni against a cost, Joonas for one). Touches: `commons.md` V-COM-14, `posts.md` V-POST-13.

**What it is about.** At each place you have a few seats of your own: for example 2 scout seats at the Signpost and 2 anvils at the Forge. Creatures there work for **you**. A **communal seat** is a place's seat where your creature works for the **server's** project instead: it hauls timber for the Forge's new chimney, mends the road for the Signpost's next level, and so on. The creature still earns its own XP and mastery. The question is where that communal seat comes from.

- **A. An extra seat, on top of yours.** Every player gets one communal seat per place in addition to their own seats. Putting a resting creature from the bonfire there costs you nothing. Example: Sanni keeps both her scouts at the Tidepools, and also sends Sprout, who was resting at the bonfire, to haul for the Forge's chimney.
- **B. One of your own seats, turned to the server.** Helping means giving up some of your own output. Example: Sanni has 2 scout seats; to help the Signpost's road she turns one of them into a road mender, so she finds half as much at the Tidepools until she turns it back.

**Lead's pick: A.** It is the gentlest way a player who plays less still helps build, and it gives resting creatures a job. The real "my valley or our valley" choice already lives in where your Acorns go. B makes helping cost something, which the veteran reviewer liked, but it can make a casual player feel she is choosing between herself and her friends.

**Answer (2026-10-30): A, an extra seat.** "Let's make it like a communal seat. It's a good idea that way. I cannot comment on whether assigning creatures to work for the community like this is something that's cool. Probably not. Who knows? If you feel like building it, then let's just roll with it. But what I do want to say here is that let's absolutely keep any such initiatives something that doesn't take away personal progression."

Became: V-COM-14 (an extra seat per place, never one of the player's own); filter F-11 in `goals.md` (co-op never takes away personal progression); communal seats marked to be tested for fun in the phase 3 prototype.

### Q32. What should come next?

Status: answered, round 13 (2026-10-30). The question queue is empty apart from **targets** (which waits on the economy lab). Touches: `roadmap.md`.

**Why it matters.** Phase 1 (the base systems on paper) has every system drafted, reviewed and mostly decided, except the School, which waits on combat v2's talents. Almost every number in the docs is still an example. The combat v2 session is tuning its bosses against our placeholder numbers until our economy lab can give real ones.

- **A. Build the economy lab now (phase 2).** A deterministic simulation of these rules over 12 to 24 weeks, for daily, weekly and new players on servers of 5, 8 and 15. It checks the targets, finds where the numbers break, and gives combat v2 the roster profile it needs. The School joins it later.
- **B. Design the School first,** together with the combat v2 session, so phase 1 is complete.
- **C. Prototype the feel first (phase 3).** The return walk with a scout, the Forge and the bonfire on staging, to see whether it reads like a story before tuning numbers.

**Lead's pick: A.** The panels kept finding number problems (Acorns compounding, gear flooding, the commons' pace), and only a simulation settles them. It also unblocks the combat v2 session. The School and the prototype come right after.

**Answer (2026-10-30): A.** "The economy simulation building would be something that could work out as I travel home from work... I'm interested in seeing what kind of resources we have, how they interact. What's used for what, and understanding that kind of a system." His open thinking, recorded for the resources question: "in a game like this we're going to need to be interacting with a lot of resources and those resources need to have some kind of relative value against each other... And on the other hand, my understanding of game economies is that the less resources you have, the better. Or especially resources that kind of track progress... maybe there's different resource types... part of them are from the game world itself, and they're used to actually upgrade buildings in there. And then other resources are maybe these superficial and more abstract, acorns that just come out of the daily income or loot." On pacing: "players have things that they feel are progressing and they're not limited by or being starved of resources or things to upgrade. But then at the same time, having content for longer play sessions... it's a co-op idle game. And it's meant to be taken slowly." On the School: "the school is so dependent on what comes out of the combat rework... What do we want to teach in a school? Or is the school building even necessary? Is it a dumb way to do things that I just came up with because it felt cool?"

Became: phase 2 starts: the resource map (`economy/resources.md`) and the economy lab (`economy/model.md`, `packages/econ`). Two new queue entries: **resources** (how many, which kinds) and **school** (keep, fold or scrap).

### Q33. Which resources should the valley keep?

Status: answered, round 14 (2026-10-30), with the lab's first report and the charts on the phone page. From the **resources** queue entry (Misa's two instincts in Q32). Touches: `economy/resources.md`, `forge.md`, `commons.md`, `scouts.md`.

**Why it matters.** Today the plan has ten numbers a player spends (Acorns, scrap, five kinds of shard, glimmer, Essence, medals). The lab shows most of them piling up with too little to spend on: by week 24 a daily player holds about 14 weeks of scrap income, 12 of shards, 10 of glimmer and 12 of Essence, and Acorns run out of things to buy by week 8. The research finds no limit on how many resources players accept, but says: give each one a clear source, a clear use and a place in the world, and cut or merge any that do the same job (`docs/research/resource-design.md`).

- **A. Three kinds, each with one job.** Acorns for your own valley (seats, kit). Scrap and shards from the world, for the Forge and the server's buildings: projects are built from materials plus Acorns, which gives the piles a use. Essence, the prize from fights, for creatures (evolution, Reach). Glimmer goes; journal pages stay as lore and collection pieces, never spent. Example: the Signpost's next level asks for 600 scrap, 80 Tide shards and 300 Acorns, and you can see the scaffolding fill with crates of scrap.
- **B. Fewer still.** Acorns plus one material (scrap). Shards, glimmer and Essence go; evolution costs Acorns. Example: everything you see is either Acorns or scrap. Simpler, but where your scouts are no longer matters to the Forge (it undoes Q23).
- **C. Keep all six kinds and give each more uses.** Example: glimmer buys hats, Essence buys a creature's second evolution branch. More to collect, more to explain.

**Lead's pick: A.** It is your own split ("part of them are from the game world itself, and they're used to actually upgrade buildings... and then other resources are... acorns"), and it turns today's biggest problem, the piles of scrap and shards, into the server's building material. Acorns also need more to spend on later in the season (the lab tunes this).

**Answer (2026-10-30): A.** "33 A is good and we can look at introducing glimmer type resources when we actually have a use for them."

Became: three kinds of spendables (`economy/resources.md`): Acorns for your own valley; scrap and shards from the world for the Forge and the server's buildings (projects are built from materials plus Acorns); Essence for creatures. Glimmer goes; a new resource is added only when it has a use. Journal pages are never spent.

### Q34. Shards of the right element: keep the wait, but smarter? (a challenge)

Status: answered, round 14 (2026-10-30). Challenges: Q23 ("if you're waiting for Reef shards, then you need to have explorers out in the Reef"). Touches: `forge.md` V-FORGE-4, ribbons, `scouts.md`.

**Why it matters.** You decided that each piece the Forge makes needs a shard of its element. The lab shows the cost: a daily player's Forge makes pieces only about half the time and waits for a shard the other half, even while shards pile up overall, because they are the wrong element. A player who never moves their scouts also has creatures stuck at a ribbon (levels 10 and 20) for want of their own element's shards. More elements are coming, which makes this worse.

- **A. Keep the wait, make the Forge smarter.** "For my team" orders make pieces for the elements you have shards for first, and only wait when nothing can be made; ribbons take shards of any element. Where your scouts are still decides what you can make. Example: Sanni's scouts are in the Ember Caves, so her smiths make Ember pieces for her team, and the Forge suggests the Tidepools for the Tide pieces it can't make yet.
- **B. Keep the wait, add a swap at the Forge.** Three shards of any element trade for one of the element you need, at the Forge. Example: Sanni trades 3 Ember shards for a Tide shard with one tap.
- **C. Drop the element from shards.** One kind of shard; where your scouts are matters only for creatures and rare finds. Simplest, and the problem goes away, but it undoes your production chain.

**Lead's pick: A.** It keeps your chain (scouts' places decide what the Forge makes) while a hands-off player's Forge never sits idle when it could make something. B adds a conversion to explain; C undoes Q23.

**Answer (2026-10-30): B.** "B sounds best. What better way to create relationships between currencies than a currency exchange. This paves the way for things like visiting traders or even permanent upgrades that offer better exchange rates. Currency exchange crits are also a fun idea."

Became: V-FORGE-10, a shard exchange at the Forge (example: 3 of any element for 1 of the one you need, with a small chance of a bonus); visiting traders and better rates as later ideas (`later.md`). The lab checks whether a hands-off player's Forge still stalls; if it does, the smarter ordering of option A is raised once as an addition.

### Q35. How far behind should a once-a-week player be? (a challenge)

Status: answered, round 14 (2026-10-30). Challenges: T-2 ("a weekly player gets most of a daily player's idle growth, about 75% to 80%") against Q3 ("our other systems will keep bringing players back organically because their storages likely fill up"). Touches: `bonfire.md` V-BON-2, `posts.md` V-POST-5, `goals.md` T-2.

**Why it matters.** The lab says a player who opens the game on Sundays only gets about half a daily player's creature growth (51%), not the 75% to 80% we aimed for, and their scouts bring home 41% of a daily player's finds. The idle rate itself does give 79%, but daily players also get catch-up every day (it runs only in the 24 hours after a visit) and fight more. Your two goals pull apart: full stores are meant to pull players back, yet weekly players were meant to stay close.

- **A. Accept it: weekly players grow at about half the pace.** Change T-2. Example: Juho's best creature is level 25 at week 12, against Sanni's 29; Juho's 10th is about 9 levels behind Sanni's.
- **B. Close the growth gap, keep the finds gap.** Catch-up lasts until the next visit instead of 24 hours, so a weekly player's creatures grow at about 75% of a daily player's, but their scouts still stop picking up when the stores fill. Example: Juho's creatures are close to Sanni's, but Sanni has more scrap, finds and new creatures, because she looked in every day.
- **C. Close both.** Stores hold a week, so a weekly player brings home almost everything too. Example: Juho misses almost nothing, and there is little pull to look in more often than once a week.

**Lead's pick: B.** It keeps both of your goals: a weekly friend's creatures can still raid with everyone (growth is fair), and looking in daily still pays in things, not levels (the stores' pull you wanted). The lab checks it against the target before anything is changed.

**Answer (2026-10-30): B.** "35 B"

Became: V-BON-2, catch-up's multiplier holds until the next visit (not 24 hours); T-2 keeps its 75% to 80% growth target, and the finds gap (full stores) stays as the pull to look in more often.

### Q37. Should what the server builds move the item level cap, or mostly time? (a challenge)

Status: answered, round 15 (2026-10-30). Challenges: Q27 (the cap "fed by many systems", building upgrades and rare finds like a Stardew community house) against the panel's time floor (V-COM-13). Touches: `commons.md` V-COM-13, `gear.md` V-GEAR-8 and V-GEAR-10.

**Why it matters.** The lab tuned the Forge's fire (the item level cap) to the plan's numbers: about 50 at week 12 and not past the gear ladder's end (about 100) before week 24. The only way it found was to let the weekly time floor do almost all the work and shrink what building, collections and boss kills add to a quarter. Now a server that kills every boss and one that kills none have almost the same cap (the fire chart: the three lines sit on top of each other). Your Q27 answer wanted many systems to feed it.

- **A. Mostly a clock.** The cap rises steadily for everyone; building and bosses add a little. Example: every server reaches item level 50 around week 11, whatever it does. Predictable and fair to quiet servers, but building doesn't change your gear.
- **B. Building drives it, with a slow floor.** The floor rises slowly (example: about half today's pace) and building, collections and boss kills add most of the heat. Example: a busy server reaches 55 at week 12, a quiet one 35; a server that can't beat a boss still moves, just slower.
- **C. No floor.** Only building and kills warm the fire. Example: a server stuck on a boss and not building stays at 30 for weeks.

**Lead's pick: B.** It is what you asked for in Q27 (everything the server builds or beats makes better gear), while the slow floor keeps a struggling server moving (F-7). The tuner then sets the numbers so a busy server stays under 100 before week 24.

**Answer (2026-10-30): B, with doubts about the clock.** "37 B but honestly I'm skeptical of the clock."

Became: V-COM-13, building, collections and boss kills drive the Forge's fire, over a slow time floor. Because of Misa's doubt, the lab reports the slow floor and no floor (C) side by side, so the floor can be dropped if a quiet server still moves without it.

### Q38. How fast should a collection grow?

Status: answered, round 15 (2026-10-30). Touches: `scouts.md` (creature finds), T-1 in `goals.md`, combat v2's roster profile (`roadmap.md`).

**Why it matters.** To keep a player's 10th creature close to their 3rd (T-1), the tuner nearly doubled how often scouts find creatures. Now a daily player owns about 19 kinds at week 4, 47 at week 12 and 81 at week 24 (of 106 in the game by then, with 12 new species every 4 weeks); a weekly player about 10, 30 and 55. The plan's example was 15 at week 4, and combat v2 tunes its bosses for about 36 creatures at week 24. More finds mean more "new creature!" moments, but also more duplicates and less to look forward to.

- **A. Slower, like the plan.** About 15 at week 4 and 30 at week 12; the 10th creature catches up through faster growth instead (catch-up). Example: a new species is an event every few days.
- **B. As tuned.** About 20 at week 4, 45 at week 12, 80 at week 24, owning about three quarters of what exists. Example: most visits in the first weeks bring someone new; later, new species drops are what you chase.
- **C. Faster.** Almost everything that exists within a few weeks of its release. Example: each content drop is caught within a fortnight.

**Misa's follow-up (2026-10-30):** "are these unique creature species or individual possibly duplicate finds?" Lead: unique species (kinds owned). Duplicates come on top, about one a visit for a daily player and one or two for a weekly one, and settle by themselves after a day (V-SCOUT-3).

**Lead's pick: B.** It keeps something to chase (about a quarter of the species are always still out there, and each drop adds more), and the first weeks feel generous. If you pick it, the combat v2 session gets the new roster sizes before tuning against them.

**Answer (2026-10-30): commons fast, rarer creatures slower.** "It seems like an awful lot. On the other hand we do want players to catch a lot of species so they can create combinations of creatures to answer raid boss challenges. Maybe it's still too much. Could we have a good set of common creatures that are found at the 'week 4 pace' but then make it slow down as rarer creatures are harder to find? They shouldn't be essential to find for boss cards, just offer more variety."

Became: V-SCOUT-12, creature finds by rarity: commons at about the plan's pace (about 15 kinds at week 4), rarer species slower; rare and epic species are mostly variety. Follow-up the same day: "it's okay to require a rare here or there because players will be able to pool their rarer creatures together in the raid roster. A 100% common requirement is too limiting in design space", so a boss may now and then need a rare the server can pool. The lab tunes the odds.

### Q39. Ribbons: drop them, or trials as an honour?

Status: answered, round 15 (2026-10-30), after the panel (`reviews/2026-10-30-trials.md`). From Misa's reply to Q36. Touches: `systems/trials.md`, today's ribbons, T-1, T-7.

**Why it matters.** You suggested replacing material-gated ribbons with trials: a checklist across the valley's systems, shown from day one, with a graduation. The panel does not hate it; all four reviewers say "adopt with changes", and all four make the same main change: a trial must never stop a creature's levels. The lab agrees: ribbon gates cost a daily player about a quarter of their creatures' idle growth in the first 12 weeks, and hold back the bench, not the best creatures. They also warn that fight-only boxes can't work (3 raid seats a week against 50 creatures) and that a ceremony at a set time feels like a timer.

- **A. Drop ribbons entirely.** Levels just flow. Example: Pip goes from 9 to 31 without stopping. Simplest; nothing replaces the story.
- **B. Trials as an honour.** Levels never stop. Each creature has a next trial (Bronze, Silver, Gold) of three boxes, each with a choice of routes (a dungeon run or Skilled in any work; a raid or a week at posts; an Epic piece or a rare find). Ticked boxes lead to graduation at the bonfire's daily ceremony, whether or not you are there, told in the return walk. The reward is a badge, a title and a ribbon worn on the sprite. Example: "Pip graduated Silver: stood guard in the raid, made a Rare scarf, pushed on into the deep Reef."
- **C. Trials as a gate.** As B, but a creature stops at levels 10 and 20 until it graduates. Example: Pip waits at level 20 until it has taken part in a raid or worked a week at posts.

**Lead's pick: B.** It keeps what you liked (the systems tied together, the list visible from day one, graduation) without a wait on 50 to 80 creatures, and gives each creature a story on its card. C keeps the waste the lab found; A loses the story.

**Answer (2026-10-30): drop the ribbon gates; trials as honours (B), with combat feats per tier.** On ribbons: "I do feel like the ribbon system is an awful lot of work for essentially... nothing. Let's drop it." On trials: "The honours system is kind of cool, despite what I previously said about dropping them. Let's make the bronze ribbon touch on many game systems but still be quite easy to attain. The combat part can be tuned in each one. Clearing a dungeon for bronze, clearing Undercroft (or 2+ levels, depending on balance) for silver and clearing a raid for gold. If we don't gate any progress behind ribbons, there shouldn't be an issue of requiring rare combat feats for them."

Became: `systems/trials.md` accepted: no gates; Bronze, Silver and Gold as honours, each with one combat feat (a dungeon clear, an Undercroft clear or two levels deep, a raid clear) plus boxes from the valley's other systems; Bronze easy and broad. Misa's point overrides the panel's "no fight-only boxes": that worry was about gates, and an honour may be rare.

### Q40. Drop the time floor under the item level cap?

Status: answered, round 16 (2026-10-30). Follow-up to Q37 ("honestly I'm skeptical of the clock"). Touches: `commons.md` V-COM-13.

**Why it matters.** The lab now compares the slow floor with no floor on the same servers. While a server builds, the floor changes nothing: building and boss kills carry the fire (week 12: 45 with the floor, 44 without, for a server that kills its bosses). It only matters to a server that never kills a boss: at week 24 its fire is 53 with the floor and 40 without, and it still rises slowly from building either way.

- **A. Keep the slow floor.** A stuck server's gear keeps improving with time. Example: a server stuck on one boss for two months still reaches item level 53.
- **B. Drop it.** Only building, collections and boss kills warm the fire. Example: the same stuck server reaches 40, and its fire rises only when it builds or wins. One system fewer to explain.

**Lead's pick: B.** The numbers say the clock does almost nothing for an active server, a stuck server still moves through building, and you doubted it. If a quiet server feels stuck in the live game, a floor can come back later as a catch-up for servers far behind.

**Answer (2026-10-30): B.** "40 B"

Became: V-COM-13, no time floor: only building, collections and boss kills warm the Forge's fire. A floor can come back later as a catch-up for servers far behind if the live game shows one stuck.

### Q41. Should most creatures earn Bronze, or only the ones that fight?

Status: answered, round 16 (2026-10-30). Follow-up to Q39 ("make the bronze ribbon touch on many game systems but still be quite easy to attain"). Touches: `trials.md` V-TRIAL-2.

**Why it matters.** Bronze needs a dungeon clear, and a dungeon team is three creatures a day. In the lab a daily player who never changes the team has only about 1 creature in 20 with Bronze at week 24: the same three fight every day. A player who rotates the team every day gets Bronze on about half the roster, but that is a daily chore.

- **A. Keep it.** Bronze goes to creatures you take to the dungeon; rotate to earn more. Example: Sanni's best three have Bronze; the rest don't.
- **B. A learner's place in the dungeon.** Each run takes one extra creature along that doesn't fight and ticks its dungeon box. The valley suggests one (the one closest to Bronze), so it is one tap or none. Example: "Sprout came along to watch the Cave run, and earned its Bronze."
- **C. Bronze's combat box takes any fight or a week at posts.** Example: Sprout earns Bronze after a week at the Forge.

**Lead's pick: B.** It keeps your dungeon clear in Bronze and makes it easy, one creature a day without changing the team, and it gives the dungeon a small daily moment. Silver (the Undercroft) and Gold (a raid) stay for fighters.

**Answer (2026-10-30): A.** "41 A (players will learn that two creatures can tutor a lower level third for its ribbon, and eventually I might want to implement the dungeon difficulty picker too)"

Became: V-TRIAL-2 unchanged: Bronze's combat box is a dungeon clear with the creature in the team; two strong creatures can carry a lower-level third. A dungeon difficulty picker is a later idea (`later.md`).

### Q42. What should players spend their surplus on?

Status: answered, round 16 (2026-10-30). From the lab: target T-7 ("nothing only piles up") is the one target the tuner cannot meet. Touches: `economy/resources.md`, `later.md` (cosmetics), `forge.md` (traders), the research's "in a slow game, hoarding is the likelier failure" (`docs/research/resource-design.md`).

**Why it matters.** With ribbons gone, a daily player earns Acorns, scrap and shards two to three times faster than anything takes them. By week 10 a daily player's Acorns are about 25 weeks of their spending, scrap 22 and shards 14. The tuner tried every price and rate: making things dearer hits the Forge's limits (anvils can only make so much), and finding less slows the valley's buildings. A pile with nothing worth buying is what the research calls a dead resource: players stop caring about it.

- **A. Earn less.** Scouts and the allowance pay less, and projects shrink to keep the valley's pace. Example: a find of 20 scrap feels like something, but there is less to do with Acorns early on.
- **B. More worth buying.** Bring a small part of the cosmetics forward: decorations for your house and the valley (bought with Acorns and materials), more kit, and the shard exchange's visiting traders. Example: Sanni buys a lantern string for the bonfire with 400 Acorns and 120 scrap; a trader offers a rare blueprint for 300 Acorns and 40 Tide shards.
- **C. Let it pile for now.** Savings are fine in a cozy game; add things to buy as content arrives. Example: Sanni has 3,000 Acorns at week 12 and nothing she wants.

**Lead's pick: B.** `later.md` already names cosmetics as the long-term sink for surplus, and you suggested traders (Q34). Bringing a small set forward gives every resource a use all season; the lab then prices it.

**Answer (2026-10-30): B, starting with a weekly visitor.** "42 B is the way to go and we can expand on what options we give players over time. Piling up is alright for the first few weeks and that buys us time to build the sinks." His idea, a Xûr-like weekly visitor with limited stock and a Chaos Orb-like reroll service, and "I'm afraid of housing right now because it requires a ton of new systems and art", are quoted in full in `systems/visitor.md`.

Became: `systems/visitor.md` (an idea, to research and the panel); T-7 is report-only until the visitor and decorations are modelled; housing stays parked. Raid days: Misa "eventually" wants phase 1 on Saturday, phase 2 on Sunday and the finale on Sunday evening (passed to combat v2).

### Q43. How long should the visitor stay?

Status: answered, round 17 (2026-10-30), after the panel (`reviews/2026-10-30-visitor.md`). From Q42 ("Maybe the trader comes around on Thursday, leaves when the raid starts"). Touches: `visitor.md` V-VIS-1, T-2, F-1.

**Why it matters.** If he leaves when the raid starts, a player who only opens the game at the weekend never meets him, and the research found no evidence that a two-day window works in an idle game (Bungie has since turned Xûr into a permanent shop). Two reviewers suggested he stay through the raid, when the whole server is online anyway.

- **A. Thursday until the raid starts** (your words). Example: Juho, who plays on Sundays, only ever sees the "back Thursday" sign.
- **B. Thursday until the raid's finale on Sunday evening.** Example: Juho meets him on Sunday morning before the finale; Sanni meets him on Thursday evening.

**Lead's pick: B.** It keeps the Thursday arrival as the event and lets every kind of player meet him, without a drop-off service to build.

**Answer (2026-10-31): B.** "43: B"

Became: V-VIS-1, the visitor arrives on Thursday and leaves at the raid's finale on Sunday evening.

### Q44. How should a reroll reach players?

Status: answered, round 17 (2026-10-30), after the panel. From Q42 ("introduce the first path of exile type 'orbs'... How the items are used is another thing... offers a service: 'give your item to me and I'll reroll the modifiers on it'"). Touches: `visitor.md` V-VIS-4, `economy/resources.md` (round 14's three kinds of spendables), `gear.md`.

**Why it matters.** You described both an orb and a service. The panel split three ways. Each reroll rolls all lines (your Chaos Orb), costs Acorns and scrap, and gets dearer with each one in the same week; the question is only where and when you use it.

- **A. A service at his stall while he is here.** Hand over a piece, see the result. Example: on Thursday evening Sanni rerolls her Epic scarf twice and stops when a good line appears.
- **B. Orbs you buy from him and keep,** used at the Forge any time (each counts toward that week's rising price). Example: Sanni buys two orbs on Thursday and uses one on Tuesday, when the Forge finishes an Epic. One new item to hold, against round 14's three kinds of spendables.
- **C. A standing order at his stall:** "reroll this up to 4 times, stop when a fire line appears", resolved while you are away. Example: Juho leaves a scarf with an order on Sunday and finds the result next week. Your own Forge idea ("work on this until some criteria is met").

**Lead's pick: B.** It is your "orbs", the simplest to build, and works for every player whatever the visiting days, because the gamble happens when you choose. An orb has a clear use from day one, which is the rule you set for new resources (Q33). C is a good later upgrade at the Forge.

**Answer (2026-10-31): A.** "44: A"

Became: V-VIS-4, the reroll is a service at his stall while he is here (Thursday to the Sunday finale); no orbs to hold and no drop-off, so round 14's three kinds of spendables stand. A standing order stays a later Forge idea.

## Withdrawn

### Q36. Should the shard exchange happen by itself when something waits? (a follow-up)

Status: withdrawn, round 15 (2026-10-30). Follow-up to Q34 (the exchange), held until the lab could show it. Touches: `forge.md` V-FORGE-4 and V-FORGE-10, ribbons, F-1 and F-5 in `goals.md`.

**Why it matters.** With the exchange, a daily player's Forge waits for a shard only 7% of the time (it was about half). But a player who never taps the exchange still has creatures stuck at a ribbon (levels 10 and 20) for want of their own element's shards: about 13 creatures waiting at week 12, losing a lot of growth, while the right shards could be traded from the pile. Our filters say nothing should wait on the player for long (F-1, no babysitting) and the fix is one tap (F-5).

- **A. By itself when something waits.** When a piece or a ribbon waits on a shard you lack, the Forge trades for it at the standard rate on its own, and the return walk mentions it (with a crit when it happens). Example: "Pip was waiting for Tide shards; the Forge traded 15 Ember shards for 5 Tide (a lucky trade: 6!)." You still trade by hand for anything else, and traders with better rates stay a choice.
- **B. One tap, shown where it waits.** The creature's card and the return walk say "Pip waits for 5 Tide shards: trade 15 Ember?" Nothing happens without the tap. Example: Juho, who looks in on Sundays, sees three such taps waiting.
- **C. Ribbons take any element's shards; only the Forge needs the right element.** Example: Pip's ribbon takes whatever shards you have; the exchange is only for crafting.

**Lead's pick: A.** It keeps your exchange (the rates, the crits, traders later) and stops creatures waiting for weeks on a trade nobody would refuse. The pull to look in daily stays with the stores and new finds, not with chores.

**Misa's reply (2026-10-30), questioning the ribbons themselves:** "I'm circumventing the question by questioning the resource gated ribbons to begin with. We originally added in a vain attempt to limit how fast the top creatures in someone's roster level. They turned out to do nothing on that front. Should we drop them entirely or build another type of 'trial' for the creature to complete?" (his full idea is quoted in `systems/trials.md`).

Became: the question is replaced by the **trials** idea (`systems/trials.md`), reviewed by the panel before it comes back as a question.

- **"Are the goals G-2 to G-4 and G-6 right as written?"** (old open question 1, 2026-10-29). Too big to answer at once; the goals are now settled through the concrete questions above, and `goals.md` changes with each answer.
- **"Are T-1 to T-5 the right things to measure?"** (old open question 2). Moved to the queue as **targets**, to be asked with the lab's numbers.
