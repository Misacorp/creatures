# Gear in the valley: crafting, item level and the lottery

Status: **direction set by Misa** (round 9, Q22) and **decided in part** (rounds 10 and 11, Q24 to Q29, 2026-10-30); the cap's sources are proposed with the commons (V-GEAR-10). Research: `docs/research/gear-lottery.md`. Combat v2 (`docs/design/combat/`, branch `combat-v2-bosses`) owns gear's stats, lines and their tuning; this doc owns how items are made, improved, stored and found in the valley, and what sets their item level. Agree changes on that seam with the combat lead.

## Misa's vision (round 9, Q22, in his words, shortened)

> "The vision for gear I have in this game is very inspired by Path of Exile... base items, and each item has an inherent item level... the item level of it determines how good the rolls and the modifiers on that item can be. So the base item always have the same stats and those stats usually aren't that big, but then if the item level is big, you can roll larger modifiers on it that can drastically increase the item's stats... Big rolls, big lottery. It's based on luck."

> "A lot of things have to go right for you to get a good item... the item that you're crafting needs to be epic in quality to actually have the highest number of modifiers on it... I would like to build a system where players actually have the tools required to strive for these good item rolls. They could always come back to the game and see, ooh, did I get any good items this time? And kind of rejoice when they actually hit some good rolls."

> "I don't necessarily want to bring in such orbs here, at least not at the start. I would just prefer players rolling and rolling and rolling until they actually hit something good. But this does result in us having to give players a lot of chances to roll for good items."

> "Maybe further on we can expand the forge with different types of jobs... you could give it an already existing item and then just say work on this until some criteria is met... In that sense, improving an existing item."

> "I do want to bump up the reward. So we need to expose players to a ton of more items and the 60 item limit that we have in the bag right now might not be enough. Especially since that 60 items is supposed to outfit 20+ creatures."

> "I would maybe go ahead and just remove the level cap of items, or the level requirements of items themselves, and make the level of an item... basically an item level... It just says how good the item itself is and how good the rolls it can have are. What determines item level? I don't know. Maybe it's a combination of many things... It would even be cool to have it tied to some kind of a server item level cap... maybe increase this slowly, but who knows, maybe the review panel will disagree with me here."

> "If the player can choose, all right, let's start making some Tide element scarves, then maybe the crafter will put out something like that... give it a blueprint and say, hey, craft these until you find the best item... with good luck they'd hit an epic roll, and with good luck they'd make that have good modifiers, and then those modifiers would be high strength, high pip value."

> "When the items are being crafted and they pile up as the user logs back in, we'd show them like best results first and kind of celebrate those new finds."

## What is decided

- **V-GEAR-1 Big rolls, big lottery.** Base items have small fixed stats; item level sets how strong rolled modifiers can be; rarity sets how many roll; the best item is luck on top of a good base, a high item level and an epic roll. The chase is the fun.
- **V-GEAR-2 Many chances to roll.** The Forge's steady work is the main source of rolls: a player sets a blueprint (and its element) and the smiths keep making pieces, so "did I get anything good?" has an answer every visit.
- **V-GEAR-3 Item level is quality, not a requirement.** Any creature can wear any item; the wear rule (wearer level at least item level, `RULES.gear`) goes. Item level only says how good an item and its rolls can be. (Today's slot unlock levels, Scarf at 7 and Charm at 13, are combat v2's to keep or drop.)
- **V-GEAR-4 The best first.** When a batch of pieces comes home, the best are shown first and celebrated in the return walk (V-RET-2).
- **V-GEAR-5 No currency orbs at the start.** Improving existing items is a later Forge job ("work on this until some criteria is met"), designed after the base loop.

## Decided in round 10 (Q24 to Q26)

