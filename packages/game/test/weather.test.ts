import { describe, expect, it } from 'vitest';
import {
  RULES,
  SCALED_OPS,
  WEATHER_OPS,
  activeEffects,
  content,
  createSeededRng,
  dungeonExperience,
  dungeonScrapPerRoom,
  drawWeather,
  figure,
  jobWeather,
  journalChanceBp,
  loadWeather,
  mergeMods,
  raidExperience,
  rollTripLoot,
  tripExperience,
  weatherTimeMs,
  tripWeather,
  weatherBossAttacks,
  weatherContent,
  weatherDef,
  weatherLines,
  weatherLuck,
  weatherSheet,
  scaleStrength,
  weatherSky,
  weatherStrength,
  workshopExperience,
  workshopMods,
  xpWeather,
  type DrawContext,
  type WeatherDay,
} from '../src/index';
import weatherJson from '../src/content/data/weather.json';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const defs = (): Record<string, unknown>[] => clone(weatherJson);
const reactions = content.reactions.map((r) => ({ id: r.id }));
const places = new Set([
  'tidepools',
  'ember-caves',
  'moonlit-reef',
  'storm-ridge',
  'verdant-hollow',
]);

/** A day with the given Boon and Omen at a strength (x1 by default). */
function day(
  boon: string,
  omen: string | null = null,
  boonBp = 10_000,
  omenBp = 10_000,
): WeatherDay {
  return { day: '2026-10-17', boon, omen, wild: false, boonBp, omenBp };
}

describe('the weather content', () => {
  it('loads, with the starter list of the design (10 Boons, 10 Omens)', () => {
    expect(weatherContent.filter((d) => d.kind === 'boon')).toHaveLength(10);
    expect(weatherContent.filter((d) => d.kind === 'omen')).toHaveLength(10);
  });

  it('has nothing planned left: all 20 are live and can be drawn', () => {
    expect(weatherContent.filter((d) => d.status === 'planned')).toEqual([]);
    for (const id of ['kind-rain', 'morning-haze', 'bramble-season']) {
      expect(weatherDef(id)?.status).toBe('live');
      expect(weatherDef(id)?.planned).toBeUndefined();
      expect(activeEffects(day(id)).length).toBeGreaterThan(0);
    }
  });

  it('still draws the three that came last (Bramble Season only from Boss Rank 6)', () => {
    const seen = new Set<string>();
    const rng = createSeededRng('the-last-three');
    for (let i = 0; i < 600; i++) {
      const draw = drawWeather(rng, {
        rank: 7,
        festival: false,
        previousOmen: null,
        wildAllowed: false,
      });
      seen.add(draw.boon);
      if (draw.omen !== null) seen.add(draw.omen);
    }
    for (const id of ['kind-rain', 'morning-haze', 'bramble-season']) expect(seen).toContain(id);
    const early = createSeededRng('rank-four');
    for (let i = 0; i < 600; i++) {
      const draw = drawWeather(early, {
        rank: 4,
        festival: false,
        previousOmen: null,
        wildAllowed: false,
      });
      expect(draw.omen).not.toBe('bramble-season');
    }
  });

  it('never draws Morning Haze with Fair Winds (it cancels)', () => {
    const rng = createSeededRng('haze-cancel');
    for (let i = 0; i < 600; i++) {
      const draw = drawWeather(rng, {
        rank: 5,
        festival: false,
        previousOmen: null,
        wildAllowed: false,
      });
      expect(draw.boon === 'fair-winds' && draw.omen === 'morning-haze').toBe(false);
    }
  });

  it('uses every kind of effect at least once, and every effect text shows its number', () => {
    const used = new Set<string>(weatherContent.flatMap((d) => d.effects.map((e) => e.op)));
    // Every op the schema knows is used by a live Boon or Omen.
    expect(WEATHER_OPS.filter((op) => !used.has(op))).toEqual([]);
    for (const d of weatherContent) {
      for (const e of d.effects) {
        expect(e.text.includes('{n}'), `${d.id} ${e.op}`).toBe(SCALED_OPS.has(e.op));
      }
    }
  });

  it('lists every pair that cancels on both sides', () => {
    for (const d of weatherContent) {
      for (const other of d.cancels) expect(weatherDef(other)?.cancels).toContain(d.id);
    }
  });

  it('rejects a bad file with a message that names the problem', () => {
    const load = (edit: (d: Record<string, unknown>[]) => void): unknown => {
      const raw = defs();
      edit(raw);
      return loadWeather(raw, { reactions }, places);
    };
    const find = (raw: Record<string, unknown>[], id: string): Record<string, unknown> =>
      raw.find((d) => d.id === id) as Record<string, unknown>;
    expect(() => load(() => undefined)).not.toThrow();
    expect(() => load((d) => d.push({ ...find(d, 'fair-winds') }))).toThrow(/duplicate id/);
    expect(() => load((d) => (find(d, 'heavy-rain').cancels = []))).toThrow(/must list/);
    expect(() => load((d) => (find(d, 'fair-winds').cancels = ['nope']))).toThrow(/unknown "nope"/);
    expect(() => load((d) => (find(d, 'fair-winds').cancels = ['market-day']))).toThrow(
      /same kind/,
    );
    // A planned one (an idea that waits for an engine hook) has a note and no effects.
    expect(() =>
      load((d) => {
        const rain = find(d, 'kind-rain');
        rain.status = 'planned';
        rain.effects = [];
        rain.planned = 'Waits for a hook.';
      }),
    ).not.toThrow();
    expect(() =>
      load((d) => {
        const rain = find(d, 'kind-rain');
        rain.status = 'planned';
        rain.planned = 'Waits for a hook.';
      }),
    ).toThrow(/must not have effects/);
    expect(() =>
      load((d) => {
        const rain = find(d, 'kind-rain');
        rain.status = 'planned';
        rain.effects = [];
      }),
    ).toThrow(/needs a "planned"/);
    expect(() => load((d) => (find(d, 'kind-rain').planned = 'Done already.'))).toThrow(
      /must not have a "planned"/,
    );
    expect(() => load((d) => (find(d, 'fair-winds').effects = []))).toThrow(/no effect/);
    expect(() => load((d) => (find(d, 'fair-winds').minRank = 3))).toThrow(/no minRank/);
    expect(() => load((d) => (find(d, 'fair-winds').wild = true))).toThrow(/no minRank or wild/);
    const fair = (d: Record<string, unknown>[]): Record<string, unknown>[] =>
      find(d, 'fair-winds').effects as Record<string, unknown>[];
    expect(() =>
      load((d) => ((fair(d)[1] as Record<string, unknown>).text = 'Trips are faster.')),
    ).toThrow(/\{n\}/);
    expect(() => load((d) => ((fair(d)[0] as Record<string, unknown>).field = 'bogusBp'))).toThrow(
      /schema/,
    );
    expect(() =>
      load((d) => {
        const high = find(d, 'high-water').effects as Record<string, unknown>[];
        (high[0] as Record<string, unknown>).reactions = ['nope'];
      }),
    ).toThrow(/unknown reaction/);
    expect(() =>
      load((d) => {
        const high = find(d, 'high-water').effects as Record<string, unknown>[];
        (high[1] as Record<string, unknown>).places = ['nowhere'];
      }),
    ).toThrow(/unknown destination/);
    expect(() => load((d) => (find(d, 'fair-winds').bubbles = []))).toThrow();
    expect(() => load((d) => (find(d, 'fair-winds').extra = 1))).toThrow();
  });
});

