import { describe, expect, it } from 'vitest';
import {
  RULES,
  bossAttacksAtRank,
  content,
  createSeededRng,
  itemOf,
  seasonOf,
  weatherDef,
  weatherStrength,
  type WeatherDay,
} from '@creatures/game';
import { DEFAULT_MIX } from '../src/archetypes';
import { buildRun, dayModifiers, playDungeonDay } from '../src/dungeon';
import { runEconomy } from '../src/economy';
import { GEAR_POLICY, claimJobs, startJobs, type GearContext } from '../src/gear';
import { fightFor, openRaidWeek } from '../src/raid';
import { clonePlayer, createPlayer, type SimPlayer } from '../src/state';
import { sendTrips, type TripContext } from '../src/trips';
import { Sky, forcedDay, weekSky } from '../src/weather';
import { parseWeatherCli, main } from '../src/weather-cli';
import { runEffectStudy, studyWeathers, weatherMarkdown } from '../src/weather-study';
import type { SimItem } from '../src/data';

const WEEK = 7;

describe('the sim sky', () => {
  it('draws the same days for a seed, and other days for another seed', () => {
    const run = (seed: string): WeatherDay[] => {
      const sky = new Sky(seed, 0);
      return Array.from({ length: 28 }, (_, d) => sky.day(d, 10));
    };
    expect(run('sky-a')).toEqual(run('sky-a'));
    expect(run('sky-a')).not.toEqual(run('sky-b'));
  });

  it('is drawn in order, and a day asked for again is the same day', () => {
    const sky = new Sky('order', 0);
    expect(() => sky.day(3, 1)).toThrow(RangeError);
    const first = sky.day(0, 1);
    expect(sky.day(0, 14)).toBe(first);
    expect(sky.day(1, 1).day).toBe('1');
  });

  it('gives Boons only before Boss Rank 3, and never the same Omen two days running', () => {
    const low = new Sky('low', 0);
    for (let d = 0; d < 28; d++) {
      const day = low.day(d, 2);
      expect(day.omen).toBeNull();
      expect(day.boonBp).toBe(weatherStrength(2).boonBp);
    }
    const high = new Sky('high', 3);
    let before: string | null = null;
    let omens = 0;
    for (let d = 0; d < 140; d++) {
      const day = high.day(d, 12);
      const festival = seasonOf(3 + Math.floor(d / WEEK)).festival;
      if (festival) expect(day.omen, `day ${String(d)} is in a Festival week`).toBeNull();
      if (day.omen !== null) {
        omens += 1;
        expect(day.omen).not.toBe(before);
        expect(day.omenBp).toBe(weatherStrength(12).omenBp);
      }
      before = day.omen;
    }
    expect(omens).toBeGreaterThan(40);
  });

  it('draws at most one wild Omen a week, never on the first day, and never in a Festival week', () => {
    let wild = 0;
    for (const seed of ['w1', 'w2', 'w3', 'w4']) {
      const sky = new Sky(seed, 0);
      const perWeek = new Map<number, number>();
      for (let d = 0; d < 7 * 40; d++) {
        const day = sky.day(d, 14);
        if (!day.wild) continue;
        wild += 1;
        const week = Math.floor(d / WEEK);
        expect(d).toBeGreaterThan(0);
        expect(day.omen).toBe('stormfront');
        expect(seasonOf(week).festival).toBe(false);
        perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
      }
      for (const n of perWeek.values()) expect(n).toBe(1);
    }
    expect(wild).toBeGreaterThan(0);
    // Below the wild rank none is ever drawn.
    const tame = new Sky('tame', 0);
    for (let d = 0; d < 140; d++)
      expect(tame.day(d, RULES.weather.wildFromRank - 1).wild).toBe(false);
  });
});

