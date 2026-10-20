import { describe, expect, it } from 'vitest';
import {
  NO_GEAR_RULES,
  POOL_SIZE,
  RULES,
  TALENT_RULES,
  activeTalents,
  applyGear,
  bookHolds,
  canTeach,
  content,
  createSeededRng,
  foldTalent,
  fuseOffered,
  gearContent,
  gearLine,
  goldenValue,
  itemOf,
  keepOffered,
  keepOfferedFor,
  lineBranches,
  loadContent,
  loadTalents,
  recommend,
  releaseParts,
  rollTalent,
  slotCount,
  slotOpensAt,
  slotsOf,
  slotsOpen,
  talentContent,
  talentDef,
  talentPool,
  talentScore,
  talentSignature,
  talentText,
  talentUnit,
  talentValue,
  teachOffered,
  wornEffects,
  type FoldTalent,
  type LineCreature,
  type Rng,
  type TalentDef,
  type TalentRoll,
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
import talentsJson from '../src/content/data/talents.json';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function scripted(values: number[]): Rng & { drawn: () => number } {
  let i = 0;
  return {
    nextU32() {
      const value = values[i++];
      if (value === undefined) throw new Error('scripted rng exhausted');
      return value;
    },
    drawn: () => i,
  };
}

const def = (id: string): TalentDef => {
  const found = talentDef(id);
  if (found === undefined) throw new Error(`no talent ${id}`);
  return found;
};

describe('the shipped talent content', () => {
  const speciesLines = [...new Set(content.creatures.map((c) => c.line))];

  it('gives every line a pool of 7 or 8 talents, and no other line one', () => {
    expect([...talentContent.pools.keys()].sort()).toEqual([...speciesLines].sort());
    for (const line of speciesLines) {
      const pool = talentPool(line);
      expect(pool.length, line).toBeGreaterThanOrEqual(POOL_SIZE.min);
      expect(pool.length, line).toBeLessThanOrEqual(POOL_SIZE.max);
    }
  });

  it('has a signature talent for the epic and Festival lines, and for no other', () => {
    for (const s of content.creatures) {
      expect(talentSignature(s.line) !== undefined, s.id).toBe(s.rarity === 'epic');
    }
    expect(talentSignature('aurorix')?.name).toBe('Watcher Above');
  });

  it('gives every talent a unique id, a real effect and a name that is plain text', () => {
    const seen = new Set<string>();
    for (const t of talentContent.byId.values()) {
      expect(seen.has(t.id), t.id).toBe(false);
      seen.add(t.id);
      expect(t.name, t.id).toMatch(/^[A-Za-z][A-Za-z ,'-]*$/);
      if ('line' in t.effect) expect(gearLine(t.effect.line), t.id).toBeDefined();
      else expect(TALENT_RULES).toContain(t.effect.rule);
    }
  });

  it('keeps the talents that need engine or training work out of every pool', () => {
    expect(talentContent.deferred.map((d) => d.id).sort()).toEqual([
      'gentle-but-stubborn',
      'light-sleeper',
      'shade-napper',
    ]);
    for (const d of talentContent.deferred) {
      expect(talentDef(d.id), d.id).toBeUndefined();
      expect(d.needs.length).toBeGreaterThan(0);
    }
  });

  it('follows the spec examples: names, sizes and golden values', () => {
    // Values are the spec's "normal / golden" in basis points or whole numbers.
    const cases: [string, number, number][] = [
      ['splashes-first', 1400, 2100],
      ['wet-footprints', 1000, 1500],
      ['bigger-splash', 1300, 1900],
      ['puddle-hopper', 700, 1000],
      ['playful', 600, 900],
      ['first-to-say-hello', 1200, 1800],
      ['easily-distracted', 2500, 3700],
      ['chases-flickers', 300, 400],
      ['proud-ember', 2000, 3000],
      ['waits-for-the-moment', 900, 1300],
      ['stands-close', 700, 1000],
      ['hard-to-move', 500, 700],
      ['perks-up-in-the-rain', 2000, 3000],
      ['mossy-bed', 800, 1200],
      ['shares-the-sun', 200, 300],
      ['zoomies', 1200, 1800],
      ['static-fizz', 1300, 1900],
      ['warm-burrow', 400, 600],
      ['toasty-paws', 200, 300],
      ['hoards-cosy-things', 1500, 2200],
      ['lance-practice', 1400, 2100],
      ['fierce-about-its-territory', 1000, 1500],
    ];
    for (const [id, normal, golden] of cases) {
      const t = def(id);
      expect(t.value, id).toBe(normal);
      expect(talentValue(t, false), id).toBe(normal);
      expect(talentValue(t, true), id).toBe(golden);
    }
  });

  it('folds every talent of every pool for every role and element without throwing', () => {
    const roles = ['setter', 'payoff', 'support', 'guard'] as const;
    for (const t of talentContent.byId.values()) {
      for (const golden of [false, true]) {
        for (const role of roles) {
          for (const element of ['tide', 'ember', 'grove', 'spark'] as const) {
            expect(() =>
              applyGear(
                { hp: 100, atk: 20, spd: 10 },
                undefined,
                { role, element },
                [],
                [foldTalent(t, golden)],
              ),
            ).not.toThrow();
          }
        }
      }
    }
  });

  it('has at least one talent in a pool that every role can use', () => {
    // A pool must never be all idle for a role it holds: each form of a line finds something to use.
    for (const s of content.creatures) {
      const wearer = { role: s.role, element: s.element, stats: { atk: 30, hp: 100 } };
      const useful = talentPool(s.line).filter(
        (t) => talentScore(foldTalent(t, false), wearer) > 0,
      );
      expect(useful.length, s.id).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('loading talent content', () => {
  const species = content.creatures;
  const raw = (): typeof talentsJson => clone(talentsJson);
  const load = (data: unknown): unknown =>
    loadTalents(data, species, new Map(gearContent.lines.map((l) => [l.id, l])));

  it('accepts the shipped talents', () => {
    expect(() => load(raw())).not.toThrow();
  });

  it('rejects a pool that is too small or too big, a missing pool and a pool of an unknown line', () => {
    const small = raw();
    small.pools.splashet = small.pools.splashet.slice(0, 6);
    expect(() => load(small)).toThrow(/expected 7 to 8/);
    const big = raw();
    big.pools.splashet = [...big.pools.splashet, ...big.pools.cindle.slice(0, 1)].map((t, i) => ({
      ...t,
      id: `x-${String(i)}`,
    }));
    expect(() => load(big)).toThrow(/expected 7 to 8/);
    const missing = raw() as { pools: Record<string, unknown> };
    delete missing.pools['splashet'];
    expect(() => load(missing)).toThrow(/no talent pool/);
    const unknown = raw() as { pools: Record<string, unknown> };
    unknown.pools['nobody'] = unknown.pools['splashet'];
    expect(() => load(unknown)).toThrow(/unknown line/);
  });

  it('rejects duplicate ids, unknown effects, once-only values and unknown keys', () => {
    const dup = raw();
    (dup.pools.cindle[0] as { id: string }).id = (dup.pools.splashet[0] as { id: string }).id;
    expect(() => load(dup)).toThrow(/duplicate talent id/);
    const effect = raw();
    (effect.pools.splashet[0] as { effect: unknown }).effect = { line: 'not-a-line' };
    expect(() => load(effect)).toThrow(/unknown line/);
    const once = raw();
    once.signatures.aurorix.value = 2;
    expect(() => load(once)).toThrow(/once-only/);
    const extra = raw();
    (extra.pools.splashet[0] as Record<string, unknown>)['extra'] = 1;
    expect(() => load(extra)).toThrow(/schema/);
    const huge = raw();
    huge.pools.splashet[3] = { ...huge.pools.splashet[3], value: 10_000 } as never;
    expect(() => load(huge)).toThrow(/100% or more/);
    const rule = raw();
    rule.pools.splashet[6] = { ...rule.pools.splashet[6], value: 10_000 } as never;
    expect(() => load(rule)).toThrow(/too large for a rule/);
  });

  it('rejects a missing or surplus signature, and a deferred talent that is in a pool', () => {
    const none = raw() as { signatures: Record<string, unknown> };
    delete none.signatures['aurorix'];
    expect(() => load(none)).toThrow(/needs a signature/);
    const extra = raw() as { signatures: Record<string, unknown> };
    extra.signatures['splashet'] = {
      ...(extra.signatures['aurorix'] as object),
      id: 'extra-signature',
    };
    expect(() => load(extra)).toThrow(/not epic/);
    const deferred = raw();
    deferred.deferred[0] = { ...deferred.deferred[0], id: 'playful' } as never;
    expect(() => load(deferred)).toThrow(/is in a pool/);
    const unknownLine = raw();
    unknownLine.deferred[0] = { ...unknownLine.deferred[0], line: 'nobody' } as never;
    expect(() => load(unknownLine)).toThrow(/unknown line/);
  });
});

describe('rolling a talent', () => {
  it('draws the pick, then the golden: a draw of 0 is the first talent, golden', () => {
    const rng = scripted([0, 0]);
    expect(rollTalent(rng, 'splashet')).toEqual({ talentId: 'splashes-first', golden: true });
    expect(rng.drawn()).toBe(2);
    const last = talentPool('splashet').length - 1;
    expect(rollTalent(scripted([last, 19]), 'splashet')).toEqual({
      talentId: 'glides-on-a-breeze',
      golden: false,
    });
  });

  it('is even across the pool and golden one time in twenty', () => {
    const rng = createSeededRng('talent-roll');
    const n = 24_000;
    const counts = new Map<string, number>();
    let golden = 0;
    for (let i = 0; i < n; i++) {
      const roll = rollTalent(rng, 'cindle');
      counts.set(roll.talentId, (counts.get(roll.talentId) ?? 0) + 1);
      if (roll.golden) golden++;
    }
    const pool = talentPool('cindle');
    expect([...counts.keys()].sort()).toEqual(pool.map((t) => t.id).sort());
    for (const t of pool) {
      expect(Math.abs((counts.get(t.id) ?? 0) / n - 1 / pool.length)).toBeLessThan(0.012);
    }
    expect(
      Math.abs(golden / n - RULES.talents.golden.numerator / RULES.talents.golden.denominator),
    ).toBeLessThan(0.01);
  });

  it('skips the talents it is told to, and uses the whole pool when none is left', () => {
    const pool = talentPool('zipmouse');
    const rng = createSeededRng('exclude');
    const skip = new Set(pool.slice(1).map((t) => t.id));
    for (let i = 0; i < 40; i++)
      expect(rollTalent(rng, 'zipmouse', skip).talentId).toBe(pool[0]?.id);
    const all = new Set(pool.map((t) => t.id));
    expect(() => rollTalent(rng, 'zipmouse', all)).not.toThrow();
    expect(() => rollTalent(rng, 'nobody')).toThrow(RangeError);
  });

  it('always draws twice, so a creature that rolls several slots draws a fixed number', () => {
    const rng = scripted([1, 1, 2, 2, 3, 3]);
    for (let i = 0; i < 3; i++) rollTalent(rng, 'sproutle');
    expect(rng.drawn()).toBe(6);
  });
});

describe('the size of a talent', () => {
  it('makes a golden talent 1.5 times as strong, rounded down to a whole percent or point', () => {
    expect(goldenValue('pct', 1400)).toBe(2100);
    expect(goldenValue('pt', 300)).toBe(400);
    expect(goldenValue('pct', 2500)).toBe(3700);
    expect(goldenValue('pct', 700)).toBe(1000);
    expect(goldenValue('flat', 40)).toBe(60);
    expect(goldenValue('once', 1)).toBe(1);
    // Below a whole percent there is nothing to round to.
    expect(goldenValue('pct', 50)).toBe(75);
  });

  it('reads a talent on a card: its effect in one phrase and a plain sentence', () => {
    expect(talentText(def('splashes-first'), false)).toMatchObject({
      name: 'Splashes First',
      text: 'First pounce +14%',
      golden: false,
    });
    expect(talentText(def('splashes-first'), true).text).toBe('First pounce +21%');
    expect(talentText(def('slow-to-move'), false).text).toBe('Thick coat +40');
    expect(talentText(def('puddle-hopper'), false).text).toContain('−7%');
    expect(talentText(def('zoomies'), false).text).toBe('Speed +12%');
    // Speed is the dodge now (docs/design/speed-and-dodge.md): the card says so.
    expect(talentText(def('zoomies'), false).about).toBe('Dodges more often.');
    expect(talentText(def('easily-distracted'), true).text).toBe('Glimmer finds +37%');
    expect(talentText(def('watcher-above'), false).text).toBe('Lingering');
    expect(talentUnit(def('zoomies'))).toBe('pct');
    for (const t of talentContent.byId.values()) {
      expect(talentText(t, false).about.length, t.id).toBeGreaterThan(0);
    }
  });
});

describe('talent slots', () => {
  it('opens slot 1 at the catch, slot 2 at level 20 and slot 3 at level 25 for a rare or an epic', () => {
    expect(slotsOpen('common', 1)).toBe(1);
    expect(slotsOpen('common', 19)).toBe(1);
    expect(slotsOpen('common', 20)).toBe(2);
    expect(slotsOpen('common', 30)).toBe(2);
    for (const rarity of ['rare', 'epic'] as const) {
      expect(slotsOpen(rarity, 19)).toBe(1);
      expect(slotsOpen(rarity, 20)).toBe(2);
      expect(slotsOpen(rarity, 24)).toBe(2);
      expect(slotsOpen(rarity, 25)).toBe(3);
    }
    expect(slotCount('common')).toBe(2);
    expect(slotCount('epic')).toBe(3);
    expect(slotOpensAt('common', 3)).toBeNull();
    expect(slotOpensAt('rare', 3)).toBe(25);
    expect(slotOpensAt('rare', 2)).toBe(20);
    expect(slotOpensAt('rare', 0)).toBeNull();
  });

  it('activates the signature talent and the talents in open slots only', () => {
    const held = [
      { talentId: 'mossy-bed', golden: false, slot: 1 },
      { talentId: 'stands-close', golden: true, slot: 2 },
      { talentId: 'hard-to-move', golden: false, slot: null },
    ];
    expect(activeTalents('sproutle', 'common', 1, held).map((t) => t.id)).toEqual(['mossy-bed']);
    expect(activeTalents('sproutle', 'common', 20, held).map((t) => t.id)).toEqual([
      'mossy-bed',
      'stands-close',
    ]);
    // A golden talent folds at the golden value.
    expect(activeTalents('sproutle', 'common', 20, held)[1]?.value).toBe(1000);
    // The epic's signature comes first and is always there.
    expect(activeTalents('aurorix', 'epic', 1, []).map((t) => t.id)).toEqual(['watcher-above']);
    // An id that left the content is skipped.
    expect(
      activeTalents('sproutle', 'common', 1, [{ talentId: 'gone', golden: false, slot: 1 }]),
    ).toEqual([]);
    expect(slotsOf('common', 20, held)).toEqual([
      { talentId: 'mossy-bed', golden: false },
      { talentId: 'stands-close', golden: true },
    ]);
  });
});

describe('folding talents like gear', () => {
  const payoff = { role: 'payoff', element: 'ember' } as const;
  const guard = { role: 'guard', element: 'grove' } as const;
  const support = { role: 'support', element: 'ember' } as const;
  const stats = { hp: 200, atk: 40, spd: 30 };

  it('gives a talent the same effect as the gear line it names', () => {
    const talent: FoldTalent = foldTalent(def('warm-to-the-touch'), false);
    const viaTalent = wornEffects(payoff, [], [talent]);
    // An item with the same line at the same value (item level 20, tier III is 1300).
    const item = itemOf('trail-cap', 'rare', 20, [{ id: 'ember-reaction', tier: 2 }]);
    const viaItem = wornEffects(payoff, [item]);
    expect(viaTalent.mods.reactionBp).toEqual(viaItem.mods.reactionBp);
    expect(viaTalent.mods.reactionBp).toEqual({ wildfire: 1300, flare: 1300 });
    // Both together add up.
    expect(wornEffects(payoff, [item], [talent]).mods.reactionBp).toEqual({
      wildfire: viaItem.mods.reactionBp?.['wildfire'] === undefined ? 0 : 2600,
      flare: 2600,
    });
  });

  it('adds to the stats, the crit, the sheet and the trip rules', () => {
    const talents = [
      foldTalent(def('playful'), false),
      foldTalent(def('mossy-bed'), false),
      foldTalent(def('chases-flickers'), false),
      foldTalent(def('quick-to-pounce'), false),
      foldTalent(def('first-to-say-hello'), false),
      foldTalent(def('glides-on-a-breeze'), false),
      foldTalent(def('easily-distracted'), false),
    ];
    const out = applyGear(stats, undefined, payoff, [], talents);
    expect(out.stats.atk).toBe(Math.floor((40 * 10_600) / 10_000));
    expect(out.stats.hp).toBe(Math.floor((200 * 10_800) / 10_000));
    expect(out.stats.spd).toBe(30);
    expect(out.crit?.chanceBp).toBe(300);
    expect(out.mods?.firstHitBp).toBe(1400);
    expect(out.rules.trailXpBp).toBe(1200);
    expect(out.rules.quickFeetBp).toBe(400);
    expect(out.rules.glimmerFindBp).toBe(2500);
    expect(out.rules.keenNoseBp).toBe(0);
  });

  it('raises Speed with the Speed talent, by its share and rounded down', () => {
    const z = applyGear(stats, undefined, payoff, [], [foldTalent(def('zoomies'), false)]);
    expect(z.stats.spd).toBe(Math.floor((30 * 11_200) / 10_000));
    const gold = applyGear(stats, undefined, payoff, [], [foldTalent(def('zoomies'), true)]);
    expect(gold.stats.spd).toBe(Math.floor((30 * 11_800) / 10_000));
    expect(gold.stats.spd).toBeGreaterThan(z.stats.spd);
  });

  it('makes a golden talent stronger and changes nothing without talents', () => {
    const normal = applyGear(stats, undefined, payoff, [], [foldTalent(def('playful'), false)]);
    const golden = applyGear(stats, undefined, payoff, [], [foldTalent(def('playful'), true)]);
    expect(golden.stats.atk).toBeGreaterThan(normal.stats.atk);
    expect(applyGear(stats, undefined, payoff, [], [])).toEqual({
      stats,
      crit: undefined,
      mods: undefined,
      rules: NO_GEAR_RULES,
    });
    expect(applyGear(stats, undefined, payoff, [])).toEqual(
      applyGear(stats, undefined, payoff, [], []),
    );
  });

  it('lists a talent that does nothing for the creature, and adds nothing for it', () => {
    const cover = foldTalent(def('stands-close'), false);
    const onPayoff = wornEffects(payoff, [], [cover]);
    expect(onPayoff.idleTalents).toEqual(['stands-close']);
    expect(onPayoff.mods.coverBp).toBeUndefined();
    const onGuard = wornEffects(guard, [], [cover]);
    expect(onGuard.idleTalents).toEqual([]);
    expect(onGuard.mods.coverBp).toBe(700);
    // Mend is for Supports, Attunement for the creature's own element.
    expect(wornEffects(guard, [], [foldTalent(def('toasty-paws'), false)]).idleTalents).toEqual([
      'toasty-paws',
    ]);
    expect(wornEffects(support, [], [foldTalent(def('toasty-paws'), false)]).mods.mendBp).toBe(200);
    expect(
      wornEffects(payoff, [], [foldTalent(def('mossy-shoulders'), false)]).idleTalents,
    ).toEqual(['mossy-shoulders']);
  });

  it('gives the signature talents their effect: Lingering and Unbothered', () => {
    const lingering = wornEffects(support, [], [foldTalent(def('watcher-above'), false)]);
    expect(lingering.mods.lingerRounds).toBe(1);
    const unbothered = wornEffects(payoff, [], [foldTalent(def('impossible-to-stop'), false)]);
    expect(unbothered.mods.ignoreSilence).toBe(1);
  });

  it('scores a talent for a creature: nothing when idle, more for the creature it is meant for', () => {
    const wearer = { ...guard, stats: { atk: 30, hp: 150 } };
    const cover = foldTalent(def('stands-close'), false);
    expect(talentScore(cover, wearer)).toBeGreaterThan(0);
    expect(talentScore(cover, { ...payoff, stats: wearer.stats })).toBe(0);
    expect(talentScore(foldTalent(def('stands-close'), true), wearer)).toBeGreaterThan(
      talentScore(cover, wearer),
    );
    // Attack and HP count exactly.
    const atk = foldTalent(def('playful'), false);
    expect(talentScore(atk, wearer)).toBe(Math.floor((30 * 600) / 100));
    expect(talentScore(foldTalent(def('zoomies'), false), wearer)).toBeGreaterThan(0);
    expect(talentScore(foldTalent(def('easily-distracted'), false), wearer)).toBeGreaterThanOrEqual(
      0,
    );
  });
});

describe('the duplicate choice', () => {
  const creature = (over: Partial<LineCreature> = {}): LineCreature => ({
    id: 'c1',
    speciesId: 'sproutle',
    level: 1,
    fusionCount: 0,
    fusionPoints: 0,
    rarity: 'common',
    role: 'guard',
    element: 'grove',
    stats: { atk: 30, hp: 150 },
    slots: [null],
    book: [],
    ...over,
  });
  const roll = (talentId: string, golden = false): TalentRoll => ({ talentId, golden });

  it('holds a talent in the book at the same quality or better', () => {
    const book = [roll('mossy-bed'), roll('stands-close', true)];
    expect(bookHolds(book, roll('mossy-bed'))).toBe(true);
    expect(bookHolds(book, roll('mossy-bed', true))).toBe(false);
    expect(bookHolds(book, roll('stands-close'))).toBe(true);
    expect(bookHolds(book, roll('stands-close', true))).toBe(true);
    expect(bookHolds(book, roll('hard-to-move'))).toBe(false);
  });

  it('offers Teach when the book lacks the talent (or it is golden and the book has only the normal one), slots or not', () => {
    const c = creature({ book: [roll('mossy-bed')] });
    expect(canTeach(c, roll('hard-to-move'))).toBe(true);
    expect(canTeach(c, roll('mossy-bed'))).toBe(false);
    expect(canTeach(c, roll('mossy-bed', true))).toBe(true);
    // Teach fills the book, so it does not need an open slot.
    expect(canTeach(creature({ slots: [] }), roll('hard-to-move'))).toBe(true);
    expect(canTeach(creature({ slots: [null] }), roll('hard-to-move'))).toBe(true);
    expect(teachOffered([c, creature({ id: 'c2' })], roll('mossy-bed'))).toBe(true);
    expect(teachOffered([c], roll('mossy-bed'))).toBe(false);
  });

  it('offers Fuse until the creature has all 5 fusions', () => {
    expect(fuseOffered([creature({ fusionCount: 4, fusionPoints: 11 })])).toBe(true);
    expect(fuseOffered([creature({ fusionCount: 5, fusionPoints: 19 })])).toBe(false);
    expect(
      fuseOffered([
        creature({ fusionCount: 5, fusionPoints: 19 }),
        creature({ id: 'c2', fusionCount: 1, fusionPoints: 1 }),
      ]),
    ).toBe(true);
  });

  it('offers Keep only for a branching line, below two creatures, while a branch is missing', () => {
    const branches = ['thornbuck', 'sunfawn'];
    expect(keepOffered(branches, ['sproutle'])).toBe(true);
    expect(keepOffered(branches, ['thornbuck'])).toBe(true);
    expect(keepOffered(branches, ['thornbuck', 'sunfawn'])).toBe(false);
    expect(keepOffered(branches, ['sproutle', 'sproutle'])).toBe(false);
    expect(keepOffered(branches, [])).toBe(true);
    expect(keepOffered(['thornbuck'], ['sproutle'])).toBe(false);
    expect(keepOffered([], ['sproutle'])).toBe(false);
    expect(RULES.talents.maxPerLine).toBe(2);
  });

  it('reads the branches of a line from the content: every evolving line has two', () => {
    const branching = content.creatures.filter((c) => c.altEvolvesTo !== undefined);
    expect(branching.map((c) => c.id)).toEqual([
      'splashet',
      'cindle',
      'sproutle',
      'zipmouse',
      'mistnewt',
      'ashmole',
      'stormray',
      'mossback',
    ]);
    for (const line of new Set(content.creatures.map((c) => c.line))) {
      expect(lineBranches(content, line).length, line).toBeLessThanOrEqual(2);
    }
    expect(lineBranches(content, 'sproutle')).toEqual(['thornbuck', 'sunfawn']);
    expect(lineBranches(content, 'zipmouse')).toEqual(['voltaro', 'ohmouse']);
    expect(lineBranches(content, 'splashet')).toEqual(['tidewing', 'geyserpup']);
    expect(lineBranches(content, 'cindle')).toEqual(['pyrelynx', 'wickat']);
    expect(lineBranches(content, 'mistnewt')).toEqual(['fogwyrm', 'drizzlewt']);
    expect(lineBranches(content, 'ashmole')).toEqual(['magmole', 'kilnmole']);
    expect(lineBranches(content, 'stormray')).toEqual(['tempestray', 'halcyray']);
    expect(lineBranches(content, 'mossback')).toEqual(['ancientshell', 'bloomback']);
    expect(lineBranches(content, 'coralynx')).toEqual([]);
    expect(lineBranches(content, 'nobody')).toEqual([]);
  });

  it('offers Keep for every evolving line, by what the player owns', () => {
    expect(keepOfferedFor('sproutle', ['sproutle'])).toBe(true);
    expect(keepOfferedFor('sproutle', ['thornbuck'])).toBe(true);
    expect(keepOfferedFor('sproutle', ['sunfawn'])).toBe(true);
    expect(keepOfferedFor('sproutle', ['thornbuck', 'sunfawn'])).toBe(false);
    expect(keepOfferedFor('sproutle', ['sproutle', 'sproutle'])).toBe(false);
    expect(keepOfferedFor('zipmouse', ['voltaro'])).toBe(true);
    expect(keepOfferedFor('zipmouse', ['voltaro', 'ohmouse'])).toBe(false);
    const lines: [string, string, string][] = [
      ['splashet', 'tidewing', 'geyserpup'],
      ['cindle', 'pyrelynx', 'wickat'],
      ['mistnewt', 'fogwyrm', 'drizzlewt'],
      ['ashmole', 'magmole', 'kilnmole'],
      ['stormray', 'tempestray', 'halcyray'],
      ['mossback', 'ancientshell', 'bloomback'],
    ];
    for (const [line, first, second] of lines) {
      expect(keepOfferedFor(line, [line]), line).toBe(true);
      expect(keepOfferedFor(line, [first]), line).toBe(true);
      expect(keepOfferedFor(line, [second]), line).toBe(true);
      expect(keepOfferedFor(line, [first, second]), line).toBe(false);
      expect(keepOfferedFor(line, [line, line]), line).toBe(false);
    }
    // A line with no evolution at all (a single-stage species) never offers it.
    expect(keepOfferedFor('coralynx', ['coralynx'])).toBe(false);
    expect(keepOfferedFor('solmane', ['solmane'])).toBe(false);
  });

  it('recommends Teach for a new talent that does something, into an empty slot first', () => {
    const c = creature({ book: [roll('mossy-bed')], slots: [roll('mossy-bed')] });
    expect(recommend(roll('hard-to-move'), [c], false)).toEqual({
      choice: 'fuse',
      creatureId: 'c1',
    });
    const open = creature({ slots: [null] });
    expect(recommend(roll('hard-to-move'), [open], false)).toEqual({
      choice: 'teach',
      creatureId: 'c1',
    });
  });

  it('recommends Teach over an occupied slot only when the new talent is better', () => {
    const weak = roll('sunny-nap'); // rest between dungeon rooms
    const strong = roll('hard-to-move'); // a Guard's armor +5 pt
    const held = creature({ slots: [weak], book: [weak] });
    expect(recommend(strong, [held], false)).toEqual({ choice: 'teach', creatureId: 'c1' });
    // The other way round it is not better: Fuse instead.
    const heldStrong = creature({ slots: [strong], book: [strong] });
    expect(recommend(weak, [heldStrong], false)).toEqual({ choice: 'fuse', creatureId: 'c1' });
    // A golden version of what is held is better than the normal one.
    expect(recommend(roll('hard-to-move', true), [heldStrong], false)).toEqual({
      choice: 'teach',
      creatureId: 'c1',
    });
  });

  it('never recommends a talent that does nothing for the creature', () => {
    // Mend is for Supports: on a Guard it scores 0.
    expect(recommend(roll('shares-the-sun'), [creature()], false)).toEqual({
      choice: 'fuse',
      creatureId: 'c1',
    });
    // Keep beats Fuse when a branch is missing.
    expect(recommend(roll('shares-the-sun'), [creature()], true)).toEqual({ choice: 'keep' });
  });

  it('recommends Keep, then Fuse until 5, then Release', () => {
    const idle = roll('shares-the-sun');
    const full = creature({ fusionCount: 5, fusionPoints: 19 });
    expect(recommend(idle, [full], true)).toEqual({ choice: 'keep' });
    expect(recommend(idle, [full], false)).toEqual({ choice: 'release' });
    expect(recommend(idle, [creature({ fusionCount: 4, fusionPoints: 11 })], false)).toEqual({
      choice: 'fuse',
      creatureId: 'c1',
    });
    // With two creatures, the one that can still fuse takes it.
    expect(
      recommend(idle, [full, creature({ id: 'c2', fusionCount: 2, fusionPoints: 3 })], false),
    ).toEqual({
      choice: 'fuse',
      creatureId: 'c2',
    });
  });

  it('picks the creature that gains most, ties to the earlier; Teach carries no slot', () => {
    const a = creature({ id: 'a', slots: [roll('mossy-bed')], book: [roll('mossy-bed')] });
    const b = creature({ id: 'b', slots: [null] });
    expect(recommend(roll('hard-to-move'), [a, b], false)).toEqual({
      choice: 'teach',
      creatureId: 'b',
    });
    const twin = creature({ id: 'c', slots: [null] });
    expect(recommend(roll('hard-to-move'), [twin, b], false)).toMatchObject({ creatureId: 'c' });
    const two = creature({ slots: [roll('mossy-bed'), null], book: [roll('mossy-bed')] });
    expect(recommend(roll('hard-to-move'), [two], false)).toEqual({
      choice: 'teach',
      creatureId: 'c1',
    });
    // A book that already holds the talent is never taught it again.
    const holder = creature({ id: 'h', slots: [null], book: [roll('hard-to-move')] });
    expect(recommend(roll('hard-to-move'), [holder], false)).toEqual({
      choice: 'fuse',
      creatureId: 'h',
    });
  });

  it('releases for parts of its rarity, a shard of its element, and never Bait', () => {
    expect(releaseParts('common', 'tide')).toEqual({ scrap: 3 });
    expect(releaseParts('rare', 'grove')).toEqual({ scrap: 6, 'grove-shard': 1 });
    expect(releaseParts('epic', 'spark')).toEqual({
      scrap: 12,
      'spark-shard': 2,
      glimmer: 1,
    });
    for (const rarity of ['common', 'rare', 'epic'] as const) {
      expect(Object.keys(releaseParts(rarity, 'ember'))).not.toContain('bait');
    }
    expect(RULES.talents.release.common.shard).toBe(0);
  });
});

describe('branches in the content', () => {
  type Mut = { creatures: Record<string, unknown>[]; finaleAbilities: Record<string, unknown>[] };
  const raw = (): Mut =>
    clone({
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
    });
  const find = (pack: Mut, id: string): Record<string, unknown> => {
    const found = pack.creatures.find((c) => c['id'] === id);
    if (found === undefined) throw new Error(id);
    return found;
  };

  /**
   * Sproutle with a synthetic second form (Budfawn, with its own copy of Thornbuck's ability) in the
   * place of the shipped Sunfawn, so the loader's rules can be broken one at a time.
   */
  function withBudfawn(): Mut {
    const pack = raw();
    pack.creatures = pack.creatures.filter((c) => c['id'] !== 'sunfawn');
    pack.finaleAbilities = pack.finaleAbilities.filter((a) => a['id'] !== 'sunny-patch');
    const thornbuck = find(pack, 'thornbuck');
    const ability = pack.finaleAbilities.find(
      (a) => a['id'] === (thornbuck['ability'] as { id: string }).id,
    );
    pack.finaleAbilities.push({ ...ability, id: 'bud-patch', name: 'Bud Patch' });
    pack.creatures.push({
      ...thornbuck,
      id: 'budfawn',
      name: 'Budfawn',
      ability: { id: 'bud-patch' },
    });
    find(pack, 'sproutle')['altEvolvesTo'] = { species: 'budfawn', level: 15, essence: 20 };
    return pack;
  }

  it('accepts a line with a second branch and finds both', () => {
    const pack = loadContent(withBudfawn());
    expect(lineBranches(pack, 'sproutle')).toEqual(['thornbuck', 'budfawn']);
  });

  it('rejects a second branch without a first, the same twice, and one outside the line', () => {
    const noFirst = withBudfawn();
    delete find(noFirst, 'sproutle')['evolvesTo'];
    expect(() => loadContent(noFirst)).toThrow();
    const same = withBudfawn();
    find(same, 'sproutle')['altEvolvesTo'] = { species: 'thornbuck', level: 15, essence: 20 };
    expect(() => loadContent(same)).toThrow(/both branches|exactly one species/);
    const other = withBudfawn();
    find(other, 'sproutle')['altEvolvesTo'] = { species: 'voltaro', level: 15, essence: 20 };
    expect(() => loadContent(other)).toThrow(/own line|exactly one species/);
    const late = withBudfawn();
    find(late, 'sproutle')['altEvolvesTo'] = { species: 'budfawn', level: 40, essence: 20 };
    expect(() => loadContent(late)).toThrow(/above its level cap/);
  });

  it('requires one level and Essence price for both branches', () => {
    const dearer = withBudfawn();
    find(dearer, 'sproutle')['altEvolvesTo'] = { species: 'budfawn', level: 15, essence: 30 };
    expect(() => loadContent(dearer)).toThrow(/same level and Essence/);
    const later = withBudfawn();
    find(later, 'sproutle')['altEvolvesTo'] = { species: 'budfawn', level: 14, essence: 20 };
    expect(() => loadContent(later)).toThrow(/same level and Essence/);
  });

  it('does not ask the second branch to out-do the first stage, but the first still must', () => {
    // A sidegrade is fine as the second branch (Sunfawn's Sunny Patch is weaker than Bark Guard in places).
    expect(() => loadContent(withBudfawn())).not.toThrow();
    const weak = withBudfawn();
    const alt = weak.finaleAbilities.find((a) => a['id'] === 'bud-patch');
    alt!['effects'] = [{ op: 'rally', damageBp: 100, rounds: 1 }];
    expect(() => loadContent(weak)).not.toThrow();
    // The first branch (evolvesTo) must still be an upgrade.
    const weakFirst = raw();
    const first = weakFirst.finaleAbilities.find((a) => a['id'] === 'bark-guard-2');
    first!['effects'] = [{ op: 'rally', damageBp: 100, rounds: 1 }];
    expect(() => loadContent(weakFirst)).toThrow(/lacks the "shield_wall" effect/);
  });

  it('requires the second branch to be the target of one species only', () => {
    const pack = withBudfawn();
    find(pack, 'zipmouse')['altEvolvesTo'] = { species: 'budfawn', level: 15, essence: 20 };
    expect(() => loadContent(pack)).toThrow();
  });
});

describe('the Mire talents', () => {
  const mireGuard = { role: 'guard', element: 'mire' } as const;
  const mireSupport = { role: 'support', element: 'mire' } as const;
  const fold = (id: string) => foldTalent(def(id), false);

  it('has a pool for each Mire line of the usual size, with the three the design asked for', () => {
    for (const line of ['mudlump', 'squelch']) {
      const pool = talentPool(line);
      expect(pool.length, line).toBeGreaterThanOrEqual(POOL_SIZE.min);
      expect(pool.length, line).toBeLessThanOrEqual(POOL_SIZE.max);
    }
    expect(talentPool('mudlump').map((t) => t.id)).toContain('mud-off-its-back');
    expect(talentPool('squelch').map((t) => t.id)).toEqual(
      expect.arrayContaining(['sticks-around', 'low-croak']),
    );
  });

  it('Mud Off Its Back fills debuffResistBp on a Guard, Sticks Around debuffDurationTurns and Low Croak debuffPowerBp on a Support', () => {
    expect(wornEffects(mireGuard, [], [fold('mud-off-its-back')]).mods.debuffResistBp).toBe(2_500);
    expect(wornEffects(mireSupport, [], [fold('sticks-around')]).mods.debuffDurationTurns).toBe(1);
    expect(wornEffects(mireSupport, [], [fold('low-croak')]).mods.debuffPowerBp).toBe(2_000);
    // A golden talent is stronger (`talentValue` rounds it).
    expect(
      wornEffects(mireGuard, [], [foldTalent(def('mud-off-its-back'), true)]).mods.debuffResistBp,
    ).toBe(talentValue(def('mud-off-its-back'), true));
  });

  it('keeps the sheet within what the engine accepts: resist at most 100%, duration at most 10 turns', () => {
    const many = Array.from({ length: 6 }, () => fold('mud-off-its-back'));
    expect(wornEffects(mireGuard, [], many).mods.debuffResistBp).toBe(10_000);
    const long = Array.from({ length: 14 }, () => fold('sticks-around'));
    expect(wornEffects(mireSupport, [], long).mods.debuffDurationTurns).toBe(10);
  });
});
