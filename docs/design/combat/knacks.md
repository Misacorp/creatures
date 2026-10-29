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
| Pierce | Ignores some boss armour. | Tunnel Through, Gnaw Through |
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
| pyrelynx | Detonate, Leave a Trail, Guard's Shadow, Gnaw Through |
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

- **Text:** Each reaction on a Tide mark heals the creature that set it off by 14% of its max HP.
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

- **Text:** Its reach is +1 slot on each side.
- **Family:** Reach
- **Forms:** sproutle, thornbuck, mistnewt, fogwyrm, mudlump, bogwarden
- **Intent (for contributors, never shown to players):** Protects fragile creatures two slots away; strong in wide raid rows.

### Primed by Pain

- **Text:** Each time it {Intercept}s, it leaves x2 of its own element's mark. Once a round.
- **Family:** Guard Prime
- **Forms:** sproutle, thornbuck
- **Intent (for contributors, never shown to players):** A Guard that marks by taking hits (panel 5: once a fight, and one count, was too little to build a team on): an Ember Payoff gets its reaction while the Setter slot becomes another hitter.

### Night Watch

- **Text:** Each boss turn it {Intercept}s the first {Wind-up} hit on a creature in its row, and takes it with its cover's cut.
- **Family:** Intercept
- **Forms:** thornbuck
- **Intent (for contributors, never shown to players):** Answers telegraphed big hits (Great Wave, Judgement Bolt). One hit a boss turn, and the hit it takes is cut by its own cover, so it is no longer a liability (panel 4).

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

- **Text:** Its boost also reaches one slot further on each side, 10% weaker.
- **Family:** Support shape
- **Forms:** ashmole, magmole, croakmire
- **Intent (for contributors, never shown to players):** Wide raid rows with several hitters.

### Tunnel Through

- **Text:** Hits by creatures beside it ignore half the boss's armour.
- **Family:** Pierce
- **Forms:** magmole
- **Intent (for contributors, never shown to players):** Answers armoured bosses for plain hitters.

### Gnaw Through

- **Text:** Its own hits ignore a third of the boss's armour.
- **Family:** Pierce
- **Forms:** pyrelynx
- **Intent (for contributors, never shown to players):** Pierce for a Payoff of a common species: its own plain and reaction hits get past thick bark (Thornmother, Tar Leech), where Tunnel Through helps the creatures beside a Support. Only the Payoff's hits, so it is a choice for one creature, not a row.

### Draw Fire

- **Text:** {Taunt}. Armour +15.
- **Family:** Taunt
- **Forms:** kilnmole, hearthshell, bogwarden
- **Intent (for contributors, never shown to players):** Takes the plain attacks off fragile creatures wherever they stand.

### Keep the Heat In

- **Text:** While it stands, its row takes 15% less from area and {Wind-up} hits.
- **Family:** Row Ward
- **Forms:** kilnmole, hearthshell
- **Intent (for contributors, never shown to players):** Protects other players' creatures in its row in the raid.

### Baked Shell

- **Text:** {Store} Heat: +1 at round start and each time it or a creature in its reach takes damage. At 3, the next {Reaction} by a creature beside it deals double bonus.
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

- **Text:** {Taunt}, +12 dodge. {Store} Static: +1 per dodge; at 3, its next mark gets +1 to its count.
- **Family:** Evasion
- **Forms:** voltaro
- **Intent (for contributors, never shown to players):** A dodge tank beside a Guard (dodge before intercept).

### Catch the Bolts

- **Text:** It {Intercept}s area hits too.
- **Family:** Intercept
- **Forms:** ohmouse
- **Intent (for contributors, never shown to players):** Answers sweeps and splashes.

### Lightning Ears

- **Text:** It leaves its own element's {Mark} like a Setter, but it does not {Intercept}, and Armour -8.
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

