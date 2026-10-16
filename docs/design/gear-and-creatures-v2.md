# Gear and creatures v2: the foundation of the revamps

Status: **proposal for Misa's review**, 2026-10-16. Nothing here is built. Asked for in decision 8 of "Misa's second round on the revamps" (`decisions.md`, 2026-10-16): the full gear modifier list, the creature talents and choices, and why each choice is meaningful, reviewed before anything is built.

Binding inputs, in order of precedence: the three newest 2026-10-16 entries in `decisions.md` ("Misa's direction after the raid retune", "Misa's answers to the systems review", "Misa's second round on the revamps"), then `systems-review.md` sections 5 and 6 where they still fit. Research: `docs/research/bazaar-poe-traits.md`, `loops-gear-collection.md`, `idle-coop-raids.md`. Engine facts are checked against `packages/engine/src/` (`fight.ts`, `types.ts`, `mutators.ts`) and `packages/game/src/rules/` (`gear.ts`, `config.ts`).

Every number is a **starting value**. The balance sim tunes them after a fight-scored power measure exists (today's `atk + floor(hp / 10)` cannot see crits, reactions or role lines). Names marked _(working name)_ still need a compendium check; everything new goes into `docs/compendium/` when it ships.

## 1. Summary for Misa

**Gear.** Three slots: **Hat, Scarf, Charm**. Every item has a fixed base line (its implicit) and 1, 2 or 3 rolled lines by rarity (Common, Rare, Epic; Festival is 2 rolled plus a fixed Festival line). Each slot rolls from its own **weighted pool**: Hats lean to attack, Scarves to toughness, Charms to roles, elements and trips. A few lines roll in only one slot, so players know where to hunt (crit damage only on Hats, silence immunity only on Scarves, trip speed only on Charms). Each line has **five tiers (I to V)**. An item's **level** is fixed when it drops or is crafted and decides the best tier it can roll, as in Path of Exile. No upgrades, no rerolls, no enchants: the chase is finding the item whose lines fit _this_ creature.

**Crafting.** Craft from a blueprint for scrap and shards (always a Common), or **Reach** for Rare or Epic with Essence (gated by Crafting level, odds shown). See the roll; keep it or **dismantle** it in a short Workshop job for a refund shown as a range. Dismantling trains Crafting and can teach the item's blueprint; finding a blueprint you know again makes it **well-thumbed**, a small stacking chance to craft one rarity higher.

**Creatures.** Every catch rolls a **talent** from its species' pool of 7 to 8 (one in 20 is **golden**, worth 1.5x). A duplicate is a choice: **Teach** its talent, **Fuse** it (the stat step, as today), **Release** it for parts, or **Keep** it when you do not own the line's other branch yet. Lines get **branch evolutions** at level 15 (permanent); the first two are Sproutle (Thornbuck the Guard or **Sunfawn** the Support) and Zipmouse (Voltaro the Setter or **Ohmouse** the Guard).

**Training.** Creatures grow from what they do: trips, dungeon rooms, raid stages and Workshop jobs. Limited slots decide who gets that experience. Bait becomes **treats** that double one activity's experience. Levels 10 and 20 are **ribbons** (Bronze and Silver) that cost materials only and open the Scarf and Charm slots. No levels past 30.

**Boons and Omens.** Each day at 13:37 the valley gets a Boon and (from Boss Rank 3) an Omen that touch the raid, the dungeon and trips, stronger at higher ranks. A raid planned on Thursday can meet bad weather on Saturday.

**Power over the journey.** Early power is creatures; gear takes over once creatures cap. Target gear share of a committed player's raid team: about 8% in week 2, 18% in week 8, 28% in week 20, 33% to 40% at the plateau (section 4).

**What goes:** gear upgrades +1 to +5, Improve, enchants, the per-creature gear caps, speed on gear, charm/band/trinket kinds, blueprint rarity, Bait spent straight on levels, the half-price training discount (catch-up experience replaces it), automatic fusion, duplicates turning into Bait.

## 2. The item

### 2.1 Anatomy

An item is `{ base, slot, tag, rarity, itemLevel, implicit, lines[], madeBy, madeAt, source }`.

- **Slot:** Hat, Scarf or Charm. A creature wears one of each. Cape is kept for a later fourth slot.
- **Base and tag:** a base is the kind of thing (Kelp Cap, Leafknit Scarf, Crossroads Compass). Its **tag** is an element (Tide, Ember, Grove, Spark), neutral, explorer, or a role (role-locked Charms only). The tag is the Bazaar-style bridge: it triples the weight of its own element's lines and gives the implicit.
- **Implicit:** a fixed line from the base, its size set by the item level band. It is the sure part of every item, so even a Common is never empty.
- **Rolled lines:** 1 / 2 / 3 by rarity, drawn by weight from the slot's pool (times the tag), never two of the same line on one item. Each line rolls one tier; a tier is one fixed number (no range inside a tier), so an item has exactly two layers of randomness: which lines, and which tier.
- **Provenance:** "Made by Magmole · 2 Nov 2026", "From the Cinder Wyrm, Boss Rank 13", "Found in the dungeon, depth 28". Stored on the item for the "this one is mine" feeling and future gifting.

### 2.2 Slots and when they open

| Slot  | Opens                            | Leans to                                    | Only here                                                                                                         |
| ----- | -------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Hat   | From the start                   | Attack, crits, first hits, element hunting  | Crit damage, First pounce                                                                                         |
| Scarf | Bronze Ribbon (passing level 10) | HP, damage taken, healing, wards            | All damage taken, Unbothered, Brace, Between-room rest                                                            |
| Charm | Silver Ribbon (passing level 20) | Roles, reactions, trips, Workshop, elements | Cover, Boost, Spark-share, Lingering, Adaptation pierce, Quick feet, Lucky find, Packer, Apprentice, Tinker's eye |

### 2.3 Bases

| Slot  | Neutral     | Tide           | Ember         | Grove          | Spark        | Special                                                                                                                                         |
| ----- | ----------- | -------------- | ------------- | -------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Hat   | Trail Cap   | Kelp Cap       | Coal-Warm Cap | Acorn Cap      | Thundercap   |                                                                                                                                                 |
| Scarf | Patch Scarf | Seafoam Scarf  | Ember Muffler | Leafknit Scarf | Static Wrap  | Festival Hearth Scarf (Ember, Festival)                                                                                                         |
| Charm | Trail Charm | Tidepool Charm | Cinder Charm  | Mossy Charm    | Static Charm | Crossroads Compass (explorer); Warden's Bell, Hearth Bell, Footprint Charm, Pounce Charm (role-locked); Festival Lantern Charm (Tide, Festival) |

All names are _(working names)_. The Charm names reuse today's charms, so converted items keep familiar names.

**Implicits by item-level band** (band I is item level 1 to 4, II 5 to 9, III 10 to 14, IV 15 to 19, V 20):

| Base kind                              | I     | II    | III   | IV    | V     |
| -------------------------------------- | ----- | ----- | ----- | ----- | ----- |
| Hat: Attack                            | +2%   | +3%   | +4%   | +5%   | +6%   |
| Scarf: HP                              | +3%   | +4%   | +5%   | +7%   | +8%   |
| Element Charm: its Attunement          | +2%   | +3%   | +4%   | +5%   | +6%   |
| Trail Charm: Attack                    | +1%   | +2%   | +2%   | +3%   | +4%   |
| Crossroads Compass: Trail XP           | +3%   | +4%   | +5%   | +6%   | +8%   |
| Warden's Bell (Guard): Armor           | +1 pt | +2 pt | +2 pt | +3 pt | +4 pt |
| Hearth Bell (Support): Boost           | +1 pt | +1 pt | +2 pt | +3 pt | +3 pt |
| Footprint Charm (Setter): Marking hit  | +3%   | +4%   | +6%   | +8%   | +10%  |
| Pounce Charm (Payoff): Payoff's pounce | +2%   | +2%   | +3%   | +4%   | +5%   |

**Tag weights.** An element tag multiplies its own element's four lines (Attunement, Hunter, Reaction, Ward) by 3. A role-locked Charm multiplies its role's lines by 3, cannot roll other roles' lines, and can only be worn by that role. The Crossroads Compass multiplies the utility lines by 3 and every combat line by 0.3. Neutral bases use the plain weights.

### 2.4 Rarity, item level and tiers

| Rarity   | Rolled lines              | Lines that need this rarity or better           | Look                       |
| -------- | ------------------------- | ----------------------------------------------- | -------------------------- |
| Common   | 1                         |                                                 | Plain frame                |
| Rare     | 2                         | All damage taken, Lucky find, Adaptation pierce | Blue frame                 |
| Epic     | 3                         | the above, plus Lingering and Unbothered        | Violet frame               |
| Festival | 2 + 1 fixed Festival line | as Epic                                         | Its own lantern-gold frame |

**Item level** runs from 1 to 20 and is fixed at the drop or the craft. It unlocks tiers, Path of Exile style:

| Tier | Pips  | Unlocked from item level |
| ---- | ----- | ------------------------ |
| I    | ●○○○○ | 1                        |
| II   | ●●○○○ | 5                        |
| III  | ●●●○○ | 10                       |
| IV   | ●●●●○ | 15                       |
| V    | ●●●●● | 20                       |

**How a tier is rolled.** Counting down from the best tier the item level allows, the weights are 15 / 30 / 30 / 25; tiers further down cannot roll. So at item level 20 a line is V 15%, IV 30%, III 30%, II 25%, and never I; at item level 15 to 19 it is IV 15%, III 30%, II 30%, I 25%; at 10 to 14 it is III 20%, II 40%, I 40%; at 5 to 9 II 33%, I 67%. The card shows the pips rolled and the best this item could have rolled, so a "top roll for its level" is visible.

**Item level by source:**

| Source                                                                      | Item level                                                                              | Rarity                                      | Tag                                                       |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------- |
| Welcome kit                                                                 | 1                                                                                       | Common Hat                                  | Neutral                                                   |
| Raid finale reward slot (a quarter of the time a blueprint)                 | 3 + Boss Rank (rank 2: 5, rank 7: 10, rank 12: 15, rank 17: 20)                         | By Boss Rank, as today (`finaleDropOddsBp`) | The boss's element; 1 Charm in 20 is role-locked          |
| Festival finale piece                                                       | 5 + Boss Rank, at most 20                                                               | Festival                                    | The Festival's                                            |
| Daily dungeon full clear (15% chance; landmarks guaranteed)                 | 1 + floor(depth / 2), +3 at a landmark, at most 20 (depth 8: 5, 18: 10, 29: 15, 38: 20) | By depth, as today (`gearOdds`)             | The room boss's element                                   |
| Expedition finds (Shortcut and Ancient vault push-ons, rare day-trip finds) | 2 x the finder's explorer rank (rank 3: 6, rank 6: 12, rank 10: 20)                     | Rare and Epic, as today                     | The place's element; Old Crossroads gives explorer pieces |
| Crafting                                                                    | 2 x the crafter's Crafting level (level 5: 10, level 8: 16, level 10: 20)               | Common, or Reach (section 3)                | The blueprint's                                           |

What this means over a journey (committed players): item level about 5 to 7 in week 2 (tier II), 10 to 12 by week 8 (III), 15 to 17 by week 20 (IV), and the first V lines from about week 25. Explorer ranks 7 to 10 and Crafting levels 8 to 10, today dead ends, become the way to item level 20 without a deep dungeon.

## 3. The crafting loop

1. **Craft.** Pick a known blueprint (a base). Pay 6 scrap and 1 shard of its tag's element (neutral and role bases: any shard you choose; the Compass: 8 scrap, no shard). The job takes 3 hours and always makes a **Common** at item level 2 x the crafter's Crafting level.
2. **Reach** (optional, on top). **Reach for Rare** (Crafting level 3+): +25 Essence and +1 shard, 6 hours: Rare 60%, Common 40%. **Reach for Epic** (Crafting level 6+): +70 Essence, +2 shards and 1 glimmer, 10 hours: Epic 30%, Rare 55%, Common 15%.
3. **One step up.** After the rarity is drawn, a craft has a chance to come out one rarity higher (Common to Rare, Rare to Epic): +1 point per Crafting level above 1 (as today's `rarityUpBpPerLevel`) plus +1 point per **well-thumbed** mark on the blueprint (at most 10).
4. **See the roll** at the claim (live server randomness, idempotent claim). Keep it, or dismantle it.
5. **Dismantle** is a short Workshop job run by a creature you pick: Commons in bundles of up to 5 in 15 minutes, a Rare in 1 hour, an Epic or Festival piece in 2 hours. It gives Crafting XP (12 per hour, at least 6) and a chance to **learn the item's blueprint** (6% + 1 point per Crafting level). If the blueprint is already known, the same chance adds a well-thumbed mark instead.

**Dismantle refunds, shown before you confirm:**

| Rarity           | Scrap | Shards (of the tag; neutral: random) | Glimmer | Essence |
| ---------------- | ----- | ------------------------------------ | ------- | ------- |
| Common           | 2–4   | 0                                    | 0       | 0       |
| Rare             | 4–8   | 1                                    | 0       | 3–8     |
| Epic or Festival | 8–14  | 1–2                                  | 0–1     | 10–25   |

Every full 5 item levels add 1 scrap to both ends. The crafter's Crafting level lifts the low end by one step for every 2 levels, never past the top: "2–4 scrap (your Magmole: 3–4)". Essence in the refund means an unwanted Epic from the raid funds the next Reach.

**Well-thumbed blueprints.** Every repeat find of a known blueprint (trips, the finale's blueprint slot, dismantle luck) adds a mark, shown as "Kelp Cap, well-thumbed 4 / 10". Today a repeat blueprint is 5 scrap; now it is progress toward better crafts of the item you keep making.

**Showing odds.** The Workshop shows the Reach odds and the one-step-up chance as words ("likely Rare, a fair chance of Epic") with exact numbers one tap away (open question 8). The server sends the odds from `RULES`; the client never computes them.

**What it absorbs.** A committed player's surplus (about 45 Essence, 15 to 20 shards, 5 glimmer a week in the study) is about one Reach for Epic and one Reach for Rare a week. Regulars can Reach for Rare every week or two from raid Essence.

## 4. Gear's share of power over the journey

Misa's rule: early power is mostly creatures; once creature growth slows, gear is the main growth. Targets for the journey sim, measured with a **fight-scored power** (the sim's job before any of this ships):

| Point in the journey     | Committed (min-maxer, engaged)   | Regular | Drop-in | What grows                                       |
| ------------------------ | -------------------------------- | ------- | ------- | ------------------------------------------------ |
| Week 2                   | 5–10%                            | 3–6%    | 0–3%    | Levels, the first evolution, first talents       |
| Week 8                   | 15–22%                           | 10–15%  | 5–8%    | Levels 20+, Silver Ribbons, tier III lines       |
| Week 20                  | 25–32%                           | 18–24%  | 10–15%  | Committed trios at 30; tier IV; talents          |
| Plateau (week 30 and on) | 33–40% (a perfect set about 45%) | 28–34%  | 15–20%  | Gear only: tier V lines and better-fitting items |

Also: from the week a committed player's raid trio reaches level 30, gear gives at least 70% of their further raid-team power growth; a committed player finds an upgrade worth at least 2% of team power at least every two weeks up to week 30; nobody completes a perfect set within 30 weeks. Today gear is 13% at the plateau and stops improving at week 12 to 18. Higher gear power means the raid curve's scalars are retuned after the revamps, as Misa set out.

## 5. The full modifier list

How to read the tables:

- **I to V:** the line's value at each tier. "pt" is percentage points on a percentage that already exists (Guard armor 25%, cover 40%, Support boost 15%, crit chance 5%).
- **Hat / Scarf / Charm:** roll weights in that slot's pool (higher is more common; a dash means it never rolls there). The tag multiplier (2.3) applies on top.
- **Rarity:** which rarities can roll it (C Common, R Rare, E Epic and Festival).
- **Engine:**
  - **Ready**: the engine already models it; `applyGear` folds it into Attack, HP or crit before the fight, as today's gear and enchants do.
  - **Sheet**: needs the per-creature modifier sheet (section 5.7): plain numbers on `FightSlot`, read at a step `fight.ts` already has.
  - **Dungeon**: a small change to the dungeon runner (`dungeon.ts`), between rooms.
  - **Rules**: not combat; expedition or Workshop rules in `packages/game`.

### 5.1 Core stats

| Line             | Effect                         | I     | II    | III   | IV    | V     | Hat | Scarf | Charm | Rarity | Engine | Who wants it                                                  |
| ---------------- | ------------------------------ | ----- | ----- | ----- | ----- | ----- | --- | ----- | ----- | ------ | ------ | ------------------------------------------------------------- |
| Attack           | Attack +%                      | +2%   | +4%   | +6%   | +8%   | +11%  | 100 | 10    | 20    | C R E  | Ready  | High-Attack Payoffs (Pyrelynx, Tempestray, Gaiadrake)         |
| Sturdy blow      | Attack + a flat amount         | +2    | +4    | +6    | +9    | +12   | 80  | 15    | 20    | C R E  | Ready  | Low-Attack creatures (Guards, Supports) and young creatures   |
| HP               | HP +%                          | +3%   | +5%   | +8%   | +11%  | +15%  | 10  | 100   | 20    | C R E  | Ready  | Big-HP Guards (Thornbuck, Fogwyrm, Hearthshell)               |
| Thick coat       | HP + a flat amount             | +12   | +25   | +40   | +55   | +75   | 15  | 80    | 20    | C R E  | Ready  | Fragile Payoffs and anyone young                              |
| Crit chance      | Crit chance +pt                | +1 pt | +2 pt | +3 pt | +4 pt | +5 pt | 60  | —     | 30    | C R E  | Ready  | Crit-built Payoffs (Cindle and Stormray lines)                |
| Crit damage      | Crit damage +pt                | +8    | +14   | +20   | +27   | +35   | 50  | —     | —     | C R E  | Ready  | The same, once crit chance is up                              |
| All damage taken | Damage taken from every hit −% | −2%   | −3%   | −4%   | −6%   | −8%   | —   | 25    | —     | R E    | Sheet  | Anyone the boss reaches every round                           |
| Area ward        | Area hits −%                   | −3%   | −5%   | −7%   | −9%   | −12%  | —   | 60    | 10    | C R E  | Sheet  | Creatures not beside a Guard; rows that get swept             |
| Aimed ward       | Aimed hits −%                  | −3%   | −5%   | −7%   | −9%   | −12%  | —   | 50    | 10    | C R E  | Sheet  | Guards (they take aimed hits for the row); the front creature |
| Well-fed         | Healing received +%            | +8%   | +14%  | +20%  | +27%  | +35%  | —   | 40    | 15    | C R E  | Sheet  | A creature beside a Tide or Grove Support                     |

### 5.2 Element lines

Each line exists once per element (X = Tide, Ember, Grove or Spark), so these four rows are 16 lines. An X-tagged base rolls its own X lines three times as often.

| Line         | Effect                                                                                                    | I   | II  | III  | IV   | V    | Hat | Scarf | Charm | Rarity | Engine | Who wants it                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------- | --- | --- | ---- | ---- | ---- | --- | ----- | ----- | ------ | ------ | -------------------------------------------------------------------------------------------- |
| X Attunement | Attack +% if the wearer is X                                                                              | +3% | +5% | +8%  | +11% | +14% | 30  | 10    | 40    | C R E  | Ready  | Any X creature: bigger than plain Attack, dead on the others                                 |
| X Hunter     | Damage against foes of the element X beats +% (Tide Hunter: Ember foes)                                   | +4% | +7% | +10% | +13% | +17% | 40  | —     | 20    | C R E  | Sheet  | Anyone, when this week's boss or today's room is that element: a reason to swap gear by boss |
| X Reaction   | The bonus of the reaction X sets off +% (Tide: Steam, Ember: Wildfire, Grove: Grounding, Spark: Overload) | +5% | +9% | +13% | +18% | +24% | 20  | —     | 50    | C R E  | Sheet  | The creature that cashes that reaction, Payoffs first                                        |
| X Ward       | Damage from foes of the element that beats X −% (Tide Ward: Spark foes)                                   | −4% | −7% | −10% | −13% | −17% | —   | 50    | 10    | C R E  | Sheet  | Everyone, against that boss; X creatures most of all, since that boss counters them          |

### 5.3 Role lines

| Line            | Effect                                                                                           | I                         | II    | III   | IV    | V      | Hat | Scarf | Charm | Rarity | Engine | Who wants it                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------ | ------------------------- | ----- | ----- | ----- | ------ | --- | ----- | ----- | ------ | ------ | ----------------------------------------------------------------------------------------- |
| Armor           | A Guard's armor +pt (on 25%)                                                                     | +2 pt                     | +3 pt | +5 pt | +7 pt | +9 pt  | —   | 30    | 40    | C R E  | Sheet  | Guards only (`guardArmorFor` already takes the creature)                                  |
| Cover           | A Guard's cover for its neighbours +pt (on 40%)                                                  | +3 pt                     | +5 pt | +7 pt | +9 pt | +12 pt | —   | —     | 40    | C R E  | Sheet  | A Guard with Payoffs beside it                                                            |
| Boost           | A Support's boost to its neighbours +pt (on 15%, Ember 25%)                                      | +2 pt                     | +3 pt | +4 pt | +6 pt | +8 pt  | —   | —     | 50    | C R E  | Sheet  | Supports, Magmole most                                                                    |
| Mend            | A Support's neighbours heal +% of max HP at round start (Ember and Spark Supports start healing) | +1%                       | +1.5% | +2%   | +3%   | +4%    | —   | 10    | 35    | C R E  | Sheet  | Supports that do not heal today (Magmole, Aurorix); Tide and Grove ones heal more         |
| Spark-share     | A Support's neighbours' reaction bonus +%                                                        | +4%                       | +6%   | +9%   | +12%  | +15%   | —   | —     | 30    | C R E  | Sheet  | A Support placed beside the team's Payoff                                                 |
| Marking hit     | The hit that leaves or replaces a mark +%                                                        | +5%                       | +9%   | +13%  | +18%  | +24%   | 30  | —     | 30    | C R E  | Sheet  | Setters, and whoever marks first                                                          |
| Payoff's pounce | Every reaction's multiplier +% (on top of the Payoff's 110%)                                     | +3%                       | +5%   | +8%   | +10%  | +13%   | 25  | —     | 40    | C R E  | Sheet  | Payoffs                                                                                   |
| Strike          | Its ability's strike +%                                                                          | +6%                       | +10%  | +14%  | +19%  | +25%   | 20  | —     | 30    | C R E  | Sheet  | Creatures whose ability strikes (Flare Strike, Coral Lance, Thunder Strike, Verdant Roar) |
| Lingering       | Its ability's Rally, Shield Wall and Purge last 1 more round                                     | one value, item level 15+ |       |       |       |        | —   | —     | 10    | E      | Sheet  | Thornbuck, Fogwyrm, Magmole, Aurorix, Hearthshell                                         |

### 5.4 Reaction and mark lines

| Line              | Effect                                                                                             | I                         | II    | III   | IV    | V     | Hat | Scarf | Charm | Rarity | Engine | Who wants it                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------- | ------------------------- | ----- | ----- | ----- | ----- | --- | ----- | ----- | ------ | ------ | -------------------------------------------------------------------------- |
| Marked foe        | Hits on a marked foe that do not set off a reaction +%                                             | +4%                       | +6%   | +9%   | +12%  | +15%  | 30  | —     | 15    | C R E  | Sheet  | Off-element hitters, Guards and Supports in a mark-heavy line              |
| First pounce      | Its first hit in each fight +%                                                                     | +8%                       | +14%  | +20%  | +27%  | +35%  | 30  | —     | —     | C R E  | Sheet  | Dungeon teams (three fights a run); fast creatures against the Cinder Wyrm |
| Owner's mark      | Reactions cashed on a mark this creature left +% (the engine already tracks the setter for credit) | +4%                       | +7%   | +10%  | +13%  | +17%  | 15  | —     | 25    | C R E  | Sheet  | Setters that mark for a strong Payoff                                      |
| Backdraft ward    | Reflected hits on it −%                                                                            | −8%                       | −14%  | −20%  | −27%  | −35%  | —   | 30    | 15    | C R E  | Sheet  | Payoffs against the Cinder Wyrm's Backdraft and the Thorns room            |
| Keen reaction     | Crit chance on hits that set off a reaction +pt                                                    | +2 pt                     | +3 pt | +5 pt | +6 pt | +8 pt | 25  | —     | 15    | C R E  | Sheet  | Crit-built Payoffs                                                         |
| Adaptation pierce | The boss's adaptation resists its hits less, by %                                                  | 10%                       | 15%   | 20%   | 27%   | 35%   | —   | —     | 20    | R E    | Sheet  | The server's main carry, the one the boss learns to resist after Phase 1   |
| Unbothered        | Ignores silence                                                                                    | one value, item level 15+ |       |       |       |       | —   | 10    | —     | E      | Sheet  | Whoever stands at either end of the line (silence picks the ends)          |
| Brace             | Damage from charged moves −%                                                                       | −6%                       | −10%  | −14%  | −19%  | −25%  | —   | 30    | —     | C R E  | Sheet  | Creatures that get marked by Great Wave, Seed Burst and dungeon signatures |

### 5.5 Utility and explorer lines

None of these touch combat, so a bench creature that never raids has gear worth wearing.

| Line              | Effect                                             | I       | II    | III     | IV    | V     | Hat | Scarf | Charm | Rarity | Engine  | Who wants it                                  |
| ----------------- | -------------------------------------------------- | ------- | ----- | ------- | ----- | ----- | --- | ----- | ----- | ------ | ------- | --------------------------------------------- |
| Trail XP          | Explorer XP from trips +%                          | +5%     | +8%   | +12%    | +16%  | +20%  | 5   | 5     | 40    | C R E  | Rules   | Creatures climbing explorer ranks             |
| Quick feet        | Its trips take −% time                             | −2%     | −3%   | −4%     | −6%   | −8%   | —   | —     | 25    | C R E  | Rules   | The daily traveller                           |
| Keen nose         | Parts found on its trips +%                        | +6%     | +10%  | +15%    | +20%  | +25%  | —   | 10    | 30    | C R E  | Rules   | Scrap-hungry crafters' scouts                 |
| Lucky find        | Catch rarity-up chance on its trips +pt            | +0.5 pt | +1 pt | +1.5 pt | +2 pt | +3 pt | —   | —     | 10    | R E    | Rules   | Collectors chasing rares and epics            |
| Packer            | Chance of a supply find on its trips +%            | +10%    | +20%  | +30%    | +40%  | +50%  | —   | —     | 20    | C R E  | Rules   | Players who live on supplies                  |
| Busy paws         | Workshop jobs it runs take −% time                 | −3%     | −5%   | −7%     | −9%   | −12%  | 10  | —     | 30    | C R E  | Rules   | The house crafter                             |
| Apprentice        | Crafting XP it earns +%                            | +8%     | +14%  | +20%    | +27%  | +35%  | —   | —     | 25    | C R E  | Rules   | A creature being raised as the crafter        |
| Tinker's eye      | Dismantles it runs: the refund's low end +steps    | +1      | +1    | +2      | +2    | +3    | —   | —     | 15    | C R E  | Rules   | The house crafter                             |
| Growing           | Creature experience from every activity +%         | +4%     | +6%   | +9%     | +12%  | +15%  | 5   | 10    | 20    | C R E  | Rules   | A second trio catching up                     |
| Between-room rest | In the dungeon, recovers % of max HP between rooms | +2%     | +3%   | +4%     | +5%   | +7%   | —   | 30    | —     | C R E  | Dungeon | The dungeon creature that takes the most hits |

### 5.6 Festival lines

A Festival piece has one fixed line of its own, at its band's value: **Festival glow**, Attack and HP +2 / +3 / +3 / +4 / +5% (Ready). It looks distinct and has no power beyond Epic, as today.

### 5.7 What the engine needs: the modifier sheet

One small engine change unlocks every **Sheet** line, every combat talent and most Boons and Omens: an optional `mods` object on `FightSlot` (absent means none, so every stored fight replays exactly), filled by `applyGear` and the talent fold from the item, the talents and the day's weather. Each field is a plain integer read at a step the engine already has:

- **The creature's hit** (`hitBoss`): against-element bonus, marked-foe bonus, first-hit bonus, marking-hit bonus, strike bonus, adaptation pierce.
- **The reaction** (`calc`): per-reaction bonus, Payoff's pounce, owner's-mark bonus (the setter is known for setup credit), keen-reaction crit points, Spark-share from a Support beside it (where the Spark Support's `reactionBp` is read today).
- **The taker's steps** (section 3 of `combat-rules.md`): all-damage, area, aimed, reflected, charged and against-element reductions, applied after armor and cover in a fixed, documented order; healing received.
- **Roles:** Guard armor (`guardArmorFor`), the covering Guard's cover (`coverGuardFor`), a Support's boost, mend and share at round start.
- **Abilities and silence:** +1 round on its ability's timed effects; ignore silence.

Plus the forecast, the fight log text (`describe.ts`) and playback. Conditions (wearer element or role, the foe's element) are resolved when the sheet is built, so the engine sees only numbers. Estimated: one engine PR with tests, the replay fixture untouched.

## 6. Later lines (design now, build later)

These are clearly **later**: none ships with the first gear release. They use the same tags (elements, roles) as the bridge, and each gets at most one slot on an item (a fourth line on Epics, or a line that replaces one roll). Item-level gating and tiers apply as above.

### 6.1 Position lines

Positions are fixed once a fight starts, so most of these can be folded when the fight input is built (no engine change); "while it stands" versions need the engine to re-check each round.

| Line                  | Effect (tier V)                                                                | Who wants it                               | Engine                     |
| --------------------- | ------------------------------------------------------------------------------ | ------------------------------------------ | -------------------------- |
| Shoulder to shoulder  | Attack +5% for each creature beside it of the same element (at most 2)         | Mono-element rows                          | Fold                       |
| Odd one out           | Attack +10% if nobody beside it shares its element                             | Mixed rows built for reactions             | Fold                       |
| Edge-walker           | Attack +10% at either end of its row                                           | The row's ends (also where silence lands)  | Fold                       |
| Heart of the row      | HP +12% in the middle of its row                                               | A Guard in the middle, covering both sides | Fold                       |
| Front-liner           | Damage taken −10% in the Front row                                             | Front Guards                               | Fold                       |
| Back-row patience     | Crit chance +4 pt in the Back row                                              | Back-row Payoffs                           | Fold                       |
| Lantern bearer        | Creatures beside it HP +6%                                                     | A Support or Guard in the middle           | Fold                       |
| Warm burrow           | Creatures beside it heal 2% of max HP at round start, while it stands          | Any creature, Ashmole line most            | Sheet + per-round check    |
| Lane anchor           | Attack +8% while a Guard stands in its lane                                    | Payoffs behind a lance-stopping Guard      | Engine (lanes, each round) |
| Four winds            | Reaction bonus +10% if its row holds four different elements (raid rows of 4+) | Big parties with wide rows                 | Fold                       |
| Beside the mark-maker | Marked-foe hits +10% while a Setter stands beside it                           | Payoffs placed next to their Setter        | Sheet + per-round check    |
| Sheltered             | Cover on it +6 pt (stacks with the Guard's)                                    | Fragile creatures next to a Guard          | Sheet                      |

### 6.2 Set bonuses

A set is three named pieces (Hat, Scarf, Charm) sharing a tag. Bonuses count pieces worn by one creature.

| Set                 | Tag      | 2 pieces                                                            | 3 pieces                                                   |
| ------------------- | -------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| Tidepool Finery     | Tide     | Steam bonus +8%                                                     | Its first Steam each fight cannot be reflected             |
| Forge-Warm Kit      | Ember    | Wildfire bonus +8%                                                  | Crits after a Wildfire deal +20 pt crit damage for a round |
| Hollow Weave        | Grove    | HP +8%                                                              | Heals 3% of max HP whenever it cashes Grounding            |
| Ridge Copper        | Spark    | Crit chance +2 pt                                                   | Overload also leaves Charged afterwards (a chain)          |
| Warden's Watch      | Guard    | Armor +4 pt                                                         | Cover reaches one more slot in its row                     |
| Hearth Helpers      | Support  | Boost +3 pt                                                         | Its boost also lands on the creature two slots away        |
| First Footprints    | Setter   | Marking hit +8%                                                     | Its first mark each fight cannot be replaced               |
| Pounce Set          | Payoff   | Payoff's pounce +5%                                                 | Its first reaction each fight crits                        |
| Crossroads Wanderer | Explorer | Trips −4% time                                                      | One extra catch roll on 24 hour trips                      |
| Lantern Night       | Festival | Attack and HP +3%                                                   | Shield Walls on its row last 1 more round                  |
| Maker's Mark        | Any      | Three pieces made by the same creature: every line +5% of its value | (one bonus only)                                           |

### 6.3 Chance lines

Chance grows with tier and rarity: **4 / 6 / 8 / 10 / 12%** at tiers I to V, +2 points on Epics and Festival pieces. Combat chances need a per-creature "luck die" each round, drawn after every existing die and only when the feature is on, so older fights draw exactly what they did.

| Line          | Effect                                                          | Who wants it                  | Engine |
| ------------- | --------------------------------------------------------------- | ----------------------------- | ------ |
| Second wind   | Chance each round to heal 5% of max HP                          | Front creatures               | Dice   |
| Echo          | Chance its hit lands again at 30%                               | High-Attack Payoffs           | Dice   |
| Sidestep      | Chance to take nothing from an area hit                         | Back-row creatures            | Dice   |
| Quick re-mark | Chance its hit leaves its mark over another mark, like a Setter | Non-Setters who mark first    | Dice   |
| Steady paws   | Chance to shrug off a silence                                   | Line ends                     | Dice   |
| Spill-over    | Chance a reaction it sets off leaves its own mark after         | Payoffs in two-reaction teams | Dice   |
| Warm heart    | Chance at round start to give a creature beside it a 10% boost  | Guards beside Payoffs         | Dice   |
| Lucky find    | Chance a trip brings back one extra catch roll                  | Collectors                    | Rules  |
| Tinker's luck | Chance a dismantle refunds the full craft cost                  | Crafters                      | Rules  |
| Second look   | Chance a duplicate's talent rolls twice and you keep the better | Talent hunters                | Rules  |

### 6.4 Trigger lines

Each names a defined moment from `combat-rules.md` and writes a log line when it fires. They need per-creature hooks in the engine (the existing mutator hooks are fight-wide).

| Line          | Moment                                  | Effect                                      | Who wants it                             |
| ------------- | --------------------------------------- | ------------------------------------------- | ---------------------------------------- |
| Payback       | It takes a hit for a neighbour          | Its next hit +30%                           | Guards                                   |
| Kindling      | Round 1 starts                          | Creatures beside it start with a boost      | Supports                                 |
| Opening mark  | Round 1 starts and the foe has no mark  | It leaves its mark                          | Setters                                  |
| Rally cry     | A creature beside it is knocked out     | Its hits +15% for the rest of the fight     | Anyone in a row with a fragile neighbour |
| Ember tail    | It crits                                | Its next hit +20%                           | Crit Payoffs                             |
| Storm warning | A charge is announced with it marked    | It takes 30% less from the landing          | Front and middle rows                    |
| Stubborn      | A hit would knock it out (once a fight) | It stays at 1 HP                            | Carries                                  |
| Last stand    | It falls to a quarter of its HP         | Damage taken −20% for the rest of the fight | Guards                                   |
| Overflow      | It sets off a reaction                  | The next creature to act gets a 15% boost   | Payoffs mid-order                        |
| Second breath | The first enrage round starts           | Heals 10% of max HP                         | Teams that go to overtime                |
| Patient       | It is silenced                          | Its next hit after the silence +25%         | Line ends                                |
| Shared warmth | A Support heals it                      | The Support's next boost +3 pt              | Pairs of Support and Guard               |

## 7. Example items

Cards as they would read in the Workshop. Pips: ● rolled, ○ not; the best tier the item level allows is the last pip shown. Dismantle ranges follow section 3.

#### Coal-Warm Cap

_Hat · Epic · item level 20 · Ember_

- Base: Attack +6%
- Wildfire bonus +24% (V)
- Crit damage +27 (IV)
- Attack +8% (IV)
- From: made by Magmole · 2 Nov 2026
- Dismantle: 12–18 scrap, 1–2 Ember shards, 0–1 glimmer, 10–25 Essence

**The great one.** Three lines that all fit a Pyrelynx cashing Wildfire on a Grove Setter's Overgrown mark. A top-tier roll on the line that matters most. Keep it for years.

#### Patch Scarf

_Scarf · Rare · item level 7 · neutral_

- Base: HP +4%
- Trail XP +5% (I)
- Well-fed +8% (I)
- From: found in the dungeon, depth 12 · 20 Oct 2026
- Dismantle: 5–9 scrap, 1 shard, 3–8 Essence

**The dud.** Low tiers, and lines a raider barely uses (healing received only matters beside a healer). Dismantle it: the Essence goes toward the next Reach.

#### Hearth Bell

_Charm · Epic · item level 16 · Support only_

- Base: Boost +3 pt
- Lingering: its ability's effects last 1 more round
- Mend +3% (IV)
- Ember Attunement +11% (IV)
- From: from the Cinder Wyrm, Boss Rank 13 · 8 Nov 2026
- Dismantle: 11–17 scrap, 1–2 shards, 0–1 glimmer, 10–25 Essence

**The niche one, perfect for one creature.** On Magmole it is everything: Magma Glow rallies for three rounds instead of two, an Ember Support that never healed now mends its neighbours, and it hits harder. On anyone else it cannot even be worn.

#### Leafknit Scarf

_Scarf · Epic · item level 18 · Grove_

- Base: HP +7%
- Armor +7 pt (IV)
- Aimed ward −9% (IV)
- Backdraft ward −20% (III)
- From: made by Ancientshell · 15 Nov 2026
- Dismantle: 11–17 scrap, 1–2 Grove shards, 0–1 glimmer, 10–25 Essence

**A Guard's keeper.** Thornbuck at the front of the row, taking every plain attack and the reflects it steps in for.

#### Seafoam Scarf

_Scarf · Epic · item level 15 · Tide_

- Base: HP +7%
- Unbothered: ignores silence
- Area ward −9% (IV)
- Brace −14% (III)
- From: found in the dungeon, depth 29 · 12 Nov 2026
- Dismantle: 11–17 scrap, 1–2 Tide shards, 0–1 glimmer, 10–25 Essence

**The edge piece.** For whoever stands at the end of the line, where Bramble Bind and Choking Vines land. A Support there keeps boosting through the Thornmother's silences.

#### Thundercap

_Hat · Rare · item level 11 · Spark_

- Base: Attack +4%
- Crit chance +3 pt (III)
- Overload bonus +13% (III)
- From: from the Storm Sovereign, Boss Rank 8 · 25 Oct 2026
- Dismantle: 6–10 scrap, 1 Spark shard, 3–8 Essence

**Solid mid-game.** Both lines fit a Tempestray; it will be replaced by a higher-level Hat, which is the point.

#### Crossroads Compass

_Charm · Rare · item level 12 · explorer_

- Base: Trail XP +5%
- Quick feet −4% (III)
- Lucky find +1 pt (II)
- From: found on a trip to the Old Crossroads (explorer rank 6) · 30 Oct 2026
- Dismantle: 6–10 scrap, 1 shard, 3–8 Essence

**For the creature that never raids.** Every trip a little shorter and a little luckier.

#### Festival Lantern Charm

_Charm · Festival · item level 18 · Tide_

- Base: Tide Attunement +5%
- Festival glow: Attack and HP +4%
- Steam bonus +18% (IV)
- Spark-share +9% (III)
- From: Festival finale, Boss Rank 13 · 16 Nov 2026
- Dismantle: 11–17 scrap, 1–2 Tide shards, 0–1 glimmer, 10–25 Essence

**A Festival keepsake that earns its place.** Made for Lanternfin beside a Tide Payoff.

#### Trail Cap

_Hat · Common · item level 1 · neutral_

- Base: Attack +2%
- Sturdy blow +2 (I)
- From: welcome kit
- Dismantle: 2–4 scrap

**Everyone's first hat.** Gone by the end of week one, as it should be.

## 8. Creatures: talents and the duplicate choice

### 8.1 The talent model

- **Every catch rolls one talent** from its line's pool (7 to 8 talents; branch forms share the line's pool). The catch card shows it before anything else happens. The draw is even across the pool, with live server randomness at the claim.
- **Golden talents:** 1 roll in 20 is golden, worth 1.5 times the value (rounded down), with a gold frame. That is the long chase: the right talent, golden, on the right creature.
- **Sizes:** a talent is about a tier III gear line. Talents use the same modifier vocabulary as gear, so they need no engine work beyond the sheet.
- **Slots:**

| Species rarity             | Slot 1   | Slot 2             | Slot 3   | Fixed signature talent |
| -------------------------- | -------- | ------------------ | -------- | ---------------------- |
| Common (lines that branch) | At catch | Silver Ribbon (20) | —        | —                      |
| Rare                       | At catch | Silver Ribbon (20) | Level 30 | —                      |
| Epic and Festival          | At catch | Silver Ribbon (20) | Level 30 | Yes                    |

Commons get branch evolutions and many duplicates (plenty to teach); rares and epics get a third slot, and epics a signature talent (for example Aurorix's "Watcher Above": its Purge lasts 1 more round).

- **The Talent Book.** Every talent a creature has held stays in its book. Slotting a talent from the book costs 10 Bait and is instant, so trying a build is safe. A golden talent stays golden in the book.

### 8.2 A duplicate is a choice

A duplicate catch arrives as a card with its rolled talent and four buttons. The choice waits (up to 10 pending; beyond that the oldest takes the Recommended choice), so nobody has to answer at once.

| Choice      | What happens                                                                                                 | When it is offered                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| **Teach**   | Its talent goes into a slot of your creature of that line; the replaced talent goes to the Talent Book       | Always (a talent already in the book only if this one is golden)     |
| **Fuse**    | One fusion step, as today (+6, +11, +15, +18, +20% stats at 1 to 5)                                          | Until 5 fusions                                                      |
| **Release** | Parts, not Bait: Common 3 scrap; Rare 6 scrap and 1 shard of its element; Epic 12 scrap, 2 shards, 1 glimmer | Always                                                               |
| **Keep**    | It stays as a second creature of the line, to evolve into the other branch                                   | Only while the line has a branch you do not own (at most 2 per line) |

**Recommended** (shown on the card, and what a drop-in's pending duplicates fall back to): Teach if the talent is golden or new to the book and better than an occupied slot's; else Keep if a branch is missing; else Fuse until 5; else Release.

### 8.3 Example talent pools

Names come from each line's shipped traits and quirks (`docs/compendium/creatures.md`). Values are normal / golden. The engine column says what each needs.

**Splashet line** (Splashet, Tidewing; Tide Setter)

| Talent             | Effect                                 | Normal / golden | Engine |
| ------------------ | -------------------------------------- | --------------- | ------ |
| Splashes First     | Its first hit in each fight +%         | +14% / +21%     | Sheet  |
| Wet Footprints     | Reactions cashed on its Soaked mark +% | +10% / +15%     | Sheet  |
| Bigger Splash      | The hit that leaves its mark +%        | +13% / +19%     | Sheet  |
| Puddle Hopper      | Area hits −%                           | −7% / −10%      | Sheet  |
| Playful            | Attack +%                              | +6% / +9%       | Ready  |
| First to Say Hello | Explorer XP +%                         | +12% / +18%     | Rules  |
| Easily Distracted  | Glimmer found on its trips +%          | +25% / +37%     | Rules  |

**Cindle line** (Cindle, Pyrelynx; Ember Payoff)

| Talent                | Effect                         | Normal / golden | Engine |
| --------------------- | ------------------------------ | --------------- | ------ |
| Quick to Pounce       | Its first hit in each fight +% | +14% / +21%     | Sheet  |
| Warm to the Touch     | Wildfire bonus +%              | +13% / +19%     | Sheet  |
| Chases Flickers       | Crit chance +pt                | +3 pt / +4 pt   | Ready  |
| Proud Ember           | Crit damage +pt                | +20 / +30       | Ready  |
| Waits for the Moment  | Hits on a marked foe +%        | +9% / +13%      | Sheet  |
| Purrs Like a Campfire | Workshop jobs it runs −% time  | −7% / −10%      | Rules  |
| Shade Napper          | Creature experience +%         | +9% / +13%      | Rules  |

**Sproutle line** (Sproutle, then Thornbuck or Sunfawn; Grove Guard, or Support after the Sunfawn branch)

| Talent               | Effect                                     | Normal / golden | Engine  |
| -------------------- | ------------------------------------------ | --------------- | ------- |
| Stands Close         | Cover +pt (Guards)                         | +7 pt / +10 pt  | Sheet   |
| Hard to Move         | Armor +pt (Guards)                         | +5 pt / +7 pt   | Sheet   |
| Shy Around Strangers | Aimed hits −%                              | −7% / −10%      | Sheet   |
| Perks Up in the Rain | Healing received +%                        | +20% / +30%     | Sheet   |
| Sunny Nap            | Recovers % of max HP between dungeon rooms | +4% / +6%       | Dungeon |
| Mossy Bed            | HP +%                                      | +8% / +12%      | Ready   |
| Shares the Sun       | Neighbours heal +% of max HP (Supports)    | +2% / +3%       | Sheet   |
| Light Sleeper        | Ignores the first silence in each fight    | one value       | Sheet   |

The pool holds both Guard and Support talents on purpose: a Sproutle's talents hint at which branch it should take, and a Talent Book full of Guard talents is a reason to keep a duplicate for the Sunfawn branch.

**Zipmouse line** (Zipmouse, then Voltaro or Ohmouse; Spark Setter, or Guard after the Ohmouse branch)

| Talent                | Effect                                              | Normal / golden | Engine |
| --------------------- | --------------------------------------------------- | --------------- | ------ |
| Zoomies               | Speed +% (acts earlier when the boss goes by speed) | +12% / +18%     | Ready  |
| Static Fizz           | Overload bonus +%                                   | +13% / +19%     | Sheet  |
| Charged Up            | The hit that leaves its mark +%                     | +13% / +19%     | Sheet  |
| Trail of Sparks       | Reactions cashed on its Charged mark +%             | +10% / +15%     | Sheet  |
| Races Anything        | Its first hit in each fight +%                      | +14% / +21%     | Sheet  |
| Scurries Off First    | Its trips take −% time                              | −4% / −6%       | Rules  |
| Freezes Like a Statue | Aimed hits −%                                       | −7% / −10%      | Sheet  |
| Big Ears              | Armor +pt (Guards)                                  | +5 pt / +7 pt   | Sheet  |

**Ashmole line** (Ashmole, Magmole; Ember Support)

| Talent               | Effect                                     | Normal / golden | Engine |
| -------------------- | ------------------------------------------ | --------------- | ------ |
| Warm Burrow          | Boost +pt                                  | +4 pt / +6 pt   | Sheet  |
| Toasty Paws          | Neighbours heal % of max HP at round start | +2% / +3%       | Sheet  |
| Cheerful in Ash      | Healing received +%                        | +20% / +30%     | Sheet  |
| Gentle but Stubborn  | Ignores the first silence in each fight    | one value       | Sheet  |
| Busy and Hardworking | Workshop jobs it runs −% time              | −7% / −10%      | Rules  |
| Digs for Friends     | Crafting XP +%                             | +20% / +30%     | Rules  |
| Hoards Cosy Things   | Parts found on its trips +%                | +15% / +22%     | Rules  |

**Coralynx** (Tide rare Payoff, single stage, three slots)

| Talent                     | Effect                               | Normal / golden | Engine |
| -------------------------- | ------------------------------------ | --------------- | ------ |
| Quiet, Sudden Bursts       | Its first hit in each fight +%       | +14% / +21%     | Sheet  |
| Coral Crown                | Steam bonus +%                       | +13% / +19%     | Sheet  |
| Strikes from the Shadows   | Crit damage +pt                      | +20 / +30       | Ready  |
| Fierce About Its Territory | Damage against Ember foes +%         | +10% / +15%     | Sheet  |
| Lance Practice             | Coral Lance's strike +%              | +14% / +21%     | Sheet  |
| Elegant                    | Attack +%                            | +6% / +9%       | Ready  |
| Patrols at Dusk            | Explorer XP on Moonlit Reef trips +% | +25% / +37%     | Rules  |

### 8.4 Branch evolutions

At level 15 an evolving line can grow one of two ways. The evolve screen shows both forms side by side (role, ability, stats). The choice is **permanent**: no de-evolve, no re-evolve. Evolved forms are not found in the wild. To own both branches, Keep a duplicate (8.2) and evolve it the other way. Room is left for a second evolution later (base, first, final), for example at level 25 per branch, once the first branches are measured.

**Sproutle: Thornbuck or Sunfawn.**

- **Thornbuck** (Grove Guard, as today; ability Ironbark Guard). "A sturdy stag with branching, thorned antlers that shelter the whole herd."
- **Sunfawn** _(working name)_, Grove **Support**, filling the empty Grove Support place. _"A gentle fawn whose leaf ears have opened into blossoms. It curls up beside tired friends and lends them the sun it has soaked up all day."_ Grows out of Sproutle's "Naps in any sunny patch". Ability **Sunny Patch**: Rally 6% for 2 rounds and a 30% Shield Wall on its own row for 1 round. As a Grove Support it heals its neighbours 6% a round.
- **The choice:** a wall for the front of the row, or a healer for its middle. Many servers lack a Grove healer; many players lack a second Guard.

**Zipmouse: Voltaro or Ohmouse.**

- **Voltaro** (Spark Setter, as today; ability Storm Zap). "A fast, fearless runner that leaves a trail of bright sparks."
- **Ohmouse** _(working name)_, Spark **Guard**, filling the empty Spark Guard place. _"A round, puffed-up mouse whose giant ears catch stray bolts before they reach its friends. It plants its feet, fizzes, and will not budge."_ Grows out of the Zipmouse quirk "Can freeze like a statue for an hour if asked nicely". Ability **Static Wall**: a 60% Shield Wall on its own row for 2 rounds, then it marks the boss Charged.
- **The choice:** a Setter that starts Grounding for the Grove team, or a Guard that protects a Spark Payoff's row. A Spark-heavy server wants both, which is what Keep is for.

Both new forms need a sprite (16x16), lore, quirks (the line's pool), compendium entries and a glossary entry; their stats follow the role budget the creature step sets (the review's "stats by role and stage").

## 9. Training by activity

### 9.1 Experience

A creature's level grows from experience, earned by doing things. Experience to go from level L to L+1 is **25 x L + 2 x L x L** (27 at level 1, 450 at 10, 1,300 at 20, 2,407 at 29; about 28,000 from 1 to 30).

| Activity      | Who earns          | Experience per creature                                                          | Slots that limit it                 |
| ------------- | ------------------ | -------------------------------------------------------------------------------- | ----------------------------------- |
| Expedition    | The explorer       | 2 h: 10 · 6 h: 30 · 12 h: 60 · 24 h: 120                                         | Expedition slots (1 to 5, as today) |
| Daily dungeon | The team of 3      | 20 per room cleared, +20 for a full clear (80 a day at most; depth adds nothing) | 3 creatures, once a day             |
| Raid          | The raid team of 3 | Phase 1: 50 · Phase 2: 50 · finale: 100; x1.5 when the stage is cleared          | 3 creatures a week                  |
| Workshop job  | The worker         | 4 per hour of the job (plus Crafting XP, as today)                               | Workshop slots (2)                  |

**Catch-up:** a creature more than 10 levels below the player's highest creature earns +50% experience. It replaces the half-price training discount and makes a second trio cheap to raise.

**The choice.** Experience goes only to creatures in a slot, and slots are few: a committed player has about 3 + 3 + 3 + 2 places a day for a roster of 10 or more. Focus the trio and it reaches 30 sooner; spread the places and a second team is ready for the week the boss or the weather favours it. The quadratic cost and the catch-up make spreading cheaper than it looks, so neither answer always wins.

### 9.2 Treats

Bait becomes **treats**. When a creature is sent on a trip, put in the dungeon team or given a job, the player can pack a treat: it doubles the experience that activity gives that creature. A treat costs 3 + half the creature's level, rounded up (Bait 4 at level 1, 8 at 10, 13 at 20, 18 at 29). Raids take no treats: the raid is the shared moment and pays everyone the same.

Starting pace (the sim tunes it): a committed player's trio reaches level 10 in week 1, evolves in week 2, reaches 20 in about week 5 and 30 in about week 11 (today 13); a regular reaches 20 by about week 10 and 30 by about week 24; a drop-in reaches about 18 by week 20 (today 17.8). A committed player cannot treat every activity (a full week of treats for a trio costs about 550 Bait against about 314 earned), so treats are a choice of who grows fastest.

### 9.3 Ribbons (the gates)

A creature stops at levels 10 and 20 until it earns a ribbon. Ribbons cost **materials only**, never a deep dungeon. Experience earned while waiting is banked (up to the next level's need), so nothing is lost.

| Ribbon        | At       | Cost                                                               | Opens                                               |
| ------------- | -------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| Bronze Ribbon | Level 10 | 6 scrap, 2 shards of its element                                   | Scarf slot (its ability unlocks at 10, as today)    |
| Silver Ribbon | Level 20 | 15 scrap, 5 shards of its element, 1 glimmer, and 5 finished trips | Charm slot, talent slot 2                           |
| Gold Ribbon   | Level 30 | Nothing: it is the reward                                          | Talent slot 3 (rare and epic), a frame in the album |

Evolution stays at level 15 for 20 or 40 Essence. No levels past 30.

### 9.4 Where spare Essence goes

Not training. Essence pays for evolution, the Reach in crafting (section 3) and, later, the dungeon's choice rooms ("spend 20 Essence to enter this room"). Dismantled Rares and Epics refund some Essence, so the raid's Essence and its gear feed the same lottery.

## 10. Boons and Omens

### 10.1 The rules

- **At every daily reset (13:37)** the valley gets one **Boon** and, from Boss Rank 3, one **Omen**, server-wide, drawn with live server randomness a day ahead and stored. The same Omen never comes two days running, and a day never gets a Boon and an Omen that cancel each other.
- **They touch three places:** the raid stage that resolves that game day (Phase 1 on Friday, Phase 2 on Saturday, the finale on Sunday), every dungeon run that day, and trips sent that day. A well-planned raid can meet a bad Saturday, and the server adapts the finale team.
- **Shown:** today's and tomorrow's, as a forecast on the home screen and the raid card (open question 1).
- **Stronger at higher ranks** (the server's Boss Rank), on both sides, Omens faster:

| Boss Rank | Boons | Omens                                                   |
| --------- | ----- | ------------------------------------------------------- |
| 1–2       | x1    | None (a new server learns the game first)               |
| 3–5       | x1    | x1                                                      |
| 6–9       | x1.25 | x1.5; Bramble Season can appear                         |
| 10–13     | x1.5  | x2; one wild Omen a week may appear (shown a day ahead) |
| 14+       | x1.5  | x2.5; one wild Omen a week                              |

Festival weeks have Boons only.

### 10.2 Starter list

Values are at x1. Engine: **Mutator** (the engine's existing hooks: fight start, round start, before a hit with the hitter's element and role, on a reaction), **Input** (a changed copy of the fight's `rules` or `luck`), **Sheet** (the same sheet as gear, for everyone), **Rules** (expeditions, Workshop; the weekly-special effect kinds already exist).

**Boons**

| Boon             | Raid and dungeon                                 | Trips and Workshop                                                         | Engine         |
| ---------------- | ------------------------------------------------ | -------------------------------------------------------------------------- | -------------- |
| Fair Winds       | Every creature's first hit each fight +10%       | Trips 10% shorter                                                          | Sheet, Rules   |
| Warm Hearth      | Supports' boost +4 pt                            | Workshop jobs 15% faster                                                   | Input, Rules   |
| Kind Rain        | Every creature heals 2% of max HP at round start | Tidepools and Verdant Hollow trips +25% parts                              | Sheet, Rules   |
| Clear Skies      | Crit chance +3 pt                                | Catch rarity-up +1 pt                                                      | Input, Rules   |
| High Water       | Steam and Overload +15%                          | Tidepools and Moonlit Reef: one extra catch roll on 12 h trips and longer  | Mutator, Rules |
| Bonfire Night    | Wildfire and Grounding +15%                      | Ember Caves and Storm Ridge: one extra catch roll on 12 h trips and longer | Mutator, Rules |
| Hearty Breakfast | —                                                | Creature experience +25%; treats triple instead of double                  | Rules          |
| Lantern Light    | Shield Walls last 1 more round                   | Journal pages twice as likely                                              | Sheet, Rules   |
| Market Day       | Dungeon rooms +1 scrap                           | Dismantles refund the top of their range; one-step-up chance +5 pt         | Rules          |
| Quiet Night      | The boss's adaptation is 25% weaker              | The Moonlit Reef stays open all day                                        | Input, Rules   |

**Omens**

| Omen                        | Raid and dungeon                                                            | Trips and Workshop                                 | Engine                          |
| --------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------- |
| Morning Haze                | The first creature of each row (dungeon: the left one) skips its first turn | Trips 10% longer                                   | Sheet, Rules                    |
| Heatwave                    | Foes' Attack +8%; Ember foes +15% instead                                   | Shards found −25%                                  | Mutator, Rules                  |
| Static Sky                  | Foes' crit chance +4 pt                                                     | —                                                  | Input                           |
| Heavy Rain                  | Area hits +10%                                                              | Trips 10% longer                                   | Sheet, Rules                    |
| Long Shadows                | Supports' boost −4 pt; healing −25%                                         | —                                                  | Input, Sheet                    |
| Restless Wind               | Guards' cover −10 pt                                                        | —                                                  | Input                           |
| Cold Snap                   | —                                                                           | Creature experience −20%; Workshop jobs 15% slower | Rules                           |
| Bramble Season              | The first reaction each round is reflected at 30% (rank 6+)                 | —                                                  | Engine: a reflect share (small) |
| Muddy Roads                 | —                                                                           | Trips 15% longer; supply finds −30%                | Rules                           |
| Stormfront (wild, rank 10+) | The boss makes one more plain attack each round                             | —                                                  | Input (`bossAttacks`)           |

The dungeon's room modifiers (Flooded, Thorns and the rest) stay as they are; weather is the server's sky, modifiers are the room.

## 11. Why these are meaningful choices

### 11.1 Gear lines and slots

- **The decision:** which item goes on which creature, and which items to keep. A Hat with Wildfire and crit damage is great on a Pyrelynx and ordinary on a Thornbuck; the Hearth Bell is everything on Magmole and nothing elsewhere.
- **No single right answer:** the best item depends on the creature's element, role, position and this week's boss (Hunter and Ward lines), and a mediocre line on the right creature beats a top line on the wrong one. Tags and exclusives make several items "best" for different creatures at once.
- **A chase without frustration:** every item has a base line, tiers are fixed numbers (no hidden range), the card shows the best this level could roll, and a bad item is dismantled for a shown range that funds the next try. Two layers of randomness, never three.
- **Min-maxer:** hunts the perfect lines per creature, swaps by boss, plans the line's ends for Unbothered. **Engaged:** "Equip best" plus one or two deliberate swaps a week. **Regular:** upgrades arrive steadily from the finale slot and the dungeon; the card says "better for Pyrelynx". **Drop-in:** Equip best; the Hat alone is enough.
- **Risk:** inventory sorting. "Equip best" per creature and per team, bulk dismantle by rarity and item level, and the cap of 60 keep it light.

### 11.2 Item level and the crafting loop

- **The decision:** where to get the next item (raise Boss Rank, push the dungeon, rank an explorer, level a crafter) and whether to Reach now or save Essence for a higher Crafting level.
- **No single right answer:** each source reaches high item levels by a different road, so players can follow what they enjoy: the raid, the dungeon, trips or the Workshop.
- **A chase without frustration:** no reroll can ruin an item, nothing is lost by dismantling, well-thumbed marks turn bad luck into progress, and odds are shown. The roll is a small, shared moment ("look what Magmole made").
- **Min-maxer:** Reach for Epic weekly, crafter at level 10 for item level 20. **Engaged:** Reach for Rare most weeks, dismantles everything else. **Regular:** crafts Commons and Rares, mostly wears drops. **Drop-in:** may never craft; drops cover them.
- **Risk:** the Reach odds feel stingy. The one-step-up chance, refunds with Essence, and the sim's "first Epic by week 8 for a regular" target guard against it.

### 11.3 Talents and the duplicate choice

- **The decision:** for each duplicate, Teach, Fuse, Release or Keep, and later which book talents to slot.
- **No single right answer:** Fuse is safe stats, Teach is build identity, Release funds crafting and ribbons, Keep opens a branch. The right answer changes with the creature's slots, the book and the server's needs.
- **A chase without frustration:** duplicates always do something useful, nothing expires, the book makes every talent permanent, golden talents are a rare treat rather than a requirement, and Recommended answers for anyone who does not care.
- **Min-maxer:** builds a golden kit per carry. **Engaged:** teaches when the card says "better", fuses otherwise. **Regular:** Recommended, now and then a golden surprise. **Drop-in:** pending cards resolve themselves.
- **Risk:** decision fatigue for committed players with many duplicates. The pending queue, Recommended and "apply Recommended to all" keep it a moment, not a chore.

### 11.4 Branch evolutions

- **The decision:** which form a line grows into, once.
- **No single right answer:** the branches are different roles, so the right one depends on the team the player already has and on the server (who else brings Guards).
- **A chase without frustration:** Keep lets a player own both, so a first choice is never a dead end, only an order.
- **Risk:** regret about a permanent choice. Side-by-side preview and the Keep path soften it; art cost is two sprites at first.

### 11.5 Training by activity

- **The decision:** who goes where each day, and who gets the treats.
- **No single right answer:** focusing the trio wins the raid sooner; a second trio wins the weeks the boss and weather favour it. Catch-up experience keeps the second trio cheap.
- **A chase without frustration:** the ribbons ask for materials every player collects, experience banks while waiting, and the raid trains everyone the same.
- **Min-maxer:** plans slots and treats for the week's boss. **Engaged:** treats the trio's long trips. **Regular:** creatures grow from what they already do. **Drop-in:** raids and a trip now and then still move them.
- **Risk:** committed players lose duplicate Bait and may lack Bait for treats; that is intended (Bait was piling up), but the sim checks it.

### 11.6 Boons and Omens

- **The decision:** which team to field today, and whether to run the dungeon now or wait for better weather tomorrow.
- **No single right answer:** each day favours different elements and roles, so a wide roster pays.
- **A chase without frustration:** Omens are mild at low ranks, never strip a build (the Hydra lesson in the research), are shown a day ahead, and come with a Boon.
- **Risk:** feeling cheated by a Sunday Omen. The forecast, wild Omens only from rank 10, and no Omens in Festival weeks.

### 11.7 Overall risks

- **Power creep forces a raid retune.** Gear rises from 13% to about 35% of plateau power; talents add a little. The curve scalars are retuned after the revamps, and `RAID_DIFFICULTY_VERSION` is bumped.
- **The sim cannot value most lines yet.** A fight-scored power is the first piece of work.
- **Readability.** Five tiers, item level and three slots is a lot. Pips, plain line names, "better for X" hints and the glossary carry it; the card must fit 390 px.
- **Content cost.** About 20 item sprites (3 slots by 5 tags, plus special Charms), two creature forms, talent names for every line, compendium entries.
- **Solved metas.** The sim reports pick rates for lines, talents and branches; weather and bosses move the best answer.

## 12. What happens to existing players

- **Gear:** every worn item becomes a new item of the same rarity: Attack and crit items become Hats, HP items Scarves, speed items and trinkets Charms, with the tag from the old tint and item level 4 + 3 x its old upgrade level (a +5 becomes 19). Lines are rolled fresh, once, with live randomness, at tier II or better. Unworn items are refunded: their dismantle yield plus the scrap and Essence their upgrades cost. Enchants refund their glimmer and shards. Known blueprints map to the new base of the same slot and tag; overlaps become well-thumbed marks. Jobs in progress finish under the old rules first.
- **Creatures:** levels, fusions, quirks and nicknames stay. Each creature gets its open talent slots rolled once. Creatures already past 10 or 20 get their ribbons free. Banked Bait stays Bait (treats).
- **Raid:** retuned in the same step, with the open week re-declared.

## 13. Open questions for Misa

1. **Weather forecast.** Should players see tomorrow's Boon and Omen as a forecast, or only today's when the day starts? _Recommended: show today's and tomorrow's. Planning a raid around a bad Saturday is the fun part; surprise alone feels like bad luck._
2. **How rare is a top roll?** At the highest item level, about 1 line in 7 rolls the top tier (V). Is that the right feel, or should top tiers be rarer (1 in 15) so they feel like an event? _Recommended: 1 in 7. Great items arrive every couple of weeks for daily players, and a whole perfect set still stays out of reach for months._
3. **Golden talents.** One catch in 20 rolls its talent golden (worth 1.5x), shown with a gold frame. More often, rarer, or not at all? _Recommended: 1 in 20, with a gold frame and a small sparkle on the catch card, and no Discord post._
4. **Slots opening over time.** Hat from the start, Scarf at the Bronze Ribbon (level 10), Charm at the Silver Ribbon (level 20); or all three slots from day one? _Recommended: open them over time. Each ribbon then feels like a present and new players learn one slot at a time; drop-ins get the Charm later, which is fine because it carries the niche lines._
5. **Dismantling takes a little time.** Commons in bundles of up to five in 15 minutes, a Rare in 1 hour, an Epic in 2 hours, each giving Crafting XP; or instant? _Recommended: the short jobs. Dismantling becomes a small creature job with its own reward, and nothing important waits on it._
6. **Treats.** A treat packed for an activity doubles the experience it gives one creature (the player picks who); or Bait is fed straight into experience with a daily "full belly" limit? _Recommended: treats double an activity. Activities stay the heart of training, and Bait becomes the way to choose who grows fastest._
7. **Wild weather at high ranks.** From Boss Rank 10, may one Omen a week be "wild" and change a fight's shape (for example the boss attacks twice that day), or should Omens only ever nudge numbers? _Recommended: allow one wild Omen a week from rank 10, always shown the day before, never in a Festival week._
8. **Workshop odds.** Show crafting odds as words ("likely Rare, a fair chance of Epic") with exact numbers one tap away, or numbers up front? _Recommended: words up front, numbers one tap away._

## 14. Build order

Each step is simulated on paired seeds before it ships; neighbouring steps can share a PR.

1. **Groundwork:** a fight-scored power in the sim; the per-creature modifier sheet in the engine (replay-safe); this design recorded in `decisions.md`.
2. **Gear A:** Hat, Scarf and Charm; bases and tags; the Ready and Sheet lines; tiers and item level by source; "Equip best"; conversion of existing gear; upgrades, Improve and enchants removed.
3. **Gear B:** the crafting loop: Reach, dismantle jobs with ranges, blueprint learning and well-thumbed marks, the maker's name on items.
4. **Creatures A:** talents, the duplicate choice (Teach, Fuse, Release, Keep), the Talent Book, release for parts.
5. **Creatures B:** training by activity, treats, ribbons and slot unlocks, catch-up experience.
6. **Boons and Omens:** mutator and input effects first, sheet effects with them.
7. **Content:** Sunfawn and Ohmouse, then branches for the other evolving lines; talent pools for every line.
8. **Raid and dungeon rebalance** with the curve scalars, around the new foundation.
9. **Later:** position lines, sets, chance and trigger lines (engine hooks and dice), second evolutions, dungeon choice rooms for Essence.

## 15. Technical notes

- **Server authority:** every roll (drop, craft, dismantle refund, blueprint learning, talent, golden, weather) uses `crypto.getRandomValues` on the server at the moment it happens. Odds and refund ranges come from `RULES` with the screen.
- **Spends are keyed:** craft and Reach, dismantle, Teach, Fuse, Release, Keep, book slotting, treats and ribbons each carry an idempotency key; check, debit and grant in one Durable Object transaction.
- **Schemas:** strict payloads for every new route (item id, slot, base id, choice, key); identity from the session.
- **Migrations (new ones only):** items get `slot`, `tag`, `item_level 1..20`, `lines_json`, `made_by`, `made_at`, `source`; `equipped_on` unique per (creature, slot); blueprint `wear` count; `creature_talents` and `talent_book`; `xp` and `ribbon` on creatures; `UNIQUE(user_id, line)` becomes unique per (user, line, branch) for Keep; weather per guild and game day.
- **Content is data:** bases, line pools and weights, tier values, talent pools, weather and branches are schema-validated content files; the compendium test gains entries for each.
- **Analytics:** item drops and crafts with line ids and tiers, dismantles with refunds, duplicate choices, treats and ribbons, the day's weather; content ids and numbers only.
