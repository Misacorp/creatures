# Raid bosses

Status: 2026-10-19. Covers the four raid bosses: lore, look and fighting style. A fifth, Old Bogback (Mire), is a design draft with its own section before "Raid bosses as a set". The daily dungeon's floor bosses are in `dungeon.md`.

Read `README.md` for the tags. Every boss has one element, and the four shipped bosses are the wheel's four forces: Tide, Ember, Grove and Spark. Mire, the fifth element, has Old Bogback (design).

**Source of truth:** `bosses.json` (element, turn order, gimmicks, adaptation), `bosses-lore.json` (description and look), `adaptations.json` (what the adaptation does), and `glossary.json` (how the rules are explained to players). The numbers stay in the data.

## At a glance

| Boss                 | Element | Turn order    | What it does each fight                                                          | Adaptation after Phase 1 |
| -------------------- | ------- | ------------- | -------------------------------------------------------------------------------- | ------------------------ |
| Tidal Colossus       | Tide    | Left to right | Undertow: a zone attack on the front every few rounds                            | Reaction Resistance      |
| Cinder Wyrm          | Ember   | By speed      | Backdraft: turns the first reaction of every round back on the team              | Element Resistance       |
| Thornmother          | Grove   | Right to left | Bramble Bind: silences the creatures at both ends of each row every second round | Reaction Resistance      |
| Storm Sovereign      | Spark   | Left to right | Lightning Rod: strikes the creature with the highest Attack every round          | Element Resistance       |
| Old Bogback (design) | Mire    | Not set yet   | Sinking Mud: a sweep of one row that leaves Mired on every creature in it        | To be set                |

`(content: bosses.json, adaptations.json)`

Each boss keeps its trick from the table and has two new moves, listed under its fighting style below. Each boss also has two **rank-gated moves**: they only join the fight when the server's Boss Rank reaches a number (rank 4 and rank 7 today), so a boss changes how it fights as the ranks climb. These are the moves that punish a way of lining up: a Payoff left out in the open, Payoffs stacked in one row, one carry that does everything, or no Guard to cover. `(content: bosses.json fromRank)` Each boss also has two retreat lines, shown when it pulls back at the end of a phase `(content: bosses.json retreat)`.

All four fight for twelve finale rounds. `(content: bosses.json finaleRounds)` All four are sized **huge** in art, which means about 20 to 24 pixels on a 24 by 24 grid. `(content: bosses-lore.json, m6-look.md, creatures.md)`

### How the adaptation works (content)

After Phase 1, the boss adapts to what worked best for the team:

- **Reaction Resistance:** the reaction your team used most in Phase 1 does half its bonus damage.
- **Element Resistance:** the element that dealt the most damage in Phase 1 does a quarter less.
- A Purge ability switches the adaptation off for a few rounds. `(content: adaptations.json, glossary.json "adaptation")`

"Bosses learn. After the first night of a hard fight, the big ones come back with a new trick and a long memory." `(content: journal.json any-boss-adapts)`

---

## Tidal Colossus (Tide)

### Lore

**Shipped** `(content: bosses-lore.json)`: "A mountain of sea water and barnacled stone that rises from the deep. Every few rounds it drags the front line under with a crushing Undertow."

**Compendium detail, not shipped:**

- It is the oldest of the four bosses, and the one the Tidepools' pools are named for. `(compendium detail, not shipped)` The Tidepools' water is "shallow" `(content: destinations.json)`, so the Colossus rests in the deep water beyond the shelf.
- Its wave-crest shoulders are the first thing seen when the tide turns. `(compendium detail, not shipped)`
- A tide that reaches the front of the row is "the whole line being dragged under." `(compendium detail, not shipped)`

### Look (content, `bosses-lore.json`)

