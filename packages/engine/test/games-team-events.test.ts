/**
 * The at-once team events (docs/design/valley-games.md): Bucket Brigade (`fill`), Crate Tower
 * (`stack`) and Kite Flight (`kite`). Every team plays at once in its own column, the favoured trait
 * wins more, the chaos reaches the neighbours, and the show is as long for 4 teams as for 16.
 */
import {
  createSeededRng,
  gamesEventDef,
  type Element,
  type GamesEventDef,
  type GamesEventOf,
  type Role,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  gamesAptitude,
  runGamesEvent,
  type GamesEntrant,
  type GamesEventResult,
} from '../src/index';

const ELEMENTS: Element[] = ['tide', 'ember', 'grove', 'spark', 'mire'];
const ROLES: Role[] = ['setter', 'payoff', 'support', 'guard'];

function event<K extends 'fill' | 'stack' | 'kite'>(id: string, kind: K): GamesEventOf<K> {
  const def = gamesEventDef(id);
  if (def?.kind !== kind) throw new Error(`no ${kind} event ${id}`);
  return def as GamesEventOf<K>;
}

const brigade = event('bucket-brigade', 'fill');
const tower = event('crate-tower', 'stack');
const kites = event('kite-flight', 'kite');

/** A plain member of team `team`; `over` sets what a test is about. */
function member(i: number, team: number, over: Partial<GamesEntrant> = {}): GamesEntrant {
  const p = `p${String(team)}`;
  return {
    id: `c${String(i)}`,
    playerId: p,
    teamId: p,
    name: `Critter ${String(i)}`,
    speciesId: 'splashet',
    element: 'grove',
    role: 'payoff',
    stage: 2,
    hp: 200,
    atk: 40,
    spd: 40,
    dodgeBp: 400,
    critBp: 500,
    critDmgBp: 5_000,
    ...over,
  };
}

function team(t: number, overs: Partial<GamesEntrant>[]): GamesEntrant[] {
  return overs.map((o, k) => member(t * 3 + k, t, o));
}

/** `teams` teams of three, their stats a little spread so a field is not all alike. */
function field(teams: number): GamesEntrant[] {
  return Array.from({ length: teams * 3 }, (_, i) =>
    member(i, Math.floor(i / 3), {
      element: ELEMENTS[i % 5] as Element,
      role: ROLES[i % 4] as Role,
      stage: i % 3 === 0 ? 1 : 2,
      hp: 150 + 13 * (i % 7),
      spd: 30 + 4 * (i % 6),
      dodgeBp: 300 + 40 * (i % 5),
    }),
  );
}

/** How often team 0 places ahead of team 1 in `runs` shows (a shared place counts half). */
function winsOf(
  def: GamesEventDef,
  entrants: readonly GamesEntrant[],
  runs: number,
  seed: string,
): number {
  let wins = 0;
  for (let k = 0; k < runs; k++) {
    const r = runGamesEvent(def, entrants, createSeededRng(`${seed}:${String(k)}`));
    const place = (id: string): number => r.standings.find((s) => s.teamId === id)?.place ?? 99;
    const a = place('p0');
    const b = place('p1');
    wins += a < b ? 1 : a === b ? 0.5 : 0;
  }
  return wins;
}

function props(r: GamesEventResult, name: string) {
  return r.beats.flatMap((b) => (b.k === 'prop' && b.p.startsWith(`${name}:`) ? [b] : []));
}

function says(r: GamesEventResult, line: string) {
  return r.beats.flatMap((b) => (b.k === 'say' && b.line === line ? [b] : []));
}

const teamOfActor = (r: GamesEventResult, a: number | undefined): string =>
  a === undefined ? '' : (r.actors[a]?.teamId ?? '');

