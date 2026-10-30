# Gear in the valley: crafting, item level and the lottery

Status: **direction set by Misa** (round 9, Q22, 2026-10-30); the system is **to design**, with research under way. Combat v2 (`docs/design/combat/`, branch `combat-v2-bosses`) owns gear's stats, lines and their tuning; this doc owns how items are made, improved, stored and found in the valley, and what sets their item level. Agree changes on that seam with the combat lead.

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

## Open, waiting on research (`docs/research/`, round 10)

- **Item volume and storage.** A bag of 60 cannot hold a roster's worn gear plus a Forge's output. What separates worn items from the bag, how pieces that are not worth keeping go away by themselves (salvage rules, filters), and how big storage should be.
- **What sets item level.** A combination of sources (the smith's level and mastery, the Forge's server level, the blueprint, the dungeon's depth, the raid's Boss Rank), possibly under a server-wide cap that rises slowly.
- **The craft-until loop.** How "craft these until you find the best item" works on a once-a-day visit: what the player sets, when the smith stops or keeps going, what comes home.
- **Improving items later**, without orbs.
- **Keeping the lottery fun** for a casual player: floors, celebration, choosing what to chase.

## Today, for reference (`packages/game/src/rules/config.ts`, `gear`)

Item levels 1 to 20; a wearer must be at least the item's level; five tiers ("pips") per line, the best tier capped by item level (tier I from 1, II from 5, III from 10, IV from 15, V from 20) and rolled 15 / 30 / 30 / 25 counting down from the best; 1, 2 or 3 rolled lines by rarity; a bag of 60; item level from the source (crafting: twice the Crafting level; trips: the explorer's rank; the dungeon: its depth; the finale: the Boss Rank).