- **Silhouette:** huge hunched giant with broad wave-crest shoulders and long arms that hang to the ground.
- **Size:** huge.
- **Palette:** Deep Tide `#1f5f8b`, Wave Blue `#3fa7d6`, Barnacle Grey `#7b8a96`, Foam White `#e8fbff`, Eye Glow `#9fe3f0`.
- **Features:** a body of dark blue water and barnacled stone; shoulders that curl like breaking waves, topped with foam; two glowing pale-cyan eye pits in a low, heavy brow; long arms with fists like boulders, dripping; a lower body that fades into waves.
- **Pose:** looming forward, arms hanging, one fist rising slowly like a tide.
- **Always:** wave-crest shoulders; glowing eye pits; foam highlights on the water.
- **Never:** fire or lightning; a smile or any friendly look.

### Fighting style

- **Turn order:** left to right, so the creature on the left acts first. `(content)`
- **Undertow:** every few rounds, a zone attack on the front row. "A Guard cannot take it for the others." A Shield Wall on that zone softens it. The stage warns you one round ahead. `(content: bosses.json, glossary.json "gimmick-hit-zone")`
- **Riptide:** every fourth round, one lane, picked at random, is hit through every row from front to back, each row a little softer. A Guard in the lane stops it there. `(content: bosses.json)`
- **Great Wave:** every fifth round, a sweep of the middle row, then the back row, then the front. The row is marked a round ahead. `(content: bosses.json)`
- **Deepwater Spear (from rank 4):** every seventh round, a lance down the lane of your strongest creature, front to back, each row softer. A Guard in the lane stops it. It finds the carry. `(content: bosses.json)`
- **Spring Tide (from rank 7):** every ninth round, announced a round ahead. The row with the most Payoffs is marked, then the tide drops on all of it. A team that packs its Payoffs into one row is the one it finds. `(content: bosses.json)`
- **Adaptation:** Reaction Resistance. A team that leans on one reaction will see it weaken after Phase 1. `(content)`
- **Retreat:** "Tidal Colossus sinks beneath the waves. It will rise again in Phase 2." After Phase 2: "Tidal Colossus sinks back into the deep. Face it in the finale on Sunday." `(content: bosses.json retreat)`

**In-world reading** `(inferred)`: the spear and the spring tide are the sea getting wiser. It learns where the strongest creature stands and where the Payoffs crowd, and goes there. A boss that is "the whole sea" is best met with a broad team and a Shield Wall on the front. Mixing reactions keeps the Colossus's adaptation from settling on one.

---

## Cinder Wyrm (Ember)

### Lore

**Shipped** `(content: bosses-lore.json)`: "A coiling wyrm of black stone and living magma that cooks the air around it. It turns the first reaction of every round back on the team with its Backdraft."

**Compendium detail, not shipped:**

- The wyrm is the forge's oldest heat, the one the Ember Caves' glowing cracks "run across the whole strip like a path" toward. `(compendium detail, not shipped; banner data: destinations.json ember-caves)`
- Its frill of jagged fins rattles like a forge door when it moves. `(compendium detail, not shipped)`
- Its Backdraft is a lesson in timing. The journal's "ember-cooling" page says "the hottest rock cools if you wait for the right moment." `(content: journal.json ember-cooling; the link is inferred)`

### Look (content)

- **Silhouette:** large wyrm coiled in a loose S with a wedge-shaped head and a tall frill of fins.
- **Size:** huge.
- **Palette:** Basalt `#3a2f3a`, Magma Orange `#ff6a2a`, Lava Yellow `#ffc23d`, Ember Red `#c2381e`, Ash Grey `#8d8a94`.
- **Features:** a body of cracked black stone with glowing orange seams; a wedge-shaped head with a mouth glowing yellow-white inside; a tall frill of jagged fins along the head and spine; narrow, slit-pupil eyes in bright yellow; smoke and a few embers drifting from its back.
- **Pose:** coiled and rearing, head lowered toward the viewer, jaw slightly open.
- **Always:** glowing magma seams; a coiled body.
- **Never:** wings; water or ice colours.

### Fighting style

