# Research: creature collectors, idle loops and reward psychology

Research done 2026-10-10 by a research subagent and reviewed by the lead agent. **(S)** means a source supports the claim; everything else is design judgment for a group of 5–15 friends. Not verified: Genshin's exact soft-pity curve (unpublished), design critiques of type counts, AFK Arena notification design. No real money is involved and none ever will be.

## Creature collector

- **Elements.** A pure 4-cycle (A > B > C > D > A) is readable, like Pokémon's starter triangle (S: Bulbapedia). Use **×1.5 strong / ×0.75 weak** rather than ×2 / ×0.5, because an auto battler hides the maths and big swings feel random. Pokémon has 18 types, Temtem 12 (S), Cassette Beasts 14 with status effects instead of multipliers (S); those are deep single-player games. **No dual typing in the MVP.** Show "strong vs / weak vs" arrows everywhere.
- **Starters.** Picking 1 of 3 leaves a 4th "gap" element found only on expeditions, which gives an early goal. Consider a guaranteed creature of the gap element after the first expedition so early teams stay comparable.
- **Evolution.** One step, deterministic, with level and Essence cost shown up front; fusion boosts carry through. Monster Rancher is criticised for lifespan/death, hidden progress and luck-heavy fights (S): so no permadeath, no hidden stats.
- **Rarity pool.** About 10 Common, 7 Rare, 3 Epic.
- **Dupe shield.** After 4 duplicates in a row, the next catch is a species you don't own (same rarity roll). Without it, collecting 10 commons takes about 29 catches on average (coupon collector).
- **Odds by spend** (show these in the UI; max spend never more than about 4× base Epic odds):

  | Spend | Common | Rare | Epic |
  | ----- | ------ | ---- | ---- |
  | Base  | 72%    | 25%  | 3%   |
  | Mid   | 60%    | 33%  | 7%   |
  | Max   | 50%    | 38%  | 12%  |

- **Fusion with diminishing returns.** +6%, +5%, +4%, +3%, +2% per stat for fuses 1–5 (cap +20%). Further duplicates convert to a training resource. This bounds the power gap from luck or heavy spending.

## Idle loop

- **Expeditions.** AFK Arena caps idle accumulation at 12 h and supports both 5-minute and 1-hour sessions (S: gamedeveloper.com). Proposal: **1 h / 6 h / 12 h** tiers, with spend controlling odds and duration as a separate choice. Rewards never expire. A free recall with proportional rewards and **2–3 expedition slots** make "can't train while out" a choice instead of a chore.
- **Session targets.** Weekdays 2–5 minutes; Sunday finale 15–20 minutes.
- **What fails.** Confusing or stingy offline caps (Melvor) and multi-day manual grinds (Idle Champions) (S: anecdotal Steam threads). Keep offline progress simple and trustworthy; no mandatory chore lists.
- **Notifications.** Opt-in only: expedition done, Sunday raid starting. No streak pings.
- **Catch-up for newcomers and casuals.** Training discount (for example −50%) while a creature is well below the server median level, fading as it catches up; **raid level-sync** up to the raid's minimum level; Essence roughly **70% flat participation / 30% contribution**, so a newcomer earns about 75% of the top player's Essence, not 20%; auto-join the Sunday raid with the saved team; replay the loot reveal for anyone who missed it.

## Reward psychology

- **Pity.** Genshin: hard pity 90 (80 on weapons), soft pity reported from about pull 74 (S, guides disagree). Pity bounds the worst case; a visible counter can also create sunk-cost feelings (S). For our jackpot raid drop: base **6%** per raid participation, soft pity from raid 6 (+8% per raid), **hard pity at raid 10**. Per player, increments on participation (not damage), never reset by skipping a week, no 50/50 coin flip. Expected about one jackpot per 7 raids per player.
- **Shinies.** Temtem's ~1/6000–1/8000 drew complaints about no odds-lifting tool and no social sharing (S). At 1/500, with 10 players catching about 3 a day, the server sees about 1.8 shinies a month but one player waits about 170 days on average. That's fine **only if shinies are cosmetic**. Optional: a weekly server-wide "featured species" with boosted shiny odds, so luck is shared.
- **Loot reveal.** Personal rolls (no shared pool, so no need/greed fights). Reveal low to high, jackpots last. Everyone gets a guaranteed base. Announce wins, never "nothing". A skip button. Batch routine announcements into a digest; jackpots and shinies post immediately.
- **Dark patterns to avoid** (Zagal, Björk and Lewis 2013 via deceptive.design; arXiv 2412.05039 found Play by Appointment in more than 80% of top F2P mobile games): streaks that punish missed days, expiring rewards, "last chance" countdowns, hidden odds, bonuses that shame absentees, pity that resets on inactivity, shaming announcements.

## Conflicts with the current design (for Misa to decide)

1. **"First on server" titles are a race the most active player wins.** Alternative: cosmetic titles, "co-discoverer" credit for anyone who matches it within 7 days, non-race titles (collection milestones, weekly raid MVP).
2. **Bigger spend = better odds compounds the advantage of Bait-rich players.** Alternative: diminishing returns, the visible odds table above, possibly a daily cap on max-tier spends.
3. **Essence only from raids gates evolution on attending raids.** Alternative: a large flat participation share, auto-join with the saved team, reveal replay.
4. **Expeditions block training.** Alternative: 2–3 slots plus free recall.
5. **Shiny 1/500 favours heavy catchers.** Alternative: keep shinies cosmetic; optional shared weekly boost. No shiny pity needed.
6. **Jackpot announcements can make unlucky players feel worse.** Alternative: hard pity at 10 raids, private counter, announce pity jackpots like any other.

**Lead-agent note:** the report also suggested "banking up to 3 missed days" of daily Bait. That doesn't apply: Bait comes from the leet bot (you leeted that day or you didn't), and the game shouldn't invent leets. The underlying point stands: missing a day shouldn't be punished beyond not earning that day's Bait.

## Sources

gamedeveloper.com/design/flexible-time-session-design-in-afk-arena · cassettebeasts.com/2022/11/30/elements-chemistry-fusion · bulbapedia.bulbagarden.net/wiki/Starter · temtem.wiki.gg/wiki/Temtem_types · gamesradar.com/temtem-luma-shiny · pcgamesn.com/temtem/luma-shiny-odds · sportskeeda.com (Genshin pity guide) · simplypsychology.org/gacha-games-psychology · deceptive.design/articles/dark-patterns-in-the-design-of-games · arxiv.org/html/2412.05039v1 · massey.ac.nz (loot boxes) · mpra.ub.uni-muenchen.de/108784 (catch-up mechanics) · lawofgamedesign.com/2014/08/25/theory-rubber-bands · nintendolife.com (Monster Rancher review) · Steam community threads for Melvor Idle and Idle Champions (anecdotal)
