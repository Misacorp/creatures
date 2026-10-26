# Knack catalogue (generated)

Generated from `packages/lab/src/knacks.ts` by `pnpm --filter @creatures/lab report`. Do not edit by hand: change the data and regenerate. Keywords in braces are defined in `keywords.md`.

## By form

| Form | Knacks |
| --- | --- |
| splashet | Steady Mark, Lead the Way |
| tidewing | Steady Mark, Feed the Marks, Circle Round |
| geyserpup | Leave a Trail, Puddle Maker, All at Once |
| stormray | Detonate, Leave a Trail |
| tempestray | Detonate, Leave a Trail, Twin Strike |
| halcyray | Clear Skies, Clear the Air, Gather Calm |
| sproutle | Wide Reach, Primed by Pain |
| thornbuck | Wide Reach, Primed by Pain, Night Watch |
| sunfawn | Sunbeam, Curl Up, Ready the Mark |
| ashmole | Wide Warmth, Ready the Mark |
| magmole | Wide Warmth, Ready the Mark, Tunnel Through |
| kilnmole | Draw Fire, Keep the Heat In, Baked Shell |
| zipmouse | Zoom, Double Mark |
| voltaro | Zoom, Double Mark, Zigzag |
| ohmouse | Double Mark, Catch the Bolts, Lightning Ears |
| cindle | Detonate, Leave a Trail |
| pyrelynx | Detonate, Leave a Trail, Guard's Shadow |
| wickat | Lead the Way, Steady Mark, Double Mark |
| mistnewt | Wide Reach, Hide in Mist |
| fogwyrm | Wide Reach, Hide in Mist, Thick Fog |
| drizzlewt | Drizzle, Curl Up, Clear the Air |
| mossback | Steady Mark, Feed the Marks |
| ancientshell | Steady Mark, Feed the Marks, Living Shelter |
| bloomback | All at Once, Detonate, Leave a Trail |
| coralynx | Detonate, Leave a Trail, Territorial |
| solmane | Lead the Way, Steady Mark, Crown of Embers |
| gaiadrake | Detonate, Leave a Trail, Carry Them |
| aurorix | Starlight, Clear Skies, Gather Calm |
| lanternfin | Lantern Glow, Clear the Air, Sunbeam |
| hearthshell | Draw Fire, Keep the Heat In, Hearth |
| mudlump | Mud Wall, Wide Reach |
| bogwarden | Mud Wall, Wide Reach, Draw Fire |
| squelch | Squelch Song, Ready the Mark |
| croakmire | Squelch Song, Ready the Mark, Wide Warmth |

## Knacks

### Steady Mark

- **Text:** {Seal}: its marks are not shed by the boss.
- **Family:** Seal
- **Forms:** splashet, tidewing, wickat, mossback, ancientshell, solmane
- **Intent (for contributors, never shown to players):** Answers bosses that shed marks on their turns (Clean Scales), which matter now that the boss acts after every row.

### Lead the Way

- **Text:** After it leaves a mark, the next creature to act in its row gets +20% on that hit.
- **Family:** Lead
- **Forms:** splashet, wickat, solmane
- **Intent (for contributors, never shown to players):** Rewards placing the Payoff right after the Setter in a row.

### Feed the Marks

- **Text:** Its hit deals no damage. It leaves its {Mark} and adds 1 to the count of every other mark on the boss.
- **Family:** Heavy Prime
- **Forms:** tidewing, mossback, ancientshell
- **Intent (for contributors, never shown to players):** For multi-mark teams and Payoffs that spend several stacks.

### Circle Round

- **Text:** Each reaction on a Tide mark heals the creature that set it off by 8% of its max HP.
- **Family:** Sustain
- **Forms:** tidewing
- **Intent (for contributors, never shown to players):** Keeps Payoffs alive when reactions hurt them (Reflective Hide, Thorns).

### Puddle Maker

- **Text:** When it sets off no {Reaction}, it leaves the mark it can cash, like a Setter.
- **Family:** Self Prime
- **Forms:** geyserpup
- **Intent (for contributors, never shown to players):** A Payoff that works without a Setter, at half the pace.

### All at Once

