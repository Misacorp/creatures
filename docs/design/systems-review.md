# Systems review: what each system is for, and the gear and creature revamps

Status: **answered** by Misa, 2026-10-16; superseded by `gear-and-creatures-v2.md`. Its decisions were built in #27 (supplies), #31 and #35. Asked for in decision 8 of 2026-10-16 ("Misa's direction after the raid retune").

**Misa answered the questions on 2026-10-16** (`decisions.md`, "Misa's answers to the systems review"). Where his answers differ from the proposals below (no rerolls or risk-free upgrades for now, no enchanting, gear share by journey stage, Essence for advanced features rather than training), his answers win.

Sources: a code-checked map of every system on `main`, `docs/balance/progression-study-2026-10-16.md` (the study: paired sims, 100 servers × 30 weeks, 40 × 70 for ceilings), `docs/research/loops-gear-collection.md`, `docs/research/idle-coop-raids.md` and the design docs. Week figures are per-player means for the journey presets **min-maxer / engaged / regular / drop-in** (MM / EN / RE / DI). "Power" is raid-team power (the 3 strongest creatures, `atk + floor(hp/10)` with gear). New numbers are **starting values** for the sim to tune.

## 1. Summary for Misa

**The biggest findings**

1. **The game runs out.** Everyone ends on the same team power (942 to 946): at week 13 (MM), 18 (EN), 46 (RE); drop-ins never. After that nothing makes a player stronger, and from week 16 a min-maxer goes weeks without a meaningful upgrade.
2. **Bait blocks, everything else piles up.** Bait is the limit on 80–100% of days until the level cap, while Essence (1,138 held by a MM at week 30), shards (455) and glimmer (136) have nothing worth buying. Casuals sit on 150–660 Essence while waiting 5–8 days, later 15–19, for Bait.
3. **Gear rarity and levels do not matter.** A common reaches the stat cap at +3 to +5, so at week 30 63% of a MM's worn items are commons. Tint and kind are cosmetic.
4. **The collection is small and ends early.** 14 lines, complete at week 6 (MM) and 12 (EN). After that every catch is a duplicate turned into Bait (47–69% of their Bait), and everyone ends with the same top trio.
5. **Creatures have no choices, and rarity means nothing.** Training, fusion and evolution are automatic. A rare (Tempestray, 319) beats every epic (Gaiadrake 262).
6. **Many ladders are dead ends:** the third familiarity star (a 1/500 shiny), explorer ranks 7–10 (about 229 day trips), expedition slot 5 (about day 370), milestones (+0.5–2%), the journal.
7. **Raid rewards lose meaning after week 12:** Essence buys nothing, the reward slot is the only exciting part, and the jackpot is hidden.

**Gear, proposed.** Three slots per creature, each with one job: **Charm** (attack, by element), **Band** (defence, by element), **Trinket** (one role only; later it carries "when this happens" modifiers). An item rolls 1 / 2 / 3 modifiers by rarity from a short pool its slot and identity allow, each with a grade of 1–5 pips. Item level raises every number; commons stop at level 5, rares at 8, epics at 10. The per-creature caps go. The boss decides the element of its drops; you pick the slot as a wish. Spare materials go into a **Melding Pot** with the odds on screen and a guaranteed epic after 6 misses. **Tempering** (3 tries per item, keep the better roll) and **Refining** (glimmer for a sure +1 pip) chase the perfect roll.

**Creatures, proposed.** Every catch, duplicates too, rolls a **talent** (a small combat or explorer bonus); a duplicate becomes a choice: teach its talent, fuse it, or release it. Pick one of two **perks** at levels 10, 20 and 30, with a cheap respec. Stats are set by role and stage; rarity buys an extra talent slot. Evolving lines get a **second evolution choice**, filling the missing Grove Support and Spark Guard. New creatures arrive in **small packs each season**. A **weekly boss rule** and roster goals give reasons to level more than three.

**What we would tear down:** per-creature gear caps; enchants and Improve; speed on gear; blueprint rarities; automatic fusion; most Bait from duplicates; today's species stat tables (Tempestray gets weaker, Coralynx and the epics stronger). Existing gear and creatures are converted, never wiped.

**Questions only you can answer** (our recommendation after each):

1. Three gear slots (Charm, Band, Trinket, opening at creature levels 1, 10 and 20), or two? _We recommend three._
2. How much of a finished team's power should gear be? _We recommend about a quarter (today 13%)._
3. Trinket modifiers that trigger in a fight ("when this Guard takes a hit for a neighbour, its next hit is stronger"): in the first gear release, or a second one? _Second: they need more combat engine work; plain modifiers first._
4. Rerolls with no risk (Tempering always lets you keep the old roll), or some risk for bigger wins? _No risk._
5. Existing gear: convert every item and keep its upgrades, or reset gear with a refund? _Convert and keep._
6. Duplicates: a choice (teach a talent, fuse, or release for a little Bait), knowing committed players get much less Bait from duplicates? _Yes._
7. A second evolution choice for each evolving line (8 new forms to draw), switchable later for Essence? _Yes._
8. A weekly boss rule that favours different creatures (for example "Grove creatures +20%, Ember −20% this week")? _Yes, mild, after the revamps._
9. Spare Essence paying for training (1 Essence for 1 Bait) when Bait runs out? _Yes; it is the only change that helps casual players' dead stretches._
10. Levels past 30? _Not now; decide after talents and perks are live and measured._

