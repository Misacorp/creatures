/**
 * One XP gain as the shared row draws it (`ui/XpGain.tsx`, decisions.md 2026-10-19 "Count-up"): what one
 * activity did to one kind of XP, with the bars it went through ("legs", oldest first) so the row can fill
 * the old bar, flash, and fill the new level's bar with the rest. Pure. The server decides every number
 * (the gain, the level and the XP into it now); the level sizes come from the game's own rules, so a gain
 * that crossed a level is drawn without the server sending more.
 */
import { RULES, expToNext } from '@creatures/game';
import type { XpBoost } from './experience';

/** Which XP a gain is; each has its own colour (`--xp-<kind>` in tokens.css). */
export type XpKind = 'experience' | 'explorer' | 'crafting';

/** One level's bar during the gain: `from` and `to` are XP into that level, `max` its size. */
export interface XpLeg {
  level: number;
  max: number;
  from: number;
  to: number;
}

export interface XpChange {
  kind: XpKind;
  /** "Lv" for a level, "Rank" for the explorer rank. */
  unit: 'Lv' | 'Rank';
  from: number;
  to: number;
  gained: number;
  /** The bars the gain went through, oldest first; the last is the level it is at now. */
  legs: XpLeg[];
  /** At the top level now: the last leg is full and there is no next level. */
  top: boolean;
  /** What changed the amount, from the server; null when nothing did. */
  boost: XpBoost | null;
  /** The Gold Ribbon came with it (creature experience only). */
  gold: boolean;
  /** Waits at its level for a ribbon or its evolution (not with the Gold Ribbon). */
  waiting: boolean;
  /** Names the bar for screen readers ("Cindle's experience"). */
  label: string;
}

/** What the bars were, worked backwards from where it is now and what was gained. */
export function legsOf(input: {
  levelBefore: number;
  level: number;
  /** XP into `level` now. */
  value: number;
  /** The size of `level`, or null at the top. */
  max: number | null;
  gained: number;
  sizeOf: (level: number) => number;
}): XpLeg[] {
  let left = Math.max(0, Math.trunc(input.gained));
  const legs: XpLeg[] = [];
  if (input.max === null) {
    legs.push({ level: input.level, max: 1, from: 1, to: 1 });
  } else {
    const max = Math.max(1, input.max);
    const to = Math.min(max, Math.max(0, input.value));
    const from = Math.max(0, to - left);
    left -= to - from;
    legs.push({ level: input.level, max, from, to });
  }
  for (let level = input.level - 1; level >= input.levelBefore && level >= 1; level--) {
    const max = Math.max(1, input.sizeOf(level));
    const from = Math.max(0, max - left);
    left -= max - from;
    legs.unshift({ level, max, from, to: max });
  }
  return legs;
}

/** Percent of a bar, one decimal, floored (so a bar never shows full before it is). */
export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.floor((Math.max(0, Math.min(part, whole)) * 1000) / whole) / 10;
}

/** The leg it is in now. */
export function current(change: XpChange): XpLeg {
  return change.legs[change.legs.length - 1] ?? { level: change.to, max: 1, from: 0, to: 0 };
}

export const leveledUp = (change: XpChange): boolean => change.to > change.from;

/** "174 / 273", or "Top level" / "Top rank" at the top. */
export function numbers(change: XpChange): string {
  if (change.top) return change.unit === 'Rank' ? 'Top rank' : 'Top level';
  const leg = current(change);
  return `${String(leg.to)} / ${String(leg.max)}`;
}

/** The step between two thresholds of a table (`table[level]` is where `level + 1` starts). */
const stepOf =
  (table: readonly number[]) =>
  (level: number): number =>
    (table[level] ?? 0) - (table[level - 1] ?? 0);

/** The size of each level of each kind, from the game's rules. */
export const SIZE_OF: Readonly<Record<XpKind, (level: number) => number>> = {
  experience: (level) => expToNext(Math.max(1, level)),
  crafting: stepOf(RULES.gear.skill.xpForLevel),
  explorer: stepOf(RULES.expeditions.rank.xpForRank),
};

/** A gain of one kind, from the level after it, the XP into that level and what was gained. */
export function xpChange(input: {
  kind: XpKind;
  levelBefore: number;
  level: number;
  value: number;
  /** The size of `level`, or null at the top. */
  max: number | null;
  gained: number;
  label: string;
  boost?: XpBoost | null | undefined;
  gold?: boolean;
  waiting?: boolean;
}): XpChange {
  return {
    kind: input.kind,
    unit: input.kind === 'explorer' ? 'Rank' : 'Lv',
    from: Math.min(input.levelBefore, input.level),
    to: input.level,
    gained: Math.max(0, input.gained),
    legs: legsOf({ ...input, sizeOf: SIZE_OF[input.kind] }),
    top: input.max === null,
    boost: input.boost ?? null,
    gold: input.gold ?? false,
    waiting: input.waiting ?? false,
    label: input.label,
  };
}
