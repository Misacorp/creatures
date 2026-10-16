# Appealing loops: system identity, gear, crafting lotteries, collection and endgame (research, 2026-10-16)

Why: input for `docs/design/systems-review.md` (Misa's decision 8 of 2026-10-16: step back, learn from games with similar systems, before the gear and creature revamps). Researched by the researcher agent. Confidence: **confirmed** (primary or official source read), **secondary** (press, guide, wiki), **unconfirmed** (background knowledge). Several primary pages returned 403/404 (Last Epoch, Icy Veins, Bungie), and PoE, Epic Seven, The Bazaar, Melvor and Cassette Beasts gave little, so sections 1, 3 and 5 lean partly on background knowledge.

## 1. System identity: one job, one currency

- **AFK Arena / AFK Journey** (secondary): many currencies, largely to dilute the premium currency (monetisation, not clarity); AFK Journey offsets the overload with a pop-up per new feature. A poor model for a small-server game.
- **Teamfight Tactics, "Fates learnings"** (confirmed, Riot): a rotating mechanic stacked on another "drowned out the core gameplay"; players felt less in control. Riot wants mechanics that promote agency over luck. Keep the core loop (team building, positioning) the star.
- **Diablo 4 Season 4** (confirmed, Blizzard): moved complexity out of dropped items into dedicated systems (Tempering, Masterworking), each with one job.
- **Destiny 2 crafting** (secondary): launched with messy currencies and unclear sources; later streamlined.
- Piles nobody spends happen when a currency has no sink with a desirable outcome (unconfirmed, general).

## 2. Gear identity and affix pools

- **Diablo 4 "Loot Reborn"** (confirmed): Legendary items 3 affixes, Rare 2, each stronger; conditional affixes replaced by flat, readable ones; fewer drops, more of them matter; Greater Affixes (1.5x) only on top items, cannot be enchanted in; Tempering adds one affix from a category-limited recipe (weapon, offensive, defensive, utility…), with a limited number of attempts; Masterworking a linear upgrade path. Goal: less time sorting loot. Sentiment rose sharply (record Steam peak; "imagine if it had been like this since release"); complaints were about Masterworking cost.
- **Diablo 4 Season 11** (confirmed): Tempering is no longer random (pick the exact affix); Masterworking raises Quality step by step, with a final capstone that upgrades one random affix to Greater. "Choice over randomness", "a distinct and linear path": late game moved to deterministic choice.
- **Honkai Star Rail / Genshin relics** (secondary): five layers of randomness (main stat, substats, starting substat count, upgrade targets, values) are called "maddening"; one bad substat ruins a piece. More than two layers on one item feels punishing. Main stats are limited by slot (a legible pool).
- **Summoners War runes** (secondary): Grindstones raise a substat, Enchanted Gems replace one (only at +12): a limited, player-chosen reroll late in the item's life.
- **Last Epoch** (secondary): each item has Forging Potential, a budget each craft drains by a random amount; shattering returns shards; targeted affix upgrades. Scarce protection items (Glyph of Hope) feel bad.
- **Destiny 2 gear tiers** (secondary): five tiers to restore the loot chase; grind and recycled content criticised.
- General (unconfirmed): limiting the pool by slot, base or set makes every roll legible; item level raising affix caps is the Diablo/PoE model; rarity adding modifier slots is standard; the "perfect roll" chase keeps committed players but can alienate casual ones.

## 3. Crafting as a lottery and currency sink

- **Monster Hunter talisman melding** (secondary): throw spare monster parts or old talismans into a pot, get a semi-random talisman; better pots (unlocked by progress) give better ranges. Wilds does the same with decorations. Works because spare, otherwise useless materials become lottery tickets with a visible tier.
- **Last Epoch** (secondary): the budget caps the gamble and shows progress; shattering refunds part of a failure.
- **Destiny 2 patterns** (secondary): deterministic perfect rolls once a pattern is unlocked, but pattern progress is luck-gated and slow, and crafted weapons made random drops feel obsolete.
- **Palworld** (secondary): random passives from breeding, then a deterministic but expensive top-up (condensing, about 116 duplicates for 4 stars), then refundable fine tuning (souls).
- **What makes a sink feel fair:** a visible, bounded budget; a deterministic fallback; protection or a refund on failure; spare (not required) materials as inputs; a late, targeted reroll; visible odds.
- Path of Exile (unconfirmed): crafting seen as unreliable and opaque without deterministic options.

## 4. Collection pacing and creature design space

- **Super Auto Pets** (confirmed): rosters come in packs, and a Weekly pack rotates every week, mixing pets from other packs; rotation keeps the meta fresh without new content.
- **Teamfight Tactics** (confirmed): each set re-themes traits and champions; layering many set mechanics hurts clarity.
- **Monster Hunter Stories 2** (secondary): a gene grid gives "bingo" bonuses for rows matching element or attack type; gene transfer consumes the donor, so weak monsters stay useful as donors.
- **Temtem** (secondary): fixed per-stat values improved by breeding, plus a training budget; a cosmetic shiny (Luma) chase. The perfection layer serves competitive players; casual players skip it.
- **Palworld** (secondary): passives, condensing and souls keep players working on a creature long after the catch.
- **Idle Champions** (secondary): variants (harder versions of adventures with restrictions) make players rotate different champions.
- General (unconfirmed): shiny and colour variants are a rare trophy chase; content that bans or requires elements, or limits team size, makes the whole roster useful; design axes are role, element, trait, synergy and evolution branch.

## 5. Endgame for maxed teams in low-attention games

- **Game Developer, "3 forms of endgame design"** (confirmed): a fixed ending, scaling (more of the same with bigger numbers, "technically a cheat"), or ascension/prestige (needs a strong curve; restarts that feel the same burn players out; in multiplayer, prestige rewards must not upset balance).
- **TFT sets, Super Auto Pets weekly packs** (confirmed): rotation resets the meta without a prestige.
- **Diablo 4 seasons** (secondary): weak seasonal themes hurt; players want the popular mechanics made permanent.
- **Melvor Idle** (secondary): no prestige; the endgame is mastery, then waiting for content.

## What this suggests for Leet Creatures

1. **One job per currency**, and delete any currency whose sink does not lead to a visible, exciting outcome.
2. **Gear = base + a small affix pool per slot** (about 6–8 affixes), with the base or set fixing 1–2 affixes; flat, readable affixes, no conditional wording (Diablo 4).
3. **At most two layers of randomness** (which affixes at drop, one bounded reroll at craft), with narrow value bands so a bad roll is only slightly worse.
4. **Rarity adds affix slots, not bigger numbers**; a rare "Greater" affix (about 1.5x) is the chase.
5. **A bounded crafting budget with bad-luck protection**: a forging-potential style count of attempts per item, a failed item shatters back into materials, odds shown, a pity counter.
6. **A melding pot for spare materials**: duplicate gear, spare creatures or leftover scrap go in, one new item comes out; better pots unlock with progress. A sink for the weekday idle surplus.
7. **A deterministic option next to every lottery** (after N rolls, or at a high cost, pick the exact affix).
8. **Creatures: trait or gene slots** where matching elements or roles give team bonuses; duplicates feed a few-step star system (a few duplicates per star, not 116).
9. **Rotating weekly raid constraints**: a boss that requires or bans an element, limits team size or boosts a trait, so a roster matters, not one best team.
10. **Shiny and variant trophies** rolled at catch, with a server-wide collection board.
11. **Endgame without a full reset**: a soft seasonal ascension that resets only creature levels for small roster-wide bonuses; rotate seasonal modifiers and keep the best ones.
12. **One new system at a time**, unlocked and explained one by one; cut anything that makes the weekly raid less about team building.

## Sources

- Blizzard, Season 4 Loot Reborn: https://news.blizzard.com/en-gb/article/24077223/galvanize-your-legend-in-season-4-loot-reborn
- Blizzard, Season 11: https://news.blizzard.com/en-us/article/24244465/vanquish-the-lesser-evils-in-season-of-divine-intervention
- Insider Gaming, Loot Reborn: https://insider-gaming.com/diablo-4-season-4-loot-reborn-revealed/
- Dexerto, Season 4 reception: https://www.dexerto.com/diablo/fans-call-diablo-4-season-4-a-new-beginning-2689792/ and https://www.dexerto.com/diablo/diablo-4-peak-player-count-steam-season-4-2766707
- Riot, TFT Fates learnings: https://teamfighttactics.leagueoflegends.com/en-us/news/dev/dev-teamfight-tactics-fates-learnings/
- Wikipedia, Super Auto Pets: https://en.wikipedia.org/wiki/Super_Auto_Pets
- Game Developer, 3 forms of endgame design: https://www.gamedeveloper.com/design/ending-on-a-high-note-the-3-forms-of-endgame-design
- Inverse, HSR relics vs Genshin artifacts: https://inverse.com/gaming/honkai-star-rail-keeps-genshin-impact-relic-artifact
- KeenGamer, crafting in Destiny 2: https://keengamer.com/articles/features/opinion-pieces/where-does-crafting-belong-in-destiny-2/
- PC Gamer, Destiny 2 gear tiers: https://www.pcgamer.com/games/fps/destiny-2-gear-tiers/
- Last Epoch forum, Glyphs of Hope: https://forum.lastepoch.com/t/glyphs-of-hope-should-be-sold-by-vendors/71122
- HighGroundGaming, MH Rise talisman melding: https://www.highgroundgaming.com/mhr-talisman-melding-guide/
- Summoners War wiki, Enchanted Gem and Grindstone: https://summonerswar.fandom.com/wiki/Enchanted_Gem and https://summonerswar.fandom.com/wiki/Grindstone
- PC Gamer, Monster Hunter Stories 2 genes: https://www.pcgamer.com/au/monster-hunter-stories-2-gene-rainbow-rite-of-channeling
- PrimaGames and Pocket Tactics, Temtem: https://primagames.com/gaming/how-to-get-the-best-temtem-svs-tvs-and-traits and https://www.pockettactics.com/temtem/breeding
- XGamingServer, Palworld: https://xgamingserver.com/blog/palworld-perfect-pal-guide/
- MAF, AFK Journey analysis: https://maf.ad/en/blog/afk-journey-analysis/
- Steam, Idle Champions: https://steamcommunity.com/app/627690/discussions/0/1642045003571394503
