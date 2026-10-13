# Journal: agent key

Status: 2026-10-13. An index of all 40 journal pages in `journal.json`, grouped by place. For each page: its ID, its title, its set (if any), a one-line gist, and the mechanic it quietly hints at.

Read `README.md` for the tags. The page text is shipped and players read it. The gist and the hint are our reading. Each hint is marked `(content)` when the page's text uses the mechanic's own name or wording, and `(inferred)` when we read it into the page.

The glossary says it plainly: "Read closely: the pages hint at how things work." `(content: glossary.json "journal")`

## How to read this key

- **Gist** is what the page says, in one line.
- **Hints at** is the mechanic the page is quietly about. Use it when you write a new page, so the new page points at a real mechanic and not at a made-up one.
- **Set** is the journal set the page belongs to. Finding every page of a set completes it `(content: glossary.json "journal-set")`.
- The pages are short by design. Keep new pages to one scene and one hint.

## Sets at a glance

| Set ID            | Name                | Place          | Pages |
| ----------------- | ------------------- | -------------- | ----- |
| `tide-ledger`     | The Tide Ledger     | Tidepools      | 3     |
| `ash-records`     | The Ash Records     | Ember Caves    | 3     |
| `rootwork-notes`  | Rootwork Notes      | Verdant Hollow | 3     |
| `static-letters`  | Static Letters      | Storm Ridge    | 3     |
| `signpost-series` | The Signpost Series | Old Crossroads | 4     |
| `moonlit-verses`  | Moonlit Verses      | Moonlit Reef   | 3     |
| `lost-pages`      | Lost Pages          | Any place      | 3     |

`(content: journal.json sets)`. The Festival Grounds has no set. The pages without a set are single pages, and the set is optional.

---

## Tidepools (5 pages)

| ID                  | Title          | Set         | Gist                                                                                                                  | Hints at (mechanic)                                                                                                           |
| ------------------- | -------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `tide-first-pool`   | The first pool | Tide Ledger | A tide pup marks a rock crab. A spark-bred friend steps close, and the water cracks with light.                       | **Overload**: a Spark hit on a Soaked boss `(inferred)`.                                                                      |
| `tide-low-water`    | Low water      | Tide Ledger | At low tide the water-folk get bold and quick. The slowest one in the pool is always last to turn around.             | **Turn order by speed**: slowest acts last `(inferred)`.                                                                      |
| `tide-warm-stone`   | Warm stone     | Tide Ledger | A hot rock in a cold pool throws up fog so thick nobody can see their own paws. The loudest one wins.                 | **Steam**: a Tide hit on a Scorched boss `(inferred)`.                                                                        |
| `tide-small-friend` | A small friend | none        | The mist-newts stand at the back and hum. Everyone in front of them stands a little taller.                           | **Support boost** to the neighbours in front `(inferred)`. Note: Mistnewt is a Guard in the data `(content: creatures.json)`. |
| `tide-lucky-hit`    | A lucky hit    | none        | Now and then a splash lands just right and splits the rock. It happens about once in twenty, and never feels planned. | **Crit chance**: a base crit near one in twenty `(inferred, content: glossary.json "crit")`.                                  |

## Ember Caves (5 pages)

