export const ARCHETYPES = ['casual', 'daily', 'top', 'newcomer'] as const;
export type ArchetypeId = (typeof ARCHETYPES)[number];

export interface ArchetypeConfig {
  label: string;
  /** Days per week the player leets (chosen at random each week). */
  leetDaysPerWeek: number;
  /** Casuals check in once, on their leet days; the others check in twice every day. */
  checkIns: 'leet_days_once' | 'twice_daily';
  /** Chance (percent) the player signs up for the week's raid. */
  signUpPercent: number;
  /** First week (1-based) the player takes part. */
  joinWeek: number;
}

export const ARCHETYPE_CONFIG: Readonly<Record<ArchetypeId, ArchetypeConfig>> = {
  casual: {
    label: 'Casual',
    leetDaysPerWeek: 2,
    checkIns: 'leet_days_once',
    signUpPercent: 70,
    joinWeek: 1,
  },
  daily: {
    label: 'Daily',
    leetDaysPerWeek: 6,
    checkIns: 'twice_daily',
    signUpPercent: 100,
    joinWeek: 1,
  },
  top: {
    label: 'Top earner',
    leetDaysPerWeek: 7,
    checkIns: 'twice_daily',
    signUpPercent: 100,
    joinWeek: 1,
  },
  newcomer: {
    label: 'Newcomer',
    leetDaysPerWeek: 6,
    checkIns: 'twice_daily',
    signUpPercent: 100,
    joinWeek: 4,
  },
};

export type ArchetypeMix = Readonly<Record<ArchetypeId, number>>;

/** The default server: 10 players. */
export const DEFAULT_MIX: ArchetypeMix = { casual: 3, daily: 4, top: 2, newcomer: 1 };

export const DEFAULT_SERVER_SIZE = ARCHETYPES.reduce((n, a) => n + DEFAULT_MIX[a], 0);

/**
 * The default mix scaled to `count` players by largest-remainder apportionment (ties go to the
 * earlier archetype in the order casual, daily, top, newcomer). The result always sums to `count`.
 */
export function scaleMix(count: number): ArchetypeMix {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('player count must be >= 1');
  const total = DEFAULT_SERVER_SIZE;
  const parts = ARCHETYPES.map((id, order) => {
    const exact = DEFAULT_MIX[id] * count;
    return { id, order, base: Math.floor(exact / total), rem: exact % total };
  });
  let left = count - parts.reduce((n, p) => n + p.base, 0);
  const byRemainder = [...parts].sort((a, b) => b.rem - a.rem || a.order - b.order);
  const extra = new Set<ArchetypeId>();
  for (const p of byRemainder) {
    if (left <= 0) break;
    extra.add(p.id);
    left -= 1;
  }
  const out: Record<ArchetypeId, number> = { casual: 0, daily: 0, top: 0, newcomer: 0 };
  for (const p of parts) out[p.id] = p.base + (extra.has(p.id) ? 1 : 0);
  return out;
}