- **Text:** Cashes only a mark at x2 or more, and {Spend}s all of its count. Huge on x3.
- **Family:** Detonator
- **Forms:** geyserpup, bloomback
- **Intent (for contributors, never shown to players):** Misa's mark-mark-mark-big-payoff choice: a slow, huge hit that breaks armour.

### Leave a Trail

- **Text:** After its {Reaction}, it leaves x1 of its own element's mark. A reaction on that mark leaves no further trail.
- **Family:** Chain
- **Forms:** geyserpup, stormray, tempestray, cindle, pyrelynx, bloomback, coralynx, gaiadrake
- **Intent (for contributors, never shown to players):** Cross-element chains: a reaction primes the next one for another Payoff.

### Detonate

- **Text:** {Spend}s the whole count of the mark it cashes. Weak on x1, strong on x2 and x3.
- **Family:** Detonator
- **Forms:** stormray, tempestray, cindle, pyrelynx, bloomback, coralynx, gaiadrake
- **Intent (for contributors, never shown to players):** Pays off two Setters, or a Setter with Heavy Prime; worse than no Knack on a single stack.

### Twin Strike

- **Text:** Hits twice, each for 55%. Each hit can set off a reaction.
- **Family:** Flurry
- **Forms:** tempestray
- **Intent (for contributors, never shown to players):** Weaker in a plain fight; answers bosses that cap single hits or dodge a lot. Poor against armour.

### Clear Skies

- **Text:** Instead of boosting, the boss cannot dodge the hits of creatures beside it this round.
- **Family:** Support shape
- **Forms:** halcyray, aurorix
- **Intent (for contributors, never shown to players):** Answers Elusive bosses.

### Clear the Air

- **Text:** Creatures beside it that set off a reaction heal 10% and lose their silence.
- **Family:** Sustain
- **Forms:** halcyray, drizzlewt, lanternfin
- **Intent (for contributors, never shown to players):** Answers Reflective Hide, Thorns and silence on the Payoff.

### Gather Calm

- **Text:** {Store} Calm: +1 for each reaction anywhere. At round start with 3 Calm, the creatures beside it get +45% and it spends all.
- **Family:** Store
- **Forms:** halcyray, aurorix
- **Intent (for contributors, never shown to players):** A reaction-heavy line gets a burst every few rounds.

### Wide Reach

- **Text:** Its reach is +1 on each side.
- **Family:** Reach
- **Forms:** sproutle, thornbuck, mistnewt, fogwyrm, mudlump, bogwarden
- **Intent (for contributors, never shown to players):** Protects fragile creatures two places away; strong in wide raid rows.

### Primed by Pain

- **Text:** The first time it {Intercept}s each fight, it leaves x1 of its own element's mark.
- **Family:** Guard Prime
- **Forms:** sproutle, thornbuck
- **Intent (for contributors, never shown to players):** A Guard that helps prime for an Ember Payoff when no Grove Setter is around.

### Night Watch

- **Text:** It {Intercept}s every {Charged} hit on a creature in its row.
- **Family:** Intercept
- **Forms:** thornbuck
- **Intent (for contributors, never shown to players):** Answers telegraphed big hits (Great Wave).

### Sunbeam

- **Text:** Instead of the creatures beside it, it heals and boosts every creature in front of it in its column.
- **Family:** Support shape
- **Forms:** sunfawn, lanternfin
- **Intent (for contributors, never shown to players):** Uses the whole board: healers belong at the back. Bosses that hit the back row punish it.

### Curl Up

- **Text:** Its heal on a creature below half HP is tripled.
- **Family:** Support shape
- **Forms:** sunfawn, drizzlewt
- **Intent (for contributors, never shown to players):** For steady damage on a Guard.

### Ready the Mark

- **Text:** Instead of boosting and healing, at round start it adds x1 to its own element's mark.
- **Family:** Support Prime
- **Forms:** sunfawn, ashmole, magmole, squelch, croakmire
- **Intent (for contributors, never shown to players):** Lets a team without a Setter react; needs a Payoff of the right element.

### Wide Warmth

- **Text:** Its boost also reaches one place further on each side, 10 points weaker.
- **Family:** Support shape
- **Forms:** ashmole, magmole, croakmire
- **Intent (for contributors, never shown to players):** Wide raid rows with several hitters.

