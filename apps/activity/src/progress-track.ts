/**
 * Pure helpers of `ProgressTrack`: a rank or depth timeline that shows only the previous, the
 * current and the next step, so nothing past the next step is ever given away. Generic: the caller
 * supplies the steps (explorer ranks, dungeon landmark depths) and the glyph ids of their unlocks.
 */

/** One thing a step unlocks: a glyph id (see `glyphs.ts`) and a few words. */
export interface TrackUnlock {
  icon: string;
  text: string;
}

export interface TrackStep {
  /** Stable key, for example the rank number. */
  id: string | number;
  /** "Rank 3", "Depth 10". */
  label: string;
  unlocks: readonly TrackUnlock[];
}

type TrackRole = 'previous' | 'current' | 'next' | 'max';

/** A node of the track as it is drawn. */
interface TrackNode {
  key: string;
  role: TrackRole;
  label: string;
  unlocks: readonly TrackUnlock[];
}

/** What the "max" node says: there is nothing past the last step. */
export const MAX_LABEL = 'Max';

/** The word a screen reader hears before each node. */
export const ROLE_WORDS: Readonly<Record<TrackRole, string>> = {
  previous: 'Previous',
  current: 'Current',
  next: 'Next',
  max: 'Top',
};

/**
 * The nodes to draw: the previous step (none at the first step), the current one and the next one.
 * At the last step there is no next, and a "Max" node closes the track instead. The current index
 * is clamped into the steps; no steps give an empty track.
 */
export function trackNodes(steps: readonly TrackStep[], currentIndex: number): TrackNode[] {
  if (steps.length === 0) return [];
  const index = Math.min(steps.length - 1, Math.max(0, Math.trunc(currentIndex)));
  const nodes: TrackNode[] = [];
  const node = (step: TrackStep, role: TrackRole): TrackNode => ({
    key: `${role}:${String(step.id)}`,
    role,
    label: step.label,
    unlocks: step.unlocks,
  });
  const previous = steps[index - 1];
  if (previous !== undefined) nodes.push(node(previous, 'previous'));
  const current = steps[index];
  if (current !== undefined) nodes.push(node(current, 'current'));
  const next = steps[index + 1];
  if (next !== undefined) nodes.push(node(next, 'next'));
  else nodes.push({ key: 'max', role: 'max', label: MAX_LABEL, unlocks: [] });
  return nodes;
}
