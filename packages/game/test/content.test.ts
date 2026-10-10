import { describe, expect, it } from 'vitest';
import { content, loadContent, type ContentPack } from '../src/index';
import creaturesJson from '../src/content/data/creatures.json';
import elementsJson from '../src/content/data/elements.json';

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function clone(): ContentPack {
  return deepClone({
    version: 1,
    elements: elementsJson,
    creatures: creaturesJson,
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
    expect(content.creatures).toHaveLength(20);
  });

  it('has 12 catchable species and 3 common starters of different elements', () => {
    expect(content.creatures.filter((c) => c.catchable)).toHaveLength(12);
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
    expect(() => loadContent(mutate((p) => delete creature(p, 'zipmouse').evolvesTo))).toThrow(
      /exactly one/,
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

  it('a broken element cycle', () => {
    const setStrong = (
      p: ContentPack,
      id: string,
      strongAgainst: ContentPack['elements'][number]['strongAgainst'],
    ) => {
      const def = p.elements.find((e) => e.id === id);
      if (!def) throw new Error('missing element');
      def.strongAgainst = strongAgainst;
    };
    // Two 2-cycles instead of one 4-cycle.
    expect(() =>
      loadContent(
        mutate((p) => {
          setStrong(p, 'tide', 'ember');
          setStrong(p, 'ember', 'tide');
          setStrong(p, 'grove', 'spark');
          setStrong(p, 'spark', 'grove');
        }),
      ),
    ).toThrow(/single cycle/);
    // Self-loop.
    expect(() => loadContent(mutate((p) => setStrong(p, 'tide', 'tide')))).toThrow(/single cycle/);
    // Missing and duplicate elements.
    expect(() => loadContent(mutate((p) => p.elements.pop()))).toThrow(/expected 4 elements/);
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
