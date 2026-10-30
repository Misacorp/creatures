# Combat v2 keywords (generated)

Generated from `packages/lab/src/keywords.ts` by `pnpm --filter @creatures/lab report`; do not edit by hand. A test checks that every `{Keyword}` in a Knack's text exists there. In the game, every keyword opens its definition on tap or hover.

| Keyword | Means | Does not mean | Rule |
| --- | --- | --- | --- |
| Mark | The boss carries an element, with a count from x1 to x3. | A debuff | R3, R4 |
| Reaction | A Payoff of the right element cashes a mark: its hit gets a bonus and the count drops by 1. | Any hit that meets a mark | R5, R7 |
| Spend | Pay a cost to do something: part of a mark's count, a Store, or HP. The effect says what and how much. | A free bonus | R17 |
| Store | Up to 3 points of a named resource on the creature, gained and spent as the effect says. | Something kept between fights | R10 |
| Seal | This mark is not shed by the boss. | It cannot be cashed | R8 |
| Taunt | Every plain attack of the boss aims at this creature (moves do not). | Moves aim at it too | R9 |
| Intercept | Takes a hit meant for a creature in its reach, after that creature's failed dodge. | It rolls dodge itself | R1 |
| Retaliate | Hits back when it dodges; the hit back ignores armour. | It hits back when hit | R1 |
| Blocked | A hit that does not get past armour deals nothing. | A dodge | R13 |
| Silenced | Its Knack, talents, gear effects and its role's verb do nothing (a Setter does not mark, a Payoff does not cash, a Guard does not intercept or cover, a Support does not boost or heal). It still hits with its stats. | It skips its turn | R12 |
| Wind-up | A boss move announced at round start: its slots are shown, and it lands on them. | The Spark mark Charged | R8 |
| Mired | A debuff on the boss: per count it deals less damage and dodges less (at most x5). It fades by 1 at the end of every second round. | A mark | R15 |
| Beside | The living creatures in the slots on each side of it, in its row. Never widened. | Its Reach (which effects can widen) | R16 |
| Row end | The first or last slot of its row. | The end living creature of the row | R21 |
| Front row | The row nearest the boss. | The first row with a creature in it | R8, R21 |
| Reach | How many slots to each side, in its row, a Guard or Support covers. Starts at Beside; some effects widen it. | Its whole row | R1, R16 |
| Boost | A Support's bonus on a creature's next hit. | A lasting buff | R16 |
| Area hit | A hit on more than one slot; it is dodged at half chance. | A hit a Guard takes for you | R2 |
| Scatter | A boss move that hits a number of different creatures, drawn at random from the whole arena. | A hit on every creature of a row | R2 |
| Leap | A boss move that hits one creature, then jumps to the strongest creature right next to it, and on, each jump softer. | The Knack family Chain | R2 |
| Cross | A boss move that hits one creature and the creatures right beside, in front of and behind it. | A whole row or column | R2 |
| Checker | A boss move that hits every other slot of the arena, like the dark squares of a board. | A row | R2 |
| Most hurt | The creature with the lowest share of its max HP. | The creature with the least HP | R2 |
| Back-most | The living creature in the row furthest from the boss (the leftmost, if several). | The creature in the last slot | R2 |
| Build-up | A boss that grows as a weekend goes on. It fills from something its text names (rounds, HP lost, reactions), grows a step each time it fills, up to a cap, carries across the weekend, and Mired slows it. | A phase of the raid | R8 |
| Crit | A lucky hit that deals double. Crit chance starts at 5%; the creature, its Knack, talents and items add points of chance and add to the extra damage, and a boss with a Lucky Strike crits too. | A reaction | R6, R7.1 |
| Crit Charge | A counter on the creature, up to 3, stored from something that happened to it (a dodge, a hit taken for another creature). Its next hit that lands spends one and is a guaranteed crit, with the extra damage the effect names. | A Store of a Knack, or a lasting buff | R7.1, R10 |