describe('every team in its own column, one object each', () => {
  const cases = [
    [brigade, 'barrel'],
    [tower, 'tower'],
    [kites, 'kite'],
  ] as const;
  for (const [def, prop] of cases) {
    it(`${def.id}: ${prop}s side by side across the fixed scene, the members with theirs`, () => {
      const r = runGamesEvent(def, field(16), createSeededRng(`cols:${def.id}`));
      const firsts = new Map<string, number>();
      for (const b of props(r, prop)) if (!firsts.has(b.p)) firsts.set(b.p, b.x);
      expect(firsts.size).toBe(16);
      const xs = [...firsts.values()].sort((p, q) => p - q);
      expect(new Set(xs).size).toBe(16);
      expect(xs[0]).toBeGreaterThanOrEqual(8);
      expect(xs[xs.length - 1]).toBeLessThanOrEqual(184);
      // Every member starts in its own team's column (a few px either side).
      r.actors.forEach((actor, a) => {
        const i = Math.floor(a / 3);
        const x = firsts.get(`${prop}:${String(i)}`) as number;
        expect(Math.abs(actor.x - x)).toBeLessThanOrEqual(6);
      });
      // The camera never moves: everything stays inside the 192 px scene.
      for (const b of r.beats) {
        if (b.k === 'pos' || b.k === 'prop') {
          expect(b.x).toBeGreaterThanOrEqual(0);
          expect(b.x).toBeLessThanOrEqual(192);
        }
      }
    });
  }
});

describe('a fixed length, whatever the field', () => {
  for (const def of [brigade, tower, kites]) {
    it(`${def.id}: as long with 16 teams as with 4, and about 40 s`, () => {
      const length = (teams: number): number[] =>
        Array.from(
          { length: 8 },
          (_, k) =>
            runGamesEvent(def, field(teams), createSeededRng(`len:${def.id}:${String(k)}`)).ticks,
        );
      const at4 = length(4);
      const at16 = length(16);
      for (const t of [...at4, ...at16]) {
        // The play runs to the cap; only the closing line may come a gap after it.
        expect(t).toBeGreaterThan(def.maxTicks);
        expect(t).toBeLessThanOrEqual(def.maxTicks + 12);
      }
      const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
      expect(Math.abs(mean(at16) - mean(at4))).toBeLessThanOrEqual(3);
      expect((def.maxTicks * def.tickMs) / 1000).toBeGreaterThanOrEqual(35);
      expect((def.maxTicks * def.tickMs) / 1000).toBeLessThanOrEqual(45);
    });
  }
});

describe('Bucket Brigade (fill)', () => {
  it('Speed makes more trips: a quick team fills more than a slow one', () => {
    const entrants = [
      ...team(0, [{ spd: 70 }, { spd: 70 }, { spd: 70 }]),
      ...team(1, [{ spd: 25 }, { spd: 25 }, { spd: 25 }]),
    ];
    expect(winsOf(brigade, entrants, 30, 'quick')).toBeGreaterThanOrEqual(25);
  });

  it('Tide carries more: a Tide team beats an Ember team of the same stats', () => {
    const entrants = [
      ...team(0, [{ element: 'tide' }, { element: 'tide' }, { element: 'tide' }]),
      ...team(1, [{ element: 'mire' }, { element: 'mire' }, { element: 'mire' }]),
    ];
    expect(winsOf(brigade, entrants, 30, 'tide')).toBeGreaterThanOrEqual(22);
  });

  it('a member carries a full pail up and an empty one down (its meter), and the barrel only rises by pours', () => {
    const r = runGamesEvent(
      { ...brigade, params: { ...brigade.params, steamChanceBp: 0, splashChanceBp: 0 } },
      field(3),
      createSeededRng('pails'),
    );
    const meters = r.beats.flatMap((b) => (b.k === 'meter' && b.a === 0 ? [b.v] : []));
    expect(meters).toContain(100);
    expect(meters).toContain(0);
    const levels = props(r, 'barrel').filter((b) => b.p === 'barrel:0');
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]?.f ?? 0).toBeGreaterThanOrEqual(levels[i - 1]?.f ?? 0);
    }
    expect(levels[levels.length - 1]?.f ?? 0).toBeGreaterThan(0);
    // Everyone's score is the team's barrel, in percent.
    const last = levels[levels.length - 1]?.f;
    for (const a of [0, 1, 2]) expect(r.scores[a]).toBe(last);
  });

  it('a slip can splash into the next barrel (good for them), and an Ember pour steams a neighbour', () => {
    const def = {
      ...brigade,
      params: {
        ...brigade.params,
        slipChanceBp: 10_000,
        steadyBaseBp: 0,
        dodgeShareBp: 0,
        splashChanceBp: 10_000,
        steamChanceBp: 10_000,
      },
    };
    const entrants = field(4).map((e) => ({ ...e, element: 'ember' as const }));
    const r = runGamesEvent(def, entrants, createSeededRng('chaos'));
    const splashes = r.beats.filter((b) => b.k === 'fx' && b.fx === 'splash');
    const steams = r.beats.filter((b) => b.k === 'fx' && b.fx === 'steam');
    expect(splashes.length).toBeGreaterThan(0);
    expect(steams.length).toBeGreaterThan(0);
    for (const line of ['fill.splash', 'fill.steam']) {
      for (const b of says(r, line)) {
        expect(teamOfActor(r, b.a)).not.toBe(teamOfActor(r, b.b));
      }
    }
    // A barrel can go down (steam), never below empty or over full.
    for (const b of props(r, 'barrel')) {
      expect(b.f ?? 0).toBeGreaterThanOrEqual(0);
      expect(b.f ?? 0).toBeLessThanOrEqual(100);
    }
  });

  it('Supports help their teammates refill: a team with one fills more than one without', () => {
    const entrants = [...team(0, [{ role: 'support' }, {}, {}]), ...team(1, [{}, {}, {}])];
    const def = { ...brigade, roleBp: {} };
    expect(winsOf(def, entrants, 30, 'help')).toBeGreaterThanOrEqual(18);
  });
});