- **Turn order:** by speed. The fastest creature acts first. Equal speed goes to the lower slot. `(content: glossary.json "turn-speed")`
- **Backdraft:** every round, the first reaction is turned back on your team. The boss only takes the normal hit, and the mark is still used up. Later reactions in the same round work as usual. `(content: bosses.json, glossary.json "gimmick-reflect-first-reaction")`
- **Cinder Fall:** every second round, a shell drops on each of two to six random creatures. How many depends on who is still standing. Cover still applies. `(content: bosses.json)`
- **Coil Crush:** every fourth round, a heavy hit on the front-most creature, and the creatures beside it take a share. A Guard can take the hit instead. `(content: bosses.json)`
- **Magma Spit (from rank 4):** every fifth round, a heavy hit on the strongest Payoff, and the creatures beside it take a share. A Guard in that Payoff's row takes it instead. `(content: bosses.json)`
- **Eruption (from rank 7):** every seventh round, announced a round ahead. The whole line is marked, then the forge breaks open under every row. Only a Guard standing beside someone softens it. `(content: bosses.json)`
- **Adaptation:** Element Resistance. The element that did the most damage in Phase 1 does a quarter less. `(content)`
- **Retreat:** "Cinder Wyrm coils down into the cooling stone. It will return in Phase 2." After Phase 2: "Cinder Wyrm slips back into the forge's deep heat. Face it in the finale on Sunday." `(content: bosses.json retreat)`

**In-world reading** `(inferred)`: a team that opens every round with its biggest reaction runs into the Backdraft. Two creatures that can set up a reaction without cashing it, such as a Setter and a Support, can do well here. The later spit seeks the Payoff that cashes the reaction in, so that Payoff wants a Guard in its row.

---

## Thornmother (Grove)

### Lore

**Shipped** `(content: bosses-lore.json)`: "A towering briar queen who mothers every seed and every thorn. Her Bramble Bind snares the creatures at both ends of each row."

**Compendium detail, not shipped:**

- She is the "old queen of thorns" of the Verdant Hollow's pages `(content: journal.json verdant-both-ends)`, and the Hollow is "a green bowl in the hills where the trees seem to lean in and listen" `(content: destinations.json)`. She is the Hollow's listener.
- The little hedges of the dungeon, the Bramble Hound and the Bramble Matron, are her children or kin `(inferred from dungeon-foes.json: "the old hedge that all the little hedges follow")`.
- Her seedlings cling to her skirt of roots. `(content: bosses-lore.json)` Seeds are the Hollow's oldest idea: "A garden on a shell" `(content: journal.json verdant-quiet-garden)`.

### Look (content)

- **Silhouette:** tall, stooped tree-woman with a wide crown of branches and long vine arms reaching forward.
- **Size:** huge.
- **Palette:** Bark Brown `#6b4a2e`, Deep Moss `#2f6b3a`, Thorn Green `#5fb04a`, Leaf Light `#b4e26a`, Bloom Pink `#e86a8a`.
- **Features:** trunk-like body of dark bark with a hollow face; a crown of bare branches with a few pink blooms; long vine arms covered in thorns; two glowing pale-green eyes in the hollow face; a few seedling sprouts clinging to her skirt of roots.
- **Pose:** leaning forward with both vine arms stretched wide, as if to scoop up the whole party.
- **Always:** thorned vines; a crown of branches.
- **Never:** cute or friendly proportions; fire colours.

### Fighting style

- **Turn order:** right to left, so the creature on the right acts first. `(content)`
- **Bramble Bind:** every second round, the creatures at both ends of each row skip their next turn. A silenced Support gives no boost. The stage warns you one round ahead. `(content: bosses.json, glossary.json "gimmick-silence-ends")`
- **Briar Pincer:** every third round, the first and the last creature of every row take a hit. `(content: bosses.json)`
- **Seed Burst:** every fifth round, announced a round ahead. Three to six random creatures are marked, then each takes a hit. `(content: bosses.json)`
- **Choking Vines (from rank 4):** every sixth round, the creatures at both ends of each row skip their next two turns. The ends are usually where a team parks its Support and its Guard. `(content: bosses.json)`
- **Thorn Lash (from rank 7):** every seventh round, the strongest creature is struck, and the lash jumps on to the next three strongest. A Guard in the first one's row takes the first blow. A team built around one carry feels it. `(content: bosses.json)`
- **Adaptation:** Reaction Resistance. `(content)`
- **Retreat:** "Thornmother draws her vines back into the Hollow. She will return in Phase 2." After Phase 2: "Thornmother sinks her roots back into the Hollow. Face her in the finale on Sunday." `(content: bosses.json retreat)`

