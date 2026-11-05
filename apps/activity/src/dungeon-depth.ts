/**
 * The words of the dungeon's depth picker (combat v2; decision 2026-11-04, "A depth choice before a run"). Pure.
 * The picker shows what a depth pays as two multiples of depth 1, from the game package's `dungeonRewardScalars`
 * (the numbers behind it stay hidden and are tuned there), worded as every multiplier in the game is
 * (`multiplierText`: "1.4x", "2x"): loot to one decimal, XP to two while it is under 2x (see `xpScalarText`).
 */
import { dungeonRewardScalars, isLandmark } from '@creatures/game';
import { multiplierText } from './xp-boost-view';

/** A multiple to one decimal, as the game words a multiplier: 1.44 is "1.4x", 2 is "2x". */
export function scalarText(value: number): string {
  return multiplierText(Math.round(value * 10) * 1_000);
}

/**
 * An XP multiple: two decimals while it is under 2x ("1.05x", "1.14x"), so the small landmark steps show; one
 * decimal from 2x up, as loot is.
 */
export function xpScalarText(value: number): string {
  return value < 2 ? multiplierText(Math.round(value * 100) * 100) : scalarText(value);
}

/** "1.4x XP · 2.1x loot": what playing `depth` pays against depth 1. */
export function depthScalarsText(depth: number): string {
  const { xp, loot } = dungeonRewardScalars(depth);
  return `${xpScalarText(xp)} XP · ${scalarText(loot)} loot`;
}

/** The two numbers of a depth (drawn as plain text, no box): what it pays against depth 1, "1.14x XP" and "2.1x loot". */
export function depthScalarChips(depth: number): { xp: string; loot: string } {
  const { xp, loot } = dungeonRewardScalars(depth);
  return { xp: `${xpScalarText(xp)} XP`, loot: `${scalarText(loot)} loot` };
}

/**
 * The one short line under the picker. At the player's own depth: what a clear unlocks. Below it: that only the
 * own depth goes deeper, with what the own depth pays in loot.
 */
export function depthPickNote(own: number, picked: number): string {
  return picked >= own
    ? `A clear unlocks depth ${String(own + 1)}.`
    : `Only depth ${String(own)} goes deeper (${scalarText(dungeonRewardScalars(own).loot)} loot).`;
}

/** Spoken name of the depth the picker shows, for the arrows' labels ("Depth 16"). */
export const depthName = (depth: number): string => `Depth ${String(depth)}`;

/**
 * The spoken name of a depth in the picker: "Depth 16, 1.14x XP, 2.1x loot, your depth, landmark". The landmark
 * is named only at the player's own depth, the one place its extras pay.
 */
export function depthSpoken(depth: number, own: number): string {
  const chips = depthScalarChips(depth);
  const parts = [depthName(depth), chips.xp, chips.loot];
  if (depth === own) parts.push('your depth');
  if (depth === own && isLandmark(depth)) parts.push('landmark');
  return parts.join(', ');
}
