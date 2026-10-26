# Combat v2 keywords

One definition per keyword. The lab's `packages/lab/src/keywords.ts` is the authority; a test checks that every `{Keyword}` in a Knack's text exists there. In the game, every keyword opens its definition on tap or hover.

| Keyword   | Means                                                                                           | Does not mean                 | Rule   |
| --------- | ----------------------------------------------------------------------------------------------- | ----------------------------- | ------ |
| Mark      | A Setter primes the boss with its element; shown with a count, x1 to x3                         | A debuff                      | R3, R4 |
| Reaction  | A Payoff of the right element cashes a mark for a bonus                                         | Any hit that meets a mark     | R5, R7 |
| Spend     | Pay a cost to do something: counts of a mark, a Store, or HP; the effect says what and how much | A free bonus                  | R17    |
| Store     | Up to 3 of a named resource on the creature, gained and spent as the effect says                | Something kept between fights | R10    |
| Seal      | This mark is not shed by the boss                                                               | It cannot be cashed           | R8     |
| Taunt     | The boss's plain attack aims at this creature                                                   | Moves aim at it too           | R9     |
| Intercept | Takes a hit meant for a creature in reach, after that creature's failed dodge                   | It rolls dodge itself         | R1     |
| Retaliate | Hits back when it dodges                                                                        | It hits back when hit         | R1     |
| Blocked   | A hit that does not get past armour deals nothing                                               | A dodge                       | R13    |
| Silenced  | Its Knack, talents and gear effects do nothing; stats and role still work                       | It skips its turn             | R12    |
