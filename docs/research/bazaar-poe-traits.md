# The Bazaar, Path of Exile affixes, adjacency systems and creature traits (research, 2026-10-16)

Why: input for the gear modifier list and the creature talents (decisions of 2026-10-16, "Misa's second round"). Researched by the researcher agent. Many primary pages (poewiki, Mobalytics, bazaardb) were blocked, so most points come from secondary summaries. Confidence: **confirmed** (official or wiki page read), **secondary**, **unconfirmed** (background knowledge; verify before relying on it).

## The Bazaar (Tempo Storm)

- **Sizes and tags** (secondary): items are Small, Medium or Large and carry tags. Each hero draws from a tagged subset with its own focus (Vanessa: Weapon, Aquatic, Burn, Poison; Dooley: much Burn, little Poison; Pygmalien: Property items that Haste, Slow or Freeze other items). Builds form around tag pairs, for example an Aquatic item that Hastes another (Sharkray with the Astrolabe).
- **Adjacency** (secondary): "Aila Chibi" gives adjacent items +10 / +20 / +30 / +40 by tier; "3D Printer" becomes three copies of the Small item to its left. Position on the board matters, and a Large item takes several slots.
- **Tiers** (secondary, possibly outdated): Bronze, Silver, Gold, Diamond, Legendary. The same item with bigger numbers per tier. Upgrades come with level-up rewards; encounter tier scales rewards. Tooltips show the Diamond version.
- **Enchantments** (secondary): one named effect per item, for example Golden (doubles value), Heavy (Slow), Icy (Freeze), Turbo (Haste), Shielded (shield equal to damage), plus Restorative, Toxic, Fiery, Shiny, Deadly, Radiant, Obsidian, Mossy.
- **Keywords** (secondary): items fire on cooldowns; Haste, Slow, Freeze; Shield blocks damage, Poison ignores it, Burn is halved by it; Ammo, Charge, Crit Chance.
- **Sentiment** (secondary): Steam about 70–73% positive (13–15k reviews). One high-rank reviewer said luck decides the top of the ladder once builds are known. Excitement comes from items interacting by tag and position and from finding combos mid-run (unconfirmed, analysis).

## Path of Exile affix design

- **Prefix and suffix** (confirmed for item structure): magic items 1 prefix + 1 suffix, rares up to 3 + 3. Prefixes lean offensive or life, suffixes resistances and utility (secondary); Maximum Life is always a prefix, resistances always suffixes.
- **Item level gates tiers** (secondary): the top elemental resistance tier first appears at item level 82; lower item levels reach only lower tiers. This matches "item level fixed at drop or craft".
- **Weights** (secondary): chance = a mod's weight / the total weight of legal mods, excluding groups already on the item. Valuable mods get low weights.
- **Slot-exclusive mods** (unconfirmed): movement speed on boots and similar.
- **Special pools and currency** (unconfirmed): fractured mods are locked; essence and influenced mods are separate pools; orbs add, reroll or remove mods.
- **Casual overload** (secondary): dozens of currencies, hidden weights, item-level thresholds; players need outside calculators and databases.

## Other positional and adjacency systems

- **Backpack Battles** (secondary): grid adjacency; items with stars activate when a matching type touches the star (Carrot: −10% cooldown per non-Carrot food on a star); bags give effects to items inside; adjacent items combine into upgrades (Wooden Sword + 2 Whetstones = Hero Sword). Players say star placement is often worth more than the item.
- **Super Auto Pets, Teamfight Tactics, Hearthstone Battlegrounds** (unconfirmed): "friend ahead / behind" abilities, row and hex positioning, "adjacent minions +X".
- **Peglin** (secondary): synergies come from relic and orb stacking, not adjacency. Luck be a Landlord uses grid adjacency (unconfirmed).

## Creature traits in collectors

