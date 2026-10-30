# The commons: idling together for the whole server

Status: **proposed** (written in full 2026-10-30, for the panel). Accepted by Misa so far: one shared valley where personal and shared progress take turns as the limit (round 1, Q1); gifts counting in full (round 2, Q4); a max level per place, then cosmetic projects, each level harder than the last (round 4, Q12); the bonfire as a communal hearth (Q11); the item level cap raised by many systems, including "really rare finds that players have to collect five of different types, like a Stardew Valley type of thing where you upgrade the community house" (round 11, Q27). Evidence: `docs/research/idle-job-posts.md` ("Co-op idle in a small server"), `docs/research/idle-coop-raids.md`, `docs/research/gear-lottery.md`.

## The question

Misa: "Could players offer some of their own resources for the common good? Could they have creatures out performing tasks that benefit the entire server, not just themselves? Can the places where jobs are done on a server themselves be improved in a communal way, through a ton of common resources or the extremely rare find for specifically this purpose?"

## The idea: three ways to give, one valley to build

The valley's places (the Forge, the Signpost, the Paddock, the School, the bonfire) belong to the whole server. Each has a **server level**, raised by **projects** built from many common gifts. Each also has **collections**: sets of rare finds that the server gathers and sets into the building, Stardew Valley style. And everything the server builds warms the **Forge's fire**: the item level cap of everything made or found (`gear.md` V-GEAR-10). Players give in three ways, all optional:

1. **Resources** on a place's project board (a crate, a scaffold, a donation bowl): Acorns, scrap, shards, Essence.
2. **Creatures** on communal seats, whose work goes to the server's project (haulers at the Forge, road menders at the Signpost, a lamplighter at the bonfire). The creature earns its own XP and skill there.
3. **Rare finds** set into a collection: a find made for the purpose, turned up by scouts, the dungeon, the raid or the fair.

## Rules

### Projects and place levels

- **V-COM-1** Everyone benefits from a place's level, whether or not they gave (F-6). A level adds seats per player (V-COM-10), recipe tiers or better odds, and a visible change to the building (a second chimney, a longer road, banners).
- **V-COM-2** Giving is recognised, never ranked: each level keeps a plaque of who helped build it (names in order of their first gift); no leaderboard of amounts. In the return walk, your own part comes first (V-RET-5).
- **V-COM-3** A thank-you so giving never feels like a pure loss: everyone who gave at least about one day of their own Acorn income to a project gets the same share of its completion gift; an account in its first 7 days gets none (against second accounts).
- **V-COM-4** Projects never fail, decay or expire (F-1); a finished level is kept for good.
- **V-COM-5** Size and pace. Gifts always count in full (round 2, Q4). A project's size is fixed when it opens (a bar never slides back) and scales with the server's active players, counted by how often they visited in the last 7 days (a weekly player counts about 0.4), more slowly than the player count, so a lone player can finish one in weeks, not months. Only the next level's project is open at a time, so a big hoard raises one level, not several. The scene shows who is building and what is still needed, to invite coordination.
- **V-COM-6** The scene shows progress: scaffolding rises as gifts come in; creatures on communal seats are seen working.
- **V-COM-7** A newcomer joins a valley already built up and benefits from day one; the next project is open to them at once (F-7).
- **V-COM-10** Personal and shared progress take turns being the limit (round 1, Q1): a place's level sets each player's limit (anvils, scout seats, School seats); each player unlocks their own up to it.
- **V-COM-11** Each place has a max level (example: 5); each level's project is bigger than the last. After the max, projects are cosmetic: a weathervane, statues, seasonal decorations everyone sees (G-7). New places can open as content at any time.

### Collections

