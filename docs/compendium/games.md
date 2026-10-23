# The Valley Games

Status: 2026-10-23. Covers the daily Games as an in-world tradition: the hosts, the meadow and the twelve events, each as something that happens in the valley, and the two retired ones.

Read `README.md` for the tags.

**Source of truth:** `games-events.json` (ids, names, teaser lines, what helps, the commentary lines) and `RULES.games` (when the show plays, experience and medals). `docs/design/valley-games.md` is the design. The numbers stay in the data; this file holds the names, the feeling and the canon.

## The Games as a place and a habit

- Every day the valley holds a show of three events, and on Wednesdays a fourth, the bonus event, whose medals count double at the Prize Stall. Each creature can enter one of them, and one event is for teams of three: a real team sport, where all three play at once (carry a log, push a pumpkin, fill a barrel, stack a tower or fly a kite) and every team plays side by side, so a big field never makes it longer. `(design: valley-games.md)`
- Entries close at the daily reset, and the show plays to everyone a few minutes later. Everyone watches the same moment, and the next day's events are announced at the end. `(design)`
- Each event gives gold, silver and bronze medals. A creature that beats its own best in an event gets a pin. Medals are kept for life and can be spent at the Prize Stall on Wednesdays. `(design)`
- What each event favours is part of its teaser (`favours`): the right element, role, size or knack counts about as much as strength. `(content: games-events.json)`
- Each favour has one line of its own in each event (`favourNotes`), said in the meadow's voice and shown when a player taps the favour's icon: in the Sauna Showdown, "Ember creatures shrug off the heat." No numbers and no stat words. `(content: games-events.json)`
- Level does not matter on the meadow: species, element, role and size do, and of a creature's gear only its knacks (the chance and trigger lines) come along. A creature the event suits wears a green **Good fit** tick in the entry list. `(design: decisions.md, 2026-10-23)`
- A creature that wins an event (gold) earns that event's **badge**, a little medallion in the event's colours with a count of its wins ("Pepper Panic ×3"). Every member of a winning team earns it. `(design)`
- Only creatures their explorers entered that day take part; nobody is entered for them. `(design)`

**Compendium detail, not shipped** (feel):

- _Mood:_ a village fete with a loudspeaker. The Games are silly on purpose. Nobody is hurt, nobody is shamed, and everybody gets a cheer. Losing means a splash, a squash, a pink face or a shiver, and then a towel.
- _Where:_ the **Games Meadow**, a sloping field just off the Old Crossroads, where the travellers' road widens and the grass is flattened every day. The signpost at the Crossroads has an extra board nailed on, pointing at the meadow: "Games, this way". The meadow has a lake at the bottom (the Shark Derby), a hill at the top (the Melon Run), a wooden sauna hut by the water and, along the hedge, the long path where teams carry logs and push pumpkins. Beside the lake there is a pond with a row of barrels, behind the hut a yard of crates, and above the hill the open slope where the kites go up.
- _Who hosts:_ the **Meadow Committee**: a few old explorers who retired from long trips and now run the show. They keep the rubber sharks, roll the melon back up the hill every evening and grow the peppers. Nobody remembers who started it. The committee say it has "always been on".
- _The voice:_ the commentary is a cheerful announcer on a tin loudspeaker, warm, a bit breathless, never mean. It names creatures, never their numbers. It loves an upset.
- _Why everyone enters the small ones:_ the old saying on the meadow is "every creature has one event". The Games are where the quiet creature at the back of the room gets its day.
- _The stands:_ a few rows of benches on the slope. Explorers' creatures who are not entered today sit there and wave.

---

## Events

Twelve events, all live, and two retired. Each is one of nine shapes (`kind` in the data): a room that gets hotter, a run ahead of something rolling, a table of food, laps of a lake, a floe to stay on, a big load hauled by a team, a barrel a team fills, a tower a team stacks and a kite a team flies. `(content)`

### Sauna Showdown

- **Kind:** endure. **Teaser:** "The benches are warm and the stove is hungry. Last one in wins." `(content)`
- **What happens:** everyone sits on the two benches of the sauna hut while the heat rises. A splash of water on the stones fills the room with steam. An Ember creature sometimes gives the stove a poke. Guards take the worst of it for whoever sits beside them, Supports fan their neighbours, and small creatures sit low where it is cooler. When a creature has had enough it walks out of the door. `(content: params, favours)`
- **Compendium detail, not shipped:** the hut is older than the committee. The ladle hangs on a nail by the stove, and whoever is nearest gets to use it, which is how a Tide creature ends up steaming the whole room. Ember creatures do not understand what the fuss is about.

### Frost Bath

- **Kind:** endure, the sauna's opposite. **Teaser:** "An icy pond and a brave crowd. Sit beside an Ember creature and stay toasty." `(content)`
- **What happens:** the same contest in a cold plunge. Tide and Mire creatures shrug off the cold, Ember creatures wilt, and an Ember creature's glow warms its neighbours. Chunks of ice keep going in. `(content)`
- **Compendium detail, not shipped:** the pond is the sauna hut's plunge pool, iced over on purpose with blocks cut from the Tidepools in the morning. Everyone who climbs out gets a towel and a cup of something hot.

### Melon Run

- **Kind:** chase. **Teaser:** "A giant watermelon is rolling down the hill. Run!" `(content)`
- **What happens:** a watermelon taller than any creature rolls down the hill behind the runners, faster and faster. Runners hop logs and puddles or trip over them. A small creature can duck under the curve of the rind once and pop out in front. A caught runner is squashed flat (it is fine, just sticky). Runners who make it under the finish arch are safe, in the order they arrive; then the melon hits the arch and bursts into juice. `(content)`
- **Compendium detail, not shipped:** the melon grows in the committee's patch behind the meadow. It bursts on the arch every day and is somehow whole again by the next morning; nobody asks. The arch is rebuilt each evening from bent willow. Spark creatures love this one.

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

