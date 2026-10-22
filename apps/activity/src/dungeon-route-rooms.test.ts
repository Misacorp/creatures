import { describe, expect, it } from 'vitest';
import { campNote, roomLog } from './dungeon-route-rooms';
import { omitKey, sampleSummary, sampleVaultSummary } from './dungeon-path-samples';
import { undercroftLostSummary, undercroftSummary } from './dungeon-undercroft-sample';
import type { DungeonRunSummary, DungeonStepLog } from './dungeon-types';

const rowsOf = (run: DungeonRunSummary) => roomLog(run) ?? [];

describe('the rooms of a run, in order', () => {
  it('lists every room the run went through, not only the fights', () => {
    const rows = rowsOf(sampleSummary('cleared'));
    expect(rows.map((r) => [r.kind, r.title, r.name, r.note])).toEqual([
      ['fight', 'Room 1', expect.any(String), null],
      ['mystery', 'Room 2', 'Glowing Pool', 'You gain 1 scrap.'],
      ['elite', 'Room 3 · Elite', expect.stringMatching(/^Fierce /), null],
      ['camp', 'Room 4', 'Camp', 'Rested'],
      ['cache', 'Room 5', 'Cache', '1 Bait · 1 Scrap'],
      ['fight', 'Room 6', expect.any(String), null],
      ['boss', 'Room 7 · Floor boss', 'Drowned Warden', null],
    ]);
    expect(rows.every((r) => r.state === 'cleared')).toBe(true);
    // Only the fights are stamped: a mystery room, the camp and a cache cleared nothing.
    expect(rows.map((r) => r.banner)).toEqual([
      'CLEARED',
      null,
      'CLEARED',
      null,
      null,
      'CLEARED',
      'CLEARED',
    ]);
    expect(rows.map((r) => r.node)).toEqual(sampleSummary('cleared').route?.path);
  });

  it('writes each header as two short lines, so it never wraps to three at 390 px', () => {
    const day = rowsOf(sampleSummary('cleared'));
    expect(day.map((r) => [r.where, r.what])).toEqual([
      ['Room 1', null],
      ['Room 2', null],
      ['Room 3', 'Elite'],
      ['Room 4', null],
      ['Room 5', null],
      ['Room 6', null],
      ['Room 7', 'Floor boss'],
    ]);
    // Below, the Undercroft floor is the first line and the room number (with the kind as one word) the second.
    const below = rowsOf(undercroftSummary()).filter((r) => r.level > 0);
    expect(below.length).toBeGreaterThan(0);
    for (const r of below) expect(r.where).toBe('Undercroft 1');
    expect(below[below.length - 1]?.what).toMatch(/^Room \d · Boss$/);
    // Short enough for a third of a phone: no line is longer than "Undercroft 1" or "Room 6 · Elite".
    for (const r of [...day, ...below]) {
      expect(r.where.length).toBeLessThanOrEqual(12);
      expect((r.what ?? '').length).toBeLessThanOrEqual(14);
    }
  });

  it('gives a fight its foe and a room that is not a fight its glyph', () => {
    const [fight, mystery, , camp, , , boss] = rowsOf(sampleSummary('cleared'));
    expect(fight?.foe).toMatchObject({ boss: false, hpLeft: null });
    expect(fight?.glyph).toBeNull();
    expect(boss?.foe).toMatchObject({ id: 'drowned-warden', boss: true });
    expect(mystery?.foe).toBeNull();
    expect(mystery?.glyph).toBe('map-mystery');
    expect(camp?.glyph).toBe('map-camp');
  });

  it('reads the room the run fell in as Defeated, with the foe HP left, and the rest as Cleared', () => {
    const rows = rowsOf(sampleSummary('defeat'));
    expect(rows.map((r) => r.state)).toEqual(['cleared', 'cleared', 'defeat']);
    const lost = rows[2];
    expect(lost?.banner).toBe('DEFEATED');
    expect(lost?.foe?.hpLeft).toMatch(/ HP left$/);
    expect(lost?.spoken).toMatch(/Defeated\.$/);
    expect(rows[0]?.spoken).toMatch(/Cleared\.$/);
  });

  it('ends a run that headed home from the camp with the camp, Cleared', () => {
    const rows = rowsOf(sampleSummary('home'));
    expect(rows.map((r) => r.kind)).toEqual(['fight', 'mystery', 'elite', 'camp']);
    expect(rows[3]).toMatchObject({ state: 'cleared', note: 'Rested' });
  });

  it('names the Undercroft floor of its rooms, and the epic and keeper fights', () => {
    const rows = rowsOf(undercroftSummary());
    const below = rows.filter((r) => r.level > 0);
    expect(below.length).toBeGreaterThan(0);
    expect(below.every((r) => r.title.startsWith('Undercroft 1 · Room '))).toBe(true);
    expect(rows[rows.length - 1]).toMatchObject({ kind: 'boss', state: 'cleared' });
    expect(rows[rows.length - 1]?.title).toMatch(/^Undercroft 1 · Room \d · Floor boss$/);
    // The day's rooms come first, then the ones below.
    expect(rows.map((r) => r.level)).toEqual([...rows.map((r) => r.level)].sort());
  });

  it('marks the room lost in the Undercroft as Defeated, and only that one', () => {
    const rows = rowsOf(undercroftLostSummary());
    expect(rows.filter((r) => r.state === 'defeat')).toHaveLength(1);
    expect(rows[rows.length - 1]?.state).toBe('defeat');
    expect(rows[rows.length - 1]?.level).toBeGreaterThan(0);
  });

  it('has nothing to list for a run with no route, an empty log or a log that does not match the fights', () => {
    const run = sampleSummary('cleared');
    expect(roomLog(omitKey(run, 'route'))).toBeNull();
    const route = run.route;
    if (route === undefined) throw new Error('the sample has a route');
    expect(roomLog({ ...run, route: { ...route, history: [] } })).toBeNull();
    expect(roomLog({ ...run, rooms: run.rooms.slice(1) })).toBeNull();
  });

  it('counts a camp or mystery room whose choice was still open as Cleared, not Defeated', () => {
    const run = sampleSummary('home');
    const route = run.route;
    if (route === undefined) throw new Error('the sample has a route');
    const history: DungeonStepLog[] = route.history.map((e) =>
      e.kind === 'camp' ? { node: e.node, kind: 'camp', result: 'pending' } : e,
    );
    const rows = rowsOf({ ...run, route: { ...route, history } });
    // Nothing was told and nothing was cleared: no stamp, a plain "Visited".
    expect(rows[3]).toMatchObject({
      kind: 'camp',
      state: 'cleared',
      banner: null,
      note: 'Visited',
      name: 'Camp',
    });
    expect(rows[3]?.spoken).toBe('Room 4: Camp. Visited.');
  });

  it('says what a carved door did in a few words', () => {
    const run = sampleSummary('cleared');
    const route = run.route;
    if (route === undefined) throw new Error('the sample has a route');
    const door: DungeonStepLog = { node: 'f4l1', kind: 'door', result: 'door', added: true };
    const history = route.history.map((e) => (e.node === 'f4l1' ? door : e));
    const rows = rowsOf({ ...run, route: { ...route, history } });
    expect(rows[4]?.name).toBe('Carved door');
    expect(rows[4]?.note).toBe('Added a room to the first Undercroft floor.');
  });
});

