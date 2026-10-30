# The resource map: what the valley runs on

Status: **draft** (lead, 2026-10-30), for the **resources** question in `questions.md`. Written because Misa asked, when starting the economy lab (round 13, Q32): "I'm interested in seeing what kind of resources we have, how they interact. What's used for what." The lab (`model.md`) simulates every row of this map; its report shows each one's flow by week.

## Misa's two instincts

Misa (Q32): "we're going to need to be interacting with a lot of resources and those resources need to have some kind of relative value against each other... And on the other hand... the less resources you have, the better. Or especially resources that kind of track progress... maybe there's different resource types... part of them are from the game world itself, and they're used to actually upgrade buildings in there. And then other resources are maybe these superficial and more abstract, acorns."

The lead's reading: both are right, because "resource" covers several kinds of thing, and only one kind needs to be few.

- **Things you spend** are the ones players must track and weigh. These should be few, each with one sentence of purpose, one place it comes from and one place it goes.
- **Things you collect** (gear, blueprints, creatures, rare finds) can be many: each is a thing you look at, not a number you budget.
- **Things that track progress** (levels, mastery, a place's level, the Forge's fire) are never spent, so they add no budgeting at all. They are shown, not managed. Misa's "especially resources that track progress" is the rule here: progress should never be a currency you spend down.

**Relative value** comes from one yardstick: the lab prices every resource in **hours of a daily player's idle income** ("a lantern costs about a week of Acorns"; "a level 2 Forge is about two weeks of the server's giving"). Players never see this number; it keeps the prices consistent with each other.

## Today's map (from the system docs as of 2026-10-30)

### Things you spend

| Resource                                           | Kind              | Comes from                                                               | Goes to                                                   | Its one sentence                             |
| -------------------------------------------------- | ----------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------- |
| **Acorns** (today's Bait)                          | everyday currency | the daily allowance (builds up idly), leets, the dungeon, small moments  | your own seats and anvils, kit, gifts to projects         | "What you spend on your own valley."         |
| **Scrap**                                          | world material    | scouts (most), tinkering, a Master Smith's perk, dismantling, duplicates | Forge pieces (6 each), anvils, ribbons, gifts to projects | "What the Forge makes things from."          |
| **Shards** (five: tide, ember, grove, spark, mire) | world material    | scouts at a place of that element, dismantling                           | Forge pieces (1 of the piece's element), ribbons, gifts   | "What ties a piece to a place."              |
| **Glimmer**                                        | rare material     | scouts (about one a week), dismantling Epics                             | Reaching for Epic, the Silver Ribbon                      | (thin: two small uses)                       |
| **Essence**                                        | fight prize       | the raid (most), melted spare rare finds                                 | evolution, Reach, gifts to the Paddock and School         | "What fights give you to grow creatures."    |
| **Medals**                                         | fair prize        | the Fairground's weekly events                                           | the Prize Stall                                           | (a closed loop; decided with the Fairground) |

That is ten numbers to track (five of them shards), in six kinds. By comparison, Clash of Clans' home village has three to four (gold, elixir, dark elixir, gems); the research (`docs/research/resource-design.md`) finds no evidenced limit, but "merge two that appear in the same places for the same purpose", and in a slow game hoarding is the likelier failure than starvation.

### Things you collect

Creatures (new and duplicates), gear pieces, blueprints (with their quality), kit (bought once, kept), journal pages (lore), rare finds and keystones (they set themselves into a collection; never a currency, V-COM-12). Dungeon passes are access, not a resource: one a day, stacking to three.

### Things that track progress (never spent)

Creature levels and XP; mastery titles; blueprint quality; each place's level; the Forge's fire (the item level cap); the hearth; Boss Rank; plaques and keepsakes.

## Where it is crowded (the lead's first cut, for the resources question)

1. **Glimmer** has two small uses that other levers already cover (rarity has three: Reach, blueprint quality and the loupe, V-FORGE-8). Candidate: **scrap it**; Reach costs Essence only.
2. **Essence** has three jobs (evolution, Reach, gifts). Candidate: keep it as the fights' prize for growing creatures, and decide whether projects take it at all.
3. **Projects take everything** (Acorns, scrap, shards, Essence). Misa's own split suggests a cleaner rule: **places are built from world materials** (scrap and shards, things the scouts bring from the world) **plus Acorns**; fight prizes go to creatures.
4. **Journal pages** are lore, yet the School's project would spend them. A page you spend is lore you lose: pages should stay collectibles (a set of them can fill a collection socket, which keeps them).
5. **Five shards** are five numbers, but they read as one family (a coloured shard per place), and they are what makes "where your scouts are" matter to the Forge (Q23). Keep them, shown as one shelf.
6. **Medals** are decided with the Fairground: their own loop, or paid in Acorns.

If all six went the lead's way, the spendable list becomes: **Acorns** (yours), **scrap and shards** (the world's), **Essence** (the fights'). Three kinds, matching Misa's "world resources for buildings, an abstract currency" plus the fights' prize.

## What the lab watches for each resource

For each row of "things you spend", per kind of player and per week:

- **In and out** (faucets and sinks), and the **stockpile**. A stockpile that only grows is a dead resource (nothing worth buying); one that sits at zero is a starved chain.
- **Waste**: finds not picked up because a store was full.
- **Time to the next thing**: days until the player can afford the next seat, kit, anvil or ribbon. The target is "something to look forward to within a few days, never a month with nothing" (Misa: "not limited by or being starved of resources or things to upgrade").
- **Choices per visit**: how many meaningful things a player can do at a visit (place a catch, start an order, afford a kit, give to a project). Too few is boring; too many is a chore.
- **Relative value**: the price of each thing in hours of idle income, to check prices against each other.
