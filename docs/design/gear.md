# Gear

Status: **plan**, 2026-10-13. Roadmap item 4 ("absolutely" — Misa).

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
  - Spend **Essence**, plus materials, to level gear from +0 to +5. Each level raises the primary stat by a fixed step.
  - The cost curve is the main Essence sink.
  - Upgrades never fail, so there is no gambling.
- **Salvage:** salvaging a gear item returns materials. It cannot be undone, so it asks for confirmation in-page.
- **Materials:** one or two generic material types ("Shards", element-tinted). They come from the dungeon, expeditions and salvage, and are used for upgrades.

## Sources

| Source              | What drops                                                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raid finale win     | One gear roll per participant, with a rarity table by rank. This is visible loot, unlike the hidden jackpot; the jackpot itself stays behind the scenes. |
| Daily dungeon       | Materials per room, and a chance at gear on a full clear; guaranteed at landmark depths.                                                                 |
| Expeditions (v2)    | Occasional materials, and rare gear finds on long expeditions.                                                                                           |
| Festival finale win | A Festival gear piece alongside the Festival creature.                                                                                                   |

All rolls use live crypto randomness at the moment of the drop. Grants are idempotent per (source, key).

## Server and data

- **Tables (migration):**
  - `gear_items (id, user_id, base_id, rarity, level, rolls_json, equipped_on, created_at)`;
  - `materials (user_id, kind, amount)`, with integers and no negative values.
- **Routes:**
  - `POST /api/gear/:id/equip { creatureId | null }`;
  - `POST /api/gear/:id/upgrade { idempotencyKey }`, which is a spend: the balance check, debit and upgrade happen in one transaction;
  - `POST /api/gear/:id/salvage { idempotencyKey }`.

  Strict schemas; ownership comes from the session.

- **Engine:** the fight slot stats already accept computed stats. Fold gear stats into `slotFor` (raid and dungeon) through a pure `applyGear(stats, gear[])` in `packages/game`, with caps.
- **Stored fights** carry the final stats, so old replays stay exact.

## Client

- **Collection card:** the gear slot shows the item sprite (12×12). Tap it to equip or swap from the inventory grid.
- **Gear inventory:** a grid of sprites with rarity frames. Tap an item for its stats, the upgrade cost, and Upgrade or Salvage.
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
