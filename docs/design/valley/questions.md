# Questions for Misa: the ledger

How this works: [`deciding.md`](deciding.md). Questions are asked in rounds of one to three, numbered on across rounds; a question gets its number when it is asked. Each entry keeps the context it was asked with, so any session can pick up after a context compression. Answers are quoted in Misa's words and also go to `docs/design/decisions.md` (tagged "Valley").

Sections: **Waiting on Misa** (asked, not answered), **Queue** (to ask, in order), **Answered**, **Withdrawn**. `reader/build.py` reads the "Waiting on Misa" headings for the phone page, so keep them as `### Q<n>. <question>`.

## Waiting on Misa

Nothing right now.

## Queue

In order. Each becomes a numbered question when asked; entries name what they wait on.

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

## Withdrawn

- **"Are the goals G-2 to G-4 and G-6 right as written?"** (old open question 1, 2026-10-29). Too big to answer at once; the goals are now settled through the concrete questions above, and `goals.md` changes with each answer.
- **"Are T-1 to T-5 the right things to measure?"** (old open question 2). Moved to the queue as **targets**, to be asked with the lab's numbers.
