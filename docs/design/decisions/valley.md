# The valley rework

The valley and peaceful systems overhaul planned in docs/design/valley/: job posts, the bonfire, the commons, the Forge loop, gear, trials, the School, the visitor, the economy lab, and Misa's question rounds.

<!-- Maintained with `pnpm decisions`; see README.md. Newest first. -->

## 2026-11-03: The School's teacher prefers a talent that benefits a few players (2 to a quarter of the server)

ID: `2026-11-03-the-school-s-teacher-prefers-a` · Status: current

**Decision.** The weekly teacher's talent (V-SCH-12) is drawn first among talents that benefit from 2 up to a quarter of the server's players (at least 2), never all; else one that benefits exactly one player; else the one that benefits fewest. The same rule runs in the economy lab and the prototype.

**Reasoning.** Misa (round 22, Q52): "it's fine if it doesn't benefit many players ... select one that benefits hopefully more than one. But we don't want ... everyone ... not everyone stands a chance to learn something all the time." The lab showed the first rule ("more than one, never all") benefiting 57 to 78% of players per visit and giving 21 to 27% of talents, because players own 25 to 50 lines by midseason and a talent fits about 3 of the 16 real pools. With the band, a kind of player benefits at 22 to 39% of visits and the teacher gives 7 to 9% of talents: most players miss most visits, and it is secondary (a little under the review's 10 to 15%; the band's cap is the lever if it should give more). The first rule stays in the report as a variant.

## 2026-11-03: The School's visiting teacher: weekly, Monday to Wednesday, one talent that benefits someone; found talents learned on the card (round 22, Q51-Q53) **[Misa]**

ID: `2026-11-03-the-school-s-visiting-teacher-weekly` · Status: current · Amends: `2026-10-31-valley-the-school-teaches-talents-a`

**Decision.** From Misa's vision for the School (2026-11-03) and his answers. Q51, B: a visiting teacher comes weekly and stays Monday to Wednesday; a creature seated at the School before the arrival or on any day of the stay learns by the next morning, then goes back to its post. Q52: "the teacher, bring a talent that benefits someone. So it's fine if it doesn't benefit many players. But we can check the creatures on the server and select one that benefits hopefully more than one. But we don't want to make it so that everyone benefits from it. It's supposed to seem random. Having a random new talent unlocked for setters ... sound[s] cool, but I would maybe want that to be like a festival special." One talent per visit, drawn among those that would benefit someone on the server, preferring more than one player but never everyone; a role-specialist teacher is a festival special. Never golden. Q53, B: "on the creature card, as it is today. Learning it at the school just adds it to the talent book." A found talent is learned on the card for the one-time price; a lesson adds the teacher's talent to the student's line's book. Amends round 18's "creatures still need to learn them a first time. This could be the place to do it": the first learning stays on the card.

**Reasoning.** All six reviewers (`reviews/2026-11-03-school.md`) found a single day shut out evening, weekly and other-time-zone players; the stay keeps the planning moment as a choice of creature, not of hour, and puts lessons before the raid locks. A weekly teacher adds about 10 to 15% more talents, a secondary source as Misa wants; he accepts that most players miss most visits ("not everyone stands a chance to learn something all the time"). The Acorn sink is the card's price, so it holds.

## 2026-11-03: Phase 4 groundwork starts before the phase 3 gate (resource library, frame plan, School design) **[Misa]**

ID: `2026-11-03-phase-4-groundwork-starts-before-the` · Status: current

**Decision.** While Misa travels and cannot try staging, the lead starts phase 4's groundwork: the resource library (round 5, Q13), the plan for the valley frame in the game, and the School's design with combat v2's talents. Building the frame itself waits for the phase 3 gate (Misa plays the prototype on staging). Misa: "Go ahead and continue as far as you can."

**Reasoning.** These parts hold whatever the feel review says: the library is a source of truth for names Misa asked for, the plan maps today's screens to places, and the School waited only on combat v2's talents, which are now in the game. Building the frame first could build on a feel he has not confirmed.

