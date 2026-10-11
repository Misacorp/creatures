import { describe, expect, it } from 'vitest';
import raidAutofire from './fixtures/raid-autofire.json';
import raidFestival from './fixtures/raid-festival.json';
import raidFestivalReveal from './fixtures/raid-festival-reveal.json';
import raidReveal from './fixtures/raid-reveal.json';
import raidRevealSeen from './fixtures/raid-reveal-seen.json';
import statsCloseLoss from './fixtures/raid-stats-close-loss.json';
import statsCloseWin from './fixtures/raid-stats-close-win.json';
import statsFinale from './fixtures/raid-stats-finale.json';
import statsWiped from './fixtures/raid-stats-wiped.json';
import { parseRaidView, parseReplayView, parseStats } from './raid-api';

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
  rank: 4,
  effectiveRank: 4,
  festival: false,
  festivalCreature: null,
  season: { index: 595, week: 2 },
  bestRank: 3,
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
    abilities: [
      {
        key: 'm1:basic',
        abilityId: 'rally',
        creatureId: null,
        species: null,
        unlocked: true,
        unlockLevel: 1,
        autoFire: true,
      },
      {
        abilityId: 'tidal-mark',
        creatureId: 'c1',
        species: 'splashet',
        unlocked: false,
        unlockLevel: 10,
        autoFire: false,
      },
    ],
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
    readiness: 'likely',
  },
};

describe('parseRaidView with real server responses', () => {
  it('accepts the Raid view of a finale player: the ability, the reveal and a placed creature', () => {
    const parsed = parseRaidView(raidReveal);
    expect(parsed.status).toBe('finale');
    expect(parsed.you.ability).toEqual({ abilityId: 'rally', chosen: true });
    expect(parsed.you.reveal).toEqual({
      week: '2027-W02',
      party: 1,
      cleared: true,
      essence: 140,
      rankChange: { before: 3, after: 4, festival: false, serverWon: true },
      festivalGrant: null,
    });
    // Rank, season and best rank of a normal week; no band once the finale has started.
    expect(parsed).toMatchObject({
      rank: 3,
      effectiveRank: 3,
      festival: false,
      festivalCreature: null,
      season: { index: 595, week: 1 },
      bestRank: 3,
    });
    expect(parsed.party?.readiness).toBeNull();
    // Only the finale result carries the ladder's move.
    expect(parsed.party?.results.map((r) => r.rankChange !== null)).toEqual([false, false, true]);
    expect(parsed.party?.results[2]?.rankChange).toEqual({
      before: 3,
      after: 4,
      festival: false,
      serverWon: true,
    });
    const mine = parsed.party?.row.find((slot) => slot.creature?.mine === true);
    expect(mine?.creature?.creatureId).toBeTypeOf('string');
    expect(parsed.party?.row.some((slot) => slot.creature?.mine === false)).toBe(true);
    expect(parsed.party?.results.map((r) => r.phase)).toEqual(['phase1', 'phase2', 'finale']);
    expect(parsed.party?.adaptation?.rule).toBe('resist-top-element');
  });

  it('reads what the player brings to the finale: the basic ability, then creature abilities, locked ones too', () => {
    const { abilities } = parseRaidView(raidReveal).you;
    expect(abilities[0]).toMatchObject({ key: 'm1:basic', abilityId: 'rally', creatureId: null });
    const creatures = abilities.slice(1);
    expect(creatures.length).toBeGreaterThan(1);
    for (const entry of creatures) {
      expect(entry.creatureId).toBeTypeOf('string');
      expect(entry.species).toBeTypeOf('string');
      expect(entry.unlockLevel).toBe(10);
      // Only an unlocked ability has a key: a locked one will not be in the fight.
      if (entry.unlocked) expect(entry.key).toMatch(/^m1:c\d$/);
      else expect(entry).not.toHaveProperty('key');
    }
    expect(creatures.some((entry) => !entry.unlocked)).toBe(true);
  });

  it('accepts the Raid view that answers "reveal seen": no reveal any more', () => {
    const parsed = parseRaidView(raidRevealSeen);
    expect(parsed.you.reveal).toBeNull();
    expect(parsed.you.ability).toEqual({ abilityId: 'rally', chosen: true });
  });
});