### Tunnel Through

- **Text:** Hits by creatures beside it ignore half the boss's armour.
- **Family:** Pierce
- **Forms:** magmole
- **Intent (for contributors, never shown to players):** Answers armoured bosses for plain hitters.

### Draw Fire

- **Text:** {Taunt}. Armour +15.
- **Family:** Taunt
- **Forms:** kilnmole, hearthshell, bogwarden
- **Intent (for contributors, never shown to players):** Takes the plain attacks off fragile creatures wherever they stand.

### Keep the Heat In

- **Text:** While it stands, its row takes 15% less from area and {Charged} hits.
- **Family:** Row Ward
- **Forms:** kilnmole, hearthshell
- **Intent (for contributors, never shown to players):** Protects other players' creatures in its row in the raid.

### Baked Shell

- **Text:** {Store} Heat: +1 each time it or a creature in its reach takes damage. At 3, the next {Reaction} by a creature beside it deals double bonus.
- **Family:** Store
- **Forms:** kilnmole
- **Intent (for contributors, never shown to players):** A Guard beside a Payoff in a hard fight.

### Zoom

- **Text:** +20 dodge. When it dodges, it hits back for 50% of its Attack ({Retaliate}).
- **Family:** Evasion
- **Forms:** zipmouse, voltaro
- **Intent (for contributors, never shown to players):** A Setter that survives and adds damage when the boss hits often.

### Double Mark

- **Text:** Its hit deals no damage. It leaves its {Mark} at x2.
- **Family:** Heavy Prime
- **Forms:** zipmouse, voltaro, ohmouse, wickat
- **Intent (for contributors, never shown to players):** Feeds Detonators and two Payoffs of the trigger element.

### Zigzag

- **Text:** {Taunt}, +20 dodge. {Store} Static: +1 per dodge; at 3, its next mark gets +2 to its count.
- **Family:** Evasion
- **Forms:** voltaro
- **Intent (for contributors, never shown to players):** A dodge tank beside a Guard (dodge before intercept).

### Catch the Bolts

- **Text:** It {Intercept}s area hits too.
- **Family:** Intercept
- **Forms:** ohmouse
- **Intent (for contributors, never shown to players):** Answers sweeps and splashes.

### Lightning Ears

- **Text:** It leaves its own element's {Mark} like a Setter, but it does not {Intercept}.
- **Family:** Guard Prime
- **Forms:** ohmouse
- **Intent (for contributors, never shown to players):** A Setter that survives the front row.

### Mud Wall

- **Text:** Each hit it takes, even Blocked, puts {Mired} x1 on the boss.
- **Family:** Debuff
- **Forms:** mudlump, bogwarden
- **Intent (for contributors, never shown to players):** Keeps Mire's debuff alive after finale abilities go.

### Squelch Song

- **Text:** At round start the boss gains {Mired} x1.
- **Family:** Debuff
- **Forms:** squelch, croakmire
- **Intent (for contributors, never shown to players):** Keeps Mire's debuff alive after finale abilities go.

### Guard's Shadow

- **Text:** +25% on its hits while a living Guard stands beside it.
- **Family:** Shadow
- **Forms:** pyrelynx
- **Intent (for contributors, never shown to players):** A Payoff that wants a Guard partner, ideally another player's in the raid. The same name as the gear line with the same effect.

### Crown of Embers

- **Text:** Its {Mark} starts at x2, and it still hits.
- **Family:** Signature
- **Forms:** solmane
- **Intent (for contributors, never shown to players):** Solmane's signature: an epic Setter that feeds Detonators without giving up its damage.

### Hide in Mist

- **Text:** Creatures beside it get +15 dodge.
- **Family:** Evasion aura
- **Forms:** mistnewt, fogwyrm
- **Intent (for contributors, never shown to players):** A Guard that protects by hiding friends; strong with dodge-before-intercept (R1) when the boss hits often.

### Thick Fog

- **Text:** Every creature in its row gets +8 dodge.
- **Family:** Evasion aura
- **Forms:** fogwyrm
- **Intent (for contributors, never shown to players):** The wide version for long raid rows.

