# The Forge loop: crafting fed by finds

Status: **proposed**; the Forge working continuously from the player's orders instead of timed Workshop jobs is **accepted** (Misa, round 1, Q2: "which blueprints are being crafted"). Misa was unsure players would like a production chain, so the research was asked for it.

## The idea

Smiths at the Forge craft the blueprint the player set, one piece after another, using scrap and parts the scouts bring home. The player steps in only to set what is made, or when a post lags. Research verdict: players enjoy a chain only when the bottleneck is visible and fixed with one action, and hate silent stalls, upkeep and checking every post (`docs/research/idle-job-posts.md`, "Job posts in other games").

## Rules (draft)

- **V-FORGE-1** Each anvil has a short queue of orders: a blueprint and a target (example: "Kelp Cap, keep making until 3", then "Reef Boots x2"). When the queue runs out, the smith refines or recycles by default, a plainer and less valuable job, so an anvil never sits idle by mistake (V-POST-9).
- **V-FORGE-2** Inputs come from the player's own stockpile (scrap, parts), shown on the Forge's shelf. The stockpile is hours to days deep at a normal pace.
- **V-FORGE-3** When an input runs low, the smith slows (never stops dead: a small trickle) and the Forge's bubble says the reason in a few words ("waiting for scrap"). The one-tap fix is shown: move a scout to a scrap-rich place, or change the order.
- **V-FORGE-4** Crafted pieces wait on the Forge floor until collected; the bag's limit pauses the anvil, never destroys a piece.
- **V-FORGE-5** Rarity reach, Crafting levels and blueprints carry over from today's Workshop; dismantling stays a choice made on an item, not a post.
- **V-FORGE-6** The server's Forge level (see `commons.md`) sets how many anvils each player may have and unlocks recipes for everyone. A player's own anvils are unlocked with their own resources, up to that limit (V-COM-10; Misa's example: "A player might have all the resources to unlock a third anvil, but the forge may not be able to fit three anvils per player yet.")

## The test in the economy lab (T-4)

For each player profile, over 12 weeks: the share of anvil-hours spent slowed for want of input. The target is small; if a typical player starves, raise scrap from scouts or lower recipe costs, never add a chore.
