# Creatures

Status: 2026-10-19. Covers all 30 species, grouped into 14 lines, plus the two Festival creatures and the guest roster. The four Mire species (two lines) are a design draft, in their own section before the Festival creatures.

Read `README.md` for the tags. Every section cites its source. Lines marked `(compendium detail, not shipped)` are new flavour for this file only.

**Source of truth:** the shipped data is `creatures.json` (stats, role, ability), `species-lore.json` (descriptions, traits and the visual brief), `quirks.json` (personality pools) and `finale-abilities.json` (ability effects). Where this file and the data disagree, the data wins. Do not copy numbers from the data into your work; read the file.

## At a glance

| Line        | Stage 1     | Stage 2                   | Element | Role              | Rarity | Where found (catchable stage 1)              |
| ----------- | ----------- | ------------------------- | ------- | ----------------- | ------ | -------------------------------------------- |
| Splashet    | Splashet    | Tidewing or Geyserpup     | Tide    | Setter or Payoff  | Common | Tidepools, Old Crossroads                    |
| Cindle      | Cindle      | Pyrelynx or Wickat        | Ember   | Payoff or Setter  | Common | Ember Caves, Old Crossroads                  |
| Sproutle    | Sproutle    | Thornbuck or Sunfawn      | Grove   | Guard or Support  | Common | Verdant Hollow, Old Crossroads               |
| Zipmouse    | Zipmouse    | Voltaro or Ohmouse        | Spark   | Setter or Guard   | Common | Storm Ridge, Old Crossroads                  |
| Mistnewt    | Mistnewt    | Fogwyrm or Drizzlewt      | Tide    | Guard or Support  | Common | Tidepools, Moonlit Reef                      |
| Ashmole     | Ashmole     | Magmole or Kilnmole       | Ember   | Support or Guard  | Common | Ember Caves, Festival Grounds                |
| Stormray    | Stormray    | Tempestray or Halcyray    | Spark   | Payoff or Support | Rare   | Storm Ridge, Old Crossroads                  |
| Mossback    | Mossback    | Ancientshell or Bloomback | Grove   | Setter or Payoff  | Rare   | Ember Caves, Verdant Hollow                  |
| Coralynx    | Coralynx    | none                      | Tide    | Payoff            | Rare   | Tidepools, Moonlit Reef                      |
| Solmane     | Solmane     | none                      | Ember   | Setter            | Epic   | Ember Caves (deep), Festival Grounds         |
| Gaiadrake   | Gaiadrake   | none                      | Grove   | Payoff            | Epic   | Verdant Hollow (deep), Old Crossroads (deep) |
| Aurorix     | Aurorix     | none                      | Spark   | Support           | Epic   | Storm Ridge (deep), Moonlit Reef (deep)      |
| Lanternfin  | Lanternfin  | none                      | Tide    | Support           | Epic   | Festival only (not catchable)                |
| Hearthshell | Hearthshell | none                      | Ember   | Guard             | Epic   | Festival only (not catchable)                |

`(content: creatures.json, destinations.json)`

**Starters:** Splashet, Cindle and Sproutle. `(content: creatures.json, starter)`

**Evolution:** every line that evolves grows one of two ways, once, for good: Splashet (Tidewing or Geyserpup), Cindle (Pyrelynx or Wickat), Sproutle (Thornbuck or Sunfawn), Zipmouse (Voltaro or Ohmouse), Mistnewt (Fogwyrm or Drizzlewt), Ashmole (Magmole or Kilnmole), Stormray (Tempestray or Halcyray) and Mossback (Ancientshell or Bloomback). The second form is the same element but another role, so each element has all four roles at stage 2 between the lines. A Kept duplicate (a second creature of the line) can grow the other way. The stage 1 forms of Splashet, Cindle, Sproutle, Zipmouse, Mistnewt and Ashmole evolve at level 15 for 20 Essence. Stormray and Mossback evolve at level 15 for 40 Essence. Both forms of a line cost the same. Every other form stops at level 30. `(content: creatures.json, glossary.json "essence", "level")`

**Quirk pools:** each line has a pool of three against-type quirks, keyed by its stage 1 id. Stage 2 forms use their line's pool. A creature's quirk comes from the 40 general quirks about 75% of the time, and from its line's pool about 25% of the time. `(content: quirks.json, design: creatures.md pick rule)`

---

## Splashet line (Tide)

Shallows creatures that splash first and think later. The line marks big foes with Soaked for the team to follow up. `(content: species-lore.json)`

### Splashet (stage 1)

|             |                                       |
| ----------- | ------------------------------------- |
| Element     | Tide                                  |
| Role        | Setter                                |
| Rarity      | Common                                |
| Size        | Small                                 |
| Starter     | Yes                                   |
| Evolves     | Tidewing, at level 15, for 20 Essence |
| Ability     | Tidal Mark                            |
| Where found | Tidepools; Old Crossroads             |

**Lore** `(content: creatures.json flavor)`: "A small, playful creature that leaves wet footprints wherever it goes."

**About** `(content: species-lore.json)`: "A small, round pup of the shallows that splashes first and thinks later. It likes to leave its Soaked mark on a big foe so everyone else can follow up."

**Traits** `(content)`: Playful and splashy. Leaves wet footprints wherever it goes. Easily distracted by anything shiny. Always first to say hello.

**Look** `(content: species-lore.json appearance)`:

- Silhouette: round water-drop body with a pointed tuft on top and four stubby paws.
- Size: small.
- Palette: Splash Blue `#3fa7d6`, Deep Pool `#1f5f8b`, Foam White `#e8fbff`, Belly Sand `#f4e3b8`.
- Features: big round head that blends into the body; one pointed droplet tuft; two large dark eyes; stubby flipper-paws with foam-white toes; cream belly patch.
- Pose: sitting upright, head tilted, one paw lifted mid-splash.
- Always: the droplet tuft; a small puddle or wet footprints beside it.
- Never: wings or fins on the back; sharp teeth or claws.

**Quirk flavour** `(content: quirks.json splashet)`: "Keeps its feet very dry and hates a surprise puddle." / "Prefers to sit quietly and watch the water go by." / "Takes slow, careful baths and cannot be rushed."

**Notes** `(compendium detail, not shipped)`:

- The footprints are the first thing an explorer learns to read. A set of wet prints tells you a Splashet passed this way.
- Its Soaked mark is the line's signature. Splashet is one of the three starters, so its Soaked mark is often the first mark a player sees.

### Tidewing (stage 2)

|           |                            |
| --------- | -------------------------- |
| Element   | Tide                       |
| Role      | Setter                     |
| Rarity    | Common                     |
| Size      | Medium                     |
| Catchable | No (evolves from Splashet) |
| Ability   | Riptide Mark               |

**About** `(content: species-lore.json)`: "Splashet all grown up. Its flippers have stretched into wide, shimmering wings, and it glides over the waves leaving an even bigger splash for its team."

**Traits** `(content)`: Glides whenever there is a breeze. Still playful, just with a bigger splash. Loves to show off its wings. Circles its friends protectively.

**Look** `(content)`:

- Silhouette: teardrop body with two wide wing-fins spread like a manta ray, and a small tail fin.
- Palette: Wing Shimmer `#7fd4f0`, Splash Blue `#3fa7d6`, Deep Pool `#1f5f8b`, Foam White `#e8fbff`, Belly Sand `#f4e3b8`.
- Features: droplet tuft, a little longer; large dark eyes; two wide translucent wing-fins with pale edges; small fish-tail fin; cream belly patch.
- Pose: gliding with both wings open, head tilted down toward the viewer.
- Always: the droplet tuft; wings clearly wider than the body.
- Never: feathers (the wings are fins); paws or legs dangling while it glides.
- Changes from stage 1 `(content, fromStage1)`. Keeps: the droplet tuft, the round teardrop body and cream belly, the big eyes with white highlights, the blue and foam palette. Changes: flipper-paws become wide wing-fins; a tail fin; a lighter shimmer blue; a longer, taller body.

**Quirk flavour:** the Splashet line pool (above).

**Notes** `(compendium detail, not shipped)`: the wings are fins, not feathers. A Tidewing in a breeze is the most "showing off" image the game has.

### Geyserpup (stage 2, second branch of Splashet)

|           |                                                         |
| --------- | ------------------------------------------------------- |
| Element   | Tide                                                    |
| Role      | Payoff                                                  |
| Rarity    | Common                                                  |
| Size      | Medium                                                  |
| Catchable | No (evolves from Splashet, the other way from Tidewing) |
| Ability   | Geyser Burst                                            |

**About** `(content)`: "A sturdy pup whose droplet tuft has grown into a tall spout. It saves up every splash it ever made and lets them all go at the boss in one great burst."

**Traits** `(content)`: Saves its splashes for one big burst. Makes its own puddle, so none is a surprise. Its spout hiccups when it is excited. Still first to say hello, now with a fountain.

**Look** `(content)`:

