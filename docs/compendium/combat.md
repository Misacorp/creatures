# Combat v2

Status: written 2026-10-31, with the names Misa approved on 2026-10-31 and 2026-11-01. Dev-only canon. **Combat v2 is in development and not shipped**: nothing here is in the game yet, and the shipped fights still run on the older rules (`creatures.md`, `talents.md`, `bosses.md`).

## What this file is

- The names of combat v2: the **Knack families**, the **Knacks**, the **keywords**, the **rule cards**, the boss and foe **moves** and the **Escalating meters**. Combat v2 talents are in `talents.md`, in their own section. The plan is `docs/design/combat/content-as-data.md` section 7, the words and the grammar are `docs/design/combat/grammar.md`.
- **The data files are the source of the numbers and the text:** `packages/game/src/combat-v2/data/` (`knacks.json`, `forms.json`, `keywords.json`, `cards.json`, `moves.json`, `raid-bosses.json`, `foes.json`, `talents.json`). Text quoted here as `(content: combat-v2/...)` is copied from them on the day this file was written, so any number inside a quote belongs to the data, not to this file. If a quote and the data disagree, the data is right and this file is out of date.
- In quoted player text, a word in `{braces}` is a keyword, with an entry in the keywords section below.
- Where Misa renamed something, the old name is given ("was Steady Mark") so old docs, panel reviews and lab reports stay readable. Ids never changed: a rename was one edit to the data.
- **Boss and foe moves** are the move library (the "Moves" section below): a themed name per behaviour and element, with the plain label under it (`docs/design/combat/grammar.md`, "Boss moves: behaviour and paint"). The **Escalating meters** and the Second Bloom phase are in their own section after it. Who uses a move is listed there; the bosses' own entries in `bosses.md` and `dungeon.md` are the shipped fights, which still run on the older rules.
- Tags are the ones in `README.md`. Canon lines are `(compendium detail, not shipped)` unless marked otherwise. The "Design" line of a Knack is `(design)`: what the Knack is for, from the `intent` in `knacks.json`, with the numbers left out.

## How the pieces fit

- A **creature form** brings its own **Knacks**. A creature knows its form's Knacks from the catch, and evolving adds the new form's own, as long as the role stays. When the role changes, only the new form's Knacks count. `(design: decisions, 2026-10-27)`
- A Knack belongs to one **family**: one rule, with different numbers or elements. `(design: grammar.md)`
- A boss can carry a **rule card**: a question the boss asks. Each card names the families that answer it. `(content: combat-v2/cards.json)`
- **Keywords** are the words the rules use. A keyword says what it means and, just as useful, what it is not. `(content: combat-v2/keywords.json)`
- The element chart, the marks and the reactions are in `world.md`. A **mark** here is the same thing as there.

## Knack families

A family is a kind of trick. Misa renamed one family: Ward is now **Silence Guard**, because Row Ward is damage reduction and this one is different.

| Family        | The rule `(content: combat-v2/knacks.json)`                                    | Knacks                                                          |
| ------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Seal          | Its marks are not shed.                                                        | Brand                                                           |
| Lead          | Boosts the next creature after it marks.                                       | Lead the Way                                                    |
| Heavy Prime   | Gives up its damage for more mark stacks (Setters only).                       | Feed the Marks, Double Mark                                     |
| Self Prime    | A non-Setter that marks what it can cash.                                      | Self-Starter                                                    |
| Guard Prime   | A Guard that marks, at a cost to its Guard role (P-02).                        | Primed by Pain, Drop Guard                                      |
| Support Prime | A Support that marks instead of its boost and heal.                            | Stack Up                                                        |
| Detonator     | A Payoff that spends several stacks.                                           | All In, Detonate                                                |
| Chain         | After a reaction, leaves a mark of its own element.                            | Leave a Trail                                                   |
| Flurry        | Several smaller hits.                                                          | Twin Strike                                                     |
| Reach         | Changes how far a Guard covers.                                                | Wide Reach                                                      |
| Intercept     | Changes which hits it takes for others (a non-Guard only when no Guard can).   | Night Watch, Take It All, Unlikely Guardian                     |
| Taunt         | Draws the plain attack.                                                        | Draw Fire                                                       |
| Evasion       | Its own dodge, with Retaliate or a Store.                                      | Zoom, Zigzag                                                    |
| Evasion aura  | Dodge for the creatures beside it or in its row (the largest aura applies).    | Mist Veil, Rolling Fog                                          |
| Row Ward      | Cuts area damage for its row or the creatures beside it (the largest applies). | Barricade, Living Shelter                                       |
| Silence Guard | Keeps the creatures beside it from being silenced.                             | Lantern Glow                                                    |
| Pierce        | Ignores some boss armour.                                                      | Sense Weakness, Find the Gap                                    |
| Luck          | Trades hit size for crits, or takes the sting out of a boss crit.              | Wild Swing, Cool Head                                           |
| Partner       | A bonus on its hits while a given role is, or is not, beside it.               | Reliably Covered, Territorial                                   |
| Support shape | Changes where a Support's boost and heal land, or replaces them.               | Clear Skies, Sunbeam, Curl Up, Wide Embrace, Drizzle, Starlight |
| Sustain       | Heals, on a reaction or at round start.                                        | Returning Tide, Clear the Air, Hearth                           |
| Store         | Fills over the fight, spends at 3.                                             | Eye of the Storm, Boiling Point                                 |
| Debuff        | Puts a debuff on the boss.                                                     | Sticky Mud, Squelch Song                                        |
| Signature     | An epic's own twist on a family, on one species only.                          | Crown of Embers                                                 |

## Knacks

Each entry: the family, the forms that know it, the player text, and a line of canon. Forms listed first are the ones that bring it; "kept when evolving" are the second forms that keep it. `(content: combat-v2/forms.json, with the evolution lines in creatures.json)`

### Brand

- Family: Seal.
- Was **Steady Mark**.
- Forms: Splashet, Wickat, Mossback, Solmane; kept when evolving by Tidewing, Ancientshell.
- Text `(content: combat-v2/knacks.json)`: "{Seal}: its marks are not shed by the boss."
- Canon `(compendium detail, not shipped)`: The mark is pressed in, not painted on: however hard the boss shrugs, it stays. Splashet's wet footprints that never quite dry, Solmane's light that stays on the fur.
- Design `(design)`: Answers a boss that shrugs marks off at the end of its turn (the Clean Scales card).

