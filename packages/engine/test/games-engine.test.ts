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
  HAUL_OFFSETS,
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
        if (def.kind !== 'chase' && def.kind !== 'haul') {
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
  const team = event('log-carry');
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

  /** A weak creature (actor 0) among two strong ones, so it is the first to go. */
  const underdog = (over: Partial<GamesEntrant>): GamesEntrant[] => [
    twin({ hp: 150, spd: 25, atk: 30, dodgeBp: 0, ...over }, 0),
    twin({ hp: 500, spd: 90, atk: 120, dodgeBp: 0 }, 1),
    twin({ hp: 500, spd: 90, atk: 120, dodgeBp: 0 }, 2),
  ];
  const fxOn = (r: GamesEventResult, fx: string, a: number): number =>
    r.beats.filter((b) => b.k === 'fx' && b.fx === fx && b.a === a).length;

  it('chase: a small creature ducks under the rind once; a big one does not', () => {
    // A far finish line, so the melon catches everyone in the end.
    const run = event('melon-run');
    if (run.kind !== 'chase') throw new Error('melon-run is a chase');
    const def: GamesEventDef = { ...run, params: { ...run.params, finishPx: 2_000 } };
    // Everyone else is small too, so the size bonus does not make the underdog fast.
    const field = (stage: 1 | 2): GamesEntrant[] =>
      underdog({ stage }).map((e, i) => (i === 0 ? e : { ...e, stage: 1 as const }));
    const small = runGamesEvent(def, field(1), createSeededRng('duck'));
    const big = runGamesEvent(def, field(2), createSeededRng('duck'));
    expect(fxOn(small, 'duck', 0)).toBe(1);
    expect(fxOn(big, 'duck', 0)).toBe(0);
  });

  it('chase: runners over the finish line are safe and rank by finish order', () => {
    const def = event('melon-run');
    const field = [0, 1, 2, 3, 4, 5].map((i) => twin({ spd: i < 2 ? 140 : 30, dodgeBp: 0 }, i));
    const r = runGamesEvent(def, field, createSeededRng('finish'));
    // The two fast ones finish (never squashed) and take the first two places.
    expect(r.outAt[0]).toBeNull();
    expect(r.outAt[1]).toBeNull();
    expect(
      r.standings
        .slice(0, 2)
        .flatMap((s) => s.actors)
        .sort(),
    ).toEqual([0, 1]);
    expect(r.beats.some((b) => b.k === 'say' && b.line === 'chase.smash')).toBe(true);
  });

  it('Stubborn survives one elimination, once', () => {
    for (const id of ['sauna-showdown', 'pepper-panic', 'melon-run']) {
      const def = event(id);
      const plain = runGamesEvent(def, underdog({}), createSeededRng(`stub:${id}`));
      const stub = runGamesEvent(
        def,
        underdog({ mods: { stubborn: 1 } }),
        createSeededRng(`stub:${id}`),
      );
      expect(fxOn(stub, 'star', 0), id).toBe(1);
      expect(stub.scores[0], id).toBeGreaterThan(plain.scores[0] as number);
    }
  });

  it('one or two entrants make a short show (about 25 s at most)', () => {
    for (const def of gamesContent.events) {
      const r = runGamesEvent(
        def,
        fieldFor(def, def.team === 3 ? 3 : 1).slice(0, 2),
        createSeededRng('short'),
      );
      // The cap plus the walk-off and the closing line.
      expect((r.ticks * r.tickMs) / 1_000, def.id).toBeLessThanOrEqual(25 + 8);
    }
  });

  it('Floe Sumo: a big field gets a bigger floe', () => {
    const def = event('floe-sumo');
    const floe = (n: number): number => {
      const r = runGamesEvent(def, fieldFor(def, n), createSeededRng('floe'));
      const first = r.beats.find((b) => b.k === 'prop' && b.p === 'floe');
      return first?.k === 'prop' ? (first.f ?? 0) : 0;
    };
    expect(floe(24)).toBeGreaterThan(floe(12));
    expect(floe(24)).toBeLessThanOrEqual(84);
  });

  it('team events rank teams by their best member (Log Carry: a team shares one score)', () => {
    const def = event('log-carry');
    const field = teamField(4);
    const r = runGamesEvent(def, field, createSeededRng('teams'));
    expect(r.standings).toHaveLength(4);
    for (const s of r.standings) {
      expect(s.actors).toHaveLength(3);
      expect(s.score).toBe(Math.max(...s.actors.map((a) => r.scores[a] as number)));
      expect(new Set(s.actors.map((a) => r.scores[a]))).toHaveProperty('size', 1);
    }
  });

  it('team events with teamScore "sum" add the members up', () => {
    const def: GamesEventDef = { ...event('log-carry'), teamScore: 'sum' };
    const r = runGamesEvent(def, teamField(3), createSeededRng('sum'));
    for (const s of r.standings) {
      expect(s.score).toBe(s.actors.reduce((n, a) => n + (r.scores[a] as number), 0));
    }
  });
});

