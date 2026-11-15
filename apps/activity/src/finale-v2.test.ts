import { RULES } from '@creatures/game';
import { combatV2 } from '@creatures/game/combat-v2';
import { describe, expect, it } from 'vitest';
import {
  ABILITY_OF_KIND,
  ACTION_IDS,
  ACTION_LINE,
  canFire,
  canToggleAuto,
  inputStatus,
  ownInput,
} from './finale-v2';
import type { LiveAbilityV2 } from './fight-v2-api';
import {
  beatDurations,
  resumeAt,
  roundBudgetMs,
  BEAT_MS,
  INTRO_LIVE_MS,
  REACTION_HOLD_MS,
  STAGE_ROUND_MS,
} from './playback-v2';
import { buildBeats } from './fight-v2';
import { liveSample, playSample } from './workbench/fight-v2-sample';

const input = (over: Partial<LiveAbilityV2> = {}): LiveAbilityV2 => ({
  key: 'm1:basic',
  alias: 'm1',
  abilityId: 'rally',
  kind: 'rally',
  mode: 'default',
  autoFire: true,
  fired: false,
  firedAtRound: null,
  fireAtRound: null,
  defaultRound: 6,
  row: null,
  ...over,
});

describe("the finale's one input", () => {
  it("says where it stands in the server's own numbers", () => {
    expect(inputStatus(input(), 8)).toMatchObject({
      phase: 'auto',
      text: 'Acts by itself in round 6',
    });
    expect(inputStatus(input({ mode: 'held', autoFire: false }), 8)).toMatchObject({
      phase: 'held',
    });
    expect(inputStatus(input({ mode: 'fired', fireAtRound: 4 }), 8)).toMatchObject({
      phase: 'queued',
      round: 4,
      text: 'Acts in round 4',
    });
    expect(inputStatus(input({ fired: true, firedAtRound: 6 }), 8).text).toBe('Acted in round 6');
  });

  it('offers Fire only while a round is left for it to take effect in', () => {
    const live = { status: 'live', round: 3, rounds: 8 } as const;
    expect(canFire(live, input())).toBe(true);
    expect(canFire({ ...live, round: 8 }, input())).toBe(false);
    expect(canFire({ ...live, round: 0 }, input())).toBe(false);
    expect(canFire({ status: 'lobby', round: 0, rounds: 8 }, input())).toBe(false);
    expect(canFire(live, input({ mode: 'fired', fireAtRound: 4 }))).toBe(false);
    expect(canFire(live, input({ fired: true, firedAtRound: 2 }))).toBe(false);
    expect(canToggleAuto(live, input())).toBe(true);
    expect(canToggleAuto(live, input({ fired: true }))).toBe(false);
  });

  it("finds the caller's own input", () => {
    const snap = liveSample({ slot: 4, players: 4, stage: 3, seed: 'a' }, { round: 2 });
    expect(ownInput(snap)?.alias).toBe('m1');
    expect(ownInput({ ...snap, you: null })).toBeNull();
    expect(ownInput({ ...snap, you: 'm9' })).toBeNull();
  });

  it("the words' numbers are the rules' numbers, and the ids are the ones the server deals", () => {
    const { rallyBp, shieldWallBp, purgeRounds } = combatV2.rules;
    expect(ACTION_LINE.rally).toContain(`${String(rallyBp / 100)}%`);
    expect(ACTION_LINE['shield-wall']).toContain(`${String(shieldWallBp / 100)}%`);
    expect(ACTION_LINE.purge).toContain(`${String(purgeRounds)} rounds`);
    expect([...ACTION_IDS].sort()).toEqual(Object.values(ABILITY_OF_KIND).sort());
  });
});

