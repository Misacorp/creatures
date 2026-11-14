/**
 * What a tap on a boss move tile explains (combat v2): the move's name and plain label, one sentence for what it does, how often it
 * comes, and the keywords on it as tags that open the game's own keyword help (`glossary-v2.json`: Wind-up, Barrage, Leap, Cross,
 * Checker, Row end, Area hit, Silenced). Only two words have no entry there and are explained here in a line each: "Every N" (read from
 * the move's rhythm and turn) and "One-shot". Pure; `BossCardV2` draws it in a popover.
 */
import { GLOSSARY_IDS, glossaryEntry } from '@creatures/game';
import type { BossMoveV2 } from './raid-v2-api';

/** What each shape of move hits, in a sentence (the move's behaviour, whichever boss brings it). */
const SHAPE_WHAT: Readonly<Record<string, string>> = {
  single: 'Hits one creature.',
  line3: 'Hits a creature and the two beside it.',
  row: 'Hits every creature in one row.',
  rows: 'Hits every creature in several rows.',
  randomRow: 'Hits every creature in a row picked at random.',
  column: 'Hits every creature in one lane, front to back.',
  columns: 'Hits every creature in several lanes, front to back.',
  rowEnds: 'Hits the creatures at the ends of a row.',
  all: 'Hits every creature on the board.',
  scatter: 'Hits several different creatures, picked at random.',
  chain: 'Hits one creature, then jumps on to the next.',
  cross: 'Hits a creature and the ones above, below and beside it.',
  checker: 'Hits every other slot of the board, like a checkerboard.',
};

/** The shapes that hit more than one slot in one go (they carry the Area hit keyword: dodged half as often). */
const AREA_SHAPES: ReadonlySet<string> = new Set([
  'line3',
  'row',
  'rows',
  'randomRow',
  'column',
  'columns',
  'rowEnds',
  'all',
  'cross',
  'checker',
]);

/** The keyword a shape is named by, where the keyword help has one. */
const SHAPE_KEYWORD: Readonly<Record<string, string>> = {
  scatter: 'Barrage',
  chain: 'Leap',
  cross: 'Cross',
  checker: 'Checker',
  rowEnds: 'Row end',
};

/** What one tile's popover shows. */
export interface MoveHelp {
  name: string;
  label: string;
  /** One sentence for what the move does. */
  what: string;
  /** How often it comes and when in the round ("Every 4: it comes every 4 rounds, after row 2."). */
  rhythm: string;
  /** Keyword help ids (`GLOSSARY_IDS.keyword`) of the words on the move, each with its name for the tag. */
  keywords: { name: string; entry: string }[];
  /** Words with no keyword entry of their own, in a line each. */
  notes: string[];
}

/** The popover of a move: its words, what it does, when it comes and the keywords on it. */
export function moveHelp(move: BossMoveV2): MoveHelp {
  const names: string[] = [];
  if (move.windUp) names.push('Wind-up');
  if (move.silences) names.push('Silenced');
  const byShape = SHAPE_KEYWORD[move.shape];
  if (byShape !== undefined) names.push(byShape);
  if (AREA_SHAPES.has(move.shape) && !move.oneShot) names.push('Area hit');
  const notes: string[] = [];
  if (move.oneShot) {
    notes.push("One-shot: takes a share of its victim's Max HP instead of the usual damage.");
  }
  if (move.fizzles) notes.push('Hits nobody: reactions fail until its next turn.');
  const every = move.every === 1 ? 'Every round' : `Every ${String(move.every)}`;
  const comes =
    move.every === 1 ? 'it comes every round' : `it comes every ${String(move.every)} rounds`;
  return {
    name: move.name,
    label: move.label,
    what: move.fizzles
      ? 'It hits nobody.'
      : move.silences
        ? `${SHAPE_WHAT[move.shape] ?? 'Hits creatures.'} They cannot use their Knack, talents or role.`
        : (SHAPE_WHAT[move.shape] ?? 'Hits creatures.'),
    rhythm: `${every}: ${comes}, after row ${String(move.turn + 1)}.`,
    keywords: [...new Set(names)]
      .map((name) => ({ name, entry: GLOSSARY_IDS.keyword(name) }))
      .filter((k) => glossaryEntry(k.entry) !== undefined),
    notes,
  };
}
