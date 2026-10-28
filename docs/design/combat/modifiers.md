# Modifiers and the talent library (draft for discussion)

Status: **draft**, 2026-10-28. The first batch is built in the lab (35 talents, `packages/lab/src/talents.ts`), where the exact numbers now live; the tables below are the design they came from, and the wiki's Modifiers section is the current list. Written from Misa's request: talents that define how a creature plays, not just "+10% Attack". Names are placeholders until Misa approves them; numbers are starting guesses for the lab to tune.

## The idea in one paragraph

Everything that changes a creature in a fight is a **modifier**: "Attack +8%", "+40% while both neighbours share its element", "its Guard reach goes to the left only". Knacks, talents and gear are content that pick modifiers; they never invent rules of their own. One modifier has one name wherever it appears (P-06). The game already works this way for gear and today's talents: both use the same 92 **gear lines** (`packages/game/src/content/data/gear-lines.json`). Combat v2 extends that library with the lab's Knack effects and the new kinds below, and then builds the talent library from it: each talent is one modifier with a number (and its golden number), and each creature line links to the talents it can roll.

## What a modifier is made of

A modifier is a sentence with up to five parts. Most interesting ones use at least one part besides the number.

| Part                    | Asks                  | Examples                                                                                                                |
| ----------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **When** (condition)    | Is it on right now?   | while both neighbours share its element; at a row end; below half HP; while the boss carries a mark at x3; from round 4 |
| **On** (trigger)        | What makes it happen? | when it dodges; when it intercepts; when a neighbour is knocked out; when it crits                                      |
| **What**                | What changes?         | damage, a stat, a Guard's reach, a heal, a mark's count, a debuff's stacks                                              |
| **Who / where** (shape) | Which creatures?      | itself; beside it; its row; to its left only; further away counts more                                                  |
| **Limit** (rhythm)      | How often?            | once per fight; once per round; every third hit; up to 3                                                                |

Kinds that follow from the parts: **stat** (only What and a number: "Attack +8%"), **condition**, **trigger**, **shape**, **transfer** (gives part of its own stat to others), **rhythm** (every Nth time, no luck) and **rule bender** ("cannot be silenced", "counts as a Guard for...").

## What exists today

