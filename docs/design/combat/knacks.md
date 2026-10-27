# Knack catalogue (generated)

Generated from `packages/lab/src/knacks.ts` by `pnpm --filter @creatures/lab report`. Do not edit by hand: change the data and regenerate. Keywords in braces are defined in `keywords.md`.

## Families

| Family | Rule | Knacks |
| --- | --- | --- |
| Seal | Its marks are not shed. | Steady Mark |
| Lead | Boosts the next creature after it marks. | Lead the Way |
| Heavy Prime | Gives up its damage for more mark counts (Setters only). | Feed the Marks, Double Mark |
| Self Prime | A non-Setter that marks what it can cash. | Puddle Maker |
| Guard Prime | A Guard that marks, at a cost to its Guard role (P-02). | Primed by Pain, Lightning Ears |
| Support Prime | A Support that marks instead of its boost and heal. | Ready the Mark |
| Detonator | A Payoff that spends several counts. | All at Once, Detonate |
| Chain | After a reaction, leaves a mark of its own element. | Leave a Trail |
| Flurry | Several smaller hits. | Twin Strike |
| Reach | Changes how far a Guard covers. | Wide Reach |
| Intercept | Changes which hits it takes for others (a non-Guard only when no Guard can). | Night Watch, Catch the Bolts, Carry Them |
| Taunt | Draws the plain attack. | Draw Fire |
| Evasion | Its own dodge, with Retaliate or a Store. | Zoom, Zigzag |
| Evasion aura | Dodge for the creatures beside it or in its row (the largest aura applies). | Hide in Mist, Thick Fog |
| Row Ward | Cuts area damage for its row or the creatures beside it (the largest applies). | Keep the Heat In, Living Shelter |
| Ward | Keeps the creatures beside it from being silenced. | Lantern Glow |
| Pierce | Ignores some boss armour. | Tunnel Through |
| Partner | A bonus on its hits while a given role is, or is not, beside it. | Guard's Shadow, Territorial |
| Support shape | Changes where a Support's boost and heal land, or replaces them. | Clear Skies, Sunbeam, Curl Up, Wide Warmth, Drizzle, Starlight |
| Sustain | Heals, on a reaction or at round start. | Circle Round, Clear the Air, Hearth |
| Store | Fills over the fight, spends at 3. | Gather Calm, Baked Shell |
| Debuff | Puts a debuff on the boss. | Mud Wall, Squelch Song |
| Signature | An epic's own twist on a family, on one species only. | Crown of Embers |

## By form

| Form | Knacks |
| --- | --- |
| splashet | Steady Mark, Lead the Way |
| tidewing | Steady Mark, Lead the Way, Double Mark, Circle Round |
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
| ohmouse | Catch the Bolts, Lightning Ears |
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
- **Forms:** splashet, tidewing, wickat, solmane
- **Intent (for contributors, never shown to players):** Rewards placing the Payoff right after the Setter in a row.

### Feed the Marks

- **Text:** Its hit deals no damage. It leaves its {Mark} and adds 1 to the count of every other mark on the boss.
- **Family:** Heavy Prime
- **Forms:** mossback, ancientshell
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

- **Text:** Cashes only a mark at x3, and {Spend}s all of its count.
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

- **Text:** Instead of its boost and heal: the boss cannot dodge the hits of creatures {Beside} it this round.
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

- **Text:** Instead of its boost and heal: it adds 1 to its own element's {Mark}.
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
- **Forms:** tidewing, zipmouse, voltaro, wickat
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

- **Text:** It leaves its own element's {Mark} like a Setter, but it does not {Intercept}, and Armour -22.
- **Family:** Guard Prime
- **Forms:** ohmouse
- **Intent (for contributors, never shown to players):** A Setter that survives the front row; it pays with the Guard's verb and its armour (P-02: never a Setter and a Guard in one body).

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
- **Family:** Partner
- **Forms:** pyrelynx
- **Intent (for contributors, never shown to players):** A Payoff that wants a Guard partner, ideally another player's in the raid. The same name as the gear line with the same effect.

### Crown of Embers

- **Text:** Each {Mark} it leaves adds 2 to the count, and its hit still deals damage.
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

- **Text:** Instead of its boost and heal: it heals every creature in its row (itself too) by 5% of max HP.
- **Family:** Support shape
- **Forms:** drizzlewt
- **Intent (for contributors, never shown to players):** A row healer for long raid rows and steady damage.

### Living Shelter

- **Text:** Creatures beside it take 25% less from {Area hit}s.
- **Family:** Row Ward
- **Forms:** ancientshell
- **Intent (for contributors, never shown to players):** Ancientshell hosts small creatures: a Setter that shelters its neighbours from sweeps.

### Territorial

- **Text:** +30% on its hits while no other living Payoff stands beside it.
- **Family:** Partner
- **Forms:** coralynx
- **Intent (for contributors, never shown to players):** Coralynx guards its reef alone: a placement question its owner controls (beside, not the whole row, so other players cannot switch it off).

### Carry Them

- **Text:** {Intercept}s aimed hits for the creatures {Beside} it when no Guard can. Reaction bonus -25%.
- **Family:** Intercept
- **Forms:** gaiadrake
- **Intent (for contributors, never shown to players):** Gaiadrake protects everything it carries: a Payoff borrowing the Guard's verb at a cost (P-02).

### Starlight