### Floe Sumo

- **Kind:** shove. **Teaser:** "Everyone onto a melting ice floe. Shove, slip and stay dry." `(content)`
- **What happens:** everyone stands on a floe of ice in the lake. It shrinks as it melts (faster with Ember creatures on it), the crowd jostles, and now and then someone shoves a neighbour. The steady keep their footing, small creatures are slippery and hard to move, and anyone over the edge goes splash. Last one on wins. `(content)`
- **Compendium detail, not shipped:** the floe is cut fresh from the Frost Bath ice every afternoon and floated out on a rope. Mire creatures have muddy feet that grip, and they are very proud of it.

### Log Carry

- **Kind:** haul, for teams of three. **Teaser:** "Three friends, one big log, a long path. Keep in step and keep it up." `(content)`
- **What happens:** every team lifts a long log onto their heads and carries it along the hill path, all teams at once, one lane each. The team goes as fast as its slowest carrier, so three who keep in step beat two sprinters and a dawdler. Now and then a log wobbles: a nimble creature keeps it up, a Guard steadies it, and a Setter at the front sets the pace. When a log drops it lands with a thud, sometimes rolling into the team in the next lane, and a Support cheers its friends back up. A Spark creature's crackle jolts the team forward. The first team over the line wins; the rest rank by how far they got. `(content: params, favours)`
- **Compendium detail, not shipped:** the logs are birch trunks from the edge of the Verdant Hollow, stripped and sanded so nobody gets a splinter. Grove creatures say they can feel which way the grain wants to go.

### Pumpkin Push

- **Kind:** haul, for teams of three. **Teaser:** "A pumpkin the size of a hut, and a hill. Push together!" `(content)`
- **What happens:** every team puts its shoulders to a giant pumpkin and pushes it up the path, one behind the other. Strength adds up, the strongest counting most. A slip lets the pumpkin roll back a little and bonk the team beside it; a Guard holds it steady, and big creatures and Mire creatures with their muddy feet push best. `(content)`
- **Compendium detail, not shipped:** the pumpkins grow in the committee's patch next to the melons, fed on something nobody will name. After the race they are carved into lanterns for the meadow.

### Bucket Brigade

- **Kind:** fill, for teams of three. **Teaser:** "A pond, a barrel each and forty seconds. Fill it to the brim!" `(content)`
- **What happens:** every team has its own barrel in the row above the pond, and all three teammates shuttle at once: dip a pail, run it up, pour, run back. Quick creatures make more trips, Tide creatures carry more water, and a Support at the pond helps a teammate refill faster. A pour can slip on the wet grass (a nimble creature keeps its footing), and a big slip can splash into the next team's barrel, which they do not mind at all. An Ember creature at the barrels is hot enough that a little of the next barrel's water steams away. After forty seconds the fullest barrel wins; level barrels share. `(content: params, favours)`
- **Compendium detail, not shipped:** the barrels are the committee's rain barrels, rolled down from the hut every morning, each with a glass front so the crowd can see the water rise. The pails are dented from years of the brigade. Afterwards the barrels water the pepper patch.

### Crate Tower

- **Kind:** stack, for teams of three. **Teaser:** "Stack the crates as high as you dare. Mind the wobble." `(content)`
- **What happens:** every team builds a tower of crates at its own spot in the yard, all at once. The smallest, quickest teammate climbs up and places each crate, one holds the base and one fetches from the pile. Every tower is steady up to a point (higher with sturdy creatures and a Guard at the base, and Grove creatures root it to the ground); above that it wobbles more with every crate, and a wobble that is not held topples the top crate, sometimes onto the next tower. After forty seconds the tallest tower wins; at the same height, the one that got there first. `(content: params, favours)`
- **Compendium detail, not shipped:** the crates are the committee's market crates, stamped with each team's colour in chalk before the start. The record tower is painted on the yard wall, a little higher every year, and nobody believes it.

### Kite Flight

- **Kind:** kite, for teams of three. **Teaser:** "Run, let the string out and ride the wind. Highest kite wins." `(content)`
- **What happens:** every team runs along the slope and flies one kite, all teams side by side. Quick runners lift it higher, and Spark creatures bring their own breeze. A gust can tug a kite down unless an anchor holds the line (a Guard, or a Mire creature with its muddy feet planted). Lightning likes a Spark crew and now and then strikes the highest of their kites, and two kites flying close together can tangle unless someone ducks under the string. After forty seconds the highest kite wins. `(content: params, favours)`
- **Compendium detail, not shipped:** the kites are sewn by the committee from old bunting, one colour per team, and the strings are the same twine that ties the melon arch. Lost kites end up in the trees of the Verdant Hollow, where the Grove creatures keep them.

### Retired events

These were played in the first days of the Games and then taken out of the daily draw (2026-10-23): a team event must be a real team sport, where all three act at once, so a show never gets longer for a bigger team. Stored days and records that name them still show their names. `(design: decisions.md)`

- **Sauna Stack** (endure, for teams of three; retired): each team sat as a stack in one seat of the sauna, one on the head of the other, hotter higher up. The committee's old favourite; the pin board in the hut still lists its records.
- **Shark Relay** (swim, for teams of three; retired): one teammate swam a lap while the others waited on the shore, then tagged the next one in with a wet high five.

## Story hooks (compendium detail, not shipped)

- Who started the Games? The committee's oldest member claims her grandmother did, "after a very boring winter".
- The melon has a name, but only the committee know it.
- Some say the giant pumpkins are cousins of the melon, grown from a seed that blew over the fence.
- A pin board in the sauna hut lists every record ever set. Nobody has ever cleaned it.
