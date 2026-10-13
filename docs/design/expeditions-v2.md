# Expeditions v2: a feature you get better at

Status: **proposal for Misa**, 2026-10-13. Roadmap item 5. Misa has his own ideas; he will add or replace parts before any build.

## Today (M2)

- 3 slots.
- A duration: 1, 6 or 12 h.
- Supplies: basic, good or great, which trade Bait for rarity odds.
- Explorer element affinity: own-element species are twice as likely.
- A dupe shield, shinies at 1/500, and free recall with a partial result.

It works, but it is the same choice every day, nothing improves, and the screen is text-heavy.

## Goal

Expeditions should **grow with the player**:

- unlock new places and options;
- reward knowing where things live;
- give variety and small surprises;
- stay idle-friendly (send, come back later, collect).

## Proposal

1. **Destinations** replace the single generic expedition.
   - Content data (`data/destinations.json`), shown on a small pixel **map**. Examples:
     - **Tidepools** (Tide)
     - **Ember Caves** (Ember)
     - **Verdant Hollow** (Grove)
     - **Storm Ridge** (Spark)
   - Rare destinations unlock later:
     - **Moonlit Reef** (night only, guild-local)
     - **Old Crossroads** (mixed)
     - **Festival Grounds** (Festival weeks)
   - Each destination has its own **catch table** (which species live there, at what rarity), its durations, and a flavour line.
   - Knowing where a species lives becomes collection knowledge. The collection shows "Found at: Tidepools" after the first catch there.
2. **Explorer Rank (account progression).**
   - Completed expeditions give Explorer XP, scaled by duration.
   - Ranks unlock, in this order:
     - a 4th slot, then a 5th;
     - new destinations;
     - longer trips (24 h);
     - better supply tiers;
     - **targeted expeditions** (bias toward a chosen species you have already found).
   - Each rank-up is a small celebration with a reveal.
3. **Destination mastery.**
   - Each destination has three stars: a number of trips, catching every species there, and a shiny found there.
   - Stars unlock a **deeper area** of that destination, with better odds and a rare species, plus small permanent bonuses there (for example, -10% supplies cost).
   - This is the "I've gotten good at Ember Caves" feeling.
4. **Explorer fit.**
   - The explorer's element keeps the existing affinity. Its **role** and **level** now matter too: Guards return with more items, Setters find more of their element, and higher levels shorten trips slightly.
   - Quirks add flavour lines to the trip log, for example "Cindle chased a firefly for an hour."
5. **Trip events (light, idle-friendly).**
   - On claim, a trip may include one small event from content. Examples:
     - a found item (Bait or gear materials);
     - a "lost and found" creature (a duplicate converted to Bait);
     - a lore snippet that fills a **Journal** of places;
     - rarely, a **choice** shown when you claim: "A shimmering pool: rest here (+1 catch roll, +2 h) or move on".
   - Events are rolled on the server at claim time with live randomness, as catches are today.
6. **Weekly special expedition.**
   - One rotating destination per week, with a twist: a modifier, a featured species, or bonus materials.
   - During Festival weeks it is the Festival Grounds.
7. **Visuals** (polish item 3):
   - the map with destination tiles;
   - explorer sprites walking a dotted path, with timer bars;
   - a catch reveal with the sprite popping in;
   - the trip log as a short story card.

## Server and data

- Content: `destinations.json`, `trip-events.json`, and Explorer Rank thresholds in `RULES`.
- Migration: `explorer_progress (user, xp, rank)`, `destination_mastery (user, destination, stars_json)`, a `journal (user, entry_id)` table, and `destination_id` on expeditions.
- Existing expeditions keep working: the old type maps to an "Old Crossroads"-like generic destination.
- All randomness stays at claim time (crypto). Recall rules are unchanged.

## Balance and sim

- The sim gets destinations, ranks and mastery. Catch rates per rarity and the economy targets must still hold, and the newcomer path must not slow down.
- **New targets:**
  - Explorer Rank 3 within the first week for a daily player;
  - species discovery pace no faster than today for casual players;
  - materials income in proportion to gear upgrade costs.

## Questions for Misa

1. Which of these ideas excite you: the map, ranks, mastery stars, events, choices, the Journal, the weekly special?
2. Your own ideas: add them here and they become the spec.
3. Should choice events exist at all, or should expeditions stay pure "send and forget"?