describe('haul (Log Carry, Pumpkin Push)', () => {
  const carry = event('log-carry');
  const push = event('pumpkin-push');
  if (carry.kind !== 'haul' || push.kind !== 'haul') throw new Error('haul events');
  const member = (i: number, team: number, over: Partial<GamesEntrant> = {}): GamesEntrant =>
    entrant(i, {
      playerId: `p${String(team)}`,
      teamId: `p${String(team)}`,
      stage: 2,
      role: 'payoff',
      element: 'tide',
      hp: 250,
      atk: 60,
      spd: 60,
      dodgeBp: 500,
      ...over,
    });
  const teamOf = (team: number, overs: Partial<GamesEntrant>[]): GamesEntrant[] =>
    overs.map((o, k) => member(team * 3 + k, team, o));
  const propsOf = (r: GamesEventResult, name: string) =>
    r.beats.filter((b) => b.k === 'prop' && b.p.startsWith(`${name}:`));

  it('a team is one lane: its members in a tight group under the log or behind the pumpkin', () => {
    for (const def of [carry, push]) {
      const r = runGamesEvent(def, teamField(5), createSeededRng(`lane:${def.id}`));
      const lanes = new Set<number>();
      for (let t = 0; t < 5; t++) {
        const team = [0, 1, 2].map((k) => r.actors[3 * t + k] as (typeof r.actors)[number]);
        expect(new Set(team.map((a) => a.y)).size).toBe(1);
        lanes.add(team[0]?.y as number);
        const xs = team.map((a) => a.x).sort((p, q) => p - q);
        const want = [...(HAUL_OFFSETS[def.params.mode][3] ?? [])].sort((p, q) => p - q);
        expect(xs.map((x) => x - (xs[0] as number))).toEqual(
          want.map((dx) => dx - (want[0] as number)),
        );
      }
      expect(lanes.size).toBe(5);
      for (const y of lanes) {
        expect(y).toBeGreaterThanOrEqual(48);
        expect(y).toBeLessThanOrEqual(100);
      }
      const name = def.params.mode === 'carry' ? 'log' : 'pumpkin';
      const ids = new Set(propsOf(r, name).map((b) => (b.k === 'prop' ? b.p : '')));
      expect(ids.size).toBe(5);
    }
  });

  it('members move together: every position keeps the formation around the load', () => {
    const r = runGamesEvent(carry, teamField(3), createSeededRng('together'));
    const at = new Map<string, number>();
    for (const b of r.beats) {
      if (b.k === 'prop' && b.p.startsWith('log:')) at.set(`${b.p}@${String(b.t)}`, b.x);
    }
    for (const b of r.beats) {
      if (b.k !== 'pos') continue;
      const team = Math.floor(b.a / 3);
      const x = at.get(`log:${String(team)}@${String(b.t)}`);
      if (x === undefined) continue;
      expect(Math.abs(b.x - x)).toBeLessThanOrEqual(9);
    }
  });

  it('carry: the slowest member counts most, so a matched team beats a lopsided one', () => {
    const field = [
      ...teamOf(0, [{ spd: 60 }, { spd: 60 }, { spd: 60 }]),
      ...teamOf(1, [{ spd: 95 }, { spd: 95 }, { spd: 15 }]),
    ];
    expect(winsOf(carry, field, 0, 40, 'matched')).toBeGreaterThanOrEqual(26);
  });

  it('push: Attack adds up, so a strong team pushes faster than a weak one', () => {
    const field = [
      ...teamOf(0, [{ atk: 140 }, { atk: 120 }, { atk: 120 }]),
      ...teamOf(1, [{ atk: 40 }, { atk: 40 }, { atk: 40 }]),
    ];
    expect(winsOf(push, field, 0, 40, 'push')).toBeGreaterThanOrEqual(26);
  });

  it('Guards steady the load: fewer drops than a team without', () => {
    const drops = (role: 'guard' | 'payoff'): number => {
      let n = 0;
      for (let k = 0; k < 30; k++) {
        const r = runGamesEvent(
          carry,
          teamOf(0, [{ role }, { role }, { role }]),
          createSeededRng(`steady:${String(k)}`),
        );
        n += r.beats.filter((b) => b.k === 'fx' && b.fx === 'stumble').length;
      }
      return n;
    };
    expect(drops('guard')).toBeLessThan(drops('payoff'));
  });

  it('Stubborn catches the falling log once', () => {
    let caught = 0;
    for (let k = 0; k < 20; k++) {
      const r = runGamesEvent(
        { ...carry, params: { ...carry.params, wobbleChanceBp: 3_000, steadyBaseBp: 0 } },
        teamOf(0, [{ mods: { stubborn: 1 }, dodgeBp: 0 }, { dodgeBp: 0 }, { dodgeBp: 0 }]),
        createSeededRng(`catch:${String(k)}`),
      );
      // A catch is a star on its own, not the one at the finish (with the cheer).
      const cheerAt = new Set(
        r.beats.flatMap((b) => (b.k === 'state' && b.a === 0 && b.s === 'cheer' ? [b.t] : [])),
      );
      const catches = r.beats.filter(
        (b) => b.k === 'fx' && b.fx === 'star' && b.a === 0 && !cheerAt.has(b.t),
      );
      expect(catches.length).toBeLessThanOrEqual(1);
      caught += catches.length;
    }
    expect(caught).toBeGreaterThan(0);
  });

  it('a drop can bump the team in the next lane', () => {
    const def = {
      ...carry,
      params: { ...carry.params, wobbleChanceBp: 2_000, bumpChanceBp: 10_000 },
    };
    const r = runGamesEvent(def, teamField(6), createSeededRng('bump'));
    // A bump is a bonk on a creature (a drop's own bonk is on the load); its team stands still.
    const bumps = r.beats.filter((b) => b.k === 'fx' && b.fx === 'bonk' && b.a !== undefined);
    expect(bumps.length).toBeGreaterThan(0);
    const said = r.beats.filter((b) => b.k === 'say' && b.line === 'haul.bump');
    for (const b of said) {
      if (b.k !== 'say') continue;
      expect(Math.floor((b.a as number) / 3)).not.toBe(Math.floor((b.b as number) / 3));
    }
  });

  it('the race ends a grace after the first team is over the line, whatever the field', () => {
    for (const base of [carry, push]) {
      // A short course, so someone surely finishes.
      const def = { ...base, params: { ...base.params, finishPx: 140 } };
      const r = runGamesEvent(def, teamField(8), createSeededRng(`grace:${def.id}`));
      const first = r.beats.find((b) => b.k === 'say' && b.line === 'haul.finish');
      const stars = r.beats.filter((b) => b.k === 'fx' && b.fx === 'star');
      expect(first).toBeDefined();
      const lastMove = Math.max(...r.beats.filter((b) => b.k === 'pos').map((b) => b.t));
      expect(lastMove - (first?.t ?? 0)).toBeLessThanOrEqual(def.params.graceTicks);
      expect(stars.length).toBeGreaterThan(0);
      expect(r.standings[0]?.score).toBeGreaterThan(
        r.standings[r.standings.length - 1]?.score ?? 0,
      );
    }
  });

  it('more teams do not make a longer show', () => {
    for (const def of [carry, push]) {
      const mean = (teams: number): number => {
        let ticks = 0;
        for (let k = 0; k < 20; k++) {
          ticks += runGamesEvent(def, teamField(teams), createSeededRng(`len:${String(k)}`)).ticks;
        }
        return ticks / 20;
      };
      expect(mean(16)).toBeLessThanOrEqual(mean(4) * 1.1);
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