describe('parseRaidView with a Festival week (real server responses)', () => {
  it('reads the Monday view of a Festival week: rank, eased boss, creature, season and the band', () => {
    const parsed = parseRaidView(raidFestival);
    expect(parsed).toMatchObject({
      status: 'open',
      rank: 6,
      effectiveRank: 3,
      festival: true,
      festivalCreature: 'hearthshell',
      season: { week: 5 },
      bestRank: 5,
    });
    expect(['long_shot', 'even', 'likely', 'strong']).toContain(parsed.party?.readiness);
    // Only the band: nothing numeric about the forecast is in the party block.
    expect(Object.keys(parsed.party ?? {}).sort()).toEqual(
      [
        'adaptation',
        'bossHp',
        'guests',
        'party',
        'readiness',
        'results',
        'row',
        'rowLength',
      ].sort(),
    );
  });

  it('reads the reveal of a won Festival: the creature and the rank easing', () => {
    const parsed = parseRaidView(raidFestivalReveal);
    expect(parsed.you.reveal).toMatchObject({
      cleared: true,
      rankChange: { before: 6, after: 5, festival: true, serverWon: true },
      festivalGrant: { species: 'hearthshell', outcome: 'new', firstOnServer: true },
    });
    // The finale's result card carries the same, so it stays after the reveal is dismissed.
    expect(parsed.party?.results.at(-1)).toMatchObject({
      phase: 'finale',
      rankChange: { before: 6, after: 5, festival: true, serverWon: true },
      festivalGrant: { species: 'hearthshell', outcome: 'new' },
    });
  });
});

describe('parseRaidView and the ladder fields', () => {
  it('accepts a week with no rank (a week from before ranks, or a server nobody is in yet)', () => {
    const old = {
      ...raid,
      rank: null,
      effectiveRank: null,
      season: null,
      bestRank: null,
      party: { ...raid.party, readiness: null },
    };
    const parsed = parseRaidView(old);
    expect(parsed.rank).toBeNull();
    expect(parsed.season).toBeNull();
  });

  it('accepts every band and refuses anything else', () => {
    for (const band of ['long_shot', 'even', 'likely', 'strong']) {
      expect(
        parseRaidView({ ...raid, party: { ...raid.party, readiness: band } }).party?.readiness,
      ).toBe(band);
    }
    for (const bad of ['weak', 'LIKELY', 7, 0.6, true, undefined]) {
      expect(() => parseRaidView({ ...raid, party: { ...raid.party, readiness: bad } })).toThrow();
    }
  });

  it('refuses broken ranks, seasons and Festival fields', () => {
    for (const patch of [
      { rank: 0 },
      { rank: 1.5 },
      { rank: '3' },
      { effectiveRank: -1 },
      { bestRank: 0 },
      { festival: 'yes' },
      { festivalCreature: 7 },
      { season: { index: 1, week: 0 } },
      { season: { index: 1, week: 6 } },
      { season: { index: 1.5, week: 2 } },
      { season: { week: 2 } },
    ]) {
      expect(() => parseRaidView({ ...raid, ...patch }), JSON.stringify(patch)).toThrow();
    }
    // Every new field is required: a server that stops sending one is noticed, not guessed.
    for (const key of [
      'rank',
      'effectiveRank',
      'festival',
      'festivalCreature',
      'season',
      'bestRank',
    ]) {
      const without: Record<string, unknown> = { ...raid };
      delete without[key];
      expect(() => parseRaidView(without), key).toThrow();
    }
    const noBand: Record<string, unknown> = { ...raid.party };
    delete noBand['readiness'];
    expect(() => parseRaidView({ ...raid, party: noBand })).toThrow();
  });

  it('refuses a broken rank change or Festival grant in a reveal', () => {
    const reveal = {
      week: 'w',
      party: 1,
      cleared: true,
      essence: 1,
      rankChange: { before: 3, after: 4, festival: false, serverWon: true },
      festivalGrant: {
        species: 'hearthshell',
        outcome: 'fused',
        fusionCount: 2,
        firstOnServer: false,
      },
    };
    const view = (patch: Record<string, unknown>) => ({
      ...raid,
      you: { ...raid.you, reveal: { ...reveal, ...patch } },
    });
    expect(parseRaidView(view({})).you.reveal?.festivalGrant?.outcome).toBe('fused');
    expect(
      parseRaidView(view({ festivalGrant: { ...reveal.festivalGrant, fusionCount: undefined } })),
    );
    for (const patch of [
      { rankChange: { before: 3, after: 4 } },
      { rankChange: { before: 3.5, after: 4, festival: false, serverWon: true } },
      { rankChange: 'up' },
      { festivalGrant: { ...reveal.festivalGrant, outcome: 'stolen' } },
      { festivalGrant: { ...reveal.festivalGrant, species: 3 } },
      { festivalGrant: { ...reveal.festivalGrant, bait: 'many' } },
      { festivalGrant: { species: 'hearthshell', outcome: 'new' } },
      { rankChange: undefined },
      { festivalGrant: undefined },
    ]) {
      expect(() => parseRaidView(view(patch)), JSON.stringify(patch)).toThrow();
    }
  });
});

