# Direction and process

Roadmap calls, Misa's standing direction, naming and tone, content policy, how agents and Misa work.

<!-- Maintained with `pnpm decisions`; see README.md. Newest first. -->

## 2026-10-30: Decisions live in topic files, kept in step by pnpm decisions

ID: `2026-10-30-decisions-live-in-topic-files-kept` · Status: current

**Decision.** The single `docs/design/decisions.md` (3,511 lines, 334 entries, about 870 KB) is split into one file per topic under `docs/design/decisions/` (`topics.json` lists them), with a generated `README.md` index of the entries in force. Every entry has a stable ID; a newer entry names what it `Supersedes:` or `Amends:`, and the tool derives the old entry's status and moves superseded entries to the bottom of their file. `pnpm decisions` (`scripts/decisions.mjs`, no dependencies) lists, searches, shows, adds (`new`), repairs (`fix`) and checks (`check`, in CI and `pnpm check`). A PostToolUse hook runs `fix` after every edit in the folder; a Stop hook asks once when a branch changes code without recording a decision or progress. The old file is a fixed stub; `pnpm decisions migrate` moves entries a branch added there before the split (it reads the branch's side during a merge conflict, asks for a topic per new entry, applies edits to old entries unless both sides changed them, and restores the stub). `legacy.json` freezes the hashes of the 334 migrated entries so migrate can tell an untouched entry from an edited one.

**Reasoning.** The file had outgrown any agent's read: the file reader stops at 2,000 lines, so "start with decisions.md" gave the oldest entries, and nothing told a reader which of them had been replaced. Topic files keep a task's reading to one area; the index (about 27 KB, titles only, no links or IDs) is the map. Deriving IDs, statuses, order and the index makes the format impossible to drift, and CI turns the convention into a check. A database was considered and rejected: decisions must travel with the code in the same PR, unmerged branches must not leak decisions, and a hosted store would add a service and a credential. Old citations ("decisions.md 2026-10-24, <title>") are left in place; `pnpm decisions show "<title>"` resolves them.

## 2026-10-28: Content changes are not held back by existing rolls; modifiers, luck and fading debuffs

ID: `2026-10-28-content-changes-are-not-held-back` · Status: current

**Decision (Misa).**

- **Change freely.** Misa may change, remove or add any content at any time. A removed or changed modifier line on an existing item or creature is replaced by a fresh random roll; a new line just enters future rolls. Players expect changes; be fair, but don't let old rolls slow progress. (Also a standing rule in `CLAUDE.md`.)
- **Luck is welcome.** Chance-based modifiers stay, and most effects may be luck-based; deterministic rhythms are an option. P-04 still keeps a creature's main job certain.
- **Debuffs fade over time** (Mired loses stacks), and bosses may cleanse them, announced at round start, so a debuff creature has to keep working and its effect does not last the whole fight.
- **Same effect, same name** also between talents and gear lines (a gear line is one modifier on an item); a talent and a gear line of the same name add up.
- **Build a first batch** of the modifier and talent library (`docs/design/combat/modifiers.md`) into the lab and the wiki; Misa filters later.
- **New ideas:** Cull (a hit that leaves a foe below a small share of its HP defeats it) and killing-blow triggers (for example more loot for the raid). Cover gets a cap (an intercepted hit needs none, since the Guard still takes it).

## 2026-10-18: Part 2 meets the dungeon paths (merging main #32 into #35)

ID: `2026-10-18-part-2-meets-the-dungeon-paths` · Status: current