## 2. The systems today

Verdicts first, details below.

| System                         | Job today                             | Identity good? | Verdict                                      |
| ------------------------------ | ------------------------------------- | -------------- | -------------------------------------------- |
| Leet income                    | Show up daily, leet together          | Yes            | Keep                                         |
| Expeditions                    | Send creatures out, come back to loot | Yes, cluttered | Keep; prune dead ladders later               |
| Catching and collection        | Find what is missing                  | Yes, too short | Revamp (section 6)                           |
| Training                       | Spend Bait on levels                  | Thin           | Keep, add choices around it                  |
| Fusion                         | Duplicates add stats                  | No choice      | Revamp into a choice                         |
| Evolution                      | A one-off upgrade at level 15         | Too early      | Add branches                                 |
| Abilities, roles, elements     | Team building and placement           | Yes, the core  | Keep; perks build on it                      |
| Gear and workshop              | Loot, Essence sink, idle jobs         | Weak           | Revamp (section 5)                           |
| Parts (scrap, shards, glimmer) | Workshop materials                    | Muddled        | One job each (section 3)                     |
| Supplies                       | Boost trips                           | Was a trap     | Being fixed in a separate PR                 |
| Daily dungeon                  | Solo daily puzzle, a depth ladder     | Yes, but walls | Keep; targeted chest now, depth picker later |
| Raid, Boss Rank, Festival      | The co-op heart                       | Yes            | Keep; better rewards, weekly rule later      |
| Living room                    | Presence and coziness                 | Yes, no game   | Keep; home for the server album              |
| Journal, milestones, profile   | Lore and firsts                       | Fades          | Later                                        |

**Leet income.** 25 Bait a game day for opening the game, plus 15–32 for a leet: 314 / 286 / 160 / 44 a week, the same every week. Feeds training. The social hook, at no attention cost. Flat against rising level prices; for committed players soon dwarfed by duplicate Bait (314 against 710 for a MM at week 20).

**Expeditions.** Creature time in; catches, explorer XP, parts, blueprints, supplies and journal pages out; competes with the Workshop for creature time. 99% of a daily player's trips are 12 or 24 h (the 2 h trip, 4 XP against 110 for 6 h, is a trap). Ranks, familiarity, push-on gambles, milestones and the weekly special stack on top; the third star, ranks 7–10, slot 5 and the journal reward nothing anyone reaches. Familiarity is per creature, so a new catch starts at zero everywhere. W1 1–2 slots; W6 slot 3, 24 h trips for MM; W20 almost all duplicates.

**Catching and collection.** 22 species in 14 lines. Rarity is catch odds, not power. Owned (of 14): W2 10.8 / 9.7 / 4.9; W6 13.9 / 12.5 / 10.1; W12 14 / 14 / 12; DI 12.3 at week 70. After completion, catching only makes Bait.

**Training.** `3 + 2·L` Bait a level, 957 per creature to 30. The limit on 80–100% of days. Highest level W1 14.8 / 15 / 9.5 / 6.3; W6 24.3 / 17.9 / 15.8 / 13.1; W20 30 / 30 / 22.3 / 17.8. After the cap a MM banks 470–1,000 Bait a week, because the other 11 creatures have no use.

**Fusion.** Automatic on a duplicate: +6 to +20% stats over 5 steps, then Bait. No decision. The limit for MM and EN from week 13 / 19.

**Evolution.** Level 15 plus 20 or 40 Essence. A good moment, over by week 6 (25–29% of meaningful upgrades in week 2, none from week 4).

**Abilities, roles and elements.** Elements, reactions, roles and finale abilities are the strongest system: placement and team building decide fights. But a creature's identity is fixed by species (no perks, no respec), speed matters against one boss, and `power` ignores crit and speed.

**Gear and workshop.** 19 bases, one slot, +0 to +5, crafting from 17 blueprints, Improve, 9 enchants, a slow Crafting skill, 2 workshop slots that never grow. A common reaches the caps. Gear share of power (Shapley) W1 8 / 6 / 2 / 1, W6 50 / 42 / 20 / 6, W20 68 / 69 / 49 / 17, finished at week 12 / 18 / 46 / never. A MM gets 11–22 items a week and keeps 3: a sorting chore.

**Supplies.** Buying them was a net loss (not buying gives a MM +13% power at week 6) and none were crafted in 30 weeks. **Decided and being built in a separate PR:** no Bait sales; supplies come as rewards (a guaranteed one from the dungeon, better deeper) and from crafting, with more scrap. The gear revamp fits: supplies stay a scrap use, and the Melding Pot's fuel can be spare items instead of scrap.

**Daily dungeon.** Pick three creatures and their order; the run plays out on the server. Depth W1 5.3 / 5.3 / 2.2 / 1.0; W6 17.9 / 16.9 / 10.8 / 3.9; W20 21.9 / 21.2 / 17.8 / 10.6, a wall at 20–24 where a week pays about 13 Bait, 1–2 Essence, 2 scrap and no gear. A daily chore of watching the same loss. Dungeon gear does not skew raids (finale win share −0.06 points, 95% CI ±0.31).

