# Gear volume, item level and craft-until loops (research, 2026-10-30)

For the valley plan's gear system (`docs/design/valley/systems/gear.md`, round 9 Q22 and round 10). Misa's vision: a Path of Exile-style lottery (small base stats, item level gating how strong modifiers can be, rarity setting how many), the Forge's steady work as the main source of rolls, no currency orbs at the start, item level as quality with no level requirement, the best results shown first.

A researcher agent (read-only web) wrote the report; the lead summarised it. Confidence: **[C]** source read, **[S]** secondary, **[I]** inference. Coverage gaps: nothing usable on Grim Dawn, Torchlight, Monster Hunter augments, AFK Arena, Idleon or Loop Hero; nothing at all on server-wide item level caps that rise over time.

## Item level

- **Path of Exile:** area level sets item level, item level sets which modifier tiers can roll; the tier is picked first, then the value within it. The character level needed to wear an item is usually far below its item level [S]. Players chase item-level thresholds [I].
- **Last Epoch:** affixes have 7 tiers, 1 to 5 craftable and 6 to 7 drop-only; an affix's drop level is separate from the level needed to wear the item [S]. The same clean split between quality and who may wear it that Misa wants [I].
- **Diablo IV:** world tiers gate item quality (Season 4: Sacred only from World Tier III, Ancestral only in IV) [C]. Level gates added to world tiers in patch 1.1.0 were disliked and removed in 1.1.0b [S]. A world tier is chosen per player, not shared.
- **Diablo III's smart loot:** class-suited stats on about 85% of drops [S]; Blizzard's stated aim in Diablo IV Season 4 was to make it "easier to understand which items are upgrades" [C].
- **Server-wide caps that rise:** no source found. The idea is untested; the only related sentiment is that hard gates on progress annoy players (Diablo IV's reversal) [S].

## Loot volume

- Diablo IV Season 4: "spend more time obliterating and less time sorting": fewer drops, each more likely to matter, and salvage that keeps value [C]. Players there complain about time spent salvaging and storing, ask for auto-salvage by quality, and resist hiding "trash" that crafting needs [S].
- Last Epoch has an in-game loot filter (rarity, type, shareable rules) that players tighten as drops improve [S].
- An idle RPG lets players set each rarity to pick up, auto-sell or auto-salvage, unlocked through progression [S]. Idle players complain about losing a legendary to a bag full of junk, and ask for valuable items to bypass a full bag [S].

## Craft-until loops and improving items

- **Last Epoch's forging potential** (0.8.4): each item has a visible pool; each craft spends a random 1 to 15; nothing bricks; the last craft always succeeds; critical successes keep luck alive. Replaced fracture risk because players dreaded stopping and successes did not feel lucky [C].
- **Diablo IV Season 4:** tempering adds an affix per use, limited by a count; masterworking no longer fails; enchant reroll cost has a maximum [C] (details vary between summaries [S]).
- **Honkai Star Rail's Variable Dice:** a limited reroll of a relic's substat upgrades, welcomed ("finally") though some call it weak [S]. Relic RNG frustration is widely reported but anecdotal [S].
- **Path of Exile's Harvest:** in 2021 its lead called some Harvest crafts "too deterministic" and said item acquisition should be random at its core; the nerfs angered part of the community, while others said Harvest made usable items reachable without gambling [S]. Adding deterministic crafting later splits players [I].

## Keeping a lottery fun

- Pity timers are widely approved (86.9% in one survey) [S]; showing odds changes how fair players find a system [S]. No controlled study of visible odds plus a floor was found.
- From the games: losses are never destructive (Last Epoch removed bricking, Diablo IV made masterworking safe) [C]; show remaining attempts [C]; keep a small chance of lucky saves [C]; keep some randomness, or the thrill of finding dies [S].

## The researcher's recommendations (edited)

1. **Worn gear does not count toward the bag.** Items on a creature live on it.
2. **The Forge's output comes home as a batch, best first** (total pips, then rarity), with a marker on pieces better than what a creature wears.
3. **Keep rules at the Forge:** pieces below a rule (example: no line at 4 pips or more, and no upgrade) are scrapped on arrival for part of their materials and never enter the bag; the rule can unlock with progression.
4. **A high roll is never lost to a full bag:** rare and epic pieces, and anything with a 4- or 5-pip line, go to an overflow shelf, never to scrap; items can be locked.
5. **Cheap to store:** scrapped pieces are counts, never rows; keep only the top few of each batch.
6. **Item level** = the lower of the material's level (where the scouts found it) and a server cap; the cap rises with shared milestones (raid wins) and slowly with time, never falls, is visible with its next step, and only raises the ceiling. A bet, with no evidence from other games.
7. **A standing "until" order:** "craft this blueprint until I own a piece with at least N pips (or this line at tier 4 or more); stop after M keepers or when materials run out", resolved on the owner's visit with live randomness, crafts capped per day for cost.
8. **Improving items later:** Last Epoch-style potential (a few visible attempts per item, more on epics; never lowers or bricks; the last attempt succeeds), with the top tier left to the lottery.
9. **Safeguards:** visible odds per item level; a soft pity floor per blueprint shown as a progress bar (a counter, not an orb); misses always return something; choosing what to chase (slot, element, line family); a loud reveal of rare pips; no time pressure.

## Sources

- https://www.poewiki.net/wiki/Ilvl
- https://www.poewiki.net/wiki/Drop_level
- https://poe2wiki.net/wiki/Level
- https://steamcommunity.com/app/2694490/discussions/0/598514011709922083
- https://forum.lastepoch.com/t/affixes-level-requirement-and-drop-level/58385
- https://news.blizzard.com/en-gb/article/24077223/galvanize-your-legend-in-season-4-loot-reborn
- https://www.sportskeeda.com/mmo/news-it-just-goes-bad-worse-diablo-4-players-react-update-1-1-0-introduces-world-tier-level-requirements
- https://pcgamer.com/diablo-4-world-tiers-explained/
- https://diablo.fandom.com/wiki/Loot_2.0
- https://www.icy-veins.com/d4/news/no-auto-salvage-in-diablo-4-loot-filters-should-players-be-worried/
- https://us.forums.blizzard.com/en/d4/t/why-no-loot-filter/188796
- https://maxroll.gg/last-epoch/resources/loot-filter-guide
- https://wikily.gg/deskrawl/inventory/carriage
- https://steamcommunity.com/app/1476970/discussions/0/5551280551715200170
- https://forum.lastepoch.com/t/crafting-changes-coming-to-eternal-legends-update-0-8-4/45597
- https://inverse.com/gaming/honkai-star-rail-keeps-genshin-impact-relic-artifact
- https://sportskeeda.com/esports/honkai-star-rail-variable-dice-guide-how-use-reroll-relic-stats
- https://wp-prod.icy-veins.com/?p=77458 (Genshin 5.7, one secondary source, unverified)
- https://pathofexile.com/forum/view-thread/3069670/page/107
- https://destructoid.com/?p=265083
- https://link.springer.com/content/pdf/10.1007/s10899-022-10148-0.pdf
- https://dl.ifip.org/IFIP-LNCS/hal-03686044v1
- https://www.mdpi.com/2078-2489/16/10/890/pdf