- **Text:** +15% on its hits while a living Guard stands beside it. Armour -8.
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
| splashet | First Pounce, Momentum, Edge-walker, Quick Draw, Hardy, Finisher, Owner's Mark |
| cindle | Steady Rhythm, Sharp Claws, Rally Cry, Owner's Mark, First Pounce, Front-liner, Shoulder to Shoulder |
| sproutle | Rally Cry, Shoulder to Shoulder, Brace, Triage, Hardy, Kindred Boost, Flank Guard |
| zipmouse | Momentum, First Pounce, Edge-walker, Flank Guard, Odd One Out, Deep Ink, Shoulder to Shoulder |
| mistnewt | Flank Guard, Unbothered, Overheal Spill, Bright Boost, Catch Breath, Shoulder Charge, Rally Cry |
| ashmole | Kindred Boost, Bright Boost, Shoulder Charge, Rally Cry, Brace, Hardy, Odd One Out |
| stormray | Slow Burn, Quick Draw, Edge-walker, Bright Boost, Momentum, Unbothered, Catch Breath |
| mossback | Owner's Mark, Opportunist, Finisher, Stubborn, Hardy, Brace, Rally Cry |
| coralynx | Sharp Claws, Odd One Out, Edge-walker, Finisher, Quick Draw, First Pounce, Momentum |
| solmane | Front-liner, Deep Ink, Owner's Mark, Shoulder to Shoulder, Rally Cry, Sharp Claws, Catch Breath |
| gaiadrake | Opportunist, Stubborn, Hardy, Catch Breath, Front-liner, Rally Cry, Finisher |
| aurorix | Bright Boost, Unbothered, Hardy, Edge-walker, Odd One Out, (Momentum), Rally Cry |
| lanternfin | Triage, Overheal Spill, Catch Breath, Hardy, Rally Cry, Odd One Out, Front-liner |
| hearthshell | Shoulder Charge, Stubborn, Catch Breath, Brace, Hardy, Odd One Out, Shoulder to Shoulder |
| mudlump | Heavy Hand, Clinging, Shoulder Charge, Brace, Hardy, Long Shadow, Flank Guard |
| squelch | Heavy Hand, Clinging, Bright Boost, Catch Breath, Hardy, Unbothered, Front-liner |

