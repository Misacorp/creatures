import {
  GAMES_SAY_KEYS,
  RULES,
  content,
  createSeededRng,
  gamesContent,
  gamesEventDef,
  type Element,
  type GamesEventDef,
  type Role,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  gamesAptitude,
  gamesEntrantFrom,
  runGamesEvent,
  sayGapTicks,
  type GamesEntrant,
  type GamesEventResult,
} from '../src/index';

const ELEMENTS: Element[] = ['tide', 'ember', 'grove', 'spark', 'mire'];
const ROLES: Role[] = ['setter', 'payoff', 'support', 'guard'];

/** A plain entrant; `i` spreads the stats a little so fields are not all alike. */
function entrant(i: number, over: Partial<GamesEntrant> = {}): GamesEntrant {
  const id = `c${String(i)}`;
  return {
    id,
    playerId: `p${String(i)}`,
    teamId: `p${String(i)}`,
    name: `Critter ${String(i)}`,
    speciesId: 'splashet',
    element: ELEMENTS[i % 5] as Element,
    role: ROLES[i % 4] as Role,
    stage: i % 3 === 0 ? 1 : 2,
    level: 5 + (i % 20),
    hp: 200 + 17 * (i % 13),
    atk: 40 + 7 * (i % 11),
    spd: 30 + 5 * (i % 9),
    dodgeBp: 300 + 50 * (i % 9),
    critBp: 500,
    critDmgBp: 5_000,
    ...over,
  };
}

/** `teams` players with three creatures each. */
function teamField(teams: number): GamesEntrant[] {
  return Array.from({ length: teams * 3 }, (_, i) => {
    const p = `p${String(Math.floor(i / 3))}`;
    return entrant(i, { playerId: p, teamId: p });
  });
}

function event(id: string): GamesEventDef {
  const def = gamesEventDef(id);
  if (def === undefined) throw new Error(`no event ${id}`);
  return def;
}

function fieldFor(def: GamesEventDef, n: number): GamesEntrant[] {
  return def.team === 3
    ? teamField(Math.max(1, Math.ceil(n / 3)))
    : Array.from({ length: n }, (_, i) => entrant(i));
}

function checkShape(
  def: GamesEventDef,
  entrants: readonly GamesEntrant[],
  r: GamesEventResult,
): void {
  const n = entrants.length;
  expect(r.eventId).toBe(def.id);
  expect(r.actors).toHaveLength(n);
  expect(r.scores).toHaveLength(n);
  expect(r.outAt).toHaveLength(n);
  // Beats sorted, inside the show, integers.
  let last = 0;
  const gap = sayGapTicks(def.tickMs);
  let lastSay = Number.NEGATIVE_INFINITY;
  const outs = new Map<number, number>();
  for (const b of r.beats) {
    expect(b.t).toBeGreaterThanOrEqual(last);
    expect(Number.isInteger(b.t)).toBe(true);
    expect(b.t).toBeLessThan(r.ticks);
    last = b.t;
    if ('a' in b && b.a !== undefined) {
      expect(b.a).toBeGreaterThanOrEqual(0);
      expect(b.a).toBeLessThan(n);
    }
    switch (b.k) {
      case 'pos':
        expect(Number.isInteger(b.x) && Number.isInteger(b.y)).toBe(true);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeLessThanOrEqual(112);
        if (def.kind !== 'chase') {
          expect(b.x).toBeGreaterThanOrEqual(0);
          expect(b.x).toBeLessThanOrEqual(192);
        }
        break;
      case 'meter':
        expect(b.v).toBeGreaterThanOrEqual(0);
        expect(b.v).toBeLessThanOrEqual(100);
        break;
      case 'say':
        expect(GAMES_SAY_KEYS[def.kind] as readonly string[]).toContain(b.line);
        expect(b.t - lastSay).toBeGreaterThanOrEqual(gap);
        lastSay = b.t;
        break;
      case 'out':
        outs.set(b.a, (outs.get(b.a) ?? 0) + 1);
        expect(r.outAt[b.a]).toBe(b.t);
        break;
      default:
        break;
    }
  }
  for (const v of outs.values()) expect(v).toBe(1);
  // The end crowns the standings' first place: every cheer is a winner's, every winner cheers last,
  // and the closing line names one of them (or calls a shared first place a draw).
  const firsts = r.standings.filter((s) => s.place === 1);
  const winners = firsts.flatMap((s) => s.actors).sort((a, b) => a - b);
  const cheered = [
    ...new Set(r.beats.flatMap((b) => (b.k === 'fx' && b.fx === 'cheer' ? [b.a as number] : []))),
  ].sort((a, b) => a - b);
  expect(cheered).toEqual(winners);
  for (const a of winners) {
    const states = r.beats.filter((b) => b.k === 'state' && b.a === a);
    expect(states[states.length - 1]).toMatchObject({ s: 'cheer' });
  }
  const says = r.beats.filter((b) => b.k === 'say');
  const closing = says[says.length - 1];
  if (firsts.length === 1) {
    expect(closing).toMatchObject({ line: `${def.kind}.win` });
    expect(winners).toContain(closing?.k === 'say' ? closing.a : -1);
  } else {
    expect(closing).toMatchObject({ line: `${def.kind}.draw` });
  }
  expect(r.outAt.filter((t) => t !== null)).toHaveLength(outs.size);
  // Standings: every actor once, competition places.
  const seen = r.standings.flatMap((s) => s.actors).sort((a, b) => a - b);
  expect(seen).toEqual(entrants.map((_, a) => a));
  expect(r.standings[0]?.place).toBe(1);
  r.standings.forEach((s, i) => {
    const prev = r.standings[i - 1];
    if (prev !== undefined) expect(s.place === prev.place || s.place === i + 1).toBe(true);
    for (const a of s.actors) expect(entrants[a]?.teamId).toBe(s.teamId);
  });
}

