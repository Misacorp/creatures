# The Forge loop: crafting fed by finds

Status: **proposed**, revised after the panel (`reviews/2026-10-30-scouts-forge.md`). Accepted by Misa so far: the Forge working continuously from the player's orders instead of timed Workshop jobs ("which blueprints are being crafted", round 1, Q2); a queue that falls back to a plainer job (Q3); the Forge's server level limiting each player's anvils (round 1, Q1, his example); mastery of smithing in general (round 7, Q19). Decided in round 9: the Forge is the main source of gear rolls in Misa's Path of Exile-style lottery (Q22, `gear.md`, details open); its orders wait on the element shards they need (Q23). Misa was unsure players would like a production chain, so research was asked for: players enjoy a chain only when the bottleneck is visible and fixed with one action, and hate silent stalls, upkeep and checking every post (`docs/research/idle-job-posts.md`).

## The idea

Smiths at the Forge make gear from the player's blueprints, one piece after another, using the materials the scouts bring home. The player sets what is made; the smiths do the rest. When an input runs short, the Forge slows and shows which one inside its scene; the fix is one tap. When there is nothing to make, the smiths tinker, so an anvil is never idle by mistake.

## Rules

- **V-FORGE-1** Orders. Each anvil has a short queue (example: up to 3 orders). An order is a blueprint and a count ("Kelp Cap x3"), optionally reaching for a better rarity (Reach: Essence for better odds, slower), or **"for my team"**: the smith makes pieces for the player's creatures with empty or weaker slots, repeating until they are filled.
- **V-FORGE-2** Tinkering, the one fallback. When an anvil cannot make its order (the queue ran out, or an input is short), its smith tinkers: no piece is made, the smith still grows in smithing, and a trickle of scrap comes back (example: 1 every 12 hours), which restarts a waiting order by itself. It needs no attention and is never mentioned in the return walk (V-POST-9).
- **V-FORGE-3** The shelf. Inputs come from the player's own stockpile (scrap, shards, Essence), shown on the Forge's shelf. An order takes its inputs when a piece starts.
- **V-FORGE-4** Running short (round 9, Q23: "if you're waiting for Reef shards, then you need to have explorers out in the Reef finding those Reef shards for you. Or then maybe you've stockpiled a lot of them up"). Each piece needs a shard of its element; a stockpile carries an order without scouts at that place. The Forge shows inside its scene which input is short and why (an empty spot on the shelf, "waiting for Reef shards"; "Mossback is deep in the Reef"), with the one-tap fixes (V-RET-9). A bubble over the Forge appears only when a shortage has lasted more than a day, never in the return walk.
- **V-FORGE-5** Finished pieces collect on the Forge floor (the store, about three days of pieces) and come home with the return walk (V-RET-4). How pieces are stored and which go away by themselves is open (`gear.md`).
- **V-FORGE-6** The server's Forge level (`commons.md`) sets how many anvils each player may have (example: 2 at level 1, 3 at level 2, 4 at level 4) and unlocks recipe tiers for everyone. A player's own anvils are unlocked with their own Acorns and scrap, up to that limit (V-COM-10; Misa's example: "A player might have all the resources to unlock a third anvil, but the forge may not be able to fit three anvils per player yet.").
- **V-FORGE-7** Mastery in smithing (V-POST-12): each step makes pieces faster; a **Master Smith** also brings home a little more scrap at any other post (the carry-over perk). A crafted piece comes out at the Forge's fire, the server's item level cap (`commons.md` V-COM-13), so every warming lifts the next pieces; a smith's level does not set it.
- **V-FORGE-8** Rarity has three levers: Reach on an order, blueprint quality (V-FORGE-9), and the **loupe**, the anvil's kit (slower, a better chance of a rarity step up). The other anvil kit, **tongs**, makes pieces faster.
- **V-FORGE-9** Blueprints come from scouts' finds, the raid's finale and dismantling, as today; a known blueprint found again, and every piece of it crafted or dismantled, raises its quality (today's marks; Misa, round 10, Q26, reversing the panel's removal), and quality raises the chance of better rarity. Dismantling stays a choice made on an item, not a post.
- **V-FORGE-10** The shard exchange (round 14, Q34: "What better way to create relationships between currencies than a currency exchange"). At the Forge, shards of any element trade for the element an order or a ribbon needs (example: 3 for 1), with a small chance of a bonus (an "exchange crit", example: 10% for 2). It is the one-tap fix when the Forge waits on a shard (V-FORGE-4). Later: visiting traders with other rates, and Forge levels or projects that improve the rate (`later.md`).

## Example numbers (the economy lab sets the real ones)

| What                     | Example                                                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| A common piece           | 16 effective hours (about 1.5 a day per anvil); 6 scrap and 1 shard of the piece's element (Q23); the pace may rise with Q22's "many chances to roll" |
| Reaching for Rare / Epic | 32 / 48 hours; plus 25 Essence / 70 Essence (glimmer is gone, round 14, Q33)                                                                          |
| Tinkering                | 1 scrap back every 12 hours, and smithing mastery time                                                                                                |
| Two busy anvils, per day | about 3 commons, using about 18 scrap and 3 shards                                                                                                    |

Two scouts at fitting places bring about 45 scrap and 12 shards a day (`scouts.md`); the rest feeds ribbons and the commons.

## The test in the economy lab (T-4)

For each player profile, over 12 weeks: the share of anvil-hours spent tinkering because an input was short, and which input it was; pieces made, worn and dismantled per week, and the week the bag first fills.

## What it replaces

The Workshop's timed jobs and two job slots, the Crafting skill (now smithing mastery), blueprint marks, supply crafting (supplies became kit), and refine and recycle as jobs (the fallback is tinkering) (`scrap-list.md`). Blueprints, Reach and dismantling stay.