**Raid, Boss Rank and Festival.** Two auto phases, the live Sunday finale, a per-server Boss Rank on a hand-built curve, a Festival every fifth week. Pays Essence (W2 69 / 61 / 46 / 22, W20 39 / 38 / 28 / 20), scrap, the reward slot and a hidden jackpot. Finale wins W2 74%, W6 92%, W12 76%. After week 12 its main payout buys nothing, and its curve is pinned to today's plateau, so **any revamp that adds power needs a raid retune** in the same PR.

**Living room.** Presence and coziness, no game function; a hard-working roster leaves an empty room. A natural home for a collection display.

**Journal, milestones, profile.** 40 pages, 10 milestones worth +0.5–2%, 12 counters. New milestones a week: W1 12.3 / 10.9 / 3.2 / 1.1, W6 under 1.5, W20 0.1–0.3.

## 3. Currency map

### Today

| Resource            | Sources (weekly, MM / EN / RE / DI)                                                       | Sinks                                          | State                                                                |
| ------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| **Bait**            | Allowance and leet 314 / 286 / 160 / 44. Duplicates W20 710 / 467 / 33 / 1. Dungeon 6–18. | Training. Supplies (being removed).            | **Blocks** 80–100% of days to the cap; then piles up (4.7k MM, w30). |
| **Essence**         | Raid 20–69. Hidden jackpot 5–22. Dungeon 1–8. Festival +50%.                              | Evolution (done by week 6). Gear upgrades.     | Blocks gear weeks 1–8; then piles up (1,138 / 926 / 392 / 661, w30). |
| **Scrap**           | Trips (24 h: 3), Forage, raid phases, dungeon, salvage, gifts. W20 225 / 180 / 24 / 4.    | Crafts, upgrades, Improve, supplies.           | Looks short for MM (a sim policy artefact); piles up for RE and DI.  |
| **Shards** (4)      | Trips by explorer element, dungeon boss, dismantle. Net W20 +18 / +11 / +1.4 / +0.5.      | Rare and epic crafts, enchants, good supplies. | **Piles up** (455 MM at w30). Never blocks.                          |
| **Glimmer**         | Trips (rare), landmarks, epic dismantle, rank gifts. W20 6.6 / 7.0 / 0.5 / 0.1.           | Epic crafts, enchants (one per item).          | **Piles up** (136 MM at w30). Never blocks.                          |
| **Blueprints** (17) | Welcome kit, trips, Lost cache, a quarter of finale slots.                                | None (knowledge).                              | The set completes; then duplicates become 5 scrap.                   |
| **Gear items**      | Finale slot, dungeon, push-on, crafting (MM 9–19 a week), Festival.                       | Dismantle (back to scrap).                     | A treadmill; 63% of worn items commons at w30.                       |

Nothing converts between Bait, Essence and parts, except duplicates turning into Bait. That is why one blocks while the others pile up.

### Proposed: one job per currency

| Currency          | Its one job                               | Sources                                                             | Sinks                                                                                                              | Change from today                                       |
| ----------------- | ----------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| **Bait**          | Grow creatures                            | Allowance and leet, dungeon rooms, released duplicates (less)       | Training; talent swaps (10); perk respec (20)                                                                      | Release pays a third of today's conversion; no supplies |
| **Essence**       | Make the team's gear stronger, and evolve | Raid stages, a **visible** jackpot, dungeon, Festival               | Evolution and branch switches; gear levels; Tempering; Melding Pot fuel. Tops up training 1:1 when Bait runs short | Gains three big sinks; casuals' idle Essence trains     |
| **Scrap**         | Workshop material                         | Trips, raid phases, dungeon, dismantle, the supply PR's new sources | Melding Pot base cost; gear levels; supplies                                                                       | Unchanged job                                           |
| **Shards** (4)    | Choose the element                        | As today                                                            | Making element gear; Tempering it; good and great supplies                                                         | Every element item now asks for its shards              |
| **Glimmer**       | Polish to perfect                         | As today                                                            | Refine (+1 pip, 4); an extra Temper (5); top-tier pot fuel                                                         | Real sinks, priced 4–5 so regulars can reach one        |
| **Blueprints**    | Unlock a target in the Melding Pot        | As today (the finale slot keeps its quarter)                        | None (knowledge)                                                                                                   | 15 blueprints by slot and identity; no rarity           |
| **Talents** (new) | A creature's build                        | Every catch                                                         | Talent slots; the talent book                                                                                      | New; replaces most duplicate Bait                       |
| **Pity stamps**   | Visible bad-luck protection               | Each Melding Pot result below epic                                  | 6 stamps guarantee the next epic                                                                                   | New; shown, never bought                                |
| Enchants          | (gone)                                    |                                                                     |                                                                                                                    | Folded into modifiers and Trinkets                      |

The one overlap we accept: Essence can top up training. In the study it was the only change that touched casuals' binding limit (+7% power for regulars, +16% for drop-ins at week 8). Committed players will spend their Essence on gear, so the top-up mostly helps players who never open the Workshop.

