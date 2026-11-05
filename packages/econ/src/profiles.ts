import type { PlayerProfile } from './schema';

/**
 * Player profiles (model.md "Players"): data, not code. When they visit, whether they fight, how generously they give and the
 * default post policy. Weekdays count from Monday = 0; the raid's stages are Friday to Sunday (4 to 6).
 */
const base = {
  joinWeek: 1,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  everyNDays: 0,
  hours: [20],
  away: null,
  fights: true,
  // ASSUMPTION: "about a third" of Acorn income goes to projects (commons.md example).
  giveShare: 1 / 3,
  hoardWeeks: 0,
  policy: 'setAndForget' as const,
};

export const PROFILES: readonly PlayerProfile[] = [
  { ...base, id: 'daily', label: 'Daily (one evening visit)' },
  // An active player visits three times a day and re-tilts their seats each time.
  {
    ...base,
    id: 'active',
    label: 'Active (3 visits a day)',
    hours: [8, 13, 20],
    policy: 'optimiser',
  },
  { ...base, id: 'every-other-day', label: 'Every other day', weekdays: [], everyNDays: 2 },
  { ...base, id: 'weekend-off', label: 'Weekend off', weekdays: [0, 1, 2, 3, 4] },
  { ...base, id: 'weekly', label: 'Weekly (Sundays)', weekdays: [6] },
  { ...base, id: 'new', label: 'New (joins in week 6)', joinWeek: 6, policy: 'optimiser' },
  { ...base, id: 'returner', label: 'Returner (away weeks 5 to 8)', away: [5, 8] },
  {
    ...base,
    id: 'hoarder',
    label: 'Hoarder (saves 4 weeks, then gives all)',
    hoardWeeks: 4,
  },
];

export const profileById = (id: string): PlayerProfile => {
  const found = PROFILES.find((p) => p.id === id);
  if (!found) throw new Error(`unknown profile ${id}`);
  return found;
};
