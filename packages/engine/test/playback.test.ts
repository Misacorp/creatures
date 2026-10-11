import { describe, expect, it } from 'vitest';
import { content } from '@creatures/game';
import {
  INTRO_LIVE_MS,
  INTRO_REPLAY_MS,
  MAX_ROUND_MS,
  MIN_ROUND_MS,
  TAIL_MS,
  WINDUP_MS,
  beatEnds,
  beatTiming,
  bossWarnings,
  needsCreature,
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
    const tidal = boss('tidal-colossus');
    const hits = Array.from({ length: 12 }, (_, i) => i + 1).filter(
      (r) => bossWarnings(tidal, r).length > 0,
    );
    expect(hits).toEqual([3, 6, 9, 12]);
    expect(bossWarnings(tidal, 6)).toEqual([
      {
        gimmick: 'undertow',
        name: 'Undertow',
        op: 'hit_zone',
        target: { kind: 'zone', zone: 'front' },
      },
    ]);
  });

  it('knows the other bosses: the strongest every round, both ends every 2nd, the reflect trap', () => {
    expect(bossWarnings(boss('storm-sovereign'), 1)[0]?.target).toEqual({ kind: 'strongest' });
    expect(bossWarnings(boss('storm-sovereign'), 12)[0]?.op).toBe('strike_highest_atk');
    const thorn = boss('thornmother');
    expect([1, 2, 3, 4].map((r) => bossWarnings(thorn, r).length)).toEqual([0, 1, 0, 1]);
    expect(bossWarnings(thorn, 2)[0]?.target).toEqual({ kind: 'ends' });
    expect(bossWarnings(boss('cinder-wyrm'), 5)[0]?.target).toEqual({ kind: 'reaction' });
  });

  it('is empty outside the fight, and agrees with the gimmicks the engine fires', () => {
    const tidal = boss('tidal-colossus');
    expect(bossWarnings(tidal, 0)).toEqual([]);
    expect(bossWarnings(tidal, tidal.finaleRounds + 1)).toEqual([]);
    expect(bossWarnings(tidal, 1.5)).toEqual([]);
    for (const b of content.bosses) {
      const input = { ...randomInput('warnings', 4, 'finale'), boss: b };
      const result = simulateFight({ ...input, finaleAbilities: [] }, rng());
      for (let r = 1; r <= result.rounds; r++) {
        // (The engine announces the reflect trap twice a round: when it arms and at the boss's turn.)
        const fired = [
          ...new Set(
            result.events
              .filter((e) => e.t === 'gimmick' && e.round === r)
              .map((e) => (e.t === 'gimmick' ? e.gimmick : '')),
          ),
        ];
        // The boss may fall before it acts, so what fired is a subset of what was warned about.
        const warned = bossWarnings(b, r).map((w) => w.gimmick);
        for (const id of fired) expect(warned).toContain(id);
        if (result.bossHpEnd > 0) expect(fired.sort()).toEqual(warned.sort());
      }
    }
  });
});
