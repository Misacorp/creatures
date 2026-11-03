/**
 * A creature's mastery of a place's work, as the tray shows it (prototype, SAMPLE data; `systems/posts.md`,
 * V-POST-12): three steps (Skilled, Expert, Master) in each kind of work, grown by hours at that work. The
 * sample world has no work history, so the steps are made up from the creature's id and level, the same every
 * time (no randomness): a higher level has usually done more.
 */
import type { Creature } from '../../api';
import type { PlaceId } from './valley-art';

export type WorkKind = 'smithing' | 'scouting' | 'teaching' | 'keeping';

/** The steps in order; 0 is "not started". */
export const MASTERY_WORDS = ['Novice', 'Skilled', 'Expert', 'Master'] as const;
export const MASTERY_MAX = 3;

/** The kind of work a place's posts are, or null when the place has none (a creature there is only visiting). */
export function workOf(place: 'valley' | PlaceId): WorkKind | null {
  switch (place) {
    case 'forge':
      return 'smithing';
    case 'signpost':
      return 'scouting';
    case 'school':
      return 'teaching';
    case 'bonfire':
      return 'keeping';
    default:
      return null;
  }
}

/** A small stable number from a string (FNV-1a), for sample values. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** SAMPLE: a creature's step (0 to 3) in a kind of work; deterministic, rising with level. */
export function masteryOf(creature: Pick<Creature, 'id' | 'level'>, kind: WorkKind): number {
  const lean = hash(`${creature.id}:${kind}`) % 4;
  const grown = Math.floor(creature.level / 6);
  return Math.min(MASTERY_MAX, Math.max(0, lean + grown - 1));
}

/** The words for the tray's spoken label ("Expert smithing"), or null at step 0. */
export function masteryWords(step: number, kind: WorkKind): string {
  return `${MASTERY_WORDS[Math.min(MASTERY_MAX, Math.max(0, step))] ?? 'Novice'} ${kind}`;
}