### Lead the Way

- Family: Lead.
- Forms: Splashet, Wickat, Solmane; kept when evolving by Tidewing.
- Text `(content: combat-v2/knacks.json)`: "After it leaves a mark, the next creature to act in its row gets +20% on that hit."
- Canon `(compendium detail, not shipped)`: Splashet and Wickat go first and look back. The next creature in the row follows the glow, like a lantern held up for the friend behind.
- Design `(design)`: Rewards putting the Payoff right after the Setter in a row.

### Feed the Marks

- Family: Heavy Prime.
- Forms: Mossback; kept when evolving by Ancientshell.
- Text `(content: combat-v2/knacks.json)`: "Its hit deals no damage. It leaves its {Mark} and adds 1 stack to every other mark on the boss."
- Canon `(compendium detail, not shipped)`: Mossback plants nothing new. The garden on its shell feeds every seed already in the ground, and what was there grows a little.
- Design `(design)`: For teams with several marks and Payoffs that spend more than one stack.

### Returning Tide

- Family: Sustain.
- Was **Circle Round**. Misa: give it Tide flavour.
- Forms: Tidewing.
- Text `(content: combat-v2/knacks.json)`: "Each reaction on a Tide mark heals the creature that set it off by 14% of its max HP."
- Canon `(compendium detail, not shipped)`: The wave that carries a reaction away comes back with a little of the sea for the one who set it off.
- Design `(design)`: Keeps a Payoff on its feet when reactions hurt it.

### Self-Starter

- Family: Self Prime.
- Was **Puddle Maker**. Misa: a puddle makes no sense here.
- Forms: Geyserpup.
- Text `(content: combat-v2/knacks.json)`: "When it sets off no {Reaction}, it leaves the mark it can cash, like a Setter."
- Canon `(compendium detail, not shipped)`: A pup that does not wait to be asked. It makes its own puddle, and bursts on cue.
- Design `(design)`: A Payoff that works without a Setter, at a slower pace.

### All In

- Family: Detonator.
- Was **All at Once**.
- Forms: Geyserpup, Bloomback.
- Text `(content: combat-v2/knacks.json)`: "Cashes only a mark at 3 stacks, and {Spend}s all of them."
- Canon `(compendium detail, not shipped)`: Wait, and wait, and then everything at once: a geyser, or a flower that opens only one time.
- Design `(design)`: The slow, huge hit: Misa's mark, mark, mark, big payoff choice.

### Leave a Trail

- Family: Chain.
- Forms: Geyserpup, Stormray, Cindle, Bloomback, Coralynx, Gaiadrake; kept when evolving by Tempestray, Pyrelynx.
- Text `(content: combat-v2/knacks.json)`: "After its {Reaction}, it leaves 1 stack of its own element's mark. A reaction on that mark leaves no further trail."
- Canon `(compendium detail, not shipped)`: Where one reaction ends, a small new mark begins. A crumb of its own element left for whoever comes next.
- Design `(design)`: Chains between elements: one Payoff primes another.

### Detonate

- Family: Detonator.
- Forms: Stormray, Cindle, Bloomback, Coralynx, Gaiadrake; kept when evolving by Tempestray, Pyrelynx.
- Text `(content: combat-v2/knacks.json)`: "{Spend}s all the stacks of the mark it cashes. Weak on 1 stack, strong on 2 or 3."
- Canon `(compendium detail, not shipped)`: One big pop instead of several small ones. Stormray's thunder, or Cindle's pounce once the marks have piled up.
- Design `(design)`: Pays off two Setters. Poor on a single stack.

### Twin Strike

- Family: Flurry.
- Forms: Tempestray.
- Text `(content: combat-v2/knacks.json)`: "Hits twice, each for 58%. Each hit can set off a reaction."
- Canon `(compendium detail, not shipped)`: Its wingbeats come in pairs, and each one stirs the storm.
- Design `(design)`: Weaker in a plain fight; useful against bosses that cap or dodge single hits.

### Clear Skies

- Family: Support shape.
- Forms: Halcyray, Aurorix.
- Text `(content: combat-v2/knacks.json)`: "Instead of its boost and heal: the boss cannot dodge the hits of creatures {Beside} it this round."
- Canon `(compendium detail, not shipped)`: The calm after the storm. For one round the boss has nowhere left to slip away to.
- Design `(design)`: The answer to an Elusive boss.

### Clear the Air

- Family: Sustain.
- Forms: Halcyray, Drizzlewt, Lanternfin.
- Text `(content: combat-v2/knacks.json)`: "Creatures beside it that set off a reaction heal 10% and lose their silence."
- Canon `(compendium detail, not shipped)`: A little rain and a little light. What was hushed or heavy lifts, and the creature beside it breathes easy again.
- Design `(design)`: Answers silence and reflected reactions on the Payoff.

### Eye of the Storm

- Family: Store.
- Was **Gather Calm**. Misa: turning reactions into damage is mayhem, not calm.
- Forms: Halcyray, Aurorix.
- Text `(content: combat-v2/knacks.json)`: "{Store} Calm: +1 for each reaction anywhere. At round start with 3 Calm, the creatures beside it get +45% and it spends all."
- Canon `(compendium detail, not shipped)`: The middle of a storm is where it all gathers. Each reaction nearby adds a little, and then it all goes out at once.
- Design `(design)`: A reaction-heavy line gets a burst every few rounds.

### Wide Reach

- Family: Reach.
- Forms: Sproutle, Mistnewt, Mudlump; kept when evolving by Thornbuck, Fogwyrm, Bogwarden.
- Text `(content: combat-v2/knacks.json)`: "Its reach is +1 slot on each side."
- Canon `(compendium detail, not shipped)`: A sprout's ears, a cloud of mist, a wide lump of peat: the shelter simply stretches over more friends.
- Design `(design)`: Protects fragile creatures that stand two slots away.

### Primed by Pain

- Family: Guard Prime.
- Forms: Sproutle; kept when evolving by Thornbuck.
- Text `(content: combat-v2/knacks.json)`: "Each time it {Intercept}s, it leaves 2 stacks of its own element's mark. Once a round."
- Canon `(compendium detail, not shipped)`: Shy Sproutle does not like being hit. Each time it takes one for a friend, a small mark sprouts where it stood.
- Design `(design)`: A Guard that marks by taking hits, so the Setter's slot can hold another hitter.

### Night Watch

