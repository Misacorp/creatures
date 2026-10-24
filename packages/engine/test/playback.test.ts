import { describe, expect, it } from 'vitest';
import { content, type BossDef } from '@creatures/game';
import {
  CLASSIC_PACE,
  INTRO_LIVE_MS,
  PACING_SLOW,
  SLOW_PACE,
  INTRO_REPLAY_MS,
  MAX_ROUND_MS,
  MIN_ROUND_MS,
  TAIL_MS,
  WINDUP_MS,
  beatEnds,
  beatTiming,
  bossWarnings,
  isBossAction,
  needsCreature,
  paceOfPacing,
  planRound,
  planRounds,
  roundPlaybackMs,
  simulateFight,
  type AbilityChoice,
  type FightEvent,
  type FightInput,
} from '../src/index';
import { boss, randomInput, rng } from './helpers';

const roundEvents = (events: readonly FightEvent[], round: number): FightEvent[] =>
  events.filter((e) => e.round === round);

/** A round of `n` plain creature turns, each with one hit, plus the boss attack. */
function plainRound(n: number, round = 1): FightEvent[] {
  const out: FightEvent[] = [{ t: 'round_start', round, bossHp: 1000, mark: null }];
  for (let i = 0; i < n; i++) {
    out.push({ t: 'turn', round, creature: `c${String(i)}` });
    out.push({
      t: 'hit',
      round,
      creature: `c${String(i)}`,
      damage: 10,
      matchupBp: 10_000,
      bonusBp: 0,
      mark: null,
      bossHp: 990,
    });
  }
  out.push({ t: 'boss_hit', round, source: 'attack', target: 'c0', damage: 5 });
  out.push({ t: 'round_end', round, bossHp: 900 });
  return out;
}

describe('beat timing', () => {
  it('gives a plain turn 500 ms, a crit 600 ms and caps the weights at 700 ms', () => {
    const events = plainRound(1);
    expect(beatTiming(events, 1, 3)).toEqual({ ms: 500, windupMs: 0, visible: true });
    const crit: FightEvent[] = [
      { t: 'turn', round: 1, creature: 'a' },
      {
        t: 'hit',
        round: 1,
        creature: 'a',
        damage: 9,
        matchupBp: 0,
        bonusBp: 0,
        mark: null,
        bossHp: 1,
        crit: true,
      },
    ];
    expect(beatTiming(crit, 0, 2).ms).toBe(600);
    const busy: FightEvent[] = [
      ...crit,
      {
        t: 'reaction',
        round: 1,
        reaction: 'conduction',
        setupCreature: null,
        setupPlayer: null,
        payoff: 'a',
        bonus: 5,
        reflected: false,
      },
      { t: 'knockout', round: 1, creature: 'b' },
    ];
    expect(beatTiming(busy, 0, 4).ms).toBe(700);
  });

  it('adds the 600 ms wind-up to boss actions and nothing to a lone round start', () => {
    const events = plainRound(1);
    const ends = beatEnds(events);
    // Beats: [round_start], [turn, hit], [boss_hit], [round_end].
    expect(ends).toEqual([1, 3, 4, 5]);
    expect(beatTiming(events, 3, 4)).toEqual({
      ms: 500 + WINDUP_MS,
      windupMs: WINDUP_MS,
      visible: true,
    });
    expect(beatTiming(events, 0, 1)).toEqual({ ms: 250, windupMs: 0, visible: false });
    expect(beatTiming(events, 4, 5).visible).toBe(false);
  });

  it('winds up for a gimmick hit and a reflect, but not for the reflect trap being armed', () => {
    const gimmick = (op: string): FightEvent => ({ t: 'gimmick', round: 3, gimmick: 'g', op });
    expect(beatTiming([gimmick('hit_zone')], 0, 1).windupMs).toBe(WINDUP_MS);
    expect(beatTiming([gimmick('strike_highest_atk')], 0, 1).windupMs).toBe(WINDUP_MS);
    expect(beatTiming([gimmick('silence_ends')], 0, 1).windupMs).toBe(WINDUP_MS);
    expect(beatTiming([gimmick('reflect_first_reaction')], 0, 1).windupMs).toBe(0);
    const reflect: FightEvent = {
      t: 'boss_hit',
      round: 3,
      source: 'reflect',
      target: 'a',
      damage: 4,
    };
    expect(beatTiming([reflect], 0, 1).windupMs).toBe(WINDUP_MS);
    // Spikes pricking the hitter follow its own hit: no wind-up, no beat of their own.
    const spikes: FightEvent = {
      t: 'boss_hit',
      round: 3,
      source: 'spikes',
      target: 'a',
      damage: 4,
    };
    expect(beatTiming([spikes], 0, 1).windupMs).toBe(0);
  });
});

