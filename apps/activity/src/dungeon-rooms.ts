/**
 * The pre-run screen of the daily dungeon as pure data: the three room panels (room 1, room 2 and
 * the boss) with the day's modifier on each, and the landmark depths for the `ProgressTrack`. The
 * foes of a room are not known until the run (the server rolls them from the run's seed), so a panel
 * before the run shows a "?" and only what is public: the room's place and its modifier.
 */
import { RULES, isLandmark, roomModifier } from '@creatures/game';
import type { TrackStep, TrackUnlock } from './progress-track';
import type { DungeonModifier } from './dungeon-types';
import type { IconRef } from './icon-ref';

/**
 * An icon for a room modifier, from what it does: a boost to one element shows that element, extra
 * crits the reticle, a trick the foe plays its own icon, a change to the foe's stats a warning mark
 * and a fixed turn order its arrow. Anything unknown gets the plain diamond.
 */
export function modifierIcon(id: string): IconRef {
  const effects = roomModifier(id)?.effects ?? [];
  for (const effect of effects) {
    switch (effect.op) {
      case 'team_stat':
        if (effect.element !== undefined) return { kind: 'element', element: effect.element };
        break;
      case 'team_crit':
        return { kind: 'glyph', id: 'reticle' };
      case 'foe_gimmick':
        return { kind: 'glyph', id: effect.gimmick.op };
      case 'turn_order':
        return { kind: 'glyph', id: effect.order };
      case 'foe_stat':
        return { kind: 'glyph', id: 'warning' };
    }
  }
  return { kind: 'glyph', id: 'unknown' };
}

/** One panel of the pre-run strip. */
interface RoomPanel {
  room: number;
  /** "Room 1", "Room 2" and "Boss". */
  title: string;
  modifier: { id: string; name: string; description: string; icon: IconRef } | null;
  /** What a screen reader says for the panel: the room and its modifier, never the foe. */
  spoken: string;
}

/**
 * The panels of the day, one per room in order: the title and the modifier. The last room is the boss.
 * Always `rooms` panels, even when the server sent fewer modifiers (the panel then has none).
 */
export function roomPanels(
  modifiers: readonly DungeonModifier[],
  rooms: number = RULES.dungeon.rooms,
): RoomPanel[] {
  return Array.from({ length: rooms }, (_, room) => {
    const title = room === rooms - 1 ? 'Boss' : `Room ${String(room + 1)}`;
    const m = modifiers.find((x) => x.room === room);
    const modifier =
      m === undefined
        ? null
        : { id: m.id, name: m.name, description: m.description, icon: modifierIcon(m.id) };
    return {
      room,
      title,
      modifier,
      spoken:
        modifier === null ? `${title}.` : `${title}: ${modifier.name}. ${modifier.description}`,
    };
  });
}

/** What a landmark gives. Words, not numbers (the amounts are the server's). */
export const LANDMARK_UNLOCKS: readonly TrackUnlock[] = [
  { icon: 'anvil', text: 'Sure gear drop' },
  { icon: 'gem', text: 'Bonus Essence' },
];

interface DepthTrack {
  steps: TrackStep[];
  /** The index of the player's own step. */
  current: number;
}

/**
 * The landmark depths as a `ProgressTrack`: the previous landmark (when there is one), the depth the
 * player is at, and the next landmark. The player's own step carries the landmark rewards only when
 * the depth is a landmark itself. The ladder has no end, so there is always a next step.
 */
export function depthTrack(depth: number, every: number = RULES.dungeon.landmarkEvery): DepthTrack {
  const d = Math.max(1, Math.floor(depth));
  const steps: TrackStep[] = [];
  const before = Math.floor((d - 1) / every) * every;
  if (before >= every) {
    steps.push({ id: before, label: `Depth ${String(before)}`, unlocks: LANDMARK_UNLOCKS });
  }
  const current = steps.length;
  steps.push({
    id: d,
    label: `Depth ${String(d)}`,
    unlocks: isLandmark(d) ? LANDMARK_UNLOCKS : [],
  });
  const after = (Math.floor(d / every) + 1) * every;
  steps.push({ id: after, label: `Depth ${String(after)}`, unlocks: LANDMARK_UNLOCKS });
  return { steps, current };
}