describe('runGamesEvent on every shipped event', () => {
  for (const def of gamesContent.events) {
    it(`${def.id}: one entrant, a full field and the most allowed all play to a valid show`, () => {
      const most = def.team === 3 ? RULES.games.maxTeamEntrants : RULES.games.maxEntrants;
      for (const n of [1, 9, most]) {
        const field = fieldFor(def, n);
        const r = runGamesEvent(def, field, createSeededRng(`${def.id}:${String(n)}`));
        checkShape(def, field, r);
      }
    });
  }

  it('is deterministic for a seed and differs for another', () => {
    const def = event('pepper-panic');
    const field = fieldFor(def, 12);
    const a = runGamesEvent(def, field, createSeededRng('same'));
    const b = runGamesEvent(def, field, createSeededRng('same'));
    const c = runGamesEvent(def, field, createSeededRng('other'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it('opens with the start line and keeps positions compact', () => {
    const def = event('sauna-showdown');
    const r = runGamesEvent(def, fieldFor(def, 10), createSeededRng('compact'));
    expect(r.beats.find((b) => b.k === 'say')).toMatchObject({ t: 0, line: 'endure.start' });
    // Sitters do not move until they walk out: no position beat repeats the one before it.
    const lastPos = new Map<number, string>();
    for (const b of r.beats) {
      if (b.k !== 'pos') continue;
      const key = `${String(b.x)},${String(b.y)}`;
      expect(lastPos.get(b.a)).not.toBe(key);
      lastPos.set(b.a, key);
    }
  });
});

describe('entrant checks', () => {
  const solo = event('melon-run');
  const team = event('sauna-stack');
  const play = (def: GamesEventDef, field: GamesEntrant[]) => () =>
    runGamesEvent(def, field, createSeededRng('check'));

  it('rejects an empty or an oversized field', () => {
    expect(play(solo, [])).toThrow(RangeError);
    expect(
      play(
        solo,
        Array.from({ length: RULES.games.maxEntrants + 1 }, (_, i) => entrant(i)),
      ),
    ).toThrow(/1 to 24/);
  });

  it('rejects duplicates, two creatures of a player in a solo event and oversized teams', () => {
    expect(play(solo, [entrant(1), entrant(1)])).toThrow(/duplicate/);
    expect(play(solo, [entrant(1), entrant(2, { playerId: 'p1', teamId: 'p1' })])).toThrow(/solo/);
    const four = Array.from({ length: 4 }, (_, i) => entrant(i, { playerId: 'p0', teamId: 'p0' }));
    expect(play(team, four)).toThrow(/more than 3/);
    expect(play(team, [entrant(1, { teamId: 't' }), entrant(2, { teamId: 't' })])).toThrow(
      /two players/,
    );
  });

  it('rejects bad numbers and ids', () => {
    expect(play(solo, [entrant(1, { hp: -1 })])).toThrow(/hp/);
    expect(play(solo, [entrant(1, { atk: 1.5 })])).toThrow(/atk/);
    expect(play(solo, [entrant(1, { mods: { stubborn: 2 as 1 } }), entrant(2)])).not.toThrow();
    expect(play(solo, [entrant(1, { mods: { echoBp: 20_000 } })])).toThrow(/mods/);
    expect(play(solo, [entrant(1, { id: 'bad id!' })])).toThrow(/ids/);
    expect(play(solo, [entrant(1, { element: 'fire' as Element })])).toThrow(/element/);
  });
});

/** Plays `def` `runs` times and counts how often `who` is placed first. */
function winsOf(
  def: GamesEventDef,
  field: GamesEntrant[],
  who: number,
  runs: number,
  seed: string,
): number {
  let wins = 0;
  for (let k = 0; k < runs; k++) {
    const r = runGamesEvent(def, field, createSeededRng(`${seed}:${String(k)}`));
    if (r.standings.find((s) => s.actors.includes(who))?.place === 1) wins += 1;
  }
  return wins;
}

describe('what each kind reads', () => {
  const twin = (over: Partial<GamesEntrant>, i: number): GamesEntrant =>
    entrant(i, {
      stage: 2,
      role: 'setter',
      element: 'spark',
      hp: 250,
      atk: 60,
      spd: 50,
      dodgeBp: 500,
      ...over,
    });
  const twins = (a: Partial<GamesEntrant>, b: Partial<GamesEntrant>): GamesEntrant[] => [
    twin(a, 0),
    twin(b, 1),
  ];

  it('endure: the sauna favours Ember and HP', () => {
    const def = event('sauna-showdown');
    expect(
      winsOf(def, twins({ element: 'ember' }, { element: 'grove' }), 0, 40, 'ember'),
    ).toBeGreaterThanOrEqual(30);
    expect(winsOf(def, twins({ hp: 400 }, { hp: 250 }), 0, 40, 'hp')).toBeGreaterThanOrEqual(30);
  });

  it('endure: the Frost Bath flips it, Tide over Ember', () => {
    const def = event('frost-bath');
    expect(
      winsOf(def, twins({ element: 'tide' }, { element: 'ember' }), 0, 40, 'frost'),
    ).toBeGreaterThanOrEqual(30);
  });

  it('chase and swim favour Speed; shove favours Attack', () => {
    expect(
      winsOf(event('melon-run'), twins({ spd: 90 }, { spd: 45 }), 0, 40, 'run'),
    ).toBeGreaterThanOrEqual(30);
    expect(
      winsOf(event('shark-derby'), twins({ spd: 90 }, { spd: 45 }), 0, 40, 'swim'),
    ).toBeGreaterThanOrEqual(28);
    expect(
      winsOf(event('floe-sumo'), twins({ atk: 150 }, { atk: 40 }), 0, 40, 'shove'),
    ).toBeGreaterThanOrEqual(26);
  });

  it('feast: crits are double gulps', () => {
    const def = event('pepper-panic');
    const r = runGamesEvent(
      def,
      [entrant(0, { critBp: 10_000 }), entrant(1, { critBp: 0 })],
      createSeededRng('gulp'),
    );
    const gulps = r.beats.filter((b) => b.k === 'fx' && b.fx === 'gulp');
    expect(gulps.length).toBeGreaterThan(0);
    expect(gulps.every((b) => b.k === 'fx' && b.a === 0)).toBe(true);
    expect(r.scores[0]).toBeGreaterThan(r.scores[1] as number);
  });

  it('feast: the last one eating eats on, so outlasting everyone wins', () => {
    const def = event('pepper-panic');
    for (let k = 0; k < 10; k++) {
      const field = [0, 1, 2, 3, 4].map((i) => entrant(i, { critBp: 0 }));
      const r = runGamesEvent(def, field, createSeededRng(`encore:${String(k)}`));
      const top = r.standings[0]?.actors[0] as number;
      const lastOut = Math.max(...r.outAt.map((t) => t ?? Number.POSITIVE_INFINITY));
      expect(r.outAt[top] ?? Number.POSITIVE_INFINITY).toBe(lastOut);
    }
  });

  it('size: an event with smallBp favours stage-1 creatures (Floe Sumo grip)', () => {
    const def = event('floe-sumo');
    expect(def.smallBp ?? 10_000).toBeGreaterThan(10_000);
    const field = [0, 1, 2, 3, 4, 5].map((i) =>
      twin({ stage: i % 2 === 0 ? 1 : 2, dodgeBp: 0 }, i),
    );
    let small = 0;
    for (let k = 0; k < 40; k++) {
      const r = runGamesEvent(def, field, createSeededRng(`size:${String(k)}`));
      const top = r.standings[0]?.actors[0] as number;
      if (field[top]?.stage === 1) small += 1;
    }
    expect(small).toBeGreaterThanOrEqual(28);
  });

  it('chase: a small creature ducks under the rind once; a big one does not', () => {
    const def = event('melon-run');
    const small = runGamesEvent(def, [entrant(0, { stage: 1 })], createSeededRng('duck'));
    const big = runGamesEvent(def, [entrant(0, { stage: 2 })], createSeededRng('duck'));
    const ducks = (r: GamesEventResult) =>
      r.beats.filter((b) => b.k === 'fx' && b.fx === 'duck').length;
    expect(ducks(small)).toBe(1);
    expect(ducks(big)).toBe(0);
    expect(small.scores[0]).toBeGreaterThan(big.scores[0] as number);
  });

  it('Stubborn survives one elimination, once', () => {
    for (const id of ['sauna-showdown', 'pepper-panic', 'melon-run']) {
      const def = event(id);
      const plain = runGamesEvent(def, [entrant(0, { stage: 2 })], createSeededRng(`stub:${id}`));
      const stub = runGamesEvent(
        def,
        [entrant(0, { stage: 2, mods: { stubborn: 1 } })],
        createSeededRng(`stub:${id}`),
      );
      const stars = stub.beats.filter((b) => b.k === 'fx' && b.fx === 'star').length;
      expect(stars, id).toBe(1);
      expect(stub.scores[0], id).toBeGreaterThan(plain.scores[0] as number);
    }
  });

  it('team events rank teams by their best member (Sauna Stack)', () => {
    const def = event('sauna-stack');
    const field = teamField(4);
    const r = runGamesEvent(def, field, createSeededRng('stack'));
    expect(r.standings).toHaveLength(4);
    for (const s of r.standings) {
      expect(s.actors).toHaveLength(3);
      expect(s.score).toBe(Math.max(...s.actors.map((a) => r.scores[a] as number)));
    }
  });

  it('team events with teamScore "sum" add the members up (Shark Relay)', () => {
    const def = event('shark-relay');
    const r = runGamesEvent(def, teamField(3), createSeededRng('relay'));
    for (const s of r.standings) {
      expect(s.score).toBe(s.actors.reduce((n, a) => n + (r.scores[a] as number), 0));
    }
  });
});

describe('gamesEntrantFrom and gamesAptitude', () => {
  const species = content.creatures.find((c) => c.id === 'splashet');
  if (species === undefined) throw new Error('no splashet');

  it('maps a folded creature: dodge from Speed and flat dodge, crit from luck, only the Games lines', () => {
    const e = gamesEntrantFrom({
      id: 'u1/splashet',
      playerId: 'u1',
      name: 'Splashet',
      species,
      level: 7,
      stats: { hp: 300, atk: 50, spd: 40 },
      crit: { chanceBp: 1_000, damageBp: 2_000 },
      mods: { dodgeBp: 200, stubborn: 1, echoBp: 0, sidestepBp: 700 },
    });
    expect(e).toMatchObject({
      teamId: 'u1',
      element: 'tide',
      role: 'setter',
      stage: 1,
      hp: 300,
      dodgeBp: 40 * RULES.combat.dodge.perSpeedBp + 200,
      critBp: RULES.combat.luck.critChanceBp + 1_000,
      critDmgBp: RULES.combat.luck.critBp + 2_000,
      mods: { stubborn: 1, sidestepBp: 700 },
    });
    expect(e.mods).not.toHaveProperty('echoBp');
    expect(e).not.toHaveProperty('shiny');
  });

  it('rises with the stat the kind reads and with its element and size', () => {
    const sauna = event('sauna-showdown');
    const run = event('melon-run');
    const base = entrant(1, { element: 'spark', stage: 2 });
    expect(gamesAptitude(sauna, { ...base, hp: 500 })).toBeGreaterThan(gamesAptitude(sauna, base));
    expect(gamesAptitude(sauna, { ...base, element: 'ember' })).toBeGreaterThan(
      gamesAptitude(sauna, base),
    );
    expect(gamesAptitude(run, { ...base, spd: 90 })).toBeGreaterThan(gamesAptitude(run, base));
    expect(gamesAptitude(run, { ...base, stage: 1 })).toBeGreaterThan(gamesAptitude(run, base));
    expect(gamesAptitude(run, base)).toBe(gamesAptitude(run, { ...base }));
  });
});
