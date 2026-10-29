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
  Retaliate: {
    means: 'Hits back when it dodges; the hit back ignores armour.',
    not: 'It hits back when hit',
    step: 'R1',
  },
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
  'Wind-up': {
    means: 'A boss move announced at round start: its slots are shown, and it lands on them.',
    not: 'The Spark mark Charged',
    step: 'R8',
  },
  Mired: {
    means:
      'A debuff on the boss: per count it deals less damage and dodges less (at most x5). It fades by 1 at the end of every second round.',
    not: 'A mark',
    step: 'R15',
  },
  Beside: {
    means: 'The living creatures in the slots on each side of it, in its row. Never widened.',
    not: 'Its Reach (which effects can widen)',
    step: 'R16',
  },
  'Row end': {
    means: 'The first or last slot of its row.',
    not: 'The end living creature of the row',
    step: 'R21',
  },
  'Front row': {
    means: 'The row nearest the boss.',
    not: 'The first row with a creature in it',
    step: 'R8, R21',
  },
  Reach: {
    means:
      'How many slots to each side, in its row, a Guard or Support covers. Starts at Beside; some effects widen it.',
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
  Scatter: {
    means:
      'A boss move that hits a number of different creatures, drawn at random from the whole arena.',
    not: 'A hit on every creature of a row',
    step: 'R2',
  },
  Leap: {
    means:
      'A boss move that hits one creature, then jumps to the strongest creature right next to it, and on, each jump softer.',
    not: 'The Knack family Chain',
    step: 'R2',
  },
  Cross: {
    means:
      'A boss move that hits one creature and the creatures right beside, in front of and behind it.',
    not: 'A whole row or column',
    step: 'R2',
  },
  Checker: {
    means: 'A boss move that hits every other slot of the arena, like the dark squares of a board.',
    not: 'A row',
    step: 'R2',
  },
  'Most hurt': {
    means: 'The creature with the lowest share of its max HP.',
    not: 'The creature with the least HP',
    step: 'R2',
  },
  'Back-most': {
    means: 'The living creature in the row furthest from the boss (the leftmost, if several).',
    not: 'The creature in the last slot',
    step: 'R2',
  },
  'Build-up': {
    means:
      'A boss that grows as a weekend goes on. It fills from something its text names (rounds, HP lost, reactions), grows a step each time it fills, up to a cap, carries across the weekend, and Mired slows it.',
    not: 'A phase of the raid',
    step: 'R8',
  },
};

/** The keywords a text uses, `{Like} {This}`. */
export function keywordsIn(text: string): string[] {
  return [...text.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] ?? '');
}
