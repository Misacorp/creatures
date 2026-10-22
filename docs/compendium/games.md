# The Valley Games

Status: 2026-10-22. Covers the daily Games as an in-world tradition: the hosts, the meadow and the nine events, each as something that happens in the valley.

Read `README.md` for the tags.

**Source of truth:** `games-events.json` (ids, names, teaser lines, what helps, the commentary lines) and `RULES.games` (when the show plays, experience and medals). `docs/design/valley-games.md` is the design. The numbers stay in the data; this file holds the names, the feeling and the canon.

## The Games as a place and a habit

- Every day the valley holds a show of four events. Each creature can enter one of them, and one event is for teams of three. `(design: valley-games.md)`
- Entries close at the daily reset, and the show plays to everyone a few minutes later. Everyone watches the same moment, and the next day's events are announced at the end. `(design)`
- Each event gives gold, silver and bronze medals. A creature that beats its own best in an event gets a pin. Medals are kept for life and can be spent at the Prize Stall on Wednesdays. `(design)`
- What each event favours is part of its teaser (`favours`): the right element, role, size or knack counts about as much as strength. `(content: games-events.json)`

**Compendium detail, not shipped** (feel):

- _Mood:_ a village fete with a loudspeaker. The Games are silly on purpose. Nobody is hurt, nobody is shamed, and everybody gets a cheer. Losing means a splash, a squash, a pink face or a shiver, and then a towel.
- _Where:_ the **Games Meadow**, a sloping field just off the Old Crossroads, where the travellers' road widens and the grass is flattened every day. The signpost at the Crossroads has an extra board nailed on, pointing at the meadow: "Games, this way". The meadow has a lake at the bottom (the Shark Derby), a hill at the top (the Melon Run) and a wooden sauna hut by the water.
- _Who hosts:_ the **Meadow Committee**: a few old explorers who retired from long trips and now run the show. They keep the rubber sharks, roll the melon back up the hill every evening and grow the peppers. Nobody remembers who started it. The committee say it has "always been on".
- _The voice:_ the commentary is a cheerful announcer on a tin loudspeaker, warm, a bit breathless, never mean. It names creatures, never their numbers. It loves an upset.
- _Why everyone enters the small ones:_ the old saying on the meadow is "every creature has one event". The Games are where the quiet creature at the back of the room gets its day.
- _The stands:_ a few rows of benches on the slope. Explorers' creatures who are not entered today sit there and wave.

---

## Events

Nine events, all live. Each is one of five shapes (`kind` in the data): a room that gets hotter, a run ahead of something rolling, a table of food, laps of a lake, a floe to stay on. `(content)`

### Sauna Showdown

- **Kind:** endure. **Teaser:** "The benches are warm and the stove is hungry. Last one in wins." `(content)`
- **What happens:** everyone sits on the two benches of the sauna hut while the heat rises. A splash of water on the stones fills the room with steam. An Ember creature sometimes gives the stove a poke. Guards take the worst of it for whoever sits beside them, Supports fan their neighbours, and small creatures sit low where it is cooler. When a creature has had enough it walks out of the door. `(content: params, favours)`
- **Compendium detail, not shipped:** the hut is older than the committee. The ladle hangs on a nail by the stove, and whoever is nearest gets to use it, which is how a Tide creature ends up steaming the whole room. Ember creatures do not understand what the fuss is about.

### Frost Bath

- **Kind:** endure, the sauna's opposite. **Teaser:** "An icy pond and a brave crowd. Sit beside an Ember creature and stay toasty." `(content)`
- **What happens:** the same contest in a cold plunge. Tide and Mire creatures shrug off the cold, Ember creatures wilt, and an Ember creature's glow warms its neighbours. Chunks of ice keep going in. `(content)`
- **Compendium detail, not shipped:** the pond is the sauna hut's plunge pool, iced over on purpose with blocks cut from the Tidepools in the morning. Everyone who climbs out gets a towel and a cup of something hot.

### Sauna Stack

