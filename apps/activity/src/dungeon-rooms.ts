/**
 * The pre-run screen of the daily dungeon as pure data: the three room panels (room 1, room 2 and
 * the boss) with the day's modifier on each, and the landmark depths for the `ProgressTrack`. The
 * foes of a room are not known until the run (the server rolls them from the run's seed), so a panel
 * before the run shows a "?" and only what is public: the room's place and its modifier.
 */
import {
  RULES,
  isLandmark,
  roomModifier,
  undercroftBaseFloors,
  undercroftOpen,
  type Role,
} from '@creatures/game';
import type { TrackStep, TrackUnlock } from './progress-track';
import type { DungeonModifier } from './dungeon-types';
import type { IconRef } from './icon-ref';

/** The picture of a role on a modifier that boosts it: the glyph the role's job looks like. */
const ROLE_GLYPH: Readonly<Record<Role, string>> = {
  setter: 'mark',
  payoff: 'sparkle',
  guard: 'shield',
  support: 'ability',
};

/**
 * An icon for a room modifier, from what it does: a boost to one element shows that element, a boost
 * to one role that role's glyph, extra crits the reticle, a trick the foe plays its own icon and a
 * change to the foe's stats a warning mark. Anything unknown (an old run's removed modifier) gets
 * the plain diamond.
 */
export function modifierIcon(id: string): IconRef {
  const effects = roomModifier(id)?.effects ?? [];
  for (const effect of effects) {
    switch (effect.op) {
      case 'team_stat':
        if (effect.element !== undefined) return { kind: 'element', element: effect.element };
        if (effect.role !== undefined) return { kind: 'glyph', id: ROLE_GLYPH[effect.role] };
        break;
      case 'team_crit':
        return { kind: 'glyph', id: 'reticle' };
      case 'foe_gimmick':
        return { kind: 'glyph', id: effect.gimmick.op };
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
  { icon: 'anvil', text: 'Gear drop' },
  { icon: 'gem', text: 'Bonus Essence' },
];

/** The floors a run's first Undercroft has before its keeper at `depth` (0 while the Undercroft is shut), from the rules. */
export function undercroftFloorsAt(depth: number): number {
  return undercroftOpen(depth) ? undercroftBaseFloors(depth, 1) : 0;
}

/**
 * What the Undercroft gives from reaching `depth` on: "Undercroft opens" at the depth that opens it
 * (`RULES.dungeon.undercroft.fromDepth`), then "Undercroft +1 floor" at each depth that adds floors (one per
 * landmark passed, up to `maxFloors`). None at any other depth. Derived from the rules, never listed.
 */
export function undercroftUnlocks(depth: number): TrackUnlock[] {
  const d = Math.max(1, Math.floor(depth));
  if (!undercroftOpen(d)) return [];
  if (!undercroftOpen(d - 1)) return [{ icon: 'map-descend', text: 'Undercroft opens' }];
  const more = undercroftFloorsAt(d) - undercroftFloorsAt(d - 1);
  return more > 0
    ? [
        {
          icon: 'map-descend',
          text: `Undercroft +${String(more)} ${more === 1 ? 'floor' : 'floors'}`,
        },
      ]
    : [];
}

/**
 * Everything a step of the track unlocks: the landmark's rewards at a landmark depth, and what the
 * Undercroft gives (reaching the depth, and, at a landmark, beating its boss: the depth after it). Empty
 * only when nothing changes at that depth.
 */
export function stepUnlocks(depth: number): TrackUnlock[] {
  const d = Math.max(1, Math.floor(depth));
  const landmark = isLandmark(d);
  const unlocks = [
    ...(landmark ? LANDMARK_UNLOCKS : []),
    ...undercroftUnlocks(d),
    ...(landmark ? undercroftUnlocks(d + 1) : []),
  ];
  const seen = new Set<string>();
  return unlocks.filter((u) => !seen.has(u.text) && seen.add(u.text));
}

interface DepthTrack {
  /** The depth the player is at, then the next landmark. */
  steps: TrackStep[];
  /** The index of the player's own step (always 0: the track starts at the depth now). */
  current: number;
  /** The depths between the two, drawn as small pips (3, 4, 5 and 6 between 2 and 7). */
  between: number;
}

/**
 * The way from the depth the player is at to the next landmark, as a `ProgressTrack`: two labelled
 * steps and, between them, the number of depths to draw as small pips. A step carries what its depth
 * unlocks (`stepUnlocks`): the landmark rewards at a landmark, and the Undercroft opening or growing. The ladder has no end, so there is
 * always a next landmark.
 */
export function depthTrack(depth: number, every: number = RULES.dungeon.landmarkEvery): DepthTrack {
  const d = Math.max(1, Math.floor(depth));
  const after = (Math.floor(d / every) + 1) * every;
  const steps: TrackStep[] = [
    { id: d, label: `Depth ${String(d)}`, unlocks: stepUnlocks(d) },
    { id: after, label: `Depth ${String(after)}`, unlocks: stepUnlocks(after) },
  ];
  return { steps, current: 0, between: after - d - 1 };
}