describe('the strength by Boss Rank (section 10.1)', () => {
  it('follows the table of the design', () => {
    expect(weatherStrength(1)).toEqual({ boonBp: 10_000, omenBp: 0 });
    expect(weatherStrength(2)).toEqual({ boonBp: 10_000, omenBp: 0 });
    expect(weatherStrength(3)).toEqual({ boonBp: 10_000, omenBp: 10_000 });
    expect(weatherStrength(5)).toEqual({ boonBp: 10_000, omenBp: 10_000 });
    expect(weatherStrength(6)).toEqual({ boonBp: 12_500, omenBp: 15_000 });
    expect(weatherStrength(9)).toEqual({ boonBp: 12_500, omenBp: 15_000 });
    expect(weatherStrength(10)).toEqual({ boonBp: 15_000, omenBp: 20_000 });
    expect(weatherStrength(13)).toEqual({ boonBp: 15_000, omenBp: 20_000 });
    expect(weatherStrength(14)).toEqual({ boonBp: 15_000, omenBp: 25_000 });
    expect(weatherStrength(40)).toEqual({ boonBp: 15_000, omenBp: 25_000 });
  });

  it('treats a rank below 1 like rank 1', () => {
    expect(weatherStrength(0)).toEqual(weatherStrength(1));
  });
});