- Family: Intercept.
- Forms: Thornbuck, Hearthshell.
- Text `(content: combat-v2/knacks.json)`: "Each boss turn it {Intercept}s the first {Wind-up} hit in its row, taking a quarter of it."
- Canon `(compendium detail, not shipped)`: The stag whose antlers shelter its herd stands in the way of the big, announced hit and takes the worst of it.
- Design `(design)`: Answers telegraphed big hits.

### Sunbeam

- Family: Support shape.
- Forms: Sunfawn, Lanternfin.
- Text `(content: combat-v2/knacks.json)`: "Instead of the creatures beside it, it heals and boosts every creature in front of it in its column."
- Canon `(compendium detail, not shipped)`: Blossom ears open toward the sun. The warmth reaches the whole line in front of it, not only the neighbours.
- Design `(design)`: Uses the whole board: healers belong at the back.

### Curl Up

- Family: Support shape.
- Forms: Sunfawn, Drizzlewt.
- Text `(content: combat-v2/knacks.json)`: "Its heal on a creature below half HP is tripled."
- Canon `(compendium detail, not shipped)`: A fawn curled up in the moss mends fastest when it is hurt most. The more a friend is hurt, the more it gives.
- Design `(design)`: For steady damage on a Guard.

### Stack Up

- Family: Support Prime.
- Was **Ready the Mark**. Misa: adding is not readying.
- Forms: Sunfawn, Ashmole, Squelch; kept when evolving by Magmole, Croakmire.
- Text `(content: combat-v2/knacks.json)`: "Instead of its boost and heal: it adds 1 stack to its own element's {Mark}."
- Canon `(compendium detail, not shipped)`: A little ash added to the heap, one stack at a time. The hearth is laid before anyone strikes.
- Design `(design)`: Lets a team without a Setter react, if a Payoff of the right element is there.

### Wide Embrace

- Family: Support shape.
- Was **Wide Warmth**.
- Forms: Ashmole, Croakmire; kept when evolving by Magmole.
- Text `(content: combat-v2/knacks.json)`: "Its boost also reaches one slot further on each side, at full strength."
- Canon `(compendium detail, not shipped)`: Warmth that reaches one friend further: a hug with longer arms.
- Design `(design)`: Wide rows with several hitters.

### Sense Weakness

- Family: Pierce.
- Was **Tunnel Through**.
- Forms: Magmole.
- Text `(content: combat-v2/knacks.json)`: "Hits by creatures beside it ignore half the boss's armour."
- Canon `(compendium detail, not shipped)`: Molten claws find the soft seam in the stone, and show the friends beside it where it is.
- Design `(design)`: Answers armoured bosses for plain hitters.

### Find the Gap

- Family: Pierce.
- Was **Gnaw Through**. Sharp Claws was wanted, but that is a talent's name.
- Forms: Pyrelynx.
- Text `(content: combat-v2/knacks.json)`: "Its own hits ignore a third of the boss's armour."
- Canon `(compendium detail, not shipped)`: A hunter whose fur glows like coals finds the gap in the bark by itself.
- Design `(design)`: Pierce for a single Payoff, its own hits only.

### Draw Fire

- Family: Taunt.
- Forms: Kilnmole, Hearthshell, Bogwarden.
- Text `(content: combat-v2/knacks.json)`: "{Taunt}. Armour +15."
- Canon `(compendium detail, not shipped)`: A bonfire, a chimney, a bog: too interesting to ignore. The boss looks at it first, and the shy ones are left alone.
- Design `(design)`: Takes the plain attacks off fragile creatures wherever they stand.

### Barricade

- Family: Row Ward.
- Was **Keep the Heat In**.
- Forms: Kilnmole, Hearthshell.
- Text `(content: combat-v2/knacks.json)`: "While it stands, its row takes 15% less from area and {Wind-up} hits."
- Canon `(compendium detail, not shipped)`: A bank of baked clay and warm shell. Whoever stands in its row feels the big hits a little less.
- Design `(design)`: Protects other players' creatures in its row in a raid.

### Boiling Point

- Family: Store.
- Was **Baked Shell**. Misa wanted it to be about pent-up anger.
- Forms: Kilnmole.
- Text `(content: combat-v2/knacks.json)`: "{Store} Heat: +1 at round start and each time it or a creature in its reach takes damage. At 3, the next {Reaction} by a creature beside it deals double bonus."
- Canon `(compendium detail, not shipped)`: Heat builds quietly in the chimney with every knock, and then the friend beside it gets to let it out. Patience with a limit, never meanness.
- Design `(design)`: A Guard beside a Payoff in a hard fight.

### Zoom

- Family: Evasion.
- Forms: Zipmouse; kept when evolving by Voltaro.
- Text `(content: combat-v2/knacks.json)`: "+20 dodge. When it dodges, it hits back for 50% of its Attack ({Retaliate})."
- Canon `(compendium detail, not shipped)`: Never sits still. Hit at it and it is already somewhere else, and it nips back on the way past.
- Design `(design)`: A Setter that survives, and adds damage, when the boss hits often.

### Double Mark

- Family: Heavy Prime.
- Forms: Tidewing, Zipmouse, Wickat; kept when evolving by Voltaro.
- Text `(content: combat-v2/knacks.json)`: "Its hit deals no damage. It leaves its {Mark} at 2 stacks."
- Canon `(compendium detail, not shipped)`: It does not strike. It simply touches twice as firmly, and the mark takes.
- Design `(design)`: Feeds Detonators and two Payoffs of the trigger element.

### Zigzag

- Family: Evasion.
- Forms: Voltaro.
- Text `(content: combat-v2/knacks.json)`: "{Taunt}, +12 dodge. {Store} Static: +1 per dodge; at 3, its next mark gets +1 stack."
- Canon `(compendium detail, not shipped)`: Fast and fearless. It draws the eye, is never quite where it was, and leaves static where it ran.
- Design `(design)`: A dodging tank beside a Guard.

### Take It All

- Family: Intercept.
- Was **Catch the Bolts**. Misa: "bolts" was too narrow.
- Forms: Ohmouse.
- Text `(content: combat-v2/knacks.json)`: "It {Intercept}s area hits too, and takes them with its cover's cut."
- Canon `(compendium detail, not shipped)`: The giant ears that catch stray bolts catch the splash too.
- Design `(design)`: Answers sweeps and splashes.

### Drop Guard