- **Palworld** (confirmed): 0–4 passives per Pal, no duplicates, seven tiers (rank 4 with a rainbow sub-tier down to −3); about 115 passives; inherited from parents; a Surgery Table changes passives for gold. Tier colours and short names read at a glance.
- **Temtem** (confirmed): each species has one of two possible traits (some only one), set at capture or breeding; passive combat effects; some traits are exclusive to one line. Per-species flavour, not a big rolled pool.
- **Monster Hunter Stories 2** (secondary): genes on a 3×3 grid, some slots locked at first; lines of the same type or element give "bingo" bonuses (3 red in a row: +10% fire); a rainbow gene is a wildcard (one per monster); Rite of Channeling moves genes and consumes the donor; stacking identical genes upgrades them twice.
- **Cassette Beasts** (secondary): fusion of two monsters' types, stats and moves; 120 bases give 14,000+ fusions. Not a trait pool.
- **Pokémon** (unconfirmed): one ability plus a rare hidden ability; natures +10% / −10% on two stats, shared by all species.

## What fits Leet Creatures

- Tiered numbers on the same line (4–5 tiers), gated by item level.
- A few slot-exclusive lines per slot plus a weighted shared pool; 6–10 lines per slot is enough for a small server.
- Rarity adds line count (magic 1 + 1 to rare 3 + 3 as the model), at most 3–4 lines per item.
- Show tiers and a clear "good roll" marker; avoid PoE's hidden opacity.
- Dismantling as the pity valve instead of a web of crafting currencies.
- Elements and roles as Bazaar-style tags: lines that boost Tide creatures, Setters, Payoffs.
- Adjacency through rows and slots ("creature ahead / behind", "same row"), as later modifiers, one per item.
- Species trait pools (Temtem's "one of two" is the most readable; Palworld's slots with colour tiers also work); duplicates unlock or upgrade them, like gene stacking.
- A Monster Hunter Stories 2 style talent grid with line bonuses as a long-term idea; it mirrors the board.
- One-line names with tier colours (Palworld) as the readability bar.

## What does not fit

- The Bazaar's real-time cooldown, Haste, Slow and Freeze interplay; pick one or two keywords at most.
- Per-run shops and PvP ladders; high-variance decisions that decide rankings.
- PoE's currency web, locked mods and rerolls (conflicts with "no rerolls").
- Large hidden pools and weights that need outside tools.
- Free-form grid placement (bags, stars) needing drag-and-drop puzzle UI.
- Wide fusion or breeding systems (Cassette Beasts, Palworld inheritance).
- Negative traits on duplicate-catch talents.
- Pokémon-style natures: a second hidden stat layer that clashes with gear.

## Sources

- Mobalytics, The Bazaar: https://mobalytics.gg/the-bazaar/database/items-and-enchantments, https://mobalytics.gg/the-bazaar/items-enchantments-skills, https://mobalytics.gg/the-bazaar/the-dragons-items, https://mobalytics.gg/blog/the-bazaar/keywords-and-terms/, https://mobalytics.gg/the-bazaar/vanessa-guide, https://mobalytics.gg/the-bazaar/guides/level-up-rewards, https://mobalytics.gg/the-bazaar/guides/pve-encounters-and-drops
- The Bazaar reviews: https://steampulse.org/game/1617400 and https://stmstat.com/app/1617400/reviews
- Punished Backlog, Reynad and The Bazaar: https://punishedbacklog.com/the-bazaar-hearthstone-reynad-ccgs/
- PoE2 wiki, Mod: https://www.poe2wiki.net/wiki/Mod
- Mobalytics, PoE2: https://mobalytics.gg/poe-2/guides/item-modifiers and https://mobalytics.gg/poe-2/guides/crafting-basics-part-1
- Backpack Battles: https://steamcommunity.com/app/2427700/discussions/0/4290313152625938174 and https://gamingonlinux.com/2024/03/backpack-battles-is-another-clear-indie-steam-hit
- Peglin wiki: https://peglin.wiki.gg/wiki/Brassicaceae_Knuckles
- Palworld wiki, Passive Skills: https://palworld.wiki.gg/wiki/Passive_Skills
- Temtem wiki, Traits: https://temtem.fandom.com/wiki/Traits and https://temtem.wiki.gg/wiki/Attack_T
- Monster Hunter Stories 2: https://windowscentral.com/monster-hunter-stories-2-rite-channeling-guide and https://www.pcgamer.com/au/monster-hunter-stories-2-gene-rainbow-rite-of-channeling
- Cassette Beasts: https://www.cassettebeasts.com/2022/11/30/elements-chemistry-fusion/ and https://wiki.cassettebeasts.com/wiki/Fusion
