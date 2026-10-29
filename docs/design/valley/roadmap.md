# Roadmap

Each phase ends at a **gate**: what must be true before the next phase starts. Misa passes a gate. The current phase is marked; [`log.md`](log.md) says what is happening inside it.

| Phase | What                                                                                                                                                                                                                               | Gate                                                                                         | State                 |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------- |
| 0     | **Foundations.** The valley prototype, the map, the research, this folder.                                                                                                                                                         | Misa likes the valley as the foundation.                                                     | **done** (2026-10-29) |
| 1     | **Design the base systems on paper.** One doc per system (posts, bonfire, return, scouts, Forge loop, School, commons, defence), each through the reviewer panel. The economy lab's model written down.                            | Misa accepts the goals and each system doc's core rules (or sends them back).                | **current**           |
| 2     | **The economy lab.** A pure, deterministic simulation of the proposed rules (`economy/model.md`): a server of players with real habits, 12 weeks, day by day. Reports per week. Tuned against the targets in `goals.md`.           | The targets pass for every player profile; the report reads sensibly to Misa.                | not started           |
| 3     | **Prototype the feel.** In the valley prototype, on fixture data driven by the lab: the return moment with two posts (a scout and the Forge), the bonfire, one communal place upgrade. Panel review at phone and desktop.          | Misa plays it on staging and says it feels like a story, not a to-do list.                   | not started           |
| 4     | **Build the valley frame in the game.** The valley replaces the page navigation behind a flag on staging: places, scenes, the tray, bubbles, the return moment, today's features inside their places. No new economy yet.          | The whole game is playable through the valley on staging; nothing is lost from today's game. | not started           |
| 5     | **Build the base systems.** Posts, the bonfire, scouts, the Forge loop, the School, the commons, server-side and authoritative, priced against the read budget, with migrations. Behind flags, on staging, with bots from the sim. | A staging server runs a simulated month; the lab and the live numbers agree within a margin. | not started           |
| 6     | **Ship.** A season boundary: the valley and the new economy go live together, with a short, fair migration: what carries over is decided with Misa, and anything scrapped leaves its players an "I was there" memento.             | Misa merges.                                                                                 | not started           |
| Later | Cosmetics, housing, decorations; gardening, fishing, stargazing as posts or pastimes; more places and posts. Content on top of the base systems.                                                                                   |                                                                                              | parked                |

## Order inside phase 1 (current)

1. **Question rounds** with Misa ([`deciding.md`](deciding.md), the ledger [`questions.md`](questions.md)): the foundations first (one valley or many, posts instead of timers, how much opening the game matters), then the **scrap list** ([`scrap-list.md`](scrap-list.md): today's game, keep, rework or scrap), then each system's open choices. The goals in [`goals.md`](goals.md) change with each answer.
2. **Posts** and **the bonfire** first: they decide how XP flows, which everything else depends on.
3. **The return moment**: what a player sees and decides; it shapes how outputs are reported.
4. **Scouts** and **the Forge loop**: the first chain (finds feed crafting).
5. **The commons**: contributions, server posts, communal place upgrades.
6. **The School**: last, because it waits on combat v2's talent rework.
7. **The economy model** written once the rules above are drafted, so phase 2 can start.

## Seams with combat v2 (agree before building)

- Creature XP and levels: the bonfire and posts add XP; combat v2 decides what a level is worth in a fight.
- Talents: the School teaches combat v2's talents; their rules, slots and rarity come from that branch.
- The raid: combat v2 owns the weekend's rules; the valley owns the Watchtower, the muster's place and the defence framing.
