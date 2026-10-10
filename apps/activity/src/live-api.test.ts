import { describe, expect, it } from 'vitest';
import { parseLiveSnapshot } from './live-api';

const fight = {
  status: 'live',
  practice: false,
  week: '2026-W41',
  party: 1,
  you: 'p1',
  startsAt: 1_000_000,
  roundMs: 10_000,
  rounds: 12,
  round: 3,
  serverNow: 1_025_000,
  boss: {
    id: 'tidal-colossus',
    name: 'Tidal Colossus',
    element: 'tide',
    hpMax: 1000,
    hpStart: 900,
  },
  row: [
    {
      position: 0,
      id: 'c1',
      name: 'Splashet',
      species: 'splashet',
      element: 'tide',
      role: 'setter',
      level: 3,
      owner: 'p1',
    },
  ],
  names: { boss: 'Tidal Colossus', creatures: { c1: 'Splashet' }, players: { p1: 'Misa' } },
  abilities: [
    { alias: 'p1', abilityId: 'rally', mode: 'default', fired: false, firedAtRound: 6 },
    { alias: 'p2', abilityId: 'purge', mode: 'fired', fired: true, firedAtRound: 2 },
  ],
  events: [
    { t: 'round_start', round: 1, bossHp: 900, mark: null },
    { t: 'turn', round: 1, creature: 'c1' },
  ],
  bossHp: 800,
  watching: ['Misa'],
  loot: null,
};

describe('parseLiveSnapshot', () => {
  it('accepts a live fight', () => {
    const parsed = parseLiveSnapshot(fight);
    expect(parsed.status).toBe('live');
    if (parsed.status === 'none') throw new Error('expected a fight');
    expect(parsed.abilities).toHaveLength(2);
    expect(parsed.bossHp).toBe(800);
  });

  it('accepts a lobby, a held ability and an ability with no round yet', () => {
    const lobby = {
      ...fight,
      status: 'lobby',
      round: 0,
      events: [],
      abilities: [
        { alias: 'p1', abilityId: 'rally', mode: 'held', fired: false, firedAtRound: null },
      ],
    };
    expect(parseLiveSnapshot(lobby).status).toBe('lobby');
  });

  it('accepts the finished fight with its loot', () => {
    const done = {
      ...fight,
      status: 'done',
      loot: { cleared: true, essence: 40, jackpot: { essence: 100, firstOnServer: true }, pity: 0 },
    };
    const parsed = parseLiveSnapshot(done);
    if (parsed.status === 'none') throw new Error('expected a fight');
    expect(parsed.loot?.jackpot?.firstOnServer).toBe(true);
    const miss = { ...done, loot: { cleared: false, essence: 5, jackpot: null, pity: 4 } };
    expect(parseLiveSnapshot(miss).status).toBe('done');
  });

  it('accepts a practice fight and a player who is not in the fight (you is null)', () => {
    expect(parseLiveSnapshot({ ...fight, practice: true }).status).toBe('live');
    expect(parseLiveSnapshot({ ...fight, you: null }).status).toBe('live');
  });

  it('accepts "none" with or without the other fields', () => {
    expect(parseLiveSnapshot({ status: 'none' })).toEqual({ status: 'none', serverNow: null });
    expect(parseLiveSnapshot({ status: 'none', serverNow: 5 })).toEqual({
      status: 'none',
      serverNow: 5,
    });
  });

  it('refuses things that are not snapshots', () => {
    expect(() => parseLiveSnapshot(null)).toThrow();
    expect(() => parseLiveSnapshot([])).toThrow();
    expect(() => parseLiveSnapshot({})).toThrow();
    expect(() => parseLiveSnapshot({ ...fight, status: 'weird' })).toThrow();
  });

  it('refuses missing or badly typed fields', () => {
    for (const key of Object.keys(fight)) {
      if (key === 'status') continue;
      const copy: Record<string, unknown> = { ...fight };
      delete copy[key];
      expect(() => parseLiveSnapshot(copy), `missing ${key}`).toThrow();
    }
    expect(() => parseLiveSnapshot({ ...fight, practice: 'no' })).toThrow();
    expect(() => parseLiveSnapshot({ ...fight, round: 1.5 })).toThrow();
    expect(() => parseLiveSnapshot({ ...fight, round: -1 })).toThrow();
    expect(() => parseLiveSnapshot({ ...fight, bossHp: '800' })).toThrow();
    expect(() => parseLiveSnapshot({ ...fight, watching: [1] })).toThrow();
    expect(() => parseLiveSnapshot({ ...fight, you: 7 })).toThrow();
  });

  it('refuses numbers that would break the clock maths', () => {
    expect(() => parseLiveSnapshot({ ...fight, roundMs: 0 })).toThrow();
    expect(() => parseLiveSnapshot({ ...fight, rounds: 0 })).toThrow();
    expect(() => parseLiveSnapshot({ ...fight, boss: { ...fight.boss, hpMax: 0 } })).toThrow();
  });

  it('refuses bad abilities, events, names, rows and loot', () => {
    const ability = fight.abilities[0] as Record<string, unknown>;
    expect(() =>
      parseLiveSnapshot({ ...fight, abilities: [{ ...ability, mode: 'sleeping' }] }),
    ).toThrow();
    expect(() =>
      parseLiveSnapshot({ ...fight, abilities: [{ ...ability, fired: 'yes' }] }),
    ).toThrow();
    expect(() =>
      parseLiveSnapshot({ ...fight, abilities: [{ ...ability, firedAtRound: 0 }] }),
    ).toThrow();
    expect(() => parseLiveSnapshot({ ...fight, events: [{ t: 'explode', round: 1 }] })).toThrow();
    expect(() =>
      parseLiveSnapshot({ ...fight, names: { boss: 'x', creatures: { a: 1 } } }),
    ).toThrow();
    expect(() => parseLiveSnapshot({ ...fight, row: [{ position: 'x' }] })).toThrow();
    expect(() =>
      parseLiveSnapshot({ ...fight, loot: { cleared: true, essence: 1, jackpot: null } }),
    ).toThrow();
    expect(() =>
      parseLiveSnapshot({
        ...fight,
        loot: { cleared: true, essence: 1, jackpot: { essence: 1 }, pity: 0 },
      }),
    ).toThrow();
  });
});
