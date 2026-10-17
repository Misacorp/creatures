# Reference games

Misa asked on 2026-10-16 for a log of what we draw from: what we looked into, what we took, and what does not fit. New research should add entries here, using the same labels.

## AFK Arena / AFK Journey

**Genre:** Idle team game (expeditions, Team Hunting).

**What we looked at:** Idle caps and session lengths (5 minutes, 1 hour, a 12-hour cap); Team Hunting damage-tier chests; a many-currency model.

**What we took or plan to take:** Proposed 1 h / 6 h / 12 h expedition tiers, with rewards that never expire. No decision adopts this yet.

**What does not fit and why:** Many currencies mainly dilute the premium one (monetisation). The research calls it a poor model for a small-server game.

**Sources:** [collectors-idle-and-rewards.md](collectors-idle-and-rewards.md), [idle-coop-raids.md](idle-coop-raids.md), [loops-gear-collection.md](loops-gear-collection.md)

## Arkham Horror: The Card Game

**Genre:** Living card game (LCG).

**What we looked at:** Its Rules Reference: "dealt" damage, numbered steps with "when" and "after" windows, and card text that beats the reference.

**What we took or plan to take:** Combat rules written as a precise reference, as Misa asked (`decisions.md`, 2026-10-15). Applied in `docs/design/combat-rules.md`.

**What does not fit and why:** Arkham leaves ties and assignment to the player. An auto-battler has no player to choose, so we use a fixed order.

**Sources:** [card-game-rules.md](card-game-rules.md)

## Backpack Battles

**Genre:** Auto battler.

**What we looked at:** Players could not tell which effects fired once the bags filled. Fixes: an "Open Log" button, and links that light up while placing.

**What we took or plan to take:** Research recommendations, not decisions: adjacency lines during placement, and a sentence log with Key Moments (`auto-battlers-and-raids.md`, recommendations 2 and 3).

**What does not fit and why:** Hidden effects piling up on a full board. We avoid that.

**Sources:** [auto-battlers-and-raids.md](auto-battlers-and-raids.md)

## The Bazaar

**Genre:** Asynchronous PvP auto-battler with a run-based shop (Tempo Storm).

**What we looked at:** Item sizes and tags; heroes drawing from tagged item pools; adjacency effects ("items to the left", adjacent items +10 to +40 by tier); Bronze to Legendary tiers with the same item growing per tier; one named enchantment per item; cooldown keywords (Haste, Slow, Freeze). Steam about 70–73% positive; a high-rank complaint that luck decides the top of the ladder.

**What we took or plan to take:** Elements and roles as Bazaar-style tags that items can boost; later position-based modifiers (neighbours, row, edge); the same line growing by tier, gated by item level (`bazaar-poe-traits.md`; `decisions.md`, 2026-10-16, second round).

**What does not fit and why:** The real-time cooldown web (our fights are idle and resolved on the server); per-run shops and the PvP ladder; high-variance choices that decide rankings.

**Misa's note:** A key inspiration, for its neighbour and adjacency modifiers (`decisions.md`, 2026-10-16, second round, item 9).

**Sources:** [bazaar-poe-traits.md](bazaar-poe-traits.md)

## Cassette Beasts

**Genre:** Creature collector (single-player).

**What we looked at:** Its 14 types, and status effects instead of multipliers. Its source gave little on 2026-10-16.

**What we took or plan to take:** Nothing directly. The research recommends a four-element cycle with ×1.5 / ×0.75 multipliers.

**What does not fit and why:** Status effects instead of multipliers. The research picks multipliers for an auto-battler.

**Sources:** [collectors-idle-and-rewards.md](collectors-idle-and-rewards.md), [loops-gear-collection.md](loops-gear-collection.md)

## Cookie Run: Kingdom

**Genre:** Guild co-op boss battles.

**What we looked at:** Every member gets the same reward per cleared boss level, with a participation floor (a zero-damage attempt costs nothing).