describe('a raid week under the sky', () => {
  it('draws three days in a row for the three stages: no Omen twice running, one wild at most, none in a Festival week', () => {
    for (let i = 0; i < 60; i++) {
      const sky = weekSky(createSeededRng(`ws:${String(i)}`), 14, false);
      const days = [sky.phase1, sky.phase2, sky.finale];
      expect(days.filter((d) => d.wild).length).toBeLessThanOrEqual(1);
      expect(sky.phase1.omen === null || sky.phase1.omen !== sky.phase2.omen).toBe(true);
      expect(sky.phase2.omen === null || sky.phase2.omen !== sky.finale.omen).toBe(true);
      const festival = weekSky(createSeededRng(`wf:${String(i)}`), 14, true);
      expect(festival.phase1.omen ?? festival.phase2.omen ?? festival.finale.omen).toBeNull();
    }
  });

  it('names a Boon and an Omen at the strength of a rank', () => {
    const day = forcedDay('market-day', 'static-sky', 12);
    expect(day.boonBp).toBe(weatherStrength(12).boonBp);
    expect(day.omenBp).toBe(weatherStrength(12).omenBp);
    expect(forcedDay('fair-winds', 'stormfront', 12).wild).toBe(true);
    expect(forcedDay('fair-winds', 'heatwave', 12).wild).toBe(false);
    // An Omen named below the ranks that draw one still counts, at the first tier that has Omens.
    expect(forcedDay('fair-winds', 'heatwave', 1).omenBp).toBe(RULES.weather.tiers[1]?.omenBp);
  });

  const economy = runEconomy({
    seed: 'weather-raid',
    weeks: 5,
    mix: DEFAULT_MIX,
    snapshotWeeks: [4],
    weather: false,
  });
  const roster = (economy.snapshots[0]?.players ?? []).map(clonePlayer);
  const boss = content.bosses[0];
  if (boss === undefined) throw new Error('no boss');
  const fightOn = (day: WeatherDay | null) => {
    const week = openRaidWeek(boss, roster.slice(0, 6).map(clonePlayer), {
      rank: 6,
      luck: RULES.combat.luck,
      weather: { finale: day },
    });
    return { week, ...fightFor(week, 'finale') };
  };

  it('changes nothing without weather, and the weather of a stage touches that stage only', () => {
    const plain = fightOn(null);
    const phase1 = (() => {
      const week = openRaidWeek(boss, roster.slice(0, 6).map(clonePlayer), {
        rank: 6,
        luck: RULES.combat.luck,
        weather: { finale: forcedDay('stormfront', 'stormfront', 3) },
      });
      return fightFor(week, 'phase1').fight;
    })();
    expect(phase1.bossAttacks).toBe(plain.fight.bossAttacks);
    expect(phase1.luck).toEqual(plain.fight.luck);
  });

  it('puts the sheet, luck and extra boss attacks of the day on the fight', () => {
    const plain = fightOn(null);
    const attacks = plain.fight.bossAttacks ?? 1;
    expect(attacks).toBe(bossAttacksAtRank(6));

    const storm = fightOn(forcedDay('none', 'stormfront', 3));
    expect(storm.fight.bossAttacks).toBe(Math.min(3, attacks + 1));

    const clear = fightOn(forcedDay('clear-skies', null, 3));
    expect(clear.fight.luck?.critChanceBp).toBe((plain.fight.luck?.critChanceBp ?? 0) + 300);

    const static_ = fightOn(forcedDay('none', 'static-sky', 3));
    expect(static_.fight.luck?.bossCritChanceBp).toBe(
      (plain.fight.luck?.bossCritChanceBp ?? 0) + 400,
    );

    // Fair Winds: every creature's first hit deals 10% more (a sheet field), guests included.
    const fair = fightOn(forcedDay('fair-winds', null, 3));
    expect(fair.fight.row).toHaveLength(plain.fight.row.length);
    for (const [i, slot] of fair.fight.row.entries()) {
      expect(slot.mods?.firstHitBp ?? 0).toBe((plain.fight.row[i]?.mods?.firstHitBp ?? 0) + 1000);
    }
  });

  it('is stored with the stage, so the same week gives the same fight twice', () => {
    const day = forcedDay('fair-winds', 'long-shadows', 3);
    expect(fightOn(day).fight).toEqual(fightOn(day).fight);
  });
});

