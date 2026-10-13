# Expeditions v2: a feature you get better at

Status: **content, server and balance simulation built** (2026-10-13; the client UI is a separate task, see `decisions.md` "Expeditions v2 numbers set by simulation"). Spec agreed with Misa 2026-10-13 (reviewed in the shared doc `https://claude.ai/code/artifact/40f1a5e0-df40-4d61-8e04-154751c36f48`). Roadmap item 3. The **Spec** section below is what we build; the original proposal is kept after it for context.

## Spec (after Misa's review)

Expeditions are about **creatures, not the account**: each creature builds its own explorer rank and its own feel for places, so choosing who goes where matters.

### Creatures, not an account level

- **Explorer rank per creature,** from its own trips (more for longer ones). It unlocks, for that creature, rare destinations, 24 h trips, and end-of-trip choices with better odds.
- **Familiarity per creature and destination** (was "mastery"): three stars, from trips there, catching every species there, and a shiny there. Stars give that creature small bonuses there and open the deeper area.
- **Explorer fit, simplified so systems don't collide:**
  - the explorer's element keeps today's affinity;
  - its role adds a flavour: Guards bring back more items, Setters find more of their element;
  - **only explorer rank shortens trips** (creature level no longer does).
- **Account-wide: stats and tiny bonuses only.**
  - Record stats for everything interesting: trips, species found, places visited, journal pages, reactions seen in raids.
  - Show them on a profile.
  - A few milestones give **very small** account bonuses, for example +1% catch odds.
- One activity at a time: a creature explores **or** works in the Workshop.

### Slots

- Start with 1 slot. Slot 2 comes on the first day (3 finished trips).
- Slots 3, 4 and 5 come after about a month, four months and a year.
- They unlock from the **sum of all your creatures' explorer ranks**. The sim sets the thresholds.
- **Migration (Misa):** when v2 ships, any trip in slots 2 and 3 is cancelled with no reward, and everyone starts again with 1 slot.

### Supplies and trip lengths

- **Trips without supplies are free.** They still cost the creature's time, which could go to Workshop jobs.
- **Supplies are a meaningful boost.** You can buy them with **Bait**, **craft** them in the Workshop from supply blueprints (higher tiers need a higher Crafting level), or **find** them on trips.
- Examples:
  - a Lure (rarity odds);
  - a Map scrap (more catch rolls);
  - a Lantern (Moonlit Reef odds).
- **The best supplies guarantee an end-of-trip choice;** lesser ones only make one likely.
- **Trip lengths:** the shortest trip is **2 hours**. Trips are 2, 6 or 12 hours, plus 24 hours from explorer rank.
- **Rewards grow faster than the hours** (catch rolls, parts and loot chances per hour rise with length). Spamming short trips is the worst way to progress. Note that the gear sim found nobody sends 12 h trips today, and this fixes it.

### End-of-trip choices

- When a trip **would end**, it may offer one of two **push-on goals** instead of coming home. Or you claim and come home as usual.
- **Risk and reward are clearly flagged, with exact odds.** For example:
  - risky: "+2 h, a 50% chance the whole trip fails and brings nothing back, otherwise a rare gear piece";
  - safe: "+1 h, one more catch roll".
- The sim sets each goal's odds so the risky one is a fair gamble.
- The choice waits until the player opens the app; ignoring it means coming home. Results are rolled on the server with live randomness when the push-on ends.

### Journal

- **Pre-written entries** are content on the server. Each trip may uncover one entry the player doesn't have yet, until they run out.
- Entries are lore that **hints at real mechanics without naming them**, for example watching a charged beast struck by roots and brought crashing down (Grounding). They need not be in a creature's voice.
- Entries are grouped by place; a few complete a set.

### Loot

- **Raids** drop big, exciting loot more often, and every raid boss **can** drop top-tier gear, as well as lesser items. Check the finale table so Epic is possible at every rank.
- **Expeditions** drop parts and supplies often. Somewhat big loot (a rare gear piece, a blueprint) is much rarer, mostly from push-on goals.

### Destinations as banner cards (no world map yet)

- Each destination is a **banner image**, browsed like a catalogue: the banner, its element, who lives there (silhouettes until found) and your stars.
- A running trip shows its card with the banner on top and the creature **walking left to right with a small bob**. How far it has got is the progress; the timer is below.
- A world map can come later.

### Weekly special

- One destination a week gets a twist (a modifier, a featured species or bonus parts). The Festival Grounds take the spot in Festival weeks.
- If it works, more destinations get rolled modifiers later.

### Later, not now

- Targeted trips (favouring one species).

---

# Original proposal (for context)

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