describe('roundPlaybackMs', () => {
  it('is the intro, the staggers up to the last beat, its wind-up and a 2 s tail', () => {
    // 8 creatures: beats are the round start (250), 8 turns of 500, then the boss attack.
    const events = plainRound(8);
    const expected = INTRO_LIVE_MS + 250 + 8 * 500 + WINDUP_MS + TAIL_MS;
    expect(roundPlaybackMs(events)).toBe(expected);
    expect(expected).toBe(8_350);
  });

  it('takes the intro as an option (1 s in a replay) and halves everything at 2x', () => {
    const events = plainRound(8);
    expect(roundPlaybackMs(events, { introMs: INTRO_REPLAY_MS })).toBe(7_850);
    expect(roundPlaybackMs(events, { introMs: INTRO_REPLAY_MS, speed: 2 })).toBe(3_925);
    const plan = planRound(events, { introMs: INTRO_REPLAY_MS, speed: 2 });
    expect(plan.introMs).toBe(500);
    expect(plan.beats.at(-2)?.windupMs).toBe(300);
  });

  it('plays the same round about three times slower at the slow pace (the live finale from 2026-10-22)', () => {
    const events = plainRound(8);
    // Intro 1.5 s (not slowed), the round start (600), 8 turns of 2 s, the boss attack's 1.5 s wind-up and a 4 s tail.
    expect(roundPlaybackMs(events, { pace: SLOW_PACE })).toBe(
      1_500 + 600 + 8 * 2_000 + 1_500 + 4_000,
    );
    const plan = planRound(events, { pace: SLOW_PACE });
    expect(plan.introMs).toBe(SLOW_PACE.introMs);
    expect(plan.beats.at(-2)?.windupMs).toBe(SLOW_PACE.windupMs);
    // The slow pace has its own limits: never under 20 s, never over 45 s.
    expect(roundPlaybackMs(plainRound(0), { pace: SLOW_PACE })).toBe(SLOW_PACE.minRoundMs);
    const crowded = roundPlaybackMs(plainRound(60), { pace: SLOW_PACE });
    expect(crowded).toBeLessThanOrEqual(SLOW_PACE.maxRoundMs);
    expect(crowded).toBeGreaterThan(SLOW_PACE.maxRoundMs - 100);
    // The default stays the classic pace (replays, the dungeon, older finales).
    expect(roundPlaybackMs(events)).toBe(roundPlaybackMs(events, { pace: CLASSIC_PACE }));
  });

  it('maps a stored pacing version to its pace', () => {
    expect(paceOfPacing(0)).toBe(CLASSIC_PACE);
    expect(paceOfPacing(1)).toBe(CLASSIC_PACE);
    expect(paceOfPacing(PACING_SLOW)).toBe(SLOW_PACE);
  });

  it('never goes under 6 s, even for an empty round', () => {
    expect(roundPlaybackMs(plainRound(0))).toBe(MIN_ROUND_MS);
    expect(roundPlaybackMs([{ t: 'round_start', round: 1, bossHp: 1, mark: null }])).toBe(
      MIN_ROUND_MS,
    );
    expect(roundPlaybackMs([])).toBe(MIN_ROUND_MS);
  });

  it('never goes over 22 s, and squeezes the beats to fit', () => {
    expect(roundPlaybackMs(plainRound(80))).toBeLessThanOrEqual(MAX_ROUND_MS);
    expect(roundPlaybackMs(plainRound(80))).toBeGreaterThan(MAX_ROUND_MS - 200);
    const events = plainRound(40);
    // Squeezed beats round down, so a squeezed round lands a few ms under the cap.
    const plan = planRound(events);
    expect(plan.totalMs).toBeLessThanOrEqual(MAX_ROUND_MS);
    expect(plan.totalMs).toBeGreaterThan(MAX_ROUND_MS - 100);
    // The plan's own timeline agrees with the total: the intro, every stagger before the last visible
    // beat, then its wind-up and the tail.
    const visible = plan.beats.filter((b) => b.visible);
    const last = visible.at(-1);
    const before = plan.beats
      .slice(0, plan.beats.indexOf(last as NonNullable<typeof last>))
      .reduce((sum, b) => sum + b.ms, 0);
    expect(plan.introMs + before + (last?.ms ?? 0)).toBeLessThanOrEqual(MAX_ROUND_MS);
    expect(plan.introMs + before + (last?.ms ?? 0)).toBeGreaterThan(MAX_ROUND_MS - 100);
    expect(plan.beats.every((b) => b.ms === 0 || b.ms >= 250)).toBe(true);
    // Even a round of 80 creatures never runs past the cap: its beats squeeze below 250 ms to fit.
    const huge = planRound(plainRound(80));
    const hugeTotal = huge.introMs + huge.beats.reduce((sum, b) => sum + b.ms, 0);
    expect(hugeTotal).toBeLessThanOrEqual(MAX_ROUND_MS);
  });

  it('keeps 12 rounds under the 5 minute cap', () => {
    expect(12 * MAX_ROUND_MS).toBeLessThan(5 * 60_000);
  });

  it('is the same wherever the round sits in a log (it only reads the round)', () => {
    for (let s = 0; s < 6; s++) {
      const input = randomInput(`playback-slice-${String(s)}`, 5, 'finale');
      const result = simulateFight(input, rng());
      for (const plan of planRounds(result.events)) {
        if (plan.round === 0) continue;
        expect(plan.totalMs).toBe(roundPlaybackMs(roundEvents(result.events, plan.round)));
      }
    }
  });
});