describe('drawing a day', () => {
  const base: DrawContext = { rank: 5, festival: false, previousOmen: null, wildAllowed: true };

  it('is deterministic for a seed and always draws a live Boon', () => {
    const a = drawWeather(createSeededRng('x'), base);
    const b = drawWeather(createSeededRng('x'), base);
    expect(a).toEqual(b);
    expect(weatherDef(a.boon)?.kind).toBe('boon');
    expect(weatherDef(a.boon)?.status).toBe('live');
  });

  it('gives no Omen at Boss Rank 1 and 2, and an Omen from 3', () => {
    const rng = createSeededRng('ranks');
    for (let i = 0; i < 60; i++) {
      expect(drawWeather(rng, { ...base, rank: 1 }).omen).toBeNull();
      expect(drawWeather(rng, { ...base, rank: 2 }).omen).toBeNull();
      const three = drawWeather(rng, { ...base, rank: 3 });
      expect(three.omen).not.toBeNull();
      expect(three.omenBp).toBe(10_000);
    }
  });

  it('gives Boons only in a Festival week', () => {
    const rng = createSeededRng('festival');
    for (let i = 0; i < 60; i++) {
      const draw = drawWeather(rng, { ...base, rank: 12, festival: true });
      expect(draw.omen).toBeNull();
      expect(draw.wild).toBe(false);
    }
  });

  it('never repeats the Omen of the day before and never meets a Boon that cancels it', () => {
    const rng = createSeededRng('never-twice');
    let previous: string | null = null;
    for (let i = 0; i < 3000; i++) {
      const draw = drawWeather(rng, { ...base, rank: 8, previousOmen: previous });
      expect(draw.omen).not.toBeNull();
      expect(draw.omen).not.toBe(previous);
      expect(weatherDef(draw.boon)?.cancels).not.toContain(draw.omen);
      previous = draw.omen;
    }
  });

  it('reaches every live Boon and every live normal Omen over many days', () => {
    const rng = createSeededRng('reach');
    const boons = new Set<string>();
    const omens = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const draw = drawWeather(rng, { ...base, rank: 8, wildAllowed: false });
      boons.add(draw.boon);
      if (draw.omen !== null) omens.add(draw.omen);
    }
    const live = (kind: string) =>
      weatherContent
        .filter((d) => d.kind === kind && d.status === 'live' && d.wild !== true)
        .map((d) => d.id)
        .sort();
    expect([...boons].sort()).toEqual(live('boon'));
    expect([...omens].sort()).toEqual(live('omen'));
  });

  it('draws a wild Omen only from rank 10, only when allowed, and not in a Festival', () => {
    const wildIn = (ctx: DrawContext, days = 600): number => {
      const rng = createSeededRng('wild');
      let n = 0;
      for (let i = 0; i < days; i++) if (drawWeather(rng, ctx).wild) n += 1;
      return n;
    };
    expect(wildIn({ ...base, rank: 9 })).toBe(0);
    expect(wildIn({ ...base, rank: 12, wildAllowed: false })).toBe(0);
    expect(wildIn({ ...base, rank: 12, festival: true })).toBe(0);
    const n = wildIn({ ...base, rank: 12 });
    // 20% of 600 days, give or take.
    expect(n).toBeGreaterThan(70);
    expect(n).toBeLessThan(170);
    const rng = createSeededRng('wild-omen');
    for (let i = 0; i < 400; i++) {
      const d = drawWeather(rng, { ...base, rank: 12 });
      if (d.wild) expect(weatherDef(d.omen ?? '')?.wild).toBe(true);
      else if (d.omen !== null) expect(weatherDef(d.omen)?.wild).not.toBe(true);
    }
  });

  it('scales the Boon and the Omen by the rank it was drawn at', () => {
    const rng = createSeededRng('scale');
    expect(drawWeather(rng, { ...base, rank: 7 })).toMatchObject({
      boonBp: 12_500,
      omenBp: 15_000,
    });
    expect(drawWeather(rng, { ...base, rank: 14 })).toMatchObject({
      boonBp: 15_000,
      omenBp: 25_000,
    });
    expect(drawWeather(rng, { ...base, rank: 1 })).toMatchObject({ boonBp: 10_000, omenBp: 0 });
  });

  it('uses the random source it is given, in a fixed order', () => {
    let calls = 0;
    const counting = {
      nextU32: (): number => {
        calls += 1;
        return 7;
      },
    };
    drawWeather(counting, { ...base, rank: 3 });
    // The Boon, then the Omen (no wild die below rank 10): two draws when nothing is rejected.
    expect(calls).toBe(2);
    calls = 0;
    drawWeather(counting, { ...base, rank: 10 });
    expect(calls).toBe(3);
  });
});

