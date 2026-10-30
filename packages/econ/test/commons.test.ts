/** Collection sockets, gifts, the visit's order and where a set-and-forget scout starts. */
import { describe, expect, it } from 'vitest';
import { deadFrom } from '../src/analysis';
import { setCollectionFind } from '../src/collections';
import { ELEMENTS, RESOURCES, RULES } from '../src/rules';
import { collectSeat } from '../src/scouts';
import { runAll } from '../src/scenarios';
import { defaultDestination, newAnvil, newSeat } from '../src/policy';
import { profileById } from '../src/profiles';
import { join, runServer } from '../src/sim';
import { ALL_SERVERS } from '../src/servers';
import {
  addCreature,
  createPlayer,
  createServer,
  creditShard,
  refreshCeiling,
  speciesAvailable,
} from '../src/world';
import { LEVEL_XP, awayShare } from '../src/curves';
import { accrueIdleXp, effectiveCatchUp, fightXp, setCatchUp } from '../src/growth';
import { contributePart, dailyServer, giveGifts } from '../src/commons';
import { exchangeAtVisit, exchangeFor } from '../src/forge';
import { R } from '../src/types';

const options = { bossKills: 'half', communalSeats: true, shardExchange: true } as const;
const server = (opts: Partial<typeof options> = {}) =>
  createServer('test', 1, { ...options, ...opts }, RULES);

describe('collection sockets (V-COM-12)', () => {
  it('every board has five sockets, at least one for ordinary idle play', () => {
    for (const [place, board] of Object.entries(RULES.collections.boards)) {
      expect(RULES.commons.places).toContain(place);
      expect(board).toHaveLength(5);
      expect(board).toContain('everyday');
    }
  });

  it('a keystone fills only its own socket; the next copy goes to another board that wants it, then melts', () => {
    const s = server();
    expect(setCollectionFind(s, 'keystone:tidepools', RULES, 10)).toBe(true);
    // The Forge board's socket for the Tidepools keystone is now filled; the Signpost has one too.
    expect(s.sockets[1]!.filter(Boolean)).toHaveLength(1);
    expect(setCollectionFind(s, 'keystone:tidepools', RULES, 11)).toBe(true);
    expect(s.sockets[2]!.filter(Boolean)).toHaveLength(1);
    expect(setCollectionFind(s, 'keystone:tidepools', RULES, 12)).toBe(false);
    // A keystone no board asks for fills nothing.
    expect(setCollectionFind(s, 'keystone:nowhere', RULES, 13)).toBe(false);
    expect(s.sockets.flat().filter(Boolean)).toHaveLength(2);
  });

  it('a keystone does not fill the everyday socket, and a board is done only with every socket filled', () => {
    const s = server();
    const board = RULES.collections.boards.forge!;
    for (const kind of board.filter((k) => k !== 'everyday'))
      expect(setCollectionFind(s, kind, RULES, 5)).toBe(true);
    expect(s.collectionsDone).toBe(0);
    expect(s.firstCollectionHour).toBeNull();
    // The first everyday find goes to the first board that wants one (the bonfire's), the second to the Forge's.
    expect(setCollectionFind(s, 'everyday', RULES, 90)).toBe(true);
    expect(s.collectionsDone).toBe(0);
    expect(setCollectionFind(s, 'everyday', RULES, 99)).toBe(true);
    expect(s.collectionsDone).toBe(1);
    expect(s.firstCollectionHour).toBe(99);
    expect(s.warmth.collections).toBe(RULES.fire.warmth.collection);
    expect(setCollectionFind(s, 'everyday', RULES, 100)).toBe(true);
  });
});