**What we took or plan to take:** The research's first suggestion for us, a guaranteed reward for every participant of a won raid, matches this pattern. Built 2026-10-15.

**What does not fit and why:** None recorded.

**Sources:** [idle-coop-raids.md](idle-coop-raids.md)

## Destiny 2

**Genre:** Loot and gear game.

**What we looked at:** Patterns and Deepsight target one weapon with a separate currency; bad-luck protection; messy crafting currencies, later streamlined.

**What we took or plan to take:** A sure path beside each lottery, citing Destiny patterns (`systems-review.md`, section 4). Targeted sources with their own currency (`idle-coop-raids.md`).

**What does not fit and why:** Pattern progress is luck-gated and slow, and crafted weapons made random drops feel obsolete. The research names rosters and lockouts as the pain point.

**Sources:** [auto-battlers-and-raids.md](auto-battlers-and-raids.md), [idle-coop-raids.md](idle-coop-raids.md), [loops-gear-collection.md](loops-gear-collection.md)

## Diablo 4

**Genre:** Loot-driven RPG with seasons.

**What we looked at:** Loot Reborn (Season 4): flat, readable affixes instead of conditional ones, and Tempering with limited attempts. Season 11: Tempering where you pick the exact affix.

**What we took or plan to take:** One job per system and per currency (`systems-review.md`, section 4). Flat, readable lines with no conditional wording (`loops-gear-collection.md`, section 2). A deterministic option beside each lottery (`loops-gear-collection.md`, "What this suggests", item 7).

**What does not fit and why:** Masterworking's cost drew complaints. Affix overload led players to ask for a loot filter.

**Sources:** [loops-gear-collection.md](loops-gear-collection.md), [idle-coop-raids.md](idle-coop-raids.md)

## Epic Seven

**Genre:** Not described in our docs.

**What we looked at:** Nothing usable. The 2026-10-16 loops research found little on it.

**What we took or plan to take:** Nothing recorded.

**What does not fit and why:** Nothing recorded.

**Sources:** [loops-gear-collection.md](loops-gear-collection.md)

## Final Fantasy XIV

**Genre:** Online RPG with raids.

**What we looked at:** The weekly tomestone cap was set near the expected clear pace. Raising it would have grown the group who felt "obligated to cap", so options were added instead. After raid failure, mechanic explanations were improved.

**What we took or plan to take:** Explain mechanics in the game (`auto-battlers-and-raids.md`, "What raids teach"). The cap lesson is in the research only.

**What does not fit and why:** Weekly caps that feel like an obligation. We keep no mandatory chore lists.

**Sources:** [idle-coop-raids.md](idle-coop-raids.md), [auto-battlers-and-raids.md](auto-battlers-and-raids.md)

## Genshin Impact

**Genre:** Gacha RPG (pulls, pity, relics).

**What we looked at:** A hidden aura gauge that players still argue over, though its visible element icon works. Pity: hard pity at 90 pulls, soft pity from about pull 74 (guides disagree). Five layers of relic randomness.

**What we took or plan to take:** A visible element icon and mark on the boss (`auto-battlers-and-raids.md`, recommendation 1). Bounded jackpot pity: the research proposed soft pity from raid 6, and the build uses soft pity from raid 5 (`decisions.md`, 2026-10-11). At most two layers of randomness (`systems-review.md`, section 4).

**What does not fit and why:** Hidden gauge state. World Level is per player, not per group, and the research calls server-rank gating unproven. Five relic layers.

**Sources:** [auto-battlers-and-raids.md](auto-battlers-and-raids.md), [collectors-idle-and-rewards.md](collectors-idle-and-rewards.md), [loops-gear-collection.md](loops-gear-collection.md)

## Hearthstone

**Genre:** Digital card game.

**What we looked at:** A fixed damage pipeline, with armor before health. Bolf Ramshield redirects a hit as a new damage event. Taunt limits attacks only.

**What we took or plan to take:** A fixed, named resolution order; Bolf Ramshield as the closest model for our Guard; a hit redirected at most once (`card-game-rules.md`).