## 4. What makes loops appealing here

The research, filtered through this game's constraints: low attention, 5–15 players per server, every roll on the server, one live appointment a week.

- **One job per system and per currency** (Diablo 4 Season 4). A pile nobody spends means a sink with no exciting outcome.
- **Targeted source, random roll, at most two layers.** Players like choosing what to chase and hate stacked randomness (WoW's Great Vault, Genshin's five layers). The source fixes the pool, the item rolls inside it in a narrow band, and one bounded reroll follows.
- **A sure path next to every lottery** (Diablo 4 Season 11, Destiny patterns): after enough tries, or at a high price, you get exactly what you want. Odds are shown; results are rolled live on the server.
- **Spare materials as lottery tickets** (Monster Hunter melding) turn weekday surplus into a reason to log in, without a new chore.
- **Duplicates that stay useful** (Monster Hunter Stories genes, Palworld passives): a catch after the collection is complete should still carry a choice.
- **Rotation, not prestige** (Super Auto Pets weekly packs, TFT sets): a weekly rule makes a wide roster matter without resetting anyone.
- **No babysitting** (Idle Champions): nothing here adds a must-check timer; jobs stay hours long and claims never expire.
- **One new system at a time**, explained as it unlocks; the raid's team building stays the star (TFT).
- **Shared progress over rankings** on small servers: the server album and Boss Rank, not leaderboards.

## 5. Gear revamp proposal

### 5.1 The model

**Slots.** Every creature gets three slots, one per kind. The kinds exist today but are cosmetic.

