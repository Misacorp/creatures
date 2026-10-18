# The valley's sky: Boons and Omens

Status: 2026-10-17. Covers the daily weather of the valley, as in-world things: ten Boons and ten Omens, three of them written down and waiting for engine work.

Read `README.md` for the tags.

**Source of truth:** `weather.json` (the ids, names, flavour lines, bubbles and what each does), `RULES.weather` (how strong the sky is at each Boss Rank and how often a wild Omen comes), `glossary.json` (`boon`, `omen`, `forecast`) and `docs/design/gear-and-creatures-v2.md` section 10. The numbers stay in the data; this file holds the names, the feeling and the canon.

## The sky as a place

- At every daily reset the valley turns over one page: one **Boon** (a good turn of the weather) and, once the server has met a few bosses, one **Omen** (a bad one). Everyone in the valley lives under the same sky. `(content: glossary.json "boon", "omen")`
- Omens are shown a day ahead and never come two days running. Festival weeks are only ever kind: Boons, no Omens. `(design: section 10.1)`
- The sky is read from the **wall calendar** in the living room: a page for today and a page for tomorrow. `(design: decisions.md, "roll out fast, balance at the end; ... the weather calendar")`
- The calendar sometimes mutters about the day in a short bubble, the way the creatures do. `(content: weather.json "bubbles")`

**Compendium detail, not shipped** (feel):

- _Mood:_ domestic weather. The sky is never grand or frightening; it is the kind of weather you plan an afternoon around. A Boon is a good morning. An Omen is a grumble, never a catastrophe.
- _The wall calendar:_ a paper calendar with a little weather picture in each day's square. It hangs on the wall between the lamp and the fireplace. Whoever lives in the room tears off the page each evening. Its pages are a bit warped from the fire.
- _Voice of the bubbles:_ short, in the voice of whoever is looking out of the window. Never a rule, never a number.
- _Why the sky matters to the raid:_ the bosses are creatures of the same valley and feel the same weather; the Stormfront is the only one that is the boss's own doing.

---

## Boons

Ten Boons. Nine are live and one (Kind Rain) is planned: it is not drawn yet for want of a small piece of engine work (see the end of this file). `(content: weather.json)`

### Fair Winds

- Shipped flavour `(content)`: "The wind sits at everyone's back, and the first step lands harder."
- Compendium detail: the kind of wind that makes every first step a good one. Explorers set out early on a Fair Winds day.

### Warm Hearth

- Shipped flavour `(content)`: "Every fire in the valley burns a little brighter and every hand works a little faster."
- Compendium detail: the hearth in the living room crackles louder. Supports feel it first. The opposite of Long Shadows and Cold Snap, which never visit on the same day.

### Kind Rain

- Shipped flavour `(content)`: "A soft rain that mends what it falls on and feeds the tidepools and the hollow."
- Compendium detail: the rain the Tidepools and Verdant Hollow wait for. Planned, not drawn yet.

### Clear Skies

- Shipped flavour `(content)`: "Not a cloud anywhere. Aim is true and the rare things show themselves."
- Compendium detail: the window shows every star at night and every hill by day. A good day for spotting rare creatures from far away.

### High Water

- Shipped flavour `(content)`: "The tide is all the way in, and the reef lets more things wander out."
- Compendium detail: the tide marks on the Tidepools' stones disappear. Overload and Steam crackle in the air (compendium detail, not shipped).

### Bonfire Night

- Shipped flavour `(content)`: "Someone lit a bonfire on the ridge and now the whole valley wants to be near it."
- Compendium detail: it burns on Storm Ridge, never in the Ember Caves, because the Caves insist they do not need one. Wildfire and Grounding love it.

### Hearty Breakfast

- Shipped flavour `(content)`: "Everyone had a proper breakfast, and it shows in how much they take in."
- Compendium detail: porridge, honey, a little salt. Treats taste better and teach more.

### Lantern Light

- Shipped flavour `(content)`: "Lanterns hang in every window and old pages come out of their drawers."
- Compendium detail: the day the Journal gets browsed. Shield Walls and Rallies last a breath longer in the soft light.

### Market Day

- Shipped flavour `(content)`: "Stalls line the lane, and the first deal of the day is always the fairest."
- Compendium detail: the first sale is generous and the rest are not. A stall-keeper has no use for hoarders. The dungeon's rooms feel it too: a little more scrap in every one.

### Quiet Night

- Shipped flavour `(content)`: "The valley holds its breath. Even the boss forgets some of what it learned."
- Compendium detail: so quiet that the Moonlit Reef forgets what time it is and stays open all day.

---

## Omens

Ten Omens. Eight are live (one of them wild: Stormfront, from Boss Rank 10) and two are planned. `(content: weather.json)`

### Morning Haze

- Shipped flavour `(content)`: "A thick haze lies on the valley and everyone starts the day a step behind."
- Compendium detail: planned, not drawn yet. Fair Winds blows it away, so the two never share a day.

### Heatwave

- Shipped flavour `(content)`: "The air shimmers over the rocks, tempers run hot and the shards are hard to find."
- Compendium detail: Ember foes take it worst and get fiercest. Shards go quiet in the heat.

### Static Sky

- Shipped flavour `(content)`: "Every hair stands up and the sky crackles. Foes find the soft spots."
- Compendium detail: the day Spark creatures ask not to be stroked.

### Heavy Rain

- Shipped flavour `(content)`: "It pours without a break. Everything that sweeps or splashes lands harder, and the roads slow down."
- Compendium detail: the opposite of Fair Winds, so the two never meet.

### Long Shadows

- Shipped flavour `(content)`: "The sun sits low all day and the shadows reach for everyone."
- Compendium detail: a Support's glow looks smaller in long shadows, and healing is slow. Warm Hearth drives them off.

### Restless Wind

- Shipped flavour `(content)`: "A wind from nowhere pulls at every shield and every line."
- Compendium detail: Guards plant their feet and still slide. Nothing is ever lost to it, a shield only reaches a little less far.

### Cold Snap

- Shipped flavour `(content)`: "Frost on every window. Fingers are slow and lessons do not stick."
- Compendium detail: Warm Hearth and Hearty Breakfast both melt it, so they never share a day.

### Bramble Season

- Shipped flavour `(content)`: "Thorns are everywhere. What you start the boss may well throw back."
- Compendium detail: planned, not drawn yet, and only from Boss Rank 6.

### Muddy Roads

- Shipped flavour `(content)`: "Every road is a bog. Trips drag on and the good finds stay buried."
- Compendium detail: the one weather every explorer complains about. Fair Winds cancels it.

### Stormfront

- Shipped flavour `(content)`: "A wild storm is rolling in. The boss is not afraid of it. The boss is part of it."
- Compendium detail: the wild one. From Boss Rank 10, at most once a raid week, always shown a day ahead and never in a Festival week. It is the only Omen the boss brings with it.

---

## Planned: waiting for engine work

Three entries are written down in `weather.json` as `planned` and are never drawn until their engine hook exists. Each says what it will do and what it waits for.

| Id               | What it waits for                                                             |
| ---------------- | ----------------------------------------------------------------------------- |
| `kind-rain`      | A heal at round start for every creature (today only a Support's Mend heals)  |
| `morning-haze`   | A skipped first turn for the first creature of a row (a skip with no silence) |
| `bramble-season` | A small reflect share on the first reaction each round (rank 6 and up)        |

When the hook exists: change the entry to `live` in `weather.json`, give it its effects, and update this file.