describe('what the camp did, in a few words', () => {
  it('says each choice', () => {
    expect(campNote({ choice: 'rest' })).toBe('Rested');
    expect(campNote({ choice: 'swap' })).toBe('Swapped a creature');
    expect(campNote({ choice: 'home' })).toBe('Headed home');
    expect(campNote({ choice: 'keepsake' })).toBe('Took a keepsake');
    expect(
      campNote({
        choice: 'keepsake',
        keepsake: { id: 'k', name: 'Lantern Moth', description: 'x' },
      }),
    ).toBe('Took Lantern Moth');
  });
});

describe('a room a Sealed Vault marked', () => {
  it('is an epic fight in the recap: its header and title say epic, whatever its kind on the map', () => {
    const plain = roomLog(sampleSummary('cleared')) ?? [];
    const sealed = roomLog(sampleVaultSummary()) ?? [];
    const room = sealed.find((r) => r.node === 'f2l1');
    expect(room).toBeDefined();
    expect(room?.epic).toBe(true);
    expect(room?.what).toBe('Epic');
    expect(room?.title).toContain('Epic');
    // The same room without the vault says what it is on the map.
    expect(plain.find((r) => r.node === 'f2l1')?.epic).toBe(false);
    expect(plain.find((r) => r.node === 'f2l1')?.what).toBe('Elite');
  });
});
