/**
 * What a combat v2 week says outside the board: stages instead of phases, the join line, the Home notice for swap requests, the
 * picker's "Out this weekend" and the swap error words. A v1 week keeps its words.
 */
import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { errorText } from './game';
import { homeAlerts, needsYou, type HomeInput } from './home-view';
import { nowAction } from './raid-now';
import { eventTitle, scheduleSteps } from './raid-time';
import { phaseName } from './raid-text';
import { OUT_REASON, pickerOptions, type PickerCreature } from './roster-picker';
import { glanceOf } from './use-raid-glance';
import { raidV2Sample } from './workbench/raid-v2-sample';

const sample = (swaps: 'none' | 'incoming') =>
  raidV2Sample({
    slot: 1,
    players: 4,
    stagesPlayed: 0,
    mine: 3,
    bestShareBp: 0,
    knockedOut: false,
    swaps,
  }).view;

describe('stages on a v2 week', () => {
  it('names the events and phases Stage 1 and Stage 2, and keeps the v1 words without rules', () => {
    expect(eventTitle('phase1', 2)).toBe('Stage 1');
    expect(eventTitle('phase2', 2)).toBe('Stage 2');
    expect(eventTitle('finale', 2)).toBe('Finale');
    expect(eventTitle('phase1')).toBe('Phase 1');
    expect(phaseName('phase2', 2)).toBe('Stage 2');
    expect(phaseName('phase2')).toBe('Phase 2');
    const view = sample('none');
    expect(scheduleSteps(view.schedule, view.next, view.timezone, 2).map((s) => s.title)).toEqual([
      'Preparation',
      'Stage 1',
      'Stage 2',
      'Finale',
    ]);
  });

  it('tells a player who is not in that joining closes at stage 1', () => {
    const view = { ...sample('none'), party: null };
    const action = nowAction(
      { ...view, you: { ...view.you, inRoster: false } },
      'before',
      view.serverNow,
    );
    expect(action.detail).toContain('before stage 1');
  });
});

describe('the Home notice for swap requests', () => {
  const input = (swapText: string | null): HomeInput => ({
    now: 0,
    timezone: 'Europe/Helsinki',
    trips: [],
    jobs: null,
    creatures: [],
    games: null,
    pending: 0,
    attention: null,
    raid: {
      schedule: sample('none').schedule,
      rules: 2,
      swapText,
    },
    forecast: null,
  });

  it('is a row of the Raid place with the request in words', () => {
    const rows = needsYou(input('Mira asks to swap Cindle for Pyrelynx'));
    const raid = rows.find((r) => r.place === 'raid');
    expect(raid?.reason).toBe('Mira asks to swap Cindle for Pyrelynx');
  });

  it('is no row without a request', () => {
    expect(needsYou(input(null)).some((r) => r.place === 'raid')).toBe(false);
    expect(homeAlerts(input(null)).raid).toBeNull();
  });

  it('comes from the week view: the one request in words, nothing for a v1 week', () => {
    expect(glanceOf(sample('incoming')).swapText).toMatch(/^Mira asks to swap \S+ for \S+$/);
    expect(glanceOf(sample('none')).swapText).toBeNull();
    const { rules, v2, ...v1 } = sample('none');
    void rules;
    void v2;
    expect(glanceOf(v1)).toEqual({ schedule: v1.schedule });
  });
});

describe('the roster picker on a v2 week', () => {
  const owned: PickerCreature[] = ['a', 'b', 'c', 'd'].map((id, i) => ({
    id,
    species: 'cindle',
    nickname: null,
    level: 10 + i,
    power: 100 + i,
    caughtAt: i,
  }));

  it('lists a creature knocked out this weekend last, greyed, "Out this weekend"', () => {
    const options = pickerOptions({
      creatures: owned,
      row: [],
      length: 12,
      slot: 0,
      turnOrder: '',
      showEffects: false,
      out: new Set(['d']),
    });
    expect(options.at(-1)).toMatchObject({ id: 'd', disabled: OUT_REASON, recommended: false });
    expect(options.filter((o) => o.disabled !== null)).toHaveLength(1);
  });

  it('is as it was without knocked-out creatures', () => {
    const options = pickerOptions({
      creatures: owned,
      row: [],
      length: 9,
      slot: 0,
      turnOrder: 'left_to_right',
      showEffects: false,
    });
    expect(options.every((o) => o.disabled === null)).toBe(true);
  });
});

describe('the swap answers', () => {
  it.each([
    ['changed', 'That swap is out of date: the creatures moved. The board was refreshed.'],
    ['too_many_requests', 'You have too many swap requests open. Wait for some answers first.'],
    ['locked', 'The raid is locked. Changes are closed for this week.'],
    ['knocked_out', 'That creature is out for the rest of this weekend.'],
  ])('says "%s" in plain words', (code, text) => {
    expect(errorText(new ApiError(409, code))).toBe(text);
  });
});