**What does not fit and why:** Hearthstone avoids rolls. We roll a die to choose between two Guards (`decisions.md`, 2026-10-15).

**Sources:** [card-game-rules.md](card-game-rules.md)

## Honkai Star Rail

**Genre:** RPG with relic gear.

**What we looked at:** Five random layers per relic (main stat, substats, and more), which players call maddening. Main stats are limited by slot, which keeps the pool legible.

**What we took or plan to take:** Gear pools set by slot and identity (`systems-review.md`, section 5.1).

**What does not fit and why:** Five layers, and one bad substat can ruin a piece. Our grades cap a bad roll at 20% worse on one line.

**Sources:** [loops-gear-collection.md](loops-gear-collection.md)

## Idle Champions

**Genre:** Idle adventure game with champions.

**What we looked at:** A long-time player quit when "idle" became "24x7 babysitting", and a hard wall forced grinding. Variants (harder adventures with restrictions) make players rotate champions.

**What we took or plan to take:** No babysitting: no must-check timers, and claims never expire (`systems-review.md`, section 4). Rotating restrictions for the weekly boss rule (`decisions.md`, 2026-10-16, answer 8).

**What does not fit and why:** Babysitting, hard walls and multi-day grinds.

**Sources:** [idle-coop-raids.md](idle-coop-raids.md), [loops-gear-collection.md](loops-gear-collection.md)

## Last Epoch

**Genre:** Loot-driven RPG with crafting.

**What we looked at:** Forging Potential, a budget each craft drains; shattering returns shards; scarce protection items (Glyph of Hope) felt bad. Secondary sources only, as its primary pages failed.

**What we took or plan to take:** A bounded crafting budget with a refund on failure (`loops-gear-collection.md`, suggestion 5). Three Tempers per item (`systems-review.md`, section 5.4).

**What does not fit and why:** Scarce protection items. Our pity stamps are shown and never bought (`systems-review.md`, section 3).

**Sources:** [loops-gear-collection.md](loops-gear-collection.md)

## League of Legends

**Genre:** Not described in our docs (cited for its Death Recap).

**What we looked at:** A condensed Death Recap that highlights the killer, with expandable detail.

**What we took or plan to take:** A short Key Moments summary with expandable detail (`auto-battlers-and-raids.md`, recommendation 3).

**What does not fit and why:** Nothing recorded.

**Sources:** [auto-battlers-and-raids.md](auto-battlers-and-raids.md)

## Magic: The Gathering

**Genre:** Trading card game.

**What we looked at:** Its rules: separate words for attack, hit, proposed and dealt damage; "instead" as a replacement effect; reflected damage is new damage.

**What we took or plan to take:** That vocabulary, "a hit is redirected at most once", and reflection as new damage (`card-game-rules.md`).

**What does not fit and why:** The affected player orders replacement effects. An auto-battler has no player to choose, so we use a fixed order.

**Sources:** [card-game-rules.md](card-game-rules.md)

## Melvor Idle

**Genre:** Idle game.

**What we looked at:** Stingy or confusing offline caps (Steam threads, anecdotal). Its endgame is mastery, then waiting for content.

**What we took or plan to take:** Keep offline progress simple and trustworthy (`collectors-idle-and-rewards.md`).

**What does not fit and why:** Confusing or stingy offline caps.

**Sources:** [collectors-idle-and-rewards.md](collectors-idle-and-rewards.md), [loops-gear-collection.md](loops-gear-collection.md)

## Monster Hunter (Rise, Wilds, Stories 2)

**Genre:** Hunting games (Rise, Wilds) and a monster RPG (Stories 2).

**What we looked at:** Talisman melding (Rise): spare parts or old talismans go into a pot, and better pots unlock with progress. Wilds does it with decorations. Stories 2 gene transfer uses up the donor, so weak monsters stay useful.

**What we took or plan to take:** Spare materials as lottery tickets (`systems-review.md`, section 4). Duplicates that stay useful. A Melding Pot is proposed in `systems-review.md`, section 5.4; its status is open.