| ID                  | Title                  | Set         | Gist                                                                                                                                                 | Hints at (mechanic)                                                                                                                                                                                        |
| ------------------- | ---------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ember-green-mouth` | Green at the mouth     | Ash Records | Vines crept over the cave mouth. One spark, and the whole hillside roared.                                                                           | **Wildfire**: an Ember hit on an Overgrown boss `(inferred)`.                                                                                                                                              |
| `ember-sea-cave`    | Where the sea comes in | Ash Records | A wave rolled into the hot cave and came back as a white wall of fog. Everything glowing went dark.                                                  | **Steam** `(inferred)`.                                                                                                                                                                                    |
| `ember-ash-burrow`  | The ash burrow         | Ash Records | The diggers call everyone into the warm burrow. A team that shares a burrow glows with it for a few rounds, and hits a little harder while it lasts. | **Warm Glow** (Ashmole's ability): a team-wide boost `(inferred)`. The page now matches the ability, which lasts 2 rounds `(content: finale-abilities.json)`. See `README.md`, contradiction 2 (resolved). |
| `ember-lion-light`  | Sunlight in the deep   | none        | Far down, a mane of light walks first, and everyone walks in its glow. It leaves a scorch on whatever it passes.                                     | **Scorched mark** left by Solmane's Solar Brand `(inferred; content: finale-abilities.json solar-brand)`.                                                                                                  |
| `ember-cooling`     | Cooling off            | none        | Even hot rock cools if you wait for the right moment. The ones who rush in early get burned; the ones who wait get paid.                             | **Turn order and setup**: a Setter acts before the creature that cashes the mark in `(content: glossary.json "role-setter")`.                                                                              |

## Verdant Hollow (5 pages)

| ID                       | Title                 | Set            | Gist                                                                                                          | Hints at (mechanic)                                                                                     |
| ------------------------ | --------------------- | -------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `verdant-heavy-bark`     | Heavy bark            | Rootwork Notes | The bark-wardens stand at the front and take the blows, carrying more weight than they look.                  | **Guard in the front zone** `(inferred; content: glossary.json "role-guard", "zone-front")`.            |
| `verdant-roots-and-bolt` | Roots and a bolt      | Rootwork Notes | A charged creature is caught by roots that burst from the ground and pull it down in one flash.               | **Grounding**: a Grove hit on a Charged boss `(inferred)`.                                              |
| `verdant-quiet-garden`   | A garden on a shell   | Rootwork Notes | A turtle with a garden plants a seed in whatever it meets. Others come along and harvest it.                  | **Setter then cash-in**: the Overgrown mark from Mossback is harvested by an Ember hit `(inferred)`.    |
| `verdant-both-ends`      | Brambles at both ends | none           | The old queen of thorns binds the creatures at the ends of the line. The ones in the middle always get out.   | **Silence at both ends** `(content: glossary.json "gimmick-silence-ends"; Thornmother's Bramble Bind)`. |
| `verdant-shield-of-moss` | A wall of moss        | none           | One quiet word and the moss rose into a wall. For a moment, half the hollow could stand in front of anything. | **Shield Wall** on one zone `(inferred; content: finale-abilities.json shield-wall)`.                   |

## Storm Ridge (5 pages)

| ID                     | Title                 | Set            | Gist                                                                                                                 | Hints at (mechanic)                                                                                                   |
| ---------------------- | --------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `storm-lightning-rod`  | The lightning rod     | Static Letters | The king of the clouds always picks out the strongest creature and strikes it first. The weakest walk home unharmed. | **Strongest strike**: the Lightning Rod gimmick `(content: bosses.json, glossary.json "gimmick-strike-highest-atk")`. |
| `storm-first-in`       | First in, first out   | Static Letters | The mice zip in ahead of everyone and leave the sky humming. Whatever follows gets all the credit.                   | **Setter first, cash-in second**: speed and order `(inferred; content: glossary.json "role-setter")`.                 |
| `storm-wet-wire`       | A wet wire            | Static Letters | A drenched beast meets a spark and the whole ridge hums for a full minute. Nobody wants to be next to it.            | **Overload** `(inferred)`.                                                                                            |
| `storm-ray-ride`       | The edge of the cloud | none           | The rays ride the edge of a storm. They hit hard and fast, and most of the time they hit exactly where they aimed.   | **Crit**: Stormray's built-in crit bonus `(inferred; content: creatures.json crit)`.                                  |
| `storm-aurora-watcher` | The watcher above     | none           | Far above the thunder, a ribbon of light keeps everyone's spirits high. The crowd has never seen its face.           | **Aurorix's Aurora Surge**: a team boost and a purge `(inferred; content: finale-abilities.json aurora-surge)`.       |

## Old Crossroads (6 pages)

| ID                       | Title               | Set             | Gist                                                                                                                            | Hints at (mechanic)                                                                                                    |
| ------------------------ | ------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `road-left-to-right`     | Which end first     | Signpost Series | Some beasts take their turn strictly from the left. Others begin at the right end of the road.                                  | **Turn order**: left to right, or right to left `(content: glossary.json "turn-left-to-right", "turn-right-to-left")`. |
| `road-fast-feet`         | Fast feet           | Signpost Series | Some beasts go by pure quickness, and the fastest strikes first.                                                                | **Turn order by speed** `(content: glossary.json "turn-speed")`.                                                       |
| `road-front-middle-back` | Front, middle, back | Signpost Series | A hard blow aimed at the front rarely reaches the back. The ones in the rear stay calm.                                         | **Zones**: the boss's normal attack goes front first `(content: glossary.json "zone-front", "zone-back")`.             |
| `road-who-pays`          | Who pays the toll   | Signpost Series | At every crossing one friend marks the road and another takes the prize. The best teams put the marker first.                   | **Setter before the cash-in** `(content: glossary.json "role-setter", "role-payoff")`.                                 |
| `road-wishing-well`      | The wishing well    | none            | Travellers say the well gives back a little of what you drop in. Three coins buy a better road, and the rest are only for luck. | **Unclear.** Possibly a three-part spend or a three-slot unlock `(inferred; open thread, see `threads.md`)`.           |
| `road-fork-in-fur`       | A fork in the fur   | none            | Two of the same kind rarely walk the same road twice. The second one always comes back a little stronger than the first.        | **Fusion**: a duplicate makes a creature stronger `(content: glossary.json "fusion")`.                                 |

## Moonlit Reef (5 pages)

| ID                  | Title            | Set            | Gist                                                                                                            | Hints at (mechanic)                                                                                                                                                                        |
| ------------------- | ---------------- | -------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `reef-silver-tide`  | The silver tide  | Moonlit Verses | Only at night does the water pull back far enough to show the coral. By morning it is gone.                     | **Night-only access** `(content: destinations.json moonlit-reef access.night)`.                                                                                                            |
| `reef-coral-lance`  | A lance of coral | Moonlit Verses | The coral cats strike from shadow and rarely miss. They are a little proud of their crowns.                     | **Coral Lance**: a strike that still lands `(content: finale-abilities.json coral-lance; glossary.json "ability-strike")`.                                                                 |
| `reef-glowing-wall` | A glowing wall   | Moonlit Verses | At the deepest edge the reef lights up like a wall. Anything behind it takes half the weight of a blow.         | **Halved damage**: a Shield Wall or Fog Veil `(inferred)`.                                                                                                                                 |
| `reef-night-singer` | The night singer | none           | Something sings across the water and makes the boss forget its counter-move for a few breaths.                  | **Purge**: the adaptation is switched off for a while `(inferred; content: finale-abilities.json purge, aurora-surge)`. The singer is unnamed `(content)`. It may be Aurorix `(inferred)`. |
| `reef-fog-newt`     | Fog on the reef  | none           | The newts tuck their friends into fog, and the boss cannot see where to aim. Nobody has ever caught one asleep. | **Fog Veil**: a zone shield plus the adaptation switched off `(content: finale-abilities.json fog-veil)`.                                                                                  |

## Festival Grounds (4 pages)

| ID                    | Title               | Set  | Gist                                                                                                                  | Hints at (mechanic)                                                                                                                                                                                    |
| --------------------- | ------------------- | ---- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fest-paper-lanterns` | Paper lanterns      | none | The lantern fish lights the way and lends a hand. Its glow makes a drenched foe easy to mark again, even in the dark. | **Lantern Glow**: a team boost and a Soaked mark `(content: finale-abilities.json lantern-glow)`.                                                                                                      |
| `fest-hearth-ward`    | The hearth ward     | none | A tortoise with a bonfire on its shell shields a whole row at once for three rounds. The fire never goes out.         | **Hearth Ward**: a zone shield for three rounds `(content: finale-abilities.json hearth-ward)`. Note: the page says "a whole row"; the ability shields its own zone. See `README.md`, contradiction 1. |
| `fest-bunting`        | Bunting and ribbons | none | The festival boss is always a little easier than the last one. Everybody is in too good a mood to be afraid of it.    | **Festival rank**: a Festival boss fights three Ranks lower `(content: glossary.json "festival")`.                                                                                                     |
| `fest-last-night`     | The last night      | none | On the last night the whole meadow goes quiet, then fireworks open the sky, and everyone remembers why they came.     | **The season's last week**: the Festival closes a five-week season `(inferred; content: glossary.json "season")`.                                                                                      |

## Any place (5 pages)

| ID                      | Title                 | Set        | Gist                                                                                                                                    | Hints at (mechanic)                                                                                          |
| ----------------------- | --------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `any-bait-and-patience` | Bait and patience     | Lost Pages | Every explorer learns that the creatures come to the ones who wait, and the quiet ones wait best.                                       | **The idle loop**: trips and Bait `(inferred; content: glossary.json "bait", "away")`.                       |
| `any-rare-hour`         | The rare hour         | Lost Pages | A short walk finds the common ones. A long one finds the rest.                                                                          | **Trip length and rarity** `(inferred; content: push-on-goals.json, supplies.json, glossary.json "rarity")`. |
| `any-old-friend`        | An old friend         | Lost Pages | A creature that comes back often learns the way. After a few trips it finds hidden corners without a lantern.                           | **Familiarity and the deeper area** `(content: glossary.json "familiarity", "deep-area")`.                   |
| `any-boss-adapts`       | It remembers          | none       | Bosses learn. After the first night of a hard fight, the big ones come back with a new trick and a long memory.                         | **Adaptation after Phase 1** `(content: adaptations.json)`.                                                  |
| `any-the-wheel`         | The wheel of elements | none       | Water puts out fire, fire eats the green, the green drinks lightning, and lightning splits the water. The wheel has never once stopped. | **The element wheel** `(content: elements.json)`.                                                            |

---

## Reverse index: by mechanic

Use this when you need a page that hints at one mechanic.

| Mechanic                                 | Pages                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| Overload (Spark on Soaked)               | `tide-first-pool`, `storm-wet-wire`                                                    |
| Steam (Tide on Scorched)                 | `tide-warm-stone`, `ember-sea-cave`                                                    |
| Wildfire (Ember on Overgrown)            | `ember-green-mouth`                                                                    |
| Grounding (Grove on Charged)             | `verdant-roots-and-bolt`                                                               |
| The whole wheel                          | `any-the-wheel`                                                                        |
| Soaked mark (Tide)                       | `tide-first-pool`, `fest-paper-lanterns`                                               |
| Scorched mark (Ember)                    | `ember-lion-light`                                                                     |
| Overgrown mark (Grove)                   | `verdant-quiet-garden`                                                                 |
| Setter then cash-in order                | `ember-cooling`, `road-who-pays`, `storm-first-in`, `verdant-quiet-garden`             |
| Turn order: left to right, right to left | `road-left-to-right`                                                                   |
| Turn order: by speed                     | `tide-low-water`, `road-fast-feet`, `storm-first-in`                                   |
| Front zone and the Guard                 | `verdant-heavy-bark`, `road-front-middle-back`                                         |
| Silence at both ends                     | `verdant-both-ends`                                                                    |
| Shield Wall or Fog Veil (zone shield)    | `verdant-shield-of-moss`, `reef-glowing-wall`, `reef-fog-newt`, `fest-hearth-ward`     |
| Strongest strike (Lightning Rod)         | `storm-lightning-rod`                                                                  |
| Crit                                     | `tide-lucky-hit`, `storm-ray-ride`                                                     |
| Team boost (rally and Warm Glow)         | `ember-ash-burrow`, `storm-aurora-watcher`, `fest-paper-lanterns`, `tide-small-friend` |
| Purge and adaptation                     | `reef-night-singer`, `reef-fog-newt`, `any-boss-adapts`                                |
| Coral Lance strike that lands            | `reef-coral-lance`                                                                     |
| Fusion (duplicates)                      | `road-fork-in-fur`                                                                     |
| Night-only access                        | `reef-silver-tide`                                                                     |
| Festival rank and the season's end       | `fest-bunting`, `fest-last-night`                                                      |
| Trip length and rarity                   | `any-rare-hour`                                                                        |
| Familiarity and the deeper area          | `any-old-friend`                                                                       |
| Bait and the idle loop                   | `any-bait-and-patience`                                                                |
| The Setter and the Guard (roles)         | `ember-cooling`, `verdant-heavy-bark`, `tide-small-friend`                             |

## Reverse index: by place

| Place            | Pages                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Tidepools        | `tide-first-pool`, `tide-low-water`, `tide-warm-stone`, `tide-small-friend`, `tide-lucky-hit`                              |
| Ember Caves      | `ember-green-mouth`, `ember-sea-cave`, `ember-ash-burrow`, `ember-lion-light`, `ember-cooling`                             |
| Verdant Hollow   | `verdant-heavy-bark`, `verdant-roots-and-bolt`, `verdant-quiet-garden`, `verdant-both-ends`, `verdant-shield-of-moss`      |
| Storm Ridge      | `storm-lightning-rod`, `storm-first-in`, `storm-wet-wire`, `storm-ray-ride`, `storm-aurora-watcher`                        |
| Old Crossroads   | `road-left-to-right`, `road-fast-feet`, `road-front-middle-back`, `road-who-pays`, `road-wishing-well`, `road-fork-in-fur` |
| Moonlit Reef     | `reef-silver-tide`, `reef-coral-lance`, `reef-glowing-wall`, `reef-night-singer`, `reef-fog-newt`                          |
| Festival Grounds | `fest-paper-lanterns`, `fest-hearth-ward`, `fest-bunting`, `fest-last-night`                                               |
| Any place        | `any-bait-and-patience`, `any-rare-hour`, `any-old-friend`, `any-boss-adapts`, `any-the-wheel`                             |

**Gaps.** No page is set at Festival Grounds, and no page is about the daily dungeon. Both are good places for new pages (see `threads.md`).