describe('Crate Tower (stack)', () => {
  it('Guards and HP hold the base: a sturdy team stands taller than a frail one', () => {
    const entrants = [
      ...team(0, [{ role: 'guard', hp: 320 }, { hp: 320 }, { hp: 320 }]),
      ...team(1, [{ hp: 120 }, { hp: 120 }, { hp: 120 }]),
    ];
    expect(winsOf(tower, entrants, 30, 'sturdy')).toBeGreaterThanOrEqual(24);
  });

  it('small creatures climb faster: with no wobble, a small team gets its crates up sooner', () => {
    const def = { ...tower, params: { ...tower.params, wobbleBaseBp: 0, wobblePerCrateBp: 0 } };
    const entrants = [
      ...team(0, [{ stage: 1 }, { stage: 1 }, { stage: 1 }]),
      ...team(1, [{ stage: 2 }, { stage: 2 }, { stage: 2 }]),
    ];
    expect(winsOf(def, entrants, 20, 'small')).toBeGreaterThanOrEqual(15);
  });

  it('Grove roots the tower: fewer topples than a team without', () => {
    const topples = (element: Element): number => {
      let n = 0;
      for (let k = 0; k < 20; k++) {
        const r = runGamesEvent(
          { ...tower, elementBp: { ...tower.elementBp, grove: 10_000, tide: 10_000 } },
          team(0, [{ element }, { element }, { element }]),
          createSeededRng(`root:${String(k)}`),
        );
        n +=
          says(r, 'stack.topple').length +
          r.beats.filter((b) => b.k === 'fx' && b.fx === 'bonk').length;
      }
      return n;
    };
    expect(topples('grove')).toBeLessThan(topples('tide'));
  });

  it('a toppling tower drops its top crates and may knock the neighbour’s top crate off', () => {
    const def = {
      ...tower,
      params: {
        ...tower.params,
        safeCrates: 1,
        wobbleBaseBp: 10_000,
        steadyBaseBp: 0,
        knockChanceBp: 10_000,
      },
    };
    const r = runGamesEvent(def, field(4), createSeededRng('topple'));
    expect(says(r, 'stack.topple').length + says(r, 'stack.knock').length).toBeGreaterThan(0);
    for (const b of says(r, 'stack.knock')) {
      expect(teamOfActor(r, b.a)).not.toBe(teamOfActor(r, b.b));
    }
    // Some tower got lower at least once, and none ever went below the ground or over the top.
    let fell = false;
    const last = new Map<string, number>();
    for (const b of props(r, 'tower')) {
      const f = b.f ?? 0;
      if (f < (last.get(b.p) ?? 0)) fell = true;
      last.set(b.p, f);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(def.params.maxCrates);
    }
    expect(fell).toBe(true);
  });

  it('ranks by height, then by who got there first', () => {
    const r = runGamesEvent(tower, field(8), createSeededRng('rank'));
    const scores = r.standings.map((s) => s.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i] ?? 0).toBeLessThanOrEqual(scores[i - 1] ?? 0);
    }
  });
});