- **Text:** Instead of its boost and heal: it {Boost}s every other creature in its row by 10%.
- **Family:** Support shape
- **Forms:** aurorix
- **Intent (for contributors, never shown to players):** Aurorix looks after friends from a distance: a row-wide boost for long raid rows.

### Lantern Glow

- **Text:** Creatures beside it cannot be {Silenced}.
- **Family:** Ward
- **Forms:** lanternfin
- **Intent (for contributors, never shown to players):** Lanternfin guides friends through the dark: the silence answer that protects others.

### Hearth

- **Text:** At round start it heals the creatures in its {Reach} by 6% of max HP.
- **Family:** Sustain
- **Forms:** hearthshell
- **Intent (for contributors, never shown to players):** Hearthshell hosts friends around its fire: a Guard that heals the creatures it protects.

## Combat talents

Generated from `packages/lab/src/talents.ts`. One shared library; each line links to its own pool (branch forms share it). A talent that does nothing for a form's role is idle on it (in brackets). One name per effect; a talent never repeats a Knack's effect.

| Line | Pool |
| --- | --- |
| splashet | Light Feet, Sharp Claws, Unflappable, First Strike, Hunker Down, Keen Eye, Hungry |
| cindle | Sharp Claws, Keen Eye, Mighty Blow, Big Finish, Cornered, Light Feet, First Strike |
| sproutle | Tough Hide, Broad Back, Hardy, Second Wind, Gentle Touch, Big Heart, Hold On |
| zipmouse | Light Feet, Nimble, Sharp Claws, Unflappable, Keen Eye, Tough Hide, First Strike |
| mistnewt | Unflappable, Hardy, Hunker Down, Broad Back, Gentle Touch, Second Wind, Nimble |
| ashmole | Big Heart, Gentle Touch, Tough Hide, Hunker Down, Hardy, (Cornered), Broad Back |
| stormray | Keen Eye, Big Finish, Mighty Blow, Sharp Claws, Gentle Touch, Big Heart, Nimble |
| mossback | Tough Hide, Hardy, Hold On, Unflappable, Hungry, Sharp Claws, Hunker Down |
| coralynx | Sharp Claws, Keen Eye, Cornered, Hungry, Light Feet, First Strike, Mighty Blow |
| solmane | First Strike, Sharp Claws, Unflappable, Hardy, Light Feet, Cornered, Tough Hide |
| gaiadrake | Hardy, Hungry, Big Finish, Tough Hide, Hold On, Sharp Claws, Hunker Down |
| aurorix | Big Heart, Nimble, Light Feet, Gentle Touch, Unflappable, (Keen Eye), Hardy |
| lanternfin | Gentle Touch, Big Heart, Unflappable, Light Feet, Second Wind, Hardy, Nimble |
| hearthshell | Broad Back, Tough Hide, Second Wind, Hold On, Hardy, Hunker Down, Unflappable |
| mudlump | Hardy, Hold On, Tough Hide, Second Wind, Broad Back, Hunker Down, (Cornered) |
| squelch | Big Heart, Gentle Touch, (Cornered), Hardy, Nimble, Unflappable, Light Feet |

| Talent | Text | Roles | Intent |
| --- | --- | --- | --- |
| Sharp Claws | Attack +8%. | setter, payoff | Plain power for hitters. |
| Light Feet | Dodge +10. | setter, payoff, guard, support | Front-row creatures; more with dodge auras beside (R1). |
| Nimble | Dodge +10 against {Area hit}s. | setter, payoff, guard, support | Sweeps and splashes (Great Wave, Payoff Hunter). |
| Keen Eye | Crit chance +8. | setter, payoff | Feeds Mighty Blow and Big Finish. |
| Mighty Blow | Its crits deal +30%. | setter, payoff | A crit build with Keen Eye. |
| Big Finish | A crit on a hit that sets off a {Reaction} raises its bonus by 60% (inside the cap). | payoff | A Payoff combo talent with Keen Eye; the reaction cap (R7) still holds. |
| Hungry | Its {Reaction} bonus +15% (inside the cap). | payoff | A steady Payoff talent, no crit needed. |
| First Strike | Its first hit that lands each fight deals +40%. | setter, payoff | Short fights, the dungeon and each raid stage. |
| Cornered | +25% on its hits while it is below half its max HP. | setter, payoff | A comeback talent; strong with healers and Second Wind. |
| Unflappable | It cannot be {Silenced}. | setter, payoff, guard, support | The silence answer on the creature itself, for row ends and front rows. |
| Tough Hide | Armour +6. | setter, payoff, guard, support | Blocks more small hits (R13): Swarm and multi-hit bosses. |
| Hardy | Max HP +10%. | setter, payoff, guard, support | Plain staying power; carries through a raid weekend (R14). |
| Hunker Down | It takes 20% less from {Area hit}s. | setter, payoff, guard, support | Its own cut; adds to a Row Ward beside it. |
| Hold On | Once per fight, a hit that would knock it out leaves it at 1 HP. | setter, payoff, guard, support | Survives one Crusher; pairs with healers. |
| Second Wind | Once per fight, when a hit drops it below half its max HP, it heals 20% of max HP. | setter, payoff, guard, support | Survives one big hit (Crusher, Payoff Hunter). |
| Broad Back | Cover +15. | guard | A Guard against sweeps. |
| Big Heart | Its {Boost} +5%. | support | A Support that hits harder through others. |
| Gentle Touch | Its heal +3% of max HP (a Support of any element heals with it). | support | Makes Ember and Spark Supports small healers. |