**What does not fit and why:** None recorded.

**Sources:** [loops-gear-collection.md](loops-gear-collection.md)

## Monster Rancher

**Genre:** Creature-raising game.

**What we looked at:** Criticised for lifespan and death, hidden progress and luck-heavy fights.

**What we took or plan to take:** No permadeath and no hidden stats (`collectors-idle-and-rewards.md`).

**What does not fit and why:** Nothing recorded.

**Sources:** [collectors-idle-and-rewards.md](collectors-idle-and-rewards.md)

## Palworld

**Genre:** Creature collector with breeding and passives.

**What we looked at:** Random passives from breeding, then an expensive top-up (about 116 duplicates for a 4-star), then refundable fine-tuning.

**What we took or plan to take:** Duplicates that stay useful (`systems-review.md`, section 4). A few duplicates per star (`loops-gear-collection.md`, suggestion 8).

**What does not fit and why:** 116 duplicates for one star is far too many.

**Sources:** [loops-gear-collection.md](loops-gear-collection.md)

## Path of Exile

**Genre:** Action RPG (ARPG).

**What we looked at:** Some lines roll only on certain slots, so players know where to hunt. Item level raises affix caps. Crafting is seen as unreliable without deterministic options (unconfirmed).

**What we took or plan to take:** Slot-exclusive lines (`decisions.md`, 2026-10-16, second round, item 1). Chance effects that grow with item level and rarity, as a later design space (`decisions.md`, 2026-10-16, answer 3).

**What does not fit and why:** Opaque crafting. We add a deterministic path (Refining, `systems-review.md`, section 5.4).

**Sources:** [loops-gear-collection.md](loops-gear-collection.md)

## Pokémon

**Genre:** Creature collector RPG.

**What we looked at:** A readable starter triangle, and 18 types.

**What we took or plan to take:** A pure four-element cycle, which the research calls readable (`collectors-idle-and-rewards.md`). Our elements are Tide, Ember, Grove and Spark (`systems-review.md`, section 5.1).

**What does not fit and why:** 18 types is too many for the MVP, which has no dual typing.

**Sources:** [collectors-idle-and-rewards.md](collectors-idle-and-rewards.md)

## Pokémon GO

**Genre:** Creature catching with remote raids.

**What we looked at:** Players who leave at the last second fail remote raids, which causes frustration. Rewards are given even on failure.

**What we took or plan to take:** A participation floor, and auto-placing absent players' creatures (`auto-battlers-and-raids.md`, recommendations 6 and 7).

**What does not fit and why:** Nothing recorded.

**Sources:** [auto-battlers-and-raids.md](auto-battlers-and-raids.md)

## Raid: Shadow Legends

**Genre:** Mobile RPG with a weekly co-op boss (the Hydra).

**What we looked at:** A pooled boss HP bar, with chests based on each member's damage, and per-person caps. Players hate its random mechanics that punish teams "regardless of power".

**What we took or plan to take:** A shared HP bar that shows group progress (`idle-coop-raids.md`, "What this suggests", item 2). Bosses that punish setups, not builds: "the Hydra lesson" (`systems-review.md`, section 6.3).

**What does not fit and why:** Random mechanics that strip a build. Players call the Hydra "not auto friendly".

**Sources:** [idle-coop-raids.md](idle-coop-raids.md)

## Slay the Spire

**Genre:** Deck-building card game.

**What we looked at:** Thorns and poison are non-attack damage, so attack modifiers skip them.

**What we took or plan to take:** A vocabulary point only (`card-game-rules.md`). No decision records it.

**What does not fit and why:** Nothing recorded.

**Sources:** [card-game-rules.md](card-game-rules.md)

## Summoners War

**Genre:** Monster-collector RPG with runes.

**What we looked at:** Pick the dungeon for a rune set, and the roll is random. Enchanted Gems give a late, limited, player-chosen reroll.

**What we took or plan to take:** A targeted source with a random roll (`systems-review.md`, section 5.3). A late, bounded reroll (`loops-gear-collection.md`, section 2).