describe('Kite Flight (kite)', () => {
  it('Speed lifts the kite: a quick team flies higher than a slow one', () => {
    const entrants = [
      ...team(0, [{ spd: 70 }, { spd: 70 }, { spd: 70 }]),
      ...team(1, [{ spd: 25 }, { spd: 25 }, { spd: 25 }]),
    ];
    expect(winsOf(kites, entrants, 30, 'quick')).toBeGreaterThanOrEqual(24);
  });

  it('Spark brings the wind: a Spark team flies higher than a Grove team of the same stats', () => {
    const def = { ...kites, params: { ...kites.params, boltChanceBp: 0 } };
    const entrants = [
      ...team(0, [{ element: 'spark' }, { element: 'spark' }, { element: 'spark' }]),
      ...team(1, [{ element: 'grove' }, { element: 'grove' }, { element: 'grove' }]),
    ];
    expect(winsOf(def, entrants, 30, 'spark')).toBeGreaterThanOrEqual(22);
  });

  it('an anchor holds the line in a gust: a Guard team dips less', () => {
    const def = {
      ...kites,
      params: { ...kites.params, gustChanceBp: 3_000, tangleChanceBp: 0, boltChanceBp: 0 },
    };
    const dips = (role: Role): number => {
      let n = 0;
      for (let k = 0; k < 20; k++) {
        const r = runGamesEvent(
          def,
          team(0, [{ role }, { role }, { role }]),
          createSeededRng(`gust:${String(k)}`),
        );
        n += says(r, 'kite.gust').length + props(r, 'kite').filter((b) => b.f === 1).length;
      }
      return n;
    };
    expect(dips('guard')).toBeLessThan(dips('payoff'));
  });

  it('lightning strikes the highest kite with a Spark crew, and neighbours tangle on a missed dodge', () => {
    const def = {
      ...kites,
      params: {
        ...kites.params,
        boltChanceBp: 10_000,
        tangleChanceBp: 10_000,
        tangleRangePx: 40,
        dodgeShareBp: 0,
      },
    };
    const entrants = field(6).map((e) => ({ ...e, mods: {} }));
    const r = runGamesEvent(def, entrants, createSeededRng('storm'));
    const zaps = r.beats.flatMap((b) =>
      b.k === 'fx' && b.fx === 'zap' && b.a !== undefined ? [b] : [],
    );
    expect(zaps.length).toBeGreaterThan(0);
    for (const z of zaps) expect(r.actors[z.a as number]?.element).toBe('spark');
    const tangles = says(r, 'kite.tangle');
    expect(r.beats.some((b) => b.k === 'fx' && b.fx === 'bonk')).toBe(true);
    for (const b of tangles) expect(teamOfActor(r, b.a)).not.toBe(teamOfActor(r, b.b));
  });

  it('the kites stay in the sky above their crews', () => {
    const r = runGamesEvent(kites, field(10), createSeededRng('sky'));
    for (const b of props(r, 'kite')) {
      expect(b.y).toBeGreaterThanOrEqual(84 - kites.params.maxHeightPx);
      expect(b.y).toBeLessThanOrEqual(84);
    }
  });
});

describe('aptitude reads what each event favours', () => {
  const base = member(0, 0);
  it('fill: Speed and Tide; stack: HP and a Guard; kite: Speed and Spark', () => {
    expect(gamesAptitude(brigade, { ...base, spd: 70 })).toBeGreaterThan(
      gamesAptitude(brigade, base),
    );
    expect(gamesAptitude(brigade, { ...base, element: 'tide' })).toBeGreaterThan(
      gamesAptitude(brigade, base),
    );
    expect(gamesAptitude(tower, { ...base, hp: 320 })).toBeGreaterThan(gamesAptitude(tower, base));
    expect(gamesAptitude(tower, { ...base, role: 'guard' })).toBeGreaterThan(
      gamesAptitude(tower, base),
    );
    expect(gamesAptitude(tower, { ...base, stage: 1 })).toBeGreaterThan(gamesAptitude(tower, base));
    expect(gamesAptitude(kites, { ...base, spd: 70 })).toBeGreaterThan(gamesAptitude(kites, base));
    expect(gamesAptitude(kites, { ...base, element: 'spark' })).toBeGreaterThan(
      gamesAptitude(kites, base),
    );
  });
});
