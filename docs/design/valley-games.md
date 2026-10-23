# Valley Games: a daily wacky competition

Status: **built 2026-10-23** (overnight; Misa asked for it to be iterated and built, and tried on staging against bot opponents). Engine `packages/engine/src/games/`, content `games-events.json` and `games-stall.json`, server `apps/worker/src/games*.ts`, client `apps/activity/src/games/`, simulator `pnpm sim:games` (every target passes; the targets are in `packages/sim/src/games-study.ts`). The decisions log has the details (2026-10-22 and 2026-10-23). Misa's answers so far: medals mostly (bragging), shared events yes, four events a day at first, then three a day plus a Wednesday bonus event (2026-10-23: four every day felt like a bit much), a medal display with lifetime counts, medals tradable now and then (a small time slot).

## Why

Every activity rewards sending your three best creatures (dungeon, raid, Workshop, trips), so the rest of the roster never levels. The Games are a daily show where **each creature can enter one event**, three events a day (one of them a team event) and a fourth, the bonus event, on Wednesdays, so a player needs five creatures for a full day (six on Wednesday); the events read the combat stats in odd shapes, so the right element, role, size or gear line beats raw level; and a flat experience reward helps a young creature most (the lounging trick). Lighter in spirit than the dungeon: a wacky TV game show, not a fight.

## The daily rhythm

- **13:40** (`RULES.games.showAt`, three minutes after the 13:37 reset): today's show plays live to everyone, and **tomorrow's lineup** is revealed at the same moment.
- **Until the next reset (13:37)**: players place one creature in each event. Entries **carry over**: yesterday's entrants stay entered for any event with the same slot unless changed, so a casual player is in every show after one setup. A creature still on an expedition or a job can enter (the show takes no creature time).
- **13:37, the lock**: the server snapshots every entrant's stats and gear, resolves all the day's events with live randomness (`crypto.getRandomValues`), and stores the show. Nothing of it is sent before 13:40.
- **13:37 to 13:40, the stands**: everyone with the Activity open sees the stands fill (their loungers), a countdown and the day's events.
- **The show**: about 3 minutes. Everyone sees the same moment (the client seeks to `now - showStartsAt`). Late viewers can watch the replay until the next show. There is no Discord results post: it would spoil the replay for anyone who watches later (Misa, 2026-10-23).
- First day on a server: the lineup is shown at once; the first show is at the next 13:40 after a lock.

## Events: a few rule kinds, many skins

An event is **content** (`games-events.json`): an id, a name, a kind, a scene, the kind's numbers and a short line. The engine has a handful of **kinds**; each reads the same creature stats (HP, Attack, Speed and its dodge, crits, element, role, stage, gear chance and trigger lines) differently. Skins reuse a kind with other numbers and other art (a sauna and a cold plunge are one kind with the elements flipped).

| Kind     | Shape                                                    | Reads                                                                                                        |
| -------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `endure` | Everyone in one room, a rising heat; last one in wins    | HP, element vs the heat, Guards shelter neighbours, Supports fan them; reactions spill                       |
| `chase`  | Run ahead of a rolling threat over hops; distance wins   | Speed, dodge (hops), Sidestep; small creatures duck once                                                     |
| `feast`  | Rounds of random food; whoever lasts eats most           | HP as tolerance, element, crits are a double gulp (more score, more heat)                                    |
| `swim`   | Laps of a lake with hazards picking swimmers             | Speed, dodge, HP; Tide swims fast, Ember slow; Spark sparks its neighbours                                   |
| `shove`  | All on a shrinking floe, random shoves; last one on wins | Attack (push), HP (grip), small creatures are slippery; Ember melts the ice near it                          |
| `haul`   | Teams carry a log or push a pumpkin; first over wins     | Speed (carry: the slowest counts most) or Attack (push: summed); Guards steady, Supports cheer, Setters lead |

**Team events are real team sports** (Misa, 2026-10-23): a player sends up to three creatures as one team, and all three act at once on one big object (the `haul` kind: Log Carry, Pumpkin Push). A team event's length never grows with the number of teammates or teams: every lane races at once and the race ends a short grace after the first team crosses, or at a fixed cap (about 40 s; `pnpm sim:games` checks 4 against 15 teams). Lanes start staggered in up to four columns, so a field of 15 teams still reads. Sauna Stack and Shark Relay are retired (stacked and sequential, so longer per teammate); stored days that name them still replay under their names (`GAMES_RETIRED`).

### Fairness without a cap