**What does not fit and why:** Enchanting is dropped in our design (`decisions.md`, 2026-10-16, answer 4).

**Sources:** [idle-coop-raids.md](idle-coop-raids.md), [loops-gear-collection.md](loops-gear-collection.md)

## Super Auto Pets

**Genre:** Auto battler.

**What we looked at:** An unclear resolution order (attack, then HP), luck-heavy outcomes, and a Weekly pack that rotates every week.

**What we took or plan to take:** Rotation, not prestige, through a weekly rule (`systems-review.md`, section 4; `decisions.md`, 2026-10-16, answer 8). A visible turn-order ribbon (`auto-battlers-and-raids.md`, recommendation 2).

**What does not fit and why:** A hidden resolution order, and luck-heavy combat.

**Sources:** [auto-battlers-and-raids.md](auto-battlers-and-raids.md), [loops-gear-collection.md](loops-gear-collection.md)

## Teamfight Tactics

**Genre:** Auto battler.

**What we looked at:** "Fates learnings": a rotating mechanic on top of another drowned out the core game. Praised for positioning depth, with a steep learning curve.

**What we took or plan to take:** Team building stays the star, and one new system at a time (`systems-review.md`, section 4).

**What does not fit and why:** Layering several mechanics at once.

**Sources:** [loops-gear-collection.md](loops-gear-collection.md), [auto-battlers-and-raids.md](auto-battlers-and-raids.md)

## Temtem

**Genre:** Creature collector with breeding.

**What we looked at:** Shiny odds of about 1 in 6,000 to 8,000 drew complaints (no odds tool, no social sharing). Its perfection layer serves competitive players.

**What we took or plan to take:** Shinies stay at 1 in 500 and cosmetic, with a server album (`systems-review.md`, section 6.2).

**What does not fit and why:** Odds too low for a small server, and a perfection layer that casual players skip.

**Sources:** [collectors-idle-and-rewards.md](collectors-idle-and-rewards.md), [loops-gear-collection.md](loops-gear-collection.md)

## World of Warcraft

**Genre:** Online RPG with raids.

**What we looked at:** The Great Vault: a weekly pick, praised, but criticised for two layers of randomness. Flex scaling with a breakpoint at exactly 15 players undermined fairness.

**What we took or plan to take:** A targeted source with a random roll (`systems-review.md`, section 4, which names the Vault). Smooth scaling with no breakpoints (`auto-battlers-and-raids.md`, recommendation 4). Personal loot rolls (`collectors-idle-and-rewards.md`).

**What does not fit and why:** Double randomness, and shared loot pools (DKP).

**Sources:** [idle-coop-raids.md](idle-coop-raids.md), [auto-battlers-and-raids.md](auto-battlers-and-raids.md), [collectors-idle-and-rewards.md](collectors-idle-and-rewards.md)

## Lessons across games

- One job per system and per currency. A pile nobody spends is a sink with no exciting outcome (Diablo 4 Season 4; `loops-gear-collection.md`, section 1).
- Targeted source, random roll, at most two layers. Players dislike stacked randomness (Great Vault, Genshin's five layers, Honkai Star Rail's relics).
- A sure path beside every lottery: a deterministic choice after enough tries, or at a high price (Diablo 4 Season 11, Destiny patterns, Last Epoch's budget).
- Make state visible. Hidden state (Genshin's aura gauge, Super Auto Pets' order, Backpack Battles' bags) is where players lose track.
- Keep duplicates and spare materials useful (Monster Hunter melding, Stories 2 genes, Palworld passives).
- Rotate rules instead of resetting (Super Auto Pets weekly packs, TFT sets). Bosses should punish setups, not builds (the Hydra lesson).
- No babysitting: no must-check timers, no mandatory chores, no hard walls (Idle Champions, FFXIV's weekly cap, Melvor's offline caps).
- One new system at a time, with team building as the star (Teamfight Tactics, Fates learnings).