describe('fights: the sheet, luck and boss attacks', () => {
  const guard = { role: 'guard', element: 'tide' } as const;
  const support = { role: 'support', element: 'grove' } as const;
  const setter = { role: 'setter', element: 'ember' } as const;

  it('gives no sheet on a day without effects, and none for a missing day', () => {
    expect(weatherSheet(null, setter)).toBeUndefined();
    expect(weatherSheet(day('market-day'), setter)).toBeUndefined();
  });

  it('Fair Winds: the first hit, at the day strength', () => {
    expect(weatherSheet(day('fair-winds'), setter)).toEqual({ firstHitBp: 1_000 });
    expect(weatherSheet(day('fair-winds', null, 12_500), setter)).toEqual({ firstHitBp: 1_200 });
    expect(weatherSheet(day('fair-winds', null, 15_000), setter)).toEqual({ firstHitBp: 1_500 });
  });

  it("Warm Hearth boosts Supports only, and Long Shadows weakens their boost and everyone's healing", () => {
    expect(weatherSheet(day('warm-hearth'), support)).toEqual({ boostBp: 400 });
    expect(weatherSheet(day('warm-hearth'), setter)).toBeUndefined();
    expect(weatherSheet(day('fair-winds', 'long-shadows'), support)).toEqual({
      firstHitBp: 1_000,
      boostBp: -400,
      healReceivedBp: -2_500,
    });
    expect(weatherSheet(day('fair-winds', 'long-shadows', 10_000, 20_000), setter)).toEqual({
      firstHitBp: 1_000,
      healReceivedBp: -5_000,
    });
  });

  it('High Water and Bonfire Night: the two reactions each', () => {
    expect(weatherSheet(day('high-water'), setter)).toEqual({
      reactionBp: { steam: 1_500, overload: 1_500 },
    });
    expect(weatherSheet(day('bonfire-night'), setter)).toEqual({
      reactionBp: { wildfire: 1_500, grounding: 1_500 },
    });
  });

  it('Lantern Light adds a round and never scales it; Quiet Night pierces the adaptation', () => {
    expect(weatherSheet(day('lantern-light', null, 15_000), setter)).toEqual({ lingerRounds: 1 });
    expect(weatherSheet(day('quiet-night'), setter)).toEqual({ pierceBp: 2_500 });
    expect(weatherSheet(day('quiet-night', null, 15_000), setter)).toEqual({ pierceBp: 3_700 });
  });

  it('Heavy Rain makes everyone take more area damage; Restless Wind loosens Guards only', () => {
    expect(weatherSheet(day('market-day', 'heavy-rain'), setter)).toEqual({ areaBp: -1_000 });
    expect(weatherSheet(day('market-day', 'heavy-rain', 10_000, 15_000), setter)).toEqual({
      areaBp: -1_500,
    });
    expect(weatherSheet(day('market-day', 'restless-wind'), guard)).toEqual({ coverBp: -1_000 });
    expect(weatherSheet(day('market-day', 'restless-wind'), setter)).toBeUndefined();
  });

  it('Heatwave: foes hit 8% harder, and Ember foes exactly 15% harder instead', () => {
    const sheet = weatherSheet(day('market-day', 'heatwave'), setter);
    expect(sheet?.takenBp).toBe(-800);
    // Ember foes: the two cuts multiply to 1.15 (the data's 15%), to a basis point.
    const ward = sheet?.wardBp?.ember ?? 0;
    expect(ward).toBeLessThan(0);
    const factor = ((10_000 - ward) * (10_000 + 800)) / 10_000;
    expect(Math.abs(factor - 11_500)).toBeLessThan(2);
    // Rank scaling: x2 makes it 16% and 30%.
    const strong = weatherSheet(day('market-day', 'heatwave', 10_000, 20_000), setter);
    expect(strong?.takenBp).toBe(-1_600);
    const f2 = ((10_000 - (strong?.wardBp?.ember ?? 0)) * 11_600) / 10_000;
    expect(Math.abs(f2 - 13_000)).toBeLessThan(2);
  });

  it('merges onto the gear sheet by adding, and stays inside what the engine accepts', () => {
    expect(mergeMods(undefined, undefined)).toBeUndefined();
    expect(mergeMods({ strikeBp: 5 }, undefined)).toEqual({ strikeBp: 5 });
    expect(mergeMods(undefined, { firstHitBp: 1 })).toEqual({ firstHitBp: 1 });
    expect(
      mergeMods(
        { firstHitBp: 500, reactionBp: { steam: 100 }, lingerRounds: 3, pierceBp: 9_000 },
        {
          firstHitBp: 1_000,
          reactionBp: { steam: 1_500, overload: 10 },
          lingerRounds: 1,
          pierceBp: 2_500,
        },
      ),
    ).toEqual({
      firstHitBp: 1_500,
      reactionBp: { steam: 1_600, overload: 10 },
      lingerRounds: 3,
      pierceBp: 10_000,
    });
    expect(mergeMods({ takenBp: 9_000 }, { takenBp: 5_000 })).toEqual({ takenBp: 10_000 });
    expect(mergeMods({ areaBp: -99_000 }, { areaBp: -5_000 })).toEqual({ areaBp: -100_000 });
    expect(mergeMods({ ignoreSilence: 1 }, { ignoreSilence: 0 })).toEqual({ ignoreSilence: 1 });
    expect(mergeMods({ wardBp: { ember: 3_000 } }, { wardBp: { ember: -4_000 } })).toEqual({
      wardBp: { ember: -1_000 },
    });
  });

  it('raises the crit chances on Clear Skies and Static Sky, and returns the same luck when nothing changes', () => {
    const luck = RULES.combat.luck;
    expect(weatherLuck(null, luck)).toBe(luck);
    expect(weatherLuck(day('market-day'), luck)).toBe(luck);
    expect(weatherLuck(day('clear-skies'), luck).critChanceBp).toBe(luck.critChanceBp + 300);
    expect(weatherLuck(day('clear-skies', 'static-sky', 15_000, 15_000), luck)).toMatchObject({
      critChanceBp: luck.critChanceBp + 450,
      bossCritChanceBp: luck.bossCritChanceBp + 600,
    });
    expect(weatherLuck(day('market-day', 'static-sky'), luck).critChanceBp).toBe(luck.critChanceBp);
  });

  it('Stormfront adds one boss attack, at most three in all', () => {
    const storm = { ...day('market-day', 'stormfront'), wild: true };
    expect(weatherBossAttacks(null, 1)).toBe(1);
    expect(weatherBossAttacks(storm, 1)).toBe(2);
    expect(weatherBossAttacks(storm, 2)).toBe(3);
    expect(weatherBossAttacks(storm, 3)).toBe(3);
    // The count never scales with the Omen's strength.
    expect(weatherBossAttacks({ ...storm, omenBp: 25_000 }, 1)).toBe(2);
  });

  it('Market Day adds a scrap to every dungeon room, fixed at any strength', () => {
    expect(dungeonScrapPerRoom(day('market-day'))).toBe(1);
    expect(dungeonScrapPerRoom(day('market-day', null, 15_000))).toBe(1);
    expect(dungeonScrapPerRoom(day('fair-winds'))).toBe(0);
    expect(dungeonScrapPerRoom(null)).toBe(0);
  });
});

