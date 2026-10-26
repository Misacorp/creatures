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
| Retaliate | Hits back when it dodges. | It hits back when hit | R1 |
| Blocked | A hit that does not get past armour deals nothing. | A dodge | R13 |
| Silenced | Its Knack, talents and gear effects do nothing. Its stats and role still work. | It skips its turn | R12 |
| Charged | A boss move announced at round start: its slots are shown, and it lands on them. | A mark | R8 |
| Mired | A debuff on the boss: per count it deals less damage and dodges less (at most x5). | A mark | R15 |
| Reach | How many places to each side, in its row, a Guard or Support covers. | Its whole row | R1, R16 |
| Boost | A Support's bonus on a creature's next hit. | A lasting buff | R16 |
| Area hit | A hit on more than one slot; it is dodged at half chance. | A hit a Guard takes for you | R2 |
