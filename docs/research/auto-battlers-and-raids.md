# Research: auto battlers and co-op raids

Research done 2026-10-10 by a research subagent and reviewed by the lead agent. Web material was thin (mostly wikis, forums and reviews). **[src]** means a fetched page supports the claim; **[inf]** means inference from genre knowledge. Recommendations here are inputs to design, not decisions. Decisions go in `docs/design/decisions.md`.

## What auto battlers teach

- **Hidden resolution order is the top readability failure.** Super Auto Pets resolves abilities by attack, then HP; players report the order is unclear and asked for a visual indicator [src: superautopets.wiki.gg/wiki/Glossary; Steam discussions]. Backpack Battles: once bags fill it is "difficult to tell what effects are being activated and when"; fixes were an "Open Log" button and hover/glow lines for synergies [src: gigazine.net 2024-03-10; Steam discussions].
- **Teach synergies at placement time.** Backpack Battles highlights links on hover while placing, so players learn before losing [src]. TFT is praised for positioning depth but has a steep learning curve [src: mechanicsofmagic.com 2024-06-13].
- **"Why did I lose" must show cause, not totals.** Positech's auto-battler post-mortem: stats must answer "what do I change next time" [src: positech.co.uk/cliffsblog 2026-04]. League of Legends' Death Recap: condensed default view highlighting the killer, expandable detail [src: LoL wiki].
- **Luck-heavy outcomes frustrate** (common Super Auto Pets complaint) [src: vaporlens.app]. For a weekly raid players invest in, keep RNG in combat low.

## What raids teach

- **Elemental systems fail when state is hidden.** Genshin's aura gauge (1U/2U/4U, decay, internal cooldowns, forward vs reverse reactions) is invisible and still argued over by the community [src: library.keqingmains.com]. Its strength is the visible element icon on the enemy.
- **Scale group size smoothly.** WoW Flex (10–30 players) scaled boss HP slower than raid throughput; hard breakpoints (an extra target at exactly 15 players) undermined fairness [src: warcraft.wiki.gg/wiki/Flexible_Raid]. Fixed-size tuning was kept for the hardest difficulty because razor-edge tuning is impossible with variable size.
- **No-shows hurt when the group is the unit.** Pokémon GO remote raids: players leaving at the last second fail raids and cause frustration [src: dotesports.com; sportskeeda.com].
- **Participation floors and visible fairness.** Pokémon GO gives rewards even on failure [src: mein-mmo.de]. WoW loot systems (DKP, need-before-greed) exist mainly to defuse fairness fights [src: guildorder.com]. Social-loafing research: visible, fair effort/reward distribution reduces free-riding; tolerated free-riders make others disengage [src].
- **Weekly resets keep content fresh**; rosters and lockouts are the pain point (Destiny) [src: mein-mmo.de].
- **Explain mechanics in-game.** FFXIV's director responded to raid failure by improving mechanic explanations [src: mein-mmo.de].

## Recommendations for Leet Creatures

1. **Reactions: few, visible, binary.** Start with 3 reaction types plus at most 1 boss-specific one. An element applies one named **mark** to the target (no gauge, no decay); a matching element consumes it for the payoff. One mark at a time. Show the mark as an icon and tint on the boss with a popup like "SOAKED → next Lightning ×3". Tag creatures as **Setter** / **Payoff** on their card. No forward/reverse asymmetry.
2. **Make resolution order visible.** A turn-order ribbon above the row, adjacency lines during placement, and a **preview** button that runs a dry round against the boss.
3. **Replays and logs.** Replay at 1×/2×/skip with pause; a sentence log ("Mika's Tide soaked the boss → Jun's Spark triggered Overload ×3, Mika +40% credit"); a **Key Moments** top-5 summary (biggest reaction, wasted setup, creature KO, gimmick hit) with expandable detail; a **personal recap** ending in a concrete "what you could change". Phase 2 adaptation explained in plain words.
4. **Scale smoothly for 1–15 players.** For example HP = `base × (0.6 + 0.4 × N^0.8)` [inf], fractional or probabilistic gimmick scaling rather than breakpoints, zone sizes proportional to row length, and NPC **guest creatures** to fill the row below about 3 players. Tune for players who actually show up.
5. **Make the one manual ability matter.** Bosses telegraph windows ("charging, fires next round"). Abilities should be formation-aware (swap neighbours, re-apply a mark, shield a zone) rather than flat "+X% damage". Show everyone's unspent abilities to prompt table talk. Tag clutch uses ("Clutch: saved the middle zone").
6. **Prevent carrying.** Soft cap one player's damage share near 35% for credit purposes; give setters a large share (for example 50%) of the payoff credit, but only for setups that actually paid off; boss gimmicks that punish stacking one element; a participation floor for everyone who placed creatures.
7. **Sign-up and no-shows.** Lock sign-up before Friday; auto-place absent players' creatures by a default rule; owner-coloured slots plus a "gaps" display (no setter, no payoff); a short Phase 2 window with a countdown and a ready lock; in the live finale, an absent player's ability **auto-fires** at a default moment at reduced effect.
8. **Loot transparency.** Publish the contribution formula in plain English before the raid; show each player's expected reward tier before Phase 2.

## Conflicts with the current design (for Misa to decide)

| Design element                                                                | Risk                                                                                 | Suggested alternative                                                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Reactions via adjacency **and** turn order, plus reflect and silence gimmicks | Hidden state plus order is where players lose track (Genshin, SAP, Backpack Battles) | One visible mark per target with one trigger partner per element; turn-order ribbon; 1–2 gimmicks per boss |
| Turn order changes per boss                                                   | No time to build intuition                                                           | Use 2–3 orderings across all bosses; always show the ribbon and state the order in the boss reveal         |
| Phase 2 boss "adapts"                                                         | Opaque adaptation feels arbitrary                                                    | Plain-language rule with a named trigger ("because you used Fire 8 times")                                 |
| Shared row, each player moves only their own                                  | Async coordination is hard; no-shows leave holes                                     | Auto-placement, gap display, ready lock                                                                    |
| Contribution credit with soft cap                                             | Opaque formulas breed suspicion; setup credit can be farmed                          | Publish the formula; credit only setups that paid off; participation floor                                 |
| One manual ability in a ~1h live finale                                       | Absence; weak or late ability feels pointless                                        | Auto-fire fallback; formation-aware, window-bound abilities                                                |
| Boss scaling for 1–15 players                                                 | Breakpoints distort difficulty; the row is thin with few players                     | Smooth formula; guest creatures below ~3 players                                                           |
| Idle weekday loop feeds the raid                                              | Players who miss weekdays fall behind                                                | Cap grinding advantage; raid success should come mostly from placement and reactions                       |

**Evidence gaps:** no direct post-mortems found on TFT readability, Backpack Battles replay design or Destiny carry dynamics. Playtest replay readability early.
