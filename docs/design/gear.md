# Gear and crafting

Status: **plan**, 2026-10-13. Roadmap item 2 ("absolutely" — Misa). Slow gear at first is fine.

## Misa's direction (2026-10-13)

> Players can dismantle gear for parts, use those parts to upgrade or improve existing gear, maybe even create new items from blueprints (or crafting patterns) they find as drops, enchant items, etc. This world can be very interesting and I think it would allow us to design "downtime activities" for creatures: things they can work on slowly for long periods of time. This would build on the "idle RPG" pillar of the game: something is happening all the time. We could even think of having crafting skills for creatures that level up very slowly over time.

So gear is not only loot: it is the start of a **crafting world** with long-running creature jobs. The sections below keep the original gear model and add crafting on top.

## Why

- **Essence sink.** Essence piled up for daily players (about 800 held by week 12 in the sim before gear), and evolution (20 Essence each) was the only sink. With gear, daily players hold about 160 at week 12 (see `docs/balance/report-2026-10-13-gear.md`).
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
- **Blueprints (crafting patterns):** found on expeditions (a chance on every trip, higher on longer ones, plus some push-on rewards) and in the welcome kit. Raids, the dungeon and Festivals do not grant blueprints (checked against `apps/worker/src/gear-grants.ts` and `rollBlueprint`, which skips Festival bases). A blueprint is learned once per player and lets a creature craft that base item from parts. Rare blueprints make rare bases. Festival pieces come from a won Festival finale; no source of Festival blueprints exists yet.
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