## 2026-11-03: No poster on a place's screen; a sky backdrop instead, when the art exists (round 21, Q50) **[Misa]**

ID: `2026-11-03-no-poster-on-a-place-s` · Status: current

**Decision.** A place's screen has no poster at the top. Misa: "Q50: probably C. It's weird that it shows the place twice. I do like the added depth of having a "sky" in the background though, so that could be something worth using instead. We'd just need the proper sky images. Eventually the sky backdrop could vary based on location." The valley prototype's default poster mode is `none`; a real sky backdrop (art to come from the art-direction session, later one per kind of location) takes the strip's place. The `sky` and `framed` modes stay behind `&poster=` only for comparison.

**Reasoning.** As a sky strip, a place's own poster shows the place a second time right above it (the panel, `reviews/2026-11-03-places.md`, row 3); a sky with no place in it keeps the depth Misa liked without the double.

## 2026-11-03: Place scenes: the one-scale rule is per scene; the tray is UI and keeps its own scale

ID: `2026-11-03-place-scenes-the-one-scale-rule` · Status: current

**Decision.** The one-pixel-scale rule is per scene: the poster, the place's art, the grass, the scene's creatures and the story strip's creatures are drawn at one scale, chosen per screen so the place's art fills about three quarters of the scene's width (3 to 6, `glowScale`; never over 80%, and the art, the row under it and the pinned button must still fit the height). The creature tray is UI, not the scene, and keeps its own scale of 3 in every place. This amends the earlier "one scale per screen" entry. The sky strip is one centred copy of the poster with its own edge columns carried to the screen's edges; the scene's day grass is the valley map's own.

**Reasoning.** At the old scale (3 or 4) the place's art was about 180 px wide on a 390 px phone with half the screen empty. A bigger pixel is the only way to fill the scene without breaking the one-size rule inside it, and a 64 px tray creature would crowd the tray. Mirrored poster copies repeated the moon and the fire, so the sides extend the picture's own edge instead.

## 2026-11-03: Place scenes: one pixel scale per screen, the poster as a switchable sky strip

ID: `2026-11-03-place-scenes-one-pixel-scale-per` · Status: current

**Decision.** Inside a place every sprite is drawn at one whole-pixel scale (`sceneScale`: 3 under 700 px wide, 4 from 700): the poster, the place's art, the grass, the scene's creatures, the story clipping's and the tray's. The poster is a sky strip edge to edge by default (mirrored copies to both edges, its own time of day); `&poster=framed` and `&poster=none` show the other two, pending Misa's answer to Q50. The Places list says each place's state; a place's pinned line is its next step or, when nothing needs you, a calm line (`PinnedAct`); the tray shows the player's mastery of the place's work (SAMPLE data until posts exist); edge chips never sit on a place.

**Reasoning.** The panel (2026-11-03) found three pixel sizes on one screen and a framed poster that clashed with the scene. A place's art cannot be drawn larger than the creatures' pixel without breaking the one-size rule, so it fills the screen by its size times the scale and a yard around it, not by upscaling. Sky is the lead's pick until Misa decides.

## 2026-11-03: The visitor leaves when Sunday ends, after the finale

ID: `2026-11-03-the-visitor-leaves-when-sunday-ends` · Status: current