### Drizzle

- **Text:** Instead of boosting, at round start it heals every creature in its row by 3%.
- **Family:** Support shape
- **Forms:** drizzlewt
- **Intent (for contributors, never shown to players):** A row healer for long raid rows and steady damage.

### Living Shelter

- **Text:** Creatures beside it take 25% less from {Area hit}s.
- **Family:** Row Ward
- **Forms:** ancientshell
- **Intent (for contributors, never shown to players):** Ancientshell hosts small creatures: a Setter that shelters its neighbours from sweeps.

### Territorial

- **Text:** +30% on its hits while no other Payoff stands in its row.
- **Family:** Signature
- **Forms:** coralynx
- **Intent (for contributors, never shown to players):** Coralynx guards its reef alone: it wants a row to itself, a placement question in the raid.

### Carry Them

- **Text:** It {Intercept}s aimed hits for the creatures beside it, like a Guard. Its reaction bonus is 25% smaller.
- **Family:** Intercept (borrowed)
- **Forms:** gaiadrake
- **Intent (for contributors, never shown to players):** Gaiadrake protects everything it carries: a Payoff borrowing the Guard's verb at a cost (P-02).

### Starlight

- **Text:** It {Boost}s every creature in its row, 5 points weaker, and heals no one.
- **Family:** Support shape
- **Forms:** aurorix
- **Intent (for contributors, never shown to players):** Aurorix looks after friends from a distance: a row-wide boost for long raid rows.

### Lantern Glow

- **Text:** Creatures beside it cannot be {Silenced}.
- **Family:** Ward
- **Forms:** lanternfin
- **Intent (for contributors, never shown to players):** Lanternfin guides friends through the dark: the silence answer that protects others.

### Hearth

- **Text:** At round start it heals the creatures in its {Reach} by 4%.
- **Family:** Guard Sustain
- **Forms:** hearthshell
- **Intent (for contributors, never shown to players):** Hearthshell hosts friends around its fire: a Guard that heals the creatures it protects.

## Combat talents

Generated from `packages/lab/src/talents.ts`. A creature rolls talents from its line's pool when found. Each pool has the role talents of its forms' roles (the same effect keeps the same name in every pool) and one flavour talent of its own.

| Line | Pool (roles) |
| --- | --- |
| splashet | Sharp Claws (setter, payoff); Light Feet (setter); Unflappable (setter); Lasting Marks (setter); Keen Eye (payoff); Big Finish (payoff); First Strike (payoff); Splashes Everywhere (setter, payoff) |
| stormray | Sharp Claws (payoff); Keen Eye (payoff); Big Finish (payoff); First Strike (payoff); Warm Heart (support); Gentle Touch (support); Unflappable (support); Light Feet (support); Proud Wings (payoff, support) |
| sproutle | Tough Hide (guard); Steady Paws (guard); Unflappable (guard, support); Quick Healer (guard); Warm Heart (support); Gentle Touch (support); Light Feet (support); Stands Close (guard, support) |
| ashmole | Warm Heart (support); Gentle Touch (support); Unflappable (support, guard); Light Feet (support); Tough Hide (guard); Steady Paws (guard); Quick Healer (guard); Toasty Paws (support, guard) |
| zipmouse | Sharp Claws (setter); Light Feet (setter); Unflappable (setter, guard); Lasting Marks (setter); Tough Hide (guard); Steady Paws (guard); Quick Healer (guard); Zoomies (setter, guard) |
| cindle | Sharp Claws (payoff, setter); Keen Eye (payoff); Big Finish (payoff); First Strike (payoff); Light Feet (setter); Unflappable (setter); Lasting Marks (setter); Fiercely Loyal (payoff, setter) |
| mistnewt | Tough Hide (guard); Steady Paws (guard); Unflappable (guard, support); Quick Healer (guard); Warm Heart (support); Gentle Touch (support); Light Feet (support); Slow and Unbothered (guard, support) |
| mossback | Sharp Claws (setter, payoff); Light Feet (setter); Unflappable (setter); Lasting Marks (setter); Keen Eye (payoff); Big Finish (payoff); First Strike (payoff); Tends the Garden (setter, payoff) |
| coralynx | Sharp Claws (payoff); Keen Eye (payoff); Big Finish (payoff); First Strike (payoff); Lone Hunter (payoff) |
| solmane | Sharp Claws (setter); Light Feet (setter); Unflappable (setter); Lasting Marks (setter); Leads from the Front (setter) |
| gaiadrake | Sharp Claws (payoff); Keen Eye (payoff); Big Finish (payoff); First Strike (payoff); Ecosystem (payoff) |
| aurorix | Warm Heart (support); Gentle Touch (support); Unflappable (support); Light Feet (support); Starry Nights (support) |
| lanternfin | Warm Heart (support); Gentle Touch (support); Unflappable (support); Light Feet (support); Gentle Glow (support) |
| hearthshell | Tough Hide (guard); Steady Paws (guard); Unflappable (guard); Quick Healer (guard); Shares Its Warmth (guard) |
| mudlump | Tough Hide (guard); Steady Paws (guard); Unflappable (guard); Quick Healer (guard); Squishy (guard) |
| squelch | Warm Heart (support); Gentle Touch (support); Unflappable (support); Light Feet (support); Croaky Cheer (support) |