describe('the pace of a playback', () => {
  it('a round of a wide raid is squeezed into its budget; a small one plays at the base times', () => {
    const small = playSample({ slot: 4, players: 4, stage: 1, seed: 'pace' });
    const wide = playSample({ slot: 4, players: 15, stage: 1, seed: 'pace' });
    const smallBeats = buildBeats(small.events, { creatures: small.fighters });
    const wideBeats = buildBeats(wide.events, { creatures: wide.fighters });
    const roundOf = (beats: typeof smallBeats, ms: number[], round: number): number =>
      beats.reduce((sum, b, k) => (b.round === round ? sum + (ms[k] ?? 0) : sum), 0);
    const budget = 20_000;
    const wideMs = beatDurations(wideBeats, { speed: 1, budgetMs: budget });
    const base = (b: (typeof smallBeats)[number]): number =>
      BEAT_MS[b.kind] + (b.reacts ? REACTION_HOLD_MS : 0);
    const baseWide = wideBeats.reduce((s, b) => (b.round === 1 ? s + base(b) : s), 0);
    expect(baseWide).toBeGreaterThan(budget);
    expect(roundOf(wideBeats, wideMs, 1)).toBeLessThanOrEqual(budget + wideBeats.length);
    const smallMs = beatDurations(smallBeats, { speed: 1, budgetMs: budget });
    smallBeats.forEach((b, k) => expect(smallMs[k]).toBe(base(b)));
    const fast = beatDurations(smallBeats, { speed: 2, budgetMs: budget });
    expect(fast[0]).toBeLessThan(smallMs[0] ?? 0);
  });

  it("a replay holds each round to the live finale's round (one constant), the last round and a round that is longer excepted", () => {
    expect(STAGE_ROUND_MS).toBe(RULES.raid.v2.liveRoundMs);
    const s = playSample({ slot: 4, players: 4, stage: 1, seed: 'pace' });
    const beats = buildBeats(s.events, { creatures: s.fighters });
    const budgetMs = roundBudgetMs(STAGE_ROUND_MS, INTRO_LIVE_MS);
    const held = beatDurations(beats, {
      speed: 1,
      budgetMs,
      roundMs: STAGE_ROUND_MS,
      introMs: INTRO_LIVE_MS,
    });
    const rounds = [...new Set(beats.map((b) => b.round))].filter((r) => r > 0);
    const length = (round: number): number =>
      beats.reduce((sum, b, k) => (b.round === round ? sum + (held[k] ?? 0) : sum), 0);
    for (const round of rounds.slice(0, -1)) {
      expect(length(round) + INTRO_LIVE_MS).toBe(STAGE_ROUND_MS);
    }
    // The last round is not padded, and 2x halves everything.
    const last = rounds[rounds.length - 1] as number;
    const plain = beatDurations(beats, { speed: 1, budgetMs });
    expect(length(last)).toBe(
      beats.reduce((sum, b, k) => (b.round === last ? sum + (plain[k] ?? 0) : sum), 0),
    );
    const fast = beatDurations(beats, {
      speed: 2,
      budgetMs,
      roundMs: STAGE_ROUND_MS,
      introMs: INTRO_LIVE_MS,
    });
    expect(fast[0]).toBeLessThan(held[0] ?? 0);
  });

  it('a live stage that fell behind resumes at the round that is on', () => {
    const s = playSample({ slot: 4, players: 4, stage: 1, seed: 'pace' });
    const beats = buildBeats(s.events, { creatures: s.fighters });
    expect(resumeAt(beats, 0, 10_000)).toBe(0);
    const at = resumeAt(beats, 0, 5);
    expect(beats[at]?.kind).toBe('round');
    expect(beats[at]?.round).toBe(Math.max(...beats.map((b) => b.round)));
    // Close behind: nothing is skipped.
    expect(resumeAt(beats, beats.length - 2, 5)).toBe(beats.length - 2);
  });
});

describe('the hold on a reaction', () => {
  it('a beat that cashes a reaction stays longer than the same kind of beat without one', () => {
    const s = playSample({ slot: 4, players: 5, stage: 1, seed: 'fold', party: 'mixed' });
    const beats = buildBeats(s.events, { creatures: s.fighters });
    const ms = beatDurations(beats, { speed: 1, budgetMs: Number.POSITIVE_INFINITY });
    const at = (reacts: boolean): number =>
      beats.findIndex((b) => b.kind === 'creature' && b.reacts === reacts);
    expect(ms[at(true)]).toBe(BEAT_MS.creature + REACTION_HOLD_MS);
    expect(ms[at(false)]).toBe(BEAT_MS.creature);
  });
});
