# Valley Games: a daily wacky competition

Status: **being built 2026-10-22** (overnight, Misa asleep; he asked for it to be iterated and built, and tried on staging against bot opponents). This is the agents' working spec. Misa's answers so far: medals mostly (bragging), shared events yes, four events a day, a medal display with lifetime counts, medals tradable now and then (a small time slot).

## Why

Every activity rewards sending your three best creatures (dungeon, raid, Workshop, trips), so the rest of the roster never levels. The Games are a daily show where **each creature can enter one event**, four events a day, so a player needs four creatures; the events read the combat stats in odd shapes, so the right element, role, size or gear line beats raw level; and a flat experience reward helps a young creature most (the lounging trick). Lighter in spirit than the dungeon: a wacky TV game show, not a fight.

## The daily rhythm

- **13:40** (`RULES.games.showAt`, three minutes after the 13:37 reset): today's show plays live to everyone, and **tomorrow's lineup** is revealed at the same moment.
- **Until the next reset (13:37)**: players place one creature in each event. Entries **carry over**: yesterday's entrants stay entered for any event with the same slot unless changed, so a casual player is in every show after one setup. A creature still on an expedition or a job can enter (the show takes no creature time).
- **13:37, the lock**: the server snapshots every entrant's stats and gear, resolves all four events with live randomness (`crypto.getRandomValues`), and stores the show. Nothing of it is sent before 13:40.
- **13:37 to 13:40, the stands**: everyone with the Activity open sees the stands fill (their loungers), a countdown and the four events.
- **The show**: about 3 minutes. Everyone sees the same moment (the client seeks to `now - showStartsAt`). Late viewers can watch the replay until the next show. A Discord post gives each event's podium.
- First day on a server: the lineup is shown at once; the first show is at the next 13:40 after a lock.

## Events: a few rule kinds, many skins

An event is **content** (`games-events.json`): an id, a name, a kind, a scene, the kind's numbers and a short line. The engine has a handful of **kinds**; each reads the same creature stats (HP, Attack, Speed and its dodge, crits, element, role, stage, gear chance and trigger lines) differently. Skins reuse a kind with other numbers and other art (a sauna and a cold plunge are one kind with the elements flipped).

| Kind      | Shape                                                          | Reads                                                                                         |
| --------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `endure`  | Everyone in one room, a rising heat; last one in wins          | HP, element vs the heat, Guards shelter neighbours, Supports fan them; reactions spill        |
| `chase`   | Run ahead of a rolling threat over hops; distance wins         | Speed, dodge (hops), Sidestep; small creatures duck once                                      |
| `feast`   | Rounds of random food; whoever lasts eats most                 | HP as tolerance, element, crits are a double gulp (more score, more heat)                    |
| `swim`    | Laps of a lake with hazards picking swimmers                   | Speed, dodge, HP; Tide swims fast, Ember slow; Spark sparks its neighbours                     |
| `shove`   | All on a shrinking floe, random shoves; last one on wins       | Attack (push), HP (grip), small creatures are slippery; Ember melts the ice near it            |

Team events are a kind with `team: 3`: a player sends up to three creatures as one team (Sauna Stack: stack Guards).

### Fairness without a cap

1. One creature per event.
2. Stats count with **diminishing returns** against the field (a square-root curve), and each event's quirk (element, role, size, a gear line) counts about as much.
3. **Size**: stage 1 creatures are small; in some events small is better (ducking, slippery, less of a target).
4. **Luck in the gamble kinds** gives upsets and stories.
5. Experience is flat for entering plus a little per placing.

Simulator targets (`packages/sim`, games scenarios): the strongest entrant (by power) wins an event 25–45% of the time; a creature in the bottom half of the field by power reaches the podium in at least 15% of events; each event lasts 20–50 s at 1x; at least one visible "moment" (a reaction, a gulp, a squash, a splash) every 4 s.

## Medals

- Each event pays **gold, silver and bronze** to its top three (bots never take a real prize). A creature that beats its own record in an event earns a **pin**.
- **Lifetime counts** never go down. **Pocket** counts are spent at the stall.
- Shown: the living room's trophy shelf (the server's medal table), the Games tab, and the creature page (its medals and records).

## The Prize Stall (Wednesdays)

Open for the Wednesday game day (from the reset to the next reset, guild time). A few rotating offers priced in medal points (gold 3, silver 2, bronze and pins 1): a mystery gear piece, a supply, Bait, shards, glimmer. A per-week limit per offer. Unspent medals never expire.

## Dev and staging

- Bots: a dev-only route adds bot players with random rosters who enter every event; they appear in the show and the post and get no real prizes.
- Run now: a dev-only route locks, resolves and starts the show in 10 s, so a show can be tried any time.
