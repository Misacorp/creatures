# Mire: player-facing content drafts

Status: **drafts, 2026-10-19.** For the Mire content slice (`docs/design/speed-and-dodge.md` section 5, build step 5). Text only: nothing here is loaded by the game. The slice copies each block into the data file named above it, then checks it with the loaders (`pnpm test`).

Every block was length-checked against the schema limits (descriptions at most 220 characters, glossary `short` at most 80, glossary lines at most 120 each and 4 per entry, trait at most 60, foe flavour at most 120, journal text at most 220, destination flavour at most 120). All the ids are the fixed ids of the design. Display names are new where the design had working names: see "Names" below. Compendium canon for all of this is in `docs/compendium/` (`world.md`, `creatures.md`, `bosses.md`, `dungeon.md`, `places.md`, `items.md`, `talents.md`, `journal.md`, `threads.md`).

Tone rules followed: simple English, short sentences, warm, no violence words, "knocked out", no real-world names. The glossary does use "debuff" once or twice, because the rules need the word, and explains it in plain words.

## Names

| Id                                    | Display name                    | Note                                                                                                                                                     |
| ------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mire`                                | Mire                            | The element.                                                                                                                                             |
| `mudlump`, `bogwarden`                | Mudlump, Bogwarden              | Working names kept. Mudlump is a made-up word that hints at its nature (like Splashet); Bogwarden is a grown-up form with a new ending (like Thornbuck). |
| `squelch`, `croakmire`                | Squelch, Croakmire              | Working names kept. Squelch is a sound, like Zipmouse is a sound; Croakmire is the Fogwyrm kind of name.                                                 |
| `old-bogback`                         | Old Bogback                     | Kept. It rhymes on purpose with Mossback, the turtle that carries a garden: the bog's toad carries the whole fen.                                        |
| `bog-toad`, `tar-leech`, `fen-lurker` | Bog Toad, Tar Leech, Fen Lurker | Descriptor and noun, like Puddle Imp and Bramble Hound. Fen Lurker is the room boss.                                                                     |
| `mud`                                 | **Muddy**                       | Changed from "Mud": the other modifiers are adjectives (Flooded, Scorched, Stormy), so it reads as "Muddy". The id stays `mud`.                          |
| `muddied`                             | Muddied                         | Past-tense state, like Soaked.                                                                                                                           |
| `mired`                               | Mired                           | The status effect.                                                                                                                                       |
| `smother`, `flare`                    | Smother, Flare                  | One word for the event.                                                                                                                                  |
| `sunken-fen`                          | Sunken Fen                      | Plain and descriptive, like Ember Caves.                                                                                                                 |

**Mire's colour family (for the lore test and the element hues):** peat browns and ochres, hue 20 to 50, saturation at least 0.5. The element colour in the UI is `#b8864a` (`--mire`, `ELEMENT_COLOURS.mire`). The dungeon sprite test needs a `mire` entry in its `ELEMENT_HUES` map (use `[20, 50]`), and the lore palette check needs the same range for `mire`.

## 1. Species lore (`species-lore.json`)

Keys are the species ids. Same shape as the existing entries. Stage 1 sizes are `medium` and stage 2 sizes `large`, so the lore test (evolved forms are bigger) holds. The sprites are drawn from these briefs (`apps/activity/src/sprites/data/mire-species-sprites.ts`). The Mire palettes pass "at least two colours in the element's hue family" with the peat and ochre tones.

