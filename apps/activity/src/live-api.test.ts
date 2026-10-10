import { describe, expect, it } from 'vitest';
import actionFire from './fixtures/action-fire.json';
import actionHold from './fixtures/action-hold.json';
import liveDoneCleared from './fixtures/live-done-cleared.json';
import liveDoneHit from './fixtures/live-done-hit.json';
import liveDoneMissed from './fixtures/live-done-missed.json';
import liveLobby from './fixtures/live-lobby.json';
import liveMid from './fixtures/live-mid.json';
import liveNone from './fixtures/live-none.json';
import practiceDone from './fixtures/practice-done.json';
import practiceLive from './fixtures/practice-live.json';
import practiceStart from './fixtures/practice-start.json';
import { parseLiveSnapshot, type LiveLobby, type LiveRunning } from './live-api';

/**
 * The fixtures in `src/fixtures` are real responses of the Worker (`GET /api/raid/live`, the
 * action route and the practice route), trimmed to a few events. The Worker has a test that pins
 * their keys (`apps/worker/test/raid-live.test.ts`, "the API contract"), so a server change shows up
 * there first.
 */
function running(data: unknown): LiveRunning {
  const parsed = parseLiveSnapshot(data);
  if (parsed.status !== 'live' && parsed.status !== 'done') throw new Error('expected a fight');
  return parsed;
}

function lobby(data: unknown): LiveLobby {
  const parsed = parseLiveSnapshot(data);
  if (parsed.status !== 'lobby') throw new Error('expected a lobby');
  return parsed;
}

/** A deep copy that tests can break. */
const copy = (data: unknown): Record<string, unknown> =>
  JSON.parse(JSON.stringify(data)) as Record<string, unknown>;

describe('parseLiveSnapshot with real server responses', () => {
  it('accepts "none", where nearly everything is null or empty', () => {
    expect(liveNone.party).toBe(1);
    expect(liveNone.startsAt).toBeNull();
    expect(liveNone.names).toBeNull();
    expect(parseLiveSnapshot(liveNone)).toEqual({ status: 'none', serverNow: liveNone.serverNow });
  });

  it('accepts the lobby: a start time and the party pool, but no names, HP, row or abilities', () => {
    const parsed = lobby(liveLobby);
    expect(parsed).toMatchObject({
      status: 'lobby',
      party: 1,
      round: 0,
      names: null,
      bossHp: null,
      row: [],
      abilities: [],
      events: [],
      loot: null,
      you: null,
      watching: ['Player 1'],
    });
    expect(parsed.startsAt).toBe(liveLobby.startsAt);
    expect(parsed.boss).toMatchObject({ name: 'Storm Sovereign', hpMax: 50_000_000 });
  });

  it('accepts a lobby whose party has no boss pool yet', () => {
    const noPool = copy(liveLobby);
    noPool['boss'] = { ...liveLobby.boss, hpMax: null, hpStart: null };
    expect(lobby(noPool).boss.hpMax).toBeNull();
  });

  it('accepts a fight in progress: one ability fired, one held', () => {
    const parsed = running(liveMid);
    expect(parsed).toMatchObject({ status: 'live', practice: false, round: 4, you: 'm2' });
    expect(parsed.bossHp).toBeLessThan(parsed.boss.hpStart);
    expect(parsed.row).toHaveLength(9);
    expect(parsed.names.players).toEqual({ m1: 'Player 1', m2: 'Player 2' });
    expect(parsed.names.adaptations).toBeDefined();
    expect(parsed.events.some((e) => e.t === 'ability')).toBe(true);
    expect(parsed.abilities).toEqual([
      {
        alias: 'm1',
        abilityId: 'shield-wall',
        mode: 'fired',
        fired: true,
        firedAtRound: 3,
        fireAtRound: null,
        defaultRound: 3,
      },
      {
        alias: 'm2',
        abilityId: 'rally',
        mode: 'held',
        fired: false,
        firedAtRound: null,
        fireAtRound: null,
        defaultRound: 6,
      },
    ]);
  });

  it('accepts what Fire and Hold answer: the new snapshot, with the ability waiting for its round', () => {
    const fired = running(actionFire);
    expect(fired.abilities[0]).toMatchObject({
      alias: 'm1',
      mode: 'fired',
      fired: false,
      firedAtRound: null,
      fireAtRound: 3,
    });
    const held = running(actionHold);
    expect(held.abilities[1]).toMatchObject({ alias: 'm2', mode: 'held', fired: false });
  });

  it('accepts the finished fight with a jackpot, and without one', () => {
    const hit = running(liveDoneHit);
    expect(hit).toMatchObject({ status: 'done', bossHp: 0 });
    expect(hit.loot).toEqual({
      cleared: true,
      essence: 46,
      jackpot: { essence: 100, firstOnServer: true },
      pity: 0,
    });
    const cleared = running(liveDoneCleared);
    expect(cleared.loot).toMatchObject({ cleared: true, jackpot: null, pity: 1 });
    expect(cleared.loot?.essence).toBeGreaterThan(0);
  });

  it('accepts the finished fight that was lost', () => {
    const missed = running(liveDoneMissed);
    expect(missed).toMatchObject({ status: 'done', round: 12, rounds: 12 });
    expect(missed.loot).toEqual({ cleared: false, essence: 0, jackpot: null, pity: 1 });
    expect(missed.bossHp).toBeGreaterThan(0);
  });

  it('accepts practice fights, from the start to the end, with no payout', () => {
    expect(running(practiceStart)).toMatchObject({ status: 'live', practice: true, round: 1 });
    expect(running(practiceStart).boss.hpStart).toBe(running(practiceStart).boss.hpMax);
    expect(running(practiceLive)).toMatchObject({ status: 'live', practice: true });
    const done = running(practiceDone);
    expect(done).toMatchObject({ status: 'done', practice: true });
    expect(done.loot).toMatchObject({ essence: 0, jackpot: null });
  });
});

