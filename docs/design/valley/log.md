# Log

One entry per session, newest last. Each says what was done, what was decided, and what is next. Read the last two entries to pick up the work.

## 2026-10-28 to 2026-10-29: from looks to the valley (lead session on branch `ccr-93a1de17-yutb1a`)

**Done.**

- Night of 2026-10-28: the desktop fills the window; three app-wide looks (arcade, hearth, quest) built and reviewed by a five-persona panel in three rounds; the raid boss became the hero of the Raid screen; pixel dungeon map rooms; looks and the room choice are staging-only switches in the DEV panel.
- Misa: the looks were "colour schemes on a web form"; asked to move into a game. Two prototypes built on a staging-only prototype page (`apps/activity/prototype.html`, `src/proto/`): **valley** ("the valley is the menu") and **party** ("your creatures run the show"), the same Saturday tour, two panel rounds. The valley became the hybrid (valley world, full-screen scenes, party's creature tray). Deployed to staging.
- Misa picked the **valley** as the foundation, and set the raid's direction: defending the valley, a battleground per boss element (decisions.md, 2026-10-29).
- The "Valley Map" artifact: places, what players do, shortcuts, the raid weekend from combat v2, the posts idea.
- Research: `docs/research/idle-job-posts.md` (job posts, roster XP, idling, the School, co-op idle).
- This folder: README, goals, roadmap, process (with the panel), system docs, the economy lab's model, open questions.

**Decided.** The valley is the foundation (Misa). The raid is defending the valley (Misa). Everything in `systems/` is an idea or proposal until Misa accepts it.

**Next.**

1. Misa answers `open-questions.md` 1 and 2 (the goals and targets).
2. Write posts and the bonfire in full (phase 1, step 2), with back-of-envelope numbers marked as examples; run the panel with Pia (systems) added.
3. Then the return moment, scouts and the Forge loop, the commons, the School.
4. Start the economy lab's skeleton once posts and the bonfire are drafted.

## 2026-10-29 (later): the plan as a phone page

**Done.** The plan folder rendered as a phone-first page, published as the Claude artifact "Valley Plan" (https://claude.ai/artifact/LhzFbstKivpCJ4rk9t5Bqt), built by `reader/build.py`. The "Valley Map" artifact (places, shortcuts, posts idea) is https://claude.ai/artifact/Gme15KAUTmxiJ4e9FLRNpb. Both are private to Misa. Republish the plan page after any change to these docs.

**Next.** Unchanged: Misa answers open questions 1 and 2, then posts and the bonfire in full.

## 2026-10-29 (evening): question rounds, and round 1

**Done.** Misa asked to go step by step with numbered rounds of one to three questions, to be challenged, and to be brave about scrapping today's systems ("I was there" mementos for players). Written down in `deciding.md` (accepted), goal G-0 in `goals.md`, an entry in `decisions.md`. Built the tools: the ledger `questions.md` (replaces `open-questions.md`; old questions 1 and 2 withdrawn, the rest queued), the `valley-round` skill (prepare, record, challenge check, publish), and `reader/build.py` now fills the phone page's tiles from the ledger and the roadmap. Asked round 1: Q1 one valley or one each, Q2 posts replace every timed task, Q3 how much opening the game matters (a challenge to "no daily XP limit" plus "away costs nothing").

**Next.** Record Misa's answers to Q1 to Q3 (`valley-round`). Then the lead's scrap list (today's game: keep, rework or scrap), and round 2 from the queue.

## 2026-10-29 (night): round 1 answered, round 2 asked

**Done.** Recorded Misa's round 1 answers (`questions.md`, `decisions.md`): one shared valley where personal and shared progress take turns as the limit (V-COM-10); posts replace every timed task, with agency at the place (V-POST-9); away growth in steps, full for a day and near zero after a month (V-POST-10). G-3 and G-4 accepted as reworded; F-1 and T-2 changed. A challenger agent checked the answers; the lead decided three technical points (projects sized by players who visited in the last 7 days, the away steps never touch what fights pay, queues of at most about 3 orders computed lazily and priced against the read budget) and turned two conflicts into round 2: Q4 (when the shared place blocks you, can you push it through yourself), Q5 (how long stores and queues last), plus Q6 (does a raid pick leave its post).

Then the scrap list ([`scrap-list.md`](scrap-list.md)), from an agent's inventory of the shipped game: trips, Workshop jobs, slots, the lounge cap, treats, the leet points conversion and the Home board are scrapped; scouts, the Forge and the house take over their inputs; three rows queued for Misa (dungeon-days, games, bait).

**Next.** Record round 2; round 3 from the head of the queue (dungeon-days, games, bait, then returners, bonfire, place-max).

## 2026-10-29 (late night): round 2 answered, round 3 asked

**Done.** Recorded round 2 (`questions.md`, `decisions.md`): gifts to the commons always count in full and a lone player can finish a project, slowly (V-COM-5); stores and queues last at least about a day and a half, and being present pays a little through small upgrades (V-POST-5, V-POST-11, V-FORGE-1); a raider's seat is kept for the weekend with an optional stand-in (V-POST-7, V-DEF-3). A challenger checked round 2; the lead decided four points without a question: XP is never stored, so a full store stops finds but never growth (the store would otherwise halve a weekly player's growth); the raid stand-in is named once from unposted creatures and steps in and out on its own, from Friday's lock to Sunday's finale; a project's size is fixed when it opens and grows more slowly than the player count; one level's project is open at a time (against a hoarder). The economy lab gains a hoarder, a lone giver and a four-visits-a-day check. Asked round 3 from the scrap list: Q7 the daily dungeon and missed days, Q8 the Valley Games, Q9 what Bait is for.

**Next.** Record round 3; then round 4 from the queue (returners, bonfire, place-max).

## 2026-10-29 (small hours): round 3 answered, round 4 asked

**Done.** Recorded round 3: dungeon passes stacking to 3, each able to run one of the last 3 days' maps (Q7); the Valley Games as a weekly Wednesday fair with about 5 events (Q8); Bait as the one everyday currency for a player's own posts and the server's projects, to be renamed (Q9). `scrap-list.md` updated. The lead's check found no conflicts in these narrow answers, so no challenger agent ran. Asked round 4: Q10 catch-up for players who play less, Q11 the bonfire as a flat floor or a communal hearth, Q12 a max level for places.

**Next.** Record round 4; then round 5 from the queue (currency-name, battlegrounds, sentries). After the queue, phase 1 moves on to writing posts and the bonfire in full with example numbers, and the panel with Pia.

## 2026-10-29 (later still): round 4 answered, round 5 asked

**Done.** Recorded round 4: catch-up toward the server's middle while present, no raid level sync (Q10, V-BON-6); the bonfire as a communal hearth with slight increments per level (Q11, V-BON-7); a max level per place, each level harder than the last, cosmetic projects after, new places any time (Q12, V-COM-11). The lead's check found no conflicts; the lab will check how a lone player fares at high place levels, since projects now grow per level. Asked round 5, the last of the queue: Q13 the currency's new name, Q14 the battlegrounds for Tide, Ember and Mire, Q15 whether sentries help the raid.

**Next.** Record round 5. The queue is then empty except **targets** (waits on the lab), so phase 1 moves on: write posts and the bonfire in full with example numbers, run the panel with Pia, and bring what it raises to Misa as new rounds.

## 2026-10-30: round 5 answered; the queue is empty

**Done.** Recorded round 5: Bait becomes Acorns, with a generic resource library as the source of truth for every resource's name (first task of phase 4, `decisions.md` has the plan); the three battlegrounds accepted and the raid framed as proactive defence in far away places (G-5, compendium `bosses.md`); no sentry post, the raid's information is everyone's from Monday, the Watchtower only the raid's place for now (V-DEF-1, V-DEF-4). Watchtower projects and the Stormglass keystone left `commons.md`. The queue now holds only **targets**, which waits on the economy lab.

**Next.** Phase 1, step 2: posts and the bonfire written in full with example numbers, then the panel with Pia; what it raises goes to Misa as round 6.

## 2026-10-30 (later): posts and the bonfire in full, the panel, round 6

**Done.** Wrote `systems/posts.md` and `systems/bonfire.md` in full with example numbers and worked days, then ran the panel (owner's proxy, Sanni, Joonas, Pia; `reviews/2026-10-30-posts-bonfire.md`). Adopted: the per-seat tool ladder scrapped for kit that tilts output (V-POST-11, V-SCOUT-5); one idle XP rate at posts and at the fire; one catch-up toward the higher of the player's 3rd-best and the server's middle, XP only, fixed at a visit for 24 hours (V-BON-2); three visible skill steps in effective hours, below fit (V-POST-12); no stand-in setting, one tap to fill a raider's seat (V-POST-7); resting creatures' small moments (V-BON-9); no nagging fallback; the one-pass lazy computation (V-POST-14); visit-weighted project sizing and a minimum gift for a completion share (`commons.md`); target T-6 (growth lasts the 12 weeks), with top creatures at about 310 XP a day. Asked round 6: Q16 the couch, Q17 species work perks and weekly demand, Q18 whether one missed day slows the valley.

**Next.** Record round 6. Then phase 1, step 3: the return moment, then scouts and the Forge loop; the economy lab skeleton after those, with Pia's six measurements first.

## 2026-10-30 (evening): round 6 answered

**Done.** Recorded round 6: no couch and no company XP, presence shown at the bonfire (Q16, V-BON-4); gentler away steps, a weekend off costing almost nothing, with candidate curves in `posts.md` and stores of about three days (Q18, V-POST-10, T-2); work identity left open, with research asked for (Q17). A researcher is looking at worker identity against rotation (per-recipe mastery, job mastery that rewards moving on, species work perks).

**Next.** File the research in `docs/research/`, ask **work-identity** as Q19 with it. Then phase 1, step 3: the return moment.
