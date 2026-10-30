# Design decisions

This folder holds the project's design decisions, one file per topic. Read this index first, then only the topic file or files your work touches.

## How to use it

Look things up:

- `pnpm decisions list --topic <topic>` lists a topic's current entries.
- `pnpm decisions search <regex>` searches titles and bodies.
- `pnpm decisions show <id or heading text>` prints whole entries.

Record a decision:

- Run `pnpm decisions new --topic <topic> --title "..." [--supersedes id] [--amends id] [--misa]`, then write the body (`**Decision.**` and `**Reasoning.**`).
- Or write a `## YYYY-MM-DD: Title` entry by hand at the top of the topic file and run `pnpm decisions fix`.
- `fix` sorts the entries, fills in IDs, derives statuses and rewrites this index. CI runs `pnpm decisions check`.
- Game-feel decisions confirmed by Misa carry **[Misa]** in the title.

The old `docs/design/decisions.md` is now a stub. A branch that still has entries there runs `pnpm decisions migrate`.

## Direction and process

[direction.md](direction.md): Roadmap calls, Misa's standing direction, naming and tone, content policy, how agents and Misa work.

- 2026-10-30 Decisions live in topic files, kept in step by pnpm decisions
- 2026-10-28 Content changes are not held back by existing rolls; modifiers, luck and fading debuffs
- 2026-10-18 Part 2 meets the dungeon paths (merging main #32 into #35)
- 2026-10-16 Misa's answers to the review page's last questions
- 2026-10-16 roll out fast, balance at the end; slot ladder, golden talents, the weather calendar
- 2026-10-16 Misa's second round on the revamps: weighted slot pools, training by activity, Boons and Omens (amended)
- 2026-10-16 Misa's answers to the systems review (they replace parts of its proposals) (amended)
- 2026-10-16 Misa's direction after the raid retune: supplies now, a systems review, then gear and creature revamps
- 2026-10-13 Compendium contradictions resolved
- 2026-10-13 Expeditions v2 merged into the daily dungeon branch
- 2026-10-13 Roadmap reorder, crafting direction, production may change freely (Misa)
- 2026-10-13 Roadmap after M6 (Misa) (amended)
- 2026-10-10 Game rules from the research review (amended)
- 2026-10-10 Name and tone

## Platform, data and tooling

[platform.md](platform.md): Hosting, Durable Objects, scheduling, CI and deploys, staging, dependencies, security, database reads, data cleanup, analytics, dev tools, the workbench, player feedback, sockets.

- 2026-10-29 CI skips the build and tests for documentation-only PRs
- 2026-10-27 A generated wiki page of the game's configuration
- 2026-10-26 A query plan audit and a day-in-the-life read budget
- 2026-10-26 What the rows_read week taught us (standing principles)
- 2026-10-25 Old game data is deleted once nobody can use it
- 2026-10-25 The raid view stores its readiness bands and teammates' teams (migration 45)
- 2026-10-25 Indexes for a player's recent trips and worn gear (migration 44)
- 2026-10-25 Lounge reads: one-row lounger, XP over the socket
- 2026-10-25 A read budget test and rows read in the ops report
- 2026-10-25 The start-up passes run once per deployed build
- 2026-10-24 Faster lint, a staging check, check:changed and other fixes from the retro
- 2026-10-23 Games migration renumbered to 39
- 2026-10-23 The alarm's cleanup runs once a game day; old dungeon steps are deleted (amended)
- 2026-10-19 Preact 11.0.1; the Workers test plugin stays at 1.4.0
- 2026-10-19 Frontend splits with no visual change (audit F15, F16; Misa approved)
- 2026-10-19 Lantern Cap can drop, mystery line goes away, worker files split (wave 2, worker)
- 2026-10-19 Overnight cleanup after #32 and #35 (the lead's calls)
- 2026-10-18 `pnpm fixtures:capture` and stable fixture ids (roadmap polish item 10)
- 2026-10-17 staging held the first gear v2; rows of that shape are normalised at start, views skip what they cannot read (amended)
- 2026-10-16 Player feedback through `/feedback`, public issues, private screenshots
- 2026-10-15 Staging deploys only on request; main locked against agents
- 2026-10-14 A home-grown component workbench on staging
- 2026-10-13 Cleanup 1: one keyed-action helper and the key namespace rule
- 2026-10-13 Analytics security review fixes
- 2026-10-13 Dev tools: the client panel
- 2026-10-13 Live analysis and live-calibrated sim (`pnpm analyze`, `pnpm sim:live`)
- 2026-10-13 Dev tools: the gate, the dev clock and where forced state lives (amended)
- 2026-10-13 Analytics phase 2, server side: rollups, guild directory, ops report (amended)
- 2026-10-13 The game day resets at 13:37, not midnight
- 2026-10-13 Analytics event log (step 1 of `design/analytics.md`)
- 2026-10-10 Per-guild timezone
- 2026-10-10 Alarm safety net without cron (for now)
- 2026-10-10 Validation library
- 2026-10-10 Frontend stack
- 2026-10-10 Staging environment (amended)
- 2026-10-10 Scheduling in Helsinki time (amended)
- 2026-10-10 One Durable Object per Discord server
- 2026-10-10 Hosting on Cloudflare, all-in

## Economy and rewards

[economy.md](economy.md): Leet points, Bait, the ledger and spending, economy targets, rewards that cut across features.

- 2026-10-20 Raids harder for the tick economy; steeper fusion; early gear at a lower level
- 2026-10-20 Economy targets, tested exactly
- 2026-10-15 the Bait allowance and leet bonus ship
- 2026-10-15 a player journey simulator, and the planned Bait allowance (amended)
- 2026-10-13 Combined balance pass (gear, dungeon and expeditions v2 together) (amended)
- 2026-10-10 Leet points table (amended)
- 2026-10-10 Leet sync status visible to players
- 2026-10-10 Real leet points
- 2026-10-10 Ledger and spending
- 2026-10-10 Leet points to Bait conversion (amended)

## Creatures and progression

[creatures.md](creatures.md): Catching, pity, species, evolutions, levels and XP, training, talents and the Talent Book, fusion, ribbons, creature lore.

- 2026-10-28 Ribbons and medals on the creature card
- 2026-10-26 A private note per creature
- 2026-10-25 Evolution short of Essence shows on the creature page
- 2026-10-20 Fusion goes up in points, slowly at the top (amended)
- 2026-10-19 Every evolve goes through the evolve screen; a data table panel (wave 7)
- 2026-10-19 Every XP multiplier multiplies, and one rule in `xp-boost.ts` pays and explains every gain
- 2026-10-18 Second forms for the six other evolving lines: every line grows two ways (amended)
- 2026-10-18 Branch evolutions built: Sunfawn and Ohmouse, Keep is live (amended)
- 2026-10-17 creature page v3 is the live page; rarity colours and creature rarity borders (amended)
- 2026-10-17 creature page v3 (design round, workbench only): slots, bottom drawer, no forward-looking text
- 2026-10-17 the creature page replaces "More"; text pass on Creatures, gear and Workshop (amended)
- 2026-10-17 the creature card is small, "More" holds the rest, and the Creatures tab has find and filter (amended)
- 2026-10-17 creature levels halved at the switch to training by activity, Bait refunded
- 2026-10-17 new-species pity: after 60 dry rolls a species the player lacks; a creature at least every 10 rolls
- 2026-10-17 Creatures B built: training by activity, treats, ribbons (migration 30)
- 2026-10-16 Creatures A built: talents, the duplicate choice, the Talent Book, lures and fewer catches (migration 28) (amended)
- 2026-10-16 fewer organic catches and Bait-crafted lures; treats as a checkbox; no catch-up bonus; lean UI
- 2026-10-11 Creature lore, visual briefs, traits and personality quirks
- 2026-10-11 Ladder feel accepted (Misa)
- 2026-10-11 Progression, phase 2 (worker and client) (amended)
- 2026-10-11 Progression, phase 1 (rules, content, simulator) (amended)
- 2026-10-11 Progression decisions (Misa) (amended)
- 2026-10-10 M2 collection on the server (implementation choices) (amended)

## Combat engine and balance

[combat.md](combat.md): The shared combat engine, abilities, statuses, elements, the balance simulator, balance passes, and combat v2 in the lab.

- 2026-10-30 Luck is a build: crit builds, crit charges, boss crits and evasion \[Misa\]
- 2026-10-30 How the boss track is tuned: welcome boss, tool by card strength, a 60% first-weekend aim (amended)
- 2026-10-30 The boss track is tuned against a roster profile the valley will supply (amended)
- 2026-10-30 The combat lab runs on every core, with a speed budget
- 2026-10-29 The lab's raid roster levels follow Boss Rank
- 2026-10-29 Measure HP removed; rule cards ask before they require
- 2026-10-29 Raid tuning aims at success tiers and robustness (amended)
- 2026-10-29 Opt-in harder raids belong to the endgame
- 2026-10-29 Combat v2 balance pass against the real bosses
- 2026-10-29 Raid losses: mixed servers should feel them; measure HP left
- 2026-10-29 Combat v2 raid boss HP grows with the number of players (amended)
- 2026-10-28 Announced random attacks; dungeon clear target; the camp stays
- 2026-10-28 A well-prepared raid team should usually win
- 2026-10-28 Combat v2 content direction: raids hyper-focused, dungeons all-round
- 2026-10-28 Random talent rolls stay situational
- 2026-10-28 Talent strength is a share of the team's result
- 2026-10-28 How strong a talent should be (amended)
- 2026-10-28 Armour per species; talents go into the line's book automatically
- 2026-10-28 Armour works for every creature; the first talent batch is in the lab
- 2026-10-27 Combat v2: which talents can appear on which creatures (amended)
- 2026-10-27 Combat v2: Knacks grow on evolution, talents by line, golden stays golden
- 2026-10-26 Combat v2: Knacks for every species, talents by role (panel 2) (amended)
- 2026-10-26 Combat v2: Misa's answers to the first panel
- 2026-10-26 Combat v2 is designed in a lab before it touches the engine
- 2026-10-22 Guards have a reach
- 2026-10-20 Riposte stops the boss's turn; Mire passives in every fight
- 2026-10-19 The element chart is content, and a mark can have several triggers
- 2026-10-19 Serpentine, dodge, status effects and Mire
- 2026-10-19 `fight.ts` split into modules (B13 step 2); Lantern Light lengthens basic abilities too
- 2026-10-19 The simulator picks second forms like players, and the legacy digest is retired
- 2026-10-18 Engine and test cleanup from the audit (E2 to E7, E9, B13 step 1) (amended)
- 2026-10-16 groundwork built: the modifier sheet in the engine, the Guard's shadow line, fight-scored power
- 2026-10-15 Guard follow-ups: one pick rule, healing credit, the client reads the fight's Guard
- 2026-10-15 boss and foe abilities only ever target living creatures
- 2026-10-13 Scalars registry and patch notes draft (balance loop, parts 1 and 3)
- 2026-10-11 Crits, boss crits, knockouts and guards measured (study, nothing switched on)
- 2026-10-11 Crits are in; progression proposal
- 2026-10-11 Ability weight, defence and luck (Misa)
- 2026-10-11 Creature abilities, phase 2 (server and client)
- 2026-10-11 Creature abilities, phase 1 (content, engine, simulator, pity) (amended)
- 2026-10-11 Second balance tuning pass (amended)
- 2026-10-10 First balance tuning pass (amended)
- 2026-10-10 Balance simulator (M3b) interpretations (amended)

## Weekly raid and live finale

[raids.md](raids.md): Raid schedule, parties and joining, bosses and the raid curve, the live finale, raid board and summaries, raid Discord posts.

- 2026-10-30 Thornmother is a deliberate wall at the end of the first lap \[Misa\]
- 2026-10-30 Raids are tuned on damage potential; young servers ramp in; Determination built but off \[Misa\] (amended)
- 2026-10-30 Festival weeks pause the boss track; no rank ease \[Misa\]
- 2026-10-30 A failed raid boss returns next week; raids measure HP removed \[Misa\] (amended)
- 2026-10-26 Raid results show real damage and a separate score
- 2026-10-26 Raids: join until the finale; new servers start at Rank 1
- 2026-10-26 The raid board is live over the sockets
- 2026-10-26 Raids: you join by placing; no auto teams (amended)
- 2026-10-24 Creature names on the raid board, and a tiny HP bar in the raid
- 2026-10-24 No acting order under the creatures
- 2026-10-24 The raid party sits dead centre on a wide screen
- 2026-10-24 The barrier is a hexagon that spills around the foe
- 2026-10-24 The barrier is shimmering triangles; the track points at this round (amended)
- 2026-10-24 A barrier over the foe, a track of rows, the boss in the middle (amended)
- 2026-10-23 Themed boss attacks in pixel style, the countdown track, quieter marks (amended)
- 2026-10-22 Four looks for the move track; the boss's attacks fly (amended)
- 2026-10-22 The boss's move track, and fixed places for buffs and debuffs (amended)
- 2026-10-22 The live finale is pushed over the live socket
- 2026-10-22 The live finale plays about three times slower
- 2026-10-20 The raid summary, round two, and the Find components (amended)
- 2026-10-20 The raid summary ships: scoreboard first, with the boss header (A plus B) (amended)
- 2026-10-19 Raid summary mock-ups for Misa to pick, workbench only
- 2026-10-18 Raid posts are embeds that sum up the raid
- 2026-10-18 The fight uses the board's rows (issue #29)
- 2026-10-18 Auto-joining creatures are on the board; teammates can move an away player's creatures (issue #29) (amended)
- 2026-10-16 the raid curve replaces 1.4^rank; every server starts at rank 1
- 2026-10-15 the raid finale pays a reward slot: gear (pre-upgraded by rank) or a blueprint
- 2026-10-15 rank-gated boss moves, more boss attacks, and two targeting options that punish setups
- 2026-10-15 an open raid week is declared again when the difficulty rules change
- 2026-10-15 Misa's answers on the retune: floors, overtime, the Wyrm, and the Guard reworked
- 2026-10-15 the raid retune: attack patterns, phase floors and enrage (how it is built)
- 2026-10-15 Raid page feedback (phone test): boss card holds only the boss
- 2026-10-14 The creature picker's effect preview is behind `SHOW_PICKER_EFFECTS`
- 2026-10-14 A player could have four creatures on the board (bug and repair)
- 2026-10-14 Raid Roster: you bring the creatures you place (amended)
- 2026-10-14 Raid UX pass 2, slices 8 and 9 (placement cues, influence, the shared `affects` helper)
- 2026-10-14 The raid stage is a lane grid, like the placement board
- 2026-10-14 Raid board tiles, sit-out removal
- 2026-10-14 Raid UX pass 2, slices 4, 6 and 10 (stage head, glossary, finale row, coach mark) (amended)
- 2026-10-14 Raid neighbours stop at row edges
- 2026-10-14 Raid phases end at a floor, and bosses enrage when time runs out (amended)
- 2026-10-13 UX pass 1, Raid tab (R1 to R6, approved by Misa) (amended)
- 2026-10-11 Content-paced rounds, smooth effects and a boss telegraph \[Misa\] (amended)
- 2026-10-11 Slower, readable fights, a round intro and a hidden jackpot \[Misa\] (amended)
- 2026-10-11 Pre-fight countdown, Auto fire preferences, tap fix \[Misa\]
- 2026-10-11 Live stage as rows, abilities on the creatures, Auto fire toggle \[Misa\] (amended)
- 2026-10-11 After-action card (implementation choices) (amended)
- 2026-10-11 Pinning the raid-post channel from the Activity
- 2026-10-11 Misa's answers after testing M4 and M5 on staging
- 2026-10-11 M5a live finale server (implementation choices) (amended)
- 2026-10-11 Live finale over short polling first (amended)
- 2026-10-10 Discord raid posts (amended)
- 2026-10-10 M4 raid server (implementation choices)
- 2026-10-10 Live finale time and length (amended)
- 2026-10-10 No raid sign-up; parties of up to 15 (amended)

Superseded: 1 entry (see the topic file).

## Daily dungeon

[dungeon.md](dungeon.md): The daily dungeon: paths, rooms and rare rooms, the camp, the Undercroft, foes, its screens and payouts.

- 2026-10-22 Foe move lines say what a move hits; "Charged:" replaces "announced a round ahead"
- 2026-10-22 Molten Shell is a frequent partial Backlash, not a rare full reflect (replaces the reflective shield above)
- 2026-10-22 The dungeon's reflect is split in two: spiky armour (Thorns) and a reflective shield (Molten Shell). The raid is unchanged (amended)
- 2026-10-22 Rare rooms: one roll, one pool
- 2026-10-22 A curse is a keepsake with a curse effect, and the Sealed Vault doubles everything material
- 2026-10-22 Four more mystery rooms (Training Post, Crystal Hollow, Cursed Idol, Hungry Door), curses, and one rule for rare rooms (amended)
- 2026-10-22 The Sealed Vault, a rare mystery room that marks the fights ahead, and a generic room badge on the map (amended)
- 2026-10-22 Sealed Vault and the other rooms merged: one rare roll for all three rare rooms (amended)
- 2026-10-21 The dungeon pays experience per room a creature stood in, and the end screen recaps it
- 2026-10-21 The Blue Chasm, a rare mystery room with a treasure shown first (amended)
- 2026-10-21 The keepsakes get a locket and a velvet canvas; the canvases reach further under the picture
- 2026-10-21 The run strip's pack is a backpack, and the keepsakes get their own panel (amended)
- 2026-10-21 At the camp a tap shows the creature; only a drag moves it
- 2026-10-20 The dungeon card is where the team gets ready (the creature configurator), and one gear list
- 2026-10-20 The daily dungeon pays more, and its choices pay more again (B-024)
- 2026-10-20 Mire content: Old Bogback, the bog foes, Muddy and the Sunken Fen (slice 5b)
- 2026-10-18 The dungeon results screen, reworked
- 2026-10-18 The camp's row can be rearranged on the entry's board, and a recruit can be placed in the same act (amended)
- 2026-10-18 The dungeon map goes downward; the page follows the run
- 2026-10-18 Dungeon terminology: room vs floor
- 2026-10-18 A fallen creature gets back up on the way down into the Undercroft (B-021)
- 2026-10-18 The Undercroft (a deeper, optional level) and the carved door
- 2026-10-18 The daily dungeon becomes a path on a daily map (camps, keepsakes and a pack) (amended)
- 2026-10-15 Dungeon fight feedback: bigger team tiles, a longer room intro, no spoiled round count, traits on the stage
- 2026-10-15 the dungeon's pre-run screen is one card (amended)
- 2026-10-15 the dungeon setup opens with the player's last team
- 2026-10-15 Dungeon team board and Recommended (amended)
- 2026-10-14 The daily dungeon always acts left to right, and the order is shown (amended)
- 2026-10-13 UX pass 1, Dungeon (less text, no ability picks) and glossary copy (amended)
- 2026-10-13 Dungeon days never go backwards, and push-ons use their stored odds
- 2026-10-13 Daily dungeon: one row, a constant stage and a fuller end report (Misa's playtest) (amended)
- 2026-10-13 Daily dungeon foe sprites and How to play section
- 2026-10-13 Daily dungeon v1 (client) (amended)
- 2026-10-13 Daily dungeon v1 (engine, content, server and balance model) (amended)

## Expeditions and weather

[expeditions.md](expeditions.md): Trips, supplies, the world map, the send flow, rank gifts, Boons and Omens weather.

- 2026-10-22 Desktop Expeditions map: full width until a place is chosen, the panel runs the wizard
- 2026-10-21 The Trips view is a world map (amended)
- 2026-10-21 The bag may overflow; a full bag warns where you set off
- 2026-10-21 "Pack a treat" is a pixel switch row
- 2026-10-21 One line per supply, its strength word anchored to a reference trip
- 2026-10-21 Supplies are explained by tier words and a boost bracket, never by counts (amended)
- 2026-10-21 Richer rank gifts, and "Set out with" on the claim screen
- 2026-10-21 Send screen polish (supplies step and the expected-haul summary)
- 2026-10-20 The send screen picks supplies from the Workshop grid (amended)
- 2026-10-20 A deeper-area find is the deep species 20% of the time (was 35%)
- 2026-10-20 The lantern gets a bonus deep creature roll
- 2026-10-20 A recall pays explorer XP too
- 2026-10-20 Expedition trips pay in ticks (amended)
- 2026-10-20 Push-on extra time starts at the decision
- 2026-10-18 Weather numbers a player can read
- 2026-10-18 The last three weathers are live: Kind Rain, Morning Haze, Bramble Season
- 2026-10-18 The trip result screen, and Teach goes to the Talent Book
- 2026-10-17 Boons and Omens built: the valley's weather (migration 31) (amended)
- 2026-10-16 supplies cannot be bought; the dungeon drops one on every run; crafting is how you choose
- 2026-10-13 UX pass 1, Expeditions: rank-up gifts, no chances on screen (amended)
- 2026-10-13 The slot wipe spares finished trips (Misa)
- 2026-10-13 Expeditions v2 client (banner cards, send flow, push-on, journal) (amended)
- 2026-10-13 Expeditions v2 numbers set by simulation (amended)
- 2026-10-13 Expeditions v2 spec (Misa) (amended)

## Gear, crafting and the Workshop

[gear.md](gear.md): Gear items, lines and sets, crafting, dismantling, conversions, the bag and the item picker.

- 2026-10-27 Marked items, dismantled as a pile (amended)
- 2026-10-21 the Workshop's supply jobs are one wizard in a drawer; level limits may fold in job pickers (amended)
- 2026-10-21 A found item opens its item card (tap, or hover with a mouse)
- 2026-10-21 "Equip on" shows what is already worn
- 2026-10-20 The item picker does not move gear off another creature
- 2026-10-20 The Workshop's supplies become one compact picker (version C) (amended)
- 2026-10-20 Workshop conversions, Refine and Recycle (amended)
- 2026-10-18 Keeping the gear fold fast
- 2026-10-18 One item grid (amended)
- 2026-10-18 Item grid cells are square
- 2026-10-18 A second tap closes the item details in the picker (amended)
- 2026-10-18 Compare inline on the item card, with a switch (amended)
- 2026-10-18 Chance lines and trigger lines
- 2026-10-18 More gear and modifiers: position lines, one special line per item, and gear sets (amended)
- 2026-10-17 Workshop bag polish (Misa's feedback on the v6 screenshots)
- 2026-10-17 one item-level indicator; item card and compact rows (polish v6) (amended)
- 2026-10-17 items carry base stats; local and global lines; Festival gear is special, not stronger (amended)
- 2026-10-16 Gear B: no free lottery (a craft's scrap follows the item level; a dismantle returns under half; a Reach needs no extra shards)
- 2026-10-16 Gear B built: Reach, dismantle jobs, well-thumbed marks (migration 29) (amended)
- 2026-10-16 Gear A review fixes
- 2026-10-16 Gear A built: Hat, Scarf and Charm, item levels, tiered lines, Equip best, conversion (migration 27) (amended)
- 2026-10-16 top-tier rolls stay at about 1 line in 7
- 2026-10-16 Misa agrees with the podcast's points; Market Day boosts only the day's first crafts (amended)
- 2026-10-16 converted gear matches a fresh drop, and an item needs its level to be worn
- 2026-10-13 Festival gear stays a Festival-only prize (Misa)
- 2026-10-13 Gear numbers set by simulation
- 2026-10-13 Gear and crafting v1 (client) (amended)
- 2026-10-13 Gear and crafting v1 (server and content) (amended)

Superseded: 1 entry (see the topic file).

## Valley Games

[games.md](games.md): The Valley Games events, entries, awards and the Prize Stall.

- 2026-10-24 Valley Games polish: crowding solved at display time, a calm leaderboard, one icon box
- 2026-10-23 Valley Games fit their parent, the Expeditions map's side panel for the leaderboard, one favour line per favour
- 2026-10-23 Three more team events, all played at once: Bucket Brigade, Crate Tower, Kite Flight
- 2026-10-23 Valley Games: no level, a "Good fit" badge, event badges, no auto-entry
- 2026-10-23 Team events are real team sports: Log Carry and Pumpkin Push; Sauna Stack and Shark Relay retired (amended)
- 2026-10-23 No Valley Games results post
- 2026-10-23 Valley Games: three events a day, a bonus event on Wednesdays
- 2026-10-23 Valley Games polish: commentary by priority, paced exits, real finishes, stacks and a relay (amended)
- 2026-10-22 Valley Games on the server: days, auto-entry, awards and the Prize Stall (amended)
- 2026-10-22 Valley Games engine: five kinds, stats against the field, a timeline the client only plays (amended)

## Living room, lounge and Discord

[social.md](social.md): The living room and lounging, the lounge message, Discord DMs and other social features.

- 2026-10-25 Opt-in Discord DMs, derived from the game's tables
- 2026-10-22 Lounging time is stored at every check
- 2026-10-20 Lounging XP, the evening check (amended)
- 2026-10-20 Lounging XP fixes after the first production test (amended)
- 2026-10-20 Lounging with company earns XP; the live lounge goes to production (amended)
- 2026-10-19 WebSocket push for the lounge, as a prototype behind a flag (amended)
- 2026-10-18 The lounge message replaces Discord's launch card
- 2026-10-15 A 45 s living-room refresh while others are present (amended)
- 2026-10-15 A player's living-room spot is stored per player; the client settles conflicts
- 2026-10-14 Living room presence comes from the Discord SDK, not the server (amended)
- 2026-10-14 The living room's lounger and `/api/room` (amended)

## UI patterns and the app shell

[ui.md](ui.md): Navigation and the frame, Home and the notice board, type scale, shared components, look and feel rules that apply across screens.

- 2026-10-28 One spacing scale inside drawers and sheets
- 2026-10-28 One spacing scale inside popovers
- 2026-10-28 Selecting several is shared
- 2026-10-27 Bulk selection replaces marking
- 2026-10-26 While you were away: missed rewards on the notice board
- 2026-10-25 One bottom bar between the phone and the wide window (prototype)
- 2026-10-25 A fixed top bar on phones, see-through pin shadows
- 2026-10-25 Home board: Journal and Stats off the board (Stats is a Collection place), a How to play pin, flush notices by default, no sway, smaller board text
- 2026-10-24 The new UX patterns, reviewed: one "frame" section in ux-patterns.md
- 2026-10-24 Collection group with the Journal, Settings behind a cog, a creatures notice and a starter pin (amended)
- 2026-10-24 The Journal and the Stats are pinned to the Home board; Expeditions is only the map (amended)
- 2026-10-24 Shell polish: smaller navigation, scroll to top, Bait income in the currency popover, no footer
- 2026-10-24 Home is a page: the Today board, with tilted notices and optional quiet ones (amended)
- 2026-10-24 The dock reaches the bottom edge, and the lounge is a button in the middle (amended)
- 2026-10-24 The phone dock is three group buttons with upward sub-menus (amended)
- 2026-10-24 The main navigation is a dock on a phone and a rail on a desktop, with a HUD on top (amended)
- 2026-10-22 Pixel scrollbars on desktop, the system's own on phones
- 2026-10-22 The Wizard branches, and the dungeon camp runs on it
- 2026-10-21 One creature list for every creature pick
- 2026-10-21 the step-by-step wizard is its own component, not part of the Drawer
- 2026-10-21 One Alert component for notices, warnings and errors; the pack rolls out of the backpack
- 2026-10-21 The configurator on the Raid Roster, gear during a dungeon run, and a font sweep
- 2026-10-20 Configurator buttons in one row; Compare against an empty slot
- 2026-10-20 No "?" on tags, anywhere
- 2026-10-19 The footer and the dev clock are data tables (amended)
- 2026-10-19 The XP bar's look is "grown"; the action button centres its detail
- 2026-10-19 The level tag and the XP bar share one height; the creature page starts like the card; one shared action button (amended)
- 2026-10-19 Round 5 touch-ups: the multiplier tag in plain colours, "Evolve", one-row card button, a tighter Lounging badge (amended)
- 2026-10-19 The creature card is variant E, with the talents one to a row (amended)
- 2026-10-19 Every XP gain is the "Count-up" row, with a treat icon and one multiplier chip (amended)
- 2026-10-19 The type scale one rung smaller (Misa: "smaller everywhere"); creature card variant E in the workbench (amended)
- 2026-10-19 Look and feel pass, six approved changes (type scale everywhere, pixel cards, camp Back, one XP row, rooms recap, reset line) (amended)
- 2026-10-18 UX patterns written down
- 2026-10-18 "Level up!" is the shared XP line's job
- 2026-10-18 Close for the item details, the job result as a picture with one XP component, reasons on the right, Dismantle last
- 2026-10-18 Never stack drawers; one width inside a drawer; the item picker opens with nothing selected
- 2026-10-18 Play-test round 2: one type scale, one pixel font per panel, Equip on, dismantle as badges (amended)
- 2026-10-18 The scroll hint (a reusable building block)
- 2026-10-18 The flip arrows look the same everywhere (amended)
- 2026-10-18 flipping between creatures and items (amended)
- 2026-10-17 How to play pass for the revamp
- 2026-10-17 Item corners everywhere, and tags that explain themselves by context (amended)
- 2026-10-17 creature rarity by name colour; gear rarity by one border (polish v5) (amended)
- 2026-10-17 Accordion rolled out; golden talents shimmer; Talent Book shows states
- 2026-10-17 one Accordion for every expand and collapse (amended)
- 2026-10-15 Tab pips, a saved dungeon team, and the page follows a claim
- 2026-10-14 Counts use a spaced slash ("1 / 3"), never "of"
- 2026-10-14 One slot row (cleanup pass 1, slice 18)
- 2026-10-14 One popover shell (cleanup pass 1, slice 17)
- 2026-10-14 Stylesheet split and colour tokens (cleanup pass 1, slices 10–11)
- 2026-10-11 M6 visual foundation choices