- **Kind:** endure, for teams of three. **Teaser:** "Bring three friends to the bench. Your team lasts as long as its last sitter." `(content)`
- **What happens:** teammates sit together. A team stays in the running while any one of them is still on the bench, so a Guard in the middle shelters both friends. `(content)`
- **Compendium detail, not shipped:** the committee's favourite. Explorers plan their team for it at breakfast.

### Melon Run

- **Kind:** chase. **Teaser:** "A giant watermelon is rolling down the hill. Run!" `(content)`
- **What happens:** a watermelon taller than any creature rolls down the hill behind the runners, faster and faster. Runners hop logs and puddles or trip over them. A small creature can duck under the curve of the rind once and pop out in front. A caught runner is squashed flat (it is fine, just sticky). Furthest run wins. `(content)`
- **Compendium detail, not shipped:** the melon grows in the committee's patch behind the meadow. It is the same melon every day, and nobody knows how it survives. Spark creatures love this one.

### Pepper Panic

- **Kind:** feast. **Teaser:** "Mild, hot or ghost: eat what lands on your plate. Most peppers wins." `(content)`
- **What happens:** two long tables and a pepper on every plate each round: mild, hot or a ghost pepper. A lucky bite is a double gulp, two at once. When a creature can take no more it bursts into flames (harmless, theatrical flames), and the flames can set off its neighbours. The last one still eating keeps going until it goes up too. `(content)`
- **Compendium detail, not shipped:** the peppers come from the Ember Caves, dried on strings along the hut's porch. Tide creatures keep cool through it. The committee keep a jug of milk on every table.

### Berry Bonanza

- **Kind:** feast, the sour version. **Teaser:** "Sour berries by the bowlful. Grove creatures barely pucker." `(content)`
- **What happens:** the same table with bowls of sour berries. A creature that has had too many puckers up so hard that it has to stop. Grove creatures munch a leaf and carry on, Supports share their leaves, and small mouths take small bites. `(content)`
- **Compendium detail, not shipped:** the berries grow along the hedge between the meadow and the road to the Verdant Hollow. Every explorer has tried one as a child and made the same face.

### Shark Derby

- **Kind:** swim. **Teaser:** "Two laps of the lake. The sharks are only rubber, but they bonk hard." `(content)`
- **What happens:** swimmers race laps of the lake while rubber sharks glide round the other way and bonk the nearest swimmer. A nimble swimmer slips past, a tired one is tossed onto the shore. Spark swimmers zap the water and leave their neighbours dizzy. Tide creatures swim fast, Ember creatures slowly. `(content)`
- **Compendium detail, not shipped:** the sharks are wind-up toys the size of a rowing boat, painted grey with a smile. One of the committee winds them up from a jetty. More are added as the race goes on, "to keep it lively".

### Shark Relay

- **Kind:** swim, for teams of three. **Teaser:** "Three swimmers a team, every length counts. Keep away from the rubber sharks." `(content)`
- **What happens:** the Shark Derby with teams: every length any teammate swims counts for the team. `(content)`
- **Compendium detail, not shipped:** the relay ends with the whole team jumping in together, which the committee have stopped trying to prevent.

### Floe Sumo

- **Kind:** shove. **Teaser:** "Everyone onto a melting ice floe. Shove, slip and stay dry." `(content)`
- **What happens:** everyone stands on a floe of ice in the lake. It shrinks as it melts (faster with Ember creatures on it), the crowd jostles, and now and then someone shoves a neighbour. The steady keep their footing, small creatures are slippery and hard to move, and anyone over the edge goes splash. Last one on wins. `(content)`
- **Compendium detail, not shipped:** the floe is cut fresh from the Frost Bath ice every afternoon and floated out on a rope. Mire creatures have muddy feet that grip, and they are very proud of it.

## Story hooks (compendium detail, not shipped)

- Who started the Games? The committee's oldest member claims her grandmother did, "after a very boring winter".
- The melon has a name, but only the committee know it.
- A pin board in the sauna hut lists every record ever set. Nobody has ever cleaned it.