describe('trips and Workshop jobs under the sky', () => {
  const CREATURES = ['splashet', 'cindle', 'sproutle', 'zipmouse', 'stormray'];

  function explorer(): SimPlayer {
    const p = createPlayer('p01', 'P', 'daily', 1);
    p.joined = true;
    for (const line of CREATURES) {
      p.creatures.push({ id: `p01/${line}`, line, speciesId: line, level: 10, fusionCount: 0 });
    }
    return p;
  }

  function tripCtx(weather: WeatherDay | null): TripContext {
    return {
      hour: 9,
      day: 0,
      weekIndex: 0,
      catches: createSeededRng('wx:catches'),
      talents: createSeededRng('wx:talents'),
      trip: createSeededRng('wx:trip'),
      weather,
    };
  }

  it('stores the day on a trip when it is sent and stretches or shortens its time', () => {
    const plain = explorer();
    sendTrips(plain, tripCtx(null), (idle) => idle);
    const slow = explorer();
    sendTrips(slow, tripCtx(forcedDay('none', 'muddy-roads', 3)), (idle) => idle);
    const fast = explorer();
    sendTrips(fast, tripCtx(forcedDay('fair-winds', null, 3)), (idle) => idle);
    const [a, b, c] = [plain, slow, fast].map((p) => p.expeditions[0]);
    if (a === undefined || b === undefined || c === undefined) throw new Error('no trip');
    expect(a.weather).toBeUndefined();
    expect(b.weather?.timeBp).toBe(1500);
    expect(b.weather?.supplyBp).toBe(-3000);
    expect(c.weather?.timeBp).toBe(-1000);
    const hours = (t: typeof a): number => t.endsAtHour - t.startHour;
    // The same explorer, place and length are chosen on the same seeds.
    expect(b.length).toBe(a.length);
    expect(hours(b)).toBeGreaterThan(hours(a));
    expect(hours(c)).toBeLessThan(hours(a));
  });

  const ctx = (day: number, weather: WeatherDay | null): GearContext => ({
    rng: createSeededRng(`wx-gear:${String(day)}`),
    hour: day * 24 + 9,
    day,
    weather,
  });

  function crafter(): SimPlayer {
    const p = createPlayer('p01', 'P', 'daily', 1);
    p.joined = true;
    for (const line of ['cindle', 'sproutle', 'splashet']) {
      p.creatures.push({ id: `p01/${line}`, line, speciesId: line, level: 14, fusionCount: 0 });
    }
    p.supplies['lure-basic'] = GEAR_POLICY.supplyStock;
    return p;
  }

  let uid = 5000;
  const common = (): SimItem => ({
    ...itemOf('trail-cap', 'common', 2, [{ id: 'attack', tier: 0 }]),
    uid: uid++,
  });

  it('boosts only the first craft of the day under Market Day, and counts every craft', () => {
    const market = forcedDay('market-day', null, 3);
    const p = crafter();
    p.gear.blueprints.push('trail-cap');
    p.gear.parts.scrap = 1_000;
    startJobs(p, ctx(3, market), new Set());
    const first = p.gear.jobs.filter((j) => j.kind === 'craft');
    expect(first).toHaveLength(RULES.gear.workshopSlots);
    expect(first[0]?.mods).toEqual({ stepUpBonusBp: 500 });
    for (const job of first.slice(1)) expect(job.mods).toBeUndefined();
    // The day's count carries over a claim and a second start on the same day.
    claimJobs(p, ctx(3, market));
    p.gear.jobs = [];
    startJobs(p, ctx(3, market), new Set());
    expect(p.gear.jobs.every((j) => j.mods === undefined)).toBe(true);
    // The next day it counts afresh.
    p.gear.jobs = [];
    startJobs(p, ctx(4, market), new Set());
    expect(p.gear.jobs[0]?.mods).toEqual({ stepUpBonusBp: 500 });
    // A different day without Market Day boosts nothing.
    p.gear.jobs = [];
    startJobs(p, ctx(5, forcedDay('fair-winds', null, 3)), new Set());
    expect(p.gear.jobs.every((j) => j.mods === undefined)).toBe(true);
  });

  it('boosts the first 2 dismantle jobs of the day under Market Day, never more', () => {
    const market = forcedDay('market-day', null, 3);
    const p = crafter();
    for (let i = 0; i < 24; i++) p.gear.bag.push(common());
    const started: boolean[] = [];
    for (let round = 0; round < 4; round++) {
      p.gear.jobs = [];
      startJobs(p, ctx(3, market), new Set());
      const dismantle = p.gear.jobs.find((j) => j.kind === 'dismantle');
      if (dismantle !== undefined) started.push(dismantle.mods?.dismantleTopOfRange === true);
    }
    expect(started.length).toBeGreaterThanOrEqual(3);
    expect(started.slice(0, 2)).toEqual([true, true]);
    expect(started.slice(2).every((x) => !x)).toBe(true);
  });

  it('applies the day to a job once, when it starts: time and experience stay with the job', () => {
    const warm = forcedDay('warm-hearth', null, 3);
    const cold = forcedDay('none', 'cold-snap', 3);
    const times = [null, warm, cold].map((weather) => {
      const p = crafter();
      p.gear.blueprints.push('trail-cap');
      p.gear.parts.scrap = 1_000;
      startJobs(p, ctx(3, weather), new Set());
      return p.gear.jobs[0];
    });
    const [none, fast, slow] = times;
    if (none === undefined || fast === undefined || slow === undefined) throw new Error('no job');
    const start = 3 * 24 + 9;
    expect(fast.endsAtHour - start).toBeLessThan(none.endsAtHour - start);
    expect(slow.endsAtHour - start).toBeGreaterThan(none.endsAtHour - start);
    expect(none.xp).toBeUndefined();
    expect(slow.xp).toEqual({ bp: -2000, treatMultiplier: null });
  });
});

