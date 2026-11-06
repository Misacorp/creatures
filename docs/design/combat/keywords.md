# Combat v2 keywords (generated)

Generated from `packages/lab/src/keywords.ts` by `pnpm --filter @creatures/lab report`; do not edit by hand. A test checks that every `{Keyword}` in a Knack's text exists there. In the game, every keyword opens its definition on tap or hover.

| Keyword | Means | Does not mean | Rule |
| --- | --- | --- | --- |
| Mark | The boss carries an element, with 1 to 3 stacks. | A debuff | R3, R4 |
| Reaction | A Payoff hits a Mark its element is strong against: bonus damage, and the mark loses 1 stack. | Any hit that meets a mark | R5, R7 |
| Spend | Pay a cost to do something: part of a mark's stacks, a Store, or HP. The effect says what and how much. | A free bonus | R17 |
| Store | Up to 3 points of a named resource on the creature, gained and spent as the effect says. | Something kept between fights | R10 |
| Seal | This mark is not shed by the boss. | It cannot be cashed | R8 |
| Taunt | The boss's plain attack, its basic hit, not its named moves, aims at this creature. With several Taunts, the first to act draws it. | Moves aim at it too | R9 |
| Intercept | Takes a hit meant for a creature in its Reach. | It rolls dodge itself | R1 |
| Retaliate | Hits back when it dodges; the hit back ignores armour. | It hits back when hit | R1 |
| Blocked | A hit that does not get past armour deals nothing. | A dodge | R13 |
| Silenced | Its Knack, talents, gear effects and its role's verb do nothing (a Setter does not mark, a Payoff does not cash, a Guard does not intercept or cover, a Support does not boost or heal). It still hits with its stats. | It skips its turn | R12 |
| Wind-up | A boss move announced at round start: its slots are shown, and it lands on them. | The Spark mark Charged | R8 |
| Mired | A debuff on the boss: per stack it deals less damage and dodges less (at most 5 stacks). It fades by 1 at the end of every round. | A mark | R15 |
| Beside | The living creatures in the slots on each side of it, in its row. Never widened. | Its Reach (which effects can widen) | R16 |
| Row end | The first or last slot of its row. | The end living creature of the row | R21 |
| Front row | The row nearest the boss. | The first row with a creature in it | R8, R21 |
| Reach | How many slots to each side, in its row, a Guard or Support covers. Starts at Beside; some effects widen it. | Its whole row | R1, R16 |
| Boost | A Support's bonus damage on a creature's next hit. | A lasting buff | R16 |
| Area hit | A hit on more than one slot; it is dodged at half chance. | A hit a Guard takes for you | R2 |
| Barrage | A boss attack or move that hits a number of different creatures, drawn at random from the whole arena. | A hit on every creature of a row | R2 |
| Leap | A boss move that hits one creature, then jumps to the strongest creature right next to it, and on, each jump softer. | The Knack family Chain | R2 |
| Cross | A boss move that hits one creature and the creatures right beside, in front of and behind it. | A whole row or column | R2 |
| Checker | A boss move that hits every other slot of the arena, like the dark squares of a board. | A row | R2 |
| Most hurt | The creature with the lowest share of its max HP. | The creature with the least HP | R2 |
| Back-most | The last living creature to act (by default the back row's right end). | The creature in the last slot | R2 |
| Escalating | A boss that is Escalating grows as a weekend goes on. It fills from something its text names (rounds, HP lost, reactions), grows a step each time it fills, up to a cap, carries across the weekend, and Mired slows it. | A phase of the raid | R8 |
| Crit | A lucky hit that deals double (2x). Crit chance starts at 5%; the creature, its Knack, talents and items add points of chance and add to the multiplier (+1x makes a 3x crit), and a boss with Double Strike crits too. | A reaction | R6, R7.1 |
| Sure Crit | A counter on the creature, up to 3, stored from something that happened to it (a dodge, a hit taken for another creature, a boss crit kept plain). Its next hit that lands and is not already a crit spends one and is a guaranteed crit, with the extra damage the effect names (a hit that is a crit anyway keeps it). The extra is the spender's own: a Sure Crit from another creature deals what the spender's crit deals (a Perfect Timing creature's is 3x). | A Store of a Knack, or a lasting buff | R7.1, R10 |
| Determination | From the second lap of the boss order: +15% damage and healing for each failed weekend on the same boss, at most 5 stacks. Kept over a Festival, cleared when the boss is beaten. | A reward for winning | R24.9 |
