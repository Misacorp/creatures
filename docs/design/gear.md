# Gear and crafting

Status: **plan**, 2026-10-13. Roadmap item 2 ("absolutely" — Misa). Slow gear at first is fine.

## Misa's direction (2026-10-13)

> Players can dismantle gear for parts, use those parts to upgrade or improve existing gear, maybe even create new items from blueprints (or crafting patterns) they find as drops, enchant items, etc. This world can be very interesting and I think it would allow us to design "downtime activities" for creatures: things they can work on slowly for long periods of time. This would build on the "idle RPG" pillar of the game: something is happening all the time. We could even think of having crafting skills for creatures that level up very slowly over time.

So gear is not only loot: it is the start of a **crafting world** with long-running creature jobs. The sections below keep the original gear model and add crafting on top.

## Why

- **Essence sink.** Essence piles up for daily players (about 600 held by week 12 in the sim), and evolution is the only sink today.
- **Loot with identity.** Raid finales, the daily dungeon, expeditions and Festivals need rewards that feel different from currency.
- **Build depth.** Crit chance and crit damage now exist as stats, with caps, and gear is the natural way to shape them per creature.

## Model

- **Slots:** each creature has **one gear slot** at first. A second slot unlocks at level 20 or on evolution; decide with the sim.
- **Gear item:** `{ id, baseId, rarity, level, rolls }`, owned by a player and equipped on at most one creature.
  - Base items are content data (`data/gear.json`, schema-validated): a name, a slot type, a sprite, a primary stat and allowed secondary stats.
  - Rarities are common, rare, epic and festival. Festival gear is exclusive, cosmetic-distinct, and has no extra power beyond epic.
- **Stats** (integer basis points, capped by `RULES.gear`):
  - Attack %, HP %, speed;
  - crit chance and crit damage, within the existing crit caps;
  - **element- or role-flavoured bonuses**, for example "+8% reaction damage as Payoff", "Guard: zone takes 5% less", "Setter: marks also +5% next hit".

  Keep the totals small: gear should be about **15–25% of a creature's power** at most, which needs a sim target.

- **Upgrades:**
  - Spend **Essence**, plus parts, to level gear from +0 to +5. Each level raises the primary stat by a fixed step.
  - The cost curve is the main Essence sink.
  - Upgrades never fail, so there is no gambling.
- **Dismantle:** dismantling a gear item returns parts (see crafting below). It cannot be undone, so it asks for confirmation in-page.
- **Parts:** a few kinds (generic plus element-tinted), by quality. They come from dismantling, expeditions, raids and the dungeon, and are spent on upgrades, improving, crafting and enchanting.

## Crafting and downtime (sketch; detail at build time)

- **Dismantle** (was "salvage"): any gear item breaks into **parts**. Parts have a kind (generic plus element-tinted) and a quality by rarity. Confirm in-page; it cannot be undone.
- **Upgrade:** +0 to +5 with Essence and parts, as in the model above. Never fails.
- **Improve (reforge):** spend parts to re-roll one secondary stat, or lock one and re-roll the rest. Rolls use live server randomness when the job finishes.
- **Blueprints (crafting patterns):** drops from raids, expeditions, the dungeon and Festivals. A blueprint is learned once per player and lets a creature craft that base item from parts. Rare blueprints make rare bases; Festival blueprints make Festival-look items.
- **Enchanting:** a gear item gets one enchant slot. An enchant uses rare parts (or an enchant scroll drop) and adds one flavoured effect, for example "+5% reaction damage" or "Guard: first hit each fight is halved". Within the same power caps.
- **Downtime jobs (the idle pillar):**
  - A creature that is not on an expedition can be given a **job**: craft from a blueprint, improve, enchant, or later gather parts. Jobs take hours (for example 2–12 h, longer for rare work) and finish while the player is away.
  - One activity per creature at a time: an expedition **or** a job. Raids are unaffected, as with expeditions today (to confirm against the current rule for creatures on expeditions).
  - **Workshop slots** limit parallel jobs (start with 2; more unlock over time, like Explorer Rank slots).
  - Results are rolled on the server when the job is claimed, with live randomness, and the claim is idempotent.
