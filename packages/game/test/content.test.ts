import { describe, expect, it } from 'vitest';
import {
  CHART_STRONG_BP,
  RULES,
  abilitiesFor,
  chartBp,
  joinNames,
  resists,
  strongAgainst,
  strongOver,
  weakAgainst,
  type Element,
  appliedEffect,
  basicAbilities,
  content,
  loadContent,
  upgradeProblem,
  dungeonContent,
  expeditionContent,
  PATTERN_OPS,
  bossAtRank,
  type ContentPack,
  type Gimmick,
} from '../src/index';
import creaturesJson from '../src/content/data/creatures.json';
import elementsJson from '../src/content/data/elements.json';
import elementChartJson from '../src/content/data/element-chart.json';
import reactionsJson from '../src/content/data/reactions.json';
import bossesJson from '../src/content/data/bosses.json';
import adaptationsJson from '../src/content/data/adaptations.json';
import finaleAbilitiesJson from '../src/content/data/finale-abilities.json';
import statusEffectsJson from '../src/content/data/status-effects.json';
import guestsJson from '../src/content/data/guests.json';

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function clone(): ContentPack {
  return deepClone({
    version: 1,
    elements: elementsJson,
    elementChart: elementChartJson,
    creatures: creaturesJson,
    reactions: reactionsJson,
    bosses: bossesJson,
    adaptations: adaptationsJson,
    statusEffects: statusEffectsJson,
    finaleAbilities: finaleAbilitiesJson,
    guests: guestsJson,
  }) as ContentPack;
}

function mutate(fn: (pack: ContentPack) => void): unknown {
  const pack = clone();
  fn(pack);
  return pack;
}

function creature(pack: ContentPack, id: string) {
  const c = pack.creatures.find((x) => x.id === id);
  if (!c) throw new Error(`missing ${id}`);
  return c;
}

describe('shipped content', () => {
  it('loads', () => {
    expect(() => loadContent(clone())).not.toThrow();
    expect(content.creatures).toHaveLength(34);
  });

  it('has 14 catchable species and 3 common starters of different elements', () => {
    expect(content.creatures.filter((c) => c.catchable)).toHaveLength(14);
    const starters = content.creatures.filter((c) => c.starter).map((c) => c.id);
    expect(starters.sort()).toEqual(['cindle', 'splashet', 'sproutle']);
  });

  it('matches the roster table in the design doc', () => {
    const evolutions = Object.fromEntries(
      content.creatures.filter((c) => c.evolvesTo).map((c) => [c.id, c.evolvesTo?.species]),
    );
    expect(evolutions).toEqual({
      splashet: 'tidewing',
      cindle: 'pyrelynx',
      sproutle: 'thornbuck',
      zipmouse: 'voltaro',
      mistnewt: 'fogwyrm',
      ashmole: 'magmole',
      stormray: 'tempestray',
      mossback: 'ancientshell',
      mudlump: 'bogwarden',
      squelch: 'croakmire',
    });
    const meta = (id: string) => {
      const c = creature(content, id);
      return `${c.element}/${c.rarity}`;
    };
    expect(meta('zipmouse')).toBe('spark/common');
    expect(meta('mistnewt')).toBe('tide/common');
    expect(meta('ashmole')).toBe('ember/common');
    expect(meta('stormray')).toBe('spark/rare');
    expect(meta('mossback')).toBe('grove/rare');
    expect(meta('coralynx')).toBe('tide/rare');
    expect(meta('solmane')).toBe('ember/epic');
    expect(meta('gaiadrake')).toBe('grove/epic');
    expect(meta('aurorix')).toBe('spark/epic');
  });

  it('has level caps of 15 for evolving stage 1 and 30 otherwise', () => {
    for (const c of content.creatures) {
      expect(c.levelCap).toBe(c.stage === 1 && c.evolvesTo ? 15 : 30);
    }
  });

  it('gives every element a setter and a payoff', () => {
    for (const element of ['tide', 'ember', 'grove', 'spark']) {
      const roles = content.creatures
        .filter((c) => c.element === element && c.stage === 1)
        .map((c) => c.role);
      expect(roles).toContain('setter');
      expect(roles).toContain('payoff');
    }
  });

  it('scales stats by rarity and stage', () => {
    const total = (id: string) => {
      const s = creature(content, id).baseStats;
      return s.hp + s.atk + s.spd;
    };
    // Compare same-role creatures: common < rare < epic at stage 1.
    expect(total('zipmouse')).toBeLessThan(total('mossback')); // setters
    expect(total('mossback')).toBeLessThan(total('solmane'));
    expect(total('splashet')).toBeLessThan(total('voltaro')); // stage 2 is stronger
    expect(total('voltaro')).toBeGreaterThan(total('zipmouse') * 1.35);
  });

  it('grows about 3x from level 1 to level 30', () => {
    for (const c of content.creatures.filter((x) => x.levelCap === 30)) {
      for (const stat of ['hp', 'atk', 'spd'] as const) {
        const ratio = (c.baseStats[stat] + c.growth[stat] * 29) / c.baseStats[stat];
        expect(ratio).toBeGreaterThan(2.3);
        expect(ratio).toBeLessThan(3.8);
      }
    }
  });
});

describe('loadContent rejects invalid content', () => {
  it('non-objects and unknown keys', () => {
    expect(() => loadContent(null)).toThrow(/schema/);
    expect(() => loadContent({ ...clone(), extra: 1 })).toThrow(/schema/);
    expect(() =>
      loadContent(mutate((p) => Object.assign(creature(p, 'zipmouse'), { surprise: true }))),
    ).toThrow(/schema/);
  });

  it('bad field values', () => {
    expect(() => loadContent(mutate((p) => (creature(p, 'zipmouse').id = 'Zip Mouse')))).toThrow();
    expect(() => loadContent(mutate((p) => (creature(p, 'zipmouse').baseStats.hp = 0)))).toThrow(
      /schema/,
    );
    expect(() => loadContent(mutate((p) => (creature(p, 'zipmouse').growth.atk = -1)))).toThrow(
      /schema/,
    );
    expect(() => loadContent(mutate((p) => (creature(p, 'zipmouse').growth.atk = 1.5)))).toThrow(
      /schema/,
    );
    expect(() =>
      loadContent(
        mutate((p) => ((creature(p, 'zipmouse') as { rarity: string }).rarity = 'mythic')),
      ),
    ).toThrow(/schema/);
  });

  it('duplicate ids', () => {
    expect(() =>
      loadContent(
        mutate((p) => {
          p.creatures.push(deepClone(creature(p, 'coralynx')));
        }),
      ),
    ).toThrow(/duplicate creature id/);
  });

  it('evolvesTo pointing at a missing species', () => {
    expect(() =>
      loadContent(
        mutate((p) => {
          const e = creature(p, 'zipmouse').evolvesTo;
          if (e) e.species = 'nothing';
        }),
      ),
    ).toThrow(/unknown species/);
  });

  it('evolvesTo pointing at a stage-1 species', () => {
    expect(() =>
      loadContent(
        mutate((p) => {
          const e = creature(p, 'zipmouse').evolvesTo;
          if (e) e.species = 'coralynx';
        }),
      ),
    ).toThrow(/stage-2/);
  });

  it('evolvesTo into another line, element or rarity', () => {
    expect(() =>
      loadContent(
        mutate((p) => {
          const e = creature(p, 'zipmouse').evolvesTo;
          if (e) e.species = 'tidewing';
        }),
      ),
    ).toThrow(/own line/);
    expect(() => loadContent(mutate((p) => (creature(p, 'voltaro').element = 'tide')))).toThrow(
      /same element/,
    );
    expect(() => loadContent(mutate((p) => (creature(p, 'voltaro').rarity = 'rare')))).toThrow(
      /same rarity/,
    );
  });

  it('evolution level above the level cap', () => {
    expect(() =>
      loadContent(
        mutate((p) => {
          const e = creature(p, 'zipmouse').evolvesTo;
          if (e) e.level = 20;
        }),
      ),
    ).toThrow(/level cap/);
  });

  it('catchable or starter stage-2 species', () => {
    expect(() => loadContent(mutate((p) => (creature(p, 'voltaro').catchable = true)))).toThrow(
      /must not be catchable/,
    );
    expect(() => loadContent(mutate((p) => (creature(p, 'voltaro').starter = true)))).toThrow(
      /must not be a starter/,
    );
  });

  it('stage-2 species that nothing evolves into', () => {
    expect(() =>
      loadContent(
        mutate((p) => {
          delete creature(p, 'zipmouse').evolvesTo;
          delete creature(p, 'zipmouse').altEvolvesTo;
        }),
      ),
    ).toThrow(/exactly one/);
    // A second branch needs a first.
    expect(() => loadContent(mutate((p) => delete creature(p, 'zipmouse').evolvesTo))).toThrow(
      /second branch but no first/,
    );
  });

  it('wrong starters', () => {
    expect(() => loadContent(mutate((p) => (creature(p, 'zipmouse').starter = true)))).toThrow(
      /exactly 3 starters/,
    );
    expect(() => loadContent(mutate((p) => (creature(p, 'cindle').starter = false)))).toThrow(
      /exactly 3 starters/,
    );
    expect(() =>
      loadContent(
        mutate((p) => {
          creature(p, 'cindle').starter = false;
          creature(p, 'coralynx').starter = true;
        }),
      ),
    ).toThrow(/common, catchable, stage-1/);
    expect(() =>
      loadContent(
        mutate((p) => {
          creature(p, 'cindle').starter = false;
          creature(p, 'mistnewt').starter = true; // tide, same as splashet
        }),
      ),
    ).toThrow(/different elements/);
  });

  it('a line without a stage-1 species or with two', () => {
    expect(() =>
      loadContent(
        mutate((p) => {
          p.creatures.push({ ...deepClone(creature(p, 'coralynx')), id: 'coralynx-two' });
        }),
      ),
    ).toThrow(/exactly one stage-1/);
    expect(() => loadContent(mutate((p) => (creature(p, 'voltaro').line = 'orphan')))).toThrow(
      /line/,
    );
  });

  it('a broken element chart', () => {
    // A pair against itself, a pair listed twice, and a neutral pair written out.
    expect(() =>
      loadContent(
        mutate((p) => p.elementChart.push({ attacker: 'tide', defender: 'tide', bp: 15_000 })),
      ),
    ).toThrow(/with itself/);
    expect(() =>
      loadContent(
        mutate((p) => p.elementChart.push({ attacker: 'tide', defender: 'ember', bp: 9_000 })),
      ),
    ).toThrow(/twice/);
    expect(() =>
      loadContent(
        mutate((p) => p.elementChart.push({ attacker: 'tide', defender: 'grove', bp: 10_000 })),
      ),
    ).toThrow(/100%/);
    // A strong pair with no reaction, and a reaction whose trigger is not strong.
    expect(() =>
      loadContent(
        mutate((p) => p.elementChart.push({ attacker: 'tide', defender: 'grove', bp: 15_000 })),
      ),
    ).toThrow(/no reaction for mark "grove"/);
    expect(() =>
      loadContent(mutate((p) => ((p.elementChart[0] as { bp: number }).bp = 12_000))),
    ).toThrow(/must be triggered by/);
    // Missing and duplicate elements.
    expect(() => loadContent(mutate((p) => p.elements.pop()))).toThrow(/expected 5 elements/);
    expect(() =>
      loadContent(
        mutate((p) => {
          p.elements.pop();
          p.elements.push(deepClone(p.elements[0] as ContentPack['elements'][number]));
        }),
      ),
    ).toThrow(/duplicate element/);
  });
});