```json
{
  "mudlump": {
    "description": "A squat lump of wet peat with a calm face. It takes its time, takes the hits, and never takes offence.",
    "appearance": {
      "silhouette": "Wide, low mound of peat with a stepped, lumpy top, short stubby legs and a flat bottom.",
      "size": "medium",
      "palette": [
        {
          "name": "Peat Brown",
          "hex": "#8a6238"
        },
        {
          "name": "Mud Light",
          "hex": "#b8864a"
        },
        {
          "name": "Ochre Fleck",
          "hex": "#d9a02e"
        },
        {
          "name": "Belly Cream",
          "hex": "#d9bd7e"
        },
        {
          "name": "Bog Sheen",
          "hex": "#4d9c8f"
        }
      ],
      "features": [
        "Round mound of peat that steps up in three lumps to a rounded top",
        "Two big dark eyes with one white highlight each, set wide and calm",
        "A few ochre flecks on its back, and one teal sheen of oil on the top lump",
        "Cream belly patch, and short stubby legs half sunk in a puddle"
      ],
      "pose": "Sitting low and facing forward, as if it has been there for a hundred years.",
      "always": ["The stepped, lumpy top", "Calm, wide-set eyes"],
      "never": ["Spikes or sharp edges", "A hurried or angry look"]
    },
    "traits": [
      "Calm and slow, never in a hurry",
      "Takes hits without a fuss",
      "Leaves round footprints in the mud",
      "Naps in any warm puddle"
    ]
  },
  "bogwarden": {
    "description": "A broad, steady warden of the bog, with cattails on its head and tar on its arms. Whatever strikes it gets a little stuck.",
    "appearance": {
      "silhouette": "Broad, square body with a flat tar helm, two tall cattails on top and heavy plated arms.",
      "size": "large",
      "palette": [
        {
          "name": "Peat Brown",
          "hex": "#8a6238"
        },
        {
          "name": "Mud Light",
          "hex": "#b8864a"
        },
        {
          "name": "Tar Plate",
          "hex": "#2a2230"
        },
        {
          "name": "Cattail Brown",
          "hex": "#6b3f22"
        },
        {
          "name": "Reed Green",
          "hex": "#7d8a3c"
        }
      ],
      "features": [
        "A flat helm of tar-black plates with a teal oily sheen",
        "Two tall cattails growing from the helm, brown heads on green stems",
        "Calm dark eyes with one white highlight each, under the helm",
        "Heavy tar plates on both arms like old shoulder pads",
        "Cream belly patch on a wide, steady body"
      ],
      "pose": "Standing square and facing forward, arms down, planted like a gatepost.",
      "always": ["The cattails on the helm", "Tar plates on the arms"],
      "never": ["Weapons or spikes", "A fierce face"],
      "fromStage1": {
        "keeps": [
          "Peat brown body",
          "Wide-set calm eyes",
          "Cream belly patch",
          "Teal sheen of oil"
        ],
        "changes": [
          "The lumpy top becomes a flat tar helm",
          "Two cattails sprout from the helm",
          "Tar plates appear on both arms",
          "Taller and broader, standing instead of sitting"
        ]
      }
    },
    "traits": [
      "Steady as the bog itself",
      "Stands in front without being asked",
      "Collects reeds and old, smooth stones",
      "Slow to move and slower to give way"
    ]
  },
  "squelch": {
    "description": "A small ochre frog that squelches when it walks and hums when it thinks nobody listens. Its croak makes big foes feel slow and heavy.",
    "appearance": {
      "silhouette": "Round, wide frog with two bulging brow bumps on top, a very wide mouth and short webbed feet.",
      "size": "medium",
      "palette": [
        {
          "name": "Ochre Hide",
          "hex": "#c8962e"
        },
        {
          "name": "Bright Ochre",
          "hex": "#e8c068"
        },
        {
          "name": "Dark Ochre",
          "hex": "#8a5e1e"
        },
        {
          "name": "Belly Cream",
          "hex": "#f0dba0"
        },
        {
          "name": "Tar Spot",
          "hex": "#2a2230"
        }
      ],
      "features": [
        "Two round brow bumps on top of the head, lighter on the upper left",
        "Big dark eyes with one white highlight each",
        "A very wide, gentle smile",
        "A few dark tar spots on its back",
        "Cream belly patch"
      ],
      "pose": "Sitting upright and facing forward, throat slightly puffed, as if about to hum.",
      "always": ["The wide smile", "The two brow bumps"],
      "never": ["Teeth or a long tongue", "A sticky or gross look"]
    },
    "traits": [
      "Squelches when it walks",
      "Hums a low tune in the damp",
      "Loves rain and big puddles",
      "Hides in the reeds when watched"
    ]
  },
  "croakmire": {
    "description": "A big, patient frog with a lily pad on its head and a throat like a drum. One low croak and the boss sinks a little deeper into the mud.",
    "appearance": {
      "silhouette": "Tall, broad frog with high brow domes, a small lily pad between them and wide webbed feet.",
      "size": "large",
      "palette": [
        {
          "name": "Ochre Hide",
          "hex": "#c8962e"
        },
        {
          "name": "Bright Ochre",
          "hex": "#e8c068"
        },
        {
          "name": "Lily Green",
          "hex": "#7d8a3c"
        },
        {
          "name": "Belly Cream",
          "hex": "#f0dba0"
        },
        {
          "name": "Tar Spot",
          "hex": "#2a2230"
        }
      ],
      "features": [
        "Two tall brow domes, taller than Squelch's",
        "A small green lily pad sitting between the domes",
        "Big dark eyes with one white highlight each, half closed and calm",
        "A wide smile above a puffed cream throat like a drum",
        "Wide webbed feet in darker ochre, spread on the mud"
      ],
      "pose": "Standing tall and facing forward, throat puffed, ready for one long croak.",
      "always": ["The lily pad on its head", "The puffed cream throat"],
      "never": ["Teeth or a long tongue", "A fierce look"],
      "fromStage1": {
        "keeps": [
          "Ochre hide with tar spots",
          "The wide, gentle smile",
          "Brow bumps on top of the head",
          "Cream belly patch"
        ],
        "changes": [
          "The brow bumps grow into tall domes",
          "A lily pad appears between the domes",
          "The throat puffs out like a drum",
          "Wide webbed feet, and a much larger body"
        ]
      }
    },
    "traits": [
      "Croaks low and long",
      "Wears a lily pad like a hat",
      "Makes big foes feel slow and heavy",
      "Calm in any storm"
    ]
  }
}
```