"The old queen of thorns binds the creatures at the ends of every row. The ones in the middle of a row are always the ones who get out." `(content: journal.json verdant-both-ends)`

**In-world reading** `(inferred)`: silence hits the two ends of each row, and the journal says the middle of a row is where creatures get out. So the creatures you can least afford to lose a turn with belong in the middle, and creatures you can spare can stand at the ends.

---

## Storm Sovereign (Spark)

### Lore

**Shipped** `(content: bosses-lore.json)`: "A crowned king of thunderclouds who looks down on everyone beneath him. His Lightning Rod always picks out the hardest hitter and strikes them first."

**Compendium detail, not shipped:**

- He is the king of the Storm Ridge's weather. The journal's "The lightning rod" page is set there: "The king of the clouds always picks out the strongest creature on the ridge and strikes it first. The weakest walk home unharmed." `(content: journal.json storm-lightning-rod)`
- The Tempestray's wingbeats "stir up whole lightning storms", and the Sovereign is the "king of thunderclouds" `(content: creatures.json, bosses-lore.json)`. Treat them as kin, not the same creature `(inferred)`.
- The Coil Baron, a floor boss in the dungeon, is "a bad-tempered tangle of copper and lightning" `(content: dungeon-foes.json)`. It is a smaller cousin of the Sovereign `(inferred)`.

### Look (content)

- **Silhouette:** wide, floating cloud body with a jagged crown of lightning and a single raised bolt-spear.
- **Size:** huge.
- **Palette:** Storm Violet `#6b5bd6`, Night Indigo `#2d2a5e`, Bolt Yellow `#f2d12b`, Flash White `#fff3a0`, Cloud Grey `#8f94b8`.
- **Features:** body of dark violet thundercloud with a lighter underside; a jagged crown made of yellow lightning bolts; two sharp white eyes under a stern brow; one raised arm holding a long lightning rod; cloud wisps instead of legs.
- **Pose:** hovering with his chin lifted and the lightning rod raised, looking down at the viewer.
- **Always:** the lightning crown; the raised lightning rod.
- **Never:** legs; warm fire colours.

### Fighting style

- **Turn order:** left to right. `(content)`
- **Lightning Rod:** every round, the creature with the highest Attack is struck first. A Guard in its zone takes the hit instead. A Shield Wall on that zone softens it. The strike then arcs to the next two strongest creatures, each hit lighter than the last. `(content: bosses.json, glossary.json "gimmick-strike-highest-atk")`
- **Thunderclap:** every fourth round, a slam on the strongest creature, and the creatures beside it take a share. `(content: bosses.json)`
- **Static Field (from rank 4):** every fifth round, a sweep of the row with the most Payoffs. Charge builds where the Payoffs stand together. `(content: bosses.json)`
- **Judgement Bolt (from rank 7):** every seventh round, a slam on the strongest Payoff, and the creatures beside it take a share. A Guard in that Payoff's row takes it instead. `(content: bosses.json)`
- **Adaptation:** Element Resistance. `(content)`
- **Retreat:** "Storm Sovereign drifts up into the clouds. It will return in Phase 2." After Phase 2: "Storm Sovereign rolls off over the ridge. Face it in the finale on Sunday." `(content: bosses.json retreat)`

**In-world reading** `(inferred)`: the strongest hitter is always the target. A Guard in the same zone, or a Shield Wall on that zone, is how you protect it. From rank 4 the Sovereign also looks for the Payoffs: a Payoff row with no Guard is a lightning rod of its own.

---

## Old Bogback (Mire, design, not shipped)

Status: 2026-10-19. A design draft from `docs/design/speed-and-dodge.md` section 5.4. Facts marked `(design)` are from the design; the rest is `(compendium detail, not shipped)`. The sprite is drawn (`apps/activity/src/sprites/data/mire-boss-sprites.ts`) and waits for the boss to exist. Text drafts: `docs/design/mire-content-drafts.md`.

### Lore

