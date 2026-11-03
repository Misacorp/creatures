/**
 * `raid-track.json` (`packages/game/src/combat-v2/data/`) as the track tuner writes it: the tuned HP, Attack and armour go into
 * the slots of the file, and the file is written the way prettier formats it, so `pnpm format:check` holds and a retune shows in
 * the diff as the numbers that moved and nothing else. The shape is the game's (`RaidTrackDef`, `track-schema.ts`); the game's
 * loader checks the file again at import, so a bad write fails the next run loudly.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { SlotTable } from './track';

/** One slot of the file, as far as the writer touches it. */
interface RawSlot {
  slot: number;
  hp: number;
  atk: number;
  armour: number;
  [key: string]: unknown;
}

/** The file, as far as the writer touches it. */
export interface RawTrack {
  order: string[];
  slots: RawSlot[];
}

/** Prettier's `printWidth` for this repo (`.prettierrc`). */
const WIDTH = 100;

/**
 * JSON as prettier prints it: objects expanded one key per line (the file's objects are written that way, and prettier keeps them),
 * an array of plain values on one line when the line fits in `WIDTH` and one value per line when it does not. `lead` is how many
 * characters the line already holds before the value (the indent and the key), `tail` how many follow it (a comma).
 */
function printJson(value: unknown, indent: number, lead: number, tail: number): string {
  const pad = ' '.repeat(indent + 2);
  const close = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const flat = value.every((x) => typeof x !== 'object' || x === null);
    if (flat) {
      const line = `[${value.map((x) => JSON.stringify(x)).join(', ')}]`;
      if (lead + line.length + tail <= WIDTH) return line;
    }
    const items = value.map(
      (x, i) => `${pad}${printJson(x, indent + 2, indent + 2, i === value.length - 1 ? 0 : 1)}`,
    );
    return `[\n${items.join(',\n')}\n${close}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const items = entries.map(([k, x], i) => {
      const key = `${JSON.stringify(k)}: `;
      const last = i === entries.length - 1;
      return `${pad}${key}${printJson(x, indent + 2, indent + 2 + key.length, last ? 0 : 1)}`;
    });
    return `{\n${items.join(',\n')}\n${close}}`;
  }
  return JSON.stringify(value);
}

/** The text of a track file: prettier's formatting of the JSON, with the closing newline. */
export const trackFileText = (file: RawTrack): string => `${printJson(file, 0, 0, 0)}\n`;

/** What a write changed. */
export interface TrackWrite {
  /** The file with the numbers set. */
  readonly file: RawTrack;
  /** The slots whose numbers were written (also the ones whose numbers did not move). */
  readonly written: number[];
  /** The slots of the range the file has no entry for: a slot is added to the file by hand (its boss, strength and rules are not numbers a tuner sets). */
  readonly missing: number[];
  /** The slots whose numbers differ from the file's. */
  readonly changed: number[];
}

/**
 * The file with the table's HP, Attack and armour set on slots `first` to `last`. Only those three numbers are touched; a slot the
 * table has no entry for, or an entry that leaves a number out, keeps what the file has.
 */
export function withTrackNumbers(
  file: RawTrack,
  table: SlotTable,
  first: number,
  last: number,
): TrackWrite {
  const written: number[] = [];
  const missing: number[] = [];
  const changed: number[] = [];
  const slots = file.slots.map((s) => {
    if (s.slot < first || s.slot > last) return s;
    const n = table[s.slot];
    if (!n) return s;
    written.push(s.slot);
    const next = {
      ...s,
      hp: n.hp ?? s.hp,
      atk: n.atk ?? s.atk,
      armour: n.armour ?? s.armour,
    };
    if (next.hp !== s.hp || next.atk !== s.atk || next.armour !== s.armour) changed.push(s.slot);
    return next;
  });
  const have = new Set(file.slots.map((s) => s.slot));
  for (let s = first; s <= last; s++) if (table[s] && !have.has(s)) missing.push(s);
  return { file: { ...file, slots }, written, missing, changed };
}

/** Reads the file at `path`, sets the table's numbers on slots `first` to `last` and writes it back. */
export function writeTrackNumbers(
  path: string,
  table: SlotTable,
  first: number,
  last: number,
): TrackWrite {
  const file = JSON.parse(readFileSync(path, 'utf8')) as RawTrack;
  const result = withTrackNumbers(file, table, first, last);
  writeFileSync(path, trackFileText(result.file));
  return result;
}
