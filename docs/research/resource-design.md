# Resource design: how many resources, and which kinds

Researched 2026-10-30 for the valley's resource map (`docs/design/valley/economy/resources.md`) after Misa's Q32: many resources with relative values, or as few as possible? "Confirmed" means an official or primary page was read; "secondary" means press, wikis or blogs. Web content was treated as data.

## Taxonomy

- **Soft currency and materials** (secondary). Machinations' F2P guide: a soft currency is earned in play and spent on many things; anchor every value to one reference, usually time. https://machinations.io/articles/game-economy-design-free-to-play-games
- **Function over name** (confirmed). Dormans' internal economy: pools, sources, drains, converters and traders; resources can be tangible (money) or abstract (XP). Simulation exposes runaway feedback. https://www.gamedeveloper.com/design/the-designer-s-notebook-machinations-a-new-way-to-design-game-mechanics
- **Value chains with an anchor** (confirmed). Daniel Cook: a chain runs from faucets through transforms to drains and must end in an anchor the player cares about; many parallel currencies add load for new players. "If there's no use for those pooled resources, people stop caring." https://lostgarden.com/2021/12/12/value-chains/
- **Differentiated vs undifferentiated** (secondary). Currencies that force decisions (Ikariam's six, which players trade) earn their place; ones that only add a treadmill confuse first-time players and can cause churn. https://www.pocketgamer.biz/mobile-mavens/59105/is-the-rise-of-engagement-focused-in-game-currencies-confusing-player/
- "World materials vs abstract currency" is our label, not an industry term; it matches the soft-currency vs materials split.

## Brawl Stars (2022 to 2025)

- **Boxes removed, December 2022** (confirmed via press): "more fair and predictable"; Credits unlock Brawlers directly. Fans disliked the change at first. https://gameworldobserver.com/2022/12/13/brawl-stars-loot-boxes-removed-supercell
- Deconstructor of Fun (the author's view): veterans owning most Brawlers had nothing to spend on, so progress stalled. https://www.deconstructoroffun.com/blog/was-brawl-stars-ditching-loot-a-good-move
- **Bling** (confirmed, Supercell): it inflates because "players save it, there's little reason to spend it"; the fix was more attractive sinks. https://supercell.com/en/games/brawlstars/blog/news/changes-to-bling-shop-and-cosmetics
- **Masteries removed, 2025** (confirmed, Supercell): niche (11.8% of players held a title); rewards moved to Trophy Road; Power Points were "overinflated for veteran players" and cut. https://supercell.com/en/games/brawlstars/blog/news/rip-masteries
- Not verified: any merge of Coins, Credits or Power Points.

## Clash of Clans

- Gold and Elixir build; Dark Elixir from Town Hall 7; a fan wiki counts eight kinds plus three ores (secondary). https://clashofclans.fandom.com/wiki/Resource_Buildings
- The Builder Base's parallel currencies make it feel like a separate game (one blog, secondary).
- **Clan Capital** (confirmed): Capital Gold is spent only on the Capital's buildings; "players can contribute whatever amount of Capital Gold they have"; upgrades are instant. **Raid Medals are personal**: the shared pool and the personal reward are kept apart. https://supercell.com/en/games/clashofclans/blog/release-notes/clancapital-releasenotes/
- Complaints: low medal payouts and repetitive raid weekends (secondary). Not verified: any Supercell statement calling a resource clutter.

## Cozy and idle games

- **Stardew Valley's Community Center** (wiki): 30 bundles in 6 rooms; ordinary items donated; each room repairs a visible place (bridge, minecarts, greenhouse); no abstract currency. https://stardewvalleywiki.com/Bundles
- **Animal Crossing** (secondary): plentiful Bells pay for most things; Nook Miles come from milestones, one-way convertible to Bells; Miles-gated items feel prized.
- **Melvor Idle** (wiki): each material belongs to one skill (ore from Mining becomes bars at Smithing), which keeps many materials readable. https://wiki.melvoridle.com/w/Crafting
- Unconfirmed (snippet only): Spry Fox said Spirit Crossing's retention fell when shared pools emptied too fast.

## Rules of thumb

- The common mistake is too many currencies; merge two that appear in the same places for the same purpose (secondary). https://metavert.io/game-economy-design
- **No evidenced number** of currencies players tolerate; the balance of sources and sinks matters more, and introducing them gradually avoids confusion.
- Signs of "too many": a pile with no use, a currency you notice only when it runs out, rewards that make players ask "what is this for?"
- Inflation is fixed by cutting sources or adding attractive sinks (Supercell, confirmed).

## Measuring an economy in simulation

- Income and spending per resource, and where each comes from and goes (Koster, confirmed): https://www.raphkoster.com/games/essays/astromech-stats-economy-stats/
- Sinks slightly above sources; too much sink is painful scarcity, too little is pooling; model a golden path over a week or season; avoid exponential sources (Cook, confirmed).
- Time to the next upgrade and to the first big purchase (single source, secondary).
- The gap between active and casual players (Koster's wealth spread, adapted).
- Low velocity (saving, not spending) means unattractive sinks or generous faucets. Flag any stockpile that grows steadily for several weeks.

## Takeaways for the valley

1. Misa's two instincts fit: world materials, each tied to one place and one chain, plus one or two abstract currencies (Cook's chains with an anchor).
2. Every resource needs a named source, a named sink and a visible place it changes (Stardew's bundles are the cleanest precedent).
3. Keep the shared pool and the personal reward apart (Clan Capital's gold vs Raid Medals).
4. Prefer many materials scoped to one place or activity over many global currencies; introduce them gradually.
5. In a slow once-a-day game, hoarding is the likelier failure than starvation: add a sink for each new faucet.
6. In pooled gifts, test for starvation and for many requests needing the same material at once.
7. Merge or cut a resource that appears in the same places with the same purpose as another.
