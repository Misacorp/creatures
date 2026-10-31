# Weekly raid and live finale

Raid schedule, parties and joining, bosses and the raid curve, the live finale, raid board and summaries, raid Discord posts.

<!-- Maintained with `pnpm decisions`; see README.md. Newest first. -->

## 2026-10-31: Breakwater joins Tidal Colossus from its second lap, beside Slippery **[Misa]**

ID: `2026-10-31-breakwater-joins-tidal-colossus-from-its` · Status: current · Amends: `2026-10-31-mixed-servers-are-tuned-too-determination`

**Decision (Misa, 2026-10-31; the card is the lead's, from an overnight lab experiment).** Tidal Colossus gets a second new card from its second lap (slot 6, then 11 and on), beside Slippery: **Breakwater**. Its waves break on wards: Row Ward cuts (Keep the Heat In, Living Shelter) count about 2.4 to 3 times as much against its sweeps, by the card's strength. A mixed server's prepared players field the Row Ward answer, and a ward covers its whole row whoever owns it, so they shelter the casual players beside them.

**Reasoning.** Mixed servers could not beat the Colossus's later laps: at any HP where they won sometimes, the unprepared party of four won every week. The experiment measured four fixes. A Guard in a column cutting the waves failed: the unprepared party has a Guard in every column and gained more than the mixed server. Bigger single hits and taking Slippery off did not move the mixed server at all. Breakwater met every target at both slots (mixed kill 36% and 23% a weekend, the unprepared party at 80% to 84% with no kill), because the unprepared party has no ward and gains nothing. Misa: "A sounds good." "One new card per boss" was the lead's rule, not Misa's, and gives way here.

## 2026-10-31: Lucky Strike goes on the Storm Sovereign and Slippery on the Tidal Colossus, from their second lap

ID: `2026-10-31-lucky-strike-goes-on-the-storm` · Status: current · Amends: `2026-10-31-lucky-strike-and-slippery-both-go`

**Decision.** Each luck card arrives as the **new card of a boss's second lap**, on one boss, from that boss's slot 6 to 10 and on its later laps, at the slot's card strength (`SLOT_EXTRA_CARDS` in `track.ts`, `docs/design/combat/boss-track.md`): **Slippery on the Tidal Colossus** (slots 6, 11, 16, ...; Clear Skies answers) and **Lucky Strike on the Storm Sovereign** (slots 8, 13, 18, ...; Cool Head answers). The first lap has no extra card. No new written answer: the first answers cope once the slots are retuned. The tuner's proposal for the four slots is not applied here (the lead applies the table).

**Reasoning.** Measured in the lab at the committed numbers and with the track tuner (`--tune --track`, expected roster speed; the dedicated server's roster at each slot's arrival week):

- **Ownable.** Cool Head is on Thornbuck (a common line): 100% at every slot. Clear Skies is on Halcyray (the Stormray line, rare): 100% on mixed servers of 5, 8 and 15 from week 3; the lines of slots 6 to 15 arrive in weeks 7 to 18. (Aurorix, epic, would be 33% to 67% on a server of 8, so it is not the answer used.)
- **The first answer copes after the retune.** At the committed numbers the card lowers the prepared potential (Colossus slot 6: 132% to 111% with Slippery; Sovereign slot 8: 155% to 128% with Lucky Strike). The tuner then finds numbers that meet every target at both laps: slot 6 14_500 HP, 119 Attack, 27 armour (prepared 130%, tool 46 points, classic 82%); slot 8 7_800, 88, 8 (142%, 37 points, 72%); slot 11 15_600, 113, 40 (128%, 38 points, 84%); slot 13 10_200, 64, 8 (184%, 38 points, 77%). No miss. Slots 5 and 15 (Thornmother) miss their tool target by a rounding step; they were not touched.
- **The other placements were worse.** Slippery on the Cinder Wyrm: the tuner cannot meet slot 7 (classic potential 70% at the edge) or slot 12 (tool 33 points against 35, HP and armour at their limits). Lucky Strike on the Wyrm: tool 22 points against 27 at slot 7. Slippery on the Sovereign: tool 29 against 30 at slot 8, kill 83%. Either card on Old Bogback cuts the prepared kill from 98% to 42% to 60% (slots 9 and 14). Thornmother is the wall and already sits at 195% to 260% prepared, so a card there would only be noise.
- **The theme fits.** The Sovereign's lightning "strikes"; the Colossus is a body of slick sea water that slips away.
- **The answers are worth points, modestly.** In a team search at the slot (tool required, two copies of a form at most) Cool Head is worth about 9 points of potential at slot 8 and 4 to 6 at slot 13, and Clear Skies 0 to 3 at slot 6 and 8 at slot 11. These are well under the first answer's tool (30 to 45 points), so the card adds a choice, not a second must. Lines built on the card's Knack did not beat the first answers at slot 8 (121% against 146%) or slot 6 (120% against 130%), and at the later laps they only edge past them (slot 13: 201% against 180%; slot 11: 140% against 129%, a line that needs a rare), so no `BOSS_ANSWERS` entry was added; reaction lines (marks are never dodged) already beat Slippery without Clear Skies. Cool Head gives Thornbuck, whose Night Watch and Primed by Pain do little on the bosses, a job.

## 2026-10-31: Lucky Strike and Slippery both go on raid bosses **[Misa]**

ID: `2026-10-31-lucky-strike-and-slippery-both-go` · Status: current, amended by `2026-10-31-lucky-strike-goes-on-the-storm`

**Decision (Misa, 2026-10-31).** Both luck cards go on raid bosses: **Lucky Strike** (the boss's hits can crit; Cool Head answers it) and **Slippery** (the boss dodges more; Clear Skies answers it). They bring randomness on purpose. Which bosses carry them, and from which lap, is the lead's call, measured in the lab (each must keep its answer ownable and worth its tool, like every card).

**Reasoning.** Misa: "Both are included to introduce randomness. If players know bosses can dodge, they'll understand that a payoff's reaction was also dodged." Panel 6 had suggested Lucky Strike only, because only one Knack gets past Slippery's dodge; Misa reads a dodge the boss card announces as fair, not as a hidden rule.

## 2026-10-31: Mixed servers are tuned too; Determination on from the second lap, capped at +25%; a track strip, and no boss is called a wall **[Misa]**

ID: `2026-10-31-mixed-servers-are-tuned-too-determination` · Status: current, amended by `2026-10-31-breakwater-joins-tidal-colossus-from-its` · Amends: `2026-10-30-raids-are-tuned-on-damage-potential`, `2026-10-30-thornmother-is-a-deliberate-wall-at`

**Decision (Misa, answering design panel 6, `docs/design/combat/reviews/2026-10-31-panel-6.md`).**

- **Mixed servers are tuned too, where possible.** A mixed server (the usual server: a few engaged players and several casual ones) should need at most 3 weekends a boss at the expected roster speed. The track tuner holds it as a target on every slot, weighted below the dedicated targets; where both cannot hold, the dedicated targets win and the miss is reported. The tutorial (slot 1) asks more: a mixed server kills it in its first weekend in 80% of weekends.
- **Determination is on from the second lap** (slot 6 onward): +5% damage and healing per failed weekend on the same boss, at most +25% (5 stacks), kept over a Festival, cleared by a kill. Off on the first lap. The track tuner still never uses it, so the bosses' numbers do not rely on it.
- **A track strip on the raid screen:** the lap's five boss portraits, the current one lit, the beaten ones ticked. Never on the fight screen.
- **No boss is called a wall, anywhere a player looks.** Thornmother keeps her place at the end of the first lap and her tuning (the `SLOT_WALL` flag stays a tuning term in the lab), but no text, hint, strip or card marks her or any boss as a wall or warns of one.

**Reasoning.** Panel 6 measured that 88% of mixed servers spent more than 4 weekends on one boss at the expected speed, even on the card-less tutorial, because the numbers were fitted to four dedicated players only. With Determination on, slow dedicated servers stuck over 4 weekends fell from 15% to 0% and mixed ones from 88% to 48%; at its old +50% it would make the puzzle optional, so the cap is +25%, and the first lap stays clean. Misa on the wall: "They're just bosses. If players actually hit walls by design or accident, so be it. Let's not call them that. It robs players the experience of finding out. They know the boss's rules up front and can deduce from there."

## 2026-10-30: Thornmother is a deliberate wall at the end of the first lap **[Misa]**

ID: `2026-10-30-thornmother-is-a-deliberate-wall-at` · Status: current, amended by `2026-10-31-mixed-servers-are-tuned-too-determination` · Amends: `2026-10-30-raids-are-tuned-on-damage-potential`

**Decision (Misa; placement and targets by the lead).** Thornmother's bark (heavy armour that cracks as she loses HP) makes a team with an answer far stronger against her than one without, and that is wanted: placed right on the boss track, she is a wall that makes a server rethink its raid roster. She moves to the end of the track's first lap (slot 5, about week 5, after four other bosses), and her slot is marked as a **wall** in the track data: a prepared team with her answer still reaches 125% potential or more, while a team without it may fall well below the usual 70% to 90% (target 30% to 60%, no kill). Her later laps are tuned as normal slots, since a server that passed the wall has learned the answer.

**Reasoning.** Misa: "If we time it right in the progression track players can absolutely hit a wall and it's a good place to make them think about their raid rosters." Week 3 was too early for a wall (servers are still finding their first creatures); by the end of the first lap a server has a roster to rethink. Marking the slot keeps later tuning from smoothing her back into the normal band.

## 2026-10-30: Raids are tuned on damage potential; young servers ramp in; Determination built but off **[Misa]**

ID: `2026-10-30-raids-are-tuned-on-damage-potential` · Status: current, amended by `2026-10-30-thornmother-is-a-deliberate-wall-at`, `2026-10-31-mixed-servers-are-tuned-too-determination` · Amends: `2026-10-30-a-failed-raid-boss-returns-next`, `2026-10-30-how-the-boss-track-is-tuned`

**Decision (Misa).**

- **Damage potential is the tuning measure.** The lab plays the whole raid weekend as if the boss could not die and adds up the damage, as a share of the boss's HP. A **prepared** team (the boss's puzzle solved) reaches **125% or more**, so it wins with room to spare instead of on the last turn; an **unprepared but decent** team reaches **70% to 90%**, so a slightly prepared team can push into a kill. Mixed servers stay information. The lab does not model a half-prepared team separately (lead's call): servers sit between the two targets, and where they really sit comes from live data.
- **Young servers ramp in:** the first week's boss is a tutorial with no rule cards, the second has one card at low strength, and the full set arrives in the third week. It is a column of the track's data.
- **Determination** (a boost for each failed week, capped, reset on a kill; after WoW's) is built into the path simulator as a dial, **off by default**. Whether to turn it on is decided once the valley's systems land; the tuning does not rely on it.
- **Tuning follows live data.** Misa tunes the game for his server as it goes; the boss track is not a fixed 12-week promise. Later (the port), the game can read live production data and simulate the coming raid before it happens, so a boss can be adjusted to match.

**Reasoning.** A raid weekend is a cliff: the kill flips over a few percent of the boss's HP. Potential is smooth, so tuning on it puts a solved puzzle well past the cliff and an unprepared team well before it, which keeps the puzzle sharp (Misa wants it) while making a solved puzzle an easier win. A 25% margin also absorbs a valley that levels creatures about 20% slower than its examples. New servers have only starters and are still finding their footing in the valley, so the first weeks ask little. Determination and luck are built as tools in reserve rather than tuned around while several systems change at once.

## 2026-10-30: Festival weeks pause the boss track; no rank ease **[Misa]**

ID: `2026-10-30-festival-weeks-pause-the-boss-track` · Status: current · Amends: `2026-10-11-progression-decisions`, `2026-10-30-a-failed-raid-boss-returns-next`

**Decision (Misa).** For combat v2: a Festival week is a lighthearted break, a way to have fun with the creatures and a pool of resources, creatures and effects that are otherwise unavailable. It pauses the boss track: afterwards the server continues where it was, against the boss it failed the week before or the next boss in line if it had won. The shipped rule that eases the rank by one after a Festival (the season reset) is dropped.

**Reasoning.** With a fixed boss track, easing the rank meant re-fighting a boss the server had already beaten, which cost an extra week after every Festival and undid progress for no reason. The Festival's relief is the week off itself; the track is the server's progress.

## 2026-10-30: A failed raid boss returns next week; raids measure HP removed **[Misa]**

ID: `2026-10-30-a-failed-raid-boss-returns-next` · Status: current, amended by `2026-10-30-festival-weeks-pause-the-boss-track`, `2026-10-30-raids-are-tuned-on-damage-potential` · Amends: `2026-10-29-raid-tuning-aims-at-success-tiers`, `2026-10-11-progression-decisions`

**Decision (Misa).** For combat v2 (the shipped game changes only at the port):

- **A boss the server did not defeat returns the next week, at full HP.** Players who invested in a counter can try it again instead of chasing a new one, and each server climbs a fixed, known track of bosses (it replaces today's rotation by calendar week). After a kill the next boss on the track is known a week ahead, which fits raids that are announced in advance.
- **The boss's HP bar shows last week's best** ("12% left last time"), so a returning boss shows the server's progress. No boost per lost week for now (Misa declined "Resolve" in October): the Festival week still breaks up long streaks, and the simulator checks whether servers get stuck before any boost is added.
- **The share of HP removed is the measure of a raid; a kill is what moves the server up a rank.** Targets for the lab's tuner:
  - a **prepared** team usually wins within two weekends (a kill in about half of its weekends or more), and removes most of the HP even with random talents;
  - an **unprepared but decent** party (the classic trio, no tools) may get anything but a clean kill: it kills at most about 5% of weekends, with no limit on the HP it removes (a team that brute-forces a boss with overpowered creatures spent its time elsewhere and is not playing efficiently);
  - **mixed servers** have no target: the lab reports how many weeks they take to rank up (three weeks where a dedicated server takes one is fine).

**Reasoning.** Research on visible progress backs measuring HP removed: effort rises as a visible goal gets closer (goal gradient, Kivetz et al. 2006), a head start raises completion (endowed progress, Nunes and Drèze 2006), and after a failure, showing what is left motivates more than showing what was done. Damage-scored co-op bosses are an established pattern (Clash of Clans' Capital raids carry damage between attacks; Raid: Shadow Legends' clan bosses pay by damage). Games that repeat a boss add relief against getting stuck (WoW's Determination, +5% per wipe up to 10 stacks; FFXIV's Echo; WoW's Icecrown buff that rose about every 4 weeks); no research says how many failed attempts are too many, so that is measured, not assumed. A fixed track also lets the lab tune each boss at the exact rank it appears.

## 2026-10-26: Raid results show real damage and a separate score

ID: `2026-10-26-raid-results-show-real-damage-and` · Status: current · Amends: `2026-10-11-after-action-card-implementation-choices`, `2026-10-20-the-raid-summary-ships-scoreboard-first`

A player reported (#86) that the scoreboard's "Damage" added up to about half the boss's HP lost, and that a Payoff like Gaiadrake showed a third of what the fight log said it hit for. The column was the engine's `CreatureTotals.damage`: the hitter's share of the credit, after the setter's 60% of a reaction's bonus and the Supports' share of buffed damage had moved to other creatures. Misa: a "Damage" column must show damage; the credit is the score, and the results say what each one means.

1. **Damage** is what a creature really took off the boss: every `hit` in full (reaction bonus included) plus the Echo and Riposte `proc` amounts. The engine's `damageDealt(events)` sums it per creature from the stored events, so every stored fight (the stats route only serves last week and this week, whose events are kept) shows it without a migration. A property test checks that it adds up to the HP the boss lost.
2. **Score** is the engine's `contribution` (own hits after the shares, plus setup, support and guard credit), the weight of the Essence share. The stats send `damage`, `score` and, per player, `assist` (the part of the score from setting up, supporting and guarding, for the "backbone" highlight). The field `contribution` is gone from the stats; the stored summary is unchanged.
3. The scoreboard and the Top creatures table have the columns Damage and Score. One "?" by the Scoreboard heading (the `raid-scoreboard` glossary entry, "Damage and score") explains both, so the header row stays short (Misa). The share column ("%") is gone from the scoreboard (the "Hardest hitter" highlight still says the share); the hero shows the caller's damage and score.
4. **Sorting (Misa).** A tap on the Damage or Score heading orders that table by it, highest first (ties by the other number, then the server's order); the heading is a plain button, gold with a small pixel triangle while it is the order, and the table says it with `aria-sort`. Damage is the default. On the scoreboard the places follow the order; in Top creatures "#n" stays the place by damage among all creatures (the server picks the five best by damage). Each table keeps its own order while the card is open; nothing is stored.
5. The glossary entry keeps explaining lines although raid popups are one line (Misa, 2026-10-14): it sits in the How to play "Rewards" section, because the score is how the Essence share is decided, and Misa asked for an explanation here.
6. The replay's "Your recap" counts Echo and Riposte as damage too, and calls the setup share "score from setting up".

## 2026-10-26: Raids: join until the finale; new servers start at Rank 1

ID: `2026-10-26-raids-join-until-the-finale-new` · Status: current · Amends: `2026-10-26-raids-you-join-by-placing-no`

Amends rule 6 of "Raids: you join by placing; no auto teams" (joining closed at Phase 1). Misa asked for two changes.

1. **You can join the raid until the finale starts.** A player's first placement joins them at any time while the week's status is not `finale` (after Phase 1 and after Phase 2 too). The placement goes to the party with the fewest joined players (`partyToJoin`, lowest number on a tie), parties and all. Once the finale starts, the usual `locked` answer applies; `raid_closed` is gone.
   - The boss's HP pool is fixed when a party first fights (Phase 1 for a party that exists then) and a late joiner never rescales it. A party made after Phase 1 (every other party is full, or the active roster needs another one) scales its own pool, from its members, at its first fight.
   - Phase 2 and the finale are built from the current placements, so a late joiner's creatures fight from the next stage they are in. Essence, experience, gear and finale loot (jackpot, Festival creature) are paid per stage to the fighters of that stage only, so a late joiner gets nothing for Phase 1 or any stage before they joined. Their finale ability is the default by join order, like everyone else's.
   - The Raid tab's pip and the Home notice nudge an active player who has not joined until the finale starts; the live board's ticket and the view of the board they would join work the same after Phase 1.
   - **Leaving is unchanged:** removing all creatures before Phase 1 leaves the raid; from Phase 1 a member stays in the party and just does not fight with an empty board. (Allowing it later would mean moving a player out of a party with results, for no gain.)
   - The staging dev tool that fills the roster (`raid-roster`) still locks at Phase 1, as before; it is a setup tool, not a player rule.
2. **A new server starts at Rank 1 when its first week opens.** A server with no rank gets `placementRank` (always the start rank, 1) stored on its ladder at week creation, so the Monday post always shows "Rank 1" even before anyone has joined. Placement no longer waits for a member or reads the members' creatures: `placementFor` is removed and `placeServer` takes no week. Places that still place a rank without a member: an old open week with no rank gets it at its first join or at Phase 1 (`ensureWeekRank`), the legacy-week conversion still needs members (a legacy week where nobody joined stays as it was), and a re-declared first week uses the start rank.

## 2026-10-26: The raid board is live over the sockets

ID: `2026-10-26-the-raid-board-is-live-over` · Status: current

Misa wanted teammates' placements to appear on the Raid tab as they happen. Until now the tab only synced when it was reopened, when you acted, or when a phase resolved. Details in `raid-live-board.md`.

1. A third socket topic, `raid` (`{ week, party }`), on the existing live machinery (tickets, caps, hibernation, the lounge's client controller). Its own ticket and upgrade routes, `POST /api/raid/board/ticket` and `GET /api/raid/board/live`, behind a new flag `RAID_LIVE` (on in local, staging and production, pinned by a test; `/api/config` announces `raidLive`). The ticket is made for the party the raid view shows the player: their own, or the one they would join.
2. **Push the change, not the view.** After `place` or `unplace` commits, the party's other board sockets get one small message: the changed cells (built by the view's own cell code, the actor's creatures as `mine: false` without ids) and the roster change if someone joined or left. Nothing is built when nobody listens (0 rows); a push reads about 10 rows (the placed creatures by id and one name), plus one row-length calculation on a leave. A push never throws.
3. Phase results and the readiness band are not pushed: the tab already reloads after each phase is due. The finale keeps its own socket.
4. Client: while the Raid tab shows a party's board and the flag is on, it keeps a board socket; a pushed cell is checked strictly and applied in place, and anything that cannot be applied (or a socket coming back after a drop) costs one normal `fetchRaid()` reload. No polling was added; with the socket down the tab behaves as before.
5. Not done: answering the player's own placement with the compact change. The HTTP routes still return the whole view (it would complicate the client's merge for the saving of one small response).

`wrangler.jsonc` changed (the `RAID_LIVE` var in all three places), which the PR calls out.

## 2026-10-26: Raids: you join by placing; no auto teams

ID: `2026-10-26-raids-you-join-by-placing-no` · Status: current, amended by `2026-10-26-raids-join-until-the-finale-new` · Supersedes: `2026-10-18-auto-tiles-are-soft-and-muted` · Amends: `2026-10-10-no-raid-sign-up-parties-of`, `2026-10-14-raid-roster-you-bring-the-creatures`, `2026-10-18-auto-joining-creatures-are-on-the`

Misa reversed the 2026-10-10 rule: "Their occupied slots only hinder the active players. Therefore let's only add players to the raid if they legitimately actually assign their creatures to the board." It also removes the expensive part of the raid view and of every fight build, "find a player's best three" (every creature, talent and worn item of every member). He approved these seven rules exactly:

1. You join the week's raid by placing your first creature. Nothing is auto-filled: you bring exactly what you placed (1 to 3 creatures).
2. Only joined players count: boss HP scaling (`scaleBoss` by member count), loot, Essence, finale abilities and party size. Players who did not join get nothing and do not make the boss harder.
3. Away players' slots are simply free: nobody's creatures sit on the board unless they placed them. Slots stay first come, first served. The board's size rule keeps room for every active player to place three, capped at a party's maximum, and the guest rule for fewer than three joined players stays.
4. "Sit this week out" and the away-teammate assist are removed.
5. On servers over 15 players a player who first places a creature joins the party with the fewest joined players. No snake draft on power at week start.
6. Joining closes at Phase 1. After it the parties are fixed, but joined players can still move or swap their own creatures. Before Phase 1 a player who removes all their creatures leaves the raid again. _Amended 2026-10-26 ("join until the finale"): joining stays open until the finale starts._
7. The Raid tab's pip and the Home notice keep nudging an active player who has not placed yet, so nobody misses it. A joined player with fewer than three placed (and more creatures to place) is nudged the same way.

**What was built.**

- **Joining.** `Raid.place` joins the caller on their first placement (`joinSmallestParty`, which makes the party if it does not exist yet) while Phase 1 has not resolved (`raid_closed` after). `unplace` leaves the raid when the last placement goes before Phase 1 (`leaveParty`). The week opens with no members and no parties. A new server is placed (its first Boss Rank) when its first player joins.
- **Teams.** `raidTeam` and the new `teamOfPlacements` are the placed creatures only (at most three, `capPlacements`), loaded by id with their gear and talents. `autoTeam` is now only the strongest-first order of those. `buildPartyBoard` reads the party's placements once and builds every member's team from them; members with no creature left on the board do not fight and do not count for `scaleBoss`, the abilities or the payouts. A party where nobody has anything on the board has no fight (`buildPhaseInput` answers null; no result, no loot, no post). `updateLadder` waits only for parties that have a placement.
- **Board size.** `partyRowLength`: three per player for the larger of the party's joined players and its share of the active roster, at most 15 players, nine slots (guests) below three players, never shorter than the highest slot in use. The active roster is counted as of the week's creation (`activeWindowDays` before it), so the board does not shrink when someone stops playing and the zones of placed creatures do not move; it can grow when someone new becomes active. The party count and the party a newcomer would join come from the same number (`partyToJoin`).
- **View.** `GET /api/raid` shows a player who has not joined (and has a creature, while joining is open) the board of the party they would join, with `you.inRoster` false and no team. A joined player's `you.team` is the placed creatures. The roster, the parties and the finale only list joined players.
- **Posts and pings.** The Monday reveal names no head count (nobody has joined yet): its footer says "Place a creature on the raid board to join." It is queued when the server has any active player. The phase and finale posts are about the fighters of the party. The finale DM ping goes only to opted-in players who joined the week's raid.
- **Reads.** The raid view of the read budget's guild (15 players joined, three each) went from 780 rows to 633, with no collection read; its budget is 950. The stored teammate teams are not needed any more.
- **Dev tools (staging).** Simulated players place their three creatures (`placeGuest`); the caller's three strongest are placed for them by the roster, simulate and live tools (`joinCaller`), because those tools need the caller in the raid. "Resolve now" does not join anyone.

**Removed on purpose.** The opt-out (`PUT /api/raid/opt-out`, its schema, `Raid.setOptOut`, the `roster_optout` analytics event and its `raid.optout` rollup line), the away assist (`raid-assist.ts`, `placed_by` is no longer written or read, the away list, the "Swap for another" picker and the "moved by" lines in the client), `autoPlace` of unplaced creatures in the raid and the "auto" tile marker, `createParties`, `snakeDraft` and `playerPower`, the late-joiner sync (`syncRoster`), `shownRaidTeam` and `markShownTeamsStale`. The tables `raid_opt_outs`, `raid_teams` and `raid_team_cache` and the column `raid_placements.placed_by` stay as they are (released migrations are never edited) and are not used; nothing dropped in a new migration, since they hold no rows that matter and cost nothing. The retired `PUT /api/raid/team` route still answers (it changes nothing).

**Open for Misa.** A joined player who removes everything after Phase 1 stays in the party (rule 6) but does not fight, so they get no loot that week. A brand-new server shows no Boss Rank on the Monday post (it is placed at the first join); an older server shows its rank as before.

## 2026-10-24: Creature names on the raid board, and a tiny HP bar in the raid

ID: `2026-10-24-creature-names-on-the-raid-board` · Status: current

Misa, after a solo finale on staging: show the creatures' own names on the raid roster (a nickname a player gave is good to show), and give creatures a tiny HP bar in the raid, animated (the damage flashes white, then drains), with a new small component and clear ends so one creature's bar does not run into the next.

- **Names:** the raid placement board printed each creature's species name ("a species name in the raid"); it now prints the name the server sends, which is the nickname when there is one (`raid-board.ts`; the fight stage already did). The spoken label and the board's one-line effect text ("Sets up Steam for ...") use it too.
- **HP in the raid:** the server sends each creature's start and maximum HP with the row once the fight is known (`fightRow` in `raid-view.ts`, from the engine's result: the live finale and the replay alike; the lobby has none). Nothing about the fight's course is revealed by them. The stage works out the HP at each moment from the events, as it does for the dungeon.
- **`ui/TinyHp`:** 4 px tall, 2.5 rem wide, a dark track in a 1 px ink edge with a faint light rim, so bars side by side (12 px apart in the grid) are clearly separate. Green, red at 30% or less, faded when knocked out. One width (`--hp`) drives two layers: the fill drops at once, the white strip under it waits 400 ms and drains in 450 ms. Under reduced motion it simply drops. It sits under the creature's name (under the sprite it collided with the boss's targeting bar). The raid grid's rows are 0.5 rem taller for it; the dungeon keeps its segmented bar.

## 2026-10-24: No acting order under the creatures

ID: `2026-10-24-no-acting-order-under-the-creatures` · Status: current · Amends: `2026-10-14-raid-ux-pass-2-slices-4`, `2026-10-14-the-daily-dungeon-always-acts-left`

Misa: drop the "1st, 2nd, 3rd" under each creature on the fight stage; the move track under the boss's side already tells players what is coming, which is enough to follow the round.

- The ordinal line under every creature is gone in the raid and the dungeon, and the board's rows are that line shorter (`--tile-h` 4.875rem to 4.125rem). The acting creature keeps its hop and, in the dungeon, its gold frame.
- A screen reader still hears the order: each creature's name starts with "Acts 2nd" while the round runs.

## 2026-10-24: The raid party sits dead centre on a wide screen

ID: `2026-10-24-the-raid-party-sits-dead-centre` · Status: current

Misa, on desktop: the creature board stayed at the left while the boss is centred. Centre it so the grid itself is dead centre, with the row names to its left, not counted in the centring.

- **Stage only, wide screens only** (`styles/stage/stage-grid.css`, from 40rem): the board is only as wide as its row names and lanes, centred, with a blank on its right as wide as the names and their gap. So the lanes are centred and the names sit right beside them. The raid board (placement) keeps its own layout.
- **Phones keep the old layout**: the names at the left edge and the lanes scrolling from the left, because there is no room to spare. A party wider than the stage still scrolls on a wide screen too (the board never grows past the stage).

## 2026-10-24: The barrier is a hexagon that spills around the foe

ID: `2026-10-24-the-barrier-is-a-hexagon-that` · Status: current · Amends: `2026-10-24-the-barrier-is-shimmering-triangles-the`

Misa, on the triangle barrier: slightly smaller triangles, a shield big enough to spill around the boss (it sat on top of it and was hard to see), about 10% less opaque, a hexagon rather than the rough square, and a shimmer that starts at the top left and travels to the bottom right with a nicer timing.

- **A regular hexagon** (flat top and bottom) of whole triangles, its corners on the triangles' grid so the outline is clean (`barrier-shards.ts`). Its side is a whole number of triangles, sized from a box 2.5rem wider than the foe's picture on each side and centred on the sprite, so it spills well around the foe. The outer ring of triangles is a little brighter (two rings for the Thorns room's briar cage).
- **Triangles** are 16 px a side (21 for Molten Shell's plates, 13 for the Thorns room); their strength is 10% lower.
- **The shimmer** is a bright band that sweeps across the diagonal from the top left to the bottom right in 1.6 s with a quintic ease in and out (it gathers, rushes through the middle, settles), then rests 2.2 s. Each triangle keeps its own slow pulse of opacity and colour under it.

## 2026-10-24: The barrier is shimmering triangles; the track points at this round

ID: `2026-10-24-the-barrier-is-shimmering-triangles-the` · Status: current, amended by `2026-10-24-the-barrier-is-a-hexagon-that` · Amends: `2026-10-24-a-barrier-over-the-foe-a`

Misa, on the first barrier: its border was too pronounced; build it instead from small equilateral triangles whose opacity and saturation shift and shimmer, with no border, and on a shatter let the triangles fly out and fade. On the track, "NOW" was bulky and out of line with the other rows' numbers: a small right-pointing triangle that moves a little, like the Valley Games' marker over your own creatures.

- **The barrier is one small canvas** (`stage/Barrier.tsx`) of equilateral triangles cut to a dome (`stage/barrier-shards.ts`, pure and tested). Each triangle has its own slow pulse of opacity and drift of colour between the theme's main and light colours; a glint sweeps across now and then; the triangles at the dome's edge are a little brighter, so the shape reads with no border. The triangles are big (about 20 px a side, so about 6 to 7 across a boss and 20 across a phone: Misa found 9 px read as pixels). On a shatter it flashes, and every triangle flies outward, turns, falls a little and fades (750 ms); the canvas reaches 100 px past the dome on every side so the pieces fly free over the stage (only the stage's own edge clips them). Performance: a few dozen triangles on one canvas, redrawn only while a barrier shows, at most twice the CSS size on a high-density screen; with reduced motion it is drawn once and goes when broken. The patterns are now `glass` (the default), `plates` (bigger, slower, more solid: Molten Shell) and `thorns` (small and quick with a bright edge).
- **This round's pointer** on the track is the Valley Games' `YOU_MARKER` sprite at 1x, turned to point right, nudging a pixel back and forth; gold, red while a move comes this round. The other rows keep their round counts, in line with it.

## 2026-10-24: A barrier over the foe, a track of rows, the boss in the middle

ID: `2026-10-24-a-barrier-over-the-foe-a` · Status: current, amended by `2026-10-24-the-barrier-is-shimmering-triangles-the` · Amends: `2026-10-23-themed-boss-attacks-in-pixel-style`

Misa, after trying the pixel attacks on staging: Backdraft is a lasting effect that "pops" on the first reaction, so show it on the boss, "a semi transparent shield that overlays the boss, like a magical barrier that breaks when a reaction hits", and make it "a more generic but configurable barrier" for every similar effect on every foe. On a phone the move list took "a ton of screen space that should belong to the boss": the boss should always sit in the middle of the stage, the track should lean on icons, with tiny text if any, and each round should be a row with its moves side by side.

- **One barrier for every lasting move** (`stage/Barrier.tsx`, `styles/stage/barrier.css`). The ops that raise one are `BARRIER_OPS` in `replay.ts` (today `reflect_first_reaction`: Backdraft, Molten Shell and the Thorns room). The replay state keeps it: it is raised when its move is armed, broken by the first reaction that meets it (reflected, or turned aside by a gear set), and gone when the round ends. Its look is configured per move in `move-fx.ts` (`BARRIER_LOOK`: a theme for the colours and a pattern, `hex` a magical lattice, `shell` plates, `thorns` a briar cage), and a new barrier move with no entry gets the foe's element and `hex`. It is a see-through pixel dome with a hard edge and a stepped shine; it forms in steps and, when it breaks, it flashes and is gone while its pieces fly off the foe and the reaction is thrown back at the creature as a bolt (the `backlash` recipe, played for the reflected hit). With reduced motion it simply shows and hides. Tests cover the state, that every barrier move in the content has a look, and the stage drawing it.
- **The track is a row per round** (the `rows` look, now the default): this round on top with a tiny "NOW" (white on red when a move comes), the next rounds below with only the rounds to go, each round's moves as icons side by side, an empty round as a dot, a charge faint in the round it marks and full in the round it lands. The other looks stay in the workbench.
- **The boss is always in the middle**: the boss row is three columns, the two sides equal, so the track and the effects float beside the picture without pushing it.
- **The track goes once the fight is over** (the foe or every creature is down, or the last round ended).
- **The boss's mark** is the element's icon and the mark's name with an ink outline: no "marked" ring glyph and no frame.
- **Empty board slots** are a faint dotted line on the floor instead of a dashed box.
- **Knocked-out creatures**: a small skull in the corner; your own lose most of their tint and the "you" tag fades.

## 2026-10-23: Themed boss attacks in pixel style, the countdown track, quieter marks

ID: `2026-10-23-themed-boss-attacks-in-pixel-style` · Status: current, amended by `2026-10-24-a-barrier-over-the-foe-a` · Amends: `2026-10-22-four-looks-for-the-move-track`

Misa, on the flying attacks: the projectiles were "all over the place", flying in from off screen; tint them by the boss's colour, element or the move's theme; the move track and the status effects were still "boxes in boxes on boxes"; the boss targets creatures "with just boxes"; be more imaginative ("vines coming in from below to tangle an entire row and shake them", "a meteor falling from off-screen to smash and shatter a creature and its neighbours"); the round intro should play at full speed. He asked for a few agents with different personalities to review the result and for the work to follow their feedback. Four reviewers (a raid leader, a casual phone player, an accessibility reviewer and a pixel-art director) looked at screenshots and stills of every boss's attacks.

- **Every boss move has its own animation** (`move-fx.ts` picks a recipe and a theme for each move; `stage/boss-fx.ts` plays it; `stage/BossFx.tsx` mounts it in the stage's strike layer; `stage/BossShots.tsx` and `shots.css` are gone). Recipes: a crescent (the plain attack, in the boss element's colours), vines bursting from the ground and coiling round each target (Bramble Bind), thorny vines growing in from both ends of a row (Briar Pincer), lightning from a dark cloud (Thunderclap) or jumping from creature to creature (Lightning Rod, Static Field), water, mud or lava surging up under a row (Undertow, Sinking Mud, a charged wave), a boulder falling from the sky and shattering (Bog Lob), the boss leaping and landing (Belly Flop), a ring of embers tightening (Coil Crush) or round the boss (Backdraft), embers or seeds raining, a lobbed blob, a water jet down a lane, a swarm, bubbles. Hit creatures shake. A move the table does not know falls back on its kind and the boss's element. A test checks that every boss and dungeon foe move in the content has a look.
- **Pixel style** (the reviewers' strongest point): hard edges, no soft glows or blurs, two or three colours per shape. The big things that fly (the crescent, the boulder, the blob) are small pixel sprites (`stage/fx-sprites.ts`) drawn on a canvas in the theme's colours, the same `parseSprite`/`swapPalette` the creatures use; the rest are CSS shapes tinted by a theme class. Surges are see-through with a stepped pixel crest, so the creatures and numbers show through. Lightning has a hard dark edge and flickers less. Impact rings grow in steps.
- **The countdown track is the default** (the reviewers' unanimous pick): the next four moves, each once, with the rounds left; this round's says "NOW" in a hard white-on-red badge, and this round's and the next round's moves carry their names. The other three looks stay in the workbench.
- **Status effects:** on a creature the debuffs now sit on the sprite's bottom-left (they covered the name), with a bare stack count (none for one stack); a buff's mark is an open △ in green, a debuff's a solid ▼ in red, so the shape differs and not only the colour.
- **Targeting without boxes:** while motion is allowed, a creature about to be hit gets a hard red bar on the ground and a hollow red chevron hopping over its head (not the solid ▼ of a debuff); a creature the splash will catch gets a dashed amber bar; a row about to be hit a red bar along its floor. With reduced motion nothing plays, so the old outlines stay.
- **Quieter roster:** your creatures keep a soft tint and the "you" tag, without the gold frame; the acting order under each creature is in a muted colour; a Shield Wall is a faint green tint with a solid floor line instead of a dashed box.
- **Full-speed round intro:** the slow pace's round intro is 1.5 s, the classic one's; the rest of the slow pace is unchanged.
- **Not done:** the target row in the track (a raid leader asked for "R4 Undertow: FRONT"): a move's popover says what it hits, and the board marks it when it winds up.

## 2026-10-22: Four looks for the move track; the boss's attacks fly

ID: `2026-10-22-four-looks-for-the-move-track` · Status: current, amended by `2026-10-23-themed-boss-attacks-in-pixel-style` · Amends: `2026-10-22-the-boss-s-move-track-and`

Misa, on the first move track: "the right idea but the UI looks clunky and rough"; a move used every round should show in every round's box; the lines under the boss that announce what happens are redundant with the track; the boss and the raid roster are the main focus, so the moves can be smaller and less pronounced. Four versions to choose from, and better attack animations: "a slight curved boomerang shaped arc of glowing light that glides at a creature", a white flash and big damage numbers, special and area moves with their own flavour, overlapping numbers are fine, reuse and tint rather than add files.

- **Four looks** (`TrackLook`, the workbench's Stage page has a `track` control): `whisper` (no frames, small glyphs fading with distance, a gold tick on this round; quietest), `glass` (faint see-through boxes fading with distance, a smooth glide, a soft red glow when a move is due; the default for now), `ladder` (crisp pixel boxes, a stepped rise, this round framed in red), `arcade` (bigger tiles, the due box pulses and the arriving move pops in; loudest). All are smaller than the first version. The markup is shared; each look is a set of custom properties and a few rules in `move-track.css`.
- **Every-round moves are in every box** (Lightning Rod, Backdraft).
- **Removed:** the "Next round: …" forecast line and the attack label under the boss's HP bar. The track names this round's moves, its moves explain themselves on tap or hover, and the board still outlines the row or creatures a move aims at.
- **Every number shows.** The rule that hid the small numbers of a move that hit more than eight creatures is gone: when a whole row is hit it is one big moment, and nobody reads each number.
- **Attacks fly** (`stage/BossShots.tsx`, `styles/stage/shots.css`). During the boss's wind-up something flies from the boss and lands exactly when the hit does (the white flash and the numbers were already there; the boss's numbers on creatures are now bigger: 1.5rem, crits 2rem). The plain attack, a slam and a strike on the strongest: a glowing crescent on a slight curve with two fading ghosts behind it; a chain jumps from creature to creature. A zone hit, a sweep and the enrage round: a tall crescent with a glowing wash behind it sweeps across the row. A barrage and a charge landing: orbs fall from above. A lance: a spear of light down the lane. A pincer: two crescents close in from both ends. A silence: violet crescents. Each ends in an impact ring. Everything is a CSS shape tinted with the boss's element (`--shot`); the motion is the Web Animations API (curves sampled into keyframes), so there are no new image files. Nothing flies with reduced motion. The old straight beams are gone.
- **Timing:** a shot flies for at most 900 ms at the end of the wind-up (the slow pace's wind-up is 1.5 s, so the reticles show first; the classic 600 ms wind-up of replays is all flight).
- **Workbench:** a new `BossShots` page plays a seeded raid fight round after round (any boss, party size and rounds, either pace, optionally the boss's turns only), to watch the attacks in motion.

## 2026-10-22: The boss's move track, and fixed places for buffs and debuffs

ID: `2026-10-22-the-boss-s-move-track-and` · Status: current, amended by `2026-10-22-four-looks-for-the-move-track`

Misa: boxes of moves that "come up from underneath", like notes in Guitar Hero, so players see a move coming; an empty box when the boss does nothing special; several moves side by side; tap (or hover with a mouse) for what a move does. Buffs and debuffs: no titles, always in the same place, with up and down triangles.

- **The track** (`move-track.ts`, `stage/MoveTrack.tsx`) sits left of the boss in the shared stage, so the raid replay, the live finale and the dungeon all have it. Five boxes: this round on top (taller, lit red with the move's name when one is due), the next four under it. Every special move comes on a fixed schedule (`every N` rounds), so the track is exact from the content and the round number alone, like the forecast.
- **Kinds:** a plain move is one box (it strikes at the boss's turn, after the creatures). A charged move is a long block over the round it marks and the round it lands (the engine announces it at the start of the round before). Backdraft's trap has a dashed edge (armed from the start of the round, for the whole round). A move that comes every round shows in the top box only: a copy in every box would hide the moves that do come.
- **Timing stays as it is:** the boss acts at the end of the round, after the creatures; only charges (marked at the start) and Backdraft (armed at the start) differ. No moves strike mid-round: the engine has no such timing and the track could not show it simply.
- **Buffs and debuffs:** the boss's effects stand in a column at its right, buffs at the top and debuffs at the bottom, with no titles; each chip has a ▲ (buff) or ▼ (debuff) in its corner, so colour is not the only cue. On a creature, buffs run along the top of the sprite and debuffs along its bottom.
- **Kept for now:** the "Next round: ..." line under the HP bar, which says which row or creatures a move aims at; Misa to decide whether it stays.

## 2026-10-22: The live finale is pushed over the live socket

ID: `2026-10-22-the-live-finale-is-pushed-over` · Status: current · Amends: `2026-10-11-live-finale-over-short-polling-first`

The finale polled `GET /api/raid/live` every 2 s. The lounge's WebSocket push has been in production since 2026-10-20, so the finale now rides the same machinery (`finale-live.md`).

- **One socket module with topics, one ticket mechanism.** A socket has one topic, chosen by the server: `t:lounge` or `t:finale:<week>:<party>` (tags `u:<userId>` and `t:<topic>`). The ticket string is unchanged; the topic sits next to the user id in the object's in-memory ticket book, so a client cannot choose it. `POST /api/finale/ticket { week, party }` (strict schema) needs the current week and membership of that party (403 otherwise). Each upgrade route (`/api/lounge/live`, `/api/finale/live`) opens only its own kind of ticket. Pushes go to one topic's sockets only; the lounge's messages, limits (64 per guild; 3 per player, now per topic kind, so a player can have a lounge and a finale socket) and tests are unchanged. `LiveMessage` stays `v: 1` and gains `{ type: 'finale', snapshot }`.
- **The alarm is the broadcaster.** Nothing ticks, rounds come from the clock. `desiredAlarmAt` gains one candidate, the next round start (or lobby opening, start, end) of any party with an open finale socket; `alarm()` pushes after `catchUpRaid()` when a party's stage moved. With no finale socket the schedule is exactly what it was, and the object still hibernates between rounds. Also pushed: to a party's other sockets after Fire, Hold, Unhold or a practice start (the actor gets the HTTP answer), and to the party when a socket opens or closes (the "watching" names; an open socket counts as watching).
- **Per-player snapshots, built by the poll route's code.** Each socket gets `raid.liveSnapshot(its own user)`: the seed and other players' private data never leave the server. A frame can be large (all events up to the round), so the client takes up to 1 MB for a finale frame.
- **Polling stays as the fallback and the safety net.** While the socket is live the client drops to a poll every 15 s (plus one look 2.5 s after the next boundary if no push came); a dropped or refused socket brings the 2 s poll back at once. "Newer snapshot wins" covers both paths.
- **Flag `FINALE_LIVE`:** on locally and in staging, **off in production**. Reason: the finale is the one moment a bug is costly, pacing is being changed in parallel, and nobody has watched a finale on the socket inside Discord yet. Turn it on after Misa has watched a practice finale on staging (one line in `wrangler.jsonc` and in the test that pins it).

## 2026-10-22: The live finale plays about three times slower

ID: `2026-10-22-the-live-finale-plays-about-three` · Status: current · Amends: `2026-10-10-live-finale-time-and-length`, `2026-10-11-content-paced-rounds-smooth-effects-and`

Misa: the last finale "was over very quick"; "make it run much slower so people actually have time to react and see what's going on", about 8 minutes, with no pause between rounds.

- **One more pace, not a pause.** The engine's playback durations are now a `Pace` (`packages/engine/src/playback.ts`): `CLASSIC_PACE` is the old numbers, `SLOW_PACE` the live finale's. At the slow pace a plain beat is 2 s (busiest 2.6 s), a boss action is telegraphed for 1.5 s, the "Round N" intro is 1.5 s (at its own speed, Misa 2026-10-23; it was 2.5 s), the tail 4 s, and a round is 20 to 45 s. Effects stay on screen 50% longer (`fxBp`).
- **Measured, not guessed.** On the simulator's finales (the readiness sample: 432 fights) the classic pace gave a median finale of 2:13 and a median round of 12.5 s, which matches "over very quick". At the slow pace a 12-round finale takes 6.2 to 8.3 minutes (median 7.3), a round 28 to 45 s (median 40). A finale that runs into enrage rounds can take up to 3 rounds more.
- **Stored fights keep their pace.** `raid_live.pacing` gets a third value: 2 is content pacing at the slow pace, and every new fight (real and practice) stores it. 0 (fixed rounds) and 1 (classic content pacing) are unchanged, so a fight that is on while this deploys keeps its schedule. No migration: the column exists. The server schedules by `paceOfPacing(pacing)`, the snapshot carries `pacing`, and the client plays the round with the same pace, so the clock and the stage still agree. `round_ms` stores the slow pace's 45 s upper bound.
- **Replays and the dungeon stay at the classic pace.** They have their own speed controls, and nobody needs time to react in a replay.
- **The 5 minute cap of 2026-10-11 is replaced** by this: the longest 12 regular rounds are now 9 minutes.

## 2026-10-20: The raid summary, round two, and the Find components

ID: `2026-10-20-the-raid-summary-round-two-and` · Status: current, amended by `2026-10-20-no-on-tags-anywhere` · Amends: `2026-10-20-the-raid-summary-ships-scoreboard-first`

Misa on the raid summary (quotes are his): "Drop 'damage, share of the raid' from beside the Scoreboard heading." The table has headings now, so the note is gone.

- **Boss moves.** "The 'new at rank 4' ability makes the abilities look ugly since they're different size… drop the info that it's new entirely… If possible, reduce the size of all of these elements." `BossIconList` takes `compact`: small tiles of one size (3.75 rem wide, 4 rem high, label on the type scale, at most two lines), no "New at rank" line, and the popover does not mention it either. **Only the raid summary is compact.** The boss card keeps the line (and its larger tiles): planning a team is where a new move matters, and the tiles there sit in a wide row of their own.
- **One list of rewards.** "Drop the 'finale rewards' and 'festival gear' subheadings. Lump them all into the 'Your rewards' section." The finale and Festival grants are merged (`rewardLoot`) into one list under the resource badges.
- **A blueprint looks like an item.** "I'd like the blueprint reward to have the same look as an item reward. The image could be the 'blueprint style' image of the item itself, the title could be 'Blueprint: Item Name' and it could have the item's tags… and a 'blueprint' help tag." The Workshop already drew a blueprint as the item's own sprite in a plain (common) frame; that image is reused with a dashed outline (`.item-frame.blueprint`). Tags are what the base defines (slot, element or role, set), never a rarity, plus the existing `blueprint` glossary entry (no change to `glossary.json`, no content touched).
- **A creature is the expedition's card.** "If a creature is given as a reward, use the same component as we use when finding creatures on expeditions. No need for the prose that exists now." The picture, name, element, badges and talent of `FindCard` moved to `ui/FindCreature`; `FindCard` is now that card plus the duplicate choice. The Festival creature uses it (`festivalFind` builds it from the grant); the sentence `festivalGrantText` is no longer shown (it stays in `live.ts` for the live loot text). A duplicate Festival creature keeps one short line, "It waits on the Collection tab.", because that is where the player answers it.
- **"Watch Replay" was narrower than it could be.** `wide` insets the button by its ring, "Got it" does not. Both now run the full width of the card (`large`, no inset).

**The bigger ask:** "I'd like to establish these as patterns when finding anything: gear, resources, creatures… The components should live in a place where they're accessible everywhere… and they should be reusable." The Find components live in `src/ui/` (see the table and rule in `ux-patterns.md`): `FindRow` and `FindList` (the box and its list), `FindItem` / `FindItems`, `FindBlueprint`, `FindCreature`, and resources as `CountBadge` with `bare`. They were not written new: `ItemRow` and `GearRows` became `FindItem` and `FindItems`, `FindCard`'s head became `FindCreature`, and `LootList`'s blueprint notes became `FindBlueprint`. **Screens converted:** the raid summary and finale reveal, the Raid tab's results, the trip result (creatures, gear, blueprints, resources), the waiting catches on the Collection tab, the dungeon results, the descend card's banked gear, the map drawer's chest gear and found loot, the Workshop job reveal (a learned blueprint, a known one's quality, what a dismantle gave), and the worn-gear list of the living room's popover (same row, not a find). **Left alone, and why:** the Workshop's crafted-item result (it also shows the item's lines and an upgrade note, so it is an item card, not a compact find: converting it would change what it says); the dismantle's "taken apart" row (items going out, not found); the cost lines and the pack at risk (costs, not rewards, they keep the "?"); the Workshop's blueprint list (the blueprints you own with a Craft button: a list of what you have, not of finds).

Misa on the dungeon results (the picture is a run with one gear piece and a day 7 streak bonus):

- "Gear rewards are centered, not left-aligned." / "If multiple pieces of gear are found, display them side by side and let them wrap. Leave a reasonable gap between gear." / "Consider adding a background color to each gear piece with a small padding so that they read as 'boxes'. Remember that touching a shared component like this should change it everywhere in the app." Done in the shared `FindList` and `FindRow`: a darker box (`--night`) with a line round it and padding, side by side, centred, wrapping with a gap. Everywhere a find shows (trip result, chest, raid, Workshop, a creature's worn list) it now looks like this; the creature card got the same box colour.
- "The random 1 scrap that is listed as a reward under the gear piece should be merged with the rewards above…" **What it was:** the streak bonus's parts. The server pays the bonus apart from the run's own rewards (`rewards.streak` is "not in the amounts above"), and the page drew its parts as a loot list under the gear, with the Bait and Essence only in a sentence. It is not merged into the totals (that would hide that a streak paid it, and the server's two amounts are different sources); it is the next point's section instead.
- "The text says 'Day 7 streak bonus: 1 Essence, 1 Scrap'… tell the user what they got as a reward. Let's make this its own section titled 'N Day Streak Bonus' and show the rewards under it. Prefix the title with the gift icon we use on the streak counter." A section "7 Day Streak Bonus" with the gift glyph before it and the Bait, Essence and parts as count badges (`streakBonus` in `dungeon-playback.ts`); the sentence and the lone parts row are gone.
- "Remove the question mark icons from the resources (scrap, essence, bait)." `CountBadge` has `bare` (tappable for its help, no "?"), on in every reward or find list (`RewardSummary`, the trip result, the descend card, the map drawer's found loot, the job reveal, the streak bonus). The "?" stays on cost and price lines and on the pack at risk. This is the same `bare` the glossary tag already had for item badges and the level tag.
- **Depth track.** "The Gear Drop, bonus essence and Undercroft Opens texts are displayed in the middle of the tracker… they should be on the left, left aligned under 'Depth 7'." The right end's lines are mirrored (icon at the edge) by `.ptrack-unlock`; the rule also hit the current step, which put its lines at the right of its own half, in the middle. Now only the next step mirrors. It is the same `ProgressTrack` as the raid summary's Boss Rank, fixed once.
- **Streak.** "The streak element could also be reworked to just have a 'Streak' title with a question mark title after it with a popover explaining what a streak is. Below the title we'd show the streak tracker and when it resets. Rework the fonts in it too." The row is "Streak ?" (the existing `streak` entry, the section-title size in the pixel font), the days with their gifts, then the reset line in the body font at the small size. The "N days in a row" line is gone (the lit days say it; the screen-reader label still gives the count of the cycle).

## 2026-10-20: The raid summary ships: scoreboard first, with the boss header (A plus B)

ID: `2026-10-20-the-raid-summary-ships-scoreboard-first` · Status: current, amended by `2026-10-20-the-raid-summary-round-two-and`, `2026-10-26-raid-results-show-real-damage-and`

Misa picked the mock-ups of 2026-10-19: "A plus B's boss header". The live finale reveal and the Raid tab's result cards now draw it (`RaidSummary` fetches, `RaidSummaryCard` draws; the workbench page `RaidSummaryCard` shows the five samples). His changes to the mock-up, in his words:

1. "Show all the players in the scoreboard, removing the need for the accordion with all players." Every player is a row, the caller's row marked, and the raid total last. The "All N players" fold is gone.
2. "Give the table component proper headings and turn them on for this view." `ui/DataTable` takes `headings` (and a `label`). With them it is a real `table` (a header row of `th scope="col"`, each row's label a `th scope="row"`), because a `dl` cannot name its columns; without them it is the `dl` it was, so no other table changes. The scoreboard's columns are Player, Damage and "%" ("The last column can be titled just "%"").
3. "Remove the loot pile graphic from the rewards section and just keep the tags for each resource." `RewardSummary` already had `pile={false}`; the summary uses it. Essence and each kind of part are count badges, gear and blueprints are listed under "Finale reward" and "Festival gear", then the Festival creature, the rank sentence and track, and the season pips.
4. "Show the boss attack order and its special moves as clickable icons next to the boss (or under it)." The boss card's icon buttons (`BossIcon`, tapping opens a popover) moved to `BossIcons.tsx` as `BossIconList`; the boss card and the summary both draw it, under the boss's HP bar. The boss comes from the raid view the client already has (`summaryBoss`), **only when the view is of the week the summary is about**: a reveal that outlives the week (read on Monday) shows no icons rather than another boss's moves, and says "The boss falls!" if not even the name is known (the live finale still knows id and name from its own snapshot). Nothing in `packages/game/src/content` or the engine was touched, and the server sends nothing new. If the stats carried the boss id and name, the fallback would not be needed (the same "would need" item as before).
5. "Align the raid report title vertically with the cleared or defeated badge." The title and its badges (Cleared or Not cleared, and "Close one!") sit in one flex line, centred on each other (`.reveal-card > h3`, so every reveal card gets it, and the Results list's `h4`).

- **Dropped on purpose:** the orb animation and the Essence count-up of the old finale reveal, and the "pop in" of the gear (the summary is a calm result card; `RevealStage` and the sequence hook stay for the Workshop job reveal). Variants B, C and D, the podium and "Now" (today's card) and their code are gone; the record of what was considered is the 2026-10-19 entry above. `AfterAction.tsx`, `FinaleGearLoot.tsx` and the old after-action CSS went with them.
- **When the fight stats cannot be had** the card still shows the result badge, the rewards and the buttons, with a quiet line saying so, so a player is never stuck behind a failed request.
- **A card in the Results list** has no "Got it" (it is not dismissable), a plain panel instead of the gold frame, and an `h4` title.

## 2026-10-19: Raid summary mock-ups for Misa to pick, workbench only

ID: `2026-10-19-raid-summary-mock-ups-for-misa` · Status: current

- **Why.** Misa on the after-action card: "lists and lists of bullet points that are incredibly cursed in their alignment"; wanted "a scoreboard or stuff like that, maybe a few highlights" (roadmap item 5). The live screens (the finale reveal and the Raid tab's result cards) are **not changed**; the mock-ups are one workbench page, `RaidSummaryMock` (Loot & reveals), fed by the data the server already sends (`AfterActionStats`, the stage's Essence, gear grant, Festival creature and rank change).
- **Four variants, plus today's card for comparison:** A scoreboard first (ranked table, three highlight cards); B one big moment (boss, how it ended, then a short scoreboard); C your raid first (your place, your numbers, your creatures; the server folded away); D a podium of the top three and a tight list. Rewards show in the same place in all four ("Your rewards": Essence and parts as count badges, gear, blueprints, the Festival creature, rank and season). Raids pay no experience today, so there is no `XpGain` row. The old lists (reactions, abilities, knockouts, counter-move, boss, top creatures) became folded `DataTable`s under one "More numbers".
- **Shared pieces.** `ui/DataTable` rows gain `mine` (the viewer's own row: a lighter band and gold type). `raid-summary-view.ts` works out the scoreboard and the highlights from the stats alone (Hardest hitter, Star creature, The backbone, Favourite reaction, Quick hands, Nobody fell, Final push, Counter-move broken); a highlight only exists when the stats hold what it says. Only the variant Misa picks will be built into the game; the others and their CSS (`workbench/raid-summary-mock.css`) are then removed.
- **Would need new server data:** the biggest single hit, healing or shield absorbed (a real "Clutch save"), who dealt the killing blow, damage taken or saved per player, reactions set up per player, the boss's name and id in the stats (today they come from the raid view), a comparison with last week or a personal best, and per-player (not summed) setup, support and guard credit.

## 2026-10-18: Raid posts are embeds that sum up the raid

ID: `2026-10-18-raid-posts-are-embeds-that-sum` · Status: current · Amends: `2026-10-10-discord-raid-posts`

**Problem.** The raid posts were plain text lists of everything we knew (contribution numbers, Essence, the sky, every first with its catcher), so the news got lost.

**Decision.** Each post is one embed: a headline (the boss retreats, holds firm, is defeated or survives), an HP bar when the boss still stands, up to three columns (top three fighters by medal, the big hit or combo, and the next fight or the top reaction), the boss's portrait as the thumbnail and a "Play Leet Creatures" button that launches the game like the lounge's button (same custom id). The finale adds the rank line, when the next boss comes and the creatures new to the server. Removed: Essence amounts, contribution numbers, the weather (Misa: useful, but not raid news) and catcher names. The reveal keeps the moves and puts the three fight times in columns.

**How.** The formatters return a message (embeds and the button); the queue stores it as JSON in the same `content` column, so no migration is needed, and older rows (plain text) still go out as text. The sender makes the portrait path absolute for the environment (`publicOrigin`: the production or staging site, none locally) and sends embeds without the SUPPRESS_EMBEDS flag. Portraits are drawn from the boss sprites by `apps/activity/scripts/boss-portraits.mts` and committed under `apps/activity/public/discord/bosses/`; a test checks every boss has one. Discord does not render timestamps in footers, so times sit in fields and the description. The reveal's fight times are one line each, "Fri 13:37": the weekday is named in the guild's timezone and the time is a Discord timestamp (each reader's own timezone); Misa found the full date plus the relative time too long.

**Why.** Misa wants the Discord posts to be a pleasure to read: the status at a glance and a few highlights, with the details in the game.

## 2026-10-18: The fight uses the board's rows (issue #29)

ID: `2026-10-18-the-fight-uses-the-board-s` · Status: current

**Problem.** The raid board is a line of `rowLength` slots (three per player, or nine with guests) cut into Front, Middle and Back on that full length. The fight got only the creatures, with empty slots dropped, and the engine cut that shorter line again by `floor(n / 3)`. A player with fewer than three creatures, or a hole in the board, moved creatures across row boundaries, so pincers, sweeps, lances, "beside", Guard cover, the forecast and the replay stage used rows that differed from the board.

**Decision.** The fight input carries the board's positions: `FightInput.board` is `{ length, slots }`, where `length` is the board row's full length and `slots[i]` the board slot of `row[i]` (strictly increasing, each below `length`). `buildPhaseInput` reads it off the board after auto-placement and guests (`sparseBoard`), and the stored input keeps it, so replays read the same positions. The engine builds one shape per fight (`fightRowShape`) and every helper derives from it: zone of creature i is the board formula on the full length applied to its slot (`zoneOfIndex`), its lane is the slot minus its zone's first slot (`laneOfIndex`), "beside" is the creatures whose slot is exactly one left or right in the same zone (a gap breaks adjacency, `zoneNeighbours`), and the lane count is the board's row width (`laneCount`). All accept a plain length (a dense row) or the board (`RowShape`). An invalid board (length below the row, wrong slot count, slots not strictly increasing integers below the length) throws a `RangeError` when the fight starts. The first version of this change carried only row sizes (`zones`, never merged); it could not keep columns, so lances and "beside" still differed from the board. Misa wants the fight to be exactly the board, so positions replaced sizes. The dungeon (a row of three, `neighbours`) is unchanged.

**Old inputs.** An input without `board` is the dense row (creature i in slot i, the `floor(n / 3)` formula), so stored fights and replays replay identically (a test compares an input without a board to the same row with the dense board written out, and the sim's legacy digest is unchanged). The views send `board` to the client when the stored input has it. The stage, the replay and the forecast use it, and the stage grid draws an empty cell where the board has a gap, so it looks like the placement board (rows by lanes).

**Silence by row.** `silence_ends` now has a required `scope`, like the pincer: `rows` silences the leftmost and rightmost living creature of each board row (a row with one creature once, an empty row skipped), `row` is the whole line. Raid bosses (Bramble Bind, Choking Vines) use `rows`; dungeon foes use `row`, so dungeon fights are unchanged. Powers, turns and periods are not retuned (no balance pass). The forecast, the move text, the Discord post, the glossary, the Thornmother lore and the journal page say "each row"; the forecast marks the ends of each row as for the pincer.

## 2026-10-18: Auto-joining creatures are on the board; teammates can move an away player's creatures (issue #29)

ID: `2026-10-18-auto-joining-creatures-are-on-the` · Status: current, amended by `2026-10-26-raids-you-join-by-placing-no`

> **Superseded 2026-10-26** ("Raids: you join by placing; no auto teams"): there are no auto-joining creatures and no away-player assist any more. The board shows only what players placed.

**Problem.** Everyone in the raid fights, but the placement board drew only stored placements. A player who placed fewer than three creatures saw "random" creatures in the fight that were never on the board, and an auto-placed creature could sit where they had meant to put their own.

**Decision 1: the board shows what the fight will build.** One worker function, `buildPartyBoard` (in `raid-resolve.ts`), builds the sparse board: the placements (at most three each), each player's strongest others topped up (`raidTeam`), `autoPlace`, then guests. `buildPhaseInput` makes the fight from it and the raid view draws it, so the two cannot disagree (a test compares them). Each tile carries `auto` (nobody placed it). The client draws auto tiles with a dashed outline and a small "auto" tag, with the owner's colour and initial like any tile. Tapping your own auto tile offers "Place here", which makes it a real placement in the same slot (the normal placement request). Guests are not drawn (their slots look empty, as before). The "n / 3 placed" count counts real placements only.

**Decision 2: away players' creatures can be moved by their party.**

- **Away** means `players.last_seen_at` is before the week's start. The start is `eventTimes(weekId, tz).weekStart`, the same place the schedule comes from, with the guild timezone passed in. `last_seen_at` changes only when a session is created or touched, so a leet credit never counts as being online.
- While a member is away, any other member of the same party may move their joining creatures (auto ones, or ones a teammate placed) to free slots, and swap one joining creature for any other creature they own (the same eligibility as placing your own). It uses the same `PUT /api/raid/placement { creatureId, slot }`; when the creature belongs to another player the server reads the owner from the creature, never from the body.
- The first such move pins that member's whole team (their auto creatures at their current slots) as real placements, then applies the move or swap, so their team is exactly their placements afterwards (the cap of three stays). `raid_placements.placed_by` (migration 32, nullable) records who placed each row: NULL is the owner, a user id is the teammate. Pinned rows count as the teammate's.
- Creatures the owner placed themselves (`placed_by` NULL) can never be moved or swapped by teammates. Once the owner opens the game they are no longer away: teammates cannot touch their creatures, and the teammates' placements stay until the owner changes them (an owner's own move writes NULL). Same lock and phase rules as normal placement.
- Refusals use the existing style: `not_away`, `not_in_party`, `not_movable`, `slot_taken`, `invalid_slot`, `board_full`, `locked`, `not_your_creature` (unknown creature). Another player's creature used to answer `not_your_creature` and now answers `not_away` when its owner is in the party and here.
- The view (`party.away`, tile `movable`, `movedBy`, `creatureId` for movable tiles) tells the client who is away and which tiles the viewer may move. The client shows "<name> is away — teammates can move these." and "<creature> (<owner>) moved by <name>.", lets those tiles be dragged, and offers "Swap for another" in the tile's popover (a picker of the away member's creatures). Names are rendered as text.

**Why.** Misa's call: a player who is not around should not leave the party with a badly placed row, and the party can fix it, but only until the owner is back, and never what the owner chose themselves. Placing onto a slot where a teammate's auto creature is drawn still works server-side as before (the autos are placed again around it); the client refuses that drop.

## 2026-10-16: the raid curve replaces 1.4^rank; every server starts at rank 1

ID: `2026-10-16-the-raid-curve-replaces-1-4` · Status: current · Amends: `2026-10-11-progression-phase-1-rules-content-simulator`

**Decision (Misa's brief).** No rank skipping: a win is income and an achievement. Instead of "each rank is 40% tougher", the raid has a custom curve that we control and do not explain to players: "HP and damage on the raid boss are just some variables we control. Later bosses can vary attack patterns, crits, how many times the boss attacks, which moves the boss uses ... Everything should be based on what we expect from players and their progress." Every week must be winnable ("a full raid team, optimized loadouts, positioning and maybe just good luck"); a server that loses should rearrange and improve; and the first raid week should be clearable fairly easily even by mostly casual players.

**What shipped.**

- **`RULES.raid.curve`**: a table by Boss Rank (1 to 15) with `hpBp` and `atkBp` (independent; they are shares of the boss's own `baseHp` and `baseAtk`, so rank 1 is not 10000), `bossAttacks` (1 to 3) and `critBonusBp` (extra boss crit chance). Above the last row HP grows 5% and Attack 3% a rank (`beyond`). Integer basis points everywhere. `rankFactorBp`, `rankAtkFactorBp`, `bossAttacksAtRank` and the new `bossCritBonusAtRank` / `luckAtRank` / `rankRow` read it; `scaleBoss`, the worker's fight input (so the readiness forecast), the sim and the Boss Rank view all go through them. `rankStepBp`, `atkRankShareBp` and `bossAttacksByRank` are gone. `maxRank` (30) stays as a safety cap. The boss moves that join at ranks 4 and 7 (`fromRank`) are unchanged: measured with them off, the rank-7 set moves a committed server's win rate by about 3 points, so the table, not the moves, carries the difficulty today, and the moves are a content lever for later.
- **Placement is rank 1.** `placementRank` returns `RULES.progression.placement.startRank` (1) whatever the creatures; the level-based rule (`legacyHpPerLevelBp`) is gone. Servers that were placed under the old rule keep their stored rank; the Festival ease (rank - 3) and the season reset still work. The open week is re-declared by `RAID_DIFFICULTY_VERSION` (already 1 on this branch; production has no stored version, so it counts as 0): a server in its first week, not yet resolved, goes to rank 1 and keeps its sign-ups.
- **Shape (docs/balance/log.md B-010).** Rank 1 is a tutorial boss (35% of the calibrated pool, 65% Attack). Ranks 2 to 5 climb steeply while rosters grow fast. From rank 6 the pool is almost flat (power stops growing quickly after week 6) and Attack, boss crit chance (from rank 9) and a second plain attack (from rank 14) carry the difficulty; the rank-gated moves punish setups.
- **Targets** (`curve-*` in `packages/sim/targets.json`, measured on whole 12-week journey servers by `pnpm sim` and `pnpm sim:curve`): first week 85%+ for a casual-heavy server and 90%+ for the default one; ranks 2 to 5 70% to 85% (default) and 95%+ (committed); ranks 6 and up 45% to 65% (default) and 80%+ (committed); the worst rank a committed server reaches in 12 weeks 60%+; Phase 1 cleared 75%+ of default weeks, Phase 2 sometimes (5% to 50%).
- **Old population targets re-based.** The long-run and pity sims now play the default journey server (min-maxer, engaged, regular, drop-in), the population the curve is tuned for; the legacy archetype servers are stronger (everyone opens the game daily). `longrun-win-*` 40% to 60% became 60% to 85%, `longrun-rankup-gap` 2 to 4 weeks became 1 to 2 (a winnable curve raises the rank most weeks), `econ-hard-pity` 15% became 25% (it counts finale wins: at a 75% win rate more players reach ten without a jackpot; the all-win ceiling is about 22%).

**Why not the old step.** At +40% a rank the old ladder was a walkover in weeks 2 to 6 (94% to 100% won, B-009) and then a wall (52% by week 12, 3% at rank 7 for a casual server), and week 1 was a wipe. It had one lever. The curve lets each rank ask for what players can bring that week.

**Open.** Ranks 10 and up are extrapolated from 24 and 36 week simulations, not live data; the presets are guesses until the live report fits them (journey slice 6). Fully casual servers (no engaged player) lose most weeks from rank 2 on (about 45% at ranks 2 to 3), by design: they can still clear week 1, and a server that rearranges, trains and gears climbs.

**Sim.** The balance sim now models the finale reward slot of the merged raid-reward change: a won finale pays each participant a gear piece pre-upgraded by rank or, a quarter of the time, a blueprint they do not know yet (`grantFinaleLoot` calls `rollFinaleReward`).

- **Raid difficulty version 2 (2026-10-16).** Bumped after the custom curve and placement at rank 1, as its rule says, so a week declared under the first re-declare build (version 1, staging only) is re-declared too; production weeks are at 0 and re-declare either way. Accepted from the overnight review: a pre-upgraded raid item refunds some scrap for levels nobody paid for when dismantled (at most about 15 scrap times the rarity multiplier per finale win; scrap is not what limits gear, B-009/progression study); the readiness band can lag one refresh interval after a re-declare (display only).

## 2026-10-15: the raid finale pays a reward slot: gear (pre-upgraded by rank) or a blueprint

ID: `2026-10-15-the-raid-finale-pays-a-reward` · Status: current

**Decision (Misa: "promise a gear drop for everyone in a successful raid ... another option in the same slot could be a blueprint ... if we drop gear, tie its power to boss rank like the Essence").** Every participant of a won finale gets exactly one reward. A quarter of the time (`RULES.gear.drops.finale.blueprintBp` 2,500) it is a blueprint the player does not know yet; otherwise, or when they know every blueprint, it is a gear piece. Rarity follows the same Boss Rank odds for both. Gear arrives upgraded by `min(5, floor((rank - 1) / 2))` levels (`ranksPerUpgrade` 2): +0 at ranks 1-2, +1 at 3-4, up to +5 from rank 11. The boss card says what a win pays and the reveal shows the item with its rarity and "+N".

**Why.** Gear drops are rare elsewhere, so a promised piece makes the finale exciting; blueprints share the slot because scrap-starved players gain more from crafting options than from another common item; and upgrades by rank give high-rank wins power that grows like the Essence does. Pre-upgrading uses the existing level column, so stats, upgrade prices, dismantle value and display needed no new rules; dismantling a pre-upgraded piece refunds part of the scrap its levels would have cost, a small intended bonus that also eases the scrap shortage.

**Details.** The grant key stays `raid:<week>:finale`, so retries pay nothing and old rows (one gear item, no level) still read as +0. If the rolled rarity's blueprints are all known it steps down, then up, before falling back to gear. Festival finales keep the Festival piece next to the slot. The balance sim still rolls a gear piece (it calls `rollFinaleDrop`, which now carries the level); it does not model the blueprint branch yet.

## 2026-10-15: rank-gated boss moves, more boss attacks, and two targeting options that punish setups

ID: `2026-10-15-rank-gated-boss-moves-more-boss` · Status: current

- **Why (Misa).** "Let's not get locked down with a one dimensional difficulty scale. Later bosses can vary attack patterns, crits, how many times the boss attacks, which moves the boss uses (moves that punish certain player setups should absolutely be introduced to the move pool as ranks go higher)." The setup study (B-008) found a Guard beside each payoff costs almost nothing, so greedy rows had little downside. This change builds the mechanisms and the first content; the per-rank curve (how many of them apply at each rank) comes next.
- **`fromRank` on boss gimmicks** (integer from 2, absent is always). `bossAtRank(boss, rank)` in `@creatures/game` keeps the moves whose `fromRank` is reached, in content order, so a move keeps its place and its pattern dice window. The worker builds the week's boss with it wherever a boss is built for a week: the fight input (so the readiness forecast too), the raid view and boss card, the live snapshot and the Discord boss reveal; the sim's raid path calls it in `openRaidWeek`. A stored fight keeps `input.boss` as it was fought, so replays are untouched by later rank or content changes (the worker test replays stored fights after moving the rank). The client's forecast reads the moves the fight was played with from `EventNames.gimmicks` (built from the stored boss), so it never warns of a move that is not in the fight. Dungeon foes, signatures and room modifier moves may not carry `fromRank` (checked at load). The boss move limit went from 4 to 6.
- **`FightInput.bossAttacks`** (1 to 3, absent is 1): the plain attack is made that many times a round, each picking its target when it is made and having its own crit die. The extra crit dice (only with boss crits on) are drawn last in the round and only when the number is above 1, so older fights replay (the replay fixture is untouched). `RULES.raid.scaling.bossAttacksByRank` (read by `bossAttacksAtRank`) is the per-rank table the curve sets; `[1]` today, and the worker puts the field on the input only when it is above 1.
- **Two new targeting options.** (1) A slam can aim `payoff`: the living Payoff with the highest Attack (the strongest creature if none stands). It is an aimed hit, so a Guard in the row takes it: a protected row shrugs it off, a greedy one loses its carry. (2) A sweep row can be `payoffs`: the row with the most living Payoffs (ties front first). The brief suggested `fullest` (the row with the most creatures) for the second, but every row has the same number of slots, so "fullest" would only ever mean "the row with the fewest knock-outs" and would punish nothing a player chose; the Payoff count is what tells a stacked row from a spread one.
- **Eight new moves** (two for each raid boss, from rank 4 and rank 7; the curve may move the ranks). Tidal Colossus: Deepwater Spear (rank 4, a lance down the lane of the strongest creature: a single carry) and Spring Tide (rank 7, a charged sweep of the Payoff row). Cinder Wyrm: Magma Spit (rank 4, a slam on the strongest Payoff: exposed Payoffs) and Eruption (rank 7, a charged sweep of every row: nobody is out of reach, so Guards' cover is what counts). Thornmother: Choking Vines (rank 4, silences both ends for two turns) and Thorn Lash (rank 7, a chain on the strongest creature that jumps three times: a single carry). Storm Sovereign: Static Field (rank 4, a sweep of the Payoff row) and Judgement Bolt (rank 7, a slam on the strongest Payoff). Powers sit in the range of the existing moves; the periods (7, 9, 5, 7, 6, 7, 5, 7 rounds) were chosen so that no boss has more than two damaging moves in any round at ranks 1, 4, 7 and 10 (a content test). Because the existing periods are fixed, a new move fires only once or twice in a 12-round finale; the curve can change that.
- **Open for the curve.** The sim's `fightFor` does not set `bossAttacks` yet (the sim edit here was one call site); when the table goes above 1 it needs `bossAttacksAtRank(week.rank)` there as the worker has.

## 2026-10-15: an open raid week is declared again when the difficulty rules change

ID: `2026-10-15-an-open-raid-week-is-declared` · Status: current

**Decision (Misa: "fine with basically redeclaring the entire raid, assuming the boss stays the same and the roster is unchanged").** The worker has a `RAID_DIFFICULTY_VERSION` (`raid-difficulty.ts`; bump it whenever the rules behind a week's boss numbers change). Each raid week stores the version its Boss Rank was declared with. If a week is still open, no stage of it has resolved and nothing real is live, and its stored version is older than the current one, the guild object declares its numbers again on its next normal path (the alarm or any authenticated request; also right before Phase 1 resolves): rank (the server's placement for its first week, the ladder's rank after) and effective rank, with the current rules. Same boss, week id, sign-ups, board, abilities and choices. It is logged as `raid_week_redeclared`. A week with a resolved stage and every past week are never touched.

**Why.** The boss's HP pool and Attack are not stored until Phase 1 resolves (scaled from the week's rank and the head count at that moment), so they already follow the current rules; only the stored rank could go stale. Week opening and re-declaration share one function (`declareWeekRank`), so they cannot diverge. Weeks from before the column have version 0, so the first deploy with version 1 re-declares the running week.

## 2026-10-15: Misa's answers on the retune: floors, overtime, the Wyrm, and the Guard reworked

ID: `2026-10-15-misa-s-answers-on-the-retune` · Status: current

- **Floors stay at 70% / 15% HP left.** Saturday's fight rarely drives the boss to its 15% floor; that is fine (its damage still counts). The floors decide how much HP the boss brings to Sunday, not how often the finale is won: that is mostly the Boss Rank ladder.
- **Overtime stays as built.** The team acts before the first enrage hit; about one finale in twelve is won in overtime, a clutch moment. Same order as every other round, no special rule.
- **Backdraft stays.** The Cinder Wyrm keeps knocking out the most creatures; that is its character.
- **A Guard takes reflected hits.** A reflected reaction hit on a creature a Guard protects goes to the Guard, like any other hit on one creature (zone in the raid, beside it in the dungeon). Misa: "a guard sitting next to a reaction-triggering creature would take the reflected hit onto itself. I think that is what players would expect." It stays uncapped (the cap is for the boss's own attacks).
- **Two Guards: a roll.** When more than one living Guard could take a hit, a die decides which (drawn at round start, so replays stay exact).
- **Guard armor instead of +30% HP.** With the new rules a Guard has no extra HP and takes less damage from every hit it takes (start 25%, tuned by the sim). Armor is a trait meant to grow with level or gear later; it is read through one function so that is a local change. The lead chose "every hit" over "only hits taken for others" so a Guard stays tough against sweeps it cannot step in front of; the damage armor saves on a hit taken for another creature is credited to the Guard. Stored fights without `rules` keep the +30% HP.
- **Rules written like a card game's.** Misa wants the combat rules defined as precisely as Magic: The Gathering's or Arkham Horror LCG's: what an attack, a hit and damage are, the order one hit resolves in, what triggers what. A rules reference (`docs/design/combat-rules.md`) is written from the engine, and the glossary's role and move entries follow its wording.
- **No single-hit cap (Misa, 2026-10-15).** The cap (a boss hit takes at most 50% of a creature's max HP) is switched off: `RULES.combat.maxHitBp` 0. It was a guard rail against high Boss Rank, where boss Attack is about three times today's at rank 9, but it is invisible to players ("a hit for a million does half your HP") and the Boss Rank ladder already stops a server that keeps losing from climbing. Big hits stay big; a newcomer's level-1 creatures on a veteran server can be flattened, and a Guard visibly saves a friend. The number stays in the fight rules (0 = off) for a possible mutator. If high ranks collapse, the next lever is separate curves for boss HP and boss Attack by rank (Misa), and raid tiers for newcomers later.
- **What a raid should feel like (Misa).** The finale is kill or wipe: the boss dies, the row is wiped, or overtime runs out; creatures that fall stop dealing damage. A greedy row (setters and payoffs packed together, no Guards) should hit harder but die more and swing more; a protected row should survive more. Neither should simply be best: the sim measures both, week by week, and the bands catch broken numbers without flattening the swings.

## 2026-10-15: the raid retune: attack patterns, phase floors and enrage (how it is built)

ID: `2026-10-15-the-raid-retune-attack-patterns-phase` · Status: current · Amends: `2026-10-14-raid-phases-end-at-a-floor`

Misa decided the game feel on 2026-10-14 (`attack-patterns.md` section 7, `raid-ux-2.md` "Raid structure"). These are the technical choices the lead made while building it:

- **The phase floor is the clear threshold.** No new `floorBp` scalar: `RULES.raid.phases[].clearAtLossBp` (now 3000 and 8500, so 70% and 15% of the HP are left) is also the floor. The worker passes it to the fight as `FightInput.bossHpFloor` (`phaseFloorHp`, rounded the same way as the clear threshold so reaching the floor always clears the phase). A hit that reaches the floor counts only down to it, the engine emits `retreat` and the fight ends at once. One number, so "cleared" and "drove it to its floor" can never disagree.
- **Close calls.** A cleared phase can no longer overshoot, so its "spare" is the rounds left over, as the finale's already was.
- **Enrage is one generic move**, not the boss's own patterns at a multiplier: in each enrage round the boss makes its plain attack and then hits every living creature for `powerBp` of its Attack (area hits, so Guard cover and Shield Wall soften it, and the single-hit cap holds). Its gimmicks rest, and a charge is never announced to land in an enrage round. This works for every boss (the Storm Sovereign has no multi-target move), reads in one line ("hits every creature"), and is the same rule in the dungeon's boss room. `RULES.raid.enrage` (3 rounds) and `RULES.dungeon.enrage` (2 rounds, `enabled` switch); the powers are tuned by the simulator.
- **Stored fights keep their rules.** `FightInput.rules` (`coverBp`, `maxHitBp`, `supportFx`), `bossHpFloor` and `enrage` are copied in when a live fight is built (`live-rules.ts`), as `luck` is; absent means the rules before this change, so every stored fight replays unchanged. Pattern dice (40 a round) are drawn after every older die and only for a boss with a pattern op.
- **A slam can aim `left`** (the left-most living creature), for the Slag Tyrant's Anvil Fall in the dungeon ("drops on the left creature"); the design's three aims did not cover it.
- **Landmark bosses** go through the room bosses in content order (depth 7 the first, 14 the second, and round again); other days draw their rooms exactly as before.
- **The retune re-based the raid's sim bands** (B-007 in `docs/balance/log.md`). With floors at 70% / 15% left, a team that reaches the Phase 2 floor wins its finale almost always, so the old bands (Phase 2 cleared 70% to 85% of weeks, finale won 40% to 60%) cannot both hold. The bosses are fitted to a typical finale won about 92% of the time at placement rank (the Boss Rank ladder still pulls a long-running server back to about 55%), Phase 1 cleared about 86% and Phase 2 rarely. Three targets are new: knock-outs 10% to 22% of the row, a Guard worth at least 2 win points, no unfair barrage repeats. Pattern powers and the single-hit cap are as designed.
- **Enrage resolves in the normal order**: creatures act first, then the boss's attack and the enrage hit. So the first enrage round is a free round for the team, and about one Sunday in twelve is won in overtime. Raid enrage `powerBp` 50000 and dungeon 10000; above about 400% the single-hit cap sets the hit, so a wipe takes at least two rounds.

## 2026-10-15: Raid page feedback (phone test): boss card holds only the boss

ID: `2026-10-15-raid-page-feedback-phone-test-boss` · Status: current

**Decision.** From Misa's phone test of the Raid page: (1) an open creature popover closes the moment a drag lifts on the Raid Roster (mouse, and a finger after the hold), the carried creature's own popover included. (2) The picker's effect line leads with a bold "In this slot:" (only when there is an effect, still behind `SHOW_PICKER_EFFECTS`); it now wraps to a second line instead of being cut with an ellipsis, since the lead takes room at 360 px. (3) The boss card keeps only boss information: the player count line is gone (the Roster's board total covers it), this week's HP is the shared `SegmentBar` with compact numbers written on it (`compactCount`; the exact numbers stay in the aria label), and the season pips with "Week N / 5 this season" moved into the "This week" phase timeline at the top of the page. "Best rank cleared" stays on the boss card (it is about the boss's rank ladder; Misa did not ask to move it). (4) At 3 / 3 placed the Roster line shows a green check (the pixel tick, with spoken "Done:") and drops "the rest join automatically"; with fewer it keeps it. (5) A second line under the count reads "7 / 18 on the board": every creature on the party board out of the party's row length.

**Note.** The picker's own status line ("2 / 3 on the board") counts only the player's creatures; the Roster's board total counts everyone's. Both use the same words as Misa asked, so they may need a clearer wording if players mix them up.

## 2026-10-14: The creature picker's effect preview is behind `SHOW_PICKER_EFFECTS`

ID: `2026-10-14-the-creature-picker-s-effect-preview` · Status: current

**Decision.** Each option of the Raid Roster's creature picker shows one quiet line (an ellipsis cuts it) about what the creature would do in the slot being filled, built from the engine's `affects` helper: the first reaction it takes part in ("Steam with Splashet", plus "+N" for more), then "Buffs 2 neighbours" (a Support) and "Covers its row" (a Guard); nothing when it does nothing. The flag is the constant `SHOW_PICKER_EFFECTS` in `apps/activity/src/roster-picker.ts` (on). Misa: "If it crowds the picker I think it's a bad idea, but I do like it and would like to see a version where it's tried."

**How to compare.** The workbench page `RosterPicker` has presets with the effects on and off. Removing the feature is one line (the constant to `false`); the picker keeps working and the lines are not built.

**Limits.** The line uses the same approximations as the board cues: speed is worked out from species and level only (no gear or fusions), so for a boss that acts by speed the reaction shown can differ slightly from the fight. The picker only fills an empty slot, so the line judges the creature standing there with its old slot (if it was on the board) free.

**Touch drag.** A finger picks a creature up after resting on it for 250 ms (`TOUCH_HOLD_MS`); a move before that is a swipe and scrolls the board. The shared drag hook takes it as an option (`touchHoldMs`), so the dungeon team keeps its immediate drag.

## 2026-10-14: A player could have four creatures on the board (bug and repair)

ID: `2026-10-14-a-player-could-have-four-creatures` · Status: current

**What happened.** In production one player had four creatures on the raid board; the most is three. **Cause:** `place` only checked that the creature was in the player's _current effective team_ (the three strongest, or the chosen three). The team changes whenever levels, gear or catches change, but a placement made earlier stayed in `raid_placements` (only `setTeam` cleaned up). So after a creature dropped out of the strongest three while still placed, a creature that had just come in could be placed too: three placed rows plus one stale row made four. The view showed every row of the party without filtering, so all four appeared; the fight builder ignored rows of creatures outside the team, so it never fought with four. Nothing counted placements.

**Fix.** `place` now needs a free place among three for a creature that is not on the board (`board_full`). Placements are capped per player by one deterministic rule, `capPlacements`: first the creatures in the player's team as it stood, then the earliest placed (`rowid`; a move places again), then the lowest slot. The view and the fight builder cap with it, and read only creatures their placing player still owns (defence in depth), and every placement write first deletes a player's stale rows beyond three. Migration 22 (`raid-placement-cap-migration.ts`, no schema change) repairs existing weeks with the same rule, using the player's team as it stood (the chosen team if it still belongs to them, else the automatic one). With the team feature gone (previous entry) there is no team preference left, so the read and write guards cap by earliest placed, then lowest slot; only the migration still prefers the old team, because it runs once on data from before.

**Tests.** A regression test reproduces the level-change sequence and failed before the fix (the fourth was accepted); more cover the cap rule, the capped view and fight, the write-time repair and the migration (including running it twice).

## 2026-10-14: Raid Roster: you bring the creatures you place

ID: `2026-10-14-raid-roster-you-bring-the-creatures` · Status: current, amended by `2026-10-26-raids-you-join-by-placing-no` · Amends: `2026-10-13-ux-pass-1-raid-tab-r1`

**Decision (Misa, 2026-10-14).** The raid placement section is redesigned. A player's raid creatures for the week are **the creatures they placed on the board, at most three** (`RULES.raid.teamSize`). The chosen-team feature is gone: no "Choose team", no "Use automatic team", no tray. At every lock (a phase resolving, and the finale's start) each player's empty places up to three are filled with their strongest unplaced owned creatures (`autoTeam` order: power, then the older creature, then the smaller id) and placed with the existing `autoPlace`. A player who placed nothing gets the full automatic team, as before. Misa explicitly wants the auto-fill with the strongest.

**How.**

- `raidTeam(sql, week, user)` in `raid-teams.ts` replaces `effectiveTeam`: the player's placements (only creatures they still own, at most three by `capPlacements`), then the strongest others, sorted strongest first. The fill is **not stored**; it is worked out again whenever a fight is built (`buildPhaseInput`, so also the live finale and practice fights), so the three are always the strongest at that moment and a level-up between phases is picked up. Placed creatures always fight, wherever they stand.
- Placing: the creature must be owned and the week not locked (the finale has not resolved, as before). A creature already on the board moves; a new one needs a free place among the three, otherwise **409 `board_full`**. This includes dropping a new creature onto the slot of one of your own: it is refused too, for a simple rule (remove one first). The rules for occupied slots and swaps stay.
- `PUT /api/raid/team` stays as a validated no-op (old clients mid-week), as `PUT /api/raid/opt-out` did. The `raid_teams` table is kept, no longer read or written, for a later migration. The `team_set` analytics kind stays in the schema (old rows, the rollup) but is no longer logged. The view keeps `you.team.mode`, always `auto`, for older clients.
- **Party balancing** (the snake draft) keeps using the **automatic** team's power (`playerPower`). Parties are made at week start (and for a late joiner before phase 1), when nobody has placed anything, so the automatic team is also what the player brings then; it does not move with what someone happens to place, and the split stays stable and explainable.
- The client has no tray. The count line says "1 / 3 placed · the rest join automatically when Phase 1 locks", from the view's next event.

**Why.** Misa wants players to place their creatures on the shared board themselves, while the balance still relies on everyone's creatures being placed, including those of less active players. "Place what you like, we fill the rest with your strongest" gives both.

## 2026-10-14: Raid UX pass 2, slices 8 and 9 (placement cues, influence, the shared `affects` helper)

ID: `2026-10-14-raid-ux-pass-2-slices-8` · Status: current

**The shared helper.** `affects(row, index, mode)` in `packages/engine/src/affects.ts` says which slots the creature at `index` affects: `buff` (a Support's neighbours), `cover` (the slots a Guard takes hits for) and `reaction` (partners that set off, or are set off by, a reaction with it). It is built from the engine's own rules: `neighbours` for the dungeon, `zoneNeighbours` for the raid, the Guard's reach as `guardFor` plays it (the dungeon: right beside it; the raid: every other slot of its zone, never another Guard), and `rowReactions` played in the row's acting order (left to right in the dungeon, the boss's turn order in the raid, so `slotReactions` returns slot numbers for a row with other players' creatures and empty slots). Tests compare it with seeded fights (the `support_buff`, `boss_hit` `from` and `reaction` events), so the screen cannot drift from the fight. Speed-order bosses need each creature's speed; the client only knows species and level, so for those bosses the raid cue is a close guess (gear and fusions are not in the view).

**Cues instead of a text line (decided 4).** The reaction hint line under the dungeon slot row (PR #18) is gone. A reaction pair is drawn on the tiles (a ring in the element colours of the mark and of the hit, a badge with the reaction's name from the content) while a creature is dragged over a slot, picked up (tap or key), hovered or focused. A carried creature is previewed where it would stand. "No reaction" is a small mark under the row (and on the row name in the raid). The old sentence is kept as the screen reader's live announcement. In the dungeon the cue shows every reaction of the order; on the raid board it shows those of the creature in focus only (a whole raid row would light up everything).

**Influence (decided 6).** The tiles a Support buffs (dots) and a Guard covers (bars) are shaded for the creature in focus, and a one-line effect with the real numbers (`RULES.combat.supportBuffBp`, `guardHpBp`, the reaction's multiplier) shows in the creature popover and in the strip under the row. It replaces the raid board's old neighbour highlight (`adjacentSlots`).

**Precedence.** (1) Whose cues show, one creature at a time: the carried creature (dragged or picked up), then the creature whose popover is open, then the one under the mouse or the keyboard focus. (2) Where they draw: a reaction cue is a ring and a badge, influence is a shade of the fill, so a tile can carry both and neither hides the other; a drag's valid or refused outline and the gold ring of a selected tile stay as they are.

## 2026-10-14: The raid stage is a lane grid, like the placement board

ID: `2026-10-14-the-raid-stage-is-a-lane` · Status: current · Amends: `2026-10-11-live-stage-as-rows-abilities-on`

**Decision.** The raid fight stage (replay and live finale) draws its party the way the placement board does: Front, Middle and Back are three lines that never wrap, a lane is a column, the row names are a fixed column at the left, and the three lines scroll sideways together in one scroller. Tiles are small (sprite scale 2, 3.25 rem wide, one-line name with an ellipsis) so about four lanes fit on a 360 px phone. Before the fight starts the stage scrolls to the viewer's own creatures; as it plays it follows the creature that acts, and only moves when that creature is not on screen with a tile to spare. The scroll is instant under `prefers-reduced-motion`, and it waits four seconds after the player scrolls by hand. A lane-number row sits above the grid; the lane pips are not used on the stage, because the stage is already tall and the numbers give the same orientation. The dungeon's single row is unchanged (checked pixel for pixel at 360 and 390 px).

**How.** The rows and lanes come from `boardRows`, `placeOf` and `laneStates` in `raid-board.ts` (which use the engine's `ZONES` and `zoneIndices`), plus one new pure helper, `keepSpanInView`. The grid CSS the board and the stage share moved to `components/lane-grid.css`; the stage's own rules are in `stage/stage-grid.css`. The measured tier picking (`STAGE_LAYOUT`) is gone, since nothing wraps any more.

**Known limits.** A reaction burst or a strike beam aimed at a creature outside the window is clipped by the scroller (the beam is drawn to where the creature is). Floating numbers rise less than before, so the scroller does not cut them off. Adjacent lanes owned by the viewer touch.

**Why.** Misa's phone review: with 11 players a zone has 11 creatures, and wrapped boxes hid which creature stands beside which. The same grid on the board and the stage means a lane looks the same in both places.

## 2026-10-14: Raid board tiles, sit-out removal

ID: `2026-10-14-raid-board-tiles-sit-out-removal` · Status: current · Amends: `2026-10-13-ux-pass-1-raid-tab-r1`

**Decisions.**

- **Tile look.** The element colour is the tile's border (the "element ring"). The owner is a one-letter badge in the corner, in the owner's colour (the existing roster-based `owner-0` to `owner-7` palette, with a text colour chosen per owner for contrast). Raid tiles show no slot number; places are written as "Middle, lane 1" everywhere (team cards, screen reader labels, announcements). Names are one line with an ellipsis, never broken mid-word; the full name is in the popover and the aria label.
- **Other players' creatures.** Tapping one (with nothing picked up) opens the creature popover, which carries the owner's full name, instead of only showing "That slot belongs to X".
- **Dragging.** Dragging near the left or right edge of the board scrolls it sideways, so off-screen lanes can be reached; near the top or bottom the page scrolls as before.
- **Sit-out.** Opt-outs are no longer honoured: the roster ignores `raid_opt_outs`, and the client has no button or status line. The route `PUT /api/raid/opt-out` stays for one release as a validating no-op (always answers not opted out) so no client breaks mid-week; the table and route go in a later migration.

**Why.** Misa's review of the raid page on a phone: a grid where lanes line up, compact tiles, and no weekly button that can hurt the party by accident. Dropping the server check at once means nobody who sat a week out with the old button stays stuck out after the button is gone.

## 2026-10-14: Raid UX pass 2, slices 4, 6 and 10 (stage head, glossary, finale row, coach mark)

ID: `2026-10-14-raid-ux-pass-2-slices-4` · Status: current, amended by `2026-10-24-no-acting-order-under-the-creatures`

**Stage head (decided 3).** `ui/StageHead` is the one head of the fight stage, for the dungeon and the raid: the room or phase at the top left ("Room 1 / 3", "Phase 1 / 3") and the round at the top right ("Round 2 / 12"). It replaces the joined "Room 1 / 3 · Round 2 / 2" of PR #18. The finale is the third phase but goes by its own name, "Finale" (`phaseLine` in `raid-text.ts`), as it does on every other screen. The raid stage names the boss under its sprite and writes its HP on the bar (the shared `SegmentBar` `text`), so the head no longer carries "Boss HP x / y".

**Ordinals follow the engine's order in the raid.** Under each creature the stage writes its place in the round on show (`actingSlots` in `stage.ts`). The dungeon always acts left to right, so it is the row order. The raid's orders vary by boss, so it reads the `turn` and `skip` events of that round: the numbers are exactly what the engine did, with no copy of the order rules in the client. A creature with no turn that round (knocked out earlier) has no ordinal. The boss card's turn-order icon stays.

**Raid replay plays by itself.** Pause, 2x and Skip are hidden unless `showControls` is set, as in the dungeon, and the replay starts playing at once (it used to wait for Play). `TurnStrip` is no longer used by any screen; it is kept with its workbench page.

**Glossary popups (slice 6).** Every `raid-week` and `finale` entry has no lines (title, description, the "More" link), and a finale ability's popup is only its own description from the content. Not touched: `crit` (also used by the dungeon, keeps its odds), the marks, reactions, roles and elements (core to every mode) and the Boss Rank, Festival and Season entries (their lines are the rules). The Counter-move's one line now says what it does ("After Phase 1 the boss resists what worked best.") since its numbers left with its lines. A glossary test pins it.

**Boss Rank and season row after a finale.** Under the finale result, `FinaleProgress` draws the Rank as the dungeon's edge-to-edge `ProgressTrack` (the Rank for next week, lit, and the next one with "A tougher boss" and "More Essence", in words) and the season as a `PipRow` with the Festival as the gold-ringed last pip. The Rank shows once the ladder has moved (`rankChange`, null until every party has finished). The season week is known when the finale was a Festival's, or when the raid page is on the same week; otherwise the pips are left out rather than guessed.

**Coach mark (decided 5).** `SHOW_COACH_MARK` in `coach.ts` is off. The Raid tab checks it; nothing else draws the component, and a test pins both. The workbench page still draws it.

## 2026-10-14: Raid neighbours stop at row edges

ID: `2026-10-14-raid-neighbours-stop-at-row-edges` · Status: current

**Decision.** In the raid, "beside" means directly left or right **in the same zone** (Front, Middle or Back, the rows of the board). The last slot of Front is no longer beside the first slot of Middle. The engine has a new `zoneNeighbours(index, length)`; the plain `neighbours()` is kept for the dungeon only. The Support buff uses the zone-aware version in the raid. The client's "who works with this creature" highlight (`adjacentSlots`) uses the same engine helper, so the board cannot drift from the fight.

**Why.** The raid board is now a grid of three rows (Front, Middle, Back) by one lane per player. A grid can only show adjacency honestly if it means "next to me in my row": a tile at the end of one row cannot be drawn beside the first tile of the next. The attack patterns that come next (cover, Slam splash) also depend on "beside" being the same thing the player sees.

**What it touches.** Only the Support buff in the raid. The raid's Guard intercept already worked by zone (`guardReach: 'zone'`), so it is unchanged. The dungeon is a row of three with one slot per zone, so zone-aware adjacency would leave everyone with no neighbours; dungeon fights set `guardReach: 'adjacent'`, which keeps the plain line for both the Support buff and the Guard. A dungeon test (a middle Support still buffs both sides) and the unchanged dungeon fight tests prove it; the dungeon sim section is identical on seed leet2 and differs on leet and leet3 only by run counts shifted by the raid results upstream of it (the dungeon fights themselves are untouched).

**Sim result** (full `pnpm sim`, before and after, seeds leet, leet2, leet3). The raid targets barely move:

- Typical-group finale win: leet 59.7% to 60.3% (limit 40% to 60%, now **fails** by 0.25 points), leet2 51.9% to 52.2%, leet3 52.7% to 52.6%.
- Phase 2 win: leet 82.6% to 82.9%, leet2 78.9% to 79.2%, leet3 81.6% to 81.7%.
- Boss spread: leet 12.5% to 9.8%, leet2 12.2% to 13.2%, leet3 17.7% to 18.1% (already failing before this change on leet3, limit 15%).
- Finale win with 15 players, leet3: 43.1% to 42.6%.

No retune was made; the numbers are handed to the lead. `exp-casual-discovery` also failed before this change on leet (0.34 to 0.32) and leet2 (0.32 to 0.32), so it is unrelated. `pnpm scalars` output is unchanged.

## 2026-10-14: Raid phases end at a floor, and bosses enrage when time runs out

ID: `2026-10-14-raid-phases-end-at-a-floor` · Status: current, amended by `2026-10-15-the-raid-retune-attack-patterns-phase`

**Decision (Misa, 2026-10-14).** Every week has a finale. Each raid phase has an HP floor; when the boss reaches it, it turns immune and the phase ends. Damage past the floor counts for nothing (no overkill), because counting it would be unintuitive; instead the replay and the phase card say clearly why the boss is gone and what happens next, in a per-boss line with a shared fallback. The finale carries 15% of the boss's HP (the Phase 2 floor), which Misa finds "lots to do and it's still exciting". When the finale's rounds run out, the boss enrages: multi-target hits at high damage that wipe a typical row in 2–3 rounds, with a slim chance of a win. Dungeon boss rooms enrage too instead of simply timing out, so players learn the mechanic daily; Misa may walk this back if it plays badly. An enrage loss is a normal loss.

**How.** New scalars `RULES.raid.phases[].floorBp`, `RULES.raid.enrage` and `RULES.dungeon.enrage` (the last can be switched off). Built with the attack patterns as one raid retune, because both change raid lethality and the win band, and enrage uses the multi-target moves. Details: `raid-ux-2.md`, "Raid structure".

## 2026-10-13: UX pass 1, Raid tab (R1 to R6, approved by Misa)

ID: `2026-10-13-ux-pass-1-raid-tab-r1` · Status: current, amended by `2026-10-14-raid-board-tiles-sit-out-removal`, `2026-10-14-raid-roster-you-bring-the-creatures`

The Raid tab is client-only work; the server, the schemas and every rule it enforces are unchanged.

- **Order of the tab:** the week timeline, the boss card, the avatar strip, the one placement step, the "Abilities" chip, then the full results (only after the finale). The separate live banner is gone: in the lobby and while the finale is on, the timeline's action reads "Watch live" and shows the countdown or "The finale is on now" under it. It opens the finale view exactly as the old Join button did.
- **"What to do now" (`raid-now.ts`, pure):** "Set your team" when a team creature has no slot and edits are open (the button scrolls to the placement step and focuses the first creature); otherwise "Phase 1 in 2 h 10 m" or "Finale in 3 h" with the time in the guild's timezone under it; "Watch live" in the finale's lobby and while it runs; "Next boss Monday 13:37" when the week is over (taken from the week start's weekday and time, so a daylight saving change does not shift it); "Join this week's raid" for a player who sat out. "Team set" means every team creature is in a slot: the server places the rest at phase start anyway, so asking is a convenience, not a rule.
- **Phase results as marks (R6):** a fought phase shows a tick or a cross on its timeline step (shape, not only colour). A tap shows one line ("Phase 1: cleared. You got 15 Essence.") and a Watch replay button. The full after-action cards (the Results section) appear only once the finale has a result. Phase 1 and 2 after-action cards are therefore not shown during the week any more; replays of those phases stay reachable from the mark.
- **Boss card (R2, R5):** the art keeps its size (24x24 at scale 4). On wide screens the name, Rank, readiness meter, element, HP and the icons sit beside it; on phones they stack below it. The turn order and each trick are icons with a caption that open a popover: the glossary's panel, but with the boss's own sentence ("Every 3 rounds: hits every creature in the front zone for 80% of its attack") above the glossary's general line. That replaces the "Tricks" list and the "How the boss fights" text. The popover is a small local component in `BossCard.tsx` rather than a new glossary reference type, so the shared glossary code is untouched. The readiness word became a four-step meter next to the Rank (still a word, never a number; its glossary popover is unchanged).
- **One placement step (R3):** "My team" and "The party row" are one card: a short hint, a tray of the three creatures (still dragged, or tapped then tapped, or moved with the keyboard, and dropping a placed creature on the tray unplaces it), then the row. The role legend and the long paragraphs went; the keyboard instructions sit in a small "Keyboard controls" disclosure. The placement logic (`raid-slots`, `raid-dnd`, the drag hook) and the lock during phases are untouched. I did not extract a shared slot component: the Dungeon team picker is built separately.
- **Avatar strip (R3):** "Who is in this week" is up to eight initials in each player's party-row colour with "N players this week"; a tap opens the names as text (with party numbers when there are several). Sitting out and joining again stay on the tab: the button is in the opened list, and a player who sat out always sees "Join this week's raid".
- **Abilities chip (R4):** "Abilities: Auto" when nothing is customised, "Abilities: Shield Wall · 1 manual" otherwise (a picked basic ability, then how many unlocked abilities have Auto fire off). Tapping it opens the same basic-ability pick and Auto fire switches as before, with shorter text.

## 2026-10-11: Content-paced rounds, smooth effects and a boss telegraph **[Misa]**

ID: `2026-10-11-content-paced-rounds-smooth-effects-and` · Status: current, amended by `2026-10-22-the-live-finale-plays-about-three` · Amends: `2026-10-11-slower-readable-fights-a-round-intro`

**Context.** Misa tried the slower stage on staging: more time to see damage and effects was a step in the right direction. His feedback: the round switch text should be 1 to 2 seconds shorter; damage numbers should linger even longer, overlap, and keep floating up so new ones appear below older ones; some numbers, especially on his creatures, were choppy; the idle wait at the end of each round dragged (give effects about 2 seconds, then go straight on); and he could not read when and whom the boss attacks.

**Decision.**

- **Rounds last as long as their content (server-authoritative).** A pure function in the engine, `roundPlaybackMs(roundEvents, options)`, gives a round's length: the intro (1.5 s live, 1 s in replays) + the staggers of every beat but the last visible one + that beat's wind-up + a **2 s tail** after the last effect appears, **clamped to 6..22 s** (12 rounds of 22 s are 4:24, under the 5 minute cap). The beat boundaries and staggers moved from the client into the engine (`beatEnds`, `beatTiming`, `planRounds`), so the client and the server use the same code. A beat's stagger is 500 ms, up to 700 ms for a crit, reaction, ability, knockout, boss gimmick or luck banner; a boss action adds a 600 ms wind-up. Rounds that would pass 22 s squeeze their staggers in proportion.
- **The live schedule is cumulative.** Round 1 starts at `started_at`; round r+1 starts at `start(r) + roundPlaybackMs(events of round r)`. That is sound because of the prefix property (round r's events are fixed once it has started; Fire takes effect from the next round), pinned by tests on the engine and the server. The snapshot sends `roundStarts` and `nextRoundAt`, and the client polls just after `nextRoundAt`. The fight ends at the end of round 12, or of the round the boss falls in, plus its playback (it used to end as the boss-falling round began). The alarm is armed for the end of the schedule computed from the stored fight, and re-armed by every request. Practice fights use the same pacing.
- **Legacy rows.** Migration 15 adds `raid_live.pacing` (default 0). A row stored before it keeps its fixed `round_ms` schedule and its old end rule; new rows store pacing 1 (and `round_ms` 22 000 as an upper bound). The snapshot's `roundMs` is null for new fights.
- **Typical and longest finale.** 3 players (row of 9) about 2:00, 5 players about 2:35, 8 players about 3:35; from 12 players on the rounds hit the 22 s cap and the finale is the longest possible 4:24.
- **Smoother, longer effects.** Damage numbers 2.5 s, crits 3 s, reaction bursts 2.5 s, ability cards 2 s, knockout tags 1.5 s, boss labels 2 s; effects overlap freely. Numbers rise continuously from their spawn point (a newer number on a creature sits below older ones; on the boss the side-by-side lanes stay).
- **The cause of the choppiness.** Floating numbers (and the other effects) used `steps(10)`, `steps(8)` and so on: a 1.3 s number moved in 10 jumps, about 7 changes a second (a crit about 4.5), while the page itself ran at a steady 60 fps (measured in Chromium: 16.7 ms frames, 10 distinct transforms per number). It was not re-rendering or re-keying: numbers are keyed by event index and were not re-created. Now all floats, fades, bursts and pops use smooth easing on `transform` and `opacity` with `will-change`, `steps()` stays only for sprite hops, flashes and shakes, each effect keeps one ref function (no ref churn on every render), and the beams' positions are measured once. Measured after: a number's transform changes on 29 of 30 frames in a 500 ms window.
- **Boss attack telegraph.** For every boss action (normal attack, zone hit, strike on the strongest, silence, reflect): 600 ms of red reticles on exactly the affected creatures (a zone outline for a zone hit) and a leaning boss; then a beam or shockwave, a slash, and a label with the attack's name and area ("Undertow · whole FRONT row", "Lightning Rod · Cindle", "Bramble Bind · both ends"); then the damage numbers and a blocked mark for shielded or guarded creatures. One round ahead the stage shows "Next round: ..." (derived purely from the boss content and the round number, `bossWarnings`), with a warning glyph on the target zone or on the ends of the row; a strike on the strongest creature is worded generically because the stage does not know the creatures' Attack. Reduced motion: static frames, outlines and labels.

**Reasoning.** Pacing by content removes both the dead air after a short round and the cut-off of a crowded one, and keeping it in the engine means the server's clock and the stage cannot drift apart. The wind-up gives players a moment to read who is about to be hit, and the forecast gives them a round to react with Shield Wall.

**Fixtures.** The `live-*`, `action-*` and `practice-*` contract fixtures were edited by script to add `roundStarts` and `nextRoundAt` (and `roundMs: null` in the lobby and none states), not re-captured, because a re-capture would have churned unrelated recorded values. Their `roundMs` of 10 000 and fixed schedule are what a legacy row sends. A new fixture, `live-paced.json`, was captured from the real server (a content-paced fight at round 4). The worker's contract test compares the real output's key sets with all of them.

## 2026-10-11: Slower, readable fights, a round intro and a hidden jackpot **[Misa]**

ID: `2026-10-11-slower-readable-fights-a-round-intro` · Status: current, amended by `2026-10-11-content-paced-rounds-smooth-effects-and`

**Context.** Misa watched the first real live finale in production: "it feels like a speed run; combos and crits just aren't picked up by my eyes". He also asked to keep the jackpot and pity "behind the scenes".

**Decision.**

- **Round intro.** Every live round opens with a big "Round N" (pixel face, "of 12" under it) over the stage for 3 seconds, then the round's creature actions play. Replays show it for 1.5 s (0.9 s at 2x). With reduced motion it is plain text for the same time. It lets taps through, and the first round waits for the countdown's "FIGHT!" to end.
- **Two clocks (`stage-fx.ts`).** The **stagger** (when each beat starts) is 500 ms by default and up to 700 ms for beats with a crit, reaction, ability, knockout or gimmick; it is compressed to fit the round and never goes below 250 ms. The **visible duration** is separate, so effects overlap the next beats: damage numbers 1.3 s, crits 2 s with a bigger "CRITICAL!" pop, reactions 1.5 s as a large burst with the reaction's name and both element colours, knockouts 1 s ("KO!" tag), ability cards 1.5 s (creature name and ability). The beat logic stays pure and tested.
- **Live round budget.** 15 s per round: 3 s intro, the beats, and the last beat's effects end about 1.5 s before the next round (so 10.5 s for beats and effects). Replays keep the visible durations; 2x halves the stagger and shortens the durations by about 30%.
- **Round length 10 s to 15 s** (`LIVE_ROUND_MS`): 12 rounds are 3 minutes, under Misa's 5 minute cap. The live finale and practice use it for fights **started after the change**; a stored `raid_live` row keeps its own `round_ms`, which the snapshot and the clock already read. The client's `DEFAULT_ROUND_MS` (used only to know when the Raid tab stops expecting a result) follows.
- **Jackpot and pity are hidden from players.**
  - Gone from the player-facing surfaces: the loot reveal's jackpot burst and "Jackpot!" / "No jackpot this time (pity N/10)" lines, the chest art, the pity number, the Discord finale post's jackpot lines (and its "First jackpot" record), the Raid tab's "Jackpot:" badge, and the jackpot "first on server" entry in the Collection's list.
  - The jackpot Essence is still paid, with the same mechanics, storage (`jackpot_pity`, the `jackpot` server-first rows, the ledger entry) and idempotency. Players see it only inside one combined Essence figure: the live `loot.essence`, `you.reveal.essence` and the finale's `essence` in the result list now include it.
  - The server no longer sends `pity`, `loot.jackpot`, `you.reveal.jackpot`, `party.results[].jackpot` (the list of display names) or `serverFirsts` entries of kind `jackpot`, and the ledger list leaves out the `jackpot` flag of a raid payout's meta, so none of it can be inspected from a client. Contract tests pin the key sets and check the responses for the words `jackpot` and `pity`.
  - The after-action stats never carried a jackpot line, so there was nothing to remove there.

**Reasoning.** Slow effects and a clear round marker are what let people read a combo; keeping the stagger and the visible duration apart lets rounds stay inside the time budget without making effects flash by. Hiding the jackpot keeps its fun as a surprise inside the total without turning the pity counter into something to game.

**Fixtures.** The contract fixtures of the affected responses were edited to the new server shape by script, and the worker's contract test, which compares the real server output's key sets with them, passes. They were not re-captured from a running server (a capture would have changed unrelated recorded values); their old `roundMs` of 10 000 is legitimate for a fight stored under the old length.

## 2026-10-11: Pre-fight countdown, Auto fire preferences, tap fix **[Misa]**

ID: `2026-10-11-pre-fight-countdown-auto-fire-preferences` · Status: current

**Context.** Misa tried the practice fight on the Discord mobile app: tapping his creatures opened nothing. He also asked for a dramatic countdown before a fight and for Auto fire to be settable before it.

**Decision.**

- **Countdown.** In the last 30 seconds before a live finale or practice fight, a big pixel-font number covers the stage (calm to 11, faster and gold to orange from 10 to 6, red with a stepped shake and a growing number from 5 to 1, then "FIGHT!"). It is computed from the server's `startsAt` and the clock offset and wakes exactly when the number changes (no extra polls). Reduced motion: a still number with colour changes only. The overlay does not take taps.
- **Preview stage in the lobby.** The lobby snapshot now carries the party's row, the names, the boss pool and the caller's own abilities (read-only, same builder as the start). Tapping an ability creature opens the popover with only the Auto fire toggle.
- **Auto fire preferences (migration 14, `raid_autofire`).** `PUT /api/raid/autofire { target, on }`, `target` = `basic` or an own team creature id, allowed until the finale starts (`locked` after). They set the first mode of each ability at the live start, the instant late finale and the practice start (off = `held`). Also settable in the Raid tab's abilities card. Every live ability has `autoFire`; each Raid-view ability preview has `autoFire`.
- **Practice fights** start after a 30 second lobby; Fire before the start is `not_started`. The 10 minute cooldown counts from the request.
- **The mobile tap bug.** Not reproducible by touch in Chromium with fixture data (real touch events, 90 ms holds, taps during beat playback: the popover always opened). The one real gap found: only creatures with an ability were buttons, and abilities unlock at level 10, so on staging a team below it had no tappable creature at all. Own creatures are now always buttons: one without an ability opens a note ("Its ability unlocks at level 10. It is level 4 now.").

**Reasoning.** The server stays authoritative: preferences are validated and only ever read at the start. The lobby preview reuses the start's builder so it cannot drift from the fight.

## 2026-10-11: Live stage as rows, abilities on the creatures, Auto fire toggle **[Misa]**

ID: `2026-10-11-live-stage-as-rows-abilities-on` · Status: current, amended by `2026-10-14-the-raid-stage-is-a-lane` · Amends: `2026-10-11-m5a-live-finale-server-implementation-choices`

**Context.** Misa tried the practice fight on staging: the zones side by side did not fit a phone, names were cut off, and the ability cards under the stage were far from the creatures they belong to. He also asked to replace "Hold" with a clearer control.

**Decision.**

- **Zones are rows**, top to bottom: the boss, then Front (closest to it), Middle, Back. Each row has its label at the left and its creatures centred in slot order, wrapping onto more lines. Nothing scrolls sideways. The largest zone is 15 creatures (a party of 15 players, 45 slots). The sprite size follows the zone size and the measured width (`zone-layout.ts`), so a 15-creature zone uses 2x sprites on three lines at 360 px. The Placement strip in the Raid tab uses the same rows. Drag-and-drop hit-testing already used screen rectangles, so it works unchanged; auto-scroll while dragging now scrolls the page near the top and bottom of the window, and the up and down arrow keys move between lines.
- **Creature abilities are used on the stage.** Your creature with an ability wears a badge and opens a popover when tapped (Fire, Auto fire toggle, the ability's text). The basic ability keeps one panel under the stage. Replays show only "used" marks, and are not interactive.
- **Auto fire replaces Hold.** The popover and the basic panel have a big **Fire** button and an **Auto fire** toggle ("Auto fire, round 7" when on, "Auto fire off, last round" when off). The toggle works both ways until the ability's default round; the last-round safety net stays. New server action `unhold` on `POST /api/raid/live/action` (`not_held` if not held, `hold_too_late` after the default round); `hold` stays as the wire name for auto fire off. The word "Hold" is gone from player-facing text.
- **Names** show in full under the sprite (two lines, then an ellipsis, full name as tooltip). "You" sits above the sprite, a knocked-out creature is a grey sprite with a skull.

**Reasoning.** Rows fit narrow phones and match the order the boss attacks in. Putting each ability on its creature makes the choice obvious, and one toggle is easier to understand than a one-way "Hold".

**Checked, not a bug.** The boss HP the stage shows equals the engine's `bossHpEnd` for whole fights, including practice-style inputs (tests in `stage.test.ts`). The odd "18689 / 18698" in the screenshot came from a dev test fight.

## 2026-10-11: After-action card (implementation choices)

ID: `2026-10-11-after-action-card-implementation-choices` · Status: current, amended by `2026-10-26-raid-results-show-real-damage-and`

**Decision.** Every resolved stage (Phase 1, Phase 2, finale) has an after-action card in the Raid tab results and on the finale loot reveal (the Raid tab one and the one at the end of the live finale), following item 5 of Misa's progression decisions. It states facts and never gives advice. Interpretations:

- **Endpoint, not inline.** `GET /api/raid/stats/:week/:party/:phase` (same path checks as the replay) instead of a `stats` field on `PhaseResultView`. Reasons: the stats need the stored `input` and `result` (hundreds of kilobytes of JSON for a big finale), and `GET /api/raid` is read after every team or placement change; and the reveal can be about an earlier week. The card asks for its numbers when it is shown. `RevealView` gained `party`, so the client can ask for the finale's stats. Nothing is simulated again: the stats are built from the stored fight.
- **Who may read.** Only members of that fight. A missing fight and someone else's fight are the same 404 `not_found`. (The replay route stays open to every guild member, as before.)
- **Privacy.** Players are `displayName` plus a `you` flag (the caller's own name is sent too; the client prints "You"). No user ids, no creature ids at all (not even the caller's), no `m1` keys, no seed. Guests have `owner: null`.
- **Shape.** `outcome` (`cleared` | `missed` | `wiped`; wiped means every creature in the row was knocked out and the stage was not cleared), `close`, `rounds`, `maxRounds`, `boss` (`hpMax`, `hpStart`, `hpEnd`, `leftBp` in basis points of the whole pool, `needed` HP to clear, `lost` HP taken off), `players` (damage, contribution, best damage first), `creatures` (the top 5 plus the caller's own, each with its overall `rank`), `reactions` (per reaction: count and how many were reflected), `abilities` (`used`: whose, which, creature, round, `byDefault`; and `unused`, abilities that never fired because the fight ended first), `knockouts` (creature, species, owner, round), `adaptation` (rule, what it resists, `resistBp`, `purged`, `purgedRound`, `restoredRound`; null in Phase 1, which has none).
- **Damage means credited damage**, as in the existing summaries and Discord posts: the share of a reaction bonus credited to its setter and the support share are in "contribution", not in the hitter's "damage". Top creatures and players are sorted by that damage.
- **The close rule** is `RULES.raid.closeCall` (`missBp` 1000, `spareBp` 1000), integer maths. Not cleared: close when the shortfall is at most 10% of the stage's target. A phase's target is its clear threshold (cumulative HP to take off the pool, as the engine decides `cleared`); the finale's target is the whole pool, so a finale is close when the boss kept at most 10% of its maximum HP. Cleared: a phase is close when it took at most 10% of its threshold off beyond it; a finale win always empties the pool, so its spare is measured in rounds: close when the boss fell with at most 10% of the finale's rounds still to play (rounds 11 and 12 of 12). Phase 2's threshold is cumulative, so Phase 1 damage counts towards it. A wipe-out can be close (a stage the whole party was knocked out in, at 5% of the pool left, is close); the headline then still says "Close one!" and the outcome line says everyone was knocked out.
- **Client.** The headline is "Close one!" when `close`, else "Cleared" or "Not cleared". Bars are `<progress>` elements with classes (no inline styles); the caller's rows are highlighted. Long lists (reactions, abilities, knockouts) show 6 lines and the rest behind "Show all". The result card in the Raid tab no longer repeats the HP bar, reaction count and top three, because the card has them. If the stats cannot be loaded, the card says so and the rest of the result still shows.
- **Advice removed from the replay.** The replay's personal recap used to end with suggestions ("Try a Setter right before a Payoff", "A Guard in the same zone takes hits for it"). That contradicts Misa's rule, so it now prints facts only (`recapNotes`: no reaction set up, N setups overwritten, creature X knocked out in round R).
- **Replay opens from the reveal.** The `Replay` view now takes the week and party it is for (it used to take the current week's view), so a reveal for an earlier week can open its replay too.

**Not done on purpose.** The "one concrete fixable cause" from `progression.md` section 6 (replaying the stored fight with one change) is not built: Misa decided on stats without solutions.

## 2026-10-11: Pinning the raid-post channel from the Activity

ID: `2026-10-11-pinning-the-raid-post-channel-from` · Status: current

**Decision.** A server admin can pin the raid-post channel from the Raid tab ("Raid news" card). Implementation choices:

- **Storage (migration 11).** `guild_meta.announce_channel_pinned` (0 or 1) and `sessions.channel_id`. Every session remembers the channel Discord reported at login (verified, snowflake only; null for sessions made before the migration, which cannot pin until the player reopens the Activity). While the flag is 1, logins do not change `announce_channel_id`; pinning writes the session's channel into it, so `announceChannelId` and the post queue needed no change. Unpinning only clears the flag: the channel stays as it was until the next login, which then updates it as before.
- **Routes.** `POST /api/raid/channel { action: 'pin' | 'unpin' }` (strict; the channel is never in the body) and `GET /api/raid/channel` answering `{ pinned, here, canManage }`. `GET /api/raid` also carries `channel: { pinned, canManage }`, where `canManage` is `null` unless it is in the 60 s cache (no Discord call on a raid read). No answer contains a channel id. Pinning from another channel moves the pin; unpinning is allowed from any channel.
- **Who may.** The guild owner, or a member whose base permissions (the @everyone role, whose id equals the guild id, OR-ed with their roles; BigInt) include Administrator or Manage Server. Checked on the server with the bot token: `GET /guilds/{id}` (owner), then `GET /guilds/{id}/roles` and `GET /guilds/{id}/members/{user}`; the last two only when the user is not the owner. Channel overwrites are ignored (the permissions are server-wide). Each reply is validated with valibot. Same fetch conventions as the other Discord calls (5 s timeout, `redirect: 'manual'`, error kinds only in logs, snowflake-only ids in URLs).
- **Failures.** Any Discord failure (network, timeout, 4xx/5xx/429 on the guild or roles lookup, wrong shape, no bot token configured) is 503 `discord_unavailable` and nothing changes; no permission is 403 `forbidden`. A 404 on the member lookup means the user is not in the guild, which counts as "no permission" (403), not as a failure; a 404 on the guild or roles means the bot is not in the guild, which is our configuration problem (503). A session without a launch channel gets 409 `channel_unknown` when pinning.
- **Cache.** The guild object keeps each player's answer, positive or negative, for 60 s (in memory, at most 200 players, concurrent lookups share one request). A pin or unpin always asks Discord again, so a role that was just granted or removed counts at once. Failures are never cached.
- **Client.** The card is shown only when `GET /api/raid/channel` says `canManage: true`, asked once when the Raid tab opens and silent on errors. Buttons: "Post raid news in this channel" / "Raid news posts here" with "Stop pinning" / "Raid news goes to another channel" with the pin button. In the last state "Stop pinning" is offered too, so an admin does not have to go to the other channel to undo a pin.

**Discord API assumptions.** `GET /guilds/{id}`, `/roles` and `/members/{user}` are plain REST calls with the bot token and need no extra permission for a bot that is in the guild. I believe the single-member lookup does not need the privileged Server Members intent (that restriction is documented for the member list and for Gateway events); this is from memory of the docs and should be confirmed on staging. If it did need the intent, enabling "Server Members Intent" in the Discord developer portal would be the fix. The `permissions` field of a role is a decimal string, parsed with BigInt.

**Reasoning.** Keeping the pin in the existing `announce_channel_id` means the queue and every poster keep working unchanged. Asking Discord on the server (never trusting a client claim) and failing closed when Discord cannot answer keeps the permission check authoritative; the 60 s cache keeps the calls to a few per admin per minute under the per-player rate limit.

## 2026-10-11: Misa's answers after testing M4 and M5 on staging

ID: `2026-10-11-misa-s-answers-after-testing-m4` · Status: current · Amends: `2026-10-10-discord-raid-posts`

- **Reactions** at about half of all damage (balance pass 2): accepted **[Misa]**.
- **Live finale Fire/Hold**: accepted **[Misa]**.
- **Raid post channel:** a fixed channel per server, set by someone with Manage Server **[Misa: a specific channel]**. Plan: a "Post raid news here" button in the Raid tab, shown only to members with Manage Server (or Administrator, or the owner). The permission is checked on the server through Discord's API, and the channel is the one the Activity was launched from (verified, never typed in). Until it is set, posts follow the last launch channel.
- **Creature abilities** (Misa's idea): finale abilities should come from the player's creatures and unlock as they level, so investing in a creature pays off. Proposed defaults, waiting for his OK: each species has its own ability, unlocked at level 10 and stronger after evolving; every creature in the raid team of 3 with an unlocked ability gives one use in the finale; a player with none still gets one basic ability (today's four); absent players' abilities fire at their default rounds.
- **Pity rule:** still open (count lost finales or wins only).
- Production leet points were confirmed correct by Misa.

## 2026-10-11: M5a live finale server (implementation choices)

ID: `2026-10-11-m5a-live-finale-server-implementation-choices` · Status: current, amended by `2026-10-11-live-stage-as-rows-abilities-on`

**Decision.** The server side of the live finale follows `docs/design/m5-finale.md`. Where the spec left room, these are the choices:

- **Storage (migration 10).** `raid_live` holds one fight per (week, party, practice): the frozen input (without abilities), the seed, the members, each member's ability state (`default` | `held` | `fired`, `fireAtRound`, `params`), `started_at`, `round_ms` (10 000) and `rounds`. `raid_abilities` holds the pick per (week, user). `raid_reveal_seen` marks a seen reveal per (user, week). A `raid_live` row is never deleted; for a real finale the `raid_results` finale row is the done marker.
- **The finale event** now starts the live fights, sets the week status to `finale` (so team, placement and the ability pick lock) and is marked done. A live fight counts from the scheduled time if it starts within 30 s of it, otherwise from the moment it started. If the event runs more than 10 minutes late (the object slept through it), nobody can watch: it resolves instantly through `resolveParty`, as in M4, using the players' ability picks. This also keeps a missed finale from running into the next week.
- **End and resolution.** A fight is over when its time is up (`started_at + rounds × round_ms`), or when the rounds shown include the boss falling or everyone knocked out. It resolves through `settleParty` from a live read, from any authenticated request (an unresolved row costs one simulation per request while a fight is live), or from the guild alarm, which is armed for the end of the last round through the existing alarm multiplexing. Jackpot rolls draw from the injected `raidRng` at that moment; the seed draw happens at the start.
- **Fire and Hold.** The error order for Fire is: not in the fight (`not_in_fight`, 409), then `too_late` if the current round is the last or the fight is over, then `already_fired` if the ability has fired or is already scheduled. So in the last round every Fire is `too_late`, and `already_fired` is for earlier presses. Hold: `already_fired` if Fire was pressed; pressing Hold again on a held ability is a no-op; `hold_too_late` from the default round on, in the last round and after the end. Parameters (`zone`, `element`) go with Fire only and only for Shield Wall and Re-mark (`invalid_body`, 400, otherwise). A held ability fires at the start of the last round in the simulation, so the last round is also the last moment a Hold can matter.
- **Snapshot.** `GET /api/raid/live` has the spec's fields. Extras: `names` (the replay's name tables), `row` (the frozen row, as in the replay), `abilities[].defaultRound` and `abilities[].fireAtRound` (the round a pressed Fire takes effect), and `you` is the caller's opaque player key (`m1`, ...) or null. In `none` and `lobby` the fight fields are empty. `done` stays until the week ends. The seed is never in a response; after resolution it is public through the replay as before.
- **Reveal.** `you.reveal` is for the latest finale the player took part in (real finales only) unless marked seen. `POST /api/raid/reveal-seen` answers 404 `not_found` for a week the player did not take part in, so the table only holds rows for real participation. `firstOnServer` is read from `server_firsts` (the jackpot record of that finale's week).
- **Ability pick.** `PUT /api/raid/ability` is allowed while the week is not `finale` and the clock is before the finale time; otherwise 409 `locked`. Unpicked members get the M4 round-robin by position in the party.
- **Practice.** `RAID_PRACTICE` is `"on"` in the staging environment only. A practice fight is visible for 10 minutes (the cooldown) and then disappears; a finished real finale shows again after that. A practice fight is refused (409 `practice_blocked`) from 30 minutes before the finale until that party's finale has resolved, and once per party per 10 minutes (409 `practice_cooldown`). Practice and the real fight have separate rows, and the real fight, while it is going or in its lobby, always takes precedence in the snapshot and in actions.
- **Watching.** The set of players who polled in the last 10 s is kept in memory in the guild object (best effort; lost on restart) and lists display names of the caller's party only.
- **Rate limit.** Unchanged (burst 30, one per second per player). Polling every 2 s is 0.5 requests per second, and a test polls for 200 s without a 429.

**Reasoning.** Keeping `raid_live` as the one source for both the live view and the resolution means the replay is exactly what was watched, and the prefix property (pinned by an engine test) keeps every re-simulation consistent. The instant fallback keeps a long outage from producing a "live" fight nobody can see.

## 2026-10-11: Live finale over short polling first

ID: `2026-10-11-live-finale-over-short-polling-first` · Status: current, amended by `2026-10-22-the-live-finale-is-pushed-over`

**Decision.** The live Sunday finale (M5) runs on the guild Durable Object with the fight's state derived from the clock. The client polls `GET /api/raid/live` every 2 s and acts with `POST /api/raid/live/action`. WebSocket push on the same object comes later, after a staging spike inside real Discord. The fight input and seed are frozen at the start, rounds come from `floor((now - start) / 10 s)`, and every read re-simulates the fight with the abilities known so far. That stays consistent because of the engine's prefix property (rounds 1..r depend only on abilities fired in rounds 1..r), which a test pins down. Present players can **Fire** (takes effect next round) or **Hold** (keep it past the default round; an unused held ability fires in the last round). Everyone else fires at the default round **[Misa: absent players fire at default; Hold rule to confirm]**. Details: `docs/design/m5-finale.md`.

**Reasoning.** Discord documents almost nothing about WebSockets through its Activity proxy (`docs/research/platform.md`). Plain HTTPS already works on every client, and 15 players polling every 2 s is trivial load. Deriving rounds from the clock needs no per-round alarm or broadcast state, survives restarts, and lets polling and a future push channel share one snapshot format. CLAUDE.md's "the live finale uses WebSockets" remains the target, but it is deferred.

## 2026-10-10: Discord raid posts

ID: `2026-10-10-discord-raid-posts` · Status: current, amended by `2026-10-11-misa-s-answers-after-testing-m4`, `2026-10-18-raid-posts-are-embeds-that-sum`

**Decision.**

- The announcement channel is `location.channel_id` from Discord's verified activity-instance answer (never from the client, and only if it is a snowflake). It is stored in `guild_meta.announce_channel_id` and updated on every login, so it is "the channel most recently launched from". Without one, nothing is queued.
- Posts go through a queue table, `discord_posts` (migration 9). A post is queued inside the transaction that commits the raid event (boss reveal at week start; one post per party for each phase), with the unique key `raid:<week>:<event>:<party>` (`raid:<week>:weekStart:all` for the reveal), so it is queued at most once even if an event runs again. Queuing never blocks the raid: errors are caught and logged by type.
- Delivery runs after the transaction: in the background on any authenticated request and on session creation, and from the alarm. The alarm also wakes for the earliest pending post. A post is claimed (attempt counted, leased for 10 minutes) before sending, so two runs never send it twice at the same time; an object that dies mid-send can send it again after the lease. Each message is one `POST /channels/{id}/messages` with a 5 s timeout, `redirect: 'manual'`, `allowed_mentions: { parse: [] }` and `flags: 4` (no embeds). On 429 the post waits `retry_after`; on 5xx or a network error it retries after 1 min, 5 min, 30 min, 2 h; after 5 attempts it is `failed`. 403, 404 and other client errors fail at once. Logs contain error kinds only.
- Message text is built by pure functions (`discord-format.ts`). All player text (display names, nicknames) is cut to 32 code points and markdown-escaped (backslash, asterisk, underscore, tilde, backtick, pipe, greater-than, hash, hyphen, square brackets, parentheses and colon get a backslash), and a zero-width space follows every `@`, so mentions, channel links, emoji and timestamps typed by players stay inert. Messages are cut to 2,000 characters without splitting an escape, a surrogate pair or a timestamp.
- Content: Monday boss reveal (name, element, gimmicks in plain words, turn order, phase times as Discord timestamps, players in); Friday and Saturday per-party summary (cleared or not, boss HP left, top three by contribution, most used reaction, key moment, the flat Essence per player, and after phase 1 the boss's counter-move); Sunday finale result, jackpot hits, and this week's first-on-server records of the party's members.

**Reasoning.** A queue in the same database as the raid state gives exactly-once queuing with the same transaction guarantees as the rest of the game, and keeps the slow, unreliable network call out of every transaction. Escaping plus `allowed_mentions` is defence in depth: the second alone already prevents pings, the first keeps the text clean. The bot needs View Channel and Send Messages in the announcement channel (usually the voice channel's text chat).

## 2026-10-10: M4 raid server (implementation choices)

ID: `2026-10-10-m4-raid-server-implementation-choices` · Status: current

**Decision.**

- The raid calendar is pure functions over `RULES.raid.schedule` (weekday + local time) and the guild timezone (`raid-schedule.ts`). A week id is the ISO week label of the day the week starts (for example `2027-W02`); Monday 00:00–13:36 belongs to the previous week.
- One alarm per guild serves the leet sync and the raid events: it is set to the earliest of the next 13:40 sync and the next not-done raid event, and when it fires it runs everything due in time order. Raid events are idempotent per (week, event) through `raid_events` done markers; missed events run late in order, and events of a week that was never opened are marked skipped. Due events also run on any authenticated request and on session creation.
- Schema migration 7 is the leet-sync `source` column; the raid tables are migration 8 (raid weeks, parties, members, opt-outs, teams, placements, results, event markers, jackpot pity; `server_firsts` is recreated to allow the `jackpot` kind).
- Each party resolves a phase in one transaction: the stored result row is the done marker and Essence has the ledger key `raid:<week>:<party>:<phase>`. The fight seed is 128 live crypto bits stored as hex next to the exact fight input; the engine sees opaque player keys (`m1`, `m2`, ...), so stored inputs and replays contain no user ids. The adaptation (and the HP pool) are kept per party, since each party's phase 1 decides its own.
- Auto team power is `atk + floor(hp / 10)` of the effective stats (`creaturePower` in `@creatures/game`, also used by the simulator). Away creatures still fight.
- M4 finales give every member one default finale ability, round-robin over the content list, firing at its default round. A jackpot pays `RULES.raid.jackpotEssence` and records one shared `jackpot` server first (species `jackpot`) for everyone who hit in the same finale; a lost finale advances the pity counter like a miss.

**Reasoning.** Server-authoritative and race-safe like the rest of the game, with one alarm to re-arm and no duplicated schedulers; replays are exact because input and seed are stored.

## 2026-10-10: Live finale time and length

ID: `2026-10-10-live-finale-time-and-length` · Status: current, amended by `2026-10-22-the-live-finale-plays-about-three`

**Decision.** The Sunday finale starts at 20:00 Europe/Helsinki (default, configurable) **[Misa: accepted default]**. The fight itself is short: **2 minutes by default, never more than 5** **[Misa]**. Length is a boss parameter (a modifier can stretch a boss to the full 5 minutes later, when players are stronger). The server runs fixed-length rounds (about 10 seconds each, so 12 rounds at the default), and the fight ends early if the boss falls. Players who join a few minutes late can still watch the replay and get their loot reveal.

**Reasoning.** An hour-long window is far too long for this game; a short, intense finale is easier to attend together and keeps the single manual ability meaningful.

## 2026-10-10: No raid sign-up; parties of up to 15

ID: `2026-10-10-no-raid-sign-up-parties-of` · Status: current, amended by `2026-10-26-raids-you-join-by-placing-no`

> **Superseded 2026-10-26** ("Raids: you join by placing; no auto teams"): a player is only in the raid once they place a creature, nothing is auto-picked, there is no opt-out and no snake draft. The 15-player party cap stands.

**Decision.** Raids have no sign-up **[Misa]**. Every player with a starter who was active in the last 14 days (opened the game or leeted) is in the week's raid automatically, with an auto-picked team and auto-placement they can change, and can opt out for the week. A raid party holds at most 15 players; bigger rosters are split into balanced parties (snake draft on team power), each fighting the same boss with its own HP pool. Details: `docs/design/m4-raids.md`.

**Reasoning.** Absent players should still count (the server's power doesn't drop), but long-gone players shouldn't inflate the boss or collect loot. A 15-player cap keeps the row readable and coordination possible; the engine itself handles hundreds of creatures in milliseconds, so the cap is about play, not performance.

<!-- Superseded entries below: kept for history, no longer in force. -->

# Superseded

## 2026-10-18: Auto tiles are soft and muted (issue #29)

ID: `2026-10-18-auto-tiles-are-soft-and-muted` · Status: superseded by `2026-10-26-raids-you-join-by-placing-no`

**Decision.** A player may drop their own creature onto a slot that shows another player's auto tile: their creature takes the slot, and the auto creature moves to a free slot by the normal auto rules. Nothing is stored for an auto creature (the board is built at read time), so the server's `place` already allowed this; tests now pin it (auto creature ends in a free slot, nobody is lost, board and fight agree, and with three members of three creatures each the board is exactly full, so a free slot always exists). A creature that was placed stays hard (`slot_taken`). Teammate moves for an away player (`raid-assist.ts`) follow the same rule: another member's auto tile makes room, another member's placed creature is `slot_taken`, and the owner's own placed creature is still `not_movable`. No invariant breaks: the owner's team is pinned first, other members' autos are never stored, and the cap of three per player holds.

**Client.** The drop is no longer refused. While a creature is carried over another player's auto tile the page says "<creature> makes room." (text only), and the drop announcement says the same. Auto tiles are muted so they read as suggestions: the dashed outline and "auto" tag stay, the sprite is faded and half desaturated, and the text uses the quiet text colour (about 6.5:1 on the tile, above AA); hover, focus and a drag over the tile bring the full look back so it never looks disabled. The workbench's "Others join by themselves" toggle shows the same look.
