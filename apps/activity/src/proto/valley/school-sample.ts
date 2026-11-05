/**
 * SAMPLE data of the School scene (prototype, dev only): which of the player's creatures are on a Bronze
 * trial and which boxes they have ticked. It is made up from the roster's order; the real rules (what ticks a
 * box) are in `school-logic.ts` and `systems/trials.md`. The ribbon's picture is new, a tiny bronze rosette.
 */
import type { Creature } from '../../api';
import type { SpriteDef } from '../../sprites/sprite-data';
import { BRONZE_BOXES, canTry, type BoxId, type Trial } from './school-logic';

/** Most pupils standing in the School's yard (a phone fits four). */
export const MAX_PUPILS = 4;

/** SAMPLE: the boxes each pupil has ticked, by order (two have every box, one has three, one has one). */
const TICKS: readonly (readonly BoxId[])[] = [
  ['dungeon', 'post', 'find', 'fire'],
  ['dungeon', 'post', 'find', 'fire'],
  ['dungeon', 'post', 'find'],
  ['post'],
];

/** The pupils: the highest-level creatures that may try Bronze (a level 10 creature or more), with their trials. */
export function pupilsOf(creatures: readonly Creature[]): { creature: Creature; trial: Trial }[] {
  const eligible = creatures
    .filter((c) => canTry(c.level))
    .sort((a, b) => b.level - a.level)
    .slice(0, MAX_PUPILS);
  return eligible.map((creature, i) => ({
    creature,
    trial: {
      creatureId: creature.id,
      ticked: BRONZE_BOXES.map((b) => b.id).filter((id) => (TICKS[i] ?? []).includes(id)),
    },
  }));
}

const INK = '#0d0a1a';

/** A ring mark beside the bell (3 x 5 pixels), mirrored for the other side. */
export const BELL_RING: SpriteDef = {
  rows: ['g..', '.g.', '.g.', '.g.', 'g..'],
  palette: { g: '#ffd25a' },
};

/** The bronze ribbon a graduate wears: a rosette with two tails (7 x 8 pixels). */
export const BRONZE_RIBBON: SpriteDef = {
  rows: ['..kkk..', '.kbbbk.', 'kbbcbbk', '.kbbbk.', '..kbk..', '.kbkbk.', '.kb.bk.', '.kk.kk.'],
  palette: { k: INK, b: '#d08a4a', c: '#f6c08a' },
};
