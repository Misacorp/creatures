/**
 * The move library of combat v2 (`moves.json`; docs/design/combat/grammar.md, "Boss moves: behaviour and paint"; decision
 * `2026-11-01-combat-v2-move-library-a-themed`). Every boss and foe move is one entry of the library: a themed **name** and the
 * **behaviour** that never changes, which is its `shape` (which slots it hits), its `anchor` (whom it picks) and whether it
 * `silences`. A boss or foe refers to a library move by id and brings its own numbers (power, rhythm, count, Wind-up ...:
 * `MoveUseSchema` in `boss-schema.ts`), so a name cannot drift from its behaviour. A behaviour has one name per element, shared by
 * every boss and foe of that element; a rule card has no element, so the move a card adds is an element-less entry named by its
 * plain label.
 *
 * `moveLabel` is the plain label of a behaviour, a target word and a shape word ("Nemesis Lance"): what a player learns once and
 * then reads on every boss. The board can show it under the move's own name ("Deepwater Spear · Nemesis Lance").
 */
import * as v from 'valibot';
import { ElementSchema, IdSchema } from '../content/schema';

/** Whom a move picks: the engine's `Pattern['anchor']`. */
export const MOVE_ANCHORS = [
  'front',
  'strongest',
  'payoff',
  'random',
  'grudge',
  'back',
  'weakest',
] as const;

/** Which slots a move hits: the engine's `Pattern['shape']`. */
export const MOVE_SHAPES = [
  'single',
  'line3',
  'row',
  'column',
  'rowEnds',
  'randomRow',
  'all',
  'scatter',
  'chain',
  'columns',
  'rows',
  'cross',
  'checker',
] as const;

/** One move of the library: a name and a behaviour. `element` is absent for a rule card's move. */
export const MoveSchema = v.pipe(
  v.strictObject({
    id: IdSchema,
    name: v.pipe(v.string(), v.minLength(1), v.maxLength(40)),
    element: v.exactOptional(ElementSchema),
    shape: v.picklist(MOVE_SHAPES),
    anchor: v.picklist(MOVE_ANCHORS),
    /** Silences the victims instead of dealing damage (a usage then brings `silenceTurns`). */
    silences: v.boolean(),
    /** A one-shot (Judgement Bolt): a share of the victim's Max HP instead of Attack x power (a usage then brings `oneShotBp`). */
    oneShot: v.exactOptional(v.boolean()),
  }),
  v.readonly(),
);
export type MoveDef = v.InferOutput<typeof MoveSchema>;
export const MoveFileSchema = v.array(MoveSchema);

/** The target word of an anchor (grammar.md). */
const TARGET_WORD: Readonly<Record<MoveDef['anchor'], string>> = {
  front: 'Front',
  back: 'Rear',
  payoff: 'Payoff',
  strongest: 'Nemesis',
  random: 'Wild',
  weakest: 'Vulture',
  grudge: 'Grudge',
};

/**
 * The plain label of a move's behaviour: the target word and the shape word (Front Slam, Nemesis Lance, Wild Sweep, Payoff Strike,
 * Vulture Strike), or the shape word alone for a move that picks no target (Barrage, Quake, Hush, Pincer, Leap, Cross,
 * Checker, One-shot). A column and several columns are one Lance, and so are one row and several rows (one Sweep): how many is a number
 * that belongs to the boss. Two moves with the same label are one behaviour.
 */
export function moveLabel(
  move: Pick<MoveDef, 'shape' | 'anchor' | 'silences' | 'oneShot'>,
): string {
  if (move.oneShot === true) return 'One-shot';
  const target = TARGET_WORD[move.anchor];
  switch (move.shape) {
    case 'single':
      return `${target} Strike`;
    case 'line3':
      return `${target} Slam`;
    case 'column':
    case 'columns':
      return `${target} Lance`;
    case 'row':
    case 'rows':
      return `${target} Sweep`;
    case 'randomRow':
      // Random by its shape, whatever its anchor says.
      return 'Wild Sweep';
    case 'scatter':
      return 'Barrage';
    case 'all':
      return 'Quake';
    case 'rowEnds':
      return move.silences ? 'Hush' : 'Pincer';
    case 'chain':
      return 'Leap';
    case 'cross':
      return 'Cross';
    case 'checker':
      return 'Checker';
  }
}
