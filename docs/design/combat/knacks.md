# Knack catalogue (generated)

Generated from `packages/lab/src/knacks.ts` by `pnpm --filter @creatures/lab report`. Do not edit by hand: change the data and regenerate. Keywords in braces are defined in `keywords.md`.

## By form

| Form | Knacks (first is the default) |
| --- | --- |
| splashet | Soak Through, Lead the Way |
| tidewing | Soak Through, Downpour, Circle Round |
| geyserpup | Leave a Trail, Own Puddle, Big Spout |
| stormray | Detonate, Leave a Trail |
| tempestray | Detonate, Leave a Trail, Twin Strike |
| halcyray | Clear Skies, Clear the Air, Gather Calm |
| sproutle | Wide Reach, Primed by Pain |
| thornbuck | Wide Reach, Primed by Pain, Night Watch |
| sunfawn | Sunbeam, Curl Up, Ready the Mark |
| ashmole | Wide Warmth, Ready the Mark |
| magmole | Wide Warmth, Ready the Mark, Tunnel Through |
| kilnmole | Draw Fire, Keep the Heat In, Baked Shell |
| zipmouse | Zoom, Overcharge |
| voltaro | Zoom, Overcharge, Zigzag |
| ohmouse | Overcharge, Catch the Bolts, Static Shell |
| pyrelynx | Detonate, Leave a Trail |
| bloomback | Detonate, Leave a Trail |
| bogwarden | Mud Wall |
| croakmire | Squelch Song |

## Knacks

### Soak Through

- **Text:** {Seal}: its marks are not shed by the boss.
- **Family:** Seal
- **Forms:** splashet, tidewing
- **Intent (for contributors, never shown to players):** Answers bosses that shed marks on their turns (Clean Scales), which matter now that the boss acts after every row.

### Lead the Way

- **Text:** After it leaves a mark, the next creature to act in its row gets +20% on that hit.
- **Family:** Lead
- **Forms:** splashet
- **Intent (for contributors, never shown to players):** Rewards placing the Payoff right after the Setter in a row.

### Downpour

- **Text:** Its hit deals no damage. It leaves its mark and adds a stack to every other mark on the boss.
- **Family:** Heavy Prime
- **Forms:** tidewing
- **Intent (for contributors, never shown to players):** For multi-mark teams and Payoffs that spend several stacks.

### Circle Round

- **Text:** Each reaction on a Tide mark heals the creature that set it off by 8% of its max HP.
- **Family:** Sustain
- **Forms:** tidewing
- **Intent (for contributors, never shown to players):** Keeps Payoffs alive when reactions hurt them (Reflective Hide, Thorns).

### Own Puddle

- **Text:** When it sets off no reaction, it leaves the mark it can cash, like a Setter.
- **Family:** Self Prime
- **Forms:** geyserpup
- **Intent (for contributors, never shown to players):** A Payoff that works without a Setter, at half the pace.

### Big Spout

- **Text:** Sets off a reaction only on a mark with 2 or more stacks; then {Spend} all of them: each extra stack adds the whole bonus again.
- **Family:** Detonator
- **Forms:** geyserpup
- **Intent (for contributors, never shown to players):** Misa's mark-mark-mark-big-payoff choice: a slow, huge hit that breaks armour.

### Leave a Trail

- **Text:** After it sets off a reaction, it leaves a stack of its own element's mark.
- **Family:** Chain
- **Forms:** geyserpup, stormray, tempestray, pyrelynx, bloomback
- **Intent (for contributors, never shown to players):** Cross-element chains: a reaction primes the next one for another Payoff.

### Detonate

- **Text:** {Spend} every stack of the mark it cashes. Its bonus is 25% smaller, and each extra stack adds three quarters of it again.
- **Family:** Detonator
- **Forms:** stormray, tempestray, pyrelynx, bloomback
- **Intent (for contributors, never shown to players):** Pays off two Setters, or a Setter with Heavy Prime; worse than no Knack on a single stack.

### Twin Strike

- **Text:** Hits twice, each for 55%. Each hit can set off a reaction.
- **Family:** Flurry
- **Forms:** tempestray
- **Intent (for contributors, never shown to players):** Weaker in a plain fight; answers bosses that cap single hits or dodge a lot. Poor against armour.

### Clear Skies

- **Text:** Instead of boosting, the boss cannot dodge the hits of creatures beside it this round.
- **Family:** Support shape
- **Forms:** halcyray
- **Intent (for contributors, never shown to players):** Answers Elusive bosses.

### Clear the Air

- **Text:** Creatures beside it that set off a reaction heal 10% and lose their silence.
- **Family:** Sustain
- **Forms:** halcyray
- **Intent (for contributors, never shown to players):** Answers Reflective Hide, Thorns and silence on the Payoff.

### Gather Calm

- **Text:** {Store} Calm: +1 for each reaction anywhere. At round start with 3 Calm, the creatures beside it get +45% and it spends all.
- **Family:** Store
- **Forms:** halcyray
- **Intent (for contributors, never shown to players):** A reaction-heavy line gets a burst every few rounds.