**Draft** `(compendium detail, not shipped)`: "A huge toad, half sunk in the fen and older than its name. Its Sinking Mud smears a whole row, and stuck creatures move slower and hit softer."

**Compendium detail, not shipped:**

- It is the oldest creature of the Sunken Fen, so old that nobody remembers the fen's first name. It sits half sunk in the peat, and the fen has grown around it like a coat. `(inferred from the design: "a huge, half-sunk ancient toad")`
- Its eyes are the only part above the mud that anyone notices, two lamps of ochre gold. The explorers say the fen's old finds (the cart wheel, the gate, the lantern) are what it has swallowed, and kept.
- It is the Mire answer to Mossback: where the turtle carries a garden on its back, the toad carries a whole fen. The names rhyme on purpose.
- It is not unkind. Its Belly Flop is the joke of the set: the boss is not scary, it just sits on someone.

### Look (draft, as in `bosses-lore.json`)

- **Silhouette:** Huge, wide toad head and shoulders rising from the mud, with eye bulges on top and two cattails on the crown.
- **Size:** huge.
- **Palette:** Deep Peat `#4f3822`, Peat Brown `#8a6238`, Ochre Eye `#f2d060`, Tar Black `#2a2230`, Oily Sheen `#4d9c8f`.
- **Features:** A warty peat-brown back with ochre flecks and a few patches of green moss; two big ochre-gold eyes with slit pupils on bulges at the top corners; a very wide, patient mouth drawn as one long dark line; two cattails growing from the crown of its head; the lower body sunk in black tar, with teal and violet oily sheen on the surface.
- **Pose:** Sitting up out of the mud, facing the viewer, hands resting flat in the tar, completely unbothered.
- **Always:** The half-sunk body in tar; gold eyes on bulges at the top corners.
- **Never:** A fierce or angry look; teeth, drool or gore.

### Fighting style `(design)`

- **Turn order:** not set by the design. A suggestion: left to right. Cinder Wyrm moves to the new Serpentine order in the same release; the content slice decides.
- **Sinking Mud:** the trick. A sweep of one row that leaves Mired on every creature in it. Mired cuts Speed (so dodge) and damage, so debuff resistance and Clean coat are worth chasing on this boss's week. `(design)`
- **Belly Flop:** a slam on the strongest creature, with a share on its neighbours. `(draft move)`
- **Shake Off:** a purge: the boss washes every debuff off itself now and then, so a team cannot park Mired at its cap for the whole fight. `(design: "it may also purge itself now and then")`
- **Rising Bubbles (rank-gated):** bubbles rise under some creatures, marked a round ahead, then burst. Swamp gas going up, the same gas Flare sets alight. `(draft move)`
- **Adaptation:** to be set with the content (the design says "an adaptation like the other bosses").
- **Matchups** `(design)`: Spark is neutral against it; Ember teams shine; Tide teams struggle.
- **Retreat (draft):** "Old Bogback sinks slowly into the fen. It will rise again in Phase 2." After Phase 2: "Old Bogback settles back into the peat. Face it in the finale on Sunday."

**In-world reading** `(inferred)`: the bog slows what it holds. Old Bogback does not hit hard so much as make everything heavy, and a team that is held by the feet cannot dodge and cannot hit. Ember is the answer the bog fears, because the gas under it burns. A Guard that resists debuffs, or a Support that washes them off, is how a team keeps its feet.

---

## Raid bosses as a set

- **Shape of the set** `(inferred)`: each boss keeps one of the four old ways a fight can change: a zone attack (Undertow), a reflected reaction (Backdraft), a silence (Bramble Bind), and a targeted strike (Lightning Rod). The new moves add sweeps across rows, shells on random creatures, splashes, lanes, row ends and moves announced a round ahead. The floor bosses in `dungeon.md` reuse these ideas on a smaller scale.
- **Weekly return** `(content: glossary.json "boss-rank", "season", "festival")`: a boss returns each raid week at a Rank. A win raises the Rank by one. A loss keeps it. A Festival week fights three Ranks lower, and pays half again as much Essence.
- **Memory** `(content: journal.json any-boss-adapts)`: bosses remember. Use that in any story about them returning.