describe('projects and gifts (Q33)', () => {
  const results = runAll(1, RULES, ['mixed8']);
  const given = (resource: number): number =>
    results
      .mixed8!.runs.flatMap((r) => r.players)
      .reduce((n, p) => n + (p.sources[`out:${resource}:gifts`] ?? 0), 0);

  it('are paid in Acorns, scrap and shards, never Essence', () => {
    expect(given(R.acorns)).toBeGreaterThan(0);
    expect(given(R.scrap)).toBeGreaterThan(0);
    expect(given(R.shards)).toBeGreaterThan(0);
    expect(given(R.essence)).toBe(0);
  });

  it('cost an Acorn part, a scrap part and a shard part that add up to the size, and need all three', () => {
    const s = server();
    dailyServer(s, [], 0, RULES);
    const bonfire = s.places[0]!;
    expect(bonfire.open).toBe(true);
    const v = RULES.commons.giftValue;
    const value =
      bonfire.need[0]! * v.acorns + bonfire.need[1]! * v.scrap + bonfire.need[2]! * v.shards;
    expect(value).toBeCloseTo(bonfire.size, 6);
    expect((bonfire.need[0]! * v.acorns) / bonfire.size).toBeCloseTo(
      RULES.commons.costSplit.acorns,
      9,
    );
    // Acorns and scrap alone never finish it; the shards do.
    contributePart(s, 0, 0, 1e9, 10, RULES);
    contributePart(s, 0, 1, 1e9, 10, RULES);
    expect(s.places[0]!.level).toBe(1);
    expect(bonfire.have[0]).toBe(bonfire.need[0]);
    contributePart(s, 0, 2, 1e9, 10, RULES);
    expect(s.places[0]!.level).toBe(2);
    expect(s.places[0]!.open).toBe(false);
  });

  it("take the place's own element in full and any other at the exchange rate, keeping a reserve", () => {
    const s = server();
    dailyServer(s, [], 0, RULES);
    const p = createPlayer(RULES, 'test', 1, 0, profileById('daily'), 4);
    join(p, s, 0);
    const tide = ELEMENTS.indexOf('tide');
    const ember = ELEMENTS.indexOf(RULES.commons.placeElement.bonfire as (typeof ELEMENTS)[number]);
    const rate = RULES.forge.exchange.rate;
    const reserve = RULES.forge.giveReserveShards;
    p.giftBudget.fill(1e6);
    creditShard(p, tide, 100, 'test');
    giveGifts(p, s, 5);
    const spent = 100 - p.shards[tide]!;
    expect(spent).toBeGreaterThan(0);
    expect(p.shards[tide]).toBeGreaterThanOrEqual(reserve);
    expect(s.places[0]!.have[2]).toBeCloseTo(spent / rate, 9);
    const s2 = server();
    dailyServer(s2, [], 0, RULES);
    const q = createPlayer(RULES, 'test', 1, 1, profileById('daily'), 4);
    join(q, s2, 0);
    q.giftBudget.fill(1e6);
    creditShard(q, ember, 100, 'test');
    giveGifts(q, s2, 5);
    // The place's own element counts one for one.
    expect(100 - q.shards[ember]!).toBeCloseTo(s2.places[0]!.have[2]!, 9);
    expect(q.shards[ember]).toBeGreaterThanOrEqual(reserve);
  });

  it('keep a reserve for the Forge: at least a piece of scrap and a piece of shards', () => {
    expect(RULES.forge.giveReserveShards).toBeGreaterThanOrEqual(RULES.forge.shard);
    expect(RULES.forge.giveReserveScrap).toBeGreaterThanOrEqual(RULES.forge.scrap);
  });
});

describe('glimmer is gone (Q33)', () => {
  it('is not a resource, a find, a cost or a drop', () => {
    expect(RESOURCES).toEqual(['acorns', 'scrap', 'shards', 'essence']);
    expect(JSON.stringify(RULES)).not.toContain('glimmer');
  });
});