- **Crafting skills (very slow levels):**
  - Each creature has crafting skills (start with one, "Crafting"; later perhaps Tinkering and Enchanting) that gain XP from finished jobs and level up over weeks.
  - Higher skill: shorter jobs, a small chance of a better roll or an extra part, and access to harder blueprints.
  - Role and element flavour, light: for example a Support crafts faster, and an Ember creature is better at Ember-tinted items. Quirks add flavour lines to the job log ("Cindle kept the forge too hot").
  - Skills never affect combat directly, so raid balance stays clean.
- **What this needs from the sim:** the parts economy (sources against upgrade, improve and craft costs), time to the first crafted item (aim: within the first week for a daily player), and skill pace (a daily player's best crafter reaches mid-level in about a month).
- **Open questions for Misa:** jobs and expeditions as one shared "busy" state (simplest) or separate? How many skills? Should crafted items ever beat dropped ones?

## Sources

| Source              | What drops                                                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raid finale win     | One gear roll per participant, with a rarity table by rank. This is visible loot, unlike the hidden jackpot; the jackpot itself stays behind the scenes. |
| Daily dungeon       | Parts per room, and a chance at gear on a full clear; guaranteed at landmark depths.                                                                     |
| Expeditions         | Parts (from PR B, on today's expeditions), blueprints and rare gear finds (v2)                                                                           |
| Festival finale win | A Festival gear piece alongside the Festival creature.                                                                                                   |

All rolls use live crypto randomness at the moment of the drop. Grants are idempotent per (source, key).

## Server and data

- **Tables (migration):**
  - `gear_items (id, user_id, base_id, rarity, level, rolls_json, equipped_on, created_at)`;
  - `parts (user_id, kind, amount)`, `blueprints (user_id, blueprint_id)`, `jobs (id, user_id, creature_id, kind, input_json, ends_at, claimed_at)`, `crafting_skills (user_id, creature_id, skill, xp)`, with integers and no negative values.
- **Routes:**
  - `POST /api/gear/:id/equip { creatureId | null }`;
  - `POST /api/gear/:id/upgrade { idempotencyKey }`, which is a spend: the balance check, debit and upgrade happen in one transaction;
  - `POST /api/gear/:id/dismantle { idempotencyKey }`; crafting jobs add `POST /api/jobs { creatureId, kind, blueprintId?, gearId?, idempotencyKey }` and `POST /api/jobs/:id/claim { idempotencyKey }`.

  Strict schemas; ownership comes from the session.

- **Engine:** the fight slot stats already accept computed stats. Fold gear stats into `slotFor` (raid and dungeon) through a pure `applyGear(stats, gear[])` in `packages/game`, with caps.
- **Stored fights** carry the final stats, so old replays stay exact.

## Client

- **Collection card:** the gear slot shows the item sprite (12×12). Tap it to equip or swap from the inventory grid.
- **Gear inventory:** a grid of sprites with rarity frames. Tap an item for its stats, the upgrade cost, and Upgrade, Improve, Enchant or Dismantle.
- **Loot reveals** (raid, dungeon): the gear pop-in, reusing the reveal animation.
- **Clickable stat tags:** explanations come from the glossary (`how-to-play.md`).

## Balance and sim

The sim models gear acquisition and upgrades per archetype. New targets:

- gear share of power at week 8: at most 25%;
- Essence held by daily players stays bounded, with no runaway stockpile;
- newcomer catch-up: a week-2 player's power is at least X% of the median.

The raid and dungeon targets must still pass after gear (retune boss HP if needed).

## Open questions for Misa

- One slot or two?
- Should gear be visible on sprites? The default is no: only the slot icon on the card, which keeps the sprites clean.
- Trading gear between players? The default is no.
