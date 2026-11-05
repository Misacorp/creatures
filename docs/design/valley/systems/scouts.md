# Scouts: expeditions as standing posts

Status: **proposed**, revised after the panel (`reviews/2026-10-30-scouts-forge.md`). Accepted by Misa so far: standing scouts instead of timed trips, the player choosing "which areas are being explored" (round 1, Q2); push on as the return walk's possible decision (round 8). Waiting on Misa: Q23 (does what you craft depend on where your scouts are). Builds on `posts.md` (seats, fit, mastery, kit, away steps, the one lazy pass) and `return.md`.

## The idea

A scout is posted to one of the destinations and roams it all the time. Finds turn up as it goes and pile up at its post; the return walk shows it carrying them home. Where a scout stands is the choice: each place has its own residents, its own journal pages and its own find profile (rich in scrap, in shards, in creatures or in rare finds), drawn on the Signpost. Scouts are the valley's source of materials, new creatures, blueprints and lore; they feed the Forge, the ribbons, the commons and the collection. They do not find Acorns.

## Rules

- **V-SCOUT-1** Seats: each player has scout seats at the Signpost (example: 2 at its level 1, one more a level, `posts.md`). A seat is posted to one destination; moving it is free.
- **V-SCOUT-2** Finds. A scout's finds are worked out for each stretch of effective time (the away steps apply, V-POST-10), on the server, on the owner's own visit, with live randomness (F-8). Each place has a **find profile** that sets what it is rich in: scrap, shards of its element, creatures, or rare finds (gear, blueprints, journal pages). Example rates are below.
- **V-SCOUT-3** New creatures arrive at the Paddock gate. A new species is kept, celebrated in the return walk (V-RET-2) and joins the roster at once. Duplicates gather at the gate as one bubble with a count; after a day each takes today's Recommended answer (teach, fuse or keep) by itself, and the player can step in any time before. Nothing piles up.
- **V-SCOUT-4** The store holds about three days of effective time (V-POST-5); when full, the scout keeps exploring (and growing) but stops picking up, and its bubble says "pack full". Nothing is lost.
- **V-SCOUT-5** Kit (V-POST-11), shown as a picture of what it brings: a **lure** (a creature silhouette) draws creatures, leaning toward a species the player lacks with a hint of which; a **lantern** (a blueprint) draws rare finds; a **satchel** (a sack) brings more scrap and shards. Kit works with the place's profile: a lure is best at a creature-rich place, a lantern at a rare-rich one. One at a time; switching between owned kit is free.
- **V-SCOUT-6** Push on: now and then an **Expert** scout finds a way into the destination's deeper area, and the return walk can offer it (V-RET-3). Deep, the scout meets the deeper area's own residents and rarer finds, but its kit does not work and scrap and shards are fewer. The scout wears a "deep" mark at the Signpost, and if the Forge runs short its note names it ("Mossback is deep in the Reef"). Coming back up is free at any time.
- **V-SCOUT-7** Mastery in scouting (V-POST-12): Skilled, Expert and Master raise a scout's finds a little; Expert opens push on; a **Master Scout** also notices a little more at any other post (example: a Master Scout at the Forge sometimes brings back a blueprint).
- **V-SCOUT-8** Opening hours: the Moonlit Reef is open all day and gives more at night; the Festival Grounds are open in festival weeks, and when they close, a scout there walks back to its last open place by itself.
- **V-SCOUT-9** Keystones: each place keeps one keystone clock for the whole server (example: one in about 21 server-days), found by a scout posted there; it does not grow with the number of scouts. Keystones are collection finds (`commons.md` V-COM-12).
- **V-SCOUT-10** A player's second and later scout at the same place finds creatures at half the chance; everything else is the same.
- **V-SCOUT-12** Creatures by rarity (round 15, Q38): common species are found at a steady pace (example: about 15 kinds by week 4 for a daily player, most of a content drop's commons within a few weeks of release); rare and epic species are harder to find and take months. They mostly add variety. A raid boss may now and then need a rare (Misa: "it's okay to require a rare here or there because players will be able to pool their rarer creatures together in the raid roster. A 100% common requirement is too limiting in design space"); the lab reports how many of each rarity the whole server owns, so combat v2 knows what a server can pool.
- **V-SCOUT-11** The week's twist (today's weekly special) still lands on one destination and changes what it gives for the week, shown on the Signpost from Monday.
- A scout's found gear has the scout's own level as its item level base (today it followed explorer rank).

## Example rates per scout (the economy lab sets the real ones)

Today's trips pay in "ticks" of about an hour (`RULES.expeditions.tick`). A scout works every hour of the day, so most rates are lower per hour than a trip's tick. "Rich" doubles the rate at a place whose profile names it.

| Find                               | Per effective hour   | Per day (24 h, before fit, mastery and kit) |
| ---------------------------------- | -------------------- | ------------------------------------------- |
| Scrap                              | 0.75                 | 18                                          |
| Shard of the place's element       | 20% chance           | about 5                                     |
| A creature                         | 2% chance            | about 0.5                                   |
| A gear piece (the place's element) | 1% chance            | about 0.25                                  |
| A blueprint                        | 0.3% chance          | one every two weeks or so                   |
| A journal page                     | 0.4% chance          | one every ten days or so                    |
| The place's keystone               | one clock per server | about one per server every three weeks      |

Kit tilts (examples): a lure x2 creature chance and a lean toward a missing species; a lantern x1.5 gear, blueprints and pages; a satchel x1.4 scrap and shards. Fit adds 25% to everything; mastery up to 15%.

With two scouts at fitting places, a daily player brings home about 45 scrap, 12 shards and a creature a day.

## What it replaces

Expeditions' timed trips, trip lengths, slots, recall, the claim, explorer ranks (now scouting mastery), supplies packed per trip (now kit), the push-on goal at a trip's end, and finding Bait on trips (`scrap-list.md`). The destinations, their residents, deeper areas, stars and weekly twists stay.