describe('Kind Rain, Morning Haze and Bramble Season', () => {
  it("weatherSky is plain on a plain day and reads the three at the day's strength", () => {
    expect(weatherSky(null)).toEqual({ rainHealBp: 0, haze: false, brambleBp: 0 });
    expect(weatherSky(day('fair-winds', 'heatwave'))).toEqual({
      rainHealBp: 0,
      haze: false,
      brambleBp: 0,
    });
    expect(weatherSky(day('kind-rain'))).toEqual({ rainHealBp: 200, haze: false, brambleBp: 0 });
    // Boons scale by the Boon's strength: x1.25 at Boss Rank 6, x1.5 at 10.
    expect(weatherSky(day('kind-rain', null, 12_500)).rainHealBp).toBe(250);
    expect(weatherSky(day('kind-rain', null, 15_000)).rainHealBp).toBe(300);
    expect(weatherSky(day('market-day', 'morning-haze')).haze).toBe(true);
    // The haze is a count of turns, not a number: it never scales.
    expect(weatherSky(day('market-day', 'morning-haze', 10_000, 25_000))).toEqual({
      rainHealBp: 0,
      haze: true,
      brambleBp: 0,
    });
    expect(weatherSky(day('market-day', 'bramble-season')).brambleBp).toBe(1_200);
    // Omens scale faster: x1.5 at Boss Rank 6 is 18%, x2.5 at 14 is 30%.
    expect(weatherSky(day('market-day', 'bramble-season', 12_500, 15_000)).brambleBp).toBe(1_800);
    expect(weatherSky(day('market-day', 'bramble-season', 15_000, 25_000)).brambleBp).toBe(3_000);
  });

  it('Kind Rain touches only the sky and the two places for trips; Haze only time', () => {
    const rain = day('kind-rain');
    expect(weatherSheet(rain, { role: 'guard', element: 'tide' })).toBeUndefined();
    expect(weatherLuck(rain, RULES.combat.luck)).toBe(RULES.combat.luck);
    expect(weatherBossAttacks(rain, 1)).toBe(1);
    const trip = (destination: string) => ({ destination, length: 'long' as const });
    expect(tripWeather(rain, trip('tidepools')).partsBp).toBe(2_500);
    expect(tripWeather(rain, trip('verdant-hollow')).partsBp).toBe(2_500);
    expect(tripWeather(rain, trip('ember-caves')).partsBp).toBe(0);
    expect(tripWeather(day('kind-rain', null, 15_000), trip('tidepools')).partsBp).toBe(3_700);
    const haze = day('market-day', 'morning-haze');
    expect(tripWeather(haze, trip('tidepools')).timeBp).toBe(1_000);
    expect(
      tripWeather(day('market-day', 'morning-haze', 10_000, 20_000), trip('storm-ridge')).timeBp,
    ).toBe(2_000);
    expect(weatherSheet(haze, { role: 'guard', element: 'tide' })).toBeUndefined();
  });

  it('the schema checks the three new effects', () => {
    const load = (id: string, edit: (e: Record<string, unknown>) => void): unknown => {
      const raw = defs();
      const def = raw.find((d) => d.id === id) as Record<string, unknown>;
      edit((def.effects as Record<string, unknown>[])[0] as Record<string, unknown>);
      return loadWeather(raw, { reactions }, places);
    };
    expect(() => load('kind-rain', (e) => (e.bp = 0))).toThrow(/schema/);
    expect(() => load('kind-rain', (e) => (e.bp = 1_001))).toThrow(/schema/);
    expect(() => load('kind-rain', (e) => (e.text = 'Heals.'))).toThrow(/\{n\}/);
    expect(() => load('bramble-season', (e) => (e.bp = 10_001))).toThrow(/schema/);
    expect(() => load('bramble-season', (e) => (e.unknown = 1))).toThrow(/schema/);
    expect(() => load('morning-haze', (e) => (e.text = 'Skips {n} turns.'))).toThrow(/no number/);
  });

  it('a stored day of a new Boon or Omen from before they were live reads as nothing, not an error', () => {
    expect(weatherSky(day('gone-boon', 'gone-omen'))).toEqual({
      rainHealBp: 0,
      haze: false,
      brambleBp: 0,
    });
  });
});