- **V-COM-12** Each place has a few **collections**: a board in the building with five empty sockets, each for a particular rare find of a different kind (example: the Signpost's "Stones of the Roads", one stone from the deeper area of each of five destinations). Each find's source is shown on its socket, so a server can go after it on purpose.
- Rare finds come from many systems: scouts' deeper areas (V-SCOUT-6), each place's keystone clock (V-SCOUT-9), dungeon landmarks, the raid's finale, the fair's Prize Stall. A find is useful only in its socket: it is never a currency.
- Setting a find into its socket is a gift to the server. The find stays in the building for good with its finder's name on it. A second copy of a find already set waits in its finder's satchel for the next collection that asks for it, or melts into a little Essence.
- A completed collection gives the place something its projects cannot (a new recipe family at the Forge, a far road at the Signpost, a visiting teacher's chair at the School) and warms the Forge's fire (V-COM-13). It is told in the return walk as a server moment.
- Collections never expire; a server finishes them at its own pace.

### The Forge's fire: the item level cap

- **V-COM-13** The item level cap (`gear.md` V-GEAR-8, V-GEAR-10) is drawn as the Forge's fire. Everything the server does to grow the valley warms it, each by a step of one or more item levels:
  - a place's level-up (any place, the Forge's most);
  - a completed collection;
  - a raid kill on combat v2's boss track;
  - the server's creatures growing (each time the middle of the active players' top-team levels passes a milestone);
  - and a slow rise with time, so no server ever stalls.
- One bar at the Forge shows the cap, the next modifier threshold (example: "4-pip lines at 60") and what warmed it lately. It never falls. A server that can't beat a raid boss still warms the fire through everything else.

### Communal seats and weekly goals

- **V-COM-14** Communal seats (`posts.md` V-POST-13): one per player per place (example). Their work fills the open project's bar as a steady trickle, worked out lazily and credited when the contributor visits (V-POST-14).
- **V-COM-9** An optional weekly goal now and then (Hay Day's Derby without its leaderboard): a festival project with a cosmetic for everyone who took part, never a penalty for those who did not.
- **V-COM-8** Cheap to run (F-9): one row per project, one per player per project, one per collection socket; gifts and sockets are single writes; the fire's level is one row, updated when anything feeds it.

## Example numbers (the economy lab sets the real ones)

A server of 8 daily players, each earning about 50 Acorns a day and giving about a third of it, plus communal seats: about 150 Acorns' worth a day into projects.

| What                                | Example                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| A place's level 2 project           | about two weeks of a typical server's giving (about 2,000 Acorns' worth)        |
| Each next level                     | x1.6 the last; level 5 about two months in                                      |
| A collection                        | five finds; the first done in about three to four weeks                         |
| The fire: a place level-up          | +2 item levels (the Forge's +4)                                                 |
| The fire: a collection              | +3                                                                              |
| The fire: a raid kill               | +2                                                                              |
| The fire: a growth milestone        | +1 each time the server's middle passes a multiple of 3 levels                  |
| The fire: time                      | +1 a week                                                                       |
| The fire at week 12, typical server | about 45 to 55 (of about 100): 4-pip lines in reach, 5-pip lines a long way off |

## Places, projects and collections (examples)

| Place    | A level gives everyone                            | Common route                   | A collection (five finds)                                         |
| -------- | ------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------- |
| Forge    | an anvil per player, a recipe tier, the most heat | scrap, shards, Acorns, haulers | "The First Fires": a Heartcoal from each element's place          |
| Signpost | a scout seat per player, rarer finds              | Acorns, scrap, road menders    | "Stones of the Roads": one stone from five deeper areas           |
| Paddock  | a keeper seat, new catches arrive stronger        | Acorns, Essence                | "Old Friends": a token from five rare residents                   |
| School   | teacher seats, visitors from further away         | pages, Essence                 | "The Lost Lessons": five journal pages of one set                 |
| Bonfire  | faster growth for every idle creature             | Acorns, a lamplighter          | "Embers of the First Fire": one from the dungeon's five landmarks |

## Questions for the economy lab

- How fast does a server of 5, 8 and 15 players level each place, finish collections and warm the fire over 12 weeks (T-3)?
- What share of a player's resources goes to the commons if they give "when it feels right", and does it starve their own Forge (T-4)?
- Where is the fire at weeks 4, 8 and 12 for a server that wins every raid and one that wins none?
