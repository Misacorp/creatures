# The boss track and the roster seam

How the lab plans which raid boss a server meets at which Boss Rank, and how it tunes those bosses without knowing yet how fast servers grow. Misa, 2026-10-30: combat v2's role is to set the challenges and make them easy to configure, then find the expected path for a server (first boss, next boss, and so on) and tune for it. Another branch is redesigning the passive systems at the same time (the valley: posts, scouts, the Forge, catch-up; `docs/design/valley/` on its branch), so the speed at which rosters grow is unknown. Work here must not be wasted when the two systems meet.

## The split

| Part                                                            | Owner      | Where                                                                                     |
| --------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| The challenges: which boss at which rank, its cards and numbers | combat v2  | `packages/lab/src/track.ts` (the track), `bosses.ts` (the bosses), the tuner              |
| The targets: what a server should achieve against them          | combat v2  | `packages/lab/src/targets.ts` (Misa's targets, 2026-10-30)                                |
| The roster: what a server's players have at week N              | the valley | `packages/lab/data/valley/` (the valley's files), read by `src/valley.ts` and `roster.ts` |
| The path: where a server is at week N, and how long it stays    | both meet  | `packages/lab/src/path.ts`: the track, the targets and the roster run together            |

The roster is the only thing the valley changes. When the valley has new numbers it copies them over its two files in `packages/lab/data/valley/`, and the tuner reruns (about 4 minutes); the track, the bosses, the targets and the path code stay.

## The seam: a roster profile

A roster profile says, for each kind of player and each week from 1 to 24:

- **Levels:** of the player's 1st, 3rd, 10th and 20th creature (the four the valley's economy lab plans to report; levels between are interpolated). The level cap is 30.
- **Roster size:** how many creatures the player has, and which lines (lab forms) a new server can have (starters plus what scouts find).
- **Talents:** how many talent slots are filled (slot 2 at level 20, slot 3 at 25 today) and whether they are picked or random.
- **Gear:** slots that can be worn and the item level. The lab has no gear yet (the gear plan is a later step), so this field is carried but unused until then.

Kinds of player: **daily** (the valley's "Sanni"), **weekly** (about 75% to 80% of a daily player's idle growth, valley target T-2) and **new** (joins late and catches up).

**The data is the valley's** (2026-10-30): `packages/lab/data/valley/roster-profile.json` (exactly the profile above) and `server-coverage.json` (see "Ownability"), copied from the valley branch `ccr-93a1de17-yutb1a`, commit `8ffe5d0`, `docs/design/valley/economy/`. `src/valley.ts` loads them, checks their shape (24 weeks per kind, numbers in range, `forms` is `'all'` or a list) and throws a clear error otherwise, so a bad drop-in fails loudly. Some values are fractions (a 10th creature at level 8.5); the 20th creature's level can drop from one week to the next while the roster is smaller than 20 (the valley reports the lowest owned level for a creature not owned). The new player's week-1 row is ahead of the daily player's; `rosterWeek` caps it at the daily player's level. `gear` is the average worn item level and is still unused.

The three **speeds** stay: **slow** (levels 20% behind), **expected**, **fast** (20% ahead). They are sensitivity factors on the valley's levels, not data of the valley: they show how the path moves if servers grow slower or faster than the valley says.

## The track