describe('the dungeon under the sky', () => {
  function runner(): SimPlayer {
    const p = createPlayer('p01', 'P', 'daily', 1);
    p.joined = true;
    for (const line of ['cindle', 'sproutle', 'splashet']) {
      p.creatures.push({ id: `p01/${line}`, line, speciesId: line, level: 14, fusionCount: 0 });
    }
    return p;
  }
  const build = (weather: WeatherDay | null) =>
    buildRun(runner(), 3, dayModifiers('wx', 0), 'wx-dungeon', {}, undefined, weather);

  it('puts the day on the run: the sheet, the luck and the foes attacks', () => {
    const plain = build(null);
    expect(plain.bossAttacks).toBeUndefined();
    expect(build(forcedDay('none', 'stormfront', 3)).bossAttacks).toBe(2);
    expect(build(forcedDay('clear-skies', null, 3)).luck?.critChanceBp).toBe(
      (plain.luck?.critChanceBp ?? 0) + 300,
    );
    const fair = build(forcedDay('fair-winds', null, 3));
    for (const [i, slot] of fair.team.entries()) {
      expect(slot.mods?.firstHitBp ?? 0).toBe((plain.team[i]?.mods?.firstHitBp ?? 0) + 1000);
    }
  });

  it('pays Market Day scrap for every room cleared', () => {
    const scrap = (weather: WeatherDay | null): { scrap: number; rooms: number } => {
      const p = runner();
      const log = playDungeonDay(
        p,
        0,
        dayModifiers('wx', 0),
        'wx-pay',
        createSeededRng('wx-loot'),
        {},
        undefined,
        weather,
      );
      return { scrap: p.gear.parts.scrap, rooms: log.reduce((n, r) => n + r.roomsCleared, 0) };
    };
    const plain = scrap(null);
    const market = scrap(forcedDay('market-day', null, 3));
    // The same seeds play the same fight (the Boon changes no stat), so the rooms cleared match.
    expect(market.rooms).toBe(plain.rooms);
    expect(market.scrap - plain.scrap).toBe(market.rooms);
  });
});

