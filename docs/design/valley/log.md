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

**Next.** The scrap list (lead's work) while round 2 waits; then record round 2 and ask round 3 from the queue (returners, bonfire, place-max).