The sim models gear acquisition, upgrades and crafting per archetype (`packages/sim/src/gear.ts`, with the game's own pure functions). Targets, as built (`docs/design/balance-targets.md`):

- gear share of a daily player's raid-team power at week 8: 10–20% (the hard ceiling is 25%);
- the first crafted item of a daily player within 7 days;
- Essence held by daily players at week 12 not above today's, and its weekly growth no faster than today's;
- the best crafter of a daily player at about Crafting level 5 (4–6) after 30 days;
- newcomer catch-up: a week-4 joiner has at least 60% of the median daily player's gear power at week 8.

The raid, long-run, fairness and collection targets are measured with gear on and still pass; this needed a boss HP retune (see `decisions.md`, 2026-10-13, gear numbers by simulation).

## Open questions for Misa

- One slot or two?
- Should gear be visible on sprites? The default is no: only the slot icon on the card, which keeps the sprites clean.
- Trading gear between players? The default is no.

## v1 build spec (lead, 2026-10-13)

Defaults for the open questions until Misa says otherwise: **one slot** per creature; jobs and expeditions share **one busy state** (a busy creature still fights in raids, as creatures on expeditions do today); **one skill, Crafting**; gear is not drawn on sprites; no trading. Numbers below are starting values; the sim tunes them.

**Content (`packages/game`, schema-validated):**

- `gear.json`: base items `{ id, name, kind (charm | band | trinket), primary (atk | hp | spd | critChance | critDamage), tint (element | null), blueprint (rarity) }`. 19 bases shipped: 5 neutral, 3 per element tint and 2 Festival pieces; names and short flavour fit the lore. Festival bases with distinct names.
- `enchants.json`: 9 enchants shipped. Stat-only, or conditional on the wearer's element or role (for example "+6% Attack as a Payoff", "+8% HP as a Guard", "+3% crit chance for Spark"). Conditions are resolved when stats are folded, so **the engine needs no change**.
- `RULES.gear`:
  - rarities common / rare / epic / festival, with 0 / 1 / 2 / 2 secondaries; festival has epic power;
  - primary and secondary roll ranges per stat;
  - an upgrade step per level, +0 to +5;
  - **total caps per creature:** Attack +20%, HP +25%, speed +10%, crit chance +5 points, crit damage +25 points, and the existing crit caps still apply;
  - upgrade costs (Essence plus scrap, rising per level and rarity);
  - dismantle yields;
  - drop tables;
  - job durations;
  - the skill XP curve;
  - inventory cap 60;
  - workshop slots 2.
- **Parts:** `scrap` (generic), one shard per element (`tide-shard`, …) and `glimmer` (rare; for enchanting).
- **Pure functions:**
  - `rollGear(rng, baseId, rarity)`;
  - `applyGear(stats, crit, role, element, item | null)`, which returns the effective stats and crit bonus with caps;
  - `upgradeCost(item)`, `dismantleYield(item)`;
  - `jobDuration(kind, rarity, skillLevel)`;
  - `skillLevel(xp)`;
  - `craftRarity(rng, blueprintRarity, skillLevel)`.

  All are tested with seeded RNG.

**Sources (server, live crypto randomness, idempotent per (source, key)):**

- **Raid finale win:** one gear roll per participant. Rarity by Boss Rank: rank 1 is about 75% common, 22% rare and 3% epic; better at higher ranks.
- **Phase 1 and 2 wins:** scrap per participant.
- **Expedition claim:** scrap by duration (1 h: 1, 6 h: 3, 12 h: 6). It also has a chance of a shard of the explorer's element, and a small chance of a blueprint (higher on longer trips).
- **Festival finale win:** one Festival gear piece per participant.
- **Welcome kit:** each player's first gear load grants one common item and one common blueprint, so crafting can start on day 1. It is granted once, idempotently.

**Actions:**

- **Equip / unequip:** instant. One item per creature; an item is on at most one creature. Equipping onto an occupied slot swaps.
- **Upgrade:** instant. A spend (Essence plus scrap) with an idempotency key, in one transaction.
- **Dismantle:** instant, with an idempotency key. It is refused for an equipped item until it is unequipped, or the dismantle unequips it first (your choice; document it).
- **Workshop jobs** run on a creature that is not busy, in one of 2 workshop slots, and take hours:
  - craft: a blueprint plus parts makes a new item;
  - improve: re-roll one secondary, for parts;
  - enchant: glimmer plus shards add the item's one enchant.

  The cost is paid when the job starts (a spend with a key); the result is rolled when it is claimed (live randomness, idempotent claim). A creature on a job cannot go on an expedition, and vice versa. Starting durations: craft 4 / 8 / 12 h by rarity, improve 2 h, enchant 6 h.

**Crafting skill:**

- XP per finished job equals its hours × 24 (tuned by the sim; v1 had 10). Levels run 1–10 on a slow curve (100, 250, 450, 700, 1000, 1600, 2500, 3800 and 5500 XP for levels 2 to 10): a daily player's best crafter reaches about level 5 in a month.
- Each level gives −3% job time, and +1% chance that a craft comes out one rarity higher.
- The skill never touches combat.

**Server:**

- **Migration 17:**
  - `gear_items (id, user_id, base_id, rarity, level, rolls_json, enchant_id, equipped_on UNIQUE, source, created_at)`;
  - `parts (user_id, kind, amount ≥ 0)`;
  - `blueprints (user_id, base_id, rarity)`;
  - `workshop_jobs (id, user_id, creature_id, kind, input_json, started_at, ends_at, claimed_at, result_json)`;
  - `crafting_skill (user_id, creature_id, xp)`;
  - grant ledgers keyed for idempotency.
- **Routes** (strict valibot schemas, identity from the session, rate-limited like the rest):
  - `GET /api/gear`: items, parts, blueprints, jobs, skills, slots;
  - `POST /api/gear/:id/equip { creatureId | null }`;
  - `POST /api/gear/:id/upgrade { idempotencyKey }`;
  - `POST /api/gear/:id/dismantle { idempotencyKey }`;
  - `POST /api/workshop/jobs { creatureId, kind, blueprintId?, gearId?, enchantId?, secondaryIndex?, idempotencyKey }`;
  - `POST /api/workshop/jobs/:id/claim { idempotencyKey }`.

  The collection view carries each creature's equipped item summary and its busy state.

- **Fights:**
  - Gear folds into `slotFor` in `raid-resolve.ts` and into practice fights via `applyGear`.
  - Stats freeze at the same moment teams freeze for a phase. Stored fight inputs carry the final stats, so old replays stay exact; verify that and add a test.
  - The sim gets the same fold.
- **Analytics:** add events `gear_drop`, `gear_equip`, `gear_upgrade`, `gear_dismantle`, `job_start` and `job_claim`, with content ids and numbers only.

**Client:**

- **Collection card:** a 12×12 gear slot showing the item sprite and rarity frame; a busy badge for a creature on a job.
- **A Workshop tab:**
  - an inventory grid;
  - item details with Upgrade, Improve, Enchant and Dismantle (in-page confirmation);
  - parts counts;
  - known blueprints;
  - 2 job slots with timer bars and claim reveals.
- **Loot reveal:** gear pops in during the finale loot reveal and on expedition claims.
- **Glossary:** entries for each gear stat, rarity, part, enchant, job kind and the Crafting skill, with coverage tests extended.
- **Sprites:** pixel item sprites per base kind, tinted by element, in the established style.

**Sim targets:**

- gear at most 25% of a daily player's power at week 8;
- the first crafted item within the first week for a daily player;
- Essence held by daily players bounded, with no runaway stockpile;
- raid and finale targets still pass, retuning boss HP if needed.