- Silhouette: round water-drop pup with a tall spout of water where the tuft was, and a few drops arcing away from the top.
- Palette: Splash Blue `#3fa7d6`, Deep Pool `#1f5f8b`, Foam White `#e8fbff`, Spray Blue `#7fd4f0`, Belly Sand `#f4e3b8`.
- Features: round, sturdy pup body, wide at the shoulders; a tall spout of foam and water where the droplet tuft was; loose drops of spray arcing away from the top of the spout; two large dark eyes with one white highlight each; cream belly patch.
- Pose: sitting upright with its chest out, the spout at full height and the spray arcing away.
- Always: the spout where the tuft was; a round pup body.
- Never: wings or wide fins (those are Tidewing's); a pointed tuft: the spout is tall and open at the top.
- Changes from stage 1 `(content, fromStage1)`. Keeps: round water-drop body and cream belly; big dark eyes with white highlights; blue and foam palette; playful, sturdy pup face. Changes: the pointed tuft opens into a tall spout; loose spray arcs away from the top; wider shoulders and a taller body; adds a lighter spray blue.

**Notes** `(compendium detail, not shipped)`: it grows out of the Splashet quirk "Keeps its feet very dry and hates a surprise puddle": a pup that makes its own puddle on purpose, and its pointed droplet tuft finally opens. A common Tide Payoff (before this, the only Tide Payoff was the rare Coralynx): Tidewing is the Setter that marks Soaked, Geyserpup is the one that cashes it in with a single big burst (the same strength as Pyrelynx's strike). The wings stay with Tidewing. Working name (Misa may rename). 16x16 sprite in `species-sprites.ts`.

**Quirk flavour:** the Splashet line pool.

---

## Cindle line (Ember)

Quick, warm hunters that pounce when the moment is right. The line's ember tail is its mark. `(content: species-lore.json)`

### Cindle (stage 1)

|                     |                                                                        |
| ------------------- | ---------------------------------------------------------------------- |
| Element             | Ember                                                                  |
| Role                | Payoff                                                                 |
| Rarity              | Common                                                                 |
| Size                | Small                                                                  |
| Starter             | Yes                                                                    |
| Evolves             | Pyrelynx, at level 15, for 20 Essence                                  |
| Ability             | Flare Strike                                                           |
| Built-in crit bonus | Yes (`creatures.json crit`: a little more crit chance and crit damage) |
| Where found         | Ember Caves; Old Crossroads                                            |

**Lore** `(content: creatures.json flavor)`: "A kitten-sized cat with a flickering ember at the tip of its tail."

**About** `(content: species-lore.json)`: "A kitten-sized cat with a tiny ember at the tip of its tail. It pounces on the boss the moment it spots an opening, and now and then lands a lucky critical hit."

**Traits** `(content)`: Curious and quick to pounce. Warm to the touch and proud of it. Chases flickers and sparks. Purrs like a tiny campfire.

**Look** `(content)`:

- Silhouette: round kitten with two pointed ears and a short tail ending in a flame.
- Size: small.
- Palette: Cinder Orange `#e8582a`, Ember Glow `#ffb347`, Ash Cream `#f6d8b0`, Coal Plum `#5a2a2e`.
- Features: round head and body, nearly the same width; two small pointed ears with darker inner tips; large amber eyes; short tail ending in one flickering ember; cream muzzle and chest.
- Pose: crouched low, rear up, tail flame lifted, ready to pounce.
- Always: the ember at the tail tip; round kitten proportions.
- Never: long fangs or heavy claws; flames covering the whole body.

**Quirk flavour** `(content: quirks.json cindle)`: "Would rather nap in the shade than chase anything." / "Is a little scared of its own sparks." / "Purrs at things it was meant to pounce on."

**Notes** `(compendium detail, not shipped)`: the Cindle's ember is always lit, so it is the line that makes a sprite easy to spot at 1× on a dark panel.

### Pyrelynx (stage 2)

|                     |                          |
| ------------------- | ------------------------ |
| Element             | Ember                    |
| Role                | Payoff                   |
| Rarity              | Common                   |
| Size                | Medium                   |
| Catchable           | No (evolves from Cindle) |
| Ability             | Inferno Strike           |
| Built-in crit bonus | Yes                      |

**About** `(content)`: "A sleek hunter whose fur glows like hot coals when it pounces. It still loves a good chase, but now it waits for the perfect moment to strike."

**Traits** `(content)`: Silent, patient hunter. Pounces only when the moment is perfect. Fiercely loyal to its team. Glows brighter when excited.

**Look** `(content)`:

- Silhouette: lean lynx with tall ear tufts, a long body and a long tail ending in a flame.
- Palette: Coal Orange `#d94a1f`, Glow Orange `#ff9a3d`, Hot Yellow `#ffd36b`, Ash Cream `#f6d8b0`, Coal Plum `#5a2a2e`.
- Features: longer, leaner body; pointed ears with tall dark tufts; amber eyes; long tail ending in a larger ember flame; glowing ember seams along the flanks and legs.
- Pose: mid-pounce, front paws stretched forward, tail flame streaming behind.
- Always: the ear tufts; the ember at the tail tip, larger now.
- Never: round kitten proportions; a full mane or any lion features.
- Changes from stage 1 `(content, fromStage1)`. Keeps: pointed ears and amber eyes; the ember at the tail tip; the orange and cream palette. Changes: the round kitten becomes a lean lynx; ear tufts grow tall; glowing coal seams on the flanks; a larger tail flame.

**Quirk flavour:** the Cindle line pool.

### Wickat (stage 2, second branch of Cindle)

|           |                                                       |
| --------- | ----------------------------------------------------- |
| Element   | Ember                                                 |
| Role      | Setter                                                |
| Rarity    | Common                                                |
| Size      | Medium                                                |
| Catchable | No (evolves from Cindle, the other way from Pyrelynx) |
| Ability   | Slow Burn                                             |

**About** `(content)`: "A kitten-sized cat whose ember has settled into a tall, steady flame, like a lit wick. It touches the boss with it first, so the whole team has something warm to follow up."

**Traits** `(content)`: Carries its flame as steadily as a candle. No longer jumps at its own sparks. Lights the way for slower friends. Purrs a little louder by candlelight.

**Look** `(content)`:

- Silhouette: round kitten with two small ears and a tall, steady flame standing on a short dark wick between them.
- Palette: Cinder Orange `#e8582a`, Ember Glow `#ffb347`, Candle Yellow `#ffe680`, Ash Cream `#f6d8b0`, Coal Plum `#5a2a2e`.
- Features: round head and body, nearly the same width, like Cindle; two small ears with dark plum inner tips; a tall flame in two layers, orange outside and yellow inside, on a short dark wick; two tiny sparks floating beside the flame; cream muzzle and chest.
- Pose: sitting upright and very still, the flame steady and two sparks drifting beside it.
- Always: the tall flame on its wick; round kitten proportions.
- Never: tall ear tufts or a lean body like Pyrelynx's; flames covering the whole body.
- Changes from stage 1 `(content, fromStage1)`. Keeps: round kitten body and cream muzzle; small pointed ears with plum insides; amber eyes; orange and cream palette. Changes: the small ember grows into a tall, steady flame; the flame stands on a short dark wick; two sparks float beside it; adds a candle yellow.

**Notes** `(compendium detail, not shipped)`: it grows out of the Cindle quirk "Is a little scared of its own sparks": it stopped jumping and now carries its flame like a candle. The Ember Setter: it lights the boss (Scorched) for the team before anyone strikes; Pyrelynx is the Payoff that pounces after it. An Ember team wants both, which is what Keep is for. Round kitten body kept on purpose, so it reads as Cindle grown a different way from Pyrelynx. Working name (Misa may rename). 16x16 sprite in `species-sprites.ts`.

**Quirk flavour:** the Cindle line pool.

---

## Sproutle line (Grove)

Shy, sleepy guards that stand close to their friends and take hits for them. `(content: species-lore.json)`

### Sproutle (stage 1)

|             |                                                   |
| ----------- | ------------------------------------------------- |
| Element     | Grove                                             |
| Role        | Guard                                             |
| Rarity      | Common                                            |
| Size        | Small                                             |
| Starter     | Yes                                               |
| Evolves     | Thornbuck or Sunfawn, at level 15, for 20 Essence |
| Ability     | Bark Guard                                        |
| Where found | Verdant Hollow; Old Crossroads                    |

**Lore** `(content: creatures.json flavor)`: "A shy sprout-eared critter that naps in sunny patches of moss."

**About** `(content: species-lore.json)`: "A shy critter with a pair of sprout-shaped ears that naps in sunny patches of moss. It will stand close to its friends and soak up hits for them."

**Traits** `(content)`: Shy around strangers. Naps in any sunny patch. Perks up when it rains. Guards friends by standing close.

**Look** `(content)`:

- Silhouette: soft round bean body with two upright leaf-shaped ears and four tiny feet.
- Size: small.
- Palette: Sprout Green `#5fb04a`, Leaf Light `#b4e26a`, Deep Moss `#2f6b3a`, Petal Cream `#f4eccf`.
- Features: round bean-shaped body, slightly wider than tall; two upright leaf-shaped ears, one with a small curl; sleepy half-closed dark eyes; cream belly and muzzle; tiny stubby feet.
- Pose: curled up on a patch of moss, ears drooped, one eye half open.
- Always: the two leaf-shaped ears; sleepy, gentle eyes.
- Never: thorns or spikes; antlers or horns.

**Quirk flavour** `(content: quirks.json sproutle)`: "Is surprisingly loud the moment it wakes up." / "Dances the second the sun comes out." / "Never naps, and yawns all day to prove it."

**Notes** `(compendium detail, not shipped)`: a Sproutle asleep in the sun is a good "resting" image for an idle screen.

### Thornbuck (stage 2)

|           |                            |
| --------- | -------------------------- |
| Element   | Grove                      |
| Role      | Guard                      |
| Rarity    | Common                     |
| Size      | Large                      |
| Catchable | No (evolves from Sproutle) |
| Ability   | Ironbark Guard             |

**About** `(content)`: "A sturdy stag with branching, thorned antlers that shelter the whole herd. It is calm and slow to anger, and very hard to move once it has dug in."

**Traits** `(content)`: Calm and steady under pressure. Shelters smaller creatures. Stands guard through the night. Slow to anger and hard to move.

**Look** `(content)`:

- Silhouette: broad stag body with tall branching antlers and four strong legs.
- Palette: Sprout Green `#5fb04a`, Deep Moss `#2f6b3a`, Antler Bark `#6b4a2e`, Leaf Light `#b4e26a`, Petal Cream `#f4eccf`.
- Features: broad deer body on four visible legs; tall antlers branching in three tines per side, with small thorns; leaf-shaped ears kept small under the antlers; calm, half-lidded dark eyes; cream chest and belly.
- Pose: standing square and facing forward, head slightly lowered, antlers up.
- Always: the branching thorned antlers; calm, steady eyes.
- Never: a sharp, aggressive face; a tiny, fragile-looking body.
- Changes from stage 1 `(content, fromStage1)`. Keeps: the leaf-green coat, leaf-shaped ears, cream chest and calm, sleepy eyes. Changes: the round bean becomes a broad stag; leaf ears are now small and antlers grow above them; four legs clearly visible; bark brown added.

**Quirk flavour:** the Sproutle line pool.

### Sunfawn (stage 2, second branch of Sproutle)

|           |                                                          |
| --------- | -------------------------------------------------------- |
| Element   | Grove                                                    |
| Role      | Support                                                  |
| Rarity    | Common                                                   |
| Size      | Medium                                                   |
| Catchable | No (evolves from Sproutle, the other way from Thornbuck) |
| Ability   | Sunny Patch                                              |

**About** `(content)`: "A gentle fawn whose leaf ears have opened into blossoms. It curls up beside tired friends and lends them the sun it has soaked up all day."

**Traits** `(content)`: Curls up beside tired friends. Lends its friends the day's sun. Gentle and soft-spoken. Blooms a little more with every kind word.

**Look** `(content)`:

- Silhouette: slender fawn with long legs, two big blossom-tipped ears and a small white-spotted back.
- Palette: Sprout Green `#5fb04a`, Leaf Light `#b4e26a`, Deep Moss `#2f6b3a`, Blossom Pink `#f4a6c0`, Petal Cream `#f4eccf`.
- Features: slender fawn body on four thin legs; two large ears, each opened into a pink blossom at the tip; warm, soft dark eyes with long lashes; cream belly and a pale spotted back; a small yellow glow in the middle of each blossom.
- Pose: lying curled up in a sunny patch, head resting, blossom ears open to the light.
- Always: blossoms where the leaf ears were; soft, kind eyes.
- Never: thorns or antlers; a heavy, armoured body.
- Changes from stage 1 `(content, fromStage1)`. Keeps: the leaf-green coat, the cream belly and muzzle, the sleepy, gentle eyes, the ears as its most notable feature. Changes: the round bean becomes a slender fawn; leaf ears open into pink blossoms; long legs and a spotted back; blossom pink added.

**Notes** `(compendium detail, not shipped)`: it grows out of Sproutle's "Naps in any sunny patch". The healer a Grove team often lacks (as a Grove Support it heals its neighbours a little each round); the Thornbuck is the wall, the Sunfawn the warmth behind it. Working name (Misa may rename). 16x16 sprite in `species-sprites.ts`.

**Quirk flavour:** the Sproutle line pool.

---

## Zipmouse line (Spark)

Tiny, fast and never still. The line strikes first and leaves Charged for the Grove team to ground. `(content: species-lore.json)`

### Zipmouse (stage 1)

|             |                                                 |
| ----------- | ----------------------------------------------- |
| Element     | Spark                                           |
| Role        | Setter                                          |
| Rarity      | Common                                          |
| Size        | Tiny                                            |
| Starter     | No                                              |
| Evolves     | Voltaro or Ohmouse, at level 15, for 20 Essence |
| Ability     | Static Zap                                      |
| Where found | Storm Ridge; Old Crossroads                     |

**Lore** `(content: creatures.json flavor)`: "A tiny mouse that crackles with static and never sits still."

**About** `(content: species-lore.json)`: "A tiny mouse that crackles with static and never sits still. It zips in first and makes the boss Charged, so your Grove friends can ground it."

**Traits** `(content)`: Never sits still. Fizzes with static when excited. Scurries off first, thinks later. Gets the zoomies at the slightest excuse.

**Look** `(content)`:

- Silhouette: tiny round body with two huge round ears and a zigzag tail.
- Size: tiny.
- Palette: Spark Yellow `#f2d12b`, Bright Flash `#fff3a0`, Storm Violet `#6b5bd6`, Night Indigo `#2d2a5e`.
- Features: round body with fluffed fur that sticks out a little; two oversized round ears with violet inner circles; tiny black bead eyes; a tail in a sharp zigzag; small pale flash-coloured belly.
- Pose: mid-scurry, leaning forward, one foot off the ground, tail zigzagging up.
- Always: the zigzag tail; oversized round ears.
- Never: a long, thin pink tail; heavy fur outlines or a grumpy look.

**Quirk flavour** `(content: quirks.json zipmouse)`: "Can freeze like a statue for an hour if asked nicely." / "Walks very slowly when it thinks it is being watched." / "Waits patiently in every queue, which unnerves the others."

**Notes** `(compendium detail, not shipped)`: the Storm Ridge journal calls them "the mice": "The mice zip in ahead of everyone." `(content: journal.json storm-first-in)`

### Voltaro (stage 2)

|           |                            |
| --------- | -------------------------- |
| Element   | Spark                      |
| Role      | Setter                     |
| Rarity    | Common                     |
| Size      | Small                      |
| Catchable | No (evolves from Zipmouse) |
| Ability   | Storm Zap                  |

**About** `(content: creatures.json flavor)`: "A fast and fearless runner that leaves a trail of bright sparks."
**Description** `(content)`: "A fast, fearless runner that leaves a trail of bright sparks. It always wants to be first, and it will race anything that moves for the fun of it."

**Traits** `(content)`: Fast and fearless. Races anything that moves. Always wants a head start. Leaves a trail of sparks.

**Look** `(content)`:

- Silhouette: lean, long-legged mouse with huge ears and a bolt-shaped tail, leaning into a run.
- Palette: Spark Yellow `#f2d12b`, Bright Flash `#fff3a0`, Storm Violet `#6b5bd6`, Night Indigo `#2d2a5e`, Spark Orange `#ffa931`.
- Features: longer legs and a slimmer body; oversized ears with violet inner circles; black bead eyes with a confident frown; a larger lightning-bolt tail; a short trail of sparks behind its feet.
- Pose: full sprint, body low and leaning forward, sparks trailing.
- Always: the zigzag lightning-bolt tail; oversized round ears.
- Never: standing still; a rounder, plumper body than Zipmouse.
- Changes from stage 1 `(content, fromStage1)`. Keeps: huge round ears with violet inner circles, the zigzag tail, the yellow and violet palette, the black bead eyes. Changes: a round blob becomes a lean sprinter; longer legs; a larger bolt tail; a trail of sparks.

**Quirk flavour:** the Zipmouse line pool.

### Ohmouse (stage 2, second branch of Zipmouse)

|           |                                                        |
| --------- | ------------------------------------------------------ |
| Element   | Spark                                                  |
| Role      | Guard                                                  |
| Rarity    | Common                                                 |
| Size      | Small                                                  |
| Catchable | No (evolves from Zipmouse, the other way from Voltaro) |
| Ability   | Static Wall                                            |

**About** `(content)`: "A round, puffed-up mouse whose giant ears catch stray bolts before they reach its friends. It plants its feet, fizzes, and will not budge."

**Traits** `(content)`: Plants its feet and will not budge. Catches stray bolts in its ears. Fizzes when it is determined. Can freeze like a statue when asked nicely.

**Look** `(content)`:

- Silhouette: wide, puffed-up round mouse with two giant ears, short planted feet and a short zigzag tail.
- Palette: Spark Yellow `#f2d12b`, Bright Flash `#fff3a0`, Storm Violet `#6b5bd6`, Night Indigo `#2d2a5e`.
- Features: round, puffed-up body with fur standing out all over; two giant ears wider than the head, with violet inner circles; wide-set short feet planted flat; stubborn black bead eyes under a small frown; tiny sparks fizzing at the ear tips.
- Pose: planted square on both feet, chest out, ears wide and sparks fizzing at the tips.
- Always: giant ears that catch bolts; feet planted flat.
- Never: running or leaning forward; a lean, long-legged body like Voltaro's.
- Changes from stage 1 `(content, fromStage1)`. Keeps: the huge round ears with violet inner circles, the yellow and violet palette, the black bead eyes, the zigzag tail. Changes: the small round body puffs up rounder; the ears grow larger than the head; the feet widen and plant flat; sparks fizz at the ear tips instead of trailing behind.

**Notes** `(compendium detail, not shipped)`: it grows out of the Zipmouse quirk "Can freeze like a statue for an hour if asked nicely". The Guard that protects a Spark Payoff's row; Voltaro is the Setter that starts the Grounding. A Spark-heavy server wants both, which is what Keep is for. Working name (Misa may rename). 16x16 sprite in `species-sprites.ts`.

**Quirk flavour:** the Zipmouse line pool.

---

## Mistnewt line (Tide)

Slow, calm and cosy. The line tucks friends into fog and switches off the boss's counter-move for a few rounds. `(content: species-lore.json)`

### Mistnewt (stage 1)

|             |                                      |
| ----------- | ------------------------------------ |
| Element     | Tide                                 |
| Role        | Guard                                |
| Rarity      | Common                               |
| Size        | Small                                |
| Evolves     | Fogwyrm, at level 15, for 20 Essence |
| Ability     | Fog Veil                             |
| Where found | Tidepools; Moonlit Reef              |

**Lore** `(content: creatures.json flavor)`: "A slow newt that carries a soft cloud of mist on its back."

**About** `(content: species-lore.json)`: "A slow, calm newt that carries a soft cloud of mist on its back. It tucks friends into the fog and turns off the boss's adaptation for a few rounds."

**Traits** `(content)`: Slow and unbothered. Hides friends inside its mist. Loves damp, cool mornings. Takes its time with everything.

**Look** `(content)`:

- Silhouette: chunky, low newt body with a round cloud puff on its back.
- Size: small.
- Palette: Mist Teal `#6fb8b0`, Fog Blue `#a9c7d6`, Deep Pool `#1f5f8b`, Foam White `#e8fbff`.
- Features: wide, low newt body with a short thick tail; one round, fluffy cloud puff on the back; small dark eyes set wide apart; pale fog-blue belly; four short legs with rounded toes.
- Pose: plodding forward, cloud puff slightly bobbing, head low.
- Always: the cloud puff on its back; the wide, low body.
- Never: spikes or a crest on the back; a long, thin body.

**Quirk flavour** `(content: quirks.json mistnewt)`: "Dreams of being a famous racer." / "Complains on damp days and loves a dry one." / "Fusses over its own mist cloud more than anyone."

**Notes** `(compendium detail, not shipped)`: the Moonlit Reef pages describe the newts as the reason the boss "cannot see where to aim" `(content: journal.json reef-fog-newt)`. Keep the fog a cover, not an attack.

### Fogwyrm (stage 2)

|           |                            |
| --------- | -------------------------- |
| Element   | Tide                       |
| Role      | Guard                      |
| Rarity    | Common                     |
| Size      | Large                      |
| Catchable | No (evolves from Mistnewt) |
| Ability   | Dense Fog                  |

**About** `(content)`: "A long, quiet serpent that hides entire valleys in thick, cool fog. Its calm is deep, and so is its fog, so the boss loses its tricks for a good while."
**Flavour** `(content: creatures.json)`: "A long serpent that hides entire valleys in thick, cool fog."

**Traits** `(content)`: Calm and very patient. Drifts through valleys without a sound. Hides friends in thick fog. Prefers misty mornings.

**Look** `(content)`:

- Silhouette: long, S-curved serpent body with a cloud mane running down its spine.
- Palette: Mist Teal `#6fb8b0`, Fog Blue `#a9c7d6`, Deep Pool `#1f5f8b`, Foam White `#e8fbff`, Wyrm Eye `#ffe08a`.
- Features: body curved into an S, filling the frame; a cloud mane of foam-white puffs; small, calm eyes with a pale yellow glow; short rounded snout and two short blunt horns; lighter fog-blue belly with pale scales.
- Pose: coiled in a slow S-curve, head raised and watching, cloud mane drifting.
- Always: the cloud puffs on its back; a long body.
- Never: wings; fire or lightning; sharp or aggressive teeth.
- Changes from stage 1 `(content, fromStage1)`. Keeps: mist teal and fog-blue colours, cloud puffs on the back, small calm eyes, pale belly. Changes: the chunky newt becomes a long serpent; the single puff becomes a full cloud mane; two short horns; fills the whole frame.

**Quirk flavour:** the Mistnewt line pool.

### Drizzlewt (stage 2, second branch of Mistnewt)

|           |                                                        |
| --------- | ------------------------------------------------------ |
| Element   | Tide                                                   |
| Role      | Support                                                |
| Rarity    | Common                                                 |
| Size      | Medium                                                 |
| Catchable | No (evolves from Mistnewt, the other way from Fogwyrm) |
| Ability   | Soft Rain                                              |

**About** `(content)`: "A slow, calm newt whose mist has gathered into a small rain cloud. It drizzles on tired friends, and the boss's tricks wash away like footprints in the rain."

**Traits** `(content)`: Drizzles on friends who need cheering up. Fusses over its cloud and everyone under it. Loves damp, cool mornings. Takes its time, and so does the rain.

**Look** `(content)`:

- Silhouette: chunky low newt body with a wide grey-blue rain cloud above its head and a few drops falling beside it.
- Palette: Mist Teal `#6fb8b0`, Fog Blue `#a9c7d6`, Rain Grey `#8fa9bf`, Foam White `#e8fbff`, Rain Blue `#3fa7d6`.
- Features: wide, low newt body with a short, thick tail; a wide, fluffy cloud above the head, white on top and grey-blue underneath; a few drops falling in a row below the cloud; small dark eyes set wide apart with a white highlight each; pale fog-blue belly.
- Pose: plodding forward under its cloud, head low, a soft rain falling around it.
- Always: the rain cloud above its head; drops falling from the cloud.
- Never: lightning or dark storm clouds: the rain is gentle; a long, thin body.
- Changes from stage 1 `(content, fromStage1)`. Keeps: mist teal body and pale fog-blue belly; wide, low newt body; small dark eyes set wide apart; the cloud as its most notable feature. Changes: the small puff on its back rises into a wide rain cloud; drops fall below the cloud; a grey-blue underside appears; rain blue added to the palette.

**Notes** `(compendium detail, not shipped)`: it grows out of the Mistnewt quirk "Fusses over its own mist cloud more than anyone": the cloud it fusses over has become a rain cloud, and now it fusses over everyone under it. The Tide Support: Tide's only other healer-type is the Festival-only Lanternfin. Fogwyrm is the Guard that hides friends in fog; Drizzlewt is the one that gently cheers them on. The sprite's cloud sits above the head with a clear gap and falling drops, so it reads as rain. Working name (Misa may rename). 16x16 sprite in `species-sprites.ts`.

**Quirk flavour:** the Mistnewt line pool.

---

## Ashmole line (Ember)

Busy diggers who warm the burrow and invite everyone in. They cheer the team on. `(content: species-lore.json)`

### Ashmole (stage 1)

|             |                                      |
| ----------- | ------------------------------------ |
| Element     | Ember                                |
| Role        | Support                              |
| Rarity      | Common                               |
| Size        | Small                                |
| Evolves     | Magmole, at level 15, for 20 Essence |
| Ability     | Warm Glow                            |
| Where found | Ember Caves; Festival Grounds        |

**Lore** `(content: creatures.json flavor)`: "A busy digger that warms its burrow with glowing ash."

**About** `(content: species-lore.json)`: "A busy little digger that warms its burrow with glowing ash and invites everyone in. It cheers on the whole team so they hit a little harder."

**Traits** `(content)`: Busy and hardworking. Digs warm burrows for friends. Hoards cosy things. Cheerful even when covered in ash.

**Look** `(content)`:

- Silhouette: round mole body with a pointed snout and two large shovel paws held out front.
- Size: small.
- Palette: Ash Grey `#8d8a94`, Ember Speck `#ff8a3d`, Warm Brown `#7a4a32`, Glow Yellow `#ffcf6b`, Snout Pink `#f2a0a0`.
- Features: round, plump body in warm brown and ash grey; pointed pink snout; two large shovel paws with pale claws; tiny closed or squinting eyes; orange ember specks over the shoulders.
- Pose: standing upright, shovel paws held up, a little ash puff at its feet.
- Always: the glowing ember specks; large digging paws.
- Never: large, round, wide-open eyes (they stay tiny); wings, tails or spikes.

**Quirk flavour** `(content: quirks.json ashmole)`: "Hates getting its paws dirty." / "Prefers fresh air to tunnels and says so." / "Leaves things half-dug and wanders off to daydream."

**Notes** `(compendium detail, not shipped)`: Ashmole is the only common creature at the Festival Grounds `(content)`, which suits a cheerful digger at a party.

### Magmole (stage 2)

|           |                           |
| --------- | ------------------------- |
| Element   | Ember                     |
| Role      | Support                   |
| Rarity    | Common                    |
| Size      | Medium                    |
| Catchable | No (evolves from Ashmole) |
| Ability   | Magma Glow                |

**About** `(content)`: "A heavy digger that carves tunnels through stone with molten claws and keeps the whole burrow toasty. It is gentle, but very stubborn."

**Traits** `(content)`: Tunnels through anything. Warms the whole burrow. Gentle but very stubborn. Loves a good hard day's work.

**Look** `(content)`:

- Silhouette: wide, heavy mole body with a pointed snout and huge glowing claws.
- Palette: Basalt Grey `#4a3f4a`, Magma Orange `#ff6a2a`, Lava Yellow `#ffc23d`, Warm Brown `#7a4a32`, Snout Pink `#f2a0a0`.
- Features: broader, heavier body; cracked rocky plates over the back with magma seams; pointed pink snout; two huge claws glowing orange and yellow; tiny squinting eyes.
- Pose: digging forward, both glowing claws raised, a small shower of embers behind.
- Always: the glowing claws; cracked rock plating with glowing seams.
- Never: a round, soft ash coat like Ashmole's; wings or long legs.
- Changes from stage 1 `(content, fromStage1)`. Keeps: pointed pink snout, shovel paws, tiny squinting eyes, orange ember glow. Changes: soft ash fur becomes cracked rock plates; paws become large molten claws; a bigger, broader body; a darker basalt colour.

**Quirk flavour:** the Ashmole line pool.

### Kilnmole (stage 2, second branch of Ashmole)

|           |                                                       |
| --------- | ----------------------------------------------------- |
| Element   | Ember                                                 |
| Role      | Guard                                                 |
| Rarity    | Common                                                |
| Size      | Medium                                                |
| Catchable | No (evolves from Ashmole, the other way from Magmole) |
| Ability   | Banked Embers                                         |

**About** `(content)`: "A broad mole in a dome of baked clay, with a small chimney on top that glows like a banked fire. It digs in at the door of the burrow and keeps the heat in for everyone behind it."

**Traits** `(content)`: Bakes its own shell in the embers. Digs in at the door of the burrow. Keeps the heat in for the whole team. Slow to move, slower to give way.

**Look** `(content)`:

- Silhouette: wide, domed mole with a baked-clay shell, a small chimney on top, a pink snout and short sturdy feet.
- Palette: Kiln Clay `#a8542f`, Brick Light `#c97a4a`, Fired Shade `#6b3320`, Clay Cream `#e6c9a0`, Ember Orange `#ff8a3d`.
- Features: broad, round body under a domed shell of baked clay bricks; a small chimney on top with an ember glowing at its mouth; pointed pink snout; tiny squinting eyes; orange ember glints between the bricks.
- Pose: planted square at the door of the burrow, shell low, the chimney glowing.
- Always: the domed clay shell; the small chimney.
- Never: molten claws like Magmole's; a soft ash coat like Ashmole's.
- Changes from stage 1 `(content, fromStage1)`. Keeps: pointed pink snout; tiny squinting eyes; orange ember glints; warm brown colouring. Changes: soft ash fur becomes a domed shell of baked clay; a small chimney glows on top; bigger, broader body; terracotta replaces the ash grey.

**Notes** `(compendium detail, not shipped)`: it grows out of the Ashmole line's burrow lore ("Warms its burrow with glowing ash and invites everyone in") and the quirk "Hates getting its paws dirty": a clean, hard shell of baked clay at last. The Ember Guard the Ember element lacked at stage 2 (Hearthshell is a Festival-only epic). Magmole is the Support that warms the burrow; Kilnmole is the one standing in its doorway. A burrowing, armoured mole, with a small chimney that glows at the top. Working name (Misa may rename). 16x16 sprite in `species-sprites.ts`.

**Quirk flavour:** the Ashmole line pool.

---

## Stormray line (Spark)

Bold, showy rays that ride the edge of the storm. Rare, with a built-in crit bonus. `(content: species-lore.json)`

### Stormray (stage 1)

|                     |                                         |
| ------------------- | --------------------------------------- |
| Element             | Spark                                   |
| Role                | Payoff                                  |
| Rarity              | Rare                                    |
| Size                | Medium                                  |
| Evolves             | Tempestray, at level 15, for 40 Essence |
| Ability             | Thunder Strike                          |
| Built-in crit bonus | Yes                                     |
| Where found         | Storm Ridge; Old Crossroads             |

**Lore** `(content: creatures.json flavor)`: "A ray that rides the edge of thunderclouds."

**About** `(content: species-lore.json)`: "A ray that rides the very edge of thunderclouds. It is bold and a little showy, and it strikes hard and fast with a bolt of its own."

**Traits** `(content)`: Bold and a little showy. Rides the edge of every storm. Loves loud, flashy entrances. Fast to strike, slow to sulk.

**Look** `(content)`:

- Silhouette: flat diamond-shaped body with two wide pointed wings and a bolt-shaped tail.
- Size: medium.
- Palette: Spark Yellow `#f2d12b`, Bright Flash `#fff3a0`, Storm Violet `#6b5bd6`, Night Indigo `#2d2a5e`.
- Features: wide diamond body, wider than tall; two pointed wing-fins with a pale yellow edge; violet back with a lighter yellow belly; two small, sharp white eyes with a yellow glint; thin tail ending in a bolt.
- Pose: soaring sideways, wings level, a small cloud wisp beneath.
- Always: the diamond silhouette; the bolt-shaped tail.
- Never: legs or paws; fire colours.

**Quirk flavour** `(content: quirks.json stormray)`: "Is secretly afraid of thunder." / "Prefers sunny days and says so often." / "Gets shy when it is cheered on."

**Notes** `(compendium detail, not shipped)`: the Storm Ridge page "The edge of the cloud" says the rays "hit exactly where they aimed" `(content: journal.json storm-ray-ride)`, which fits a crit-minded hitter.

### Tempestray (stage 2)

|                     |                            |
| ------------------- | -------------------------- |
| Element             | Spark                      |
| Role                | Payoff                     |
| Rarity              | Rare                       |
| Size                | Large                      |
| Catchable           | No (evolves from Stormray) |
| Ability             | Tempest Strike             |
| Built-in crit bonus | Yes                        |

**About** `(content)`: "A vast ray whose wingbeats stir up whole lightning storms. It is calm in the eye of its own thunder, and it hits harder than any other Spark creature."

**Traits** `(content)`: Calm in the eye of a storm. Commands the sky with lazy wingbeats. Proud, but protective. Attracts storm clouds wherever it goes.

**Look** `(content)`:

- Silhouette: huge diamond body with long swept wings and swirling cloud wisps and bolts around it.
- Palette: Spark Yellow `#f2d12b`, Bright Flash `#fff3a0`, Storm Violet `#6b5bd6`, Night Indigo `#2d2a5e`, Cloud Lilac `#a79af0`.
- Features: wider and longer wings, reaching the frame edges; violet back with a pale yellow belly; calm white eyes with a yellow glint; thicker tail with a large bolt at the tip; curling cloud wisps and a few bolts around the wing tips.
- Pose: wings spread wide, rising slowly, storm clouds swirling at the wing tips.
- Always: the diamond silhouette; a bolt at the tail tip; cloud wisps at the wing tips.
- Never: legs or paws; fire colours.
- Changes from stage 1 `(content, fromStage1)`. Keeps: the diamond body, violet and yellow palette, white eyes with a yellow glint, bolt-shaped tail. Changes: much larger and wider; cloud wisps and bolts circle the wings; a thicker tail with a bigger bolt; a lilac cloud colour.

**Quirk flavour:** the Stormray line pool.

### Halcyray (stage 2, second branch of Stormray)

|           |                                                           |
| --------- | --------------------------------------------------------- |
| Element   | Spark                                                     |
| Role      | Support                                                   |
| Rarity    | Rare                                                      |
| Size      | Large                                                     |
| Catchable | No (evolves from Stormray, the other way from Tempestray) |
| Ability   | Afterglow                                                 |

**About** `(content)`: "A calm ray that glides in just after the storm has passed, trailing a small rainbow. It lends its friends the bright, clear feeling of the sky after thunder."

**Traits** `(content)`: Arrives just as the storm passes. Leaves a small rainbow in its wake. Soft-spoken and bright. Lends its friends the clear sky.

**Look** `(content)`:

- Silhouette: flat diamond-shaped body with soft rounded wings, a small rainbow arc above its head and a ribbon tail.
- Palette: Spark Yellow `#f2d12b`, Bright Flash `#fff3a0`, Storm Violet `#6b5bd6`, Cloud Lilac `#a79af0`, Clear Mint `#7af0c4`.
- Features: wide diamond body that is wider than it is tall; two rounded wing-fins with a pale yellow edge, held low and level; violet back with a lighter yellow belly; calm eyes under a small rainbow arc of lilac and mint; a soft mint ribbon at the tail instead of a bolt.
- Pose: gliding slowly with its wings low and level, the little rainbow arching over its head.
- Always: diamond silhouette; a small rainbow above its head.
- Never: legs or paws; a sharp bolt at the tail (that is Stormray's).
- Changes from stage 1 `(content, fromStage1)`. Keeps: diamond body; violet and yellow palette; pale yellow belly; wings as its widest part. Changes: the bolt tail softens into a mint ribbon; a small rainbow arcs over its head; wing tips are rounded, not pointed; cloud lilac and clear mint added.

**Notes** `(compendium detail, not shipped)`: it grows out of the Stormray quirk "Prefers sunny days and says so often": it now arrives after the storm and brings the sunny day with it (halcyon, a calm and bright time). The Spark Support at the rare tier; Aurorix is the epic one. Tempestray is the Payoff that hits hardest; Halcyray is the gentle one that lends the clear sky. Its small rainbow replaces the bolt. Working name (Misa may rename). 16x16 sprite in `species-sprites.ts`.

**Quirk flavour:** the Stormray line pool.

---

## Mossback line (Grove)

Patient turtles with a garden on the shell. They plant a mark on the boss for the team to build on. `(content: species-lore.json)`

### Mossback (stage 1)

|             |                                           |
| ----------- | ----------------------------------------- |
| Element     | Grove                                     |
| Role        | Setter                                    |
| Rarity      | Rare                                      |
| Size        | Medium                                    |
| Evolves     | Ancientshell, at level 15, for 40 Essence |
| Ability     | Mossy Bloom                               |
| Where found | Ember Caves; Verdant Hollow               |

**Lore** `(content: creatures.json flavor)`: "A patient turtle with a garden growing on its shell."

**About** `(content: species-lore.json)`: "A patient turtle with a small garden growing on its shell. It plants a mark on the boss for friends to build on and keeps its own side of the line tidy."

**Traits** `(content)`: Patient and thoughtful. Tends the garden on its shell. Moves slowly and carefully. Loves sunny rocks.

**Look** `(content)`:

- Silhouette: dome-shaped shell on short legs, with a small head poking out the front.
- Size: medium.
- Palette: Sprout Green `#5fb04a`, Leaf Light `#b4e26a`, Deep Moss `#2f6b3a`, Shell Brown `#8b6b43`, Petal Pink `#f08fa8`.
- Features: round dome shell in mossy green with a darker rim; a small tuft of grass and one tiny pink flower on top; small head with calm dark eyes; short stout legs in lighter olive; warm brown shell lines through the moss.
- Pose: walking slowly forward, head lifted a little, flower swaying.
- Always: the garden on its shell; a single small pink flower.
- Never: a tall tree on its shell; spikes or a snapping beak.

**Quirk flavour** `(content: quirks.json mossback)`: "Taps its foot when anyone else is slow." / "Is always in a hurry, even though it never arrives." / "Pretends to ignore its garden, but checks it twice a day."

**Notes** `(compendium detail, not shipped)`: Mossback is the only Grove creature found in an Ember place, the Ember Caves `(content: destinations.json)`, as well as in its own Verdant Hollow. Its garden is the proof that living things can grow where fire is.

### Ancientshell (stage 2)

|           |                            |
| --------- | -------------------------- |
| Element   | Grove                      |
| Role      | Setter                     |
| Rarity    | Rare                       |
| Size      | Large                      |
| Catchable | No (evolves from Mossback) |
| Ability   | Ancient Bloom              |

**About** `(content)`: "An ancient turtle whose shell has become a small, living forest. It remembers everything, forgives most things, and it plants a mark on the boss while shielding its own row."

**Traits** `(content)`: Wise and endlessly patient. Hosts small creatures in its forest. Remembers everything and forgives most things. Rarely makes a sound, and always kindly.

**Look** `(content)`:

- Silhouette: tall, broad shell with a tiny forest on top, on four thick legs.
- Palette: Deep Moss `#2f6b3a`, Sprout Green `#5fb04a`, Leaf Light `#b4e26a`, Shell Brown `#8b6b43`, Petal Pink `#f08fa8`.
- Features: high dome shell with visible bark-brown rings; two or three tiny trees and a few flowers on top; small wise head with half-closed dark eyes; thick, stout legs in lighter olive; vines hanging down the side of the shell.
- Pose: standing still and facing forward, tiny birds in the trees, a long calm gaze.
- Always: the forest on the shell; calm, half-closed eyes.
- Never: weapons or spikes; a hurried look.
- Changes from stage 1 `(content, fromStage1)`. Keeps: the mossy green shell, pink flowers, short stout legs, calm dark eyes. Changes: the small garden becomes a miniature forest; the shell is taller and has bark rings; hanging vines; much larger.

**Quirk flavour:** the Mossback line pool.

**Note** `(content, lore wording)`: the description says the Ancientshell shields "its own row". The ability shields its own zone. See `README.md`, contradiction 11.

### Bloomback (stage 2, second branch of Mossback)

|           |                                                             |
| --------- | ----------------------------------------------------------- |
| Element   | Grove                                                       |
| Role      | Payoff                                                      |
| Rarity    | Rare                                                        |
| Size      | Large                                                       |
| Catchable | No (evolves from Mossback, the other way from Ancientshell) |
| Ability   | Full Bloom                                                  |

**About** `(content)`: "A patient turtle whose little garden has opened into one enormous flower. It has been saving its bloom since it was small, and when it opens, the boss feels it."

**Traits** `(content)`: Checks its flower twice a day and says it does not. Opens all at once, never a little at a time. Stands very still when the bloom is close. Smells wonderful and pretends not to notice.

**Look** `(content)`:

- Silhouette: dome shell on short legs with one huge pink flower, yellow at its heart, opened across the top.
- Palette: Sprout Green `#5fb04a`, Leaf Light `#b4e26a`, Deep Moss `#2f6b3a`, Shell Brown `#8b6b43`, Petal Pink `#f08fa8`.
- Features: round dome shell in mossy green with brown rings showing through; one huge pink flower with a yellow heart, wider than its head; small head with calm dark eyes with a white highlight each; short stout legs in lighter olive; deeper rose shading between the petals.
- Pose: standing still and facing forward, the great flower fully open.
- Always: the one huge flower; a mossy dome shell.
- Never: a whole forest of trees (that is Ancientshell's); spikes or a snapping beak.
- Changes from stage 1 `(content, fromStage1)`. Keeps: mossy green dome shell; pink flower; short stout legs; calm dark eyes. Changes: the single small flower opens into one huge bloom; a yellow heart appears in the flower; the grass tuft is gone; slightly larger shell.

**Notes** `(compendium detail, not shipped)`: it grows out of the Mossback quirk "Pretends to ignore its garden, but checks it twice a day": all that checking paid off in one great flower. The Grove Payoff at the rare tier (Gaiadrake is the epic one). Ancientshell is the Setter that plants a mark and shields its row; Bloomback strikes the boss with the whole bloom. One bloom, not a forest, so it never looks like Ancientshell. Working name (Misa may rename). 16x16 sprite in `species-sprites.ts`.

**Quirk flavour:** the Mossback line pool.

---

## Coralynx (Tide, rare, single stage)

Elegant reef lynx with a coral crown. It strikes from shadow and rarely misses. `(content: species-lore.json, journal.json)`

|             |                         |
| ----------- | ----------------------- |
| Element     | Tide                    |
| Role        | Payoff                  |
| Rarity      | Rare                    |
| Size        | Medium                  |
| Starter     | No                      |
| Evolves     | No (level cap 30)       |
| Ability     | Coral Lance             |
| Where found | Tidepools; Moonlit Reef |

**Lore** `(content: creatures.json flavor)`: "A reef-dwelling lynx with a crown of bright coral."

**About** `(content: species-lore.json)`: "A reef-dwelling lynx with a crown of bright coral. It is elegant and a little proud, and it strikes from the shadows with a lance of coral."

**Traits** `(content)`: Elegant and a little proud. Patrols its reef at dusk. Moves in quiet, sudden bursts. Fierce about its territory.

**Look** `(content)`:

- Silhouette: slender lynx body with tall, branching coral growing from its head like a crown.
- Size: medium.
- Palette: Reef Teal `#2a9d9f`, Sea Deep `#17506b`, Coral Pink `#ff7f8a`, Foam White `#e8fbff`, Sand Cream `#f4e3b8`.
- Features: slim lynx body in reef teal with darker stripes; a crown of three branching coral tines in coral pink; pointed ears with small dark tufts; bright eyes with a white highlight; foam-white chest and tail tip.
- Pose: stalking forward, one paw lifted, head level, coral crown high.
- Always: the coral crown; the pointed ear tufts.
- Never: heavy armour; a fish tail or fins.

**Quirk flavour** `(content: quirks.json coralynx)`: "Cannot resist a belly rub." / "Is a terrible swimmer and keeps it a secret." / "Misses its pounce, then pretends it meant to."

**Notes** `(compendium detail, not shipped)`: the Reef's "coral cats" are proud of their crowns `(content: journal.json reef-coral-lance)`. Coralynx and Mistnewt are the two creatures found in both the Tidepools and the Moonlit Reef `(content: destinations.json)`.

---

## Solmane (Ember, epic, single stage)

A lion whose mane is sunlight. Warm, regal, and it leads from the front. `(content: species-lore.json)`

|             |                                           |
| ----------- | ----------------------------------------- |
| Element     | Ember                                     |
| Role        | Setter                                    |
| Rarity      | Epic                                      |
| Size        | Large                                     |
| Evolves     | No (level cap 30)                         |
| Ability     | Solar Brand                               |
| Where found | Ember Caves (deep area); Festival Grounds |

**Lore** `(content: creatures.json flavor)`: "A lion with a mane of living sunlight that warms everything near it."

**About** `(content: species-lore.json)`: "A lion with a mane of living sunlight that warms everyone nearby. It is warm-hearted and regal, and it leaves a Scorched mark on the boss as it leads from the front."

**Traits** `(content)`: Warm-hearted and regal. Lights up a room by walking in. Loves to lead from the front. Generous with its warmth.

**Look** `(content)`:

- Silhouette: large lion body with a huge rayed, sun-like mane around its head.
- Size: large.
- Palette: Sun Gold `#ffc933`, Flare Orange `#f27a2a`, Mane Red `#d8452a`, Hearth Cream `#fff0c2`, Deep Rust `#7a2c22`.
- Features: a sun-shaped mane of pointed rays in gold, orange and red; a strong lion body in flare orange; calm dark eyes with a white highlight; cream muzzle and chest; a tail ending in a small golden flame tuft.
- Pose: standing tall, head high, mane fully blazing, one front paw slightly forward.
- Always: the sun-like rayed mane; a warm, calm face.
- Never: cold colours; an angry snarl.

**Quirk flavour** `(content: quirks.json solmane)`: "Prefers moonlight to sunlight." / "Likes quiet nights better than big crowds." / "Is a little afraid of the dark, but denies it."

**Notes** `(compendium detail, not shipped)`: Solmane's "light that walks first" in the deep Ember Caves `(content: journal.json ember-lion-light)` is the strongest image of the line. Its quirks add a nice contrast: it prefers moonlight, and it is a little afraid of the dark but denies it `(content: quirks.json)`.

---

## Gaiadrake (Grove, epic, single stage)

A mountain-sized drake that carries a forest and a river on its back. Slow, ancient and gentle. `(content: species-lore.json)`

|             |                                                        |
| ----------- | ------------------------------------------------------ |
| Element     | Grove                                                  |
| Role        | Payoff                                                 |
| Rarity      | Epic                                                   |
| Size        | Large                                                  |
| Evolves     | No (level cap 30)                                      |
| Ability     | Verdant Roar                                           |
| Where found | Verdant Hollow (deep area); Old Crossroads (deep area) |

**Lore** `(content: creatures.json flavor)`: "A mountain-sized drake wearing forests and rivers along its back."

**About** `(content: species-lore.json)`: "A mountain-sized drake that carries forests and rivers along its back. It is ancient and gentle, slow to move, and very hard to stop when it roars."

**Traits** `(content)`: Ancient and gentle. Carries whole ecosystems on its back. Slow to move, impossible to stop. Protects every living thing it carries.

**Look** `(content)`:

- Silhouette: huge, low drake body with a ridge of trees and a thin river down its back.
- Size: large.
- Palette: Deep Moss `#2f6b3a`, Sprout Green `#5fb04a`, Leaf Light `#b4e26a`, Stone Brown `#6b4a2e`, River Blue `#4aa3d8`.
- Features: wide, heavy drake body in mossy green; a ridge of tiny trees along the back with a river-blue stripe; two short stone-brown horns; calm dark eyes with a white highlight; four short, thick legs and a long tail.
- Pose: standing still and looking forward, head lifted, a calm half-roar.
- Always: trees and a river on the back; short stone-brown horns.
- Never: fire breath; bat-like wings.

**Quirk flavour** `(content: quirks.json gaiadrake)`: "Is easily startled by small birds." / "Is ticklish, and giggles when the wind blows." / "Tries to hide behind trees much smaller than itself."

**Notes** `(compendium detail, not shipped)`: the drake is the Hollow's secret, "something huge sleeps in the deeper area" `(content: glossary.json, former destination text)`. It is also the Old Crossroads' deep secret, so the drake travels.

---

## Aurorix (Spark, epic, single stage)

A slim, floating creature with ribbons of aurora light. Dreamy, quiet and it looks after the team from above. `(content: species-lore.json)`

|             |                                                   |
| ----------- | ------------------------------------------------- |
| Element     | Spark                                             |
| Role        | Support                                           |
| Rarity      | Epic                                              |
| Size        | Medium                                            |
| Evolves     | No (level cap 30)                                 |
| Ability     | Aurora Surge                                      |
| Where found | Storm Ridge (deep area); Moonlit Reef (deep area) |

**Lore** `(content: creatures.json flavor)`: "A graceful creature that trails ribbons of aurora light as it drifts."

**About** `(content: species-lore.json)`: "A graceful creature that drifts above the noise, trailing ribbons of aurora light. It watches over the team from a distance and keeps everyone's spirits high."

**Traits** `(content)`: Graceful and dreamy. Drifts above the noise. Loves quiet, starry nights. Looks after friends from a distance.

**Look** `(content)`:

- Silhouette: slim, floating fox-like body with three long flowing ribbon tails.
- Size: medium.
- Palette: Aurora Violet `#8a6df0`, Spark Yellow `#ffe45e`, Night Plum `#3a2a6e`, Ribbon Mint `#7af0c4`.
- Features: slim, fox-like body in aurora violet with a lighter belly; three long ribbon tails in violet, yellow and mint; tall, pointed ears with yellow tips; calm, narrow eyes with a white highlight; no visible legs, the lower body fades into ribbons.
- Pose: floating gently upward, ribbons in a slow curve, eyes half closed.
- Always: three flowing ribbons; a floating, legless lower body.
- Never: visible walking legs; sharp teeth or claws.

**Quirk flavour** `(content: quirks.json aurorix)`: "Bumps into things when it gets excited." / "Cannot keep quiet and chatters to the stars." / "Secretly wishes it could walk like everyone else."

**Notes** `(compendium detail, not shipped)`: the Storm Ridge page "The watcher above" says "The crowd has never seen its face" `(content: journal.json storm-aurora-watcher)`. Keep the face hidden in art. The Reef's "night singer" might be Aurorix, but the content does not say so (see `threads.md`).

---

## Mire lines (design, not shipped)

Status: 2026-10-19. A design draft from `docs/design/speed-and-dodge.md` section 5.3 and the text drafts in `docs/design/mire-content-drafts.md`. Every fact marked `(design)` is from the design; the lore, looks and quirks are `(compendium detail, not shipped)` until the content slice ships them. Misa asked for a Guard line and a Support line for now; Setter and Payoff Mire lines come later `(design)`.

The sprites are drawn (`apps/activity/src/sprites/data/mire-species-sprites.ts`) but not registered yet: they wait for the species.

### At a glance (Mire)

| Line    | Stage 1 | Stage 2   | Element | Role    | Rarity | Where found (catchable stage 1) |
| ------- | ------- | --------- | ------- | ------- | ------ | ------------------------------- |
| Mudlump | Mudlump | Bogwarden | Mire    | Guard   | Common | Sunken Fen                      |
| Squelch | Squelch | Croakmire | Mire    | Support | Common | Sunken Fen                      |

Neither line branches in the design: each has one stage 2 form. Both evolve at level 15 `(design)`.

---

## Mudlump line (Mire)

Slow, patient lumps of peat that stand in front and let the bog do the rest. The Guard line of Mire. `(design, compendium detail, not shipped)`

### Mudlump (stage 1)

|             |                                                                |
| ----------- | -------------------------------------------------------------- |
| Element     | Mire                                                           |
| Role        | Guard                                                          |
| Rarity      | Common                                                         |
| Size        | Medium                                                         |
| Evolves     | Bogwarden, at level 15 (Essence cost set by the content slice) |
| Ability     | Mud Wall (suggested)                                           |
| Where found | Sunken Fen                                                     |

**About (draft)** `(compendium detail, not shipped; text in mire-content-drafts.md)`: "A squat lump of wet peat with a calm face. It takes its time, takes the hits, and never takes offence."

**Traits (draft)**: Calm and slow, never in a hurry. Takes hits without a fuss. Leaves round footprints in the mud. Naps in any warm puddle.

**Look (draft)**:

- Silhouette: Wide, low mound of peat with a stepped, lumpy top, short stubby legs and a flat bottom.
- Size: medium.
- Palette: Peat Brown `#8a6238`, Mud Light `#b8864a`, Ochre Fleck `#d9a02e`, Belly Cream `#d9bd7e`, Bog Sheen `#4d9c8f`.
- Features: Round mound of peat that steps up in three lumps to a rounded top; two big dark eyes with one white highlight each, set wide and calm; a few ochre flecks on its back, and one teal sheen of oil on the top lump; cream belly patch, and short stubby legs half sunk in a puddle.
- Pose: Sitting low and facing forward, as if it has been there for a hundred years.
- Always: The stepped, lumpy top; calm, wide-set eyes.
- Never: Spikes or sharp edges; a hurried or angry look.

**Quirk flavour (draft)**: "Gets very excited about the smallest puddle." / "Secretly wants to be dry for one whole day." / "Counts its footprints and is never satisfied."

**Notes** `(compendium detail, not shipped)`:

- It is the lowest-Speed creature in the game, so it dodges little and has the most HP. `(design)`
- Signature, from the design: when it takes a hit that is not dodged, it leaves Mired on the attacker. A hit that sticks to the hitter. `(design)`
- The quirk pool leans against its calm: it gets excited about puddles. Working name kept; it hints at its nature, like Splashet.

### Bogwarden (stage 2)

|           |                      |
| --------- | -------------------- |
| Element   | Mire                 |
| Role      | Guard                |
| Rarity    | Common               |
| Size      | Large                |
| Catchable | No (evolves)         |
| Ability   | Bog Hold (suggested) |

**About (draft)** `(compendium detail, not shipped; text in mire-content-drafts.md)`: "A broad, steady warden of the bog, with cattails on its head and tar on its arms. Whatever strikes it gets a little stuck."

**Traits (draft)**: Steady as the bog itself. Stands in front without being asked. Collects reeds and old, smooth stones. Slow to move and slower to give way.

**Look (draft)**:

- Silhouette: Broad, square body with a flat tar helm, two tall cattails on top and heavy plated arms.
- Size: large.
- Palette: Peat Brown `#8a6238`, Mud Light `#b8864a`, Tar Plate `#2a2230`, Cattail Brown `#6b3f22`, Reed Green `#7d8a3c`.
- Features: A flat helm of tar-black plates with a teal oily sheen; two tall cattails growing from the helm, brown heads on green stems; calm dark eyes with one white highlight each, under the helm; heavy tar plates on both arms like old shoulder pads; cream belly patch on a wide, steady body.
- Pose: Standing square and facing forward, arms down, planted like a gatepost.
- Always: The cattails on the helm; tar plates on the arms.
- Never: Weapons or spikes; a fierce face.
- Changes from stage 1. Keeps: peat brown body, wide-set calm eyes, cream belly patch, teal sheen of oil. Changes: the lumpy top becomes a flat tar helm; two cattails sprout from the helm; tar plates appear on both arms; taller and broader, standing instead of sitting.

**Quirk flavour:** the Mudlump line pool.

**Notes** `(compendium detail, not shipped)`:

- The steadfast tank of the bog. A talent in the Mudlump pool resists debuffs (Mud Off Its Back). `(design)`
- The cattails are the proof that something has stood in one place long enough for plants to grow on it. The tar plates are what the bog hardens into on its arms.
- Stage 2 is bigger and broader, not meaner: it still sits still, but now it stands.

---

## Squelch line (Mire)

Small ochre frogs that hum in the damp. They make the boss feel slow and heavy: the Support line of Mire. `(design, compendium detail, not shipped)`

### Squelch (stage 1)

|             |                                                                |
| ----------- | -------------------------------------------------------------- |
| Element     | Mire                                                           |
| Role        | Support                                                        |
| Rarity      | Common                                                         |
| Size        | Medium                                                         |
| Evolves     | Croakmire, at level 15 (Essence cost set by the content slice) |
| Ability     | Squelch Song (suggested)                                       |
| Where found | Sunken Fen                                                     |

**About (draft)** `(compendium detail, not shipped; text in mire-content-drafts.md)`: "A small ochre frog that squelches when it walks and hums when it thinks nobody listens. Its croak makes big foes feel slow and heavy."

**Traits (draft)**: Squelches when it walks. Hums a low tune in the damp. Loves rain and big puddles. Hides in the reeds when watched.

**Look (draft)**:

- Silhouette: Round, wide frog with two bulging brow bumps on top, a very wide mouth and short webbed feet.
- Size: medium.
- Palette: Ochre Hide `#c8962e`, Bright Ochre `#e8c068`, Dark Ochre `#8a5e1e`, Belly Cream `#f0dba0`, Tar Spot `#2a2230`.
- Features: Two round brow bumps on top of the head, lighter on the upper left; big dark eyes with one white highlight each; a very wide, gentle smile; a few dark tar spots on its back; cream belly patch.
- Pose: Sitting upright and facing forward, throat slightly puffed, as if about to hum.
- Always: The wide smile; the two brow bumps.
- Never: Teeth or a long tongue; a sticky or gross look.

**Quirk flavour (draft)**: "Is embarrassed by the sound of its own squelch." / "Will not go near puddles it cannot see the bottom of." / "Pretends to be a stone whenever someone sings."

**Notes** `(compendium detail, not shipped)`:

- The debuffer. Besides its usual Support work, its round-start action leaves Mired on the boss. `(design)`
- Its wide smile and brow bumps make it read as a frog at 16 pixels. The face is the same chibi face as every creature.
- Always humming: the Mire folk say a squelch is the fen's way of saying hello.

### Croakmire (stage 2)

|           |                        |
| --------- | ---------------------- |
| Element   | Mire                   |
| Role      | Support                |
| Rarity    | Common                 |
| Size      | Large                  |
| Catchable | No (evolves)           |
| Ability   | Deep Croak (suggested) |

**About (draft)** `(compendium detail, not shipped; text in mire-content-drafts.md)`: "A big, patient frog with a lily pad on its head and a throat like a drum. One low croak and the boss sinks a little deeper into the mud."

**Traits (draft)**: Croaks low and long. Wears a lily pad like a hat. Makes big foes feel slow and heavy. Calm in any storm.

**Look (draft)**:

- Silhouette: Tall, broad frog with high brow domes, a small lily pad between them and wide webbed feet.
- Size: large.
- Palette: Ochre Hide `#c8962e`, Bright Ochre `#e8c068`, Lily Green `#7d8a3c`, Belly Cream `#f0dba0`, Tar Spot `#2a2230`.
- Features: Two tall brow domes, taller than Squelch's; a small green lily pad sitting between the domes; big dark eyes with one white highlight each, half closed and calm; a wide smile above a puffed cream throat like a drum; wide webbed feet in darker ochre, spread on the mud.
- Pose: Standing tall and facing forward, throat puffed, ready for one long croak.
- Always: The lily pad on its head; the puffed cream throat.
- Never: Teeth or a long tongue; a fierce look.
- Changes from stage 1. Keeps: ochre hide with tar spots, the wide, gentle smile, brow bumps on top of the head, cream belly patch. Changes: the brow bumps grow into tall domes; a lily pad appears between the domes; the throat puffs out like a drum; wide webbed feet, and a much larger body.

**Quirk flavour:** the Squelch line pool.

**Notes** `(compendium detail, not shipped)`:

- Its talents and gear lean to debuff duration and power. `(design)`
- The lily pad is the one thing it will not take off.
- One low croak is all it needs: the boss sinks a little deeper into the mud.

---

## Festival creatures

Two creatures are tied to the Festival: they appear only in Festival weeks, and they are not catchable on normal trips. `(content: creatures.json festival: true, catchable: false; destinations.json festival-grounds)`

Their rule: the Festival Grounds is the Festival week's place, and the Festival creature is the prize for a Festival finale win. `(content: glossary.json "festival", "destination-festival-grounds"; design: creatures.md, a Festival creature is granted on finale win)`

### Lanternfin (Tide, epic, festival)

|             |                    |
| ----------- | ------------------ |
| Element     | Tide               |
| Role        | Support            |
| Rarity      | Epic               |
| Size        | Medium             |
| Catchable   | No (festival only) |
| Ability     | Lantern Glow       |
| Where found | Festival Grounds   |

**Lore** `(content: creatures.json flavor)`: "A fish with a paper-bright lantern for a tail, seen only drifting through festival nights."

**About** `(content: species-lore.json)`: "A round fish with a paper-bright lantern for a tail, seen only on festival nights. It lights the way and lends a hand with a soft, warm glow."

**Traits** `(content)`: Gentle and festive. Guides friends through the dark. Appears only when a party begins. Hums happily when the lantern is lit.

**Look** `(content)`:

- Silhouette: round fish body with a big glowing lantern in place of its tail.
- Size: medium.
- Palette: Lantern Blue `#3b8fd0`, Deep Tide `#1d4f7e`, Foam White `#e8fbff`, Lantern Glow `#ffd27a`, Paper Red `#e0504a`.
- Features: round, chubby fish body in lantern blue; large round eyes with a white highlight; two small side fins; a paper lantern tail in warm glow yellow with a red paper trim; a tiny golden tassel below the lantern.
- Pose: floating upright, tilted slightly toward the viewer, lantern glowing behind.
- Always: the glowing paper lantern tail; a warm yellow glow around it.
- Never: a normal fish tail; sharp teeth.

**Quirk flavour** `(content: quirks.json lanternfin)`: "Is scared of the dark, which is a bit awkward." / "Gets nervous in big festival crowds." / "Falls asleep long before the party ends."

**Notes** `(compendium detail, not shipped)`: "Festival of the tide" is named on the Festival Lantern Charm `(content: gear.json lantern-charm)`, so Lanternfin is the tide half of the festival.

### Hearthshell (Ember, epic, festival)

|             |                    |
| ----------- | ------------------ |
| Element     | Ember              |
| Role        | Guard              |
| Rarity      | Epic               |
| Size        | Large              |
| Catchable   | No (festival only) |
| Ability     | Hearth Ward        |
| Where found | Festival Grounds   |

**Lore** `(content: creatures.json flavor)`: "A tortoise that carries a small bonfire on its shell, and shows up when a festival starts."

**About** `(content: species-lore.json)`: "A tortoise that carries a small bonfire on its shell and shows up when a festival begins. It is calm and warm, and happy to share both with the whole team."

**Traits** `(content)`: Calm, warm and reliable. Hosts friends around its fire. Slow and steady. Happy to share its warmth.

**Look** `(content)`:

- Silhouette: big, broad tortoise with a small bonfire burning on top of its shell.
- Size: large.
- Palette: Terracotta Shell `#b5532c`, Flame Orange `#ff8a2a`, Flame Yellow `#ffd24d`, Stone Cream `#e9d8b8`, Deep Brick `#6b2d22`.
- Features: round terracotta shell with a darker brick rim; a small bonfire in orange and yellow on top; small head with calm dark eyes and a white highlight; four thick cream legs; warm glow on its face from the fire.
- Pose: plodding slowly, head forward, bonfire flickering gently.
- Always: the small bonfire on its shell; a calm face.
- Never: flames covering the whole body; a sharp beak.

**Quirk flavour** `(content: quirks.json hearthshell)`: "Is always a little chilly and asks for a blanket." / "Is always in a hurry, even when carrying a whole house." / "Cannot hold still once the festival music starts."

**Notes** `(compendium detail, not shipped)`: the fire never goes out. `(content: journal.json fest-hearth-ward)` That detail belongs to the page, not the ability; see `README.md`, contradiction 1.

---

## Guest creatures (roster only)

`guests.json` lists three guests. The file gives only a name and a species; no description, look or role is shipped. `(content: guests.json)`

| Guest            | Species  | Element |
| ---------------- | -------- | ------- |
| Guest Warden     | Sproutle | Grove   |
| Guest Tidecaller | Splashet | Tide    |
| Guest Striker    | Stormray | Spark   |

**Notes** `(compendium detail, not shipped)`: the guest names are role titles. Warden, Tidecaller and Striker sound like a guard, a support and a payoff, which matches their species. Who the guests are, and where they come from, is an open thread (see `threads.md`).
