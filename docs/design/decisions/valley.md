# The valley rework

The valley and peaceful systems overhaul planned in docs/design/valley/: job posts, the bonfire, the commons, the Forge loop, gear, trials, the School, the visitor, the economy lab, and Misa's question rounds.

<!-- Maintained with `pnpm decisions`; see README.md. Newest first. -->

## 2026-10-31: The return moment is a welcome-back popup, not a walk; the player directs, creatures act **[Misa]**

ID: `2026-10-31-the-return-moment-is-a-welcome` · Status: current

**Decision.** The return walk prototype (a creature carrying finds through the valley) is dropped. Coming back after a while away opens a **welcome-back popup** with two or three lively highlights (examples: the best piece crafted while you were away, the most notable creature achievement, a server moment), told as a small story, ending with "...and 13 more things" that closes onto the valley, where those things wait as tappable markers at their places. The player has no avatar: the player decides where creatures are, creatures do things, and other players are seen through their creatures.

**Reasoning.** Misa, after trying the walk on staging: "I get the idea but I'm not really a fan of it. It makes it seem like I as a player am the creature going around the valley. I've been thinking what a player's identity is and currently we don't have any concept for that. I'm just a player. My creatures are what do things. I decide where they are. I see other players' creatures and can learn which player they belong to. Could we try a version of the return screen that pops up to the user as a 'welcome back' type of popup... It could show 2-3 highlights of what happened in a lively manner and then end with '...and 13 more things' type of nudge toward exploring the valley and its existing tappable markers." The lab's journeys and the walk's highlight ranking carry over; two presentations (a comic strip and a valley newspaper) are prototyped for Misa to compare. Amends `systems/return.md` V-RET-1.

## 2026-10-31: Valley: the Market is the second guided project (round 19, Q48)

ID: `2026-10-31-valley-the-market-is-the-second` · Status: current

Misa: "48: A." The lab showed shard waits at the Forge start in week 1 and never end without a broker, while the Market as an ordinary project would arrive in weeks 12 to 16. So the Market, which opens the broker post (V-FORGE-11), is the server's second guided project after the hearth: small, paid in Acorns and scrap, finished in the first week or two, as G-8 asks ("a problem arrives with its fix to build"). Later Market levels improve the broker's rate.

## 2026-10-31: Valley: a problem arrives with its fix to build (G-8)

ID: `2026-10-31-valley-a-problem-arrives-with-its` · Status: current

Misa: "I like game systems where as a problem (like piling up resources without having access to a specific one) arises, a solution is unlocked at the same time. If we can time the stock market opening to a point in time when players are starting to need it, that would be pretty cool. Giving players a chance to build it with the knowledge of what it will roughly do (allow the trading of resources) will give them a goal, agency and a reward... Having players come in often to swap crafting jobs in the first weeks isn't that big of a deal if their investment pays off and longer runs are possible as upgrades land." Recorded as goal G-8 in `docs/design/valley/goals.md`. First use: the broker (V-FORGE-11) may become a communal Market project that opens when the lab shows shard waits starting; the lab is measuring when that is.

## 2026-10-31: Valley: the School teaches talents, a broker post trades shards, phase 2 passes (round 18, Q45 to Q47)

ID: `2026-10-31-valley-the-school-teaches-talents-a` · Status: current

- **Q45, B:** the School is where a creature first learns a talent from its line's Talent Book (a short stay, paid once), and where visiting teachers teach talents nobody has found: "the creature studying there learns it if that talent is applicable for the creature's talent book, and also adds it to its talent book". Graduation moves there. (`docs/design/valley/systems/school.md` V-SCH-7 to 9)
- **Q46:** "Could we have a job posting that does the trading? A stock market of sorts (I'm only half joking)": a broker post at the Forge's exchange trades surplus shards for needed ones continuously; mastery improves the rate; a drifting market is a later idea. (`forge.md` V-FORGE-11)
- **Q47, A:** the economy lab passes phase 2, with T-1 restated (a creature owned two weeks is within 5 levels of the 3rd best) and returners at about 16 days; phase 3 (prototype the feel) starts. (`goals.md`, `roadmap.md`, `phase3-plan.md`)

## 2026-10-31: Valley: the visitor stays until the raid finale; rerolls are a service at his stall (round 17, Q43 and Q44)

ID: `2026-10-31-valley-the-visitor-stays-until-the` · Status: current