| Talent | Text | Roles | Intent |
| --- | --- | --- | --- |
| Sharp Claws | Attack +10%. | setter, payoff | Plain power for hitters; the small, steady number the conditional talents are judged against. |
| Hardy | Max HP +22%. | setter, payoff, guard, support | Plain staying power; carries through a raid weekend (R14). |
| Shoulder to Shoulder | +23% on its hits for each creature {Beside} it of its element, at most 2. | setter, payoff, guard, support | Mono-element pairs and trios: a reason to talk about placement in the raid. |
| Odd One Out | +18% on its hits while no creature {Beside} it shares its element. | setter, payoff, guard, support | The mixed row: the opposite of Shoulder to Shoulder. Like the shipped line it also holds when nothing stands beside it, so the number is small. |
| Edge-walker | +16% on its hits while it stands at a {Row end}. | setter, payoff, guard, support | A reason to stand at an end slot of the row (column 0 or the last column), whoever stands beside it: the owner controls it. Sweeps of the row ends make ends risky. |
| Front-liner | It takes 10% less from every hit in the {Front row}. | setter, payoff, guard, support | The front row takes the plain attack: a creature that wants to stand there. |
| Slow Burn | +2.5% on its hits per round from round 2, up to +15%. | setter, payoff | Strong in long raid stages, weak in short fights: a reason to own two of a species. |
| Finisher | +55% on its hits while the boss is below a third of its HP. | setter, payoff | With the boss HP shared across a raid weekend (R14), the last stage rewards it most. |
| First Pounce | Its first hit that lands each fight deals +170%. | setter, payoff | Short fights, the dungeon and each raid stage. A hit made while silenced does not use it up. |
| Steady Rhythm | Every third hit it makes is a crit, and its crits deal 10% more. | setter, payoff | Crits you can plan for (P-04): a rhythm instead of a chance. |
| Opportunist | Its {Reaction} bonus +120% when it cashes a {Mark} at x2 or more. | payoff | Rewards waiting for a bigger mark (x2 or x3); pairs with Setters that leave x2, and with a second Setter. Was x3 only (2026-10-28): a mark almost never reached x3 when cashed, so the talent did nothing. |
| Quick Draw | +32% on a {Reaction} on a mark added since the boss's last turn. | payoff | The opposite timing: cash right after the Setter, before Clean Scales sheds the mark. |
| Owner's Mark | {Reaction}s on a {Mark} it left have a +15% bonus while it stands. | setter | A Setter that makes its own marks worth more, whoever cashes them, while it stands and is not silenced. |
| Deep Ink | Its first {Mark} each fight adds 2 more to the count. | setter | Changes the opening without adding marks from nowhere: marks still come only from Setters and Knacks. |
| Rally Cry | +40% on its hits for the rest of the fight after a creature {Beside} it is knocked out. | setter, payoff, guard, support | Turns attrition into a comeback. It does not arm while the creature is silenced. |
| Momentum | After it dodges, or a Guard takes a hit aimed at it, its next hit deals +38%. | setter, payoff | Fast creatures and the creature in the front row: a hit aimed at it that is dodged, or that a Guard beside it takes, arms its next hit. Reworked (2026-10-28): a dodge alone almost never happens to a creature the boss does not aim at, so the talent did nothing. |
| Flank Guard | Its {Reach} covers only its longer side (more slots to the row end; both when it stands in the middle), twice the slots, and its cover is +50%. | guard | A Guard at one end protects the long stretch of the row: a placement puzzle the owner controls, with no Left/Right pair to roll. Twice the slots on one side covers no more creatures than one slot on each side, so the cover bonus is what makes it worth the placement (2026-10-28). |
| Long Shadow | Cover +20% per slot of distance, and the hits it takes for others are cut by 20% per slot. | guard | Protects the far creatures best; with Flank Guard a Guard at one end covers a long row. |
| Shoulder Charge | When it {Intercept}s, it strikes back for 45% of its Attack, ignoring armour. | guard | A Guard that adds damage the more it is hit. The strike-back is a counter, not a hit: it can land the killing blow but triggers nothing that keys on its hits. |
| Brace | It takes 40% less from a {Wind-up} hit aimed at its slot. | setter, payoff, guard, support | Answers a telegraphed hit (Great Wave, Judgement Bolt, the Wind-up signatures): it is shown at round start, so the owner knows who will be aimed at. Nothing against other moves or the plain attack. Back to this design (2026-10-28 panel 4): the version that also cut other moves and the plain attack decided a boss by itself. |
| Stubborn | Once per fight (in a raid, once per weekend), a hit that would knock it out leaves it at two fifths of its max HP, or at the HP it had if that was lower. | setter, payoff, guard, support | Survives one Crusher; pairs with healers. Hold On under its one name. Reworked (2026-10-28): it left the creature at 1 HP, which gained about 2% of a team's result, so it now leaves it at two fifths of its max HP. |
| Catch Breath | Once per fight (in a raid, once per weekend), when a hit drops it below half its max HP, it heals 40% of max HP. | setter, payoff, guard, support | Survives one big hit (Crusher, Payoff Hunter). Not the gear line Second Wind, which is a chance each round to heal. |
| Unbothered | It cannot be {Silenced}, and has +3% Attack and +6% Max HP. | setter, payoff, guard, support | The silence answer on the creature itself, for row ends and front rows. Reworked (2026-10-28): the immunity alone did nothing on the gauntlet, where a creature can always stand in the middle (a Guard gained nothing), so it carries a little Attack and HP as well, less than Sharp Claws or Hardy. Shrunk (2026-10-28 panel 4, from +6% and +14%): it won a boss by its stats; it should win by its ward. |
| Cull | A hit that leaves the boss below 5% of its full HP defeats it. The HP removed counts as the killing blow, not as damage. | setter, payoff | Weak alone; it decides who lands the killing blow, which other effects can key on. In no line pool until a killing-blow talent exists. |
| Heavy Hand | Its {Mired} has an 80% chance to add 1 extra stack. | guard, support | Mire only; the shipped line is a chance of an extra stack, and luck is welcome. More stacks per application keeps the debuff up. |
| Clinging | While it stands, {Mired} fades only every third round, and each stack counts for half as much again. | guard, support | Mire only: the v2 form of the shipped "lasts more turns"; one creature can hold a debuff for the team. Reworked (2026-10-28): slower fading alone gained under a point, so its stacks also count for half as much again (4.5% instead of 3%); it still fades, every third round, so one creature cannot hold the debuff for the whole fight (Misa). |
| Bright Boost | Every second {Boost} it gives is doubled. | support | A Support with a visible rhythm instead of a crit chance. |
| Kindred Boost | Its {Boost} +26% on creatures of its own element. | support | Mono-element rows in the raid, across players. |
| Triage | Its heal on the creatures {Beside} it goes to the most hurt one, 100% bigger. | support | Aims the Support's own base heal on the creatures beside it, bigger; only healing Supports (Tide, Grove) have a heal to aim. Idle under a Support shape Knack (Sunbeam, Drizzle, Curl Up and the rest), which replaces that verb. |
| Overheal Spill | Its healing past full HP passes to the most hurt creature in the row of the one it healed. | support | Big heals are never wasted; only healing Supports (Tide, Grove) have a heal. Goes to the most hurt creature in the row (was: beside the one healed), because overheal is rare and a short reach almost never had a target (2026-10-28). |

