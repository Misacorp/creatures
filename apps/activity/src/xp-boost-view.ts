/**
 * The multiplier of an XP gain as the shared row shows it (decisions.md, 2026-10-19): a melon slice when a
 * treat was packed (never with a number on it), a "×2" chip next to the "+N" when the total is not x1, and
 * the breakdown both open. Pure. The server sends the parts and the total with every gain (`XpBoost`);
 * this only words them. A result from before it did is read from what it had then.
 */
import { RULES, xpBoostTotalBp } from '@creatures/game';
import type { ExperienceView, XpBoost, XpBoostPart } from './experience';

const BP = 10_000;

/** "2", "1.5", "3.75", "0.8": a multiplier in basis points, at most two decimals, no trailing zeros. */
function factor(bp: number): string {
  const hundredths = Math.round(Math.max(0, bp) / 100);
  const whole = Math.floor(hundredths / 100);
  const rest = hundredths % 100;
  if (rest === 0) return String(whole);
  return `${String(whole)}.${String(rest).padStart(2, '0').replace(/0$/, '')}`;
}

/** "×2", "×1.5": the total multiplier as the chip says it. */
export function timesText(totalBp: number): string {
  return `×${factor(totalBp)}`;
}

/** "×2" for a treat, "+25%" or "-20%" for a share. */
export function partValue(part: XpBoostPart): string {
  if (part.source === 'treat') return `×${String(part.times)}`;
  const pctText = String(Math.abs(part.bp) / 100);
  return `${part.bp < 0 ? '-' : '+'}${pctText}%`;
}

/** A treat was packed for it: the row shows the melon. */
export const hasTreat = (boost: XpBoost | null): boolean =>
  boost?.parts.some((p) => p.source === 'treat') === true;

/** The total is not x1: the row shows the chip. */
export const showsTimes = (boost: XpBoost | null): boolean =>
  boost !== null && boost.totalBp !== BP;

/** What the breakdown lists: each part with its value, then the total. */
export function boostLines(boost: XpBoost): {
  parts: { name: string; value: string }[];
  total: string;
} {
  return {
    parts: boost.parts.map((p) => ({ name: p.name, value: partValue(p) })),
    total: timesText(boost.totalBp),
  };
}

/** What a screen reader hears for the button: "Experience ×2: Treat ×2. What changed it?" */
export function boostLabel(boost: XpBoost, what: string): string {
  const parts = boost.parts.map((p) => `${p.name} ${partValue(p)}`).join(', ');
  return `${what} ${timesText(boost.totalBp)}: ${parts}. What changed it?`;
}

/**
 * What changed a creature's experience: the server's `boost`, or for a result from before it, what the
 * result had then (a dungeon run's `treatTimes` and `dayEffects`; a trip's or job's treat flag, at the usual
 * doubling). Null when nothing did.
 */
export function experienceBoost(view: ExperienceView): XpBoost | null {
  if (view.boost !== undefined) return view.boost;
  const parts: XpBoostPart[] = [];
  if (view.treat) {
    parts.push({
      source: 'treat',
      name: 'Treat',
      times: view.treatTimes ?? RULES.experience.treat.multiplier,
    });
  }
  for (const d of view.dayEffects ?? []) {
    if (d.bp !== 0) parts.push({ source: 'day', name: d.name, bp: d.bp });
  }
  if (parts.length === 0) return null;
  return { parts, totalBp: xpBoostTotalBp(parts) };
}