describe('parseRaidView and the finale result', () => {
  const result = {
    phase: 'finale',
    at: 1,
    cleared: true,
    rounds: 12,
    bossHpMax: 10,
    bossHpStart: 10,
    bossHpEnd: 0,
    damage: 10,
    reactions: 0,
    top: [],
    essence: 5,
    rankChange: null,
    festivalGrant: null,
  };
  const withResult = (patch: Record<string, unknown>) => ({
    ...raid,
    party: { ...raid.party, results: [{ ...result, ...patch }] },
  });

  it('accepts a finale result with and without the ladder move', () => {
    expect(parseRaidView(withResult({})).party?.results[0]?.rankChange).toBeNull();
    const change = { before: 2, after: 3, festival: false, serverWon: true };
    expect(parseRaidView(withResult({ rankChange: change })).party?.results[0]?.rankChange).toEqual(
      change,
    );
  });

  it('refuses a result without them, or with broken ones', () => {
    for (const patch of [
      { rankChange: undefined },
      { festivalGrant: undefined },
      { rankChange: { before: 2 } },
      { festivalGrant: { species: 'x', outcome: 'gift', firstOnServer: false } },
    ]) {
      expect(() => parseRaidView(withResult(patch)), JSON.stringify(patch)).toThrow();
    }
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

  it('carries the Auto fire setting of every ability, on or off', () => {
    const parsed = parseRaidView(raid);
    expect(parsed.you.abilities.map((a) => a.autoFire)).toEqual([true, false]);
    const real = parseRaidView(raidAutofire);
    expect(real.you.abilities.map((a) => [a.abilityId, a.autoFire])).toEqual([
      ['shield-wall', false],
      ['thunder-strike', true],
      ['flare-strike', false],
      ['static-zap', true],
    ]);
  });

  it('accepts locked abilities without a key, and no abilities at all', () => {
    const parsed = parseRaidView(raid);
    expect(parsed.you.abilities[1]).not.toHaveProperty('key');
    expect(parsed.you.abilities[1]?.unlocked).toBe(false);
    expect(parseRaidView({ ...raid, you: { ...raid.you, abilities: [] } }).you.abilities).toEqual(
      [],
    );
  });

  it('refuses broken ability previews', () => {
    const you = (abilities: unknown) => ({ ...raid, you: { ...raid.you, abilities } });
    const entry = raid.you.abilities[0] as Record<string, unknown>;
    expect(() => parseRaidView(you('rally'))).toThrow();
    expect(() => parseRaidView(you([{ ...entry, key: 7 }]))).toThrow();
    expect(() => parseRaidView(you([{ ...entry, unlocked: 'yes' }]))).toThrow();
    expect(() => parseRaidView(you([{ ...entry, unlockLevel: 1.5 }]))).toThrow();
    expect(() => parseRaidView(you([{ ...entry, creatureId: 3 }]))).toThrow();
    expect(() => parseRaidView(you([{ ...entry, autoFire: 'on' }]))).toThrow();
    expect(() => parseRaidView(you([{ ...entry, autoFire: undefined }]))).toThrow();
    expect(() => parseRaidView(you([{ ...entry, species: undefined }]))).toThrow();
    const missing: Record<string, unknown> = { ...entry };
    delete missing['abilityId'];
    expect(() => parseRaidView(you([missing]))).toThrow();
  });

  it('needs the ability and the reveal, as null when there is none', () => {
    const without = (key: 'ability' | 'reveal' | 'abilities') => {
      const you: Record<string, unknown> = { ...raid.you };
      delete you[key];
      return { ...raid, you };
    };
    expect(() => parseRaidView(without('ability'))).toThrow();
    expect(() => parseRaidView(without('reveal'))).toThrow();
    expect(() => parseRaidView(without('abilities'))).toThrow();
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
          party: 1,
          cleared: true,
          essence: 30,
          rankChange: null,
          festivalGrant: null,
        },
      },
    };
    const parsed = parseRaidView(withBoth);
    expect(parsed.you.ability?.abilityId).toBe('rally');
    expect(parsed.you.reveal?.essence).toBe(30);
    expect(parsed.you.reveal).not.toHaveProperty('jackpot');
    const empty = { ...raid, you: { ...raid.you, ability: null, reveal: null } };
    expect(parseRaidView(empty).you.reveal).toBeNull();
    const miss = {
      ...raid,
      you: {
        ...raid.you,
        reveal: {
          week: 'w',
          party: 1,
          cleared: false,
          essence: 0,
          rankChange: null,
          festivalGrant: null,
        },
      },
    };
    expect(parseRaidView(miss).you.reveal?.essence).toBe(0);
  });

  it('refuses a broken ability or reveal', () => {
    const you = (extra: Record<string, unknown>) => ({ ...raid, you: { ...raid.you, ...extra } });
    expect(() => parseRaidView(you({ ability: { abilityId: 'rally' } }))).toThrow();
    expect(() => parseRaidView(you({ ability: { abilityId: 1, chosen: true } }))).toThrow();
    expect(() => parseRaidView(you({ ability: 'rally' }))).toThrow();
    expect(() => parseRaidView(you({ reveal: { week: 'w', cleared: true } }))).toThrow();
    expect(() =>
      parseRaidView(
        you({
          reveal: {
            week: 'w',
            party: 1,
            cleared: true,
            essence: 1.5,
            rankChange: null,
            festivalGrant: null,
          },
        }),
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

describe('parseStats with real server responses', () => {
  it('accepts a close win, a close loss, a wipe-out and a finale', () => {
    expect(parseStats(statsCloseWin)).toMatchObject({ outcome: 'cleared', close: true });
    expect(parseStats(statsCloseLoss)).toMatchObject({ outcome: 'missed', close: true });
    expect(parseStats(statsWiped)).toMatchObject({ outcome: 'wiped', close: false });
    const finale = parseStats(statsFinale);
    expect(finale.phase).toBe('finale');
    expect(finale.adaptation).toMatchObject({ purged: true, purgedRound: 2 });
    expect(finale.abilities.used.length).toBeGreaterThan(0);
    expect(finale.players.filter((p) => p.you)).toHaveLength(1);
    expect(parseStats(statsCloseWin).adaptation).toBeNull();
  });

  it('returns the data untouched', () => {
    expect(parseStats(statsCloseWin)).toEqual(statsCloseWin);
  });

  it('refuses a shape that is not exactly the one the server sends', () => {
    const bad = (patch: Record<string, unknown>) => () => parseStats({ ...statsFinale, ...patch });
    expect(bad({ outcome: 'won' })).toThrow('unexpected fight stats');
    expect(bad({ close: 'yes' })).toThrow();
    expect(bad({ phase: 'phase9' })).toThrow();
    expect(bad({ rounds: 1.5 })).toThrow();
    expect(bad({ rounds: -1 })).toThrow();
    expect(bad({ boss: { ...statsFinale.boss, leftBp: 'x' } })).toThrow();
    expect(bad({ players: [{ displayName: 'A', you: true }] })).toThrow();
    expect(bad({ creatures: [{ ...statsFinale.creatures[0], owner: 5 }] })).toThrow();
    expect(bad({ abilities: { used: [], unused: -1 } })).toThrow();
    expect(bad({ abilities: null })).toThrow();
    expect(bad({ knockouts: 'none' })).toThrow();
    expect(bad({ adaptation: { name: 'x' } })).toThrow();
    expect(bad({ reactions: [{ name: 'Steam', count: 1 }] })).toThrow();
    expect(() => parseStats(null)).toThrow();
    expect(() => parseStats([])).toThrow();
    const withoutBoss: Record<string, unknown> = { ...statsFinale };
    delete withoutBoss['boss'];
    expect(() => parseStats(withoutBoss)).toThrow();
  });
});