describe('planRounds', () => {
  it('covers the whole log with the same beats the replay steps through', () => {
    for (let s = 0; s < 12; s++) {
      for (const phase of ['phase1', 'finale'] as const) {
        const input = randomInput(`playback-cover-${String(s)}`, 2 + (s % 6), phase);
        const events = simulateFight(input, rng()).events;
        const plans = planRounds(events);
        const beats = plans.flatMap((p) => p.beats);
        expect(beats.map((b) => b.to)).toEqual(beatEnds(events));
        let at = 0;
        for (const b of beats) {
          expect(b.from).toBe(at);
          at = b.to;
        }
        expect(at).toBe(events.length);
        for (const p of plans) {
          if (p.round > 0) {
            expect(p.totalMs).toBeGreaterThanOrEqual(MIN_ROUND_MS);
            expect(p.totalMs).toBeLessThanOrEqual(MAX_ROUND_MS);
          }
        }
      }
    }
  });

  it('puts the events before the first round in an instant round 0', () => {
    const events: FightEvent[] = [
      { t: 'adaptation', round: 0, rule: 'r', target: null, status: 'active' },
      ...plainRound(2),
    ];
    const plans = planRounds(events);
    expect(plans.map((p) => p.round)).toEqual([0, 1]);
    expect(plans[0]).toMatchObject({ from: 0, to: 1, introMs: 0, totalMs: 0 });
    expect(plans[1]?.from).toBe(1);
  });
});

