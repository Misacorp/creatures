/**
 * The words of the dungeon's depth picker (combat v2; decision 2026-11-04, "A depth choice before a run"). Pure.
 * The picker shows what a depth pays as two multiples of depth 1, from the game package's `dungeonRewardScalars`
 * (the numbers behind it stay hidden and are tuned there), rounded to one decimal and worded as every
 * multiplier in the game is (`multiplierText`: "1.4x", "2x").
 */
import { dungeonRewardScalars, isLandmark } from '@creatures/game';
import { multiplierText } from './xp-boost-view';

/** A multiple to one decimal, as the game words a multiplier: 1.44 is "1.4x", 2 is "2x". */
export function scalarText(value: number): string {
  return multiplierText(Math.round(value * 10) * 1_000);
}

/** "1.4x XP · 2.1x loot": what playing `depth` pays against depth 1. */
export function depthScalarsText(depth: number): string {
  const { xp, loot } = dungeonRewardScalars(depth);
  return `${scalarText(xp)} XP · ${scalarText(loot)} loot`;
}

/** The two chips of a depth: what it pays against depth 1, "1.4x XP" and "2.1x loot". */
export function depthScalarChips(depth: number): { xp: string; loot: string } {
  const { xp, loot } = dungeonRewardScalars(depth);
  return { xp: `${scalarText(xp)} XP`, loot: `${scalarText(loot)} loot` };
}

/**
 * The one short line under the picker: which depth is the player's own, and that a lower one does not advance it.
 * At the player's own depth it says what a clear unlocks.
 */
export function depthPickNote(own: number, picked: number): string {
  return picked >= own
    ? `Your depth. A clear unlocks depth ${String(own + 1)}.`
    : `Your depth is ${String(own)}. A clear down here pays out but does not take you deeper.`;
}

/** Spoken name of the depth the picker shows, for the arrows' labels ("Depth 16"). */
export const depthName = (depth: number): string => `Depth ${String(depth)}`;

/** The spoken name of a depth in the picker: "Depth 16, 1.4x XP, 2.1x loot, your depth, landmark". */
export function depthSpoken(depth: number, own: number): string {
  const chips = depthScalarChips(depth);
  const parts = [depthName(depth), chips.xp, chips.loot];
  if (depth === own) parts.push('your depth');
  if (isLandmark(depth)) parts.push('landmark');
  return parts.join(', ');
}