| Slot        | Opens at creature level | Fixed stat (the base's, never rolled) | Identity axis                                  | Who can wear       |
| ----------- | ----------------------- | ------------------------------------- | ---------------------------------------------- | ------------------ |
| **Charm**   | 1                       | Attack +1.2% per item level           | Element (Tide, Ember, Grove, Spark) or neutral | Anyone             |
| **Band**    | 10                      | HP +1.5% per item level               | Element or neutral                             | Anyone             |
| **Trinket** | 20                      | The role's own stat (below)           | Role                                           | **Only that role** |

Trinket fixed stats, per item level: Guard armor +1 point (25% to 35% at level 10); Support boost +1 point (15% to 25%); Payoff reaction bonus +2%; Setter +2% on the hit that leaves a mark. Role-locking ("the role that can wear it") means a Trinket never carries a stat its wearer cannot use. The Band opens at level 10 because the study's extra slot only reached regulars when it opened early (level 15: +17 power at week 12; level 20: nothing before week 20).

**Rarity adds modifiers and a higher level ceiling.**

| Rarity   | Modifiers | Max item level | Notes                                                                      |
| -------- | --------- | -------------- | -------------------------------------------------------------------------- |
| Common   | 1         | 5              | Can be Tempered (today's commons cannot)                                   |
| Rare     | 2         | 8              |                                                                            |
| Epic     | 3         | 10             | From the second release, an epic Trinket's third modifier can be a trigger |
| Festival | 3         | 10             | Fixed identity, its own look                                               |

**Item level replaces +0 to +5 and replaces the caps.** Every number on an item, the fixed stat and each modifier, grows with its level: a modifier is worth 55% of its full value at level 1, 75% at 5, 90% at 8 and 100% at 10 (`50% + 5% × level`). There are no per-creature caps any more, only the engine's existing safety caps (crit chance 30%, crit damage +150%, the single-hit cap). Gear's total size is set by the per-modifier numbers instead, aimed at **about 25% of a finished team's power** (today 13%; the study's caps-30/35-plus-second-slot run reached 20%).

**Grades: the second and last layer of randomness.** Each modifier rolls a grade of 1 to 5 pips, worth 80 / 85 / 90 / 95 / 100% of its value. Starting odds 30 / 28 / 22 / 14 / 6%. A bad roll is only 20% worse on that one line, never a ruined item. Five pips on every line is the perfect roll. Rarity is the drop itself, as today; on the item only the lines and their grades roll.

**Identity pools: 4–6 lines each.** The slot and identity decide the pool. The research suggests 6–8; smaller pools keep every roll readable and the perfect roll within reach. Pools share a few core lines so every item is useful, and add lines that fit their identity. No conditional wording: an Ember Charm's "Wildfire +10%" helps the creatures that set off Wildfire (Ember ones) on its own.

| Pool              | Core lines                                             | Identity lines (full value at level 10)                                                                                      |
| ----------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Tide Charm        | Attack +8%, crit chance +4, crit damage +20            | Steam +10%; damage against Ember +12%; healing done +15%                                                                     |
| Ember Charm       | same                                                   | Wildfire +10%; damage against Grove +12%; crit damage +30 (a wider band)                                                     |
| Grove Charm       | same                                                   | Grounding +10%; damage against Spark +12%; HP +6%                                                                            |
| Spark Charm       | same                                                   | Overload +10%; damage against Tide +12%; crit chance +6 (a wider band)                                                       |
| Neutral Charm     | same                                                   | Every reaction +5%                                                                                                           |
| Element Band (×4) | HP +10%, area damage taken −8%, aimed damage taken −6% | Damage from the element that beats it −10%; healing received +20%; HP +4% per creature of its element in the row (at most 2) |
| Neutral Band      | same                                                   | All damage taken −4%                                                                                                         |
| Guard Trinket     | HP +8%, Attack +6%                                     | Cover +8 points; aimed damage taken −6%; armor +4 points                                                                     |
| Support Trinket   | same                                                   | Boost +6 points; healing done +25%; its neighbours' crit chance +3                                                           |
| Setter Trinket    | same                                                   | Marking hit +12%; crit chance +4; damage against the element it beats +10%                                                   |
| Payoff Trinket    | same                                                   | Reaction bonus +8%; crit damage +25; crit chance +4                                                                          |
| Explorer's piece  | (no combat lines)                                      | Trip XP +10%; parts found +10%; trips 5% shorter; Crafting jobs 8% faster                                                    |

Explorer's pieces give bench creatures a use for gear without putting dead lines on a raider's item. Speed leaves gear: it matters against one boss, and dead lines make loot feel bad.

**Second release: trigger modifiers.** An epic Trinket's third line can come from a role's trigger list, each tied to a defined moment from `combat-rules.md` (round start, when hit, when a mark is left, when a reaction is cashed in). Examples to review with Misa, not a final list: Guard "when it takes a hit for a neighbour, its next hit deals +30%"; Support "at round 1, the creatures beside it start with a boost"; Setter "its first hit each fight leaves its mark even over another mark"; Payoff "its first reaction each fight cannot be reflected". They need more engine work (section 8), so they come after the plain modifiers have been measured.

### 5.2 Example items

- **Cinder Charm**, Ember, epic, level 7 / 10. Attack +8.4% (fixed). Wildfire +8.1% (●●●●○). Crit damage +15 (●●●○○). Damage against Grove +8.7% (●●○○○). _Good bones, Temper the third line._
- **Mossy Band**, Grove, rare, level 8 / 8. HP +12% (fixed). Area damage taken −7.2% (●●●●●). Healing received +15.3% (●●○○○). _At its ceiling: a keeper until an epic arrives._
- **Bulwark Trinket**, Guard, common, level 5 / 5. Armor +5 points (fixed). Cover +5.4 points (●●●○○). _A cheap first Trinket; meld it later._
- **Old Crossroads Satchel**, Explorer's piece, rare, level 4 / 8. Trip XP +6.7% (●●●●○), trips 3.2% shorter (●●●○○). _For the creature that never raids._

### 5.3 Sources, targeted

Each source fixes the identity (and sometimes the slot); the item rolls inside it. One layer of randomness at the drop, as the raid research recommends.

| Source                               | Slot                                                                      | Identity                                                    | Item level at the drop                        | Rarity                  |
| ------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------- | ----------------------- |
| Raid finale win (the reward slot)    | **The player's wish**, set on the raid card (default: their weakest slot) | The boss's element; a Trinket for the wished role           | `1 + floor(rank / 2)`, up to the rarity's max | By Boss Rank, as today  |
| Visible jackpot (today's hidden one) | The wish                                                                  | The boss's element                                          | The rarity's max                              | Epic                    |
| Daily dungeon full clear             | **Today's chest**, shown before the run (rotates daily)                   | The day's room boss element                                 | `1 + floor(depth / 4)`                        | By depth, as today      |
| Push-on Shortcut and Ancient vault   | Charm or Band                                                             | The place's element; Old Crossroads gives Explorer's pieces | By explorer rank                              | Rare and epic, as today |
| Festival finale win                  | Fixed                                                                     | The season's Festival                                       | 10                                            | Festival                |
| Melding Pot                          | Your choice (needs the blueprint)                                         | Your choice                                                 | `1 + floor(Crafting level / 2)`               | By fuel (5.4)           |
| Welcome kit                          | Charm                                                                     | Neutral                                                     | 1                                             | Common                  |

The finale still promises "a gear piece or a blueprint, better at higher ranks" (a quarter of the time a blueprint). The jackpot keeps its odds and pity, but is shown. Dungeon gear stays at 15% a full clear; the deferred depth picker is what fixes the wall.

### 5.4 The Workshop: a bounded lottery with a sure path

Three actions replace Craft, Improve and Enchant. Each is a workshop job on an idle creature, paid at the start and rolled at the claim.

**Melding Pot (makes items: the lottery).** Pick a known blueprint (slot and identity). The base cost, 10 scrap and 2 shards of the identity's element (role and neutral items: any one element), always makes a common. Optional fuel moves the odds, **shown before you confirm**:

| Fuel on top of the base cost                  | Common | Rare | Epic |
| --------------------------------------------- | ------ | ---- | ---- |
| None                                          | 100%   | 0%   | 0%   |
| 2 spare commons, or 20 scrap                  | 60%    | 35%  | 5%   |
| 1 spare rare and 40 Essence                   | 25%    | 55%  | 20%  |
| Full: 3 spare rares, 80 Essence and 3 glimmer | 0%     | 65%  | 35%  |

Epic is never more than 35% a try. **Pity stamps:** every result below epic gives a stamp, shown on the pot; at 6 stamps the next fuelled meld is epic. Crafting level adds +1 point of epic odds per level (within the cap) and sets the item level. A spare item counts as fuel worth its dismantle value plus half the Essence its levels cost, so upgrading an item you later replace is never wasted.

**Tempering (the chase).** Every item has **3 Tempers** (shown "Tempers 3 / 3"). Pick one modifier; the job rolls a different line from the same pool with a fresh grade, and at the claim **you choose** the old or the new line. It never makes an item worse. Cost 20 Essence plus 3 shards of the item's element; 2 h.

**Refining (the sure path).** 4 glimmer raises one modifier's grade by one pip, up to five. No randomness. 5 glimmer buys one extra Temper on an item, once.

Upgrading stays instant and never fails: Essence `6 + 4 × level` and scrap `2 + level` for each level. Taking an epic from level 1 to 10 costs about 234 Essence and 63 scrap; drops arrive above level 1, so most players pay less.

**Does it absorb the piles?** The study sized committed players' surplus at about 45 Essence, 15–20 shards and 5 glimmer a week. Two Tempers, one fuelled meld and one Refine a week cover that, on top of levels. Regulars (0.3–0.5 glimmer a week) reach a Refine every 2 months or so; Tempering needs no glimmer.

### 5.5 What happens to existing players' gear

Convert everything once, in a new migration, leaving nobody below average:

- **Slot and identity:** kind becomes slot; tint becomes the element (none means neutral). A Trinket's role is the role of the creature wearing it; an unworn Trinket asks the player to pick a role once (default: their strongest creature's role).
- **Level:** `max(1, round(old level × rarity max / 5))`. A common +5 becomes 5 / 5, an epic +5 becomes 10 / 10, a rare +2 becomes 3 / 8. The Essence already paid keeps its value.
- **Modifiers:** rolled fresh from the new pool, every grade at least 3 pips (old secondaries do not map).
- **Enchants:** removed; each refunds its cost (1 glimmer, 3 shards) and adds one Temper to that item.
- **Blueprints:** each known base becomes the blueprint for its slot and identity; overlaps refund 5 scrap each.
- **Jobs in progress** finish under the old rules before the switch.
- **A welcome back:** 2 pity stamps for everyone.
- **Raid:** power changes, so the curve is retuned in the same PR and `RAID_DIFFICULTY_VERSION` is bumped (the open week is re-declared).

**What players lose:** their exact current numbers (some items get better, some worse); enchants as a separate step; speed bonuses; the simplicity of "reach the cap and stop".

### 5.6 What we tear down

Per-creature caps; primaries and secondaries (now a fixed stat and modifiers); Improve; enchants; blueprint rarity; speed on gear; +0 to +5 (now levels 1–10); cosmetic kinds (now slots). We keep the Workshop, jobs, the Crafting skill, dismantling, the parts, blueprints as knowledge, the finale reward slot and the inventory cap of 60.

### 5.7 Risks

- **Power creep forces a raid retune:** gear at 25% instead of 13% of power is about +15% at the ceiling. Retune in the same PR; re-check the `curve-*` targets.
- **Sorting chore:** three slots on 3–9 creatures is up to 27 items. "Equip best" per creature and team, an optional auto-meld of commons, drop counts near today's.
- **Casuals never touch it** (drop-ins work gear on 0% of check-ins). "Equip best", the wish default, slots that unlock one at a time with a coach mark, and Essence-to-training keep them whole.
- **Luck frustration:** bounded by narrow grades, keep-either Tempering, visible odds and stamps.
- **Triggers are hard to read in a replay:** a second release, with a log line for every trigger.

### 5.8 How we simulate it

The sim already uses the game's own pure functions (`packages/sim/src/gear.ts`). It needs a power score that counts crit and reactions (or fight-based scoring), and policies for wishes, Tempering and melding. Targets for the journey sim:

| Target                                                   | Today                         | Aim                     |
| -------------------------------------------------------- | ----------------------------- | ----------------------- |
| Gear share of team power at the plateau (MM, EN)         | 13%                           | 20–25%, never above 30% |
| Gear share at week 8, daily player                       | in 10–20%                     | stays in 10–20%         |
| Week gear reaches 90% of its final value (MM / EN)       | about 12 / 17 (it then stops) | 20+ / 26+               |
| Week gear stops improving (the perfect-roll chase)       | 12 / 18                       | not within 30 weeks     |
| Worn commons at week 30 (MM)                             | 63%                           | under 20%               |
| First epic, regular                                      | rare                          | by week 8 (stamps)      |
| Share of epics that came from stamps                     | n/a                           | under 25%               |
| Essence held at week 30 (MM / EN)                        | 1,138 / 926                   | under 300               |
| Shards / glimmer held at week 30 (MM)                    | 455 / 136                     | under 100 / under 30    |
| Week-4 joiner's gear power at week 8, against the median | at least 60%                  | still at least 60%      |
| Raid `curve-*` targets                                   | pass                          | pass after the retune   |

## 6. Creature revamp proposal

### 6.1 Collection pacing

**Are catches too fast?** For committed players, yes: done at week 6 (MM) and 12 (EN). For casuals the end is too slow: RE completes at week 40, DI never (12.3 / 14 at week 70). So: more to find, arriving over time, and faster catch-up at the bottom.

- **Packs each season:** about 4 new lines every 5-week season, in existing places (a new place every second pack). A MM completes the base catalogue and branches around week 9, then each pack in 2–3 weeks.
- **Catch-up:** below the server's median collection, the duplicate shield triggers after 2 duplicates, not 4. In a pack's first week, a player's first trip of the day to a place with an uncaught pack species rolls it first.

### 6.2 Design space

- **Fill the grid.** 14 of 16 element and role pairs exist; Grove Support and Spark Guard are missing, and Tide Support and Ember Guard are Festival-only. Branches and the first pack fill them.
- **Evolution branches.** Each evolving line (the 6 common lines, Stormray and Mossback) gets a second stage-2 form with a different role: Sproutle can become Thornbuck (Guard) or a new Grove Support; Zipmouse can become Voltaro (Setter) or a new Spark Guard. The player picks at level 15; switching later costs 40 Essence (a re-evolution, an Essence sink). That is 8 new forms to draw at 16×16, names and lore from the compendium.
- **Stats by role and stage.** Finished forms land within ±5% of each other inside a role (Tempestray 319 to about 265, Coralynx 206 to about 255, epics to about 265). Rarity buys choice instead: talent slots (common 2, rare 3, epic 3 plus a fixed signature talent) and richer abilities.
- **Shinies as trophies.** Shiny stays 1/500 and cosmetic. A **server album** in the living room shows every species, normal and shiny, and who caught it first on the server: shared progress for a small server. The third familiarity star stops needing a shiny (an expedition follow-up).

### 6.3 What keeps a maxed team collecting and levelling

- **Talents from every catch.** Every catch, duplicates included, rolls one talent from its species' pool of about 8: role lines ("armor +4 points"), element lines ("Steam +8%") and explorer lines ("trips 5% shorter"). One in 20 is **golden** (1.5×): the chase. The name avoids a clash with today's cosmetic "traits" in `species-lore.json`.
- **A duplicate is a choice.** The catch card offers: **Teach** (its talent into a slot of your creature; the replaced talent goes to the creature's talent book), **Fuse** (the stat step, up to 5, as today), or **Release** (2 / 5 / 12 Bait instead of 5 / 15 / 40). Talent slots open at levels 1 and 15, and a rare's or epic's third at 25.
- **Cheap respec.** Any talent in a creature's book can be slotted again for 10 Bait, at once.
- **Perks at levels 10, 20 and 30:** one of two, shaped by role, as `player-agency.md` asks. Examples: Guard "armor +10 points" or "cover reaches two slots"; Support "reach two slots" or "one neighbour, double boost". Respec for 20 Bait. Shape perks need engine work, so they ship with the trigger modifiers.
- **A weekly boss rule** (after the revamps). One mild rule per normal week from a list of about 6, shown on Monday: "Overgrowth: Grove creatures +20%, Ember −20%", "Low tide: the Back row takes 30% less, the Front 30% more". It punishes a setup, never strips a build (the Hydra lesson), and makes a second trio worth levelling. No rule in Festival weeks.
- **Roster goals ("den level").** The sum of all creatures' levels unlocks workshop slots 3 and 4 (today fixed at 2), new living-room spots and album frames. No raw combat power, so the raid curve does not move.
- **Levels past 30: not yet.** The study's levels 31–40 at 4× price add 22% to the ceiling and help only committed players. Give levelling a purpose first: all 14 lines to 30 cost 13,400 Bait, which absorbs the post-cap surplus once those creatures matter.

### 6.4 What we tear down

Automatic fusion (now one of three choices); most duplicate Bait; today's species stat tables; "rarity is only catch odds"; shiny as a familiarity gate. We keep one creature per line: allowing several copies would rewrite the collection, the database constraint and every picker, and talents give "no two alike" without it.

### 6.5 Existing players

Every creature keeps its level, fusions, quirk and nickname. Each open talent slot gets a talent rolled once with live randomness, as the quirk backfill did. Perks are a free first pick; stage-2 creatures keep their form with one free branch switch. Patch notes explain the re-budget: a Tempestray falls about 15%, Coralynx and the epics rise. The raid is retuned in the same PR.

**What players lose:** the steady Bait from duplicates (committed players), the automatic fusion drip, and the old Tempestray as the obvious best.

### 6.6 Risks

- **Art and content cost:** 8 branch forms, then about 4 lines a season, each with sprite, lore, quirks, places and compendium entries.
- **A solved meta:** if one pick is always right, the choice is fake. The sim reports pick rates; the weekly rule moves the best answer.
- **Decision fatigue for casuals:** a "Recommended" pick on every choice, and nothing expires.
- **Power creep:** golden talents and perks add power; budget them inside the retune.

### 6.7 How we simulate it

Sim policies for Teach / Fuse / Release, perk picks (by fight-scored power) and the weekly rule. Targets:

| Target                                                   | Today                               | Aim                  |
| -------------------------------------------------------- | ----------------------------------- | -------------------- |
| Base catalogue complete (MM / EN / RE)                   | week 6 / 12 / 40                    | 9 / 14 / 24          |
| Duplicate Bait as a share of committed Bait, week 20     | 61–69%                              | under 25%            |
| Creatures at level 20 or more at week 20 (MM / EN)       | not measured                        | 8 / 6                |
| Committed players whose raid trio changed from last week | not measured (near 0 after week 12) | 50% or more of weeks |
| Days in 7+ day dead periods at week 20 (MM)              | 100%                                | under 40%            |
| New journey milestones a week at week 20 (MM)            | 0.1                                 | 0.5 or more          |
| Bait held at week 30 (MM)                                | 4.7k                                | under 1k             |
| Pick rate of the most-picked option of each perk pair    | n/a                                 | under 75%            |

## 7. Sequencing

Each step is simulated on paired seeds before it ships. Misa prefers fewer PRs, so neighbouring steps can be merged into one PR if the sims agree.

1. **Groundwork** (small): remove the dead v1 rules and fix the stale docs listed in the systems map; pay the jackpot Essence in the sim; give the sim a power score that counts crit and reactions. Without it the sim cannot value modifiers.
2. **Gear A:** three slots, identity pools, grades, item levels, no caps, targeted sources (finale wish, today's chest), the visible jackpot, the migration of existing gear, and the raid retune.
3. **Gear B:** the Melding Pot, Tempering, Refining, pity stamps, blueprint remap.
4. **Creature A:** stat re-budget, talents and the duplicate choice, the talent book, roster goals with workshop slots 3 and 4, Essence topping up training, lower release Bait, and a second raid retune.
5. **Engine hooks:** perks and Trinket trigger modifiers together, since both need the same combat timing hooks.
6. **Content:** evolution branches, the first pack, the server album.
7. **The weekly boss rule.**

Later, in this order: expedition clean-up (familiarity per player instead of per creature, the third star, ranks 7–10, the 2 h trip, milestones and journal rewards); the dungeon depth picker; levels past 30 if still needed.

**Untouched:** leet income; the raid's weekly shape (phases, the live finale, Boss Rank, Festival); the combat rules (roles, reactions, placement); the living room's presence; the supply PR's design; architecture and security rules.

## 8. Open technical notes

- **Migrations** (new ones only; released ones are never edited). Gear: `slot`, `identity`, `tempers_left` and grades in `rolls_json`; `equipped_on UNIQUE` becomes unique per (creature, slot); `level CHECK 0..5` becomes `1..10`; enchants cleared; the one-off conversion of 5.5. Creatures: `creature_talents`, `talent_book`, perk and `branch` columns; `UNIQUE(user_id, line)` and `fusion_count CHECK 0..5` stay. Pity stamps in a per-player row.
- **Rules and content (`packages/game`):** `rules/gear.ts` (`rollGear`, `gearBonus`, `applyGear` per slot, costs, `rollFinaleReward` with the wish; `cappedBonus` goes), `RULES.gear`, `rollTripLoot`, `rollDungeonLoot`, `gear-schema.ts`, `gear.json`, a new modifier-pool file, `enchants.json` retired; `content/schema.ts` (branches, talent pools), `creatures.json`, `fusion.ts`, `training.ts`, `power.ts`, `expeditions.ts` (`rollTripCatch`, duplicates).
- **Engine (`packages/engine`):** Attack, HP and crit still fold in before the fight (`applyGear`, `effectiveStats`), but identity lines (damage against an element, reaction bonus, aimed or area damage taken, armor, cover, boost, healing) need a small per-creature bonus sheet on `FightSlot`, read in `fight.ts`, `row.ts`, `dungeon.ts` and `forecast.ts`: plain numbers, not triggers. Step 5 adds trigger and perk hooks. Stored fights carry the sheet; absent means none, so old fights replay unchanged.
- **Worker:** `gear.ts`, `gear-store.ts`, `gear-grants.ts` (wish, today's chest, jackpot item), `gear-routes.ts`, `gear-schemas.ts` (strict schemas for wish, meld, Temper, Refine); `expeditions.ts` `applyCatch` (Teach / Fuse / Release becomes a pending choice on the claim, with a key); `collection.ts` (branch, talents, perks, respec); `raid-teams.ts` (`autoTeam`, "Equip best"); `ledger.ts` (Essence-paid training is a new spend source); `RAID_DIFFICULTY_VERSION` with each retune.
- **Server authority:** odds come from `RULES` and arrive with the screen; the client never computes them. Every meld, Temper, Refine, talent swap and respec is a keyed spend: check, debit, grant and stamps in one Durable Object transaction, the result rolled at the claim with `crypto.getRandomValues`.
- **Activity:** `Workshop.tsx` and the item components (slots, pips, odds, Tempers), the wish picker, the dungeon's chest line, the catch card's three choices, `Collection.tsx` (talents, perks, branch), the album; fixtures and workbench entries.
- **Sim:** `packages/sim/src/gear.ts`, `policy.ts`, `journey.ts`, `economy.ts`, `targets.json` (new `gear-*`, `talent-*` and collection targets; `curve-*` moves with every power change).
- **Docs and names:** `gear.md`, `creatures.md` and `docs/balance/scalars.md` rewritten as each step ships; glossary and how-to-play entries; compendium entries for every new base, talent, form and species (`compendium.test.ts`). "Melding Pot", "talent" and "den level" are working names, to check against the compendium's tone.