### Against-type quirks (`quirks.json`, `againstType`, keyed by the stage 1 id)

The loader requires 2 to 3 per evolution line, each at most 60 characters, ending in a full stop, with ids unique across the file.

```json
{
  "mudlump": [
    {
      "id": "mudlump-puddle-fan",
      "text": "Gets very excited about the smallest puddle."
    },
    {
      "id": "mudlump-dry-wish",
      "text": "Secretly wants to be dry for one whole day."
    },
    {
      "id": "mudlump-footprint-count",
      "text": "Counts its footprints and is never satisfied."
    }
  ],
  "squelch": [
    {
      "id": "squelch-shy-of-squelch",
      "text": "Is embarrassed by the sound of its own squelch."
    },
    {
      "id": "squelch-deep-water",
      "text": "Will not go near puddles it cannot see the bottom of."
    },
    {
      "id": "squelch-stone-act",
      "text": "Pretends to be a stone whenever someone sings."
    }
  ]
}
```

## 2. Old Bogback

### Boss lore (`bosses-lore.json`)

The description names the move that is in `bosses.json` (`Sinking Mud`) and says what it does. If the slice renames the move, change the sentence.

```json
{
  "old-bogback": {
    "description": "A huge toad, half sunk in the fen and older than its name. Its Sinking Mud smears a whole row, and stuck creatures move slower and hit softer.",
    "appearance": {
      "silhouette": "Huge, wide toad head and shoulders rising from the mud, with eye bulges on top and two cattails on the crown.",
      "size": "huge",
      "palette": [
        {
          "name": "Deep Peat",
          "hex": "#4f3822"
        },
        {
          "name": "Peat Brown",
          "hex": "#8a6238"
        },
        {
          "name": "Ochre Eye",
          "hex": "#f2d060"
        },
        {
          "name": "Tar Black",
          "hex": "#2a2230"
        },
        {
          "name": "Oily Sheen",
          "hex": "#4d9c8f"
        }
      ],
      "features": [
        "A warty peat-brown back with ochre flecks and a few patches of green moss",
        "Two big ochre-gold eyes with slit pupils on bulges at the top corners",
        "A very wide, patient mouth drawn as one long dark line",
        "Two cattails growing from the crown of its head",
        "The lower body sunk in black tar, with teal and violet oily sheen on the surface"
      ],
      "pose": "Sitting up out of the mud, facing the viewer, hands resting flat in the tar, completely unbothered.",
      "always": ["The half-sunk body in tar", "Gold eyes on bulges at the top corners"],
      "never": ["A fierce or angry look", "Teeth, drool or gore"]
    }
  }
}
```