Sources: **G** a shipped gear line (gear and today's talents), **K** a lab Knack effect, **T** a lab draft talent. Only the combat ones; exploration and crafting lines stay as they are.

| Kind                   | Modifiers that exist                                                                                                                                                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stat                   | Attack, HP, crit chance, crit damage, armour, cover, boost, mend (G); dodge, area dodge, Max HP (T); Fleet (Speed), Light-footed (flat dodge) (G)                                                                                                                            |
| Condition: position    | Edge-walker (row end), Heart of the row (middle), Front-liner (front row), Back-row patience (back row) (G)                                                                                                                                                                  |
| Condition: neighbours  | Shoulder to shoulder (per neighbour of its element, at most 2), Odd one out (no neighbour shares its element), Guard's shadow (a Guard beside), Beside the mark-maker (a Setter beside), Four winds (four elements in its row) (G); Territorial (no other Payoff beside) (K) |
| Condition: fight state | First pounce / First Strike (first hit), Marked foe (boss carries a mark), Cornered (below half HP) (G, T); Last stand (at a quarter HP) (G)                                                                                                                                 |
| Element                | Attunement, Hunter, Ward, reaction bonus by element (G)                                                                                                                                                                                                                      |
| Trigger                | Riposte / Retaliate, Momentum, Slipstream (on dodge); Payback (on intercepting); Rally cry (a neighbour knocked out); Ember tail (on crit); Overflow (on reaction); Patient (on being silenced); Shared warmth (on being healed) (G); Second Wind, Hold On / Stubborn (T, G) |
| Shape                  | Wide stance, Long arm (left/right), Flank guard (left/right) (G); Wide Reach, Night Watch, Catch the Bolts, Sunbeam, Wide Warmth, Starlight, Drizzle, Carry Them (K)                                                                                                         |
| Aura (gives others)    | Lantern bearer (HP beside), Kindling (round 1 boost beside) (G); Hide in Mist, Thick Fog, Living Shelter, Keep the Heat In, Lantern Glow, Hearth (K)                                                                                                                         |
| Marks and reactions    | marking hit, Payoff's pounce, Owner's mark, Keen reaction, Spark-share (G); Double Mark, Feed the Marks, Detonate, All at Once, Leave a Trail, Steady Mark (Seal), Lead the Way (K); Hungry, Big Finish (T)                                                                  |
| Debuffs                | Heavy hand (extra stack), Clinging (lasts longer), Clean coat (debuffs on it weaker) (G); Mud Wall, Squelch Song (K)                                                                                                                                                         |
| Rule bender            | Unbothered / Unflappable (no silence), Brace (less from Charged), Storm warning (G); Taunt, Draw Fire (K)                                                                                                                                                                    |

Two things stand out. First, Misa's examples already have names: "+40% when both neighbours share its element" is **Shoulder to shoulder**; "reach to the left only" is **Flank guard (left)**; "debuffs add two stacks / last longer" are **Heavy hand** and **Clinging**. Second, many shipped lines are **chance-based** (Echo, Sidestep, Second wind, Warm heart, Steady paws, Spill-over). They stay (Misa, 2026-10-28: luck in effects is welcome); P-04 only asks that a creature's main job does not depend on a roll.

## New modifiers that come from the combat v2 rules

These use the new interactions (marks with counts, boss turns after each row, Charged announcements, armour and Blocked, attrition, auras, Stores) so a talent can make a creature play differently.

| New modifier                   | Kind            | What it does (example number)                                                                                   | Why it is interesting                                                                                                                  |
| ------------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Distance cover ("Long Shadow") | shape           | A Guard's cover and the cut on hits it intercepts grow by 10 points per slot of distance.                       | With Flank guard (left) a Guard at the right end of a long raid row protects the far creatures best: a placement puzzle (Misa's idea). |
| Count hunter ("Opportunist")   | condition       | +40% on a reaction that cashes a mark at x3.                                                                    | Rewards waiting for a full mark; pairs with Double Mark Setters.                                                                       |
| Fresh mark ("Quick Draw")      | condition       | +30% on a reaction that cashes a mark set this boss turn.                                                       | The opposite timing: cash right after the Setter, before Clean Scales sheds it.                                                        |
| Mark painter ("Deep Ink")      | trigger, rhythm | Its first mark each fight starts at x2.                                                                         | A Setter talent that changes the opening without adding marks from nowhere (marks still come only from Setters and Knacks).            |
| Slow burn                      | condition       | +8% per round from round 2, up to +48%.                                                                         | Strong in long raid stages, weak in the dungeon: a reason to own two of the same species.                                              |
| Finisher                       | condition       | +50% while the boss is below a third of its HP.                                                                 | With shared boss HP across a raid weekend (R14), stage 3 creatures differ from stage 1.                                                |
| Vengeful (Rally cry, sure)     | trigger         | +50% for the rest of the fight after a creature beside it is knocked out.                                       | Turns attrition into a comeback.                                                                                                       |
| Steady rhythm                  | rhythm          | Every third hit it makes is a crit.                                                                             | Crits you can plan for (P-04 friendly).                                                                                                |
| Brace for impact               | condition       | Takes 40% less from a Charged landing announced on its slot.                                                    | Reads straight off the board's Charged highlights.                                                                                     |
| Thick skull                    | rule bender     | A hit smaller than 10% of its max HP is Blocked.                                                                | A Swarm answer that scales with HP, not armour.                                                                                        |
| Share the load                 | transfer        | Creatures beside it get half its armour.                                                                        | A Guard that protects without intercepting.                                                                                            |
| Shoulder charge                | trigger         | When it intercepts, it hits back for 40% of its Attack (ignores armour).                                        | A Guard that adds damage the more it is hit.                                                                                           |
| Bright boost                   | rhythm          | Every second boost it gives is doubled.                                                                         | Supports with a visible rhythm instead of a crit chance.                                                                               |
| Triage                         | shape           | Its heal goes to the most hurt creature in its reach instead of everyone, at double size.                       | Changes how a healer is placed.                                                                                                        |
| Overheal spill                 | transfer        | Healing past full HP passes to the most hurt creature beside it.                                                | Makes big heals never wasted.                                                                                                          |
| Kindred boost                  | condition       | Its boost is +10% bigger on creatures of its own element.                                                       | Mono-element rows in the raid, across players.                                                                                         |
| Lone wolf                      | condition       | +40% while no creature stands beside it.                                                                        | The opposite of the aura builds; wants empty slots.                                                                                    |
| Light sleeper                  | rule bender     | The first silence each fight lasts one turn.                                                                    | A softer Unflappable (today's deferred talent, now buildable).                                                                         |
| Store saver                    | rule bender     | Its Store keeps 1 point between raid stages.                                                                    | The only thing that carries besides HP: rare, golden-worthy.                                                                           |
| Cull                           | rule bender     | A hit that leaves the foe below 5% of its max HP defeats it outright (bosses: a smaller threshold, or none).    | Weak alone; it decides **who lands the killing blow**, which other modifiers key on (Misa, 2026-10-28).                                |
| Killing blow                   | trigger         | When it lands the killing blow on a foe, something happens: more loot for the raid, a boost to its row, a heal. | Gives a reason to build around Cull and Finisher; loot effects are granted by the server like all loot.                                |

New engine hooks needed: distance scaling, mark age and count conditions, round counters, "boss below a share of HP", knockout and killing-blow triggers, a cull threshold, rhythm counters, Charged-on-slot, transfers, overheal. Each is a small rule in the engine port (roadmap phase 2), written once and reused by any talent, Knack or gear line.

## A talent library (proposal)

A talent is one modifier with its number. Conditional talents get **big** numbers; plain stat talents stay small. Each creature line then links to about 7 of these (Misa, 2026-10-27), so two creatures of the same role can play differently.

| Talent                       | For            | What it does (golden)                                                                         | Modifier                      |
| ---------------------------- | -------------- | --------------------------------------------------------------------------------------------- | ----------------------------- |
| Sharp Claws                  | hitters        | Attack +8% (+10%)                                                                             | stat (G: Creature Attack)     |
| Hardy                        | any            | Max HP +10% (+12%)                                                                            | stat (G: Creature HP)         |
| Shoulder to Shoulder         | any            | +20% on its hits for each neighbour of its element, at most 2 (+25%)                          | neighbours (G)                |
| Odd One Out                  | any            | +30% while no neighbour shares its element (+38%)                                             | neighbours (G)                |
| Lone Wolf                    | hitters        | +40% while no creature stands beside it (+50%)                                                | neighbours (new)              |
| Edge-walker                  | any            | +30% at either end of its row (+38%)                                                          | position (G)                  |
| Front-liner                  | any            | Takes 20% less from every hit in the front row (25%)                                          | position (G)                  |
| Slow Burn                    | hitters        | +8% per round from round 2, up to +48% (+60%)                                                 | fight state (new)             |
| Finisher                     | hitters        | +50% while the boss is below a third of its HP (+62%)                                         | fight state (new)             |
| First Strike                 | hitters        | Its first hit that lands each fight deals +60% (+75%)                                         | fight state (G: First pounce) |
| Steady Rhythm                | hitters        | Every third hit it makes is a crit (every third, and crits +15%)                              | rhythm (new)                  |
| Opportunist                  | Payoff         | +40% on a reaction that cashes a mark at x3 (+50%)                                            | marks (new)                   |
| Quick Draw                   | Payoff         | +30% on a reaction on a mark set this boss turn (+38%)                                        | marks (new)                   |
| Owner's Mark                 | Setter         | Reactions on marks it left deal +30% (+38%)                                                   | marks (G)                     |
| Deep Ink                     | Setter         | Its first mark each fight starts at x2 (and its second too)                                   | marks (new)                   |
| Vengeful                     | any            | +50% for the rest of the fight after a creature beside it is knocked out (+62%)               | trigger (G: Rally cry)        |
| Momentum                     | any            | After it dodges, its next hit deals +40% (+50%)                                               | trigger (G)                   |
| Flank Guard (left) / (right) | Guard          | Its reach covers only one side, with twice the slots (and +1 slot)                            | shape (G)                     |
| Long Shadow                  | Guard          | Its cover and the cut on hits it takes for others grow by 10 points per slot of distance (12) | shape (new)                   |
| Shoulder Charge              | Guard          | When it intercepts, it hits back for 40% of its Attack, ignoring armour (50%)                 | trigger (new)                 |
| Share the Load               | Guard          | Creatures beside it get half its armour (and 60%)                                             | transfer (new)                |
| Thick Skull                  | Guard, any     | A hit below 10% of its max HP is Blocked (12%)                                                | rule bender (new)             |
| Brace                        | any            | Takes 40% less from a Charged landing on its slot (50%)                                       | rule bender (G)               |
| Stubborn                     | any            | Once per fight, a hit that would knock it out leaves it at 1 HP (and heals 10%)               | trigger (G)                   |
| Heavy Hand                   | Support (Mire) | Its debuff adds 2 stacks at once (and the cap +1)                                             | debuff (G)                    |
| Clinging                     | Support (Mire) | Its debuff stacks fade one round later (two rounds)                                           | debuff (G)                    |
| Bright Boost                 | Support        | Every second boost it gives is doubled (every second, and boosts +5%)                         | rhythm (new)                  |
| Kindred Boost                | Support        | Its boost is +10% bigger on creatures of its own element (+12%)                               | condition (new)               |
| Triage                       | Support        | Its heal goes to the most hurt creature in its reach, at double size (2.5x)                   | shape (new)                   |
| Overheal Spill               | Support        | Healing past full HP passes to the most hurt creature beside it (and +10%)                    | transfer (new)                |
| Unflappable                  | any            | It cannot be silenced (and the first silence on a neighbour each fight fails)                 | rule bender (G: Unbothered)   |
| Light Sleeper                | any            | The first silence each fight lasts one turn (every silence one turn shorter)                  | rule bender (new)             |

Notes:

- **Debuffs fade** (Misa, 2026-10-28): Mired loses stacks over time (for example one per round), so a debuff creature must keep applying it and one such creature does not last the whole fight. Bosses may also cleanse all debuffs, announced at round start like Clean Scales sheds marks today (R8). Clinging then means slower fading; Heavy Hand means more stacks per application.
- **Marks still come only from Setters and Knacks.** Deep Ink changes the count of a mark the Setter makes anyway.
- **Where talents beat Knacks**: a Knack decides the job (what the creature does); a talent decides the style (where it wants to stand, when it peaks, what it punishes). They may combine (Flank Guard with the Wide Reach Knack covers four slots on one side), and that is the point.
- The current lab talents (Light Feet, Keen Eye, Big Finish, Hungry, Nimble, Mighty Blow, Hunker Down, Gentle Touch, Big Heart, Broad Back, Tough Hide, Hold On, Second Wind, Cornered) would mostly fold into this list or into the plain stat group; Hold On becomes Stubborn and Second Wind keeps its name (one name per effect).

## Caps on protection

Misa asked (2026-10-28) whether protection needs a cap. An **intercepted** hit needs none: the Guard still takes it, so stacking Long Shadow only moves damage onto the Guard. **Cover** is different: it cuts an area hit on the covered creature and nobody takes the rest, so cover (with Long Shadow, Broad Back and gear) is capped, like area cuts already are (lab: 75%). The lab today caps cover at 100%, which would make a creature immune; fix it with the first batch.

## Numbers and golden talents

- **Budget rule**: a talent's value while its condition holds, times how often the condition holds in a typical fight, lands near the same average (the lab measures it). So "+8% always" and "+40% only at a row end" cost the same, but the second one decides where the creature stands. That is how talents become defining without one being best everywhere (P-10: spiky, not flat).
- **Bigger numbers**: target (Misa, 2026-10-28): about +20% on the team's result for a talent at its best, about +8% to +15% for a good talent where it fits, and no single must-pick in a pool (see `decisions.md`).
- **Golden**: the number x1.25 (Misa, 2026-10-28: with bigger base values, golden comes down from x1.5). A talent with no number (Flank Guard, Unflappable, Stubborn) has its own small golden extra, written in brackets above.
- The lab measures each talent with its condition met and on average, and the report flags any talent that is best on most cards.

## How this shapes a roster

A creature carries the talents it found (its own Talent Book, R20) and swapping the slotted one costs a little Bait. So a player who wants both an Edge-walker Cindle and a Shoulder to Shoulder Cindle keeps two Cindles: the incentive to own more than the top three that P-11 asks for. In the raid, neighbour and position talents give players a reason to talk about placement and use swap requests (R19).

## Misa's answers (2026-10-28)

1. **Luck stays.** Chance-based modifiers are welcome; most effects may be luck-based. Rhythms ("every third hit") are a cool option, not a replacement.
2. **Debuffs fade over time**, and bosses may cleanse them (announced).
3. **A talent takes the gear line's name** when it is the same effect. A gear line is one modifier on an item (not a three-piece set); a talent and a gear line of the same name on one creature add up (R20.1).
4. **Build the first batch** into the lab and the wiki; Misa filters later at his own pace.
5. **Content changes are not held back** by players' existing items: see `decisions.md`, 2026-10-28.
