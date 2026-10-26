/**
 * The keyword list of combat v2 (docs/design/combat/keywords.md is its readable copy). Knack text
 * writes keywords in braces, `{Taunt}`; a test checks that every one used exists here.
 */
export const KEYWORDS: Readonly<
  Record<string, { readonly means: string; readonly not: string; readonly step: string }>
> = {
  Mark: {
    means: 'The boss carries an element, with a count from x1 to x3.',
    not: 'A debuff',
    step: 'R3, R4',
  },
  Reaction: {
    means:
      'A Payoff of the right element cashes a mark: its hit gets a bonus and the count drops by 1.',
    not: 'Any hit that meets a mark',
    step: 'R5, R7',
  },
  Spend: {
    means:
      "Pay a cost to do something: part of a mark's count, a Store, or HP. The effect says what and how much.",
    not: 'A free bonus',
    step: 'R17',
  },
  Store: {
    means:
      'Up to 3 points of a named resource on the creature, gained and spent as the effect says.',
    not: 'Something kept between fights',
    step: 'R10',
  },
  Seal: { means: 'This mark is not shed by the boss.', not: 'It cannot be cashed', step: 'R8' },
  Taunt: {
    means: 'Every plain attack of the boss aims at this creature (moves do not).',
    not: 'Moves aim at it too',
    step: 'R9',
  },
  Intercept: {
    means: "Takes a hit meant for a creature in its reach, after that creature's failed dodge.",
    not: 'It rolls dodge itself',
    step: 'R1',
  },
  Retaliate: { means: 'Hits back when it dodges.', not: 'It hits back when hit', step: 'R1' },
  Blocked: {
    means: 'A hit that does not get past armour deals nothing.',
    not: 'A dodge',
    step: 'R13',
  },
  Silenced: {
    means:
      "Its Knack, talents, gear effects and its role's verb do nothing (a Setter does not mark, a Payoff does not cash, a Guard does not intercept or cover, a Support does not boost or heal). It still hits with its stats.",
    not: 'It skips its turn',
    step: 'R12',
  },
  Charged: {
    means: 'A boss move announced at round start: its slots are shown, and it lands on them.',
    not: 'A mark',
    step: 'R8',
  },
  Mired: {
    means: 'A debuff on the boss: per count it deals less damage and dodges less (at most x5).',
    not: 'A mark',
    step: 'R15',
  },
  Reach: {
    means: 'How many places to each side, in its row, a Guard or Support covers.',
    not: 'Its whole row',
    step: 'R1, R16',
  },
  Boost: {
    means: "A Support's bonus on a creature's next hit.",
    not: 'A lasting buff',
    step: 'R16',
  },
  'Area hit': {
    means: 'A hit on more than one slot; it is dodged at half chance.',
    not: 'A hit a Guard takes for you',
    step: 'R2',
  },
};

/** The keywords a text uses, `{Like} {This}`. */
export function keywordsIn(text: string): string[] {
  return [...text.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] ?? '');
}
