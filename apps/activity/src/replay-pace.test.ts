import { RULES } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { buildBeats } from './fight-v2';
import { beatDurations, INTRO_LIVE_MS, REPLAY_PACE, STAGE_ROUND_MS } from './playback-v2';
import { playSample } from './workbench/fight-v2-sample';

const stage = playSample({ slot: 4, players: 4, stage: 1, seed: 'pace' });
const beats = buildBeats(stage.events, { creatures: stage.fighters });
const rounds = [...new Set(beats.map((b) => b.round))].filter((r) => r > 0);

const roundLength = (ms: number[], round: number): number =>
  beats.reduce((sum, b, k) => (b.round === round ? sum + (ms[k] ?? 0) : sum), 0);

describe('the raid replay pace', () => {
  it("is the live finale's: one fixed pace of the live round's length", () => {
    expect(STAGE_ROUND_MS).toBe(RULES.raid.v2.liveRoundMs);
    expect(REPLAY_PACE.roundMs).toBe(STAGE_ROUND_MS);
    expect(REPLAY_PACE.introMs).toBe(INTRO_LIVE_MS);
  });

  it('holds every round but the last to the length of the live round (30 s)', () => {
    const ms = beatDurations(beats, { speed: 1, ...REPLAY_PACE });
    for (const round of rounds.slice(0, -1)) {
      // A round that already takes longer is left as it is.
      expect(roundLength(ms, round) + REPLAY_PACE.introMs).toBeGreaterThanOrEqual(
        REPLAY_PACE.roundMs,
      );
    }
    const held = rounds
      .slice(0, -1)
      .filter((r) => roundLength(ms, r) + REPLAY_PACE.introMs === REPLAY_PACE.roundMs);
    expect(held.length).toBeGreaterThan(0);
  });

  it('2x halves the replay', () => {
    const total = (speed: 1 | 2): number =>
      beatDurations(beats, { speed, ...REPLAY_PACE }).reduce((a, b) => a + b, 0);
    expect(total(2)).toBeLessThan(total(1));
  });
});