The track is data: an ordered list of slots, each a boss and the strength of its cards. The order of the bosses is one line (`TRACK_ORDER`): Tidal Colossus, Cinder Wyrm, Storm Sovereign, Old Bogback, Thornmother, and then the lap repeats, so Thornmother is slots 5, 10 and 15 (Misa, 2026-10-30; she used to be the third boss, by the shipped game's order). Her first appearance, slot 5, is a **wall** (below). A server starts at slot 1; a win moves it to the next slot (the Boss Rank rises by one); a failed boss returns the next week at full HP with last week's best on its bar (Misa, 2026-10-30). After the last boss the track starts again with stronger cards. A young server ramps in (below, "Tuning": slot 1 has no rule cards, slot 2 one). The first order is the shipped game's boss order; it is one line to change.

## The path

`path.ts` plays a server week by week: the roster at that week fights the boss of its current slot over a weekend; a kill moves it on, a loss keeps it. Festival weeks (every fifth week) pause the track: no raid boss that week, and afterwards the server continues where it was, with no rank ease (Misa, 2026-10-30). It reports, per kind of server (dedicated, mixed) and per roster speed:

- the week a server reaches each slot, and the weekends it spends there;
- the longest run on one boss, and the share of servers stuck more than 4 weeks (the shipped balance target allows at most 10%).

With `--determination` it also plays the same servers with Determination on (a dial, off by default; see "Tuning").

## Tuning

Each slot is tuned for the roster a dedicated server has in the week it usually arrives there (the path says when), at the expected roster speed only: a slow server arrives later and keeps growing while a failed boss returns, so the path at three speeds, not a measure at the expected arrival week, is where the speed's effect shows. Path and tuning repeat until the arrival weeks equal the weeks the table was tuned for (`node scripts/report.mjs --tune --track [--slots 1-15] [--quick]`, `trackTuner.ts`, about 2.5 minutes on 4 cores for 15 slots). A tuning is a sweep up the track, because a slot's arrival depends only on the slots before it; one sweep settles it from an empty table. The result is the `SLOT_NUMBERS` table in `track.ts`.

**The main measure is damage potential** (Misa, 2026-10-30; `docs/design/decisions/raids.md`): the lab plays the whole raid weekend as if the boss could not die (`FightOptions.potential`: the boss stays at 1 HP, every stage and round is played, knockouts, attrition between stages and Build-up run as normal, a Cull does not end it) and adds up all the damage as a share of the boss's HP (`weekendPotentialOf`, mean and spread; 1.4 is 140%). The kills, the HP removed and the retreat tiers are still measured with the normal fight. The targets, in `targets.ts`:

- **Prepared** (the boss's first written answer, with its written talents: the solved puzzle): potential **125% or more** (`PREPARED_POTENTIAL_MIN`). The same line with random legal talents is measured and reported, with no target.
- **Classic** (the unprepared but decent trio): potential **70% to 90%** (`CLASSIC_POTENTIAL_MIN`, `CLASSIC_POTENTIAL_MAX`) and, as before, a kill in at most 5% of weekends.
- Kept: `prepared.beat2` (a kill within two weekends, 75% or more) and the prepared line's HP removed with random talents (80% or more).
- **The tool's worth is a target in points of potential** (the lead's call, 2026-10-30; `toolPotentialMinAt` in `targets.ts`): the slot's tool, taken out of the prepared line (written talents), costs at least **5 points of potential at 0% card strength, 10 at 30%, rising straight to 35 at 100%** (flat above). A card asks at low strength and requires at full: without its tool a team at 130% falls under 100%. The tuner's weight for it is 2, under the potentials' 4. The tool's worth in points of the HP share (`tool.share`, `tool.written`) is **information only** on the track: it cannot hold once a prepared team reaches 125%, since such a team removes nearly all the HP with its tool or without it. The fixed ranks' test rules (`raidRules.ts`) still hold the HP-share tool targets (6 to 10 points).
- **The wall** (Misa, 2026-10-30, "Thornmother is a deliberate wall at the end of the first lap" in `docs/design/decisions/raids.md`): a per-slot flag in `track.ts` (`SLOT_WALL`, slot 5 only; `TrackSlot.wall`). Her bark makes a team with her answer far stronger than one without, and at the end of the first lap a server has a roster to rethink. On a wall slot `slotTargetsFor` asks the same as on any slot (prepared potential 125% or more, `prepared.beat2`, the tool's worth, the classic kill at most 5%) except the classic party's potential: **30% to 60%** (`WALL_CLASSIC_POTENTIAL_MIN`, `WALL_CLASSIC_POTENTIAL_MAX`) instead of 70% to 90%, and the tuner aims at 45% there (`WALL_CLASSIC_POTENTIAL_AIM`; the prepared aim stays 130%). Her later laps, slots 10 and 15, are normal slots: a server that passed the wall has learned the answer.
- Among numbers that meet every target the tuner prefers the prepared potential nearest 130% and the classic potential nearest 80% (`PREPARED_POTENTIAL_AIM`, `CLASSIC_POTENTIAL_AIM`, the lead's call), and then the numbers nearest the old ranks' line. The first-weekend kill aim it replaced (`PREPARED_KILL_AIM`) is gone.
- The mixed server (ten players, five of them casual) is information: its potential is shown beside its kill rate and HP share. The fixed-rank rules (`raidRules.ts`) stay as they were and are not applied to slots.

**The young-server ramp** is a column of the track (`SLOT_CARDS` in `track.ts`; `slotBoss` builds from it). Slot 1 is a **tutorial** boss: no rule cards and no Build-up, only its plain attack and its moves (the moves stay: they are the boss's attacks, not rules, and card strength does not scale them); with no card there is nothing to answer, so slot 1 has no tool target, and a new server has only its starters, so no classic limit either: its targets are the prepared potential, `prepared.beat2` and the HP removed with random talents. Slot 2 has **one** rule card, the boss's first, at the slot's low strength, and no Build-up. From slot 3 the boss has the full set (every card and its Build-up) at the slot's strength.

**Determination** (after WoW's; off by default; `path.ts`, `DETERMINATION`): each failed weekend on the same boss gives the server +5% damage and healing (`FightOptions.determinationBp`), at most 10 stacks, reset by a kill; a Festival week changes nothing. `--path --determination` plays the same servers with it on and prints that beside the path with it off. The track tuner never uses it, so the table does not rely on it; whether to turn it on is decided once the valley's systems land.

There is no numeric floor from the lap before: a later lap's cards are never weaker, its HP, Attack and armour may be lower when they make up for it, and the rule is that its first-weekend kill rate is not above the lap before's by more than noise (the tuner reports it). The lab tests' rules (`raidRules.ts`) stay with the three fixed ranks and are not applied to slots.

## Ownability

A raid answer must be built from creatures a server can own at the week the slot arrives (2026-10-30; Misa's constraint in the valley's round 15: it is fine to require a rare here or there, since players pool their rarer creatures in the raid roster, but an all-common requirement is too limiting, and epics should not be needed early).

- **Per line.** An evolved form cannot be found by scouts: a player owns it by owning its line's stage 1 and evolving it. So a form counts as its line, and the line has its stage 1 form's rarity. Rare lines: stormray (stormray, halcyray, tempestray), mossback (mossback, ancientshell, bloomback), coralynx. Epic lines: aurorix, gaiadrake, hearthshell, lanternfin, solmane.
- **The coverage.** `server-coverage.json` gives, for a mixed server of 5, 8 or 15 players and each week, the share of each rarity's species that at least one player owns: the chance a given species of that rarity can be pooled into the raid roster. The valley counts 34 forms as 34 species; using that share as the chance that a given line is owned is the approximation we accept.
- **The rule.** A slot's **tool line** (the boss's first answer in `BOSS_ANSWERS`, the line the track tuner measures as "prepared") is **ownable** at the slot's arrival week when the chance that a mixed server of 8 owns every non-common line it uses is at least 50%. That chance is the product, over the distinct non-common lines in the answer, of that rarity's coverage at that week. An all-common answer is always ownable. So one rare line is fine once rare coverage reaches 50%, two need about 71%, and an epic is out until late. The numbers are `OWNABLE_CHANCE_MIN` and `OWNABLE_SERVER` in `targets.ts`; the check is `ownability.ts`, shared by the test (`test/ownability.test.ts`) and the report (`--path` and the full report's track section print, per slot, the lines each answer needs, the chance on servers of 5, 8 and 15, and pass or fail).
- The slot's arrival week is the committed `SLOT_WEEKS` in `track.ts`: the weeks the table was tuned for, the dedicated server's median.
- The classic party also uses Tempestray (a rare). It is a measure of an unprepared but decent team, so it is left alone.

## What survives the meeting

The track, the bosses' content (what each one asks), the targets, the path and the tuner do not depend on the valley's numbers. Only the roster profile is replaced, and the bosses' HP, Attack and armour are re-tuned from it.

## Touch points with the valley

Raised by the valley session (2026-10-30) and kept open on both sides until the systems meet:

- **The server's item level cap** was to rise a step with each raid win; on the track a win is a kill, so its slow rise with time carries the weight.
- **Fight XP** is combat v2's to set. The valley's examples assume about 120 a day from the dungeon and 70 from the raid for a top creature.
- **Gear slot unlock levels** (Scarf 7, Charm 13) are combat v2's call, still open; Misa may drop them.
- **Gear lines** the valley is asking Misa about (an item level ladder of about 1 to 100, element pieces rolling only their own element's lines, 1, 3 or 5 lines by rarity) will change the stat sizes the lab's gear step measures.
- **Levels count in the raid** (no level sync), which the tuning assumes.
