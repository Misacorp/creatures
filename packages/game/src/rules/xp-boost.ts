/**
 * What changed one XP gain, as the result screens explain it (decisions.md, 2026-10-19: one look for every
 * XP gain, the multiplier and its breakdown behind a tap): the treat's multiplier, the day's Boons and
 * Omens, gear lines, and a trip's own bonuses (milestones, the week's twist, a push-on goal). Pure. The
 * worker builds one of these next to every gain it pays, from the same numbers it paid with, so the
 * breakdown never disagrees with the gain.
 */
import { gearLine } from '../content/gear';
import { weatherDef } from '../content/weather';
import { activeEffects, scaleStrength, type WeatherDay } from './weather';

const BP = 10_000;

/** One thing that changed a gain: a multiplier (a treat) or a share on top (basis points; negative: less). */
export type XpBoostPart =
  | { source: 'treat'; name: string; times: number }
  | { source: 'day' | 'gear' | 'trip'; name: string; bp: number };

/** What changed a gain: the parts, in the order they were applied, and the total multiplier (10000 is x1). */
export interface XpBoost {
  parts: XpBoostPart[];
  totalBp: number;
}

/**
 * The total multiplier of the parts, in basis points: the treat's multiplier times one plus the shares
 * (the order every gain is worked out in: the treat first, then the shares added together). Never negative.
 */
export function xpBoostTotalBp(parts: readonly XpBoostPart[]): number {
  let times = 1;
  let share = 0;
  for (const part of parts) {
    if (part.source === 'treat') times *= part.times;
    else share += part.bp;
  }
  return times * Math.max(0, BP + share);
}

/** The parts that changed something (a share of 0 and a multiplier of 1 are left out), or null when none did. */
export function xpBoost(parts: readonly XpBoostPart[]): XpBoost | null {
  const kept = parts.filter((p) => (p.source === 'treat' ? p.times !== 1 : p.bp !== 0));
  if (kept.length === 0) return null;
  return { parts: kept, totalBp: xpBoostTotalBp(kept) };
}

/** The treat as a part: "Treat", times what it multiplied by. */
export function treatPart(times: number): XpBoostPart {
  return { source: 'treat', name: 'Treat', times };
}

/** A Boon's or Omen's change to creature experience, by its content id, as applied (scaled by the day). */
export interface DayXpEffect {
  id: string;
  bp: number;
}

/**
 * The Boons and Omens of the day that change creature experience, with the change as applied (scaled by
 * the day's strength). One that changes only the treat's multiplier is not listed (the treat part says it).
 */
export function dayXpEffects(day: WeatherDay | null): DayXpEffect[] {
  return activeEffects(day).flatMap((a) => {
    if (a.effect.op !== 'xp') return [];
    const bp = scaleStrength(a.effect.bp, a.strengthBp);
    return bp === 0 ? [] : [{ id: a.id, bp }];
  });
}

/** The day's effects as parts, named from the content (an id that left the content is left out). */
export function dayParts(effects: readonly DayXpEffect[]): XpBoostPart[] {
  return effects.flatMap((e) => {
    const name = weatherDef(e.id)?.name;
    return name === undefined || e.bp === 0 ? [] : [{ source: 'day' as const, name, bp: e.bp }];
  });
}

/**
 * The day's parts of a trip or job stored before each effect was stored apart: only the Boon's and Omen's ids
 * and the total. The total goes to the one of them that changes experience; when both do, to the two names
 * together ("Hearty Breakfast and Cold Snap"). Nothing when the total is 0.
 */
export function legacyDayParts(stored: {
  boon: string;
  omen: string | null;
  xpBp: number;
}): XpBoostPart[] {
  if (stored.xpBp === 0) return [];
  const names = [stored.boon, stored.omen].flatMap((id) => {
    const def = id === null ? undefined : weatherDef(id);
    return def !== undefined && def.effects.some((e) => e.op === 'xp' && e.bp !== 0)
      ? [def.name]
      : [];
  });
  return [
    { source: 'day', name: names.length === 0 ? 'Weather' : names.join(' and '), bp: stored.xpBp },
  ];
}

/** A gear rule's share as a part, named by the gear line that gives it ("Trail XP", "Apprentice"). */
export function gearPart(lineId: 'trail-xp' | 'apprentice', bp: number): XpBoostPart {
  return { source: 'gear', name: gearLine(lineId)?.name ?? 'Gear', bp };
}
