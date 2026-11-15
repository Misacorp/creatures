import { RULES } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { buildBeats } from './fight-v2';
import {
  beatDurations,
  isReplayPace,
  REPLAY_PACE_IDS,
  REPLAY_PACES,
  replayPace,
  setReplayPace,
  STAGE_ROUND_MS,
  type ReplayPace,
} from './playback-v2';
import { choosePace, PACE_KEY, storedPace, type PrefStorage } from './dev/look-prefs';
import { playSample } from './workbench/fight-v2-sample';

function fake(initial: Record<string, string> = {}): PrefStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

const stage = playSample({ slot: 4, players: 4, stage: 1, seed: 'pace' });
const beats = buildBeats(stage.events, { creatures: stage.fighters });
const rounds = [...new Set(beats.map((b) => b.round))].filter((r) => r > 0);

const durationsOf = (pace: ReplayPace, speed: 1 | 2): number[] =>
  beatDurations(beats, {
    speed,
    budgetMs: pace.budgetMs,
    introMs: pace.introMs,
    ...(pace.roundMs === null ? {} : { roundMs: pace.roundMs }),
  });

const roundLength = (ms: number[], round: number): number =>
  beats.reduce((sum, b, k) => (b.round === round ? sum + (ms[k] ?? 0) : sum), 0);

describe('the replay paces', () => {
  it('keeps one entry per option, the finale one first and equal to the live round', () => {
    expect(REPLAY_PACE_IDS).toEqual(['finale', 'half', 'brisk']);
    expect(REPLAY_PACES.finale.roundMs).toBe(STAGE_ROUND_MS);
    expect(STAGE_ROUND_MS).toBe(RULES.raid.v2.liveRoundMs);
    expect(REPLAY_PACES.half.roundMs).toBe(STAGE_ROUND_MS / 2);
    expect(REPLAY_PACES.brisk.roundMs).toBeNull();
  });

  it('holds every round but the last to the length of the pace (finale 30 s, half 15 s)', () => {
    for (const id of ['finale', 'half'] as const) {
      const pace = REPLAY_PACES[id];
      const ms = durationsOf(pace, 1);
      for (const round of rounds.slice(0, -1)) {
        // A round that already takes longer is left as it is.
        expect(roundLength(ms, round) + pace.introMs).toBeGreaterThanOrEqual(pace.roundMs ?? 0);
      }
      const held = rounds
        .slice(0, -1)
        .filter((r) => roundLength(ms, r) + pace.introMs === pace.roundMs);
      expect(held.length).toBeGreaterThan(0);
    }
  });

  it('brisk adds no padding: every beat plays at its own time, a round within its budget', () => {
    const pace = REPLAY_PACES.brisk;
    const ms = durationsOf(pace, 1);
    const plain = beatDurations(beats, { speed: 1, budgetMs: pace.budgetMs });
    expect(ms).toEqual(plain);
    for (const round of rounds) {
      expect(roundLength(ms, round)).toBeLessThanOrEqual(pace.budgetMs + beats.length);
    }
  });

  it('the paces are ordered: finale slowest, then half, then brisk; 2x halves each', () => {
    const total = (id: (typeof REPLAY_PACE_IDS)[number], speed: 1 | 2): number => {
      const pace = REPLAY_PACES[id];
      return durationsOf(pace, speed).reduce((a, b) => a + b, 0);
    };
    expect(total('finale', 1)).toBeGreaterThan(total('half', 1));
    expect(total('half', 1)).toBeGreaterThan(total('brisk', 1));
    expect(total('half', 2)).toBeLessThan(total('half', 1));
  });
});

describe('the replay pace choice of this device (staging)', () => {
  it('defaults to the finale pace and ignores an unknown value', () => {
    expect(storedPace(fake())).toBe('finale');
    expect(storedPace(fake({ [PACE_KEY]: 'warp' }))).toBe('finale');
    expect(isReplayPace('warp')).toBe(false);
  });

  it('remembers a choice and the replay reads it', () => {
    const storage = fake();
    choosePace('half', storage);
    expect(storedPace(storage)).toBe('half');
    expect(replayPace()).toBe(REPLAY_PACES.half);
    setReplayPace('finale');
    expect(replayPace()).toBe(REPLAY_PACES.finale);
  });
});
