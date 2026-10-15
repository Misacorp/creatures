import { describe, expect, it } from 'vitest';
import actionFire from './fixtures/action-fire.json';
import actionHold from './fixtures/action-hold.json';
import liveDoneCleared from './fixtures/live-done-cleared.json';
import liveDoneHit from './fixtures/live-done-hit.json';
import liveDoneMissed from './fixtures/live-done-missed.json';
import liveLobby from './fixtures/live-lobby.json';
import liveMid from './fixtures/live-mid.json';
import liveNone from './fixtures/live-none.json';
import livePaced from './fixtures/live-paced.json';
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
  it('accepts a content-paced fight: the schedule is the rounds that have started and the next start', () => {
    const parsed = running(livePaced);
    expect(parsed).toMatchObject({ status: 'live', round: 4, roundMs: null });
    expect(parsed.roundStarts).toHaveLength(4);
    expect(parsed.roundStarts[0]).toBe(parsed.startsAt);
    // Rounds are not all the same length: they last as long as their events take to play.
    const lengths = parsed.roundStarts
      .slice(1)
      .map((t, i) => t - (parsed.roundStarts[i] as number));
    expect(new Set(lengths).size).toBeGreaterThan(1);
    expect(lengths.every((ms) => ms >= 6_000 && ms <= 22_000)).toBe(true);
    expect(parsed.nextRoundAt).toBeGreaterThan(parsed.serverNow);
    expect(parsed.nextRoundAt).toBeGreaterThan(parsed.roundStarts.at(-1) as number);
  });

  it('still reads a fight stored with fixed rounds, which keeps its roundMs', () => {
    const parsed = running(liveMid);
    expect(parsed.roundMs).toBe(10_000);
    expect(parsed.roundStarts).toHaveLength(parsed.round);
    expect(parsed.nextRoundAt).toBe((parsed.roundStarts.at(-1) as number) + 10_000);
  });

  it('wants the schedule in every state, and null for the next start only when there is none', () => {
    expect(() => parseLiveSnapshot({ ...copy(liveMid), roundStarts: undefined })).toThrow();
    expect(() => parseLiveSnapshot({ ...copy(liveMid), nextRoundAt: undefined })).toThrow();
    expect(parseLiveSnapshot({ ...copy(liveMid), nextRoundAt: null }).status).toBe('live');
    expect(running(liveDoneHit).nextRoundAt).toBeNull();
    expect(lobby(liveLobby)).toMatchObject({ roundMs: null, roundStarts: [] });
  });

  it("reads the Guard numbers of the fight's rules: the numbers, or null when none are known", () => {
    const rules = { guardHpBp: 0, guardArmorBp: 2_500 };
    expect(running(liveMid).rules).toEqual(rules);
    expect(running({ ...liveMid, rules: null }).rules).toBeNull();
    expect(parseLiveSnapshot(liveNone)).toMatchObject({ status: 'none' });
    expect(() => parseLiveSnapshot({ ...liveMid, rules: { guardHpBp: 0 } })).toThrow();
    expect(() => parseLiveSnapshot({ ...liveMid, rules: undefined })).toThrow();
  });

  it('accepts "none", where nearly everything is null or empty', () => {
    expect(liveNone.party).toBe(1);
    expect(liveNone.startsAt).toBeNull();
    expect(liveNone.names).toBeNull();
    expect(parseLiveSnapshot(liveNone)).toEqual({ status: 'none', serverNow: liveNone.serverNow });
  });

  it("accepts the lobby: a start time and a preview of the stage with the caller's own abilities", () => {
    const parsed = lobby(liveLobby);
    expect(parsed).toMatchObject({
      status: 'lobby',
      party: 1,
      round: 0,
      bossHp: 50_000_000,
      events: [],
      loot: null,
      you: 'm1',
      watching: ['Player 1'],
    });
    expect(parsed.startsAt).toBe(liveLobby.startsAt);
    expect(parsed.boss).toMatchObject({ name: 'Storm Sovereign', hpMax: 50_000_000 });
    // The row, the names and the caller's abilities are there before the start.
    expect(parsed.row).toHaveLength(9);
    expect(parsed.row.filter((c) => c.owner === 'm1')).toHaveLength(3);
    expect(parsed.names?.players).toEqual({ m1: 'Player 1', m2: 'Player 2' });
    expect(parsed.abilities.every((a) => a.alias === 'm1' && !a.fired)).toBe(true);
    // The player turned Auto fire off for the basic ability and the second creature.
    expect(parsed.abilities.map((a) => [a.key, a.mode, a.autoFire])).toEqual([
      ['m1:basic', 'held', false],
      ['m1:c0', 'default', true],
      ['m1:c1', 'held', false],
      ['m1:c2', 'default', true],
    ]);
  });

  it('accepts a lobby with no preview: an empty row and no names', () => {
    const bare = copy(liveLobby);
    Object.assign(bare, { row: [], names: null, abilities: [], bossHp: null, you: null });
    expect(lobby(bare).row).toEqual([]);
  });

  it('accepts a lobby whose party has no boss pool yet', () => {
    const noPool = copy(liveLobby);
    noPool['boss'] = { ...liveLobby.boss, hpMax: null, hpStart: null };
    expect(lobby(noPool).boss.hpMax).toBeNull();
  });

  it('accepts a fight in progress: one entry per ability use, fired, held and waiting', () => {
    const parsed = running(liveMid);
    expect(parsed).toMatchObject({ status: 'live', practice: false, round: 4, you: 'm2' });
    expect(parsed.bossHp).toBeLessThan(parsed.boss.hpStart);
    expect(parsed.row).toHaveLength(9);
    expect(parsed.names.players).toEqual({ m1: 'Player 1', m2: 'Player 2' });
    expect(parsed.names.adaptations).toBeDefined();
    expect(parsed.events.some((e) => e.t === 'ability')).toBe(true);
    // Each player has a basic ability and one for each of their unlocked team creatures.
    expect(parsed.abilities.map((a) => a.key)).toEqual([
      'm1:basic',
      'm1:c0',
      'm1:c1',
      'm1:c2',
      'm2:basic',
      'm2:c0',
      'm2:c1',
      'm2:c2',
    ]);
    expect(parsed.abilities[0]).toEqual({
      key: 'm1:basic',
      alias: 'm1',
      abilityId: 'shield-wall',
      creature: null,
      mode: 'fired',
      autoFire: true,
      fired: true,
      firedAtRound: 3,
      fireAtRound: null,
      defaultRound: 3,
    });
    expect(parsed.abilities[4]).toMatchObject({
      key: 'm2:basic',
      abilityId: 're-mark',
      mode: 'held',
      autoFire: false,
      fired: false,
      firedAtRound: null,
    });
    // A creature ability names its creature: a slot of the row.
    const strike = parsed.abilities[1];
    expect(strike).toMatchObject({ key: 'm1:c0', abilityId: 'thunder-strike', mode: 'default' });
    expect(parsed.row.some((slot) => slot.id === strike?.creature)).toBe(true);
    // The events carry the key and the creature, and a strike hit its ability.
    const used = parsed.events.find((e) => e.t === 'ability' && e.key === 'm1:c0');
    expect(used).toMatchObject({ creature: strike?.creature, byDefault: true });
    expect(parsed.events.some((e) => e.t === 'hit' && e.key === 'm1:c0')).toBe(true);
  });

  it('accepts what Fire and Hold answer: the new snapshot, with the ability waiting for its round', () => {
    const fired = running(actionFire);
    expect(fired.abilities.find((a) => a.key === 'm1:basic')).toMatchObject({
      alias: 'm1',
      mode: 'fired',
      fired: false,
      firedAtRound: null,
      fireAtRound: 3,
    });
    const held = running(actionHold);
    expect(held.abilities.find((a) => a.key === 'm2:basic')).toMatchObject({
      mode: 'held',
      fired: false,
    });
  });

  it('accepts the finished fight: one Essence figure, no jackpot and no pity', () => {
    const hit = running(liveDoneHit);
    expect(hit).toMatchObject({ status: 'done', bossHp: 0 });
    expect(hit.loot).toEqual({
      cleared: true,
      essence: 140,
      rankChange: { before: 3, after: 4, festival: false, serverWon: true },
      festivalGrant: null,
    });
    const cleared = running(liveDoneCleared);
    expect(cleared.loot).toMatchObject({ cleared: true });
    expect(cleared.loot?.essence).toBeGreaterThan(0);
    for (const fight of [hit, cleared]) {
      expect(Object.keys(fight.loot ?? {}).sort()).toEqual([
        'cleared',
        'essence',
        'festivalGrant',
        'rankChange',
      ]);
    }
  });

  it('accepts the finished fight that was lost', () => {
    const missed = running(liveDoneMissed);
    expect(missed).toMatchObject({ status: 'done', round: 12, rounds: 12 });
    expect(missed.loot).toEqual({
      cleared: false,
      essence: 0,
      // A lost normal week keeps the rank.
      rankChange: { before: 3, after: 3, festival: false, serverWon: false },
      festivalGrant: null,
    });
    expect(missed.bossHp).toBeGreaterThan(0);
  });

  it('accepts practice fights, from the start to the end, with no payout', () => {
    // It starts as a lobby with the 30 second countdown ahead of it.
    const start = lobby(practiceStart);
    expect(start).toMatchObject({ status: 'lobby', practice: true, round: 0, events: [] });
    expect(start.startsAt - start.serverNow).toBe(30_000);
    expect(start.boss.hpStart).toBe(start.boss.hpMax);
    expect(start.row).toHaveLength(9);
    expect(start.abilities.every((a) => a.alias === start.you && a.autoFire)).toBe(true);
    expect(running(practiceLive)).toMatchObject({ status: 'live', practice: true });
    const done = running(practiceDone);
    expect(done).toMatchObject({ status: 'done', practice: true });
    expect(done.loot).toMatchObject({
      essence: 0,
      rankChange: null,
      festivalGrant: null,
    });
    expect(done.abilities).toHaveLength(7);
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
      roundStarts: [1.5],
      nextRoundAt: 'soon',
      rounds: 0,
      round: 1.5,
      serverNow: '5',
      bossHp: '800',
      watching: [1],
      row: [{ position: 'x' }],
      abilities: 'none',
      events: [{ t: 'explode', round: 1 }],
      loot: { cleared: true, essence: 1.5 },
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
    expect(() => parseLiveSnapshot(withAbility({ key: 7 }))).toThrow();
    expect(() => parseLiveSnapshot(withAbility({ creature: 3 }))).toThrow();
    expect(parseLiveSnapshot(withAbility({ creature: null }))).toBeDefined();
    for (const field of ['key', 'creature']) {
      const missing = { ...ability };
      delete missing[field];
      expect(() => parseLiveSnapshot({ ...liveMid, abilities: [missing] }), field).toThrow();
    }
    expect(() => parseLiveSnapshot(withAbility({ mode: 'sleeping' }))).toThrow();
    expect(() => parseLiveSnapshot(withAbility({ fired: 'yes' }))).toThrow();
    expect(() => parseLiveSnapshot(withAbility({ firedAtRound: 0 }))).toThrow();
    expect(() => parseLiveSnapshot(withAbility({ fireAtRound: 1.5 }))).toThrow();
    expect(() => parseLiveSnapshot(withAbility({ defaultRound: null }))).toThrow();
    expect(() => parseLiveSnapshot(withAbility({ defaultRound: -1 }))).toThrow();
    const noFireAt = { ...ability };
    delete noFireAt['fireAtRound'];
    expect(() => parseLiveSnapshot({ ...liveMid, abilities: [noFireAt] })).toThrow();
    const loot = {
      cleared: true,
      essence: 1,
      rankChange: null,
      festivalGrant: null,
    };
    expect(parseLiveSnapshot({ ...liveDoneHit, loot })).toBeDefined();
    expect(() => parseLiveSnapshot({ ...liveDoneHit, loot: { ...loot, essence: -1 } })).toThrow();
    // The ladder and Festival parts of the loot are strict too, and required.
    expect(() =>
      parseLiveSnapshot({ ...liveDoneHit, loot: { ...loot, rankChange: { before: 1 } } }),
    ).toThrow();
    expect(() =>
      parseLiveSnapshot({ ...liveDoneHit, loot: { ...loot, festivalGrant: { species: 'x' } } }),
    ).toThrow();
    for (const key of ['rankChange', 'festivalGrant']) {
      const without: Record<string, unknown> = { ...loot };
      delete without[key];
      expect(() => parseLiveSnapshot({ ...liveDoneHit, loot: without }), key).toThrow();
    }
  });
});
