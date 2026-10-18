import { describe, expect, it } from 'vitest';
import {
  fightResultWord,
  foeHpOutcomeLine,
  lootOf,
  pickedLine,
  roundsLine,
  routeRun,
  stepAt,
} from './dungeon-history';
import { sampleHistory } from './dungeon-map-sample';
import { sampleMap, sampleSummary } from './dungeon-path-samples';

describe('stepAt', () => {
  const history = sampleHistory(sampleMap(), ['f0l1', 'f1l1']);

  it('finds the entry of a visited room, and nothing for another or for no history', () => {
    expect(stepAt(history, 'f1l1')).toMatchObject({ kind: 'mystery', result: 'event' });
    expect(stepAt(history, 'f2l0')).toBeUndefined();
    expect(stepAt(undefined, 'f1l1')).toBeUndefined();
    expect(stepAt([], 'f1l1')).toBeUndefined();
  });
});

describe('the words of a fight', () => {
  it('says the foe HP as "HP left / max", never below 0 or above the max', () => {
    expect(foeHpOutcomeLine({ foeHpEnd: 0, foeHpMax: 412 })).toBe('HP 0 / 412');
    expect(foeHpOutcomeLine({ foeHpEnd: 120, foeHpMax: 412 })).toBe('HP 120 / 412');
    expect(foeHpOutcomeLine({ foeHpEnd: -4, foeHpMax: 412 })).toBe('HP 0 / 412');
    expect(foeHpOutcomeLine({ foeHpEnd: 900, foeHpMax: 412 })).toBe('HP 412 / 412');
  });

  it('says Cleared or Defeat, and how long it took', () => {
    expect(fightResultWord({ cleared: true })).toBe('Cleared');
    expect(fightResultWord({ cleared: false })).toBe('Defeat');
    expect(roundsLine({ cleared: true, rounds: 5 })).toBe('Won in 5 rounds.');
    expect(roundsLine({ cleared: true, rounds: 1 })).toBe('Won in 1 round.');
    expect(roundsLine({ cleared: false, rounds: 8 })).toBe('Your team fell after 8 rounds.');
  });
});

describe('the pick of a mystery room', () => {
  it('ends the option in a full stop once', () => {
    expect(pickedLine('Take one coin')).toBe('You picked: Take one coin.');
    expect(pickedLine(' Take the pile! ')).toBe('You picked: Take the pile!');
  });
});

describe('lootOf', () => {
  const log = sampleHistory(sampleMap(), ['f0l1', 'f1l1', 'f2l1', 'f3l1'], { lostLast: false });

  it('is the loot a room put in the pack, and null when it put nothing or has none to give', () => {
    expect(lootOf(log[0] as never)).toEqual({ bait: 1, essence: 0, scrap: 0 });
    expect(lootOf(log[1] as never)).toEqual({ bait: 0, essence: 0, scrap: 1 });
    expect(lootOf(log[3] as never)).toBeNull();
    const lost = sampleHistory(sampleMap(), ['f0l1'], { lostLast: true });
    expect(lootOf(lost[0] as never)).toBeNull();
    const pending = sampleHistory(sampleMap(), ['f0l1', 'f1l1'], { pendingLast: true });
    expect(lootOf(pending[1] as never)).toBeNull();
  });
});

describe('routeRun', () => {
  it('is the map and a finished run with the rooms walked, no room it stands in and nowhere to go', () => {
    const summary = sampleSummary('home');
    const route = routeRun(summary);
    expect(route?.map).toBe(summary.route?.map);
    expect(route?.run).toMatchObject({ status: 'done', at: null, reachable: [] });
    expect(route?.run.path).toEqual(summary.route?.path);
    expect(route?.run.history).toBe(summary.route?.history);
    expect(route?.run.landmark).toBe(summary.landmark);
  });

  it('is null for a summary with no route', () => {
    expect(routeRun({ landmark: false })).toBeNull();
  });
});