| Talent | Text | Intent |
| --- | --- | --- |
| Sharp Claws | Attack +8%. | Plain power for hitters. |
| Light Feet | +8 dodge. | A little dodge, more with Guards beside (R1). |
| Keen Eye | Crit chance +8. | Feeds Big Finish. |
| Big Finish | A crit on a hit that sets off a {Reaction} deals 60% more. | A Payoff combo talent with Keen Eye and crit gear. |
| First Strike | Its first hit each fight deals +40%. | Short fights and the dungeon. |
| Unflappable | It cannot be {Silenced}. | The silence answer on the creature itself. |
| Tough Hide | Armour +6. | Blocks more small hits (R13). |
| Steady Paws | Its cover is 15 points stronger. | Guards against sweeps. |
| Quick Healer | Healing it receives +30%. | Pairs with healer Supports. |
| Warm Heart | Its {Boost} is 5 points stronger. | A Support that hits harder through others. |
| Gentle Touch | It heals 3 points more (a Support of any element heals with it). | Makes Ember and Spark Supports small healers. |
| Lasting Marks | {Seal}: its marks are not shed by the boss. | A Setter that answers shedding bosses without spending its Knack on it. |
| Proud Wings | Crit chance +5, and a crit on a {Reaction} hit deals 90% more. | Stormray line: the showy crit Payoff. |
| Stands Close | Its cover is 25 points stronger. | Sproutle line: guards friends by standing close. |
| Toasty Paws | It heals 4 points more, and its {Boost} 3 points more. | Ashmole line: a warm burrow for friends. |
| Zoomies | +15 dodge. | Zipmouse line: never sits still. |
| Fiercely Loyal | +15% on its hits while a living Guard stands beside it. | Cindle line: loyal to its team. |
| Slow and Unbothered | It cannot be {Silenced}, and Armour +4. | Mistnewt line: takes its time with everything. |
| Tends the Garden | Creatures beside it take 10% less from {Area hit}s. | Mossback line: the garden on its shell. |
| Splashes Everywhere | When it dodges, it hits back for 30% of its Attack ({Retaliate}). | Splashet line: playful and splashy. |
| Lone Hunter | +15% on its hits while no other Payoff stands in its row. | Coralynx: fierce about its territory. |
| Leads from the Front | Its first hit each fight deals +70%. | Solmane: loves to lead from the front. |
| Ecosystem | Creatures beside it take 15% less from {Area hit}s, and Armour +4. | Gaiadrake: protects every living thing it carries. |
| Starry Nights | Its {Boost} is 8 points stronger. | Aurorix: looks after friends from a distance. |
| Gentle Glow | It heals 5 points more. | Lanternfin: guides friends through the dark. |
| Shares Its Warmth | At round start it heals the creatures in its {Reach} by 2%. | Hearthshell: happy to share its warmth. |
| Squishy | Healing it receives +40%. | Mudlump line: soaks up whatever comes. |
| Croaky Cheer | Its {Boost} is 6 points stronger. | Squelch line: a cheerful croak. |