describe('trips', () => {
  const trip = (destination: string, length: 'short' | 'medium' | 'long' | 'day' = 'long') => ({
    destination,
    length,
  });

  it('shortens and lengthens trips by the day (Fair Winds, Muddy Roads, Heavy Rain)', () => {
    expect(tripWeather(day('fair-winds'), trip('tidepools')).timeBp).toBe(-1_000);
    expect(tripWeather(day('fair-winds', null, 15_000), trip('tidepools')).timeBp).toBe(-1_500);
    expect(tripWeather(day('market-day', 'muddy-roads'), trip('tidepools'))).toMatchObject({
      timeBp: 1_500,
      supplyBp: -3_000,
    });
    expect(
      tripWeather(day('market-day', 'heavy-rain', 10_000, 20_000), trip('tidepools')).timeBp,
    ).toBe(2_000);
    expect(weatherTimeMs(3_600_000, -1_000)).toBe(3_240_000);
    expect(weatherTimeMs(3_600_000, 1_500)).toBe(4_140_000);
    expect(weatherTimeMs(3_600_000, 0)).toBe(3_600_000);
    expect(weatherTimeMs(3_600_000, -20_000)).toBe(60_000);
  });

  it('High Water and Bonfire Night: one extra roll on 12 h trips and longer, at their places only', () => {
    const high = day('high-water');
    expect(tripWeather(high, trip('tidepools', 'long')).extraRolls).toBe(1);
    expect(tripWeather(high, trip('moonlit-reef', 'day')).extraRolls).toBe(1);
    expect(tripWeather(high, trip('tidepools', 'medium')).extraRolls).toBe(0);
    expect(tripWeather(high, trip('ember-caves', 'long')).extraRolls).toBe(0);
    const bonfire = day('bonfire-night', null, 15_000);
    expect(tripWeather(bonfire, trip('storm-ridge', 'long')).extraRolls).toBe(1);
    expect(tripWeather(bonfire, trip('tidepools', 'long')).extraRolls).toBe(0);
  });

  it('Clear Skies, Lantern Light, Heatwave and Quiet Night each touch their own number', () => {
    expect(tripWeather(day('clear-skies'), trip('tidepools')).rarityBp).toBe(100);
    expect(tripWeather(day('lantern-light'), trip('tidepools')).journalBp).toBe(10_000);
    expect(tripWeather(day('market-day', 'heatwave'), trip('tidepools')).shardsBp).toBe(-2_500);
    expect(tripWeather(day('quiet-night'), trip('tidepools')).reefOpen).toBe(true);
    expect(tripWeather(day('fair-winds'), trip('tidepools')).reefOpen).toBe(false);
  });

  it('puts the experience of the day on the trip too', () => {
    expect(tripWeather(day('hearty-breakfast'), trip('tidepools'))).toMatchObject({
      xpBp: 2_500,
      treatMultiplier: 3,
    });
    expect(tripWeather(day('market-day', 'cold-snap'), trip('tidepools'))).toMatchObject({
      xpBp: -2_000,
      treatMultiplier: null,
    });
  });

  it('a day without weather is no change at all', () => {
    expect(tripWeather(null, trip('tidepools'))).toEqual({
      timeBp: 0,
      partsBp: 0,
      shardsBp: 0,
      supplyBp: 0,
      extraRolls: 0,
      rarityBp: 0,
      journalBp: 0,
      reefOpen: false,
      xpBp: 0,
      treatMultiplier: null,
    });
  });

  it('fewer shards and supplies on a bad day, in the loot the trip rolls', () => {
    const ctx = {
      length: 'long' as const,
      shardElement: 'tide' as const,
      role: 'setter' as const,
      kit: [],
      stars: 0,
      milestonePartsBp: 0,
      twist: null,
      rank: 1,
    };
    const count = (extra: object): { shards: number; supplies: number } => {
      const rng = createSeededRng('loot');
      let shards = 0;
      let supplies = 0;
      for (let i = 0; i < 3000; i++) {
        const loot = rollTripLoot(
          rng,
          { ...ctx, ...extra },
          { completed: true, caught: 0, rolls: 1 },
        );
        shards += loot.parts['tide-shard'] ?? 0;
        supplies += loot.supplies.length;
      }
      return { shards, supplies };
    };
    const plain = count({});
    const bad = count({ weatherShardsBp: -2_500, weatherSupplyBp: -3_000 });
    expect(bad.shards).toBeLessThan(plain.shards * 0.85);
    expect(bad.shards).toBeGreaterThan(plain.shards * 0.65);
    expect(bad.supplies).toBeLessThan(plain.supplies * 0.8);
    // The best case: -100% leaves none, and more parts leave more shards.
    expect(count({ weatherShardsBp: -10_000 }).shards).toBe(0);
    expect(count({ weatherPartsBp: 5_000 }).shards).toBeGreaterThan(plain.shards);
  });

  it('Lantern Light doubles the journal chance and never goes above certain', () => {
    expect(journalChanceBp('long', null)).toBe(1_000);
    expect(journalChanceBp('long', null, 10_000)).toBe(2_000);
    expect(journalChanceBp('long', null, 1_000_000)).toBe(10_000);
    expect(journalChanceBp('long', null, -20_000)).toBe(0);
  });
});

