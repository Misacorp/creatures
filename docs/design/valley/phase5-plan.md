# Phase 5 plan: the base systems, server-side

Status: **current** (lead, 2026-11-05). Phase 4 passed on 2026-11-05 (Q60) and its polish round is merged. The valley and combat v2 ship together at phase 6 with a **reset**; nothing is migrated (decision `2026-10-31-valley-the-reset-replaces-the-migration`). So phase 5 builds only the final systems: no bridges from today's economy and no throwaway steps (Q57). Decided with Misa (round 28): the month runs on his staging server (Q61: A); no keeper at launch (Q62: A); dungeon passes and the fair after phase 5 (Q63: A).

## The gate

From `roadmap.md`: **a staging server runs a simulated month, and the lab and the live numbers agree within a margin.** The checklist is at the end.

## 1. Scope

### Built in phase 5

| System                            | Rules doc (status)                                                        | Phase 5 builds                                |
| --------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------- |
| Posts and the one lazy pass       | `systems/posts.md` (core rules decided, rounds 1–7)                       | V-POST-1 to 5, 7 to 14                        |
| The bonfire                       | `systems/bonfire.md` (decided, rounds 4–6)                                | V-BON-1 to 4, 7, 9                            |
| Scouts                            | `systems/scouts.md` (proposed; lab-tuned)                                 | V-SCOUT-1 to 12                               |
| The Forge loop and gear storage   | `systems/forge.md` (decided, rounds 9–10, 18), `gear.md` (V-GEAR-3 to 12) | V-FORGE-1 to 11 (the broker with the Market)  |
| The return Gazette on real output | `systems/return.md` (V-RET-0, 4a)                                         | V-RET-0, 2 to 9                               |
| The commons                       | `systems/commons.md` (decided, round 12)                                  | V-COM-1 to 8, 10 to 15                        |
| The Market and the broker         | `forge.md` V-FORGE-11, `commons.md` V-COM-15 (Q48)                        | the second guided project and the broker seat |
| The visitor                       | `systems/visitor.md` (Q43, Q44)                                           | V-VIS-1 to 5                                  |
| The School                        | `systems/school.md` (round 22)                                            | V-SCH-10 to 13, 15                            |
| Trials as honours                 | `systems/trials.md` (accepted)                                            | V-TRIAL-1 to 5, graduation at the School      |

### Left for later

