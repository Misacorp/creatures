/** The track tuner's writer of `raid-track.json`: only the three numbers move, the text stays what prettier prints. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { URL, fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { combatV2 } from '@creatures/game/combat-v2';
import {
  trackFileText,
  withTrackNumbers,
  writeTrackNumbers,
  type RawTrack,
} from '../src/trackFile';

const SHIPPED = fileURLToPath(
  new URL('../../game/src/combat-v2/data/raid-track.json', import.meta.url),
);

/** A small track of two slots, as the file holds one. */
const small = (): RawTrack => ({
  order: ['tidal-colossus', 'cinder-wyrm'],
  slots: [
    {
      slot: 1,
      boss: 'tidal-colossus',
      hp: 3_800,
      atk: 83,
      armour: 19,
      strengthBp: 1_833,
      cards: 0,
      buildUp: false,
      extraCards: [],
    },
    {
      slot: 2,
      boss: 'cinder-wyrm',
      hp: 7_500,
      atk: 80,
      armour: 42,
      strengthBp: 3_000,
      cards: 1,
      buildUp: false,
      extraCards: ['slippery', 'breakwater'],
    },
  ],
});

describe('the text of the track file', () => {
  it('is what the shipped file holds, to the byte (prettier’s formatting)', () => {
    expect(trackFileText(combatV2.raidTrack as unknown as RawTrack)).toBe(
      readFileSync(SHIPPED, 'utf8'),
    );
  });

  it('keeps short lists on one line and breaks one that does not fit, one entry a line', () => {
    expect(trackFileText(small())).toContain('"order": ["tidal-colossus", "cinder-wyrm"],');
    expect(trackFileText(small())).toContain('"extraCards": ["slippery", "breakwater"]');
    const long = small();
    long.order = Array.from({ length: 8 }, (_, i) => `a-boss-with-a-long-name-${i}`);
    expect(trackFileText(long)).toContain(
      '  "order": [\n    "a-boss-with-a-long-name-0",\n    "a-boss-with-a-long-name-1",',
    );
    expect(trackFileText(long).endsWith('\n')).toBe(true);
  });
});

describe('writing the tuned numbers', () => {
  it('sets HP, Attack and armour of the slots in range, and nothing else', () => {
    const before = small();
    const r = withTrackNumbers(before, { 1: { hp: 4_000, atk: 90, armour: 20 } }, 1, 2);
    expect(r.written).toEqual([1]);
    expect(r.changed).toEqual([1]);
    expect(r.missing).toEqual([]);
    expect(r.file.slots[0]).toEqual({ ...before.slots[0], hp: 4_000, atk: 90, armour: 20 });
    expect(r.file.slots[1]).toEqual(before.slots[1]);
    expect(r.file.order).toEqual(before.order);
  });

  it('leaves a slot outside the range alone, and a number the entry leaves out', () => {
    const before = small();
    const r = withTrackNumbers(before, { 1: { hp: 1 }, 2: { hp: 9_999, atk: 1, armour: 2 } }, 1, 1);
    expect(r.file.slots[0]).toEqual({ ...before.slots[0], hp: 1 });
    expect(r.file.slots[1]).toEqual(before.slots[1]);
    expect(r.written).toEqual([1]);
  });

  it('reports the slots the file has no entry for, and a write that moved nothing', () => {
    const r = withTrackNumbers(small(), { 3: { hp: 5, atk: 5, armour: 5 } }, 1, 3);
    expect(r.missing).toEqual([3]);
    expect(r.written).toEqual([]);
    const same = withTrackNumbers(small(), { 1: { hp: 3_800, atk: 83, armour: 19 } }, 1, 2);
    expect(same.written).toEqual([1]);
    expect(same.changed).toEqual([]);
    expect(trackFileText(same.file)).toBe(trackFileText(small()));
  });

  it('writes the file at a path, leaving the rest of its text as it was', () => {
    const dir = mkdtempSync(`${tmpdir()}/raid-track-`);
    try {
      const path = `${dir}/raid-track.json`;
      writeFileSync(path, trackFileText(small()));
      const r = writeTrackNumbers(path, { 2: { hp: 8_000, atk: 81, armour: 40 } }, 1, 2);
      expect(r.changed).toEqual([2]);
      const want = small();
      Object.assign(want.slots[1] as object, { hp: 8_000, atk: 81, armour: 40 });
      expect(readFileSync(path, 'utf8')).toBe(trackFileText(want));
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(want);
      // The same table again changes nothing.
      expect(
        writeTrackNumbers(path, { 2: { hp: 8_000, atk: 81, armour: 40 } }, 1, 2).changed,
      ).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