describe('the economy under the sky', () => {
  const run = (weather?: boolean) =>
    runEconomy({
      seed: 'weather-econ',
      weeks: 4,
      mix: DEFAULT_MIX,
      snapshotWeeks: [],
      ...(weather === undefined ? {} : { weather }),
    });

  it('is exact for a seed with weather on (the default), and weather moves the numbers', () => {
    const on = JSON.stringify(run().players);
    expect(JSON.stringify(run(true).players)).toBe(on);
    expect(JSON.stringify(run(false).players)).not.toBe(on);
  });
});

describe('the weather study', () => {
  it('lists every live Boon and Omen once, after no weather', () => {
    const weathers = studyWeathers();
    expect(weathers[0]).toEqual({ id: 'none', name: 'No weather', kind: 'none' });
    const ids = weathers.slice(1).map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(weatherDef(id)?.status).toBe('live');
    expect(ids).not.toContain('kind-rain');
  });

  const study = runEffectStudy({
    seed: 'wstudy',
    servers: 1,
    rank: 3,
    strengthRank: 14,
    curveServers: 0,
    curveWeeks: 1,
  });

  it('plays the same weeks under every weather, so no weather is the zero of the deltas', () => {
    const none = study[0];
    expect(none?.id).toBe('none');
    expect(none?.finaleDelta).toBe(0);
    expect(none?.lossDelta).toBe(0);
    expect(study.length).toBe(studyWeathers().length);
    for (const row of study) {
      expect(row.weeks).toBe(none?.weeks);
      expect(row.finale).toBeGreaterThanOrEqual(0);
      expect(row.finale).toBeLessThanOrEqual(1);
    }
    expect(none?.weeks ?? 0).toBeGreaterThan(0);
  });

  it('writes a Markdown table with a row for every weather', () => {
    expect(study.find((r) => r.id === 'stormfront')?.kind).toBe('omen');
    const text = weatherMarkdown({
      settings: {
        seed: 'wstudy',
        servers: 1,
        rank: 3,
        strengthRank: 14,
        curveServers: 0,
        curveWeeks: 1,
      },
      effects: study,
      servers: null,
    });
    expect(text).toContain('# Weather: what Boons and Omens do to the raid');
    expect(text).toContain('| Stormfront | omen |');
    expect(text).toContain('weather at the strength of rank 14');
  });
});

describe('the weather study command', () => {
  it('reads its flags, with defaults', () => {
    const o = parseWeatherCli([]);
    expect(o.study.seed).toBe('weather');
    expect(o.study.rank).toBe(3);
    expect(o.study.strengthRank).toBeUndefined();
    expect(o.out).toBeUndefined();
    const p = parseWeatherCli([
      '--seed',
      'x',
      '--servers',
      '2',
      '--rank',
      '12',
      '--strength-rank',
      '14',
      '--curve-servers',
      '0',
    ]);
    expect(p.study).toMatchObject({
      seed: 'x',
      servers: 2,
      rank: 12,
      strengthRank: 14,
      curveServers: 0,
    });
  });

  it('refuses odd input', () => {
    expect(() => parseWeatherCli(['--rank', '0'])).toThrow();
    expect(() => parseWeatherCli(['--servers', 'many'])).toThrow();
    expect(() => parseWeatherCli(['--seed', ''])).toThrow();
    expect(() => parseWeatherCli(['--nope'])).toThrow();
    const errors: string[] = [];
    expect(main(['--rank', '0'], { out: () => undefined, err: (t) => errors.push(t) })).toBe(2);
    expect(errors[0]).toMatch(/--rank/);
  });
});
