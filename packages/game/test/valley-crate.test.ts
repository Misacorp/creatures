import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { PaperLogSchema, VALLEY_RULES, composePaper, emptyLog, mergeLogs } from '../src';

describe('the sealed crate in the paper (V-FORGE-5)', () => {
  it('has no story when nothing waits, and a rare or epic tease when something does (an epic outranks a rare)', () => {
    expect(composePaper(emptyLog()).headlines).toEqual([]);
    const rare = composePaper({ ...emptyLog(), crate: 'rare' }).headlines;
    const epic = composePaper({ ...emptyLog(), crate: 'epic' }).headlines;
    expect(rare.map((h) => [h.kind, h.rarity])).toEqual([['crate-waits', 'rare']]);
    expect(epic.map((h) => [h.kind, h.rarity])).toEqual([['crate-waits', 'epic']]);
    expect(epic[0]?.weight).toBeGreaterThan(rare[0]?.weight ?? 0);
    // It names no piece before the crate is opened.
    expect(rare[0]?.items).toEqual([]);
  });

  it('keeps the better rarity when two logs merge, and reads an old log without the field as empty', () => {
    const merged = mergeLogs({ ...emptyLog(), crate: 'epic' }, { ...emptyLog(), crate: 'rare' });
    expect(merged.crate).toBe('epic');
    expect(mergeLogs(emptyLog(), { ...emptyLog(), crate: 'rare' }).crate).toBe('rare');
    const old: Record<string, unknown> = { ...emptyLog() };
    delete old.crate;
    expect(v.parse(PaperLogSchema, old).crate).toBeNull();
  });

  it('keeps the rules sane: rare is the lowest rarity that waits, and the crate holds at least a floor of pieces', () => {
    expect(VALLEY_RULES.forge.crateMinRarity).toBe(1);
    expect(VALLEY_RULES.forge.crateCap).toBeGreaterThanOrEqual(
      VALLEY_RULES.forge.floorPiecesPerAnvil,
    );
  });
});
