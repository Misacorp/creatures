import { describe, expect, it } from 'vitest';
import { parseRaidView, parseReplayView } from './raid-api';

const raid = {
  weekId: '2026-W41',
  status: 'open',
  timezone: 'Europe/Helsinki',
  boss: {
    id: 'tidal-colossus',
    name: 'Tidal Colossus',
    element: 'tide',
    turnOrder: 'left_to_right',
    gimmicks: [{ id: 'undertow', name: 'Undertow' }],
    finaleRounds: 12,
  },
  schedule: { weekStart: 1, phase1: 2, phase2: 3, finale: 4 },
  next: { event: 'phase1', at: 2 },
  serverNow: 1,
  roster: [{ displayName: 'Misa', you: true, party: 1 }],
  parties: [{ party: 1, size: 1 }],
  you: {
    inRoster: true,
    optOut: false,
    party: 1,
    canEdit: true,
    canOptOut: true,
    team: {
      mode: 'auto',
      creatures: [
        { creatureId: 'c1', species: 'splashet', name: 'Splashet', level: 3, slot: null },
      ],
    },
  },
  party: {
    party: 1,
    rowLength: 3,
    row: [
      { slot: 0, zone: 'middle', creature: null },
      {
        slot: 1,
        zone: 'middle',
        creature: {
          ownerName: 'Misa',
          species: 'splashet',
          name: 'Splashet',
          level: 3,
          mine: true,
          creatureId: 'c1',
        },
      },
    ],
    guests: true,
    bossHp: { max: 100, current: 100 },
    adaptation: null,
    results: [],
  },
};

describe('parseRaidView', () => {
  it('accepts the server shape', () => {
    expect(parseRaidView(raid).boss.name).toBe('Tidal Colossus');
  });

  it('accepts a player who is not in a party', () => {
    const out = {
      ...raid,
      party: null,
      you: { ...raid.you, inRoster: false, party: null, team: null },
    };
    expect(parseRaidView(out).party).toBeNull();
  });

  it('refuses broken shapes', () => {
    expect(() => parseRaidView(null)).toThrow();
    expect(() => parseRaidView({ ...raid, status: 'weird' })).toThrow();
    expect(() => parseRaidView({ ...raid, schedule: { weekStart: 1 } })).toThrow();
    expect(() =>
      parseRaidView({ ...raid, party: { ...raid.party, row: [{ slot: 'x' }] } }),
    ).toThrow();
    expect(() => parseRaidView({ ...raid, you: { ...raid.you, canEdit: 'yes' } })).toThrow();
  });
});

const replay = {
  weekId: '2026-W41',
  party: 1,
  phase: 'phase1',
  at: 5,
  boss: { id: 'tidal-colossus', name: 'Tidal Colossus' },
  rounds: 1,
  cleared: false,
  bossHpMax: 100,
  bossHpStart: 100,
  bossHpEnd: 90,
  you: 'm1',
  row: [
    {
      position: 0,
      id: 'c1',
      name: 'Splashet',
      species: 'splashet',
      element: 'tide',
      role: 'setter',
      level: 3,
      owner: 'm1',
    },
  ],
  events: [
    { t: 'round_start', round: 1, bossHp: 100, mark: null },
    { t: 'turn', round: 1, creature: 'c1' },
  ],
  names: { boss: 'Tidal Colossus', creatures: { c1: 'Splashet' }, players: { m1: 'Misa' } },
};

describe('parseReplayView', () => {
  it('accepts the server shape', () => {
    const parsed = parseReplayView(replay);
    expect(parsed.events).toHaveLength(2);
    expect(parsed.you).toBe('m1');
    expect(parsed.bossHpMax).toBe(100);
  });

  it('accepts a caller who was not in the fight (you is null)', () => {
    expect(parseReplayView({ ...replay, you: null }).you).toBeNull();
  });

  it('refuses a missing or badly typed you or bossHpMax', () => {
    expect(() => parseReplayView({ ...replay, you: undefined })).toThrow();
    expect(() => parseReplayView({ ...replay, bossHpMax: undefined })).toThrow();
    expect(() => parseReplayView({ ...replay, you: 1 })).toThrow();
    expect(() => parseReplayView({ ...replay, bossHpMax: 100.5 })).toThrow();
    expect(() => parseReplayView({ ...replay, bossHpMax: '100' })).toThrow();
  });

  it('refuses unknown event types and bad names', () => {
    expect(() => parseReplayView({ ...replay, events: [{ t: 'explode', round: 1 }] })).toThrow();
    expect(() =>
      parseReplayView({ ...replay, names: { boss: 'x', creatures: { a: 1 } } }),
    ).toThrow();
    expect(() => parseReplayView({ ...replay, phase: 'phase9' })).toThrow();
  });
});