- **Q43, B:** the weekly visitor arrives on Thursday and leaves at the raid's finale on Sunday evening, so weekend players meet him too.
- **Q44, A:** a reroll (all of a piece's modifier lines, priced in Acorns and scrap, dearer with each reroll in a week) is a service at his stall while he is here: no orbs to hold, no drop-off. Round 14's three kinds of spendables stand. (`docs/design/valley/systems/visitor.md`)

## 2026-10-31: Valley: the reset replaces the migration; gear slots open at level 1 (from the combat v2 session)

ID: `2026-10-31-valley-the-reset-replaces-the-migration` · Status: current

Misa decided with the combat v2 session (branch `combat-v2-roster`, commit 17a343c, verified there): "I plan on recording each player's current accomplishments and creatures down somewhere, using them as fuel for content later on (they are the mystical pioneering first settlers) and resetting the game." For the valley this settles phase 6: no migration, the "I was there" mementos become the recorded settlers (`docs/design/valley/roadmap.md`, `deciding.md` rule 7). Also from that session: gear slot unlock levels are dropped (all three slots open at level 1), and gear's weight grows with the game, talents leading early and gear the endgame (`docs/design/valley/systems/gear.md` V-GEAR-3). The economy lab's roster profile follows on its next run.

## 2026-10-30: Valley: no time floor, Bronze stays a dungeon clear, sinks start with a weekly visitor (round 16, Q40 to Q42)

ID: `2026-10-30-valley-no-time-floor-bronze-stays` · Status: current

- **Q40, B:** the Forge's fire (the item level cap) has no time floor; only building, collections and boss kills warm it. The lab showed the floor changed nothing for a building server.
- **Q41, A:** Bronze's combat box stays a dungeon clear with the creature in the team: "players will learn that two creatures can tutor a lower level third for its ribbon, and eventually I might want to implement the dungeon difficulty picker too."
- **Q42, B:** more worth buying, over time: "Piling up is alright for the first few weeks and that buys us time to build the sinks." The first sink is a Xûr-like weekly visitor with limited stock and a Chaos Orb-like reroll service (`docs/design/valley/systems/visitor.md`, an idea, to research and the panel). Housing stays parked. The economy lab's "nothing only piles up" target is report-only until the sinks are modelled.
- Misa also wants, eventually, the raid's phase 1 on Saturday, phase 2 on Sunday and the finale on Sunday evening (passed to combat v2).

## 2026-10-30: Valley: ribbon gates dropped, trials as honours, creatures found by rarity (round 15, Q38 and Q39)

ID: `2026-10-30-valley-ribbon-gates-dropped-trials-as` · Status: current

- **Ribbon gates are dropped.** Misa: "I do feel like the ribbon system is an awful lot of work for essentially... nothing. Let's drop it." The economy lab showed they held back the bench, not the best creatures. Earned ribbons become "I was there" mementos at the migration.
- **Q39, trials as honours.** "The honours system is kind of cool... Let's make the bronze ribbon touch on many game systems but still be quite easy to attain... Clearing a dungeon for bronze, clearing Undercroft (or 2+ levels, depending on balance) for silver and clearing a raid for gold. If we don't gate any progress behind ribbons, there shouldn't be an issue of requiring rare combat feats for them." (`docs/design/valley/systems/trials.md`, accepted)
- **Q38, creatures by rarity.** "Could we have a good set of common creatures that are found at the 'week 4 pace' but then make it slow down as rarer creatures are harder to find? They shouldn't be essential to find for boss cards, just offer more variety." Commons arrive at about the plan's pace; rare and epic species take months. A raid boss may now and then need a rare, since the raid pools the server's creatures (Misa: "A 100% common requirement is too limiting in design space"); the lab reports server-wide coverage by rarity for combat v2 (`scouts.md` V-SCOUT-12).

## 2026-10-30: Valley: building drives the item level cap; ribbons questioned (round 15)

ID: `2026-10-30-valley-building-drives-the-item-level` · Status: current

- **Q37, B:** building, collections and boss kills drive the Forge's fire (the item level cap) over a slow time floor. Misa: "B but honestly I'm skeptical of the clock", so the economy lab reports the slow floor and no floor side by side. (`docs/design/valley/systems/commons.md` V-COM-13)
- **Q36 withdrawn:** Misa questioned the material-gated ribbons themselves ("They turned out to do nothing on that front") and proposed **trials**, a checklist across the valley's systems with a graduation. Written up in `docs/design/valley/systems/trials.md` and sent to the panel.
- **Q38** waits: Misa asked whether the counts are species or finds (species).

## 2026-10-30: Valley: three kinds of resources, a shard exchange, catch-up until the next visit (round 14, Q33 to Q35)

ID: `2026-10-30-valley-three-kinds-of-resources-a` · Status: current

Asked with the economy lab's first report, which showed most resources piling up, a daily player's Forge waiting on shards of the wrong element about half the time, and a weekly player growing at about half a daily player's pace.

- **Q33, A:** three kinds of spendables: Acorns for your own valley; scrap and shards from the world, for the Forge and the server's buildings (projects are built from materials plus Acorns); Essence from fights, for creatures. Glimmer is cut: "we can look at introducing glimmer type resources when we actually have a use for them." Journal pages are never spent. (`docs/design/valley/economy/resources.md`)
- **Q34, B:** a shard exchange at the Forge (example: 3 of any element for 1 of the one you need, with a small chance of a bonus). "What better way to create relationships between currencies than a currency exchange. This paves the way for things like visiting traders or even permanent upgrades that offer better exchange rates. Currency exchange crits are also a fun idea." (`forge.md` V-FORGE-10; traders in `later.md`)
- **Q35, B:** catch-up's multiplier holds until the next visit instead of 24 hours, so a weekly player's creatures grow at about 75% of a daily player's, while full stores still reward looking in more often. (`bonfire.md` V-BON-2; T-2 unchanged)

The economy lab models all three and is being tuned with its automatic tuner.

## 2026-10-30: Valley: build the economy lab next (round 13, Q32)

ID: `2026-10-30-valley-build-the-economy-lab-next` · Status: current

Misa: "The economy simulation building would be something that could work out as I travel home from work... I'm interested in seeing what kind of resources we have, how they interact. What's used for what." Phase 2 starts: a resource map (`docs/design/valley/economy/resources.md`) and the lab (`economy/model.md`, package `packages/econ`). His open thinking on how many resources the valley needs, and his doubt about the School ("is the school building even necessary?"), became two queued questions (**resources**, **school**) in `docs/design/valley/questions.md`. Research: `docs/research/resource-design.md`.

## 2026-10-30: Valley: communal seats are extra; co-op never takes away personal progression (round 12)

ID: `2026-10-30-valley-communal-seats-are-extra-co` · Status: current

Misa's answer to the valley plan's Q31: a communal seat is an extra seat per place, never one of the player's own (`docs/design/valley/systems/commons.md` V-COM-14). "Let's absolutely keep any such initiatives something that doesn't take away personal progression": a new standing filter, F-11 in `docs/design/valley/goals.md`. He is unsure communal seats will be fun, so they are tested in the phase 3 prototype before being built.

## 2026-10-30: Valley: every place builds its own project, after a guided start (round 12)

ID: `2026-10-30-valley-every-place-builds-its-own` · Status: current

Misa's answer to the valley plan's Q30 (`docs/design/valley/questions.md`; `docs/design/valley/systems/commons.md` V-COM-5, V-COM-15): every place has its own open project, and the server's players choose together where to give ("let's not take the agency out of players' hands by holding their hand"). A new server starts with one small project, then a second, and every place opens once those two have levelled; first levels are small and done within two or three weeks. A place's max level keeps one place from running far ahead; a place builds for three days between levels, so a hoard raises at most one level per place. Q31 (whether a communal seat costs one of the player's own seats) was reworded and asked again.

## 2026-10-30: Valley: a long item level ladder, elements own their lines, 1/3/5 lines, a cap warmed by the whole valley (round 11)

ID: `2026-10-30-valley-a-long-item-level-ladder` · Status: current

Misa's answers to the valley plan's Q27 to Q29 (`docs/design/valley/questions.md`; `docs/design/valley/systems/gear.md` V-GEAR-8, V-GEAR-10 to V-GEAR-12).

- **The ladder (Q27).** Item level runs to about 100, with each modifier tier unlocking at a threshold; a step of the cap can be several levels.
- **The cap's sources.** "Give players the option of raising the item level cap in a multitude of ways... not just a fixed relationship to the raid. Because that would just mean that if players can't beat the raid, tough luck." Proposed by the lead in `systems/commons.md` (V-COM-13, "the Forge's fire"): place level-ups, completed collections of rare finds set into buildings (Misa's Stardew Valley community center idea), raid kills on combat v2's track, the server's creatures growing, and a slow rise with time.
- **Elements own their lines (Q28).** An element piece rolls its own element's lines and neutral lines only; places and bosses drop mostly their element's pieces, plus neutral and now and then other elements'. Cross-element lines are a later idea.
- **Lines per rarity 1 / 3 / 5 (Q29).** Combat v2 scales line values to match.

## 2026-10-30: Valley: a bag of 200 with real tools, a rising item level cap to try, no pity floor (round 10)

ID: `2026-10-30-valley-a-bag-of-200-with` · Status: current

Misa's answers to the valley plan's Q24 to Q26 (`docs/design/valley/questions.md`; `docs/design/valley/systems/gear.md` V-GEAR-6 to V-GEAR-9).

- **The bag (Q24).** Worn items do not count; the bag holds 200. Players get filter, sort and search (rarity, item level, slot, element, stats, modifier lines), bulk dismantling, stats and comparison at a glance instead of a drawer per item, a creature-side flow to find a creature's best item, and a visual highlight for items that are really good (a high item level common can beat a low item level epic). No loot filter rules: "you're kind of expecting to see this big pile of loot".
- **Item level (Q25).** The source sets it under a server cap that rises with raid wins and slowly with time; tried and watched, since Misa doubts players will welcome their best craft being outdated, and he prefers new crafts over upgrading one item forever.
- **No pity floor (Q26).** Pure luck with visible odds; partial wins from more lines per piece; deterministic pools (slots include or exclude lines without favouring; elements favour or own theirs); blueprint quality, raised by crafting and dismantling, is the consolation prize. This restores blueprint marks, which the scouts and Forge panel had removed.

## 2026-10-30: Valley: gear is a Path of Exile-style lottery fed by the Forge; crafting waits on shards (round 9)

ID: `2026-10-30-valley-gear-is-a-path-of` · Status: current

Misa's answers to the valley plan's Q22 and Q23 (`docs/design/valley/questions.md`; his full words in `docs/design/valley/systems/gear.md`).

- **Gear (Q22), the direction.** "Very inspired by Path of Exile": base items with small fixed stats, item level deciding how strong rolled modifiers can be, rarity deciding how many; "big rolls, big lottery"; the Forge's steady work is the main source of rolls ("give it a blueprint and say, hey, craft these until you find the best item"); the best results shown first and celebrated; no currency orbs at the start; improving existing items as a later Forge job; more items than a bag of 60 can hold; item level becomes quality only, with no level requirement to wear. What sets item level, storage and the craft-until loop are open, researched for round 10. Combat v2 owns gear's stats and lines.
- **Crafting waits on shards (Q23).** "If you're waiting for Reef shards, then you need to have explorers out in the Reef finding those Reef shards for you. Or then maybe you've stockpiled a lot of them up and then you just want to use them." Each piece needs a shard of its element; the Forge names a short input inside its scene with the one-tap fixes (V-FORGE-4).

## 2026-10-30: Valley: numbers live inside each place; the walk asks for raid preparation once a week (round 8)

ID: `2026-10-30-valley-numbers-live-inside-each-place` · Status: current

Misa's answers to the valley plan's Q20 and Q21 (`docs/design/valley/questions.md`), after the panel on the return moment (`docs/design/valley/reviews/2026-10-30-return.md`). Tapping a place shows its posts' pace and what makes it up, when stores fill and the next project's progress, always phrased as what happens next; there is no overview screen of every number (V-RET-9). The first visit after the week's threat is sighted ends the return walk at the Watchtower with the threat, its rule cards and "choose your defenders"; after that the beacon stays lit (V-RET-3).

## 2026-10-30: Valley: creatures master a kind of work, and masters make room (round 7)

ID: `2026-10-30-valley-creatures-master-a-kind-of` · Status: current

Misa's answer to the valley plan's Q19 (`docs/design/valley/questions.md`), after research (`docs/research/worker-identity.md`): "B sounds like a good way to go. Maybe not kelp cap mastery specifically but Smithing in general... A maximum level reached in a certain profession is a nice way of opening the floor for newcomers into the same profession." A creature grows in each kind of work (scouting, smithing, keeping, teaching) in three visible steps; a Master keeps its badge and title for good, gains a small perk at another kind of post, and is shown as ready to learn something new, so moving on is a gain and frees the seat for a newcomer. No mastery per recipe. Today's explorer ranks and Crafting skill become these steps (V-POST-12).

## 2026-10-30: Valley: no couch, gentler away steps, work identity researched (round 6)

ID: `2026-10-30-valley-no-couch-gentler-away-steps` · Status: current

Misa's answers to the valley plan's round 6 (`docs/design/valley/questions.md`, Q16 to Q18), after the panel on job posts and the bonfire (`docs/design/valley/reviews/2026-10-30-posts-bonfire.md`).

- **No couch (Q16).** "This entire thing, like the bonfire and everything, moves that setting into the valley itself." The lounge mechanic and its company XP go (this replaces the 2026-10-20 "lounging with company" decision in the valley plan); the valley shows who is online, their creatures around the bonfire. Gifts at each other's houses are a later idea.
- **Gentler away steps (Q18).** "Something like a 15% drop after 24 hours or 48 hours... let the players keep a weekend off." Candidate curves are in `systems/posts.md`; the lead leans to full for 48 hours, then 85%, 60%, 30% and 10% by day 30 (a weekend off keeps 97%, a weekly player about 79%, a month away about nine days of growth). The economy lab picks. Stores hold about three days so a weekend off fills nothing.
- **Work identity (Q17) is open.** Misa wants creatures to "grow into some kind of an identity that they're good at something" while players are "still encouraged to do something else with their creatures", floated per-recipe proficiency at the Forge, and asked for research before deciding.

## 2026-10-30: Valley: Acorns and a resource library, battlegrounds far away, no Watchtower post (round 5)

ID: `2026-10-30-valley-acorns-and-a-resource-library` · Status: current

Misa's answers to the valley plan's round 5 (`docs/design/valley/questions.md`, Q13 to Q15).

- **Bait becomes Acorns (Q13),** and "some kind of resource library acting as a source of truth so we can easily change it later. It needs to be pretty generic." Technical plan (lead): one schema-validated content file lists every resource (currencies, parts, materials, keystones) with a stable internal id that never changes and is never shown, its display name, plural, short description and icon; every screen, glossary entry, Discord message and the How to play text read names from it, and a test fails if player-facing text names a resource directly. Renaming a resource is then a one-line data change. It is the first build task of the valley's phase 4; it can also ship earlier as a standalone refactor with no visible change.
- **The battlegrounds (Q14):** a drowned sea gate past the Tidepools' shelf (Tide), a caldera below the Ember Caves (Ember), a sunken shrine in the Sunken Fen (Mire), next to Misa's root-swallowed temple (Grove) and thunderous mountaintop (Spark). "The raid is proactive defense and happens in far away places": the creatures go out to meet each threat before it reaches the valley (goal G-5, compendium `bosses.md`).
- **No Watchtower post (Q15).** A post must give benefits across the whole week, and players need the whole week to prepare for the raid's rule cards, so that information is everyone's from Monday, not a post's reward (a wish for combat v2). "If we can't find a use for the watchtower, drop it as a post. No need to shoe horn it in." The Watchtower remains only as the raid's place in the valley; its name and role are revisited with the art.

## 2026-10-29: Valley: catch-up toward the server, a communal hearth, places with a max level (round 4)

ID: `2026-10-29-valley-catch-up-toward-the-server` · Status: current

Misa's answers to the valley plan's round 4 (`docs/design/valley/questions.md`, Q10 to Q12).

- **Players who play less catch up toward the server (Q10).** A player whose best team is behind the server's middle grows faster on days they visit, fading as they close in; no level sync in the raid (V-BON-6).
- **The bonfire is a communal hearth (Q11).** The server raises its level like any place; each level adds a slight increase to every idle creature's growth ("This could be slightly incremental"); level 1 is the flat floor (V-BON-7).
- **Places have a max level, then cosmetic projects (Q12).** "We can open new places even before max level, but these shared upgrades should get increasingly difficult over time." Each level's project is bigger than the last; after the max, projects add decorations everyone sees; new places are content that can open at any time (V-COM-11).

## 2026-10-29: Valley: dungeon passes, a weekly fair, one everyday currency (round 3)

ID: `2026-10-29-valley-dungeon-passes-a-weekly-fair` · Status: current

Misa's answers to the valley plan's round 3 (`docs/design/valley/questions.md`, Q7 to Q9).

- **Dungeon passes (Q7).** "Keep the dungeon seeds for the last 3 days so the player can run the same content as everyone else did. We can basically give players "dungeon passes" that stack up when needed." One pass a day, stacking to 3; a pass runs today's map or one of the last 3 days' maps (the stored day seeds; every fight's seed is still a fresh crypto draw on entry). The streak becomes runs played in a week (lead's call).
- **The Valley Games become a weekly fair (Q8)** every Wednesday, with about 5 events ("Increase the number of events to maybe 5 to compensate"), entries open all week and the Prize Stall the same day.
- **Bait is the everyday currency for a player's own posts and the server's projects (Q9),** so every spend is a choice between "my valley" and "our valley". Leets keep paying it; the daily allowance builds up like an idle gain instead of paying for opening the game. "We don't have to keep calling it bait either": a new name is queued.

## 2026-10-29: Valley: gifts count in full, stores last a day and a half, raiders' seats are kept (round 2)

ID: `2026-10-29-valley-gifts-count-in-full-stores` · Status: current

Misa's answers to the valley plan's round 2 (`docs/design/valley/questions.md`, Q4 to Q6).

- **A lone player can finish a shared project (Q4).** "Individual players can slowly accumulate the resources and there's no need to obfuscate it behind diminishing returns unless research calls for it. Let's not block the player, but encourage them to engage with the community and coordinate efforts." Gifts always count in full; projects are sized for the server's active players (those who visited in the last 7 days), so friends are the fast way (V-COM-5).
- **Stores and queues last at least about a day and a half (Q5),** so a daily player never meets a full store or an empty queue. A loose guideline: players who look in more often gain slightly more by spending what they collected on small upgrades to their setup, never through a faster rate or a timer (V-POST-11).
- **A raider's post waits for it (Q6).** The creature is away for the raid weekend; its seat is kept, a stand-in may hold it, and the raider returns on its own after the weekend. A creature knocked out stays out for the weekend (combat v2). The dungeon pauses nothing (V-POST-7).

## 2026-10-29: Valley: one shared valley, posts instead of timers, away growth in steps (round 1)

ID: `2026-10-29-valley-one-shared-valley-posts-instead` · Status: current

Misa's answers to the valley plan's round 1 (`docs/design/valley/questions.md`, Q1 to Q3).

- **One valley for the whole server (Q1).** Everyone's creatures live and work in the same places; the places belong to the server; each player's house is their own space. Personal and shared progress take turns being the limit: "A player might have all the resources to unlock a third anvil, but the forge may not be able to fit three anvils per player yet. This hopefully motivates the player to push for the shared forge building upgrade." (V-COM-10.)
- **Posts replace every timed task (Q2).** Expeditions' timed trips and the Workshop's timed jobs are scrapped; scouts and smiths work continuously. Agency lives at the place: "queue systems and configuration options... which blueprints are being crafted, which areas are being explored." A finished queue falls back to a plainer default instead of idling (V-POST-9).
- **Away growth in steps (Q3).** "Daily check in for full exp is good, then drop in a few steps", to near zero after about a month, because a player away for a month "might lose the feeling of control if they don't recognize the game they came back to". One plain scalar on every idle gain from the time since the last visit (V-POST-10; the steps are set in the economy lab). Full stores and finished queues bring players back on their own; the scalar does not try to. Today's lounge cap of 60 XP a creature a day goes with it. Goal G-3 and filter F-1 now say absence never takes away what a player has, rather than that it costs nothing.

## 2026-10-29: Valley: be brave, and decide in small rounds of questions

ID: `2026-10-29-valley-be-brave-and-decide-in` · Status: current

Misa: "I am more inclined to scrap existing features, systems and design choices than cling on to them. I want to be brave. Any existing players and their achievements can be remembered by an "I was there" type of memento if nothing else." And: "ask them 1-3 at a time and always numbered... I need you to challenge my principles and answers, even to questions I've previously answered, if they contradict with my own output, research or demonstrable facts."

- **Be brave (goal G-0 in `docs/design/valley/goals.md`).** Nothing in today's game is kept because it exists. A scrapped system leaves its players an "I was there" memento, decided at the migration (valley roadmap phase 6); old systems are not kept alive to protect progress. This extends the 2026-10-28 rule that content changes are not held back by what players own.
- **Question rounds.** The valley plan moves forward in rounds of one to three numbered questions (numbers run on across rounds), each with why it matters, options with examples and the lead's pick (`docs/design/valley/deciding.md`). Every question and answer is kept in the ledger `docs/design/valley/questions.md`, which replaces `open-questions.md`; the `valley-round` skill runs a round.
- **Challenges.** The lead checks every answer, old or new, against Misa's goals, earlier answers, the research and the numbers, and raises a conflict once, as a numbered question.
