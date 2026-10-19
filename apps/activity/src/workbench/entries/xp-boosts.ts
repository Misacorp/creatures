/**
 * Multipliers the game can really send with an XP gain, for the workbench presets (the numbers of the
 * shipped content: a treat doubles, Hearty Breakfast adds 25% and makes a treat triple, Cold Snap takes 20%,
 * Apprentice tier III adds 20%, Trail XP tier III 12%, the compass's own line 5%).
 */
import { xpBoostTotalBp } from '@creatures/game';
import type { XpBoost, XpBoostPart } from '../../experience';

const boost = (parts: XpBoostPart[]): XpBoost => ({ parts, totalBp: xpBoostTotalBp(parts) });

const TREAT2: XpBoostPart = { source: 'treat', name: 'Treat', times: 2 };
const TREAT3: XpBoostPart = { source: 'treat', name: 'Treat', times: 3 };
const HEARTY: XpBoostPart = { source: 'day', name: 'Hearty Breakfast', bp: 2500 };
const COLD: XpBoostPart = { source: 'day', name: 'Cold Snap', bp: -2000 };

/** Creature experience: what a trip, a job or a dungeon run can send. */
export const EXPERIENCE_BOOSTS = {
  none: null,
  'treat ×2': boost([TREAT2]),
  'Hearty Breakfast, no treat': boost([HEARTY]),
  'Cold Snap, no treat': boost([COLD]),
  'treat on Hearty Breakfast (×3)': boost([TREAT3, HEARTY]),
  'treat, Hearty Breakfast and Cold Snap': boost([TREAT3, HEARTY, COLD]),
} as const satisfies Record<string, XpBoost | null>;

export type ExperienceBoostName = keyof typeof EXPERIENCE_BOOSTS;
export const EXPERIENCE_BOOST_NAMES = Object.keys(EXPERIENCE_BOOSTS) as ExperienceBoostName[];

export function experienceBoostOf(name: string): XpBoost | null {
  return (EXPERIENCE_BOOSTS as Record<string, XpBoost | null>)[name] ?? null;
}

/** Crafting XP with Apprentice tier III. */
export const APPRENTICE = boost([{ source: 'gear', name: 'Apprentice', bp: 2000 }]);

/** Explorer XP with Milestones, the week's Eager students twist and Trail XP. */
export const EXPLORER_SEVERAL = boost([
  { source: 'trip', name: 'Milestones', bp: 500 },
  { source: 'trip', name: 'Eager students', bp: 5000 },
  { source: 'gear', name: 'Trail XP', bp: 1700 },
]);