1. One creature per event.
2. Stats count with **diminishing returns** against the field (a square-root curve), and each event's quirk (element, role, size, a gear line) counts about as much.
3. **Size**: a creature that can still evolve (stage 1 of a line that evolves) is small; evolved creatures and single-stage lines are big (`gamesIsSmall` in `@creatures/game`, read by the engine and the picker). In some events small is better (ducking, slippery, less of a target).
4. **Luck in the gamble kinds** gives upsets and stories.
5. Experience is flat for entering plus a little per placing.

Simulator targets (`packages/sim`, games scenarios): the strongest entrant (by power) wins an event 25–45% of the time; a creature in the bottom half of the field by power reaches the podium in at least 15% of events; each event lasts 20–50 s at 1x; at least one visible "moment" (a reaction, a gulp, a squash, a splash) every 4 s.

## Medals

- Each event pays **gold, silver and bronze** to its top three (bots never take a real prize). A creature that beats its own record in an event earns a **pin**.
- **Lifetime counts** never go down. **Pocket** counts are spent at the stall.
- **The bonus event** (`RULES.games.bonus`): Wednesday's show (the show day's weekday, guild time) has one solo event more, of a kind not already in the day when the pool allows, drawn after the day's three and shown before the team closer. Its medals and pins go in the pocket at double medal points (`pocketBp` 20000); lifetime counts take one each and experience is as in any event. Wednesday is the Prize Stall's day, so the bonus points land just in time to spend. Its lineup card wears a gold "Bonus" ribbon and its result row a "2x", both opening the `games-bonus` glossary entry.
- Shown: the living room's trophy shelf (the server's medal table), the Games tab, and the creature page (its medals and records).

## The Prize Stall (Wednesdays)

Open for the Wednesday game day (from the reset to the next reset, guild time). A few rotating offers priced in medal points (gold 3, silver 2, bronze and pins 1): a mystery gear piece, a supply, Bait, shards, glimmer. A per-week limit per offer. Unspent medals never expire.

## Dev and staging

- Bots: a dev-only route adds bot players with random rosters who enter every event; they appear in the show and the post and get no real prizes.
- Run now: a dev-only route locks, resolves and starts the show in 10 s, so a show can be tried any time.

## Server (worker) design

- **Days.** Show day D: entries are open from D-1's show (13:40) to the lock at D's reset (13:37); the show plays at 13:40 on D. Between the lock and the show nothing new can be entered. D's lineup is drawn (live RNG, `chooseLineup`, avoiding D-1's events; `RULES.games.eventsPerDay` events, plus the bonus event when D is the bonus day) the first time anyone needs it after D-1's show. It is stored in `games_days.lineup_json`: the ids in show order, or on a bonus day `{ ids, bonus }` (no migration; days stored earlier, four events and no bonus, read as the plain list).
- **Entries** are per player, event and slot (a team event has three slots). One creature per show day across all events. Before the lock only, own creatures only.
- **Auto-entry** keeps casual players in: a player who has entered once is auto-entered (on by default, a switch turns it off). At the lock, any event they left empty gets the creature that ran it last time, else their best-fitting free creature by `gamesAptitude`.
- **Lock.** In one transaction at the reset: snapshot every entrant (the raid's fold: stats, crit, gear and talent mods), draw a seed with the live RNG, run the day's events, store the results and placings. Nothing is sent before 13:40.
- **Awards at the show's end** (13:40 + the show's length, an alarm candidate, idempotent): creature experience (`RULES.games.xp`), medals (lifetime and pocket; the bonus event's pocket points doubled), pins for personal bests, creature records. No Discord post (it would spoil the replay).
- **Bots (dev only):** the raid's dev guests (`dev-guest-*` players with creatures) are reused. They are ordinary players to the Games and auto-enter. Dev tools: add bots, run now (lock now, show in 15 s), reset today.
- **Stall:** content offers, open on the Wednesday game day, priced in medal points, with a weekly limit per offer. Bought with an idempotency key through `runKeyed`, and granted with the existing grant helpers.

## v1 scope (frozen 2026-10-23, Misa: "ship a version of this and then improve it in the future")

In v1, and nothing else until it ships:

1. The team-event rework: Sauna Stack and Shark Relay retired; the team events Log Carry, Pumpkin Push, Bucket Brigade, Crate Tower and Kite Flight, all played at once and capped in time.
2. No level in the Games: species base strengths, role, element and size; gear keeps only its chance and trigger lines.
3. A binary "Good fit" badge instead of fit pips; no auto-entry and no "Recommended" fill.
4. Event badges per creature (wins per event) on the creature page and in the picker.
5. No Discord results post (done).

Postponed (after v1 ships): the upset badge, sky twists, crowded-element effects, a fresh-face bonus, and any new events or tweaks beyond bug fixes. Agents: when new feature requests or tweaks come up before v1 ships, remind Misa of this scope.