describe('raid content', () => {
  it('has the element chart: the four-element wheel and the Mire pairs', () => {
    const wheel: [string, string][] = [
      ['tide', 'ember'],
      ['ember', 'grove'],
      ['grove', 'spark'],
      ['spark', 'tide'],
    ];
    expect(content.elementChart).toHaveLength(11);
    for (const [a, d] of wheel) {
      expect(chartBp(content.elementChart, a as Element, d as Element)).toBe(15_000);
      expect(chartBp(content.elementChart, d as Element, a as Element)).toBe(7_500);
    }
    // Mire (speed-and-dodge.md section 4): it and Ember each deal 150% to the other, Tide deals 75% to it.
    expect(chartBp(content.elementChart, 'mire', 'ember')).toBe(15_000);
    expect(chartBp(content.elementChart, 'ember', 'mire')).toBe(15_000);
    expect(chartBp(content.elementChart, 'tide', 'mire')).toBe(7_500);
    // The rest of Mire's pairs are neutral: Grove and Spark both ways, and Mire into Tide.
    for (const other of ['grove', 'spark', 'tide'] as const) {
      expect(chartBp(content.elementChart, 'mire', other), `mire into ${other}`).toBe(10_000);
    }
    for (const other of ['grove', 'spark'] as const) {
      expect(chartBp(content.elementChart, other, 'mire'), `${other} into mire`).toBe(10_000);
    }
    // The chart's numbers are the ones the rules named before the chart (balance docs use them).
    expect(CHART_STRONG_BP).toBe(15_000);
    // Pairs that are not listed deal 100%, itself included.
    expect(chartBp(content.elementChart, 'tide', 'grove')).toBe(10_000);
    expect(chartBp(content.elementChart, 'tide', 'tide')).toBe(10_000);
  });

  it('reads strong and weak elements off the chart, in chart order, any number of them', () => {
    const chart = [
      ...content.elementChart,
      { attacker: 'tide' as const, defender: 'grove' as const, bp: 15_000 },
      { attacker: 'grove' as const, defender: 'tide' as const, bp: 7_500 },
    ];
    expect(strongAgainst(content.elementChart, 'tide')).toEqual(['ember']);
    expect(strongAgainst(chart, 'tide')).toEqual(['ember', 'grove']);
    expect(strongOver(content.elementChart, 'ember')).toEqual(['tide', 'mire']);
    expect(strongAgainst(content.elementChart, 'ember')).toEqual(['grove', 'mire']);
    expect(strongAgainst(content.elementChart, 'mire')).toEqual(['ember']);
    expect(resists(content.elementChart, 'mire')).toEqual(['tide']);
    expect(strongOver(chart, 'grove')).toEqual(['ember', 'tide']);
    expect(weakAgainst(chart, 'grove')).toEqual(['ember', 'tide']);
    expect(resists(chart, 'tide')).toEqual(['ember', 'grove']);
    expect(joinNames([])).toBe('');
    expect(joinNames(['Tide'])).toBe('Tide');
    expect(joinNames(['Tide', 'Mire'])).toBe('Tide and Mire');
    expect(joinNames(['Tide', 'Mire', 'Ember'])).toBe('Tide, Mire and Ember');
  });

  it('has a reaction for every strong pair, and every reaction trigger is strong against its mark', () => {
    for (const r of content.reactions) {
      expect(chartBp(content.elementChart, r.triggerElement, r.markElement), r.id).toBe(
        CHART_STRONG_BP,
      );
    }
    for (const p of content.elementChart.filter((x) => x.bp === CHART_STRONG_BP)) {
      expect(
        content.reactions.filter(
          (r) => r.markElement === p.defender && r.triggerElement === p.attacker,
        ),
        `${p.attacker} on ${p.defender}`,
      ).toHaveLength(1);
    }
  });

  it('has the five marks and the reactions with the specified triggers', () => {
    // One entry per reaction (a mark with two triggers has two).
    const table = content.reactions.map((r) => [r.markId, r.markElement, r.triggerElement, r.name]);
    expect(table).toEqual([
      ['soaked', 'tide', 'spark', 'Overload'],
      ['charged', 'spark', 'grove', 'Grounding'],
      ['overgrown', 'grove', 'ember', 'Wildfire'],
      ['scorched', 'ember', 'tide', 'Steam'],
      ['scorched', 'ember', 'mire', 'Smother'],
      ['muddied', 'mire', 'ember', 'Flare'],
    ]);
    expect(content.reactions.find((r) => r.id === 'smother')?.markName).toBe('Scorched');
    expect(content.reactions.find((r) => r.id === 'flare')?.markName).toBe('Muddied');
    // Every reaction uses the same multipliers; their values are balance tuning (the simulator).
    const [first] = content.reactions;
    for (const r of content.reactions) {
      expect(r.multiplierBp).toBe(first?.multiplierBp);
      expect(r.payoffBonusBp).toBe(first?.payoffBonusBp);
      expect(r.multiplierBp).toBeGreaterThan(10_000);
      expect(r.payoffBonusBp).toBeGreaterThanOrEqual(10_000);
    }
  });

  it('has the five bosses of the design docs, Old Bogback last', () => {
    expect(
      content.bosses.map((b) => [
        b.id,
        b.element,
        b.turnOrder,
        bossAtRank(b, 1).gimmicks.map((g) => g.op),
      ]),
    ).toEqual([
      ['tidal-colossus', 'tide', 'left_to_right', ['hit_zone', 'lance', 'charge']],
      ['cinder-wyrm', 'ember', 'serpentine', ['reflect_first_reaction', 'barrage', 'slam']],
      ['thornmother', 'grove', 'right_to_left', ['silence_ends', 'pincer', 'charge']],
      ['storm-sovereign', 'spark', 'left_to_right', ['strike_highest_atk', 'slam']],
      ['old-bogback', 'mire', 'left_to_right', ['sweep', 'slam', 'purge']],
    ]);
    // `speed` order stays in the engine so stored fights replay, but no boss uses it any more.
    expect(content.bosses.filter((b) => b.turnOrder === 'speed')).toEqual([]);
    for (const b of content.bosses) expect(b.finaleRounds).toBe(12);
  });

  it('gives every raid silence the scope of each row, and every dungeon silence the whole line', () => {
    const silences = (gs: readonly Gimmick[]) => gs.filter((g) => g.op === 'silence_ends');
    const raid = content.bosses.flatMap((b) => silences(b.gimmicks));
    expect(raid.map((g) => g.id)).toEqual(['bramble-bind', 'choking-vines']);
    for (const g of raid) expect(g.scope, g.id).toBe('rows');
    const dungeon = dungeonContent.foes.flatMap((f) => silences(f.gimmicks));
    expect(dungeon.length).toBeGreaterThan(0);
    for (const g of dungeon) expect(g.scope, g.id).toBe('row');
  });

  // docs/design/attack-patterns.md 3.1: a round stays readable and round 1 is calm. The raid bosses
  // are checked as they fight at Boss Ranks 1, 4, 7 and 10, so every rank-gated move is counted.
  const damaging = (g: Gimmick) => g.op !== 'reflect_first_reaction' && g.op !== 'silence_ends';
  const firesIn = (g: Gimmick, round: number) =>
    'every' in g.trigger ? round % g.trigger.every === 0 : true;
  const fighters = [
    ...[1, 4, 7, 10].flatMap((rank) =>
      content.bosses.map((b) => ({
        id: `${b.id} at rank ${String(rank)}`,
        rounds: b.finaleRounds,
        gimmicks: bossAtRank(b, rank).gimmicks,
      })),
    ),
    ...dungeonContent.foes.map((f) => ({
      id: f.id,
      rounds: f.rounds,
      gimmicks: f.signature === undefined ? f.gimmicks : [...f.gimmicks, f.signature],
    })),
  ];

  it('never has more than two damaging moves in one round', () => {
    for (const f of fighters) {
      for (let r = 1; r <= f.rounds; r++) {
        const n = f.gimmicks.filter((g) => damaging(g) && firesIn(g, r)).length;
        expect(n, `${f.id} round ${r}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('never lands an attack pattern in round 1, and a charge lands after its announcement', () => {
    for (const f of fighters) {
      for (const g of f.gimmicks) {
        if (!(PATTERN_OPS as readonly string[]).includes(g.op)) continue;
        expect('every' in g.trigger, `${f.id} ${g.id}`).toBe(true);
        if ('every' in g.trigger)
          expect(g.trigger.every, `${f.id} ${g.id}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('bossAtRank keeps the moves whose fromRank is absent or reached, in content order', () => {
    const thornmother = content.bosses.find((b) => b.id === 'thornmother');
    if (thornmother === undefined) throw new Error('missing boss');
    const names = (rank: number) => bossAtRank(thornmother, rank).gimmicks.map((g) => g.id);
    const base = ['bramble-bind', 'briar-pincer', 'seed-burst'];
    expect(names(1)).toEqual(base);
    expect(names(3)).toEqual(base);
    expect(names(4)).toEqual([...base, 'choking-vines']);
    expect(names(6)).toEqual([...base, 'choking-vines']);
    expect(names(7)).toEqual([...base, 'choking-vines', 'thorn-lash']);
    expect(names(10)).toEqual([...base, 'choking-vines', 'thorn-lash']);
    // Odd ranks count as the rank below or as rank 1, never as an error.
    expect(names(4.9)).toEqual(names(4));
    expect(names(0)).toEqual(names(1));
    expect(names(-5)).toEqual(names(1));
    expect(names(Number.NaN)).toEqual(names(1));
    // Everything else about the boss is kept, and the original is not touched.
    expect({ ...bossAtRank(thornmother, 7), gimmicks: [] }).toEqual({
      ...thornmother,
      gimmicks: [],
    });
    expect(thornmother.gimmicks).toHaveLength(5);
    // A boss with nothing gated comes back with all its moves at every rank.
    const plain = { ...thornmother, gimmicks: thornmother.gimmicks.slice(0, 3) };
    expect(bossAtRank(plain, 1)).toEqual(plain);
    expect(bossAtRank(plain, 12)).toEqual(plain);
  });

  it('gives every raid boss two rank-gated moves, from rank 4 and from rank 7', () => {
    for (const b of content.bosses) {
      const gated = b.gimmicks.filter((g) => g.fromRank !== undefined);
      expect(
        gated.map((g) => g.fromRank),
        b.id,
      ).toEqual([4, 7]);
      expect(b.gimmicks.length, b.id).toBeLessThanOrEqual(6);
      // The rank-1 moves are what the bosses always had.
      expect(bossAtRank(b, 1).gimmicks.length, b.id).toBe(b.gimmicks.length - 2);
      expect(bossAtRank(b, 4).gimmicks.length, b.id).toBe(b.gimmicks.length - 1);
      expect(bossAtRank(b, 7).gimmicks.length, b.id).toBe(b.gimmicks.length);
    }
  });

  it('puts a setup-punishing move in every boss, and varies them', () => {
    // What a gated move punishes: an exposed Payoff (the Payoff slam), a stack of Payoffs in one
    // row (the Payoff row sweep), a single carry (the lane or the chain of the strongest creature),
    // or having no Guard to cover (a charge that lands on every row). Silence only costs turns.
    const punishes = (g: Gimmick): string => {
      const body = g.op === 'charge' ? g.then : g;
      if (body.op === 'slam' && body.aim === 'payoff') return 'exposed-payoff';
      if (body.op === 'sweep' && body.rows.includes('payoffs')) return 'stacked-payoffs';
      if (body.op === 'lance' && body.lane === 'strongest') return 'single-carry';
      if (body.op === 'strike_highest_atk') return 'single-carry';
      if (body.op === 'sweep' && body.rows.includes('all')) return 'no-guard';
      return 'other';
    };
    const pairs: string[] = [];
    for (const b of content.bosses) {
      const mine = b.gimmicks.filter((g) => g.fromRank !== undefined).map(punishes);
      expect(
        mine.some((k) => k !== 'other'),
        b.id,
      ).toBe(true);
      pairs.push(mine.join('+'));
    }
    // No two bosses get the same pair of kinds, and a boss's own two differ in op.
    expect(new Set(pairs).size).toBe(pairs.length);
    for (const b of content.bosses) {
      const ops = b.gimmicks.filter((g) => g.fromRank !== undefined).map((g) => g.op);
      expect(new Set(ops).size, b.id).toBe(2);
    }
  });

  it('keeps the dice windows of the dice-reading moves apart, at every rank', () => {
    // A gimmick reads the window (index mod 4) of the round's 40 pattern dice: two that read dice
    // must not share one, or their picks would be the same die.
    const dice = (g: Gimmick): boolean => {
      const body = g.op === 'charge' ? g.then : g;
      return (
        body.op === 'barrage' ||
        (body.op === 'slam' && body.aim === 'random') ||
        (body.op === 'lance' && body.lane === 'random')
      );
    };
    for (const rank of [1, 4, 7, 10]) {
      for (const b of content.bosses) {
        const windows = bossAtRank(b, rank)
          .gimmicks.map((g, i) => ({ g, window: i % 4 }))
          .filter((x) => dice(x.g))
          .map((x) => x.window);
        expect(new Set(windows).size, `${b.id} rank ${String(rank)}`).toBe(windows.length);
      }
    }
  });

  it('gives landmark signatures to floor bosses only, as a charge', () => {
    for (const f of dungeonContent.foes) {
      if (f.signature === undefined) continue;
      expect(f.kind, f.id).toBe('boss');
      expect(f.signature.op, f.id).toBe('charge');
    }
    expect(dungeonContent.foes.filter((f) => f.kind === 'boss').every((f) => f.signature)).toBe(
      true,
    );
  });

  it('has the four basic abilities and two adaptation rules', () => {
    const basic = content.finaleAbilities.filter((a) => a.kind === 'basic');
    expect(basic.map((a) => a.effects.map((e) => e.op))).toEqual([
      ['rally'],
      ['shield_wall'],
      ['re_mark'],
      ['purge'],
    ]);
    expect(content.adaptations.map((a) => [a.kind, a.resistBp])).toEqual([
      ['top_reaction', 5000],
      ['top_element', 2500],
    ]);
    expect(content.guests).toHaveLength(3);
  });
});

describe('creature abilities', () => {
  const ability = (id: string) => {
    const a = content.finaleAbilities.find((x) => x.id === id);
    if (!a) throw new Error(`missing ${id}`);
    return a;
  };

  it('gives all 34 species an ability: 10 lines with two strengths, 8 branch forms and 6 single species', () => {
    for (const c of content.creatures) {
      expect(c.ability, c.id).toBeDefined();
      expect(ability(c.ability?.id ?? '').kind).toBe('creature');
    }
    expect(content.finaleAbilities.filter((a) => a.kind === 'creature')).toHaveLength(34);
    expect(content.finaleAbilities.filter((a) => a.kind === 'basic')).toHaveLength(4);
    // Every ability belongs to exactly one species.
    const ids = content.creatures.map((c) => c.ability?.id);
    expect(new Set(ids).size).toBe(34);
  });

  it('has a stage-2 ability that is stronger than stage 1 in every line', () => {
    for (const c of content.creatures.filter((x) => x.evolvesTo)) {
      const target = creature(content, c.evolvesTo?.species ?? '');
      const a1 = ability(c.ability?.id ?? '');
      const a2 = ability(target.ability?.id ?? '');
      expect(upgradeProblem(a1, a2), `${c.id} -> ${target.id}`).toBeNull();
      expect(upgradeProblem(a2, a1), `${target.id} -> ${c.id}`).not.toBeNull();
    }
  });

  /** Every evolving line has a second form of another role (the Sunfawn and Ohmouse pattern, then the other six). */
  const BRANCH_FORMS = [
    ['sproutle', 'sunfawn', 'grove', 'support', 'common', 'sunny-patch'],
    ['zipmouse', 'ohmouse', 'spark', 'guard', 'common', 'static-wall'],
    ['splashet', 'geyserpup', 'tide', 'payoff', 'common', 'geyser-burst'],
    ['cindle', 'wickat', 'ember', 'setter', 'common', 'slow-burn'],
    ['mistnewt', 'drizzlewt', 'tide', 'support', 'common', 'soft-rain'],
    ['ashmole', 'kilnmole', 'ember', 'guard', 'common', 'banked-embers'],
    ['stormray', 'halcyray', 'spark', 'support', 'rare', 'afterglow'],
    ['mossback', 'bloomback', 'grove', 'payoff', 'rare', 'full-bloom'],
  ] as const;

  it('never lets a branch form be found: not catchable, no starter, in no place or deep list', () => {
    for (const [, id] of BRANCH_FORMS) {
      expect(creature(content, id)).toMatchObject({ stage: 2, catchable: false, starter: false });
      for (const place of expeditionContent.destinations) {
        expect(place.species, `${place.id} lists ${id}`).not.toContain(id);
        expect(place.deep.species, `${place.id} deep lists ${id}`).not.toContain(id);
      }
    }
  });

  it('gives every evolving line a second form of the same element and another role', () => {
    // The two Mire lines have one form each (Setter and Payoff Mire lines come later), so they are not here.
    const evolving = content.creatures.filter(
      (c) => c.evolvesTo !== undefined && c.element !== 'mire',
    );
    expect(evolving.map((c) => c.id).sort()).toEqual(BRANCH_FORMS.map((b) => b[0]).sort());
    for (const [from, to, element, role, rarity, abilityId] of BRANCH_FORMS) {
      const parent = creature(content, from);
      const first = creature(content, parent.evolvesTo?.species ?? '');
      expect(parent.altEvolvesTo?.species, from).toBe(to);
      expect(creature(content, to), to).toMatchObject({
        line: from,
        element,
        role,
        rarity,
        ability: { id: abilityId },
      });
      // The same element and rarity as the first form, and a role the first form does not have.
      expect(first.element, to).toBe(element);
      expect(first.rarity, to).toBe(rarity);
      expect(first.role, to).not.toBe(role);
      // One price for the choice (the loader checks it too).
      expect(parent.altEvolvesTo?.level, to).toBe(parent.evolvesTo?.level);
      expect(parent.altEvolvesTo?.essence, to).toBe(parent.evolvesTo?.essence);
    }
  });

  it('gives the branch forms the abilities of the design', () => {
    const expected: Record<string, unknown[]> = {
      'sunny-patch': [
        { op: 'rally', damageBp: 600, rounds: 2 },
        { op: 'shield_wall', zone: 'own', reduceBp: 3_000, rounds: 1 },
      ],
      'static-wall': [
        { op: 'shield_wall', zone: 'own', reduceBp: 6_000, rounds: 2 },
        { op: 're_mark', element: 'own' },
      ],
      'geyser-burst': [{ op: 'strike', atkBp: 32_000 }],
      'slow-burn': [
        { op: 're_mark', element: 'own' },
        { op: 'rally', damageBp: 600, rounds: 2 },
      ],
      'soft-rain': [
        { op: 'rally', damageBp: 500, rounds: 2 },
        { op: 'purge', rounds: 2 },
      ],
      'banked-embers': [
        { op: 'shield_wall', zone: 'own', reduceBp: 7_000, rounds: 2 },
        { op: 'rally', damageBp: 500, rounds: 1 },
      ],
      afterglow: [
        { op: 'rally', damageBp: 800, rounds: 2 },
        { op: 'shield_wall', zone: 'own', reduceBp: 3_000, rounds: 1 },
      ],
      'full-bloom': [{ op: 'strike', atkBp: 30_000 }],
    };
    for (const [, , , , , id] of BRANCH_FORMS) {
      expect(ability(id).effects, id).toEqual(expected[id]);
    }
    // Guards fire when the boss first hits a zone, like every other Guard; the rest on their round.
    expect(ability('static-wall').defaultAtZoneHit).toBe(true);
    expect(ability('banked-embers').defaultAtZoneHit).toBe(true);
    expect(ability('afterglow').defaultAtZoneHit).toBeUndefined();
  });

  it('gives each branch form the stats of the reference form of its role and rarity', () => {
    // The role budget (decisions.md, 2026-10-18): the same numbers as the form it copies. Rare Support has
    // no stage 2 yet, so Halcyray is the common Support budget (Magmole) at the rare rate, x1.25.
    const same: [string, string][] = [
      ['sunfawn', 'magmole'],
      ['geyserpup', 'pyrelynx'],
      ['wickat', 'voltaro'],
      ['drizzlewt', 'magmole'],
      ['kilnmole', 'ohmouse'],
      ['bloomback', 'tempestray'],
    ];
    for (const [id, reference] of same) {
      const a = creature(content, id);
      const b = creature(content, reference);
      expect(a.baseStats, id).toEqual(b.baseStats);
      expect(a.growth, id).toEqual(b.growth);
      expect(a.levelCap, id).toBe(b.levelCap);
    }
    expect(creature(content, 'halcyray')).toMatchObject({
      baseStats: { hp: 224, atk: 42, spd: 49 },
      growth: { hp: 15, atk: 2, spd: 4 },
      levelCap: 30,
    });
    // Ohmouse is the common Guard budget: Thornbuck's HP and Speed.
    expect(creature(content, 'ohmouse').baseStats).toMatchObject({ hp: 224, spd: 22 });
  });

  it('keeps the basic abilities weak (docs/design/creature-abilities.md)', () => {
    expect(ability('rally').effects).toEqual([{ op: 'rally', damageBp: 1_000, rounds: 1 }]);
    expect(ability('shield-wall').effects).toEqual([
      { op: 'shield_wall', zone: 'choose', reduceBp: 5_000, rounds: 1 },
    ]);
    expect(ability('re-mark').effects).toEqual([{ op: 're_mark', element: 'choose' }]);
    expect(ability('purge').effects).toEqual([{ op: 'purge', rounds: 2 }]);
  });

  it('keeps creature strikes between 90% and 400% of Attack, so abilities stay a bonus', () => {
    for (const a of content.finaleAbilities.filter((x) => x.kind === 'creature')) {
      for (const e of a.effects) {
        if (e.op === 'strike') {
          expect(e.atkBp).toBeGreaterThanOrEqual(9_000);
          expect(e.atkBp).toBeLessThanOrEqual(40_000);
        }
      }
    }
  });

  it('unlocks at level 10', () => {
    expect(RULES.abilities.unlockLevel).toBe(10);
  });
});

describe('crit archetype', () => {
  it('gives a few payoff species a crit bonus, and nobody a bonus above the caps', () => {
    const withCrit = content.creatures.filter((c) => c.crit !== undefined);
    expect(withCrit.length).toBeGreaterThanOrEqual(2);
    expect(withCrit.length).toBeLessThanOrEqual(6);
    for (const c of withCrit) {
      expect(c.role).toBe('payoff');
      const baseChance = 500;
      const baseDamage = 5_000;
      // Baseline plus bonus stays inside the study's caps (30% chance, +150% damage).
      expect(baseChance + (c.crit?.chanceBp ?? 0)).toBeLessThanOrEqual(3_000);
      expect(baseDamage + (c.crit?.damageBp ?? 0)).toBeLessThanOrEqual(15_000);
    }
  });

  it('ships with crits and boss crits switched on at 5% and +50%, and sane caps', () => {
    expect(RULES.combat.luck.critChanceBp).toBe(500);
    expect(RULES.combat.luck.critBp).toBe(5_000);
    expect(RULES.combat.luck.bossCritChanceBp).toBe(500);
    expect(RULES.combat.luck.bossCritBp).toBe(5_000);
    expect(RULES.combat.luck.critMaxChanceBp).toBeLessThanOrEqual(3_000);
    expect(RULES.combat.luck.critMaxBp).toBeLessThanOrEqual(15_000);
  });
});

describe('festival creatures', () => {
  const festival = content.creatures.filter((c) => c.festival === true);

  it('ships two festival-only species: never catchable, single-stage, with an ability', () => {
    expect(festival.map((c) => c.id)).toEqual(['lanternfin', 'hearthshell']);
    for (const c of festival) {
      expect(c.catchable, c.id).toBe(false);
      expect(c.starter, c.id).toBe(false);
      expect(c.stage, c.id).toBe(1);
      expect(c.evolvesTo, c.id).toBeUndefined();
      expect(c.ability, c.id).toBeDefined();
      expect(c.levelCap, c.id).toBe(30);
    }
    // Nothing else is flagged: every other stage 1 species can be caught (the Mire base forms live in the Sunken Fen).
    expect(
      content.creatures
        .filter((c) => c.festival !== true && !c.catchable && c.stage === 1)
        .map((c) => c.id),
    ).toEqual([]);
  });

  it('gives them a role and an element the catchable epics lack, at epic strength', () => {
    const [lantern, hearth] = festival;
    expect([lantern?.element, lantern?.role, lantern?.rarity]).toEqual(['tide', 'support', 'epic']);
    expect([hearth?.element, hearth?.role, hearth?.rarity]).toEqual(['ember', 'guard', 'epic']);
    const epics = content.creatures.filter((c) => c.rarity === 'epic' && c.festival !== true);
    const total = (c: { baseStats: { hp: number; atk: number; spd: number } }) =>
      c.baseStats.hp + c.baseStats.atk + c.baseStats.spd;
    const lo = Math.min(...epics.map(total));
    const hi = Math.max(...epics.map(total));
    for (const c of festival) {
      expect(total(c)).toBeGreaterThanOrEqual(lo - 20);
      expect(total(c)).toBeLessThanOrEqual(hi + 20);
    }
  });

  it('is rejected when a festival species is catchable, a starter, evolves or has no ability', () => {
    const lantern = (p: ContentPack) => creature(p, 'lanternfin');
    expect(() => loadContent(mutate((p) => (lantern(p).catchable = true)))).toThrow(/festival/);
    expect(() =>
      loadContent(
        mutate((p) => {
          lantern(p).catchable = true;
          lantern(p).starter = true;
        }),
      ),
    ).toThrow();
    expect(() => loadContent(mutate((p) => delete lantern(p).ability))).toThrow(/needs an ability/);
    expect(() =>
      loadContent(
        mutate((p) => {
          lantern(p).evolvesTo = { species: 'hearthshell', level: 15, essence: 10 };
        }),
      ),
    ).toThrow();
  });
});

describe('boss head-count exponent', () => {
  it('ships a sensible exponent for every boss, between 1 and 1.3', () => {
    for (const b of content.bosses) {
      const e = (b.hpExponent?.num ?? 1) / (b.hpExponent?.den ?? 1);
      expect(e, b.id).toBeGreaterThanOrEqual(1);
      expect(e, b.id).toBeLessThanOrEqual(1.3);
    }
  });

  it('rejects an exponent outside 0.5 to 2 and unknown keys', () => {
    const boss = (p: ContentPack) => p.bosses[0] as ContentPack['bosses'][number];
    expect(() => loadContent(mutate((p) => (boss(p).hpExponent = { num: 21, den: 10 })))).toThrow(
      /exponent/,
    );
    expect(() => loadContent(mutate((p) => (boss(p).hpExponent = { num: 4, den: 10 })))).toThrow(
      /exponent/,
    );
    expect(() =>
      loadContent(mutate((p) => (boss(p).hpExponent = { num: 12, den: 10, x: 1 } as never))),
    ).toThrow(/schema/);
    expect(() => loadContent(mutate((p) => (boss(p).hpExponent = { num: 12, den: 0 })))).toThrow(
      /schema/,
    );
  });
});

describe('abilitiesFor', () => {
  const team = [
    { id: 'c1', speciesId: 'cindle' },
    { id: 'c2', speciesId: 'tidewing' },
    { id: 'c3', speciesId: 'aurorix' },
  ];
  const levels = (l1: number, l2: number, l3: number) => (c: { id: string }) =>
    ({ c1: l1, c2: l2, c3: l3 })[c.id] ?? 1;

  it('returns the ability of every team creature at the unlock level or above, in team order', () => {
    expect(abilitiesFor(team, levels(10, 15, 30))).toEqual([
      { creatureId: 'c1', speciesId: 'cindle', abilityId: 'flare-strike' },
      { creatureId: 'c2', speciesId: 'tidewing', abilityId: 'tidal-mark-2' },
      { creatureId: 'c3', speciesId: 'aurorix', abilityId: 'aurora-surge' },
    ]);
  });

  it('skips creatures below level 10', () => {
    expect(abilitiesFor(team, levels(9, 10, 1)).map((a) => a.creatureId)).toEqual(['c2']);
    expect(abilitiesFor(team, levels(1, 1, 9))).toEqual([]);
    expect(abilitiesFor([], levels(1, 1, 1))).toEqual([]);
  });

  it('follows the species: an evolved creature brings the stronger form', () => {
    const before = abilitiesFor([{ id: 'x', speciesId: 'splashet' }], () => 15);
    const after = abilitiesFor([{ id: 'x', speciesId: 'tidewing' }], () => 15);
    expect(before[0]?.abilityId).toBe('tidal-mark');
    expect(after[0]?.abilityId).toBe('tidal-mark-2');
  });

  it('ignores species without an ability or unknown species', () => {
    const pack = loadContent(
      mutate((p) => {
        delete (creature(p, 'coralynx') as { ability?: unknown }).ability;
        p.finaleAbilities = p.finaleAbilities.filter((a) => a.id !== 'coral-lance');
      }),
    );
    expect(abilitiesFor([{ id: 'x', speciesId: 'coralynx' }], () => 30, pack)).toEqual([]);
    expect(abilitiesFor([{ id: 'x', speciesId: 'nothing' }], () => 30)).toEqual([]);
  });

  it('lists the four basic abilities', () => {
    expect(basicAbilities().map((a) => a.id)).toEqual(['rally', 'shield-wall', 're-mark', 'purge']);
  });
});

describe('loadContent rejects invalid raid content', () => {
  const boss = (p: ContentPack, id = 'tidal-colossus') => {
    const b = p.bosses.find((x) => x.id === id);
    if (!b) throw new Error('missing boss');
    return b;
  };

  it('schema violations', () => {
    expect(() => loadContent(mutate((p) => (boss(p).finaleRounds = 31)))).toThrow(/schema/);
    expect(() => loadContent(mutate((p) => (boss(p).finaleRounds = 0)))).toThrow(/schema/);
    expect(() => loadContent(mutate((p) => Object.assign(boss(p), { extra: 1 })))).toThrow(
      /schema/,
    );
    expect(() =>
      loadContent(mutate((p) => Object.assign(boss(p).gimmicks[0] as object, { op: 'explode' }))),
    ).toThrow(/schema/);
    expect(() =>
      loadContent(mutate((p) => Object.assign(boss(p).gimmicks[0] as object, { zone: 'top' }))),
    ).toThrow(/schema/);
    expect(() =>
      loadContent(
        mutate((p) => Object.assign(boss(p).gimmicks[0] as object, { trigger: { every: 1 } })),
      ),
    ).toThrow(/schema/);
  });

  it('fromRank: an integer from 2, on any raid move, and the boss may have six moves', () => {
    const setRank = (p: ContentPack, fromRank: unknown) =>
      Object.assign(boss(p).gimmicks[0] as object, { fromRank });
    expect(() => loadContent(mutate((p) => setRank(p, 2)))).not.toThrow();
    for (const bad of [0, 1, 1.5, -3, 100, '4', null]) {
      expect(() => loadContent(mutate((p) => setRank(p, bad)))).toThrow(/schema/);
    }
    // Six moves fit, seven do not.
    const extra = (n: number) => (p: ContentPack) => {
      const b = boss(p, 'storm-sovereign');
      while (b.gimmicks.length < n) {
        b.gimmicks.push({
          id: `extra-${String(b.gimmicks.length)}`,
          name: 'Extra',
          trigger: { every: 7 },
          op: 'hit_zone',
          zone: 'front',
          power: 1000,
        });
      }
    };
    expect(() => loadContent(mutate(extra(6)))).not.toThrow();
    expect(() => loadContent(mutate(extra(7)))).toThrow(/schema/);
  });

  it('slam aims and sweep rows: the new names load, others do not', () => {
    const slam = (aim: string) => (p: ContentPack) => {
      const g = boss(p, 'storm-sovereign').gimmicks.find((x) => x.op === 'slam');
      Object.assign(g as object, { aim });
    };
    expect(() => loadContent(mutate(slam('payoff')))).not.toThrow();
    expect(() => loadContent(mutate(slam('weakest')))).toThrow(/schema/);
    const sweep = (rows: string[]) => (p: ContentPack) => {
      const g = boss(p, 'storm-sovereign').gimmicks.find((x) => x.op === 'sweep');
      Object.assign(g as object, { rows });
    };
    expect(() => loadContent(mutate(sweep(['payoffs', 'front'])))).not.toThrow();
    expect(() => loadContent(mutate(sweep(['fullest'])))).toThrow(/schema/);
  });

  it('crit bonuses: optional, strict and in range', () => {
    expect(() =>
      loadContent(mutate((p) => (boss(p).crit = { chanceBp: 500, damageBp: 2_500 }))),
    ).not.toThrow();
    for (const bad of [
      { chanceBp: -1, damageBp: 0 },
      { chanceBp: 10_001, damageBp: 0 },
      { chanceBp: 1.5, damageBp: 0 },
      { chanceBp: 0, damageBp: 100_001 },
      { chanceBp: 0 },
      { chanceBp: 0, damageBp: 0, extra: 1 },
    ]) {
      expect(() => loadContent(mutate((p) => Object.assign(boss(p), { crit: bad })))).toThrow(
        /schema/,
      );
      expect(() =>
        loadContent(mutate((p) => Object.assign(p.creatures[0] as object, { crit: bad }))),
      ).toThrow(/schema/);
    }
  });

  it('cross-reference errors', () => {
    expect(() => loadContent(mutate((p) => (boss(p).adaptation = 'nothing')))).toThrow(
      /unknown adaptation/,
    );
    expect(() => loadContent(mutate((p) => p.bosses.push(deepClone(boss(p)))))).toThrow(
      /duplicate boss/,
    );
    expect(() =>
      loadContent(
        mutate((p) =>
          boss(p).gimmicks.push(
            deepClone(boss(p).gimmicks[0] as ContentPack['bosses'][number]['gimmicks'][number]),
          ),
        ),
      ),
    ).toThrow(/duplicate gimmick/);
    expect(() =>
      loadContent(mutate((p) => ((p.guests[0] as { species: string }).species = 'nothing'))),
    ).toThrow(/unknown species/);
    expect(() =>
      loadContent(
        mutate((p) => ((p.reactions[0] as { triggerElement: string }).triggerElement = 'grove')),
      ),
    ).toThrow(/triggered by/);
    expect(() => loadContent(mutate((p) => p.reactions.pop()))).toThrow(/every element/);
    expect(() =>
      loadContent(
        mutate((p) => ((p.reactions[1] as { markElement: string }).markElement = 'tide')),
      ),
    ).toThrow();
  });

  describe('abilities', () => {
    const abilityOf = (p: ContentPack, id: string) => {
      const a = p.finaleAbilities.find((x) => x.id === id);
      if (!a) throw new Error(`missing ability ${id}`);
      return a;
    };

    it('schema violations', () => {
      const bad = (fn: (a: ContentPack['finaleAbilities'][number]) => void) =>
        loadContent(mutate((p) => fn(abilityOf(p, 'flare-strike'))));
      expect(() => bad((a) => (a.effects = []))).toThrow(/schema/);
      expect(() =>
        bad((a) => (a.effects = [0, 1, 2, 3].map(() => ({ op: 'purge' as const })))),
      ).toThrow(/schema/);
      expect(() => bad((a) => Object.assign(a, { extra: 1 }))).toThrow(/schema/);
      expect(() => bad((a) => Object.assign(a, { kind: 'epic' }))).toThrow(/schema/);
      expect(() => bad((a) => (a.effects = [{ op: 'strike', atkBp: 1.5 }]))).toThrow(/schema/);
      expect(() => bad((a) => (a.effects = [{ op: 'strike', atkBp: 0 }]))).toThrow(/schema/);
      expect(() =>
        bad((a) => (a.effects = [{ op: 'strike', atkBp: 100, extra: 1 } as never])),
      ).toThrow(/schema/);
      expect(() => bad((a) => (a.effects = [{ op: 'explode' } as never]))).toThrow(/schema/);
      expect(() =>
        bad((a) => (a.effects = [{ op: 'shield_wall', zone: 'front', reduceBp: 5000 } as never])),
      ).toThrow(/schema/);
      expect(() =>
        bad((a) => (a.effects = [{ op: 'shield_wall', zone: 'own', reduceBp: 10_001, rounds: 1 }])),
      ).toThrow(/schema/);
      expect(() => bad((a) => (a.effects = [{ op: 'rally', damageBp: 1000, rounds: 0 }]))).toThrow(
        /schema/,
      );
      expect(() => bad((a) => (a.effects = [{ op: 'purge', rounds: 31 }]))).toThrow(/schema/);
      expect(() => bad((a) => (a.effects = [{ op: 're_mark', element: 'tide' } as never]))).toThrow(
        /schema/,
      );
    });

    it('fills in default rounds of 1 for rally and shield wall', () => {
      const pack = loadContent(
        mutate((p) => {
          abilityOf(p, 'warm-glow').effects = [{ op: 'rally', damageBp: 1000 } as never];
          abilityOf(p, 'warm-glow-2').effects = [{ op: 'rally', damageBp: 2000, rounds: 2 }];
        }),
      );
      expect(abilityOf(pack, 'warm-glow').effects).toEqual([
        { op: 'rally', damageBp: 1000, rounds: 1 },
      ]);
    });

    it('cross-reference errors', () => {
      expect(() =>
        loadContent(mutate((p) => (creature(p, 'cindle').ability = { id: 'nothing' }))),
      ).toThrow(/unknown ability/);
      expect(() =>
        loadContent(mutate((p) => (creature(p, 'cindle').ability = { id: 'rally' }))),
      ).toThrow(/creature ability/);
      expect(() =>
        loadContent(mutate((p) => (creature(p, 'coralynx').ability = { id: 'flare-strike' }))),
      ).toThrow(/more than one species/);
      expect(() => loadContent(mutate((p) => p.finaleAbilities.pop()))).toThrow(/unknown ability/);
      expect(() =>
        loadContent(
          mutate((p) =>
            p.finaleAbilities.push({
              ...deepClone(abilityOf(p, 'flare-strike')),
              id: 'orphan',
            }),
          ),
        ),
      ).toThrow(/belongs to no species/);
      // One form without an ability (and its ability removed so nothing is orphaned).
      const without = (speciesId: string, abilityId: string) =>
        loadContent(
          mutate((p) => {
            delete creature(p, speciesId).ability;
            p.finaleAbilities = p.finaleAbilities.filter((x) => x.id !== abilityId);
          }),
        );
      expect(() => without('cindle', 'flare-strike')).toThrow(/both have an ability or neither/);
      expect(() => without('tidewing', 'tidal-mark-2')).toThrow(/both have an ability or neither/);
    });

    it('rules for basic abilities', () => {
      const basic = (p: ContentPack) => abilityOf(p, 'shield-wall');
      expect(() =>
        loadContent(
          mutate((p) =>
            p.finaleAbilities.push({
              ...deepClone(abilityOf(p, 'rally')),
              id: 'rally-2',
            }),
          ),
        ),
      ).toThrow(/two basic abilities/);
      expect(() =>
        loadContent(mutate((p) => (basic(p).effects = [{ op: 'strike', atkBp: 1000 }]))),
      ).toThrow(/cannot strike/);
      expect(() =>
        loadContent(
          mutate(
            (p) =>
              (basic(p).effects = [{ op: 'shield_wall', zone: 'own', reduceBp: 5000, rounds: 1 }]),
          ),
        ),
      ).toThrow(/choose/);
      expect(() =>
        loadContent(mutate((p) => (basic(p).effects = [...basic(p).effects, { op: 'purge' }]))),
      ).toThrow(/exactly one effect/);
    });

    it('an ability may not repeat an effect', () => {
      expect(() =>
        loadContent(
          mutate((p) => {
            const a = abilityOf(p, 'flare-strike');
            a.effects = [...a.effects, { op: 'strike', atkBp: 100 }];
          }),
        ),
      ).toThrow(/repeats an effect/);
    });

    it('requires stage 2 to be stronger than stage 1', () => {
      const set = (
        p: ContentPack,
        id: string,
        effects: ContentPack['finaleAbilities'][number]['effects'],
      ) => {
        abilityOf(p, id).effects = effects;
      };
      // Equal strength is not "stronger".
      expect(() =>
        loadContent(mutate((p) => set(p, 'flare-strike-2', abilityOf(p, 'flare-strike').effects))),
      ).toThrow(/not stronger/);
      // Weaker amount.
      expect(() =>
        loadContent(mutate((p) => set(p, 'flare-strike-2', [{ op: 'strike', atkBp: 1000 }]))),
      ).toThrow(/weaker/);
      // Shorter duration, even with a bigger amount.
      expect(() =>
        loadContent(
          mutate((p) =>
            set(p, 'bark-guard-2', [{ op: 'shield_wall', zone: 'own', reduceBp: 9000, rounds: 1 }]),
          ),
        ),
      ).toThrow(/shorter/);
      // Missing the stage-1 effect.
      expect(() =>
        loadContent(mutate((p) => set(p, 'tidal-mark-2', [{ op: 're_mark', element: 'own' }]))),
      ).toThrow(/lacks the "rally"/);
      expect(() =>
        loadContent(mutate((p) => set(p, 'static-zap-2', [{ op: 're_mark', element: 'own' }]))),
      ).toThrow(/lacks the "strike"/);
      // Changing own to choose.
      expect(() =>
        loadContent(
          mutate((p) =>
            set(p, 'bark-guard-2', [
              { op: 'shield_wall', zone: 'choose', reduceBp: 9000, rounds: 3 },
            ]),
          ),
        ),
      ).toThrow(/zone/);
    });
  });
});

describe('status effects', () => {
  const effect = (pack: ContentPack, id: string) => {
    const e = pack.statusEffects.find((x) => x.id === id);
    if (!e) throw new Error(`missing ${id}`);
    return e;
  };
  const withMove = (move: Record<string, unknown>) =>
    mutate((p) => {
      const boss = p.bosses[0];
      if (!boss) throw new Error('no boss');
      (boss.gimmicks as unknown[]).push(move);
    });
  const move = { id: 'bog-slap', name: 'Bog Slap', trigger: { every: 3 } };

  it('ships Mired and nothing else, and only Mire bosses and foes apply it', () => {
    expect(content.statusEffects).toEqual([
      {
        id: 'mired',
        name: 'Mired',
        kind: 'debuff',
        maxStacks: 5,
        turns: 3,
        perStack: { spdBp: -300, damageDealtBp: -300 },
      },
    ]);
    const uses = (g: Gimmick) => 'applies' in g && g.applies !== undefined;
    const movesOf = (f: { gimmicks: readonly Gimmick[]; signature?: Gimmick | undefined }) =>
      f.signature === undefined ? f.gimmicks : [...f.gimmicks, f.signature];
    // Mired comes from the Mire bosses and foes only, and Sinking Mud is the raid's source.
    for (const b of content.bosses) expect(b.gimmicks.some(uses), b.id).toBe(b.element === 'mire');
    for (const f of dungeonContent.foes) {
      expect(movesOf(f).some(uses), f.id).toBe(f.element === 'mire');
    }
    const sinking = content.bosses.find((b) => b.id === 'old-bogback')?.gimmicks[0];
    expect(sinking).toMatchObject({
      id: 'sinking-mud',
      op: 'sweep',
      applies: { effect: 'mired', powerBp: 10_000 },
    });
  });

  it('only names effects that exist, in boss and dungeon content alike', () => {
    const ids = new Set(content.statusEffects.map((e) => e.id));
    const moves = [
      ...content.bosses.flatMap((b) => b.gimmicks),
      ...dungeonContent.foes.flatMap((f) => [
        ...f.gimmicks,
        ...(f.signature === undefined ? [] : [f.signature]),
      ]),
    ];
    for (const g of moves) expect(ids.has(appliedEffect(g) ?? 'mired')).toBe(true);
  });

  it('is strict: no unknown keys, a real kind, and positive caps and turns', () => {
    const bad = (fn: (e: ContentPack['statusEffects'][number]) => void) =>
      expect(() => loadContent(mutate((p) => fn(effect(p, 'mired'))))).toThrow(/schema/);
    bad((e) => Object.assign(e, { surprise: 1 }));
    bad((e) => Object.assign(e.perStack, { hpBp: -100 }));
    bad((e) => Object.assign(e, { kind: 'neutral' }));
    bad((e) => (e.maxStacks = 0));
    bad((e) => (e.turns = 0));
    bad((e) => (e.perStack.spdBp = 1.5));
    bad((e) => (e.perStack.damageDealtBp = 20_000));
  });

  it('accepts a buff with a positive per-stack number', () => {
    expect(() =>
      loadContent(
        mutate((p) => {
          p.statusEffects.push({
            id: 'zeal',
            name: 'Zeal',
            kind: 'buff',
            maxStacks: 2,
            turns: 2,
            perStack: { damageDealtBp: 500 },
          });
        }),
      ),
    ).not.toThrow();
  });

  it('rejects duplicate ids', () => {
    expect(() =>
      loadContent(mutate((p) => p.statusEffects.push(deepClone(effect(p, 'mired'))))),
    ).toThrow(/duplicate status effect/);
  });

  it('lets a damaging move apply a known effect, and only that', () => {
    const slap = { ...move, op: 'hit_zone', zone: 'front', power: 5_000 };
    const ok = { ...slap, applies: { effect: 'mired', powerBp: 14_000, durationTurns: 1 } };
    expect(() => loadContent(withMove(ok))).not.toThrow();
    expect(() =>
      loadContent(withMove({ ...slap, applies: { effect: 'nope', powerBp: 10_000 } })),
    ).toThrow(/unknown status effect/);
    expect(() =>
      loadContent(withMove({ ...slap, applies: { effect: 'mired', powerBp: 0 } })),
    ).toThrow(/schema/);
    expect(() =>
      loadContent(withMove({ ...slap, applies: { effect: 'mired', powerBp: 1, extra: 1 } })),
    ).toThrow(/schema/);
    // A move that does no damage has nothing to carry it.
    expect(() =>
      loadContent(
        withMove({
          ...move,
          op: 'silence_ends',
          scope: 'row',
          turns: 1,
          applies: { effect: 'mired', powerBp: 10_000 },
        }),
      ),
    ).toThrow(/schema/);
  });

  it('lets a charge carry the rider and a boss purge', () => {
    const charge = {
      ...move,
      op: 'charge',
      applies: { effect: 'mired', powerBp: 10_000 },
      then: { op: 'pincer', scope: 'rows', power: 5_000 },
    };
    expect(() => loadContent(withMove(charge))).not.toThrow();
    expect(() => loadContent(withMove({ ...move, op: 'purge' }))).not.toThrow();
    expect(() => loadContent(withMove({ ...move, op: 'purge', power: 1 }))).toThrow(/schema/);
  });
});

describe('foe Speed and the dodge rules', () => {
  const boss = (p: ContentPack) => p.bosses[0] as Record<string, unknown>;

  it('lets a boss carry a baseSpd (a whole number from 0), and has none by default', () => {
    // Every shipped boss is slow: 2 to 5% dodge at 10 bp a point.
    for (const b of content.bosses) {
      expect(b.baseSpd, b.id).toBeGreaterThanOrEqual(20);
      expect(b.baseSpd, b.id).toBeLessThanOrEqual(50);
    }
    expect(content.bosses.find((b) => b.id === 'old-bogback')?.baseSpd).toBe(20);
    const plain = clone();
    delete (plain.bosses[0] as { baseSpd?: number }).baseSpd;
    expect(loadContent(plain).bosses[0]?.baseSpd).toBeUndefined();
    expect(() => loadContent(mutate((p) => (boss(p)['baseSpd'] = 0)))).not.toThrow();
    expect(() => loadContent(mutate((p) => (boss(p)['baseSpd'] = 40)))).not.toThrow();
    expect(() => loadContent(mutate((p) => (boss(p)['baseSpd'] = -1)))).toThrow(/schema/);
    expect(() => loadContent(mutate((p) => (boss(p)['baseSpd'] = 1.5)))).toThrow(/schema/);
  });

  it('is on, with the balance pass numbers stored', () => {
    // Switched on by the balance pass (docs/balance/log.md B-023).
    expect(RULES.combat.dodge).toEqual({
      enabled: true,
      perSpeedBp: 10,
      maxBp: 5_000,
      areaShareBp: 5_000,
    });
    expect(RULES.combat.effects).toEqual({ enabled: true, dice: 32 });
  });
});

describe('Mire', () => {
  const ref = (id: string) => creature(content, id);
  /** A creature's summed stats at its level cap, the role budget the design compares (decisions.md). */
  const summed = (id: string): number => {
    const c = ref(id);
    const n = c.levelCap - 1;
    return (
      c.baseStats.hp +
      c.growth.hp * n +
      c.baseStats.atk +
      c.growth.atk * n +
      c.baseStats.spd +
      c.growth.spd * n
    );
  };

  it('is the fifth element, with the chart pairs, the mark Muddied and the reactions Smother and Flare', () => {
    expect(content.elements.map((e) => e.id)).toEqual(['tide', 'ember', 'grove', 'spark', 'mire']);
    expect(content.elements.find((e) => e.id === 'mire')?.name).toBe('Mire');
    const smother = content.reactions.find((r) => r.id === 'smother');
    const flare = content.reactions.find((r) => r.id === 'flare');
    expect(smother).toMatchObject({
      markId: 'scorched',
      markElement: 'ember',
      triggerElement: 'mire',
    });
    expect(flare).toMatchObject({
      markId: 'muddied',
      markName: 'Muddied',
      markElement: 'mire',
      triggerElement: 'ember',
    });
    // The same multiplier and payoff numbers as the four older reactions.
    const steam = content.reactions.find((r) => r.id === 'steam');
    for (const r of [smother, flare]) {
      expect(r?.multiplierBp).toBe(steam?.multiplierBp);
      expect(r?.payoffBonusBp).toBe(steam?.payoffBonusBp);
    }
  });

  it('gives Smother and Flare their riders, and no other reaction has one', () => {
    expect(content.reactions.find((r) => r.id === 'smother')?.appliesToFoe).toEqual({
      effect: 'mired',
      powerBp: 10_000,
    });
    expect(content.reactions.find((r) => r.id === 'smother')?.consumes).toBeUndefined();
    expect(content.reactions.find((r) => r.id === 'flare')?.consumes).toEqual({
      effect: 'mired',
      bonusPerStackBp: 2_000,
    });
    expect(content.reactions.find((r) => r.id === 'flare')?.appliesToFoe).toBeUndefined();
    const others = content.reactions.filter((r) => r.id !== 'smother' && r.id !== 'flare');
    expect(others.some((r) => r.appliesToFoe !== undefined || r.consumes !== undefined)).toBe(
      false,
    );
  });

  it('refuses a rider that names an unknown effect or has an extra key', () => {
    const smother = (p: ContentPack) =>
      p.reactions.find((r) => r.id === 'smother') as Record<string, unknown>;
    const flare = (p: ContentPack) =>
      p.reactions.find((r) => r.id === 'flare') as Record<string, unknown>;
    expect(() =>
      loadContent(
        mutate((p) => (smother(p)['appliesToFoe'] = { effect: 'nope', powerBp: 10_000 })),
      ),
    ).toThrow(/unknown status effect/);
    expect(() =>
      loadContent(mutate((p) => (flare(p)['consumes'] = { effect: 'nope', bonusPerStackBp: 1 }))),
    ).toThrow(/unknown status effect/);
    expect(() =>
      loadContent(
        mutate((p) => (smother(p)['appliesToFoe'] = { effect: 'mired', powerBp: 1, extra: 1 })),
      ),
    ).toThrow(/schema/);
    expect(() =>
      loadContent(mutate((p) => (flare(p)['consumes'] = { effect: 'mired', bonusPerStackBp: 0 }))),
    ).toThrow(/schema/);
  });

  it('has a Guard line and a Support line, common, one evolution each at level 15', () => {
    for (const [id, role, stage] of [
      ['mudlump', 'guard', 1],
      ['bogwarden', 'guard', 2],
      ['squelch', 'support', 1],
      ['croakmire', 'support', 2],
    ] as const) {
      expect(ref(id), id).toMatchObject({
        element: 'mire',
        role,
        stage,
        rarity: 'common',
        starter: false,
      });
    }
    expect(ref('mudlump')).toMatchObject({
      evolvesTo: { species: 'bogwarden', level: 15, essence: 20 },
      levelCap: 15,
    });
    expect(ref('squelch')).toMatchObject({
      evolvesTo: { species: 'croakmire', level: 15, essence: 20 },
      levelCap: 15,
    });
    expect(ref('bogwarden').catchable).toBe(false);
    expect(ref('mudlump').altEvolvesTo).toBeUndefined();
    expect(ref('squelch').altEvolvesTo).toBeUndefined();
    // They are caught in the Sunken Fen.
    expect([ref('mudlump').catchable, ref('squelch').catchable]).toEqual([true, true]);
  });

  it('is the slowest element: the lowest Speed in the game, with the highest HP of its role and the lowest Attack', () => {
    const mire = content.creatures.filter((c) => c.element === 'mire');
    const others = content.creatures.filter((c) => c.element !== 'mire');
    for (const c of mire) {
      // Base Speed and growth both under every other creature's (Speed is the dodge: Mire dodges least).
      const slowestOther = Math.min(
        ...others.filter((o) => o.stage === c.stage).map((o) => o.baseStats.spd),
      );
      expect(c.baseStats.spd, c.id).toBeLessThan(slowestOther);
      expect(c.growth.spd, c.id).toBe(1);
      // HP at or above the top of every other common of its role and stage.
      const peers = others.filter(
        (o) => o.role === c.role && o.stage === c.stage && o.rarity === 'common',
      );
      expect(c.baseStats.hp, c.id).toBeGreaterThanOrEqual(
        Math.max(...peers.map((o) => o.baseStats.hp)),
      );
      // Attack at the low end of the role.
      expect(c.baseStats.atk, c.id).toBeLessThanOrEqual(
        Math.min(...peers.map((o) => o.baseStats.atk)),
      );
    }
  });

  it('keeps the power budget of its role: finished forms within 5% of the common reference', () => {
    // Guards: Thornbuck is the reference (decisions.md). Supports: Magmole.
    expect(Math.abs(summed('bogwarden') / summed('thornbuck') - 1)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(summed('croakmire') / summed('magmole') - 1)).toBeLessThanOrEqual(0.05);
    // And a stage 1 form is a little under its evolved form, like every line.
    expect(summed('bogwarden')).toBeGreaterThan(
      ref('mudlump').baseStats.hp + ref('mudlump').growth.hp * 14,
    );
  });

  it('gives each line its signature as a passive ability, and an upgrade at stage 2', () => {
    const ability = (id: string) => content.finaleAbilities.find((a) => a.id === id);
    expect(ref('mudlump').ability?.id).toBe('mud-wall');
    expect(ref('bogwarden').ability?.id).toBe('bog-hold');
    expect(ref('squelch').ability?.id).toBe('squelch-song');
    expect(ref('croakmire').ability?.id).toBe('deep-croak');
    const power = (id: string, op: 'on_hit_taken' | 'round_start') => {
      const e = ability(id)?.effects.find((x) => x.op === op);
      return e !== undefined && 'apply' in e ? e.apply : undefined;
    };
    expect(power('mud-wall', 'on_hit_taken')).toEqual({ effect: 'mired', powerBp: 6_000 });
    expect(power('bog-hold', 'on_hit_taken')).toEqual({ effect: 'mired', powerBp: 8_000 });
    expect(power('squelch-song', 'round_start')).toEqual({ effect: 'mired', powerBp: 6_000 });
    expect(power('deep-croak', 'round_start')).toEqual({ effect: 'mired', powerBp: 8_000 });
    // Guards fire (their wall) when the boss first hits a zone, like every Guard.
    expect(ability('mud-wall')?.defaultAtZoneHit).toBe(true);
    expect(ability('bog-hold')?.defaultAtZoneHit).toBe(true);
    const guard = ability('mud-wall');
    const guard2 = ability('bog-hold');
    const support = ability('squelch-song');
    const support2 = ability('deep-croak');
    if (!guard || !guard2 || !support || !support2) throw new Error('missing Mire ability');
    expect(upgradeProblem(guard, guard2)).toBeNull();
    expect(upgradeProblem(support, support2)).toBeNull();
  });

  it('refuses a passive ability that is basic, or applies an unknown effect', () => {
    const passive = { op: 'on_hit_taken', apply: { effect: 'mired', powerBp: 6_000 } };
    expect(() =>
      loadContent(
        mutate((p) => {
          const rally = p.finaleAbilities.find((a) => a.id === 'rally');
          if (rally) (rally.effects as unknown[]) = [passive];
        }),
      ),
    ).toThrow(/cannot be passive/);
    expect(() =>
      loadContent(
        mutate((p) => {
          const a = p.finaleAbilities.find((x) => x.id === 'mud-wall');
          if (a)
            (a.effects as unknown[]) = [
              { op: 'on_hit_taken', apply: { effect: 'nope', powerBp: 1 } },
            ];
        }),
      ),
    ).toThrow(/unknown status effect/);
    expect(() =>
      loadContent(
        mutate((p) => {
          const a = p.finaleAbilities.find((x) => x.id === 'mud-wall');
          if (a)
            (a.effects as unknown[]) = [
              { op: 'round_start', apply: { effect: 'mired', powerBp: 0 } },
            ];
        }),
      ),
    ).toThrow(/schema/);
  });
});