describe('prefix safety of the pacing', () => {
  /** An ability that fires at `round` (a creature ability gets one of its owner's creatures). */
  function extra(input: FightInput, index: number, round: number): AbilityChoice {
    const def = content.finaleAbilities[index % content.finaleAbilities.length];
    const playerId = input.players[index % input.players.length];
    if (def === undefined || playerId === undefined) throw new Error('no ability or player');
    const creature = input.row.find((s) => s.ownerId === playerId);
    return {
      playerId,
      abilityId: def.id,
      key: `extra:${String(index)}`,
      fireAtRound: round,
      ...(needsCreature(def) && creature !== undefined ? { creatureId: creature.id } : {}),
      ...(def.id === 'shield-wall' ? { params: { zone: 'middle' as const } } : {}),
      ...(def.id === 're-mark' ? { params: { element: 'grove' as const } } : {}),
    };
  }

  it('an ability that fires in round k leaves the playback length of every earlier round alone', () => {
    let compared = 0;
    for (let s = 0; s < 20; s++) {
      const base = { ...randomInput(`playback-prefix-${String(s)}`, 4, 'finale') };
      const plain: FightInput = { ...base, finaleAbilities: [] };
      const before = simulateFight(plain, rng()).events;
      for (const k of [2, 4, 7, 11]) {
        const after = simulateFight(
          { ...plain, finaleAbilities: [extra(plain, s + k, k)] },
          rng(),
        ).events;
        for (let r = 1; r < k; r++) {
          expect(roundPlaybackMs(roundEvents(after, r))).toBe(
            roundPlaybackMs(roundEvents(before, r)),
          );
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(300);
  });
});

describe('bossWarnings', () => {
  it('says Undertow hits the front zone on rounds 3, 6, 9 and 12', () => {
    // A frozen boss with Undertow alone, so the schedule of this one move is what is tested.
    const undertowOnly: BossDef = {
      ...boss('tidal-colossus'),
      gimmicks: [
        {
          id: 'undertow',
          name: 'Undertow',
          trigger: { every: 3 },
          op: 'hit_zone',
          zone: 'front',
          power: 8_000,
        },
      ],
    };
    const hits = Array.from({ length: 12 }, (_, i) => i + 1).filter(
      (r) => bossWarnings(undertowOnly, r).length > 0,
    );
    expect(hits).toEqual([3, 6, 9, 12]);
    expect(bossWarnings(undertowOnly, 6)).toEqual([
      {
        gimmick: 'undertow',
        name: 'Undertow',
        op: 'hit_zone',
        target: { kind: 'zone', zone: 'front' },
      },
    ]);
  });

  it('knows the shipped Tidal Colossus: Undertow, Riptide and the Great Wave gathering and landing', () => {
    const tidal = boss('tidal-colossus');
    const ids = (r: number) => bossWarnings(tidal, r).map((w) => w.gimmick);
    expect(ids(1)).toEqual([]);
    expect(ids(3)).toEqual(['undertow']);
    expect(ids(4)).toEqual(['riptide', 'great-wave']);
    expect(ids(12)).toEqual(['undertow', 'riptide']);
    expect(bossWarnings(tidal, 4)[0]?.target).toEqual({ kind: 'lane', lane: 'random' });
    // The charge is gathering in the round it is announced (4) and lands in round 5, on the
    // sweep's walk: the first firing hits the Middle row, the second the Back row.
    expect(bossWarnings(tidal, 4)[1]?.target).toEqual({
      kind: 'charge',
      stage: 'gathering',
      inner: { kind: 'zone', zone: 'middle' },
    });
    expect(bossWarnings(tidal, 5)[0]?.target).toEqual({
      kind: 'charge',
      stage: 'landing',
      inner: { kind: 'zone', zone: 'middle' },
    });
    expect(bossWarnings(tidal, 10)[0]?.target).toEqual({
      kind: 'charge',
      stage: 'landing',
      inner: { kind: 'zone', zone: 'back' },
    });
  });

  it('names the standing effects of the dungeon: spikes and the backlash', () => {
    const standing = {
      ...boss('cinder-wyrm'),
      gimmicks: [
        {
          id: 'thorns',
          name: 'Thorns',
          trigger: { eachRound: true as const },
          op: 'spikes' as const,
          bp: 1_000,
        },
        {
          id: 'shell',
          name: 'Shell',
          trigger: { every: 2 },
          op: 'backlash' as const,
          chanceBp: 5_000,
          shareBp: 2_500,
        },
      ],
    };
    expect(bossWarnings(standing, 1).map((w) => w.target)).toEqual([{ kind: 'spikes', bp: 1_000 }]);
    expect(bossWarnings(standing, 2).map((w) => w.target)).toEqual([
      { kind: 'spikes', bp: 1_000 },
      { kind: 'backlash', chanceBp: 5_000, shareBp: 2_500 },
    ]);
  });

  it('knows the other bosses: the strongest every round, both ends every 2nd, the reflect trap', () => {
    expect(bossWarnings(boss('storm-sovereign'), 1)[0]?.target).toEqual({
      kind: 'strongest',
      jumps: 2,
    });
    expect(bossWarnings(boss('storm-sovereign'), 12)[0]?.op).toBe('strike_highest_atk');
    expect(bossWarnings(boss('storm-sovereign'), 4)[1]?.target).toEqual({
      kind: 'slam',
      aim: 'strongest',
    });
    const thorn = boss('thornmother');
    expect([1, 2, 3, 4].map((r) => bossWarnings(thorn, r).map((w) => w.gimmick))).toEqual([
      [],
      ['bramble-bind'],
      ['briar-pincer'],
      ['bramble-bind', 'seed-burst'],
    ]);
    expect(bossWarnings(thorn, 2)[0]?.target).toEqual({ kind: 'ends', scope: 'rows' });
    expect(bossWarnings(thorn, 3)[0]?.target).toEqual({ kind: 'pincer', scope: 'rows' });
    expect(bossWarnings(boss('cinder-wyrm'), 5)[0]?.target).toEqual({ kind: 'reaction' });
  });

  it('is empty outside the fight, and agrees with the gimmicks the engine fires', () => {
    const tidal = boss('tidal-colossus');
    expect(bossWarnings(tidal, 0)).toEqual([]);
    expect(bossWarnings(tidal, tidal.finaleRounds + 1)).toEqual([]);
    expect(bossWarnings(tidal, 1.5)).toEqual([]);
    let charges = 0;
    for (const b of content.bosses) {
      const input = { ...randomInput('warnings', 4, 'finale'), boss: b };
      const result = simulateFight({ ...input, finaleAbilities: [] }, rng());
      for (let r = 1; r <= result.rounds; r++) {
        // (The engine announces the reflect trap twice a round: when it arms and at the boss's turn.)
        // A charge is announced by a `charge` event a round before its `gimmick` event lands it:
        // the forecast says `gathering` in the first round and `landing` in the second.
        // (A purge is not forecast: nobody is aimed at, so it is left out of the comparison.)
        const purges = new Set(b.gimmicks.filter((g) => g.op === 'purge').map((g) => g.id));
        const landed = new Set(
          result.events.flatMap((e) =>
            e.t === 'gimmick' && e.round === r && !purges.has(e.gimmick) ? [e.gimmick] : [],
          ),
        );
        const announced = new Set(
          result.events.flatMap((e) => (e.t === 'charge' && e.round === r ? [e.gimmick] : [])),
        );
        const warnings = bossWarnings(b, r);
        const warned = (stage?: 'gathering' | 'landing') =>
          warnings
            .filter((w) =>
              stage === undefined
                ? w.target.kind !== 'charge' || w.target.stage === 'landing'
                : w.target.kind === 'charge' && w.target.stage === stage,
            )
            .map((w) => w.gimmick);
        // The boss may fall before it acts, so what landed is a subset of what was warned about.
        for (const id of landed) expect(warned()).toContain(id);
        for (const id of announced) expect(warned('gathering')).toContain(id);
        charges += announced.size;
        if (result.bossHpEnd > 0) {
          expect([...landed].sort()).toEqual(warned().sort());
          expect([...announced].sort()).toEqual(warned('gathering').sort());
        }
      }
    }
    // Not vacuous: charges really were announced.
    expect(charges).toBeGreaterThan(0);
  });
});

describe('playback of the retune events', () => {
  const start: FightEvent = { t: 'round_start', round: 3, bossHp: 900, mark: null };
  const charge: FightEvent = {
    t: 'charge',
    round: 3,
    landing: 4,
    gimmick: 'great-wave',
    op: 'sweep',
    marks: ['a', 'b'],
    rows: ['front'],
  };

  it('treats a charge as visible, with the 600 ms wind-up in its beat', () => {
    expect(beatTiming([start, charge], 0, 2)).toEqual({
      ms: 600 + WINDUP_MS,
      windupMs: WINDUP_MS,
      visible: true,
    });
    expect(isBossAction(charge)).toBe(true);
    // The same round without the charge has nothing to show in that beat.
    expect(beatTiming([start], 0, 1).visible).toBe(false);
  });

  it('adds the charge announcement to the round: it is longer than the same round without it', () => {
    const round: FightEvent[] = [
      start,
      { t: 'turn', round: 3, creature: 'a' },
      {
        t: 'hit',
        round: 3,
        creature: 'a',
        damage: 5,
        matchupBp: 10_000,
        bonusBp: 0,
        mark: null,
        bossHp: 895,
      },
      { t: 'boss_hit', round: 3, source: 'attack', target: 'a', damage: 5 },
      { t: 'round_end', round: 3, bossHp: 895 },
    ];
    const withCharge = [start, charge, ...round.slice(1)];
    const plan = planRound(withCharge);
    // The charge sits in the round-start beat, which is now visible and carries the wind-up.
    expect(plan.beats[0]).toMatchObject({ visible: true, windupMs: WINDUP_MS });
    expect(plan.beats[0]?.ms).toBe(600 + WINDUP_MS);
    expect(planRound(round).beats[0]?.visible).toBe(false);
  });

  it('shows retreat, enrage, heal and cleanse, and gives retreat and enrage a banner weight', () => {
    const enrage: FightEvent = { t: 'enrage', round: 13, first: true };
    expect(beatTiming([{ ...start, round: 13 }, enrage], 0, 2)).toEqual({
      ms: 600,
      windupMs: 0,
      visible: true,
    });
    const retreat: FightEvent = { t: 'retreat', round: 3, bossHp: 700 };
    expect(beatTiming([{ t: 'turn', round: 3, creature: 'a' }, retreat], 0, 2)).toMatchObject({
      visible: true,
      windupMs: 0,
    });
    const heal: FightEvent = { t: 'heal', round: 3, supporter: 's', target: 'a', amount: 4 };
    const cleanse: FightEvent = { t: 'cleanse', round: 3, supporter: 's', target: 'a' };
    expect(beatTiming([heal], 0, 1)).toEqual({ ms: 500, windupMs: 0, visible: true });
    expect(beatTiming([cleanse], 0, 1)).toEqual({ ms: 500, windupMs: 0, visible: true });
    // Kind Rain's heal and a Morning Haze skip are shown too.
    const rain: FightEvent = {
      t: 'sky_heal',
      round: 3,
      heals: [{ creature: 'a', amount: 4 }],
    };
    expect(beatTiming([rain], 0, 1)).toEqual({ ms: 500, windupMs: 0, visible: true });
    const haze: FightEvent = { t: 'skip', round: 1, creature: 'a', reason: 'haze' };
    expect(beatTiming([haze], 0, 1)).toEqual({ ms: 500, windupMs: 0, visible: true });
  });

  it('plays the enraged boss as one action: its volley is one beat with a wind-up', () => {
    const hit = (target: string): FightEvent => ({
      t: 'boss_hit',
      round: 13,
      source: 'enrage',
      target,
      damage: 90,
    });
    const events: FightEvent[] = [
      { t: 'round_start', round: 13, bossHp: 10, mark: null },
      { t: 'enrage', round: 13, first: true },
      { t: 'boss_hit', round: 13, source: 'attack', target: 'a', damage: 10 },
      hit('a'),
      { t: 'knockout', round: 13, creature: 'a' },
      hit('b'),
      hit('c'),
      { t: 'round_end', round: 13, bossHp: 10 },
    ];
    // Beats: [round_start, enrage], [attack], [the volley with its knockout], [round_end].
    expect(beatEnds(events)).toEqual([2, 3, 7, 8]);
    expect(beatTiming(events, 3, 7)).toMatchObject({ windupMs: WINDUP_MS, visible: true });
    const plan = planRound(events);
    expect(plan.totalMs).toBeGreaterThanOrEqual(MIN_ROUND_MS);
    expect(plan.totalMs).toBeLessThanOrEqual(MAX_ROUND_MS);
  });

  it('never breaks on an event it does not know', () => {
    const future = { t: 'from_the_future', round: 3 } as unknown as FightEvent;
    const events: FightEvent[] = [start, future, { t: 'turn', round: 3, creature: 'a' }, future];
    expect(() => planRound(events)).not.toThrow();
    expect(() => planRounds(events)).not.toThrow();
    expect(beatTiming([future], 0, 1)).toEqual({ ms: 250, windupMs: 0, visible: false });
    expect(isBossAction(future)).toBe(false);
    expect(roundPlaybackMs(events)).toBeGreaterThanOrEqual(MIN_ROUND_MS);
  });

  it('plans a whole fight with charges, a retreat and enrage rounds inside the round limits', () => {
    for (const bossId of ['tidal-colossus', 'thornmother']) {
      const base = randomInput('playback-retune', 4, 'finale');
      const result = simulateFight(
        {
          ...base,
          boss: boss(bossId),
          finaleAbilities: [],
          enrage: { rounds: 3, powerBp: 30_000 },
          bossHpPool: { ...base.bossHpPool, current: base.bossHpPool.max },
        },
        rng(),
      );
      for (const plan of planRounds(result.events)) {
        if (plan.round === 0) continue;
        expect(plan.totalMs).toBeGreaterThanOrEqual(MIN_ROUND_MS);
        expect(plan.totalMs).toBeLessThanOrEqual(MAX_ROUND_MS);
      }
    }
  });
});
