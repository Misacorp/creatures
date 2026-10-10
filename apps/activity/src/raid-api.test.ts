import { describe, expect, it } from 'vitest';
import raidReveal from './fixtures/raid-reveal.json';
import raidRevealSeen from './fixtures/raid-reveal-seen.json';
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
    ability: { abilityId: 'rally', chosen: false },
    reveal: null,
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

describe('parseRaidView with real server responses', () => {
  it('accepts the Raid view of a finale player: the ability, the reveal and a placed creature', () => {
    const parsed = parseRaidView(raidReveal);
    expect(parsed.status).toBe('finale');
    expect(parsed.you.ability).toEqual({ abilityId: 'rally', chosen: false });
    expect(parsed.you.reveal).toEqual({
      week: '2027-W02',
      cleared: true,
      essence: 46,
      jackpot: { essence: 100, firstOnServer: true },
    });
    const mine = parsed.party?.row.find((slot) => slot.creature?.mine === true);
    expect(mine?.creature?.creatureId).toBeTypeOf('string');
    expect(parsed.party?.row.some((slot) => slot.creature?.mine === false)).toBe(true);
    expect(parsed.party?.results.map((r) => r.phase)).toEqual(['phase1', 'phase2']);
    expect(parsed.party?.adaptation?.rule).toBe('resist-top-element');
  });

  it('accepts the Raid view that answers "reveal seen": no reveal any more', () => {
    const parsed = parseRaidView(raidRevealSeen);
    expect(parsed.you.reveal).toBeNull();
    expect(parsed.you.ability).toEqual({ abilityId: 'rally', chosen: false });
  });
});

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

  it('needs the ability and the reveal, as null when there is none', () => {
    const without = (key: 'ability' | 'reveal') => {
      const you: Record<string, unknown> = { ...raid.you };
      delete you[key];
      return { ...raid, you };
    };
    expect(() => parseRaidView(without('ability'))).toThrow();
    expect(() => parseRaidView(without('reveal'))).toThrow();
    expect(parseRaidView({ ...raid, you: { ...raid.you, ability: null } }).you.ability).toBeNull();
  });

  it('accepts the finale ability and a reveal, or null for both', () => {
    const withBoth = {
      ...raid,
      you: {
        ...raid.you,
        ability: { abilityId: 'rally', chosen: true },
        reveal: {
          week: '2026-W40',
          cleared: true,
          essence: 30,
          jackpot: { essence: 100, firstOnServer: false },
        },
      },
    };
    const parsed = parseRaidView(withBoth);
    expect(parsed.you.ability?.abilityId).toBe('rally');
    expect(parsed.you.reveal?.jackpot?.essence).toBe(100);
    const empty = { ...raid, you: { ...raid.you, ability: null, reveal: null } };
    expect(parseRaidView(empty).you.reveal).toBeNull();
    const miss = {
      ...raid,
      you: { ...raid.you, reveal: { week: 'w', cleared: false, essence: 0, jackpot: null } },
    };
    expect(parseRaidView(miss).you.reveal?.jackpot).toBeNull();
  });

  it('refuses a broken ability or reveal', () => {
    const you = (extra: Record<string, unknown>) => ({ ...raid, you: { ...raid.you, ...extra } });
    expect(() => parseRaidView(you({ ability: { abilityId: 'rally' } }))).toThrow();
    expect(() => parseRaidView(you({ ability: { abilityId: 1, chosen: true } }))).toThrow();
    expect(() => parseRaidView(you({ ability: 'rally' }))).toThrow();
    expect(() => parseRaidView(you({ reveal: { week: 'w', cleared: true } }))).toThrow();
    expect(() =>
      parseRaidView(you({ reveal: { week: 'w', cleared: true, essence: 1.5, jackpot: null } })),
    ).toThrow();
    expect(() =>
      parseRaidView(
        you({ reveal: { week: 'w', cleared: true, essence: 1, jackpot: { essence: 1 } } }),
      ),
    ).toThrow();
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
