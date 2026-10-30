/** Collection sockets, gifts, the visit's order and where a set-and-forget scout starts. */
import { describe, expect, it } from 'vitest';
import { deadFrom } from '../src/analysis';
import { setCollectionFind } from '../src/collections';
import { RULES } from '../src/rules';
import { collectSeat } from '../src/scouts';
import { runAll } from '../src/scenarios';
import { defaultDestination, newSeat } from '../src/policy';
import { profileById } from '../src/profiles';
import { join, runServer, visit } from '../src/sim';
import { ALL_SERVERS } from '../src/servers';
import { addCreature, createPlayer, createServer, speciesAvailable } from '../src/world';
import { LEVEL_XP } from '../src/curves';
import { fightXp } from '../src/growth';
import { R } from '../src/types';

const options = {
  bossKills: 'half',
  communalSeats: true,
  gifts: 'acorns',
  essenceToProjects: false,
} as const;
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

describe('gifts', () => {
  const results = runAll(1, RULES, ['mixed8', 'mixed8-everything', 'mixed8-essence']);
  const given = (id: string, resource: number): number =>
    results[id]!.runs.flatMap((r) => r.players).reduce(
      (n, p) => n + (p.sources[`out:${resource}:gifts`] ?? 0),
      0,
    );

  it('give Acorns only by default', () => {
    expect(given('mixed8', R.acorns)).toBeGreaterThan(0);
    expect(given('mixed8', R.scrap)).toBe(0);
    expect(given('mixed8', R.shards)).toBe(0);
    expect(given('mixed8', R.essence)).toBe(0);
  });

  it('give scrap and shards too when everything counts, and Essence only in its variant', () => {
    expect(given('mixed8-everything', R.scrap)).toBeGreaterThan(0);
    expect(given('mixed8-everything', R.shards)).toBeGreaterThan(0);
    expect(given('mixed8-essence', R.essence)).toBeGreaterThan(0);
    expect(given('mixed8-essence', R.scrap)).toBe(0);
  });

  it('keep the shards a ribbon needs: the reserve is at least the dearest ribbon', () => {
    expect(RULES.forge.giveReserveShards).toBeGreaterThanOrEqual(
      Math.max(...RULES.xp.ribbons.map((r) => r.shards)),
    );
    expect(RULES.forge.giveReserveScrap).toBeGreaterThanOrEqual(
      Math.max(...RULES.xp.ribbons.map((r) => r.scrap)),
    );
  });
});

describe('a visit', () => {
  it('buys a ribbon before it gives, so a gift never takes what the ribbon needs', () => {
    // No reserve, plenty of gift budget and an open project: only the order keeps the shards for the ribbon.
    const rules = {
      ...RULES,
      forge: { ...RULES.forge, giveReserveShards: 0, giveReserveScrap: 0 },
    };
    const s = createServer('test', 1, { ...options, gifts: 'everything' }, rules);
    s.places[0]!.open = true;
    s.places[0]!.size = 1e9;
    const p = createPlayer(rules, 'test', 1, 0, profileById('daily'), 4);
    join(p, s, 0);
    const c = p.creatures[0]!;
    c.level = 10;
    c.xp = LEVEL_XP[11]!;
    c.canEvolve = false;
    const ribbon = rules.xp.ribbons[0]!;
    p.stock[R.scrap] = 20;
    p.shards[c.element] = ribbon.shards;
    p.stock[R.shards] = ribbon.shards;
    p.giftBudget.fill(1e6);
    visit(p, s, 20);
    expect(c.ribbons).toBe(1);
    expect(p.shards[c.element]).toBe(0);
    expect(p.wk.out[R.shards]).toBe(ribbon.shards);
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
      c.catchUntil = 100;
      fightXp(p, 100, 'xpDungeon', 50);
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
