/**
 * The keyword list of combat v2 (docs/design/combat/keywords.md is its readable copy). Knack text
 * writes keywords in braces, `{Taunt}`; a test checks that every one used exists here.
 */
export const KEYWORDS: Readonly<Record<string, { readonly means: string; readonly step: string }>> =
  {
    Mark: {
      means: 'A Setter primes the boss with its element. Shown with a count, x1 to x3.',
      step: 'R3, R4',
    },
    Reaction: { means: 'A Payoff of the right element cashes a mark for a bonus.', step: 'R5, R7' },
    Spend: {
      means:
        'Pay a cost to do something: stacks of a mark, stored points, or HP. The effect names what and how much.',
      step: 'R7, R10',
    },
    Store: {
      means:
        'Up to 3 points of a named resource on the creature, gained and spent as the effect says.',
      step: 'R10',
    },
    Seal: { means: 'This mark is not shed by the boss.', step: 'R8' },
    Taunt: { means: "The boss's plain attack aims at this creature.", step: 'R9' },
    Intercept: {
      means: "Takes a hit meant for a creature in reach, after that creature's failed dodge.",
      step: 'R1',
    },
    Retaliate: { means: 'Hits back when it dodges.', step: 'R1' },
    Blocked: { means: 'A hit that does not get past the armour deals nothing.', step: 'R13' },
    Silenced: {
      means: 'Its Knack, talents and gear effects do nothing. Its stats and role still work.',
      step: 'R12',
    },
  };

/** The keywords a text uses, `{Like} {This}`. */
export function keywordsIn(text: string): string[] {
  return [...text.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] ?? '');
}