describe('the shard exchange (Q34)', () => {
  const player = (policy: 'setAndForget' | 'optimiser') => {
    const p = createPlayer(RULES, 'test', 1, 0, { ...profileById('daily'), policy }, 4);
    for (let sp = 0; sp < 3; sp++) addCreature(p, sp);
    newSeat(p);
    newAnvil(p);
    return p;
  };

  it('trades 3 shards of another element for 1 of the one needed, from the biggest pile above the reserve', () => {
    const p = player('optimiser');
    creditShard(p, 0, 20, 'test');
    creditShard(p, 1, 8, 'test');
    const before = p.wk.exchanges;
    exchangeFor(p, 2, 1, 5);
    expect(p.shards[2]).toBeGreaterThanOrEqual(1);
    expect(p.shards[0]).toBe(17);
    expect(p.shards[1]).toBe(8);
    expect(p.wk.exchanges - before).toBe(1);
  });

  it('never trades below the reserve, and stops when no pile can pay', () => {
    const p = player('optimiser');
    creditShard(p, 0, 7, 'test');
    expect(exchangeFor(p, 2, 10, 5)).toBe(0);
    expect(p.shards[0]).toBe(7);
  });

  it('has a crit that gives 2, drawn from the seeded generator: the same player gives the same crits', () => {
    const run = (): number[] => {
      const p = player('optimiser');
      creditShard(p, 0, 3000, 'test');
      const gains: number[] = [];
      for (let i = 0; i < 200; i++) gains.push(exchangeFor(p, 2, (p.shards[2] ?? 0) + 1, 0));
      return gains;
    };
    const gains = run();
    expect(gains).toEqual(run());
    const crits = gains.filter((g) => g === 2).length;
    expect(crits).toBeGreaterThan(5);
    expect(crits).toBeLessThan(45);
    expect(gains.every((g) => g === 1 || g === 2)).toBe(true);
  });

  it('is used by a set-and-forget player only when the Forge is waiting on a shard', () => {
    const p = player('setAndForget');
    creditShard(p, 0, 30, 'test');
    exchangeAtVisit(p);
    expect(p.shards[2]).toBe(0);
    expect(p.wk.exchanges).toBe(0);
    p.waitingShard = 2;
    exchangeAtVisit(p);
    expect(p.shards[2]).toBeGreaterThanOrEqual(p.anvils.length);
    expect(p.waitingShard).toBe(-1);
  });

  it('is used by an optimiser at each visit for what its orders need', () => {
    const p = player('optimiser');
    creditShard(p, 0, 30, 'test');
    // The team has weak slots to fill with pieces of element 2; the exchange stocks shards of it for the anvils.
    p.weakByElement[2] = 5;
    exchangeAtVisit(p);
    expect(p.shards[2]).toBeGreaterThanOrEqual(
      Math.min(5, p.anvils.length * 3) * RULES.forge.shard,
    );
  });

  it('shows in the ledger: the trade is shards out and shards in', () => {
    const p = player('optimiser');
    creditShard(p, 0, 30, 'test');
    exchangeFor(p, 2, 1, 5);
    expect(p.sources.get(`out:${R.shards}:exchange`)).toBe(3);
    expect(p.sources.get(`in:${R.shards}:exchange`)).toBeGreaterThanOrEqual(1);
  });
});

describe('catch-up (Q35 B)', () => {
  /** Plays `days` days of one player: a visit every `every` days at 20:00, the idle XP of every hour between. */
  function play(every: number, days: number): { xp: number; best: number } {
    const p = createPlayer(RULES, 'farm', 1, 0, profileById('daily'), 4);
    for (let sp = 0; sp < 6; sp++) addCreature(p, sp);
    // Two creatures far behind the server's middle: the catch-up has something to work with.
    p.creatures.forEach((c, i) => {
      c.xp = i < 2 ? LEVEL_XP[18]! : LEVEL_XP[3]!;
      c.level = i < 2 ? 18 : 3;
      c.canEvolve = false;
      refreshCeiling(RULES, c);
    });
    p.lastVisit = 0;
    for (let h = 0; h < days * 24; h++) {
      const day = Math.floor(h / 24);
      if (h % 24 === 20 && day % every === 0) {
        setCatchUp(p, 18);
        p.lastVisit = h;
      }
      accrueIdleXp(p, awayShare(RULES, 'B', h - p.lastVisit), 1);
    }
    return {
      xp: p.creatures.reduce((n, c) => n + c.xp, 0),
      best: Math.max(...p.creatures.map((c) => c.level)),
    };
  }

  it('holds from one visit to the next, not for 24 hours', () => {
    const p = createPlayer(RULES, 'farm', 1, 0, profileById('daily'), 4);
    const c = addCreature(p, 0);
    c.level = 3;
    c.canEvolve = false;
    refreshCeiling(RULES, c);
    setCatchUp(p, 18);
    const top = RULES.bonfire.catchUp.maxMultiplier;
    expect(c.catchMult).toBe(top);
    const first = effectiveCatchUp(p, c);
    expect(first).toBe(top);
    // Three days on, nothing has refreshed it and it still holds (the creature is still far below the target).
    expect(effectiveCatchUp(p, c)).toBe(top);
  });

  it('never lifts a creature above the target it was fixed for, and fades as the creature closes the gap', () => {
    const p = createPlayer(RULES, 'farm', 1, 0, profileById('daily'), 4);
    const c = addCreature(p, 0);
    c.level = 3;
    c.canEvolve = false;
    refreshCeiling(RULES, c);
    setCatchUp(p, 18);
    c.level = 15;
    expect(effectiveCatchUp(p, c)).toBeCloseTo(
      1 + (RULES.bonfire.catchUp.maxMultiplier - 1) * (3 / 6),
      9,
    );
    c.level = 18;
    expect(effectiveCatchUp(p, c)).toBe(1);
    c.level = 25;
    expect(effectiveCatchUp(p, c)).toBe(1);
  });

  it('cannot be farmed: a player who skips days never out-grows one who visits daily', () => {
    const days = 60;
    const daily = play(1, days);
    for (const every of [2, 3, 5, 7]) {
      const skipper = play(every, days);
      expect(skipper.xp, `visiting every ${every} days`).toBeLessThanOrEqual(daily.xp + 1e-6);
      expect(skipper.best).toBeLessThanOrEqual(daily.best);
    }
  });
});