### Retreat lines (`bosses.json`, `retreat`)

```json
{
  "phase1": "Old Bogback sinks slowly into the fen. It will rise again in Phase 2.",
  "phase2": "Old Bogback settles back into the peat. Face it in the finale on Sunday."
}
```

### Moves

Names and one-line descriptions (80 characters or fewer, so they fit a glossary `short`). The ops are the engine's: a sweep that applies Mired, a slam, the new `purge`, and a rank-gated charge into a barrage. Each move also needs a glossary entry only if it uses a new op; `purge` does (`gimmick-purge`, below), the rest reuse `gimmick-sweep`, `gimmick-slam` and `gimmick-charge`.

| Move           | Kind                    | One line                                                     |
| -------------- | ----------------------- | ------------------------------------------------------------ |
| Sinking Mud    | sweep that leaves Mired | Hits one row and leaves Mired on every creature in it.       |
| Belly Flop     | slam                    | A heavy flop on one creature. Its neighbours take a share.   |
| Shake Off      | purge                   | Old Bogback shakes every debuff off itself.                  |
| Rising Bubbles | rank-gated charge       | Bubbles rise under some creatures. A round later they burst. |

Move ids (suggested): `sinking-mud`, `belly-flop`, `shake-off`, `rising-bubbles`. Sinking Mud is the signature trick (shown on the boss card first). Rising Bubbles is the rank-gated one: "Bubbles rise" is the warning a round ahead, and "burst" is the hit, which is swamp gas going up (the Ember connection). Belly Flop is the dry joke: the boss is not scary, it just sits on someone.

## 3. Dungeon foes (`dungeon-foes.json`)

Names, flavour lines (at most 120 characters) and a suggested trick for each. `kind` is `foe` for the first two and `boss` for the room boss; the slice sets HP, Attack and Speed. The sprites are in `mire-boss-sprites.ts`.

```json
[
  {
    "id": "bog-toad",
    "name": "Bog Toad",
    "kind": "foe",
    "element": "mire",
    "flavor": "Sits so still you take it for a stone, then spits a mouthful of mud. It is very sorry afterwards."
  },
  {
    "id": "tar-leech",
    "name": "Tar Leech",
    "kind": "foe",
    "element": "mire",
    "flavor": "Black, shiny and slow. It clings to the nearest creature and will not take the hint."
  },
  {
    "id": "fen-lurker",
    "name": "Fen Lurker",
    "kind": "boss",
    "element": "mire",
    "flavor": "Looks like a bog-oak log until it blinks. Then you see that the log was looking at you."
  }
]
```

