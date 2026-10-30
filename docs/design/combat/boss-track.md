# The boss track and the roster seam

How the lab plans which raid boss a server meets at which Boss Rank, and how it tunes those bosses without knowing yet how fast servers grow. Misa, 2026-10-30: combat v2's role is to set the challenges and make them easy to configure, then find the expected path for a server (first boss, next boss, and so on) and tune for it. Another branch is redesigning the passive systems at the same time (the valley: posts, scouts, the Forge, catch-up; `docs/design/valley/` on its branch), so the speed at which rosters grow is unknown. Work here must not be wasted when the two systems meet.

## The split

| Part                                                            | Owner      | Where                                                                                 |
| --------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| The challenges: which boss at which rank, its cards and numbers | combat v2  | `packages/lab/src/track.ts` (the track), `bosses.ts` (the bosses), the tuner          |
| The targets: what a server should achieve against them          | combat v2  | `packages/lab/src/targets.ts` (Misa's targets, 2026-10-30)                            |
| The roster: what a server's players have at week N              | the valley | `packages/lab/src/roster.ts` today (placeholder data); the valley's economy lab later |
| The path: where a server is at week N, and how long it stays    | both meet  | `packages/lab/src/path.ts`: the track, the targets and the roster run together        |

The roster is the only thing the valley changes. When its economy lab exists, it writes the same roster data, and the tuner reruns (about 4 minutes); the track, the bosses, the targets and the path code stay.

## The seam: a roster profile

A roster profile says, for each kind of player and each week from 1 to 24:

- **Levels:** of the player's 1st, 3rd, 10th and 20th creature (the four the valley's economy lab plans to report; levels between are interpolated). The level cap is 30.
- **Roster size:** how many creatures the player has, and which lines (lab forms) a new server can have (starters plus what scouts find).
- **Talents:** how many talent slots are filled (slot 2 at level 20, slot 3 at 25 today) and whether they are picked or random.
- **Gear:** slots that can be worn and the item level. The lab has no gear yet (the gear plan is a later step), so this field is carried but unused until then.

Kinds of player: **daily** (the valley's "Sanni"), **weekly** (about 75% to 80% of a daily player's idle growth, valley target T-2) and **new** (joins late and catches up).

**Placeholder data until the valley's lab exists**, from the valley docs' worked examples (all marked there as examples): a daily player's best three at about level 19 at week 4, 25 at week 8 and 29 at week 12; the 10th creature at about 15 to 17 at week 4; 15 creatures by week 4; catch-up brings a new catch to the 3rd-best creature's level in about a week. Three speeds are kept: **slow** (levels 20% behind), **expected**, **fast** (20% ahead).

## The track

The track is data: an ordered list of slots, each a boss and the strength of its cards. A server starts at slot 1; a win moves it to the next slot (the Boss Rank rises by one); a failed boss returns the next week at full HP with last week's best on its bar (Misa, 2026-10-30). After the last boss the track starts again with stronger cards. The first order is the shipped game's boss order; it is one line to change.

## The path

`path.ts` plays a server week by week: the roster at that week fights the boss of its current slot over a weekend; a kill moves it on, a loss keeps it. Festival weeks (every fifth week) pause the track: no raid boss that week, and afterwards the server continues where it was, with no rank ease (Misa, 2026-10-30). It reports, per kind of server (dedicated, mixed) and per roster speed:

- the week a server reaches each slot, and the weekends it spends there;
- the longest run on one boss, and the share of servers stuck more than 4 weeks (the shipped balance target allows at most 10%).

## Tuning

Each slot is tuned for the roster a dedicated server has in the week it usually arrives there (the path says when), against Misa's targets. Path and tuning repeat until the arrival weeks stop moving. Numbers are tuned at the expected speed and checked at slow and fast; the report shows how the path moves with the speed, so a valley change that speeds levelling up or slows it shows its effect on the raid before it ships.

## What survives the meeting

The track, the bosses' content (what each one asks), the targets, the path and the tuner do not depend on the valley's numbers. Only the roster profile is replaced, and the bosses' HP, Attack and armour are re-tuned from it.