describe('experience and the Workshop', () => {
  it('Hearty Breakfast: +25% and a treat triples; Cold Snap: -20%; a day without weather changes nothing', () => {
    const hearty = xpWeather(day('hearty-breakfast'));
    expect(hearty).toEqual({ bp: 2_500, treatMultiplier: 3 });
    expect(tripExperience('long', false)).toBe(RULES.experience.trip.long);
    expect(tripExperience('long', false, hearty)).toBe(
      Math.floor((RULES.experience.trip.long * 12_500) / 10_000),
    );
    expect(tripExperience('long', true, hearty)).toBe(
      Math.floor((RULES.experience.trip.long * 3 * 12_500) / 10_000),
    );
    expect(tripExperience('long', true)).toBe(RULES.experience.trip.long * 2);
    const cold = xpWeather(day('market-day', 'cold-snap'));
    expect(cold).toEqual({ bp: -2_000, treatMultiplier: null });
    expect(tripExperience('long', true, cold)).toBe(
      Math.floor((RULES.experience.trip.long * 2 * 8_000) / 10_000),
    );
    expect(xpWeather(null)).toEqual({ bp: 0, treatMultiplier: null });
  });

  it('applies to every activity that pays experience', () => {
    const hearty = xpWeather(day('hearty-breakfast'));
    expect(dungeonExperience(3, true, false, hearty)).toBeGreaterThan(
      dungeonExperience(3, true, false),
    );
    expect(raidExperience('finale', true, hearty)).toBeGreaterThan(raidExperience('finale', true));
    expect(workshopExperience(360, true, hearty)).toBeGreaterThan(workshopExperience(360, true));
    // A raid takes no treat, so a treat multiplier never reaches it.
    expect(raidExperience('phase1', false, { bp: 0, treatMultiplier: 3 })).toBe(
      raidExperience('phase1', false),
    );
  });

  it('Warm Hearth and Cold Snap: Workshop time, Hearty Breakfast: experience, on a job', () => {
    expect(jobWeather(day('warm-hearth'))).toEqual({
      timeBp: -1_500,
      xpBp: 0,
      treatMultiplier: null,
    });
    expect(jobWeather(day('hearty-breakfast', null))).toEqual({
      timeBp: 0,
      xpBp: 2_500,
      treatMultiplier: 3,
    });
    expect(jobWeather(day('market-day', 'cold-snap', 10_000, 20_000))).toEqual({
      timeBp: 3_000,
      xpBp: -4_000,
      treatMultiplier: null,
    });
    expect(jobWeather(null)).toEqual({ timeBp: 0, xpBp: 0, treatMultiplier: null });
  });

  it('Market Day boosts only the first craft and the first 2 dismantle jobs of the day', () => {
    const market = day('market-day');
    expect(workshopMods(market, 'craft', 0)).toEqual({ stepUpBonusBp: 500 });
    expect(workshopMods(market, 'craft', 1)).toEqual({});
    expect(workshopMods(market, 'craft', 5)).toEqual({});
    expect(workshopMods(market, 'dismantle', 0)).toEqual({ dismantleTopOfRange: true });
    expect(workshopMods(market, 'dismantle', 1)).toEqual({ dismantleTopOfRange: true });
    expect(workshopMods(market, 'dismantle', 2)).toEqual({});
    expect(workshopMods(market, 'dismantle', 30)).toEqual({});
    // Strength raises the step-up (rank 6 to 9: x1.25), never the number of boosted actions.
    expect(workshopMods(day('market-day', null, 12_500), 'craft', 0)).toEqual({
      stepUpBonusBp: 600,
    });
    expect(workshopMods(day('market-day', null, 15_000), 'craft', 1)).toEqual({});
    expect(workshopMods(day('fair-winds'), 'craft', 0)).toEqual({});
    expect(workshopMods(null, 'dismantle', 0)).toEqual({});
  });
});