describe('where a set-and-forget scout starts', () => {
  it('goes to the place of the element of the best creature, then the next element', () => {
    const p = createPlayer(RULES, 'test', 1, 3, profileById('daily'), 4);
    const mire = addCreature(p, 30);
    addCreature(p, 0);
    addCreature(p, 8);
    mire.level = 9;
    p.creatures[1]!.level = 5;
    const id = (i: number): string => RULES.scouts.destinations[i]!.id;
    expect(id(defaultDestination(p))).toBe('sunken-fen');
    newSeat(p);
    expect(id(p.seats[0]!.dest)).toBe('sunken-fen');
    newSeat(p);
    expect(id(p.seats[1]!.dest)).toBe('tidepools');
    newSeat(p);
    expect(id(p.seats[2]!.dest)).toBe('ember-caves');
  });

  it('does not depend on the player id', () => {
    const dest = (playerId: number): number => {
      const p = createPlayer(RULES, 'test', 1, playerId, profileById('daily'), 4);
      addCreature(p, 17);
      return defaultDestination(p);
    };
    expect(dest(0)).toBe(dest(5));
  });

  it('crossroads shards spread over all five elements', () => {
    const p = createPlayer(RULES, 'test', 1, 0, profileById('daily'), 4);
    for (let sp = 0; sp < 3; sp++) addCreature(p, sp);
    newSeat(p);
    const crossroads = RULES.scouts.destinations.findIndex((d) => d.element === null);
    p.seats[0]!.dest = crossroads;
    p.seats[0]!.store = 72;
    collectSeat(p, 0, server(), 0);
    expect(p.shards).toHaveLength(5);
    for (const sh of p.shards) expect(sh).toBeGreaterThan(0);
    expect(new Set(p.shards.map((x) => x.toFixed(6))).size).toBe(1);
  });
});

describe('the dead flag', () => {
  it('needs 4 weeks of rising stock and a pile of 4 weeks of income', () => {
    const income = [10, 10, 10, 10, 10, 10, 10, 10];
    expect(deadFrom([10, 20, 30, 40, 50, 60, 70, 80], income, 4, 4)).toBe(1);
    // Rising, but the pile never reaches 4 weeks of income.
    expect(deadFrom([1, 2, 3, 4, 5, 6, 7, 8], income, 4, 4)).toBeNull();
    // A big pile that is not rising.
    expect(deadFrom([100, 90, 100, 90, 100, 90, 100, 90], income, 4, 4)).toBeNull();
    // Starts later: the pile appears in week 3.
    expect(deadFrom([5, 5, 5, 20, 30, 40, 50, 60], income, 4, 4)).toBe(3);
  });
});

describe('catch-up and fights (V-BON-2)', () => {
  it('multiplies fight XP only when the rule says so', () => {
    const xp = (appliesToFights: boolean): number => {
      const rules = {
        ...RULES,
        bonfire: { ...RULES.bonfire, catchUp: { ...RULES.bonfire.catchUp, appliesToFights } },
      };
      const p = createPlayer(rules, 'test', 1, 0, profileById('daily'), 4);
      const c = addCreature(p, 0);
      c.catchMult = 2;
      c.catchTarget = 30;
      fightXp(p, 100, 'xpDungeon', [c]);
      return c.xp;
    };
    expect(xp(false)).toBe(100);
    expect(xp(true)).toBe(200);
  });
});

describe('the species pool (content drops)', () => {
  const at = (week: number): number => speciesAvailable(RULES, (week - 1) * 168);

  it('starts at 34 and grows by 12 every 4 weeks from week 4', () => {
    expect([1, 3, 4, 7, 8, 12, 24].map(at)).toEqual([34, 34, 46, 46, 58, 70, 106]);
  });

  it('gives arrivals only from the species available that week', () => {
    const run = runServer({ ...ALL_SERVERS.find((s) => s.id === 'mixed8')!, weeks: 6 }, 3);
    for (const p of run.players)
      for (const w of p.weeks) {
        expect(w.available).toBe(at(w.week));
        expect(w.species).toBeLessThanOrEqual(w.available);
      }
    // Before the first drop nobody owns more than today's 34.
    for (const p of run.players) expect(p.weeks[2]?.species ?? 0).toBeLessThanOrEqual(34);
  });
});