- **V-GEAR-6 Worn gear does not count; the bag holds 200** (Q24). Items a creature wears live on it.
- **V-GEAR-7 Tools to manage the bag, not rules that hide loot** (Q24). No loot filter: "there's no game being played behind the scenes. You're just looking at the results of a crafting process. So you're kind of expecting to see this big pile of loot". Instead:
  - **Filter, sort and search**: by rarity, item level, slot, element, a stat ("the most attack, speed or crit chance") and modifier lines.
  - **Bulk dismantle**: filter (example: commons below an item level), select all, dismantle.
  - **Stats at a glance**: an item's stats and today's comparison ("the stats comparing is really good") without opening a drawer (hover on desktop; the phone needs its own answer).
  - **From the creature's side**: "find the best item for this creature" as its own flow, not browsing the bag.
  - **Exciting items stand out**: a visual highlight by how good an item really is, not by rarity alone ("a common item with a high item level is more valuable than an epic item with a low item level").
  - Batches come home best first (V-GEAR-4).
  - This is UI work for the valley's phase 4, following `docs/design/ux-patterns.md`.
- **V-GEAR-8 A server item level cap that rises, tried and watched** (Q25). The source sets an item's level, never above the server's cap; the cap rises with raid wins (on combat v2's fixed boss track a "win" is a kill, the rank rises only on a kill and Festival weeks pause it, so a server can sit on one boss for weeks: the slow rise with time carries more weight than first thought) and slowly with time, never falls, and is shown at the Forge with its next step. Misa is sceptical and wants it watched: "this perfect craft that I finished last week already is kind of outdated. Maybe not. Maybe they'll think that it's a great way to have something more to craft". He prefers players rolling new items over upgrading one item forever ("If done wrong, this will lead to players just having a single item that they would never let go of"). The ladder runs to about 100, and each modifier tier (pips 1 to 5) unlocks at an item level threshold, so most rises change little and a threshold is an event everyone sees coming; a step can be several levels (round 11, Q27).
- **V-GEAR-9 No pity floor** (Q26). Pure luck, with odds shown. Path of Exile has no floor either: its control comes from currency and a deterministic crafting bench. Instead, partial wins and a consolation:
  - **More lines, so partial wins are common** (an epic with "three good lines out of five"): the counts are open (Q29).
  - **Deterministic pools**: a slot includes or excludes lines but never favours them; an element may favour its own lines, or own them outright (Q28). A player who wants dodge knows which pieces can roll it.
  - **Blueprint quality is the consolation prize**: crafting and dismantling pieces of a blueprint raise its quality (today's marks, back after the scouts and Forge panel removed them), and quality raises the chance of better rarity. With many more rolls it must fill more slowly, and its cap and effect can grow with the Forge's server level and the player's mastery of the blueprint.
- **V-GEAR-10 The cap rises through the whole valley, not the raid alone** (round 11, Q27: "if players can't beat the raid, tough luck... we should make other systems feed into that"). Proposed with the commons (`commons.md` V-COM-12, V-COM-13): the Forge's server level, completed collections of rare finds socketed into buildings (Stardew Valley's community center), raid kills on combat v2's track, and the server's creatures growing all add steps of one or more levels. One bar at the Forge shows the cap, its next threshold and every source that fed it. It never falls.
- **V-GEAR-11 Elements own their lines** (round 11, Q28). An element piece rolls its own element's lines and neutral lines, never another element's. A place or boss of an element drops mostly that element's pieces, plus neutral ones and, now and then, another element's. Crafting another element's line onto a piece is a later idea, not planned.
- **V-GEAR-12 Lines per rarity: 1 / 3 / 5** (round 11, Q29): "rares are already really good... epics at 5 are actually a really exciting drop". Combat v2 scales line values to match.
- **Improving items later** stays a later Forge job, bounded so it never makes one item worth keeping forever (V-GEAR-8).

## Cheap to store

Melted pieces are counts, never rows; a batch keeps only its best few as items (the read budget, `docs/design/database-reads.md`). Crafts resolve on the owner's visit with live randomness, capped per day.

## Today, for reference (`packages/game/src/rules/config.ts`, `gear`)

Item levels 1 to 20; a wearer must be at least the item's level; five tiers ("pips") per line, the best tier capped by item level (tier I from 1, II from 5, III from 10, IV from 15, V from 20) and rolled 15 / 30 / 30 / 25 counting down from the best; 1, 2 or 3 rolled lines by rarity; a bag of 60; item level from the source (crafting: twice the Crafting level; trips: the explorer's rank; the dungeon: its depth; the finale: the Boss Rank).