### Wide Reach

- **Text:** Its reach is +1 on each side.
- **Family:** Reach
- **Forms:** sproutle, thornbuck
- **Intent (for contributors, never shown to players):** Protects fragile creatures two places away; strong in wide raid rows.

### Primed by Pain

- **Text:** The first time it intercepts each fight, it leaves a stack of its own element's mark.
- **Family:** Guard Prime
- **Forms:** sproutle, thornbuck
- **Intent (for contributors, never shown to players):** A Guard that helps prime for an Ember Payoff when no Grove Setter is around.

### Night Watch

- **Text:** It intercepts every charged landing aimed at a creature in its row, after that creature's failed dodge.
- **Family:** Intercept
- **Forms:** thornbuck
- **Intent (for contributors, never shown to players):** Answers telegraphed big hits (Great Wave).

### Sunbeam

- **Text:** Instead of the creatures beside it, it heals and boosts every creature in front of it in its column.
- **Family:** Support shape
- **Forms:** sunfawn
- **Intent (for contributors, never shown to players):** Uses the whole board: healers belong at the back. Bosses that hit the back row punish it.

### Curl Up

- **Text:** Its heal on a creature below half HP is tripled.
- **Family:** Support shape
- **Forms:** sunfawn
- **Intent (for contributors, never shown to players):** For steady damage on a Guard.

### Ready the Mark

- **Text:** Instead of boosting and healing, at round start it adds a stack of its own element's mark.
- **Family:** Support Prime
- **Forms:** sunfawn, ashmole, magmole
- **Intent (for contributors, never shown to players):** Lets a team without a Setter react; needs a Payoff of the right element.

### Wide Warmth

- **Text:** Its boost also reaches creatures two places away, 10 points weaker.
- **Family:** Support shape
- **Forms:** ashmole, magmole
- **Intent (for contributors, never shown to players):** Wide raid rows with several hitters.

### Tunnel Through

- **Text:** Hits by creatures beside it ignore half the boss's armour.
- **Family:** Pierce
- **Forms:** magmole
- **Intent (for contributors, never shown to players):** Answers armoured bosses for plain hitters.

### Draw Fire

- **Text:** {Taunt}. Armour +15.
- **Family:** Taunt
- **Forms:** kilnmole
- **Intent (for contributors, never shown to players):** Takes the plain attacks off fragile creatures wherever they stand.

### Keep the Heat In

- **Text:** While it stands, its row takes 15% less from area hits and charged landings.
- **Family:** Row Ward
- **Forms:** kilnmole
- **Intent (for contributors, never shown to players):** Protects other players' creatures in its row in the raid.

### Baked Shell

- **Text:** {Store} Heat: +1 each time it or a creature in its reach takes damage. At 3, the next reaction beside it deals double bonus and spends all.
- **Family:** Store
- **Forms:** kilnmole
- **Intent (for contributors, never shown to players):** A Guard beside a Payoff in a hard fight.

### Zoom

- **Text:** +20 dodge. When it dodges, it hits back for 50% of its Attack ({Retaliate}).
- **Family:** Evasion
- **Forms:** zipmouse, voltaro
- **Intent (for contributors, never shown to players):** A Setter that survives and adds damage when the boss hits often.

### Overcharge

- **Text:** Its hit deals no damage. It leaves its mark with 2 stacks.
- **Family:** Heavy Prime
- **Forms:** zipmouse, voltaro, ohmouse
- **Intent (for contributors, never shown to players):** Feeds Detonators and two Payoffs of the trigger element.

### Zigzag

- **Text:** {Taunt}, +20 dodge. {Store} Static: +1 per dodge. With 3 Static its next mark gains +2 stacks and it spends all.
- **Family:** Evasion
- **Forms:** voltaro
- **Intent (for contributors, never shown to players):** A dodge tank beside a Guard (dodge before intercept).

### Catch the Bolts

- **Text:** It intercepts area hits on creatures in its reach too, after each one's failed dodge.
- **Family:** Intercept
- **Forms:** ohmouse
- **Intent (for contributors, never shown to players):** Answers sweeps and splashes.

### Static Shell

- **Text:** It leaves its own element's mark like a Setter. Its plain hit deals 50% less.
- **Family:** Guard Prime
- **Forms:** ohmouse
- **Intent (for contributors, never shown to players):** A Setter that survives the front row.

### Mud Wall

- **Text:** Each hit it takes puts a Mired stack on the boss.
- **Family:** Debuff
- **Forms:** bogwarden
- **Intent (for contributors, never shown to players):** Keeps Mire's debuff alive after finale abilities go.

### Squelch Song

- **Text:** At round start the boss gains a Mired stack.
- **Family:** Debuff
- **Forms:** croakmire
- **Intent (for contributors, never shown to players):** Keeps Mire's debuff alive after finale abilities go.