describe('parseLiveSnapshot is strict', () => {
  it('refuses things that are not snapshots', () => {
    expect(() => parseLiveSnapshot(null)).toThrow();
    expect(() => parseLiveSnapshot([])).toThrow();
    expect(() => parseLiveSnapshot({})).toThrow();
    expect(() => parseLiveSnapshot({ status: 'none' })).toThrow();
    expect(() => parseLiveSnapshot({ ...liveMid, status: 'weird' })).toThrow();
  });

  it('refuses a missing field in every status', () => {
    for (const fixture of [liveNone, liveLobby, liveMid, liveDoneHit]) {
      for (const key of Object.keys(fixture)) {
        if (key === 'status') continue;
        const broken = copy(fixture);
        delete broken[key];
        expect(() => parseLiveSnapshot(broken), `${fixture.status} without ${key}`).toThrow();
      }
    }
  });

  it('refuses nulls where the status needs a value', () => {
    // From the lobby on there is a party and a start time.
    for (const fixture of [liveLobby, liveMid]) {
      for (const key of ['party', 'startsAt']) {
        expect(() => parseLiveSnapshot({ ...fixture, [key]: null })).toThrow();
      }
    }
    // A fight has its names, the HP and the boss pool.
    expect(() => parseLiveSnapshot({ ...liveMid, names: null })).toThrow();
    expect(() => parseLiveSnapshot({ ...liveMid, bossHp: null })).toThrow();
    expect(() =>
      parseLiveSnapshot({ ...liveMid, boss: { ...liveMid.boss, hpMax: null } }),
    ).toThrow();
    expect(() =>
      parseLiveSnapshot({ ...liveMid, boss: { ...liveMid.boss, hpStart: null } }),
    ).toThrow();
    expect(() => parseLiveSnapshot({ ...liveDoneHit, names: null })).toThrow();
  });

  it('refuses wrong types', () => {
    const bad: Record<string, unknown> = {
      practice: 'no',
      week: 3,
      party: '1',
      you: 7,
      startsAt: '1',
      roundMs: 0,
      rounds: 0,
      round: 1.5,
      serverNow: '5',
      bossHp: '800',
      watching: [1],
      row: [{ position: 'x' }],
      abilities: 'none',
      events: [{ t: 'explode', round: 1 }],
      loot: { cleared: true, essence: 1, jackpot: null },
    };
    for (const [key, value] of Object.entries(bad)) {
      expect(() => parseLiveSnapshot({ ...liveMid, [key]: value }), key).toThrow();
    }
    expect(() => parseLiveSnapshot({ ...liveMid, round: -1 })).toThrow();
    expect(() =>
      parseLiveSnapshot({ ...liveMid, names: { boss: 'x', creatures: { a: 1 } } }),
    ).toThrow();
    expect(() =>
      parseLiveSnapshot({ ...liveMid, names: { ...liveMid.names, adaptations: { a: 1 } } }),
    ).toThrow();
    expect(() => parseLiveSnapshot({ ...liveMid, boss: { ...liveMid.boss, name: 1 } })).toThrow();
    expect(() => parseLiveSnapshot({ ...liveNone, serverNow: null })).toThrow();
  });

  it('refuses bad abilities and loot', () => {
    const ability = liveMid.abilities[0] as Record<string, unknown>;
    const withAbility = (over: Record<string, unknown>) => ({
      ...liveMid,
      abilities: [{ ...ability, ...over }],
    });
    expect(() => parseLiveSnapshot(withAbility({ mode: 'sleeping' }))).toThrow();
    expect(() => parseLiveSnapshot(withAbility({ fired: 'yes' }))).toThrow();
    expect(() => parseLiveSnapshot(withAbility({ firedAtRound: 0 }))).toThrow();
    expect(() => parseLiveSnapshot(withAbility({ fireAtRound: 1.5 }))).toThrow();
    expect(() => parseLiveSnapshot(withAbility({ defaultRound: null }))).toThrow();
    expect(() => parseLiveSnapshot(withAbility({ defaultRound: -1 }))).toThrow();
    const noFireAt = { ...ability };
    delete noFireAt['fireAtRound'];
    expect(() => parseLiveSnapshot({ ...liveMid, abilities: [noFireAt] })).toThrow();
    const loot = { cleared: true, essence: 1, jackpot: null, pity: 0 };
    expect(() => parseLiveSnapshot({ ...liveDoneHit, loot: { ...loot, pity: null } })).toThrow();
    expect(() =>
      parseLiveSnapshot({ ...liveDoneHit, loot: { ...loot, jackpot: { essence: 1 } } }),
    ).toThrow();
  });
});
