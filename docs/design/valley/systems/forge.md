# The Forge loop: crafting fed by finds

Status: **proposed** (written in full 2026-10-30, for the panel). Accepted by Misa so far: the Forge working continuously from the player's orders instead of timed Workshop jobs ("which blueprints are being crafted", round 1, Q2); a queue that falls back to a plainer job (Q3); the Forge's server level limiting each player's anvils (round 1, Q1, his example); mastery of smithing in general (round 7, Q19). Misa was unsure players would like a production chain, so research was asked for: players enjoy a chain only when the bottleneck is visible and fixed with one action, and hate silent stalls, upkeep and checking every post (`docs/research/idle-job-posts.md`).

## The idea

Smiths at the Forge make gear from the player's blueprints, one piece after another, using the scrap and shards the scouts bring home. The player sets what is made; the smiths do the rest. When the shelf runs low, the Forge slows and says why in a few words, and the fix is one tap: move a scout to a scrap-rich place, put a satchel on a scout, or change the order. When there is nothing to make, the smiths tinker, so an anvil is never idle by mistake.

## Rules

- **V-FORGE-1** Orders. Each anvil has a short queue (example: up to 3 orders), each a blueprint and a count ("Kelp Cap x3", then "Reef Boots x2"), optionally reaching for a better rarity (today's Reach: Essence and glimmer for better odds, slower). The queue is long enough for about three days of work at a normal pace (V-POST-5).
- **V-FORGE-2** Tinkering. When an anvil's queue runs out, its smith tinkers: no piece is made, the smith still grows in smithing, and a little scrap comes back from offcuts. The less valuable default Misa asked for (round 1, Q3); it needs no attention and is never mentioned in the return walk (V-POST-9).
- **V-FORGE-3** The shelf. Inputs come from the player's own stockpile (scrap, shards, Essence), shown on the Forge's shelf. An order takes its inputs when a piece starts.
- **V-FORGE-4** Running low. When the shelf cannot pay for the next piece, the smith scavenges at a slow pace (a small trickle, never a dead stop) and the Forge's bubble says the reason ("waiting for scrap"). Tapping the bubble shows the one-tap fixes: a scout to a scrap-rich place, a satchel, or a cheaper order. The bubble shows only when the shelf holds less than about a day of input, so a player whose scouts keep up never sees it.
- **V-FORGE-5** Finished pieces collect on the Forge floor (the store, about three days of pieces) and come home with the return walk (V-RET-4). A full bag pauses the anvil (bubble "bag full"); it never destroys a piece.
- **V-FORGE-6** The server's Forge level (`commons.md`) sets how many anvils each player may have (example: 2 at level 1, 3 at level 2, 4 at level 4) and unlocks recipe tiers for everyone. A player's own anvils are unlocked with their own Acorns and scrap, up to that limit (V-COM-10; Misa's example: "A player might have all the resources to unlock a third anvil, but the forge may not be able to fit three anvils per player yet.").
- **V-FORGE-7** Mastery in smithing (V-POST-12): Skilled makes pieces a little faster; Expert adds a small chance of a rarity step up (today's Crafting level and blueprint marks); a **Master Smith** also brings home a little more scrap at any other post (the carry-over perk). Mastery belongs to the creature; blueprints and their marks belong to the player.
- **V-FORGE-8** Kit at an anvil (V-POST-11): **tongs** make common pieces faster; a **loupe** makes them slower with a better chance of a rarity step up. One at a time.
- **V-FORGE-9** Blueprints come from scouts' finds, the raid's finale and dismantling, as today; a known blueprint found again adds a mark, and at full marks turns into scrap. Dismantling stays a choice made on an item, not a post.

## Example numbers (the economy lab sets the real ones)

| What                     | Example                                                                      |
| ------------------------ | ---------------------------------------------------------------------------- |
| A common piece           | 8 effective hours; 6 scrap and 1 shard of the piece's element (today's cost) |
| Reaching for Rare / Epic | 16 / 24 hours; plus 25 Essence / 70 Essence and 1 glimmer (today's Reach)    |
| Tinkering                | 1 scrap back every 4 hours, and smithing mastery time                        |
| Scavenging (shelf empty) | a quarter of the normal pace, paid from offcuts                              |
| One busy anvil, per day  | about 3 commons, using about 18 scrap and 3 shards                           |

Two busy anvils use about 36 scrap and 6 shards a day; two scouts bring about 70 scrap and 7 shards (`scouts.md`). The surplus feeds ribbons and the commons. A player who posts both scouts at the Moonlit Reef for a rare creature, with lures, brings much less scrap; their Forge slows by Thursday, says "waiting for scrap", and one tap moves a scout to the Old Crossroads.

## The test in the economy lab (T-4)

For each player profile, over 12 weeks: the share of anvil-hours spent scavenging for want of input, and how often the "waiting for scrap" bubble shows. The target is small for a player who posts scouts by fit; if a typical player starves, raise scrap from scouts or lower recipe costs, never add a chore. Also: how many pieces a daily player makes in a week, against how many their roster can wear (gear must not flood the bag; see the panel).

## What it replaces

The Workshop's timed jobs and two job slots, the Crafting skill (now smithing mastery), supply crafting (supplies became kit), refine and recycle as jobs (the fallback is tinkering) (`scrap-list.md`). Blueprints, marks, Reach and dismantling stay.