Suggested tricks (names and plain words; the ops are the engine's):

| Foe                             | Trick      | What it does                                                                        |
| ------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| Bog Toad                        | Mud Spit   | every second round, a small shell of mud on one random creature that leaves Mired   |
| Tar Leech                       | Tar Cling  | every third round, a heavy hit on the left creature that leaves Mired               |
| Fen Lurker                      | Sink Down  | every third round, a sweep of one row that leaves Mired                             |
| Fen Lurker (landmark signature) | Pull Under | every fourth round, announced a round ahead: a sweep of every row that leaves Mired |

### Room modifier (`room-modifiers.json`)

The text says 30% because the design's first guess is minus 30% (`spd` on the whole team); change the number with the tuned value. The modifier icon needs a rule in `modifierIcon` (`apps/activity/src/dungeon-rooms.ts`): a `team_stat` on `spd` with no element or role now gets the `mud` glyph, which is drawn and registered.

```json
{
  "id": "mud",
  "name": "Muddy",
  "description": "Your whole team is 30% slower."
}
```

## 4. Sunken Fen (`destinations.json`)

`flavor` is the one-line player text, `banner.scene` is the banner caption and brief. The banner is drawn (`mire-banner-sprites.ts`) with exactly these four palette colours plus shades. `species`: Mudlump and Squelch; the old-finds bonus is a rules question for the slice.

```json
{
  "id": "sunken-fen",
  "name": "Sunken Fen",
  "element": "mire",
  "flavor": "A flat, quiet bog where the mud keeps everything it is given. Old things turn up here.",
  "banner": {
    "scene": "A flat bog at dusk under pale mist: pools of black water with an oily sheen, banks of peat and ochre reeds, a half-sunk cart wheel and signpost, and a half-sunk stone arch at the far end.",
    "palette": [
      {
        "name": "Peat brown",
        "hex": "#5b4630"
      },
      {
        "name": "Tar black",
        "hex": "#1f1a26"
      },
      {
        "name": "Ochre reed",
        "hex": "#c49a3c"
      },
      {
        "name": "Fen mist",
        "hex": "#b9b49a"
      }
    ],
    "mood": "Still, damp and patient, with a little gold in it",
    "details": [
      "An oily rainbow sheen drifting on the black pools",
      "A half-sunk cart wheel, a leaning signpost and a stone arch: things the bog kept",
      "Clusters of cattail reeds, their dark heads against the pale mist"
    ],
    "never": ["Bright sunshine or loud colours", "Any creature drawn in the scene"]
  }
}
```

## 5. Journal (`journal.json`)

One new set for the fen and four pages, one of them an any-place page about the element chart. The text of `any-the-wheel` can stay as it is; `any-the-chart` is a new page that finishes the thought.

```json
{
  "sets": [
    {
      "id": "peat-notes",
      "name": "The Peat Notes",
      "place": "sunken-fen"
    }
  ],
  "entries": [
    {
      "id": "any-the-chart",
      "place": "any",
      "title": "The chart of elements",
      "text": "Water puts out fire, fire eats the green, the green drinks lightning, and lightning splits the water. But the wheel was never the whole world: in the fen, the mud drinks the flame."
    },
    {
      "id": "fen-old-things",
      "place": "sunken-fen",
      "title": "What the bog keeps",
      "text": "A cart wheel, a gate, a lantern, a pair of boots. The bog keeps whatever it is given, and it keeps it well. Look closely before you leave.",
      "set": "peat-notes"
    },
    {
      "id": "fen-slow-ground",
      "place": "sunken-fen",
      "title": "Slow ground",
      "text": "The fen does not hurt anyone. It only holds on to their feet. A creature held by the feet hits softer, and cannot step aside in time.",
      "set": "peat-notes"
    },
    {
      "id": "fen-damp-and-gas",
      "place": "sunken-fen",
      "title": "Damp and gas",
      "text": "A damp fog puts out any fire without a sound. But under the peat the old gas is waiting for a single spark, and then it all goes up at once.",
      "set": "peat-notes"
    }
  ]
}
```

## 6. Glossary (`glossary.json`)

New entries, in the shape of the file (`id`, `title`, `short`, `lines`, `visual`, `section`). Visuals use things that exist: the element icon `mire`, the mark glyph tinted by `markPalette('mire')`, the reactions (`smother` and `flare` need their entries in `reactions.json` first, which the slice adds), and the glyphs `mired`, `mud` and `speed`. The numbers 50% and 25% come from the chart in the design; the per-stack numbers of Mired are not in the text on purpose, because they are still being tuned.

```json
[
  {
    "id": "element-mire",
    "title": "Mire",
    "short": "Mud and bog. Strong against Ember.",
    "lines": [
      "Hits Ember bosses for 50% more damage.",
      "Ember hits Mire bosses for 50% more. Tide hits them for 25% less.",
      "Mire hits leave Muddied on the boss. Ember cashes it in.",
      "Slow and sturdy: they hold the line and weigh the boss down."
    ],
    "visual": {
      "kind": "element",
      "id": "mire"
    },
    "section": "creatures"
  },
  {
    "id": "mark-muddied",
    "title": "Muddied",
    "short": "Mire's mark. Ember cashes it in.",
    "lines": [
      "Left on the boss by a Mire hit.",
      "An Ember hit sets off Flare.",
      "Only a Setter of another element can swap it.",
      "It stays until it is cashed in or swapped."
    ],
    "visual": {
      "kind": "mark",
      "id": "mire"
    },
    "section": "combos"
  },
  {
    "id": "reaction-smother",
    "title": "Smother",
    "short": "Mire on Scorched: deals much more damage and mires the boss.",
    "lines": [
      "A Mire hit on a Scorched boss sets it off.",
      "It deals much more damage than a normal hit.",
      "It also leaves Mired on the boss.",
      "It uses up the mark. The next hit leaves a new one."
    ],
    "visual": {
      "kind": "reaction",
      "id": "smother"
    },
    "section": "combos"
  },
  {
    "id": "reaction-flare",
    "title": "Flare",
    "short": "Ember on Muddied: deals much more damage, burns off Mired.",
    "lines": [
      "An Ember hit on a Muddied boss sets it off.",
      "It deals much more damage than a normal hit.",
      "It then burns away every Mired stack on the boss, for extra damage on each.",
      "Keep the stacks to keep the boss slow, or burn them for one big hit."
    ],
    "visual": {
      "kind": "reaction",
      "id": "flare"
    },
    "section": "combos"
  },
  {
    "id": "status-mired",
    "title": "Mired",
    "short": "Stuck in the mud: slower and weaker.",
    "lines": [
      "Each stack lowers Speed and the damage dealt.",
      "Stacks add up to a limit. Every new application resets the timer.",
      "When the timer ends, all the stacks fall off together.",
      "A Purge, or a Support's cleanse, washes it off."
    ],
    "visual": {
      "kind": "glyph",
      "id": "mired"
    },
    "section": "combos"
  },
  {
    "id": "status-effects",
    "title": "Status effects",
    "short": "Lasting effects on a creature or a boss, counted in turns.",
    "lines": [
      "A turn is one fighter's action. An effect counts down on its owner's own turns.",
      "Stacks add up to a limit. Each new application sets the timer back to full.",
      "When the timer ends, the effect and all its stacks end together.",
      "A knocked-out creature loses its effects."
    ],
    "section": "raid-week"
  },
  {
    "id": "stat-dodge",
    "title": "Dodge",
    "short": "A chance to avoid a hit completely.",
    "lines": [
      "Dodge comes from Speed. Some gear and talents add more. It never goes above 50%.",
      "A dodged hit does no damage and sets off nothing.",
      "Hits on many creatures at once are dodged half as often.",
      "Foes dodge too. A Setter's hit still leaves its mark when dodged."
    ],
    "visual": {
      "kind": "glyph",
      "id": "speed"
    },
    "section": "creatures"
  },
  {
    "id": "element-chart",
    "title": "Element chart",
    "short": "Who deals more or less damage to whom.",
    "lines": [
      "Tide beats Ember, Ember beats Grove, Grove beats Spark, Spark beats Tide.",
      "Mire and Ember beat each other. Tide deals less damage to Mire.",
      "A pair that is not listed deals normal damage.",
      "It changes your hits on bosses and foes. Their hits ignore it."
    ],
    "section": "creatures"
  },
  {
    "id": "gimmick-purge",
    "title": "Purge",
    "short": "The boss washes every debuff off itself.",
    "lines": [
      "Mired and any other debuff on the boss end at once.",
      "Keep your debuffs fresh, or cash them in before it comes."
    ],
    "visual": {
      "kind": "glyph",
      "id": "ability"
    },
    "section": "raid-week"
  },
  {
    "id": "place-element-mire",
    "title": "Mire place",
    "short": "Mire creatures live here.",
    "lines": [
      "Most creatures that live here are Mire.",
      "Shards found here are Mire shards.",
      "Gear found here is Mire gear: its lines lean Mire."
    ],
    "section": "expeditions"
  },
  {
    "id": "modifier-mud",
    "title": "Muddy",
    "short": "Your whole team is 30% slower.",
    "lines": [],
    "visual": {
      "kind": "glyph",
      "id": "mud"
    },
    "section": "dungeon"
  }
]
```

### Existing entries that must change (Mire adds new pairs)

The Ember and Tide element entries and the Scorched mark entry are no longer true on their own, and the how-to-play text still says "Tide, Ember, Grove or Spark". Suggested replacements:

```json
[
  {
    "id": "element-ember (update)",
    "title": "Ember",
    "short": "Fire. Strong against Grove and Mire.",
    "lines": [
      "Hits Grove bosses for 50% more damage.",
      "Hits Mire bosses for 50% more damage.",
      "Hits Tide bosses for 25% less damage. Mire hits it for 50% more.",
      "Ember hits leave Scorched on the boss. Tide or Mire cashes it in."
    ],
    "visual": {
      "kind": "element",
      "id": "ember"
    },
    "section": "creatures"
  },
  {
    "id": "element-tide (update)",
    "title": "Tide",
    "short": "Water. Strong against Ember.",
    "lines": [
      "Hits Ember bosses for 50% more damage.",
      "Hits Spark bosses for 25% less damage.",
      "Hits Mire bosses for 25% less damage.",
      "Tide hits leave Soaked on the boss. Spark cashes it in."
    ],
    "visual": {
      "kind": "element",
      "id": "tide"
    },
    "section": "creatures"
  },
  {
    "id": "mark-scorched (update)",
    "title": "Scorched",
    "short": "Ember's mark. Tide or Mire cashes it in.",
    "lines": [
      "Left on the boss by an Ember hit.",
      "A Tide hit sets off Steam. A Mire hit sets off Smother.",
      "Only a Setter of another element can swap it.",
      "It stays until it is cashed in or swapped."
    ],
    "visual": {
      "kind": "mark",
      "id": "ember"
    },
    "section": "combos"
  }
]
```

Also: the How to play `creatures` section line "Each creature has an element (Tide, Ember, Grove or Spark)" should read "(Tide, Ember, Grove, Spark or Mire)", and the "wheel" wording in the how-to-play combos section can point to the Element chart entry. The journal page `any-the-wheel` keeps its text.

## 7. Gear and parts

**Mire Shard** (a part, like the other shards): "A shard of Mire. It pays for Mire crafts." Drawn in the part icon style by the slice (a tinted shard); compendium flavour in `items.md`.

**Gear bases** (`gear.json`), tag `mire`. The design asks for one or two; the full ladder of three makes per slot is given so the slice can pick (the first of each slot is the minimum). Stats are the slice's: Mire bases favour staying power, so give them a little more HP and a little less Attack than the neutral base of the same make. Flavour is at most 120 characters.

```json
[
  {
    "id": "peat-cap",
    "name": "Peat Cap",
    "slot": "hat",
    "tag": "mire",
    "minItemLevel": 1,
    "flavor": "Woven from peat moss that stays a little damp, and a little warm."
  },
  {
    "id": "reed-hood",
    "name": "Reed Hood",
    "slot": "hat",
    "tag": "mire",
    "minItemLevel": 5,
    "flavor": "Braided cattail leaves, soft as felt and tough as rope."
  },
  {
    "id": "bogwardens-crown",
    "name": "Bogwarden's Crown",
    "slot": "hat",
    "tag": "mire",
    "minItemLevel": 10,
    "flavor": "Tar-black bog oak with an oily shine. It is older than the hands that carved it."
  },
  {
    "id": "mudcloth-scarf",
    "name": "Mudcloth Scarf",
    "slot": "scarf",
    "tag": "mire",
    "minItemLevel": 1,
    "flavor": "Dyed in peat water until the colour stays for good. It dries slowly and keeps you warm."
  },
  {
    "id": "fen-wrap",
    "name": "Fen Wrap",
    "slot": "scarf",
    "tag": "mire",
    "minItemLevel": 5,
    "flavor": "A heavy wrap, thick as a blanket, that smells of rain on the reeds."
  },
  {
    "id": "bogkeepers-mantle",
    "name": "Bogkeeper's Mantle",
    "slot": "scarf",
    "tag": "mire",
    "minItemLevel": 10,
    "flavor": "A mantle for those who keep the old places. It remembers every step in the mud."
  }
]
```

## 8. Talents (Mudlump pool, in `talents.json`)

A Mire pool keyed `mudlump` mixes Guard and Support talents on purpose, like the Sproutle pool: its talents hint which branch it wants (Bogwarden is the Guard, and the Squelch line has its own pool keyed `squelch`). The three the design asks for are below. The effects use the new gear lines of the design (section 3.6): Clean coat, Lingering and Heavy hand. A full pool needs seven or eight talents; the other four or five are the slice's to write in the same style (named after a behaviour, never a stat; two to four words; Title Case).

| Talent           | Role it suits | Text (what it is about)                                            | Effect line |
| ---------------- | ------------- | ------------------------------------------------------------------ | ----------- |
| Mud Off Its Back | Guard         | Mud and muck slide off it. Debuffs on it are weaker.               | Clean coat  |
| Sticks Around    | Support       | What it sticks to stays stuck. The debuffs it applies last longer. | Lingering   |
| Low Croak        | Support       | A low, heavy croak. The debuffs it applies stack more often.       | Heavy hand  |

## 9. Pixel art: what is drawn and what the slice registers

All the art is in `apps/activity/src/sprites/data/`, in the same format as the existing sprites. A new test, `apps/activity/src/sprites/mire-sprites.test.ts`, holds every new sprite to the rules of the existing sprite tests (size, ink, palette, face, edge, unique silhouette, brief colours) until the content exists.

| Art                                                              | Where                                                         | Registered now?                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| Element icon `mire` (8x8)                                        | `sprites/element-icons.ts`                                    | Yes                                                   |
| Glyph `mired` (status icon, 8x8) and glyph `mud` (room modifier) | `glyphs.ts`                                                   | Yes                                                   |
| Muddied mark                                                     | The existing `mark` glyph, tinted with `markPalette('mire')`  | Yes (`ELEMENT_COLOURS.mire` in `art.ts`)              |
| `--mire` colour token                                            | `styles/base/tokens.css`                                      | Yes                                                   |
| Shiny palettes for the four species                              | `art.ts` (`SHINY_PALETTES`)                                   | Yes (teal and violet: the sheen comes through)        |
| Species `mudlump`, `bogwarden`, `squelch`, `croakmire` (16x16)   | `data/mire-species-sprites.ts`                                | **No**: add to `SPECIES_SPRITE_DATA` with the species |
| Boss `old-bogback` (24x24)                                       | `data/mire-boss-sprites.ts`                                   | **No**: add to `BOSS_SPRITE_DATA` with the boss       |
| Foes `bog-toad`, `tar-leech` (16x16)                             | `data/mire-boss-sprites.ts`                                   | **No**: add to `DUNGEON_FOE_SPRITE_DATA`              |
| Floor boss `fen-lurker` (24x24)                                  | `data/mire-boss-sprites.ts` (`MIRE_DUNGEON_BOSS_SPRITE_DATA`) | **No**: add to `DUNGEON_BOSS_SPRITE_DATA`             |
| Banner `sunken-fen` (64x24)                                      | `data/mire-banner-sprites.ts`                                 | **No**: add to `BANNER_SPRITE_DATA`                   |

Why not now: `sprite-data.test.ts`, `dungeon-sprites.test.ts` and `banner-sprites.test.ts` assert that the bundled maps hold sprites for exactly the content that exists, so registering early would fail them. When the content lands, spread the Mire maps into the bundled ones and move the `mire-sprites.test.ts` checks into the existing tests (or leave them: they keep passing).

**Other places the slice must touch for the art:** `elementIcon` and `markPalette` already know `mire`. The dungeon-sprite test's `ELEMENT_HUES` and the lore test's element hue ranges need a `mire` entry. `modifierIcon` needs the `spd` rule. The `how-to-play` and glossary texts name the elements. CSS that sets `--el` by element class (`el-mire`) is the UI slice's job.

**Discord boss portrait:** `apps/activity/scripts/boss-portraits.mts` reads only `BOSS_SPRITE_DATA` and writes `public/discord/bosses/<id>.png` (a 240-pixel PNG with a transparent background). It needs no content. Once `old-bogback` is in `BOSS_SPRITE_DATA`, run `node --experimental-strip-types apps/activity/scripts/boss-portraits.mts` and commit `apps/activity/public/discord/bosses/old-bogback.png`; `boss-portraits.test.ts` fails until the PNG exists and while it is missing for a boss that exists. Not run here, because the sprite is deliberately not registered yet.