**Decision.** The weekly visitor is in the valley from Thursday 00:00 until Sunday ends (Monday 00:00, the guild's time zone), not until the moment the raid's finale starts. Amends V-VIS-1's "leaves at the raid's finale on Sunday evening" (round 17, Q43: B).

**Reasoning.** Combat v2 moved the finale to Sunday 20:00, the time a Sunday-evening player looks in for the raid; leaving at that minute meant the lab's weekly player (and anyone who comes for the finale) found his stall shuttered every week, the opposite of Q43's reason ("so every kind of player meets him"). Staying to the end of Sunday keeps that intent; the economy lab already lets him stay to Sunday 23:00.

## 2026-11-01: Late-season scrap is deferred; the lab pretends an idol takes the surplus **[Misa]**

ID: `2026-11-01-late-season-scrap-is-deferred-the` · Status: current · Amends: `2026-11-01-no-tempering-more-places-to-spend`

**Decision.** The scrap that piles up after week 13 is tackled later. Misa: "Let's just not focus on the scrap problem after week 13 now and agree to tackle it later. Just pretend there's an idol in the village that players can offer an unlimited amount of scrap to and it'll promise to do something for them one day (it may never) or something." The idol is a voluntary, silly sink: nothing is taken automatically; a player chooses to offer it scrap, tapping to offer in batches of 100 (Misa: "players always take an action to offer the idol an amount of scrap they want... Nothing is taken automatically from them"). The economy lab models it as a player's choice: offers in batches of 100 from scrap above a generous reserve (never what pieces, gifts or the visitor would use), on by default, with the run without it kept beside. The three proposed uses (`systems/scrap-uses.md`) wait.

**Reasoning.** Week 13 is about three months after launch; the uses can ship as content before then, and the phase 3 prototype does not depend on them. A voluntary sink lets us not worry about the pile for now, and the idol keeps T-7b from hiding other changes in the lab without pretending the problem is solved: the report says it is a placeholder and shows the run without it.

## 2026-11-01: No tempering; more places to spend scrap before the late season (round 20, Q49) **[Misa]**

ID: `2026-11-01-no-tempering-more-places-to-spend` · Status: current, amended by `2026-11-01-late-season-scrap-is-deferred-the`

**Decision.** No tempering at the Forge. Misa: "Tempering would only increase the potential of rolls on the item since item levels don't automatically increase any stats. If we allowed a free reroll of the modifier tiers on a tempered item while keeping the modifier lines unchanged, it would be too powerful for good items. Therefore I'm skeptical about tempering. Can we introduce more places to use scrap? Week 13 is far away and I think we could get some more uses for it into the trader, market or new upcoming game systems by the e.g., buy exotic wood for furniture crafting, fund a massive communal project, etc." Late scrap is answered by more uses, added over the season: the visitor's stock, the Market and new systems (examples: materials bought for a crafting pastime, a large communal project). T-7b stays failing in the lab until those sinks are designed and modelled; scouts' scrap is not tapered for now (option B was not taken).

**Reasoning.** The lab's tempering passed T-7b only narrowly and took scrap from the visitor; and as Misa points out, a piece's item level adds nothing by itself (it only raises the top tier a later roll can reach), so tempering is either worthless or, with a free tier reroll, too strong for good pieces. Week 13 is about three months after launch, time enough to ship new uses as content. The lab keeps the tempering study switched off as a record (`rules.tempering`, the report's "Tempering" section).

## 2026-10-31: The welcome-back popup is the Gazette: short prose, items that speak, tappable for a popover **[Misa]**

ID: `2026-10-31-the-welcome-back-popup-is-the` · Status: current

**Decision.** Of the two welcome-back looks tried on staging, the Valley Gazette stays and the comic strip goes. Its prose is condensed: the items, creatures and places shown do the talking where they can. The headline story's item card is tappable and opens a popover with its details, and other things in it (creatures, places, smaller items) may do the same, for the curious; nothing else is required to read it. Its visual style is revisited much later.

**Reasoning.** Misa: "I like the content on the gazette but feel like it's a slightly overused trope to frame it as a newspaper. On the other hand it's easily recognizable and serves a clear purpose that way. Let's go with the gazette. I'd like the top item card to be clickable on it and maybe other similar things to be interactive. Just a popover for the curious visitors. Let's roll with it, try to condense the prose a bit (letting the items do the talking when applicable) and revisit the visual style much later."

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

ID: `2026-10-31-valley-the-school-teaches-talents-a` · Status: current, amended by `2026-11-03-the-school-s-visiting-teacher-weekly`

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