- **V-SCH-14** (a player's own teacher): "later" in Misa's own words.
- **The Paddock's keeper:** no output in the docs or the lab (Q62).
- **Not modelled by the lab, so outside the gate, but before phase 6 (Q63):** dungeon passes (Q7) and the weekly fair (Q8). The lab assumes passes; the bots' stand-in fights apply that assumption. The art-led dungeon entrance (Misa, via the combat session) goes with them.
- **Later still:** scrap uses (deferred) and the idol (lab placeholder; it matters after week 13).
- **Combat v2's rules.** The valley only hooks into its events.
- **The Paddock's pick-up polish** (`phase4-plan.md`, "Later").

### What it replaces (with the flag on)

- **Trips, slots, recall, claims, supplies, explorer ranks and familiarity** become scouts, seats, kit and scouting mastery; `/api/expeditions*` answers 404.
- **Workshop jobs, the Crafting skill, refine and recycle as jobs** become anvils, orders, tinkering and smithing mastery; the job routes answer 404. Blueprints, quality marks, Reach and dismantling stay.
- **Lounge XP** (`lounger.ts`, `lounge-company.ts`, the 60-a-day cap), treats and the ribbon gates go; the bonfire's idle XP takes over. The Discord lounge message stays (scrap list).
- **The daily allowance claim** becomes an allowance that builds up idly; leets still pay the same currency.
- **Catching from trip claims** becomes scout finds at the Paddock gate; `pending_catches` gains an auto-answer time (V-SCOUT-3, "after a day").
- **The Gazette's data** comes from the lazy pass's events; `away_rewards` stays for the leet, raid and Games payouts (V-RET-8).
- **Trip and job DMs** go quiet.

**Bait to Acorns** is a display rename at the reset, one command (`pnpm resources rename bait Acorns`); the internal id `bait` and the ledger never change. Staging says "Bait" until then.

### What the reset frees

- **No converters:** new tables are shaped for the valley from scratch.
- **No dual writes:** old tables sit unread under the flag; one cleanup migration drops them at phase 6 with the flag-off code paths.
- **Every server starts at level 1 on day 0** with the guided start, as the lab does, so the comparison is fair.
- **Staging can be wiped at will** (step 0's tool), which is the first half of phase 6's reset.
- **Numbers can be retuned between steps freely**, and the item level ladder (to about 100) starts fresh.

## 2. Order of steps

Each step ends on staging behind the flag, on a freshly wiped valley, with something Misa can try. Migrations start at **version 56**; the lead assigns each step's numbers; new tables are additive, so production runs them empty with the flag off.

Every step: **pricing** (a case in `read-budget.test.ts`, statements in `query-plan-audit.test.ts`, the flag-on `read-day.test.ts` grown with the step, rows written priced too) and **tests** (rules in `packages/game`; worker tests: settling twice at the same `now` changes nothing, every spend keyed through `runKeyed`, flag off answers 404 before reading the body; API contracts; components; the valley e2e walk; `fixtures:capture`).

### Step 0: Foundations (the clean valley)

- The `VALLEY_SYSTEMS` flag (section 3).
- The lab's accepted numbers from `packages/econ/src/rules.ts` move into schema-validated data in `@creatures/game` (`packages/game/src/valley/`) with the pure formulas (`awayShare`, `catchUpMultiplier`, hearth, mastery steps); `@creatures/econ` reads them as its defaults and the tuner's dials override them. **One source of numbers.**
- Dev tool `valley-fresh` (staging only): wipes the guild's player progress and opens a day-0 valley.
- The lazy-pass skeleton: a pure `settle(state, from, to, events)` that splits time only where something changes (V-POST-14).
- Lab: a `compare` command that reads a live report and prints agree or disagree per metric.

### Step 1: Resting and the lazy pass

- Migration 56: `valley_players` (settled_at, last_visit_at, hearth_at_visit, allowance store, fractional carry) and `valley_creatures` (seat_id, catch-up multiplier in basis points, XP carry; index `(user_id)`).
- Settling runs inside `/api/state` and before any intent that changes an input, never when looking at another player's valley.
- Every creature earns idle XP with the away steps (V-BON-1, V-POST-3, V-POST-10); the allowance builds up in a store (V-POST-5); lounge XP, treats and ribbon gates are off. Expected values with a fractional carry, as the lab.
- Client: the Bonfire opens; resting creatures sit by the fire with a "+N" (V-BON-3); the tray shows each creature's state.
- Pricing: a settle reads the player row plus N creatures and writes as many.
- Lab: `valley-parity.test.ts` replays a lab schedule, seeded, and matches XP a day for daily, weekend-off and weekly patterns.

### Step 2: Scouts

- `valley_seats` (place, kind, destination_id, creature_id, kit_id, store, deep, communal; indexes `(user_id)`, `(creature_id)`) and `valley_kit`.
- Seats at rising prices (V-POST-2), fit (V-POST-4), mastery hours (V-POST-12, V-SCOUT-7), kit (V-SCOUT-5); finds by place profile (V-SCOUT-2): scrap and shards as expected values, creatures, gear, blueprints and pages as live `crypto` draws per stretch; V-SCOUT-4, 8, 10, 11, 12; newcomers at the gate, duplicates auto-answered after a day (V-SCOUT-3); the starter's first scout finds something for sure. Routes: `POST /api/valley/seat`, `/seat/buy`, `/kit`.
- Client: the Signpost's scene replaces today's Expeditions page (destinations, scouts at their seats, piles growing, kit); dragging from the tray previews the fit; each place shows its numbers (V-RET-9).
- Lab: finds per scout-day by profile, kinds owned by day 28, a weekly player's finds at about 41% of a daily player's.

### Step 3: The Forge loop

- `forge_orders` (seat_id, position, blueprint_id, element, count, made, reach, for_team).
- Anvils are seats; orders, "for my team", tinkering (V-FORGE-1, 2); the shelf and shard waits (V-FORGE-3, 4); the floor store (V-FORGE-5); pieces at the fire's level (V-FORGE-7); loupe and tongs (V-FORGE-8); quality marks (V-FORGE-9); the exchange tap (V-FORGE-10). The bag holds 200, worn items don't count (V-GEAR-6), as a stored counter. Lead's call to record: a full bag holds pieces on the floor; a full floor pauses the anvil (F-1).
- Client: the Forge's scene replaces the Workshop's job slots; batches come home best first (V-GEAR-4); the bag gets filter, sort and bulk dismantle (V-GEAR-7).
- Lab: pieces a day per anvil (about 1.5); T-4's tinkering share.

### Step 4: The Gazette on real output

- The lazy pass returns notable events (V-POST-14), ranked with the highlight ranking the prototype and the lab share; `valley_gazette` keeps the last paper so a reload replays it; at most one decision (V-RET-3), with push on (V-SCOUT-6) built here.
- Client: `valley/gazette/` swaps its data source.
- Lab: the same kinds of headline as the lab's journeys.

### Step 5: The bonfire in full, and fights

- Catch-up (V-BON-2), fixed at each visit, toward the higher of the player's 3rd best and the server's middle (written once a game day to a `valley_server` row by `maintain`); small moments (V-BON-9); who is online (V-BON-4); a raider's post pauses from the lock to the finale (V-POST-7).
- Lab: T-1 and T-2, with stand-in fights paying the lab's inputs.

### Step 6: The commons

- `valley_places`, `valley_gifts`, `valley_collections`, `valley_fire_log`. Projects sized by active weight (V-COM-5); keyed gifts; three build days from timestamps; the guided start opens with the hearth (V-COM-15); max level then cosmetic (V-COM-11); the plaque, your private part and the keepsake (V-COM-2, 3); place levels bound seats (V-COM-10); communal seats credited at the contributor's visit (V-POST-13, V-COM-14); keystones (V-SCOUT-9), collections (V-COM-12); the fire warms (V-COM-13); the hearth raises idle XP (V-BON-7).
- Client: project boards and scaffolding in each scene (V-COM-6), the fire, the collection board, the bonfire by level, the keepsake in the House.
- Lab: T-3 (the first level-up about day 7 on a server of 8), communal seats' share, the fire by day 28.

### Step 7: The Market

- The second guided project and the broker seat (V-FORGE-11). The Market opens from "not yet open".
- Lab: shard waits fall once built.

### Step 8: The visitor

- `visitor_weeks`, `visitor_rerolls`; Thursday 00:00 to the end of Sunday (V-VIS-1); his arrival posted through `discord_posts`; rerolls with combat v2's line roller, the price x1.5 a reroll within the week (V-VIS-2 to 4); stock per player (V-VIS-5).

### Step 9: The School and honours

- `school_weeks`, `school_students`, `creature_trials`. The teacher picked weekly by the band rule (priced as a weekly cost) and announced (V-SCH-11, 12); lessons by morning (V-SCH-13); learning on the card (V-SCH-10); trial ticks as they happen, graduation a lazy daily moment (V-TRIAL-4).
- Lab: the teacher benefits 22–39% of visits by player kind and gives 7–9% of talents.

### Step 10: Bots and the simulated month

- Dev only: `valley-bots` (guests with the lab's profiles), `valley-sim-day` (the dev clock one game day on; each bot's due visit runs the real settle and the intents its policy picks; policies ported from `packages/econ/src/policy.ts` as one pure module the lab and the bots share), `valley-report` (lab-shaped metrics plus rows read and written).
- `apps/worker/scripts/valley-month.mjs`: 28 day calls, then `pnpm --filter @creatures/econ compare` on the same scenario.
- **Built (2026-11-06)**, with a local dry run (`log.md`); the month on staging and the gate's boxes wait for Misa's go.

## 3. Flags

- **One new server flag, `VALLEY_SYSTEMS=on`**, reported as `valleySystems`; staging only until phase 6 (a `wrangler.jsonc` change to call out in the PR).
- **It needs `VALLEY` and `COMBAT_V2` on**; otherwise the worker treats it as off and logs a config error (tested).
- **Systems are not flagged one by one:** they interlock, and Q57 rules out half-states. A system not yet built leaves its place "not yet open" (Q58).
- **At phase 6 all three flags go**, with every flag-off code path.

## 4. Risks and open points

For the lead (technical; recorded in the `valley` decisions as they are settled):

1. **Staging shares the account's read quota with production.** A bot month runs in about an hour, so it lands on one real day: estimated about 45k rows, well inside the limit; measured on step 1's settle before step 10.
2. **Rows written** have their own allowance: add a written-rows meter and a write budget to `read-day.test.ts`.
3. **Agreement margin:** an expected-value quantity within ±10% of the lab's median; a drawn quantity inside the lab's 10th–90th percentile over 20 seeds (a miss reruns the month once).
4. **CPU per request:** a day call does a whole game day; a slow settle shows there first.
5. **Combat v2 seams before step 3:** the item level ladder and pip thresholds (V-GEAR-8, 11, 12); the line roller (step 8); the first-kill hook (step 6); the raid lock (step 5).
6. **PRs to main every few steps** with the flag off, so migrations land empty and conflicts stay small.
7. **Building on "proposed" docs:** build to the rule IDs as decided; a rule that is wrong on staging goes to Misa as a question.

For Misa: answered in round 28 (Q61 to Q63). He is "eager to get this rework out into the wild. Or at least merged into main": open a PR to main of the branch (flags off in production) when he asks.

## 5. Gate checklist

- [ ] Steps 0–9 on staging under `VALLEY_SYSTEMS` (with `VALLEY` and `COMBAT_V2`); every system doc above marked **built** for its phase 5 rules.
- [ ] With the flag on, trips, Workshop jobs, lounge XP, treats and ribbon gates are unreachable (404); with it off the game and the flag-off `read-day.test.ts` total are unchanged.
- [ ] Read budget, query plan audit and day-in-the-life green with the flag on, with a write budget alongside.
- [ ] `valley-parity.test.ts` green in CI.
- [ ] `valley-month.mjs` on staging: 28 game days, bots on a fresh valley; `econ compare` agrees within the margin per profile (creature levels at days 7, 14 and 28; kinds owned; scrap, shards and Acorns in and out; pieces made; tinkering share; the first level-up day and place levels at day 28; the fire; collections and keystones; the teacher's reach).
- [ ] Rows read and written for the month within the daily limits.
- [ ] Misa plays the month's valley on staging and says it holds together.
- [ ] Decisions, `docs/progress.md`, `roadmap.md` and `log.md` updated.