- Family: Guard Prime.
- Was **Lightning Ears**. Misa: the old name did not fit the effect.
- Forms: Ohmouse.
- Text `(content: combat-v2/knacks.json)`: "It leaves its own element's {Mark} like a Setter, but it does not {Intercept}, and Armour -8."
- Canon `(compendium detail, not shipped)`: A round, puffed-up mouse that is too busy sparking to guard. The shield comes down and the spark goes up.
- Design `(design)`: A Setter that survives the front row, at the price of the Guard's verb and some armour.

### Sticky Mud

- Family: Debuff.
- Was **Mud Wall**. The shipped v1 finale ability Mud Wall keeps its name until v1 goes.
- Forms: Mudlump; kept when evolving by Bogwarden.
- Text `(content: combat-v2/knacks.json)`: "Each hit it takes, even Blocked, puts {Mired} x1 on the boss."
- Canon `(compendium detail, not shipped)`: Whatever strikes it gets a little stuck. (The Bogwarden's own lore says it first.)
- Design `(design)`: Keeps the Mire debuff up once the old finale abilities go.

### Squelch Song

- Family: Debuff.
- Forms: Squelch; kept when evolving by Croakmire.
- Text `(content: combat-v2/knacks.json)`: "At round start the boss gains {Mired} x1."
- Canon `(compendium detail, not shipped)`: It hums when nobody listens, and the boss sinks a little deeper with every verse.
- Design `(design)`: Keeps the Mire debuff up.

### Reliably Covered

- Family: Partner.
- Was **Guard's Shadow**. The shipped gear line Guard's shadow keeps that name.
- Forms: Pyrelynx.
- Text `(content: combat-v2/knacks.json)`: "+10% on its hits while a living Guard stands beside it. Armour -10."
- Canon `(compendium detail, not shipped)`: A hunter at its best with a friend at its shoulder, and a little less sure of itself alone.
- Design `(design)`: A Payoff that wants a Guard partner, ideally another player's in a raid.

### Crown of Embers

- Family: Signature.
- Forms: Solmane.
- Text `(content: combat-v2/knacks.json)`: "Each {Mark} it leaves adds 2 stacks, and its hit still deals damage."
- Canon `(compendium detail, not shipped)`: The mane of living sunlight: every mark it leaves glows deeper, and it still gets to strike.
- Design `(design)`: Solmane's own twist: it feeds Detonators without giving up its damage.

### Mist Veil

- Family: Evasion aura.
- Was **Hide in Mist**. Misa: a mist noun.
- Forms: Mistnewt; kept when evolving by Fogwyrm.
- Text `(content: combat-v2/knacks.json)`: "Creatures beside it get +15 dodge."
- Canon `(compendium detail, not shipped)`: The cloud on its back drifts over the creatures beside it. Hard to aim at in the mist.
- Design `(design)`: A Guard that protects by hiding its friends.

### Rolling Fog

- Family: Evasion aura.
- Was **Thick Fog**.
- Forms: Fogwyrm.
- Text `(content: combat-v2/knacks.json)`: "Every creature in its row gets +8 dodge."
- Canon `(compendium detail, not shipped)`: The serpent that hides whole valleys. Its fog rolls along the whole row.
- Design `(design)`: The wide version of Mist Veil, for long raid rows.

### Drizzle

- Family: Support shape.
- Forms: Drizzlewt.
- Text `(content: combat-v2/knacks.json)`: "Instead of its boost and heal: it heals every creature in its row (itself too) by 5% of max HP."
- Canon `(compendium detail, not shipped)`: The mist has gathered into a little rain cloud, and it rains softly on the whole row, itself included.
- Design `(design)`: A row healer for long rows and steady damage.

### Living Shelter

- Family: Row Ward.
- Forms: Ancientshell.
- Text `(content: combat-v2/knacks.json)`: "Creatures beside it take 25% less from {Area hit}s."
- Canon `(compendium detail, not shipped)`: The shell has become a small living forest, and small creatures take shelter under it from the big sweeps.
- Design `(design)`: Ancientshell hosts its neighbours.

### Territorial

- Family: Partner.
- Forms: Coralynx.
- Text `(content: combat-v2/knacks.json)`: "+30% on its hits while no other living Payoff stands beside it."
- Canon `(compendium detail, not shipped)`: Coralynx guards its reef alone. It hits harder when no other hunter crowds in beside it.
- Design `(design)`: A placement question its owner controls.

### Unlikely Guardian

- Family: Intercept.
- Was **Carry Them**. Misa: it is a surprise, so the name says so.
- Forms: Gaiadrake.
- Text `(content: combat-v2/knacks.json)`: "{Intercept}s aimed hits for the creatures {Beside} it when no Guard can. Reaction bonus -25%."
- Canon `(compendium detail, not shipped)`: Nobody expects a hitter to step in front of the others, but the drake wearing forests on its back does, when no Guard can.
- Design `(design)`: A Payoff borrowing the Guard's verb at a cost.

### Starlight

- Family: Support shape.
- Forms: Aurorix.
- Text `(content: combat-v2/knacks.json)`: "Instead of its boost and heal: it {Boost}s every other creature in its row by 10%."
- Canon `(compendium detail, not shipped)`: Ribbons of aurora light, laid over every other creature in the row. It looks after friends from a distance.
- Design `(design)`: A row-wide boost for long raid rows.

### Lantern Glow

- Family: Silence Guard.
- Forms: Lanternfin.
- Text `(content: combat-v2/knacks.json)`: "Creatures beside it cannot be {Silenced}."
- Canon `(compendium detail, not shipped)`: A tail like a paper-bright lantern. Nothing hushes the creatures standing in its light.
- Design `(design)`: The silence answer that protects others.

### Hearth

- Family: Sustain.
- Forms: Hearthshell.
- Text `(content: combat-v2/knacks.json)`: "At round start it heals the creatures in its {Reach} by 6% of max HP."
- Canon `(compendium detail, not shipped)`: A small bonfire on its shell. Whoever stands close is warmed at the start of every round.
- Design `(design)`: A Guard that heals the creatures it protects.

### Wild Swing

- Family: Luck.
- Forms: Stormray, Cindle, Coralynx; kept when evolving by Tempestray, Pyrelynx.
- Text `(content: combat-v2/knacks.json)`: "Its hit deals 25% less, but it has +20 crit chance points and its {Crit}s get +0.5x."
- Canon `(compendium detail, not shipped)`: A showy, reckless swing: softer on average, but when it lands it lands loud.
- Design `(design)`: A crit machine. The wrong pick against a boss that caps hits or blocks small ones.

### Cool Head

- Family: Luck.
- Forms: Thornbuck.
- Text `(content: combat-v2/knacks.json)`: "{Crit}s on it and on the creatures {Beside} it deal no extra damage."
- Canon `(compendium detail, not shipped)`: Branching antlers and a calm eye. A lucky hit on it, or beside it, is only an ordinary one.
- Design `(design)`: The answer to a boss that crits (the Double Strike card).

## Keywords

A keyword is a word the rules use on purpose. The first column is the name; "means" and "is not" are the data's own text `(content: combat-v2/keywords.json)`. Build-up is now **Escalating**. Every other keyword kept its name.

### Marks, reactions and luck

The vocabulary of the element wheel in `world.md`, plus the lucky hit. `(compendium detail, not shipped)`

| Keyword   | Means                                                                                                                                                                                                                                                                                            | Is not                                | Old name |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | -------- |
| Mark      | The boss carries an element, with 1 to 3 stacks.                                                                                                                                                                                                                                                 | A debuff                              |          |
| Reaction  | A Payoff hits a Mark its element is strong against: bonus damage, and the mark loses 1 stack.                                                                                                                                                                                                    | Any hit that meets a mark             |          |
| Spend     | Pay a cost to do something: part of a mark's stacks, a Store, or HP. The effect says what and how much.                                                                                                                                                                                          | A free bonus                          |          |
| Store     | Up to 3 points of a named resource on the creature, gained and spent as the effect says.                                                                                                                                                                                                         | Something kept between fights         |          |
| Seal      | This mark is not shed by the boss.                                                                                                                                                                                                                                                               | It cannot be cashed                   |          |
| Crit      | A lucky hit that deals double (2x). Crit chance starts at 5%; the creature, its Knack, talents and items add points of chance and add to the multiplier (+1x makes a 3x crit), and a boss with Double Strike crits too.                                                                          | A reaction                            |          |
| Sure Crit | A counter on the creature, up to 3, stored from something that happened to it (a dodge, a hit taken for another creature). Its next hit that lands and is not already a crit spends one and is a guaranteed crit, with the extra damage the effect names (a hit that is a crit anyway keeps it). | A Store of a Knack, or a lasting buff |          |

### Standing, covering and hushing

Who stands where, who covers whom, and what a creature can and cannot do. `(compendium detail, not shipped)`

| Keyword   | Means                                                                                                                                                                                                                  | Is not                              | Old name |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------- |
| Taunt     | The boss's plain attack, its basic hit, not its named moves, aims at this creature. With several Taunts, the first to act draws it.                                                                                    | Moves aim at it too                 |          |
| Intercept | Takes a hit meant for a creature in its Reach.                                                                                                                                                                         | It rolls dodge itself               |          |
| Retaliate | Hits back when it dodges; the hit back ignores armour.                                                                                                                                                                 | It hits back when hit               |          |
| Blocked   | A hit that does not get past armour deals nothing.                                                                                                                                                                     | A dodge                             |          |
| Silenced  | Its Knack, talents, gear effects and its role's verb do nothing (a Setter does not mark, a Payoff does not cash, a Guard does not intercept or cover, a Support does not boost or heal). It still hits with its stats. | It skips its turn                   |          |
| Beside    | The living creatures in the slots on each side of it, in its row. Never widened.                                                                                                                                       | Its Reach (which effects can widen) |          |
| Row end   | The first or last slot of its row.                                                                                                                                                                                     | The end living creature of the row  |          |
| Front row | The row nearest the boss.                                                                                                                                                                                              | The first row with a creature in it |          |
| Reach     | How many slots to each side, in its row, a Guard or Support covers. Starts at Beside; some effects widen it.                                                                                                           | Its whole row                       |          |
| Boost     | A Support's bonus damage on a creature's next hit.                                                                                                                                                                     | A lasting buff                      |          |
| Area hit  | A hit on more than one slot; it is dodged at half chance.                                                                                                                                                              | A hit a Guard takes for you         |          |

### The boss's moves and moods

Words for what a boss does and how it changes. The moves themselves are in the "Moves" section after the rule cards. `(compendium detail, not shipped)`

| Keyword       | Means                                                                                                                                                                                                                    | Is not                           | Old name |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | -------- |
| Wind-up       | A boss move announced at round start: its slots are shown, and it lands on them.                                                                                                                                         | The Spark mark Charged           |          |
| Mired         | A debuff on the boss: per stack it deals less damage and dodges less (at most 5 stacks). It fades by 1 at the end of every round.                                                                                        | A mark                           |          |
| Barrage       | A boss attack or move that hits a number of different creatures, drawn at random from the whole arena.                                                                                                                   | A hit on every creature of a row | Scatter  |
| Leap          | A boss move that hits one creature, then jumps to the strongest creature right next to it, and on, each jump softer.                                                                                                     | The Knack family Chain           |          |
| Cross         | A boss move that hits one creature and the creatures right beside, in front of and behind it.                                                                                                                            | A whole row or column            |          |
| Checker       | A boss move that hits every other slot of the arena, like the dark squares of a board.                                                                                                                                   | A row                            |          |
| Most hurt     | The creature with the lowest share of its max HP.                                                                                                                                                                        | The creature with the least HP   |          |
| Back-most     | The last living creature to act (by default the back row's right end).                                                                                                                                                   | The creature in the last slot    |          |
| Escalating    | A boss that is Escalating grows as a weekend goes on. It fills from something its text names (rounds, HP lost, reactions), grows a step each time it fills, up to a cap, carries across the weekend, and Mired slows it. | A phase of the raid              | Build-up |
| Determination | From the second lap of the boss order: +5% damage and healing for each failed weekend on the same boss, at most 5 stacks. Kept over a Festival, cleared when the boss is beaten.                                         | A reward for winning             |          |

## Rule cards

A rule card is a question a boss asks: can you land big hits, can you take a crit, who stands at the ends of the rows? The card says what it asks and which families answer it, so a player can prepare. A card asks at a low boss rank and requires only later, so a team without the answer still does real work. `(design: decisions, 2026-10-29, "rule cards ask before they require")` Misa approved all the cards, with one rename: Lucky Strike is now **Double Strike**. The plain baseline (no card) is not listed. The two raid-only cards have no written answer yet.

| Card                | The question it asks `(content: combat-v2/cards.json)`                                                                       | Answers                  | Old name     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------ |
| Thick Hide          | Small hits are Blocked; can you land big ones?                                                                               | Pierce, Detonator        |              |
| Stone Skin          | No hit deals more than a cap; can you hit often?                                                                             | Flurry                   |              |
| Clean Scales        | Marks are shed at the end of every boss turn; are Setter and Payoff in the same row?                                         | Seal                     |              |
| Reflective Hide     | The first reaction after each boss turn bounces back; can your Payoff take it?                                               | Sustain                  |              |
| Elusive             | The boss is quick: it dodges more often, and debuffs that slow it work as usual; can you make hits land?                     | Support shape            |              |
| Slippery            | The boss slips away from a quarter of all hits, whatever debuffs it has; can you make hits land?                             | Support shape, Detonator |              |
| Double Strike       | The boss's hits sometimes Crit for double damage; can you turn them away or take the sting out?                              | Luck, Evasion aura       | Lucky Strike |
| Bramble Bind        | The ends of every row are silenced; who stands at the ends?                                                                  | Silence Guard            |              |
| Wither              | Healing is halved; can you prevent damage instead?                                                                           | Taunt                    |              |
| Payoff Hunter       | Every 3 rounds it slams the strongest Payoff (aimed) and the slots beside it (area); is a Guard there?                       | Reach                    |              |
| Grudge              | It hits whoever dealt the most last round.                                                                                   | Taunt                    |              |
| Full Sweep          | Every 3 rounds a Wind-up sweep of a row; who stands there?                                                                   | Intercept, Row Ward      | Great Wave   |
| Swarm               | Its plain attack becomes a Barrage of 4 small hits; does armour or dodge hold?                                               | Evasion, Evasion aura    |              |
| Crusher             | One huge hit on the strongest every third round.                                                                             | Reach, Sustain           |              |
| Fizzle              | A mark left by a reaction cannot be cashed until after the next boss turn; do your chains cross rows?                        | Chain                    |              |
| Shake It Off        | Every 3 rounds the boss clears all its debuffs; can you put them back?                                                       | Debuff                   |              |
| Breakwater          | Row Wards are up to 3 times as strong against its Area hits                                                                  | Row Ward                 |              |
| Reaction Resistance | Raid only: from stage 2 it resists your most-used reaction.                                                                  | none written (raid only) |              |
| Element Resistance  | Raid only: from stage 2 the element that dealt the most damage hits it a quarter softer; is your team more than one element? | none written (raid only) |              |

Some cards give the boss a move (Bramble Bind, Payoff Hunter, Full Sweep, Crusher). Those moves are in the move library, under "Card moves" in the "Moves" section below. The card Full Sweep (was Great Wave) adds the move Wild Sweep; the Tidal Colossus keeps its tide move Great Wave, because a card's name never equals a move's name (the content gate checks it). The card's id is still `great-wave`.

## Moves

Every boss and foe move of combat v2 is one move of the **move library**: a themed name and a behaviour that never changes. The name is a coat of paint (and later an animation) over the behaviour; the **label** under each name is what the move does, in the words a player learns once ("Deepwater Spear · Nemesis Lance"). A behaviour has one name per element, shared by every boss and foe of that element that uses it. A rule card has no element, so the move a card adds is named by its plain label. Power, rhythm, count and Wind-up belong to the boss that uses the move, so none are here. `(design: decisions, 2026-11-01, "Combat v2 move library"; grammar.md, "Boss moves: behaviour and paint")` The names and the element tables were approved by Misa on 2026-11-01. `(content: combat-v2/moves.json)`

Each entry: the name and its label, who uses it, the older names it replaces (so old docs and lab reports stay readable), and a line of canon. The labels are: Front, Rear, Payoff, Nemesis (the strongest), Wild (at random) and Vulture (the most hurt) for whom a move picks, and Slam, Lance, Sweep, Barrage, Quake, Strike, Hush, Pincer and Leap for what it hits (`grammar.md`; Leap was Leaping Strike, and Barrage was Scatter as a keyword).

### Tide moves

Patient water: it pulls, rises and falls back, and is never in a hurry.

- **Deafening Mist** (Hush). Used by the Drift Wisp. Was Sea Mist. Canon `(compendium detail, not shipped)`: A mist so soft and so thick that your own voice stays in your throat.
- **Riptide** (Wild Lance). Used by the Tidal Colossus. Canon `(compendium detail, not shipped)`: One thin current, picked on a whim, that takes everything standing in its lane.
- **Deepwater Spear** (Nemesis Lance). Used by the Tidal Colossus. Was Tidal Pull and Deepwater Spear, which became one move. Canon `(compendium detail, not shipped)`: A long cold spear of the deep, thrown at whoever stands tallest.
- **Sluice Pull** (Front Lance). Used by the Drowned Warden. Canon `(compendium detail, not shipped)`: The gate opens, and the water takes the front of the line and whoever is behind it.
- **Undertow** (Front Sweep). Used by the Tidal Colossus. Canon `(compendium detail, not shipped)`: The sea draws back along the first row and takes the row with it.
- **Backflow** (Rear Sweep). Used by the Tidal Colossus. Was Breaker. Canon `(compendium detail, not shipped)`: What went out comes back the other way, along the back.
- **Rogue Wave** (Payoff Sweep). Used by the Tidal Colossus and, at a landmark, the Drowned Warden. Was Spring Tide (Colossus) and Sluice Surge (Warden). Canon `(compendium detail, not shipped)`: A wave that picks its row by who has been making the most noise.
- **Great Wave** (Wild Sweep). Used by the Tidal Colossus. Canon `(compendium detail, not shipped)`: A wall of water that rises somewhere, and nobody knows where until it is up.
- **Spray** (Barrage). Used by the Tidal Colossus. Canon `(compendium detail, not shipped)`: Drops flung high, falling wherever they please.
- **Deluge** (Quake). Used by the Drowned Warden. Was Flood Gate. Canon `(compendium detail, not shipped)`: Every gate open at once, and the water finds the whole line.

### Ember moves

Heat that lives in stone: warm, heavy and a little dangerous.

- **Anvil Fall** (Front Slam). Used by the Cinder Wyrm and the Slag Tyrant. Was Coil Crush (Wyrm). Canon `(compendium detail, not shipped)`: A weight of hot iron set down on whoever is first in line, warm to the creatures beside them.
- **Volcanic Meteor** (Payoff Slam). Used by the Cinder Wyrm. Was Magma Spit. Canon `(compendium detail, not shipped)`: A lump of molten stone, sent to whoever burns brightest.
- **Slag Spill** (Nemesis Slam). Used by the Slag Tyrant at a landmark. Canon `(compendium detail, not shipped)`: A slow pour of slag, aimed at the biggest hitter in the room.
- **Scorch Lane** (Wild Lance). Used by the Cinder Wyrm. Canon `(compendium detail, not shipped)`: A lane of heat across the cave floor, chosen on a whim.
- **Cinder Fall** (Barrage). Used by the Cinder Wyrm and the Ember Mite. Was Flare Up (Ember Mite). Canon `(compendium detail, not shipped)`: Embers drifting down like a warm, unwelcome snow.
- **Eruption** (Quake). Used by the Cinder Wyrm. Canon `(compendium detail, not shipped)`: The whole floor warms and heaves, and nobody is left out.
- **Ember Leap** (Leap). Used by the Cinder Wyrm. Canon `(compendium detail, not shipped)`: A spark that jumps from the best fuel to the next best.
- **Ash Cloud** (Checker). Used by the Cinder Wyrm. Canon `(compendium detail, not shipped)`: A grey cloud that settles on every other stone.

### Grove moves

Living patience: it holds, shelters and grows over time.

- **Bramble Hush** (Hush). Used by Thornmother, the Bramble Hound and the Bramble Matron. Was Thorn Snap (Hound) and Tangle (Matron). Canon `(compendium detail, not shipped)`: Brambles close in around the ends of the line, and nobody says a word.
- **Briar Pincer** (Pincer). Used by Thornmother and, at a landmark, the Bramble Matron. Was Briar Cage. Canon `(compendium detail, not shipped)`: Two briars close like a pair of hands on the ends of the row.
- **Vengeful Roots** (Nemesis Slam). Used by the Moss Lurker. Was Root Grab. Canon `(compendium detail, not shipped)`: Roots remember whoever was loudest, and reach for them first.
- **Grasping Vines** (Wild Lance). Used by Thornmother. Was Root Snare. Canon `(compendium detail, not shipped)`: Vines climb one column and hold on to whoever is in it.
- **Thorn Wall** (Front Sweep). Used by Thornmother. Canon `(compendium detail, not shipped)`: A hedge rises across the front rows.
- **Spiky Spine** (Rear Sweep). Used by Thornmother. Was Back Thorns. Canon `(compendium detail, not shipped)`: Her back is the part everybody forgets to watch.
- **Thorn Rain** (Barrage). Used by Thornmother and the Bramble Matron. Was Seed Burst and Bloom Storm (Thornmother), which became one move. Canon `(compendium detail, not shipped)`: Seeds fall like hail from a tree in bloom, and in the Second Bloom there are more of them.
- **Thorn Lash** (Leap). Used by Thornmother. Canon `(compendium detail, not shipped)`: A whip of vine that finds the strongest, then the one beside.
- **Bramble Cross** (Cross). Used by Thornmother. Canon `(compendium detail, not shipped)`: A cross of brambles pressed down on one spot.

### Spark moves

Quick, bright and short-lived: it arrives before the sound does.

- **Static Strike** (Payoff Slam). Used by the Storm Sovereign. Was Static Field. Canon `(compendium detail, not shipped)`: A crackle of charge that goes to the best conductor in the room.
- **Thunderclap** (Nemesis Slam). Used by the Storm Sovereign and, at a landmark, the Coil Baron. Was Coil Burst (Baron). Canon `(compendium detail, not shipped)`: The sound first, then the hit.
- **Lightning Bolt** (Wild Lance). Used by the Storm Sovereign. Was Forked Lightning. Canon `(compendium detail, not shipped)`: One bright line, down one column, from nowhere in particular.
- **Forked Lightning** (Barrage). Used by the Storm Sovereign. Was Ball Lightning. Canon `(compendium detail, not shipped)`: Many small flickers, forked and fast, landing all over.
- **Storm Front** (Quake). Used by the Storm Sovereign and the Flicker Swarm. Was Buzz Cloud (Swarm). Canon `(compendium detail, not shipped)`: The whole sky leans in at once.
- **Arc Lash** (Leap). Used by the Static Bat and the Coil Baron. Was Zap Dive (Bat). Canon `(compendium detail, not shipped)`: A little arc that hops from one creature to the next.
- **Thunderbolt** (Payoff Strike). Used by the Storm Sovereign. Was Spark Dive. Canon `(compendium detail, not shipped)`: One bolt, for one creature: the brightest.
- **Judgement Bolt** (One-shot). Used by the Storm Sovereign. Canon `(compendium detail, not shipped)`: The sky takes a long breath before it speaks, and it speaks once.

### Mire moves

Slow, soft and patient: the ground is not quite where you left it.

- **Belly Flop** (Front Slam). Used by Old Bogback and the Tar Leech. Was Tar Cling (Leech). Canon `(compendium detail, not shipped)`: A heavy, wet flop on whoever is at the front.
- **Bog Lob** (Payoff Slam). Used by Old Bogback. Canon `(compendium detail, not shipped)`: A clod of peat, lobbed at whoever is shining.
- **Mud Slide** (Wild Lance). Used by Old Bogback. Canon `(compendium detail, not shipped)`: A slick of mud slides down one column, taking its time.
- **Peat Wave** (Rear Sweep). Used by Old Bogback. Canon `(compendium detail, not shipped)`: A slow brown wave sits down on the back rows.
- **Sinking Mud** (Wild Sweep). Used by Old Bogback and, at a landmark, the Fen Lurker. Was Fen Tug (Lurker). Canon `(compendium detail, not shipped)`: The ground goes soft under one whole row, and nobody saw which.
- **Mud Spit** (Barrage). Used by Old Bogback and the Bog Toad. Was Rising Bubbles (Bogback). Canon `(compendium detail, not shipped)`: Bubbles rise, plop, and spit.
- **Sink Down** (Quake). Used by the Fen Lurker. Canon `(compendium detail, not shipped)`: The fen lowers itself an inch, under everyone at once.
- **Sinkhole** (Vulture Strike). Used by Old Bogback. Canon `(compendium detail, not shipped)`: A soft spot opens under the one who is already tired.

### Card moves

A rule card has no element, so the move it adds has the plain label as its name. `(content: combat-v2/moves.json, cards.json)`

- **Hush** (Hush). Added by the card Bramble Bind. Canon `(compendium detail, not shipped)`: The plain version: the ends of the line go quiet.
- **Payoff Slam** (Payoff Slam). Added by the card Payoff Hunter. Canon `(compendium detail, not shipped)`: The plain version: the boss goes for the one who has been shining, and the creatures beside them feel it.
- **Wild Sweep** (Wild Sweep). Added by the card Full Sweep. Canon `(compendium detail, not shipped)`: The plain version: a whole row, somewhere, announced a round ahead.
- **Crush** (Nemesis Strike). Added by the card Crusher. Canon `(compendium detail, not shipped)`: The plain version: one huge hit on the biggest hitter.

## Escalating meters

An **Escalating** boss or foe has a meter with a name of its own. It fills from something the fight does, grows the boss a step each time it fills, up to a cap, and Mired slows it. (The words are in the keywords section above.) The names are Misa's, approved 2026-10-31 and 2026-11-01. `(content: combat-v2/raid-bosses.json, foes.json)`

| Meter           | Whose           | Fills from            | Each step                                                        | Canon `(compendium detail, not shipped)`                          |
| --------------- | --------------- | --------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| Rising Tide     | Tidal Colossus  | HP lost               | A harder hit, and its columns and rows widen                     | The more it is hurt, the higher the water stands.                 |
| Forge Heat      | Cinder Wyrm     | Reactions cashed      | A harder hit, and one more creature in each volley               | Every reaction is a breath on the coals.                          |
| Awakening       | Thornmother     | HP lost               | A harder hit, one more jump, thinner bark; halfway, Second Bloom | She wakes by degrees, the way a garden does.                      |
| Gathering Storm | Storm Sovereign | Rounds passed         | A harder hit and one more jump                                   | The longer it takes, the darker it gets.                          |
| Maelstrom       | Drowned Warden  | Creatures knocked out | A harder hit                                                     | Each creature that falls lets the water rise. (Was Rising Water.) |
| Wisp Fog        | Drift Wisp      | Its own dodges        | It dodges more                                                   | Every miss thickens the fog.                                      |
| Warm Stones     | Ember Mite      | Marks shed            | A harder hit, and one more creature in each volley               | Each shed mark warms the stones a little more.                    |
| Static Charge   | Static Bat      | Crits on it           | A harder hit                                                     | Every crit leaves a little charge on its fur.                     |
| Molten Shell    | Slag Tyrant     | Reactions cashed      | More armour                                                      | Each reaction heats the shell until it glows.                     |
| Tightening Coil | Coil Baron      | Rounds passed         | A harder hit and one more jump                                   | The coil winds tighter with every round.                          |

### Second Bloom

The **phase** of Thornmother's Awakening. Halfway through the meter she blooms: it is announced a round ahead, her one Thorn Rain gets stronger, and Thorn Wall joins the fight, so the whole arena is in play. `(content: combat-v2/raid-bosses.json; design: grammar.md, "Boss moves")` Canon `(compendium detail, not shipped)`: Spring comes late to her, and all at once.

## Words on screen

The plain words the combat v2 screens use on purpose, so later text says the same thing the same way. They are interface words, not names from the world, and they carry no numbers. `(design: combat/proposals/001-combat-v2.md, "On the board"; integration.md, section 9)` The keywords have their own help (the glossary entry `kw-` and the keyword's name, for example `kw-wind-up`), written from the keywords section above. `(compendium detail, not shipped)`

| Word or phrase                                                 | Where it is used                                       | It says                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Mark strip                                                     | Under the boss                                         | The marks the boss carries, oldest first, each with its count.                                      |
| Boss turn                                                      | The strip of turns, and the board                      | The boss acts after every row.                                                                      |
| Stage 1, Stage 2, Live finale                                  | The weekend, the raid screen, How to play              | The three parts of a raid weekend: Saturday, Sunday, and Sunday evening, live.                      |
| Stage 2 of 3                                                   | The boss's HP bar                                      | Which stage the weekend is in.                                                                      |
| Out this weekend                                               | A knocked-out creature on the board and in lists       | It does not come back before the weekend ends. A spare takes its empty slot.                        |
| Out, Out until the camp swaps them                             | A creature at 0 HP in the dungeon's camp and run strip | It does not come back in this run until the camp's Swap brings a fresh creature in its place.       |
| Players lock in                                                | How to play, the raid screen                           | Whoever is on the board when stage 1 begins fights; no one joins after.                             |
| Ask to swap                                                    | Another player's creature on the raid board            | Asks its owner to trade slots. The answer comes as a notice row on Home.                            |
| Aimed when it comes                                            | A boss move that picks its slots at round start        | The slots are shown before the creatures act, and the move lands on them.                           |
| Back again                                                     | A small tag on a boss that returns                     | The server did not beat it last time. Its bar shows the most taken off so far.                      |
| Best so far                                                    | The pale fill on that bar                              | The most of its HP the server has taken off it.                                                     |
| Boss Rank                                                      | The raid screen, How to play                           | The server's place in the order of bosses. A kill moves it on.                                      |
| This creature has fought this weekend, so its Knack is locked. | The Knack picker                                       | A Knack can be changed until its creature has fought.                                               |
| Not in the new rules yet                                       | A gear piece's effect lines                            | The line does nothing in combat v2 for now.                                                         |
| Overload!, Wildfire!, ... with "+N"                            | Over the boss when a Payoff cashes a mark              | The reaction's own name (`reactions.json`) and the bonus damage it added.                           |
| x2.6!                                                          | Over a creature's hit on the boss when it crits        | How many times the hit's damage the crit made it.                                                   |
| Dodged!                                                        | Over a creature or the boss that dodged                | The hit missed.                                                                                     |
| Show Knack names in fights                                     | Settings, Fights                                       | Off by default: a creature's Knack name pops on it when it acts.                                    |
| Shape word, target word                                        | A move tile and its label ("Nemesis Lance")            | The shape says which slots it hits, the target says whom it picks (`grammar.md`).                   |
| Roles and Knacks, The board, Armour and crits                  | How to play, combat v2 sections                        | The page's sections, after "Marks and reactions" and before "The raid weekend" and "The Boss Rank". |

Never call a boss a wall, hard or harder anywhere on screen (Misa, 2026-10-31: players find out for themselves; no boss gets a warning line, `001-combat-v2.md` R24.8). The words above say what a boss does, never how it ranks.