The dungeon paths (PR #32) were merged to `main` first; this is how part 2's work was carried into them so nothing either side meant is lost.

- **Weather in every room.** The map run's base input carries Kind Rain, Morning Haze and Bramble Season (`skyRunFields`), so every room built from it (`buildRoomInput`) heals, hazes the leftmost creature and reflects as part 2 built them. A row reordered at the camp hazes its new leftmost creature.
- **Position lines and sets in the run's row, kept after the camp.** The run state gains `seats` (by creature id: the slot before its place and the weather are known, and its gear fold's kit, frozen when it joined). The row is folded with its places at the start (`seatedRow`: `placeSlots(..., 'line')`, then the weather), and again at the end of every camp act, after a swap or a reorder (`reseat`), so the position lines and gear sets see the new neighbours. Gear stays frozen from the start, as the paths decided: the kits are the gear the creature wore then. Only a creature whose max HP the new place changes (a Lantern bearer's gift, Heart of the row) gets a new max, and its carried HP is capped at it; the others keep the max of their last fight. A run stored before seats keeps every slot as it was (the camp only reorders). Tests: `apps/worker/test/dungeon-camp-seats.test.ts`.
- **XP bars.** Main's "just gained" highlight and part 2's kinds live together: the gained part is the kind's bright colour, the part before it the kind's shade (`--xp-<kind>-shade` in `tokens.css`).
- **Fixtures.** The dungeon fixtures were re-captured from the server (part 2's new abilities are in every reply's ability names); the capture's random creature ids were mapped back to the ones the client tests name.
- **Sim.** The legacy digest was re-pinned (see `legacy-unchanged.test.ts`): Bait earned and raids won are the same. The gear share study's test now measures three servers, not one: with one, a lone min-maxer's share swung with whichever creatures stood in its top three (61% at week 20, 20% at week 30 for the test's seed), which the merge's different dice exposed.

## 2026-10-16: Misa's answers to the review page's last questions

ID: `2026-10-16-misa-s-answers-to-the-review` · Status: current · Amends: `2026-10-16-misa-s-second-round-on-the`

- **Dismantling takes a little time** (Commons in bundles of up to 5 in 15 minutes, a Rare 1 hour, an Epic 2 hours; may grow longer later) and gives both Crafting XP and creature experience, like any Workshop job: downtime work for idle creatures. The **refund does not depend on the dismantler's Crafting level**, so one master crafter is not the only creature worth using; the "Tinker's eye" gear line is dropped for the same reason.
- **Treats stay simple:** no treat item to stockpile or spoil. When sending a creature on a trip, into the dungeon team or onto a Workshop job, one toggle "Pack a treat (N Bait)" doubles the experience that activity gives that creature. Raids take no treats. Nothing to hoard, nothing to expire, one line of UI.
- **Wild Omens: yes**, from Boss Rank 10, one a week, shown a day ahead, never in a Festival week.
- **Workshop odds: numbers up front** (they depend on the blueprint, its well-thumbed marks, the crafter's Crafting level and the Reach chosen; the server sends the final numbers).

## 2026-10-16: roll out fast, balance at the end; slot ladder, golden talents, the weather calendar

ID: `2026-10-16-roll-out-fast-balance-at-the` · Status: current

- **Rollout:** the revamp ships in quick succession (several PRs within about a day), not as long-lived releases. Interim states that feel off between two steps are acceptable; balance passes for raids and dungeons happen once the systems are in place, aimed at the final state.
- **Gear beyond percentages:** yes. The first gear release includes one position-based line (for example "stronger when a Guard stands beside it") as well as the characterful lines (Hunter, Unbothered, Lingering).
- **Weather forecast:** today's and tomorrow's Boon and Omen are shown. In the living room they live on a clickable wall calendar or weather window that pops out of the background, animates and reacts to hover or tap, and now and then shows a speech bubble like the creatures do, as a quick glance at the game's state.
- **Golden talents (1 in 20):** a golden talent is about 1.5 times a normal one (roughly a tier III gear line, a few percent of power). Every later duplicate of the line rolls a new talent and can Teach it, so any creature can still reach a golden talent; nobody restarts a creature for it.
- **Unlock ladder:** Scarf at creature level 7, Charm at 13 (evolution stays at 15), talent slot 3 at 25, so a creature has something to look forward to every few levels (`gear-and-creatures-v2.md` 9.3a).

## 2026-10-16: Misa's second round on the revamps: weighted slot pools, training by activity, Boons and Omens

ID: `2026-10-16-misa-s-second-round-on-the` · Status: current, amended by `2026-10-16-misa-s-answers-to-the-review` · Amends: `2026-10-16-misa-s-answers-to-the-systems`

1. **Slots: Hat, Scarf, Charm** (Cape kept as a possible future slot). Slots are **not** locked to one kind of stat: each slot's roll pool is **weighted** toward its theme (Hats lean to attack, and so on) and may roll other lines too. A few lines are **exclusive** to one or two slots (Path of Exile style: only boots, rings and amulets roll movement speed), so players know where to hunt for them. Charms are **not** role-locked as a rule; role-locked items may exist, but the interesting choice is finding the item with the right lines for a particular creature.
2. **Gear upgrades (+1 to +5) go away.** An item's level is fixed when it drops or is crafted.
3. **Items remember who crafted them and when** (creature and date), for the "this item is mine" feeling and any future gifting.
4. **Dismantling** may have a small random range, improved by the creature's Crafting level, and may take time. Workshop odds need not be fully shown; showing them is fine.
5. **Training by activity:** creatures gain experience from expeditions, the dungeon and raids, with limited activity slots making the player choose who goes where; Bait becomes treats that speed it up. Every 10 levels there is a gate, but not one that demands a deep dungeon from a low-level creature: materials at least.
6. **Both branches of a line can be owned:** keeping a duplicate is a fourth duplicate choice when the player does not yet have that line's other branch.
7. **Boons and Omens:** positive effects are Boons, negative ones Omens. They change at the **daily reset**, so a well-planned raid can hit bad weather part way through the weekend and players adapt. They may also touch expeditions and the dungeon, and grow stronger at high raid ranks.
8. **Process:** Misa reviews the gear modifier list and creature talents and choices (all modifiers, example talents, and why each choice is meaningful) as an artifact before they are built. Gear and creatures are the foundation; raids and dungeons are rebalanced around them afterwards with the curve scalars.
9. **A reference-games log** records what we draw inspiration from, what we looked into, and what works for this game and what does not (`docs/research/reference-games.md`). The Bazaar is added as a key reference.

## 2026-10-16: Misa's answers to the systems review (they replace parts of its proposals)

ID: `2026-10-16-misa-s-answers-to-the-systems` · Status: current, amended by `2026-10-16-misa-s-second-round-on-the`

Answers to the ten questions in `docs/design/systems-review.md`. Where they differ from the review's proposals, these win.

1. **Three gear slots**, each with its own job and roll pool (not three generic slots).
2. **Gear's share of power depends on the stage of the journey:** early power comes mostly from creatures; as creature growth slows or caps, gear becomes the way to grow. No single target share.
3. **Fight-triggered modifiers come later.** Ideas for that design space: modifiers that depend on or are boosted by the creatures next to the wearer, its row, its distance from the edge; set bonuses; chance-based effects whose chances grow with item level and rarity (Path of Exile and ARPGs as references).
4. **No rerolls, and nothing that only improves an item without risk, for now** (future design space). The crafting loop: find or craft an item with rolled modifiers; a bad one is dismantled in the Workshop for a fraction of its cost, shown up front as a range (for example 2–4 scrap). Dismantling gives the creature Crafting XP and a small chance to learn the item's blueprint; extra finds of the same blueprint stack a small chance of crafting a higher-rarity version. Higher-rarity crafting is gated by Crafting level. **Enchanting is dropped** until the crafting loop is settled.
5. **Existing gear is converted, not necessarily 100% fairly;** refunding it as scrap and other materials is fine.
6. **Duplicates become a choice:** teach a talent (or a meaningful skill), fuse, or release. Release pays something other than Bait if it fits better (lead's call).
7. **Evolution:** no de-evolve or re-evolve; evolved forms are rare or absent in the wild; two sequential evolutions (base, first, final) are welcome for depth. Training should become more than "spend Bait, level up at once", and fusion must stay meaningful.
8. **Weekly boss rules: yes**, as weather, omens or boons, with plenty of variety, allowed to be extreme at high raid ranks, and possibly affecting dungeons and expeditions too.
9. **Spare Essence goes into advanced features**, not training: gear crafting, and later dungeon choice rooms ("spend 20 Essence to enter this room").
10. **No levels past 30** for now.

Also asked: whether using a supply is loosely net positive (not every time; randomness is fine).

## 2026-10-16: Misa's direction after the raid retune: supplies now, a systems review, then gear and creature revamps

ID: `2026-10-16-misa-s-direction-after-the-raid` · Status: current

Misa's answers on the progression overview (the forecast page for PR #24), recorded as decisions:

1. **The week-2 wall for casual-heavy servers stays** (about 39% finale wins in week 2, about 50% in weeks 2–5, then 60–70%).
2. **Ranks 10 and up are checked only in long simulations**; that is enough, because the game will change a lot in the coming weeks.
3. **A dungeon depth picker** (choose the depth, with a likelihood-of-success hint like the raid's) comes later, after the reworks.
4. **Supplies:** no more buying them with Bait. They come as rewards instead (a guaranteed one from the daily dungeon, better tiers deeper), and crafting them in the workshop should be a real, interesting option, with more scrap to make it possible.
5. **Gear rework, genuinely exciting:** gear levels that raise stat caps; modifiers, more of them on higher rarities; every piece rolls differently, so there is a reason to chase the perfect roll; "gear identities", where the pool of possible rolls is limited by something such as the gear's element, slot or the role that can wear it.
6. **Currency sinks belong in the crafting and gear rework:** spending spare currency on crafting should feel like a lottery worth joining because the rewards are exciting.
7. **Collection pacing gets a plan:** are new catches too fast now; what design space new creatures have; what makes a player with a working max-level trio collect and level more.
8. **Step back before the revamps:** review every system, its currencies, rewards and interactions, what each system is for and whether that identity is good, and learn from games with similar systems. "Let's not be afraid of tearing down what we've built in order to make something better." This is `docs/design/systems-review.md`; Misa reviews it before anything is built.
9. **Priority:** the gear and creature revamps come first, after the systems review.

## 2026-10-13: Compendium contradictions resolved

ID: `2026-10-13-compendium-contradictions-resolved` · Status: current

The compendium author listed twelve places where content, glossary and design docs disagree (`docs/compendium/README.md`, "Known contradictions"). Fixed now, with the code as the judge:

- **Ember burrow page** (`journal.json` `ember-ash-burrow`) said "the next day". The mechanic, Warm Glow, is an in-fight boost for a few rounds, so the page now says that, with no numbers.
- **Daily dungeon design** said "Thorns: guards reflect" and "3 and 7 days in a row". Thorns makes the foe turn the first reaction of each round back on the team (as `room-modifiers.json` has it), and the streak pays on the 3rd and 7th day of each 7-day cycle (`RULES.dungeon.streak`). The doc now says both.
- **Gear design** said about 12 bases and 8 enchants (shipped: 19 and 9), and listed raids, the dungeon and Festivals as blueprint sources. The code (`gear-grants.ts`, `rollBlueprint`) grants blueprints only from expedition claims, expedition push-on rewards and the welcome kit. The doc now says so. Side effect found: the glossary says Festival gear is "crafted only from Festival blueprints", but nothing grants one yet. Left for Misa to decide.
- **Storm Ridge odds:** the schema falls back to `RULES.expeditions.defaultOddsBp` when a place has no block, so behaviour was always defined and the sim was tuned with it. Nothing records an intent to omit it, so the place now has an explicit block with the default values. No behaviour change.
- "Row" against "zone" in raids is not a contradiction: zones are rows.
- Still open: 3 (Festival residents text), 4 (night hours), 6 ("Very risky" wording), 12 (enchant costs).

A new test, `packages/game/test/compendium.test.ts`, fails when shipped content has no compendium entry.

## 2026-10-13: Expeditions v2 merged into the daily dungeon branch

ID: `2026-10-13-expeditions-v2-merged-into-the-daily` · Status: current

Both branches started from the same base, so the merge kept the work of both (rules, glossary, analytics events, sim modules and targets, tests). Nothing was re-tuned: a combined balance pass comes later.

- **Migrations.** 18 is the daily dungeon's (the expeditions branch had an empty placeholder there) and 19 is expeditions v2. The latest schema version is 19 (`LATEST_SCHEMA_VERSION` in `apps/worker/test/helpers.ts` is the one pin). A database at 17 runs 18 then 19; staging, which already has 18, runs only 19 (the migrations touch different tables, so order does not matter for the data). `undoExpeditionsMigration` removes only version 19 and `undoDungeonMigration` only version 18; `undoGearMigration` runs both. `dungeon.test.ts` has a test for both paths.
- **Analytics.** Every event kind of both sides is kept (the dungeon's `dungeon_run` and `dungeon_reward`, the expeditions' push-on, journal, explorer rank, familiarity and slot events). `props_json` stays capped at 1536 characters.
- **Weekly special.** `weeklySpecialFor` uses `weekIdFor`, so it turns over at the raid week start (Monday 13:37 guild time), not at midnight; a test pins the minute. Expeditions has no daily keys, so `gameDay` was not needed there (the Moonlit Reef's night window is a time of day, not a day key).
- **Dungeon on expeditions.** Dungeon parts and gear still go through `grantOnce` (the expeditions change only added supplies to a grant, which a dungeon grant leaves empty). A creature that is away on an expedition may still run the dungeon; the test now sends a v2 trip.
- **Sim.** One run models both: the economy plays trips (with supplies and push-on choices) and the dungeon day. 47 targets (33 base, 4 dungeon, 10 expeditions). On the full run (seed `leet`) 44 pass and 3 fail: setup credit share 13.9% (needs 15%; it already failed on the expeditions branch), the lowest creature's share of contribution 0.598 (needs 0.60) and Crafting level at day 30 of 7 (needs 4 to 6; the dungeon's scrap adds to what trips already brought). The sim test timeout is 120 s because a tiny run now plays 60-week sims with both models.
- **Client stopgaps (until the UI task).** `startExpedition` sends the v2 body (the Tidepools; "basic" supplies mean none, "good" and "great" buy that tier of Lure). The gear view parser leaves supply craft jobs out of the Workshop list, and accepts the `dungeon` grant source (a dungeon drop would otherwise have made the whole gear view fail to parse). No new screens.

## 2026-10-13: Roadmap reorder, crafting direction, production may change freely (Misa)

ID: `2026-10-13-roadmap-reorder-crafting-direction-production-may` · Status: current · Amends: `2026-10-13-roadmap-after-m6`

- **Order:** how to play, then gear and crafting, then expeditions v2, then the daily dungeon, then analytics reports. The analytics **event log** ships with how to play so data builds up early; the reports and the `OPS_TOKEN` secret come later.
- **Gear becomes crafting:** dismantle into parts, upgrade, improve, craft from blueprint drops, enchant. Creatures get long **downtime jobs** and crafting skills that level very slowly, for the idle RPG pillar. Slow gear at first is fine. Sketch in `design/gear.md`.
- **Production:** players know the game is in development and progress may be wiped. Ship features when ready, including before the weekend raid test. Agents still never wipe data on their own; that is Misa's call.
- **Beta badge:** a small "beta" superscript on the Leet Creatures title.
- **Expeditions v2 review** happens in a shared, commentable doc; the repo copy is updated from it when Misa is done.

## 2026-10-13: Roadmap after M6 (Misa)

ID: `2026-10-13-roadmap-after-m6` · Status: current, amended by `2026-10-13-roadmap-reorder-crafting-direction-production-may`

Misa set the forward plan, recorded in `docs/roadmap.md` with design docs for each bigger item:

- **Analytics and reports:** agents need tools to understand how players play and whether the game is balanced.
- **How to play,** with clickable tags: "the roles and elements are not intuitive".
- **Daily dungeon:** solo, server-simulated, played back as if live, no real-time backend.
- **Gear:** "absolutely".
- **Expeditions v2:** something players "get better at"; a proposal first, then Misa adds his ideas.
- **Polish and upkeep:** yes.
- **WebSocket push:** interesting.
- **More content:** eventually.
- **Swap requests:** not a priority.

## 2026-10-10: Game rules from the research review

ID: `2026-10-10-game-rules-from-the-research-review` · Status: current, amended by `2026-10-13-expeditions-v2-spec`

Misa reviewed the research defaults (`docs/research/`). **[Misa]** on all of these:

- **Reactions:** each element leaves one visible mark on the target (for example "Soaked"); the matching element consumes the mark for the payoff. One mark at a time, no hidden gauges.
- **Turn order:** always shown as a portrait strip above the row; only 2–3 orderings across all bosses. To be judged in play.
- **Absent players:** signed-up players who don't show up still take part, so the server's raid power doesn't drop. Their creatures are auto-placed. Their finale ability is **not** weakened: every ability has a **default firing time** in the fight, and an absent player's ability fires at that time. A present player may fire theirs whenever they choose. They still get the base reward.
- **"First on server":** a title goes to everyone who gets the item or creature **from the same drop instance** (for example two players who both receive an ultra-rare from one boss kill). No 7-day co-discoverer window.
- **Expeditions:** 2–3 slots plus a free recall that pays out partial rewards.
- **Shinies:** cosmetic only, no power.

## 2026-10-10: Name and tone

ID: `2026-10-10-name-and-tone` · Status: current

**Decision.** The game is called **Leet Creatures** **[Misa]**. The game stands on its own: creatures, art and mechanics are not built around leet or tech humour. Leet is the currency source; light references are fine **[Misa]**.
