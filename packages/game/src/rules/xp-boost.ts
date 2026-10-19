/**
 * What changed one XP gain, as the result screens explain it (decisions.md, 2026-10-19: one look for every
 * XP gain, the multiplier and its breakdown behind a tap): the treat's multiplier, the day's Boons and
 * Omens, gear lines, and a trip's own bonuses (milestones, the week's twist, a push-on goal). Pure.
 *
 * ONE RULE (decisions.md, 2026-10-19, "every XP multiplier multiplies"): a gain's total multiplier is the
 * product of all its parts. The treat's multiplier first (times 10000), then each share in order as
 * `total = floor(total * (10000 + bp) / 10000)`, never below 0. The gain is `floor(base * total / 10000)`
 * (`applyXpBoost`). The worker and the simulator build the parts array once per gain and pass the SAME
 * array to the amount (`applyXpBoost`, directly or through `tripExperience`, `tripXp` and the like) and to
 * the breakdown (`xpBoost`), so the amount a player got is always the base times the Total they see,
 * rounded down. Nothing else may add shares together or multiply a gain by hand.
 */
import { gearLine } from '../content/gear';
import { weatherDef } from '../content/weather';
import { RULES } from './config';
import { activeEffects, scaleStrength, xpWeather, type WeatherDay } from './weather';

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
 * The total multiplier of the parts, in basis points (10000 is x1): the product of the treats' multipliers
 * (times 10000), then each share in order, `floor(total * max(0, 10000 + bp) / 10000)`. A share of -100%
 * or less makes it 0; it is never negative, and always a whole number (so the breakdown's Total and the gain
 * agree to the last digit). Put the treat first, as `creatureXpParts` does: the order only matters for the
 * rounding.
 */
export function xpBoostTotalBp(parts: readonly XpBoostPart[]): number {
  let times = 1;
  for (const part of parts) if (part.source === 'treat') times *= part.times;
  // `round`, not `floor`: a treat's multiplier is a whole number, but never lose a digit to float noise.
  let total = Math.round(times * BP);
  for (const part of parts) {
    if (part.source === 'treat') continue;
    total = Math.floor((total * Math.max(0, BP + part.bp)) / BP);
  }
  return Math.max(0, total);
}

/**
 * `base` after every part: `floor(base * total / 10000)` with the total of `xpBoostTotalBp`. `base` is a whole
 * number, 0 or more. Safe integers: a base is at most a few thousand and a total at most a few hundred
 * thousand (a treat of at most 4 and a handful of shares, each at most a few hundred percent: the content
 * schemas cap them), so the product stays far below 2^53.
 */
export function applyXpBoost(base: number, parts: readonly XpBoostPart[]): number {
  if (!Number.isInteger(base) || base < 0) {
    throw new RangeError(`base must be a whole number >= 0, got ${String(base)}`);
  }
  return Math.floor((base * xpBoostTotalBp(parts)) / BP);
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

/**
 * The day's effects as parts, named from the content. An id that has left the content keeps its change (what
 * a player is paid never depends on the content still existing) under the name "Weather".
 */
export function dayParts(effects: readonly DayXpEffect[]): XpBoostPart[] {
  return effects.flatMap((e) =>
    e.bp === 0
      ? []
      : [{ source: 'day' as const, name: weatherDef(e.id)?.name ?? 'Weather', bp: e.bp }],
  );
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

/**
 * The parts of a creature-experience gain: the treat's multiplier when it was packed (`treatTimes`: what the
 * day changed it to, Hearty Breakfast's triple; null: the usual doubling), then the day's parts. The one
 * place every activity (trip, dungeon, raid, job, and the simulator) builds them.
 */
export function creatureXpParts(
  treat: boolean,
  treatTimes: number | null,
  days: readonly XpBoostPart[],
): XpBoostPart[] {
  return treat ? [treatPart(treatTimes ?? RULES.experience.treat.multiplier), ...days] : [...days];
}

/** `creatureXpParts` for a day known as a whole (a dungeon run, a raid stage, the simulator). */
export function dayCreatureXpParts(treat: boolean, day: WeatherDay | null): XpBoostPart[] {
  return creatureXpParts(treat, xpWeather(day).treatMultiplier, dayParts(dayXpEffects(day)));
}