describe('words', () => {
  it('formats a figure as a whole percent or with one decimal', () => {
    expect(figure(1_000)).toBe('10');
    expect(figure(1_250)).toBe('12.5');
    expect(figure(1_562)).toBe('15.6');
    expect(figure(-400)).toBe('4');
    expect(figure(50)).toBe('0.5');
  });

  it('writes the real numbers at the day strength, in the right column', () => {
    expect(weatherLines('fair-winds', 10_000)).toEqual({
      fight: ["Every creature's first hit deals 10% more."],
      trips: ['Trips take 10% less time.'],
    });
    expect(weatherLines('fair-winds', 15_000).trips).toEqual(['Trips take 15% less time.']);
    expect(weatherLines('heatwave', 10_000).fight).toEqual([
      'Foes hit 8% harder (Ember foes 15% instead).',
    ]);
    expect(weatherLines('heatwave', 20_000).fight).toEqual([
      'Foes hit 16% harder (Ember foes 30% instead).',
    ]);
    expect(weatherLines('market-day', 10_000)).toEqual({
      fight: ['Dungeon rooms give +1 scrap.'],
      trips: [
        'Your first craft today gets +5 pt one-step-up chance, and your first 2 dismantle jobs refund the top of their range.',
      ],
    });
    expect(weatherLines('stormfront', 25_000).fight).toEqual([
      'The boss makes one more plain attack each round.',
    ]);
  });

  it('writes the three new ones with the numbers of the day', () => {
    expect(weatherLines('kind-rain', 10_000)).toEqual({
      fight: ['Every creature heals 2% of its max HP at the start of each round.'],
      trips: ['Trips to the Tidepools and the Verdant Hollow find 25% more parts.'],
    });
    expect(weatherLines('kind-rain', 15_000).fight).toEqual([
      'Every creature heals 3% of its max HP at the start of each round.',
    ]);
    expect(weatherLines('morning-haze', 10_000)).toEqual({
      fight: ['The first creature of each row (the left one in the dungeon) skips its first turn.'],
      trips: ['Trips take 10% longer.'],
    });
    expect(weatherLines('bramble-season', 15_000).fight).toEqual([
      'The first reaction each round sends 18% of its bonus damage back at the creature that set it off.',
    ]);
  });

  it('writes nothing for a missing or an unknown one', () => {
    expect(weatherLines('nope', 10_000)).toEqual({ fight: [], trips: [] });
  });
});

describe('scaled numbers a player can read', () => {
  it('rounds towards zero to whole percent from 10 up and to halves below', () => {
    expect(scaleStrength(2_500, 12_500)).toBe(3_100);
    expect(scaleStrength(300, 12_500)).toBe(350);
    expect(scaleStrength(200, 12_500)).toBe(250);
    expect(scaleStrength(-1_000, 15_000)).toBe(-1_500);
    expect(scaleStrength(-500, 12_500)).toBe(-600);
  });
});
