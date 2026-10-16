import { describe, expect, it } from 'vitest';
import { ActionIds, isStaleError } from './actions';
import { ApiError } from './api';

describe('action names', () => {
  it('pins the name of every keyed action', () => {
    expect(ActionIds.starter('splashet')).toBe('starter:splashet');
    expect(ActionIds.train('c1')).toBe('train:c1');
    expect(ActionIds.evolve('c1')).toBe('evolve:c1');
    expect(ActionIds.claimJob('j1')).toBe('claim-job:j1');
    expect(ActionIds.dungeonRun(['a', 'b', 'c'])).toBe('dungeon-run:["a","b","c"]');
    expect(
      ActionIds.send({
        creatureId: 'c1',
        destination: 'tide-pools',
        duration: 'short',
        supplies: [{ source: 'owned', id: 'lantern' }],
      }),
    ).toBe('send:c1:tide-pools:short:owned:lantern');
  });

  it('names a job start by its kind, creature and target', () => {
    expect(ActionIds.job({ kind: 'craft', creatureId: 'c', blueprintId: 'b', reach: 'none' })).toBe(
      'job:craft:c:b:none',
    );
    expect(ActionIds.job({ kind: 'dismantle', creatureId: 'c', itemIds: ['i2', 'i1'] })).toBe(
      'job:dismantle:c:i1,i2',
    );
    expect(ActionIds.job({ kind: 'supply', creatureId: 'c', supplyId: 's' })).toBe(
      'job:supply:c:s',
    );
  });

  it('names a trip the same whatever order its supplies were picked in', () => {
    const base = { creatureId: 'c1', destination: 'tide-pools', duration: 'short' } as const;
    const a = { source: 'owned', id: 'lantern' } as const;
    const b = { source: 'owned', id: 'rope' } as const;
    expect(ActionIds.send({ ...base, supplies: [a, b] })).toBe(
      ActionIds.send({ ...base, supplies: [b, a] }),
    );
    expect(ActionIds.send({ ...base, supplies: [a, b] })).toBe(
      'send:c1:tide-pools:short:owned:lantern,owned:rope',
    );
  });

  it('names different trips differently', () => {
    const base = { creatureId: 'c1', destination: 'tide-pools', duration: 'short' } as const;
    const names = [
      ActionIds.send({ ...base, supplies: [] }),
      ActionIds.send({ ...base, supplies: [], creatureId: 'c2' }),
      ActionIds.send({ ...base, supplies: [], destination: 'caves' }),
      ActionIds.send({ ...base, supplies: [], duration: 'long' }),
      ActionIds.send({ ...base, supplies: [{ source: 'owned', id: 'lantern' }] }),
    ];
    expect(new Set(names).size).toBe(names.length);
  });

  it('names the same job on two creatures, and two jobs on one creature, differently', () => {
    const craft = {
      kind: 'craft',
      creatureId: 'c1',
      blueprintId: 'wave-band',
      reach: 'none',
    } as const;
    const names = [
      ActionIds.job(craft),
      ActionIds.job({ ...craft, creatureId: 'c2' }),
      ActionIds.job({ ...craft, blueprintId: 'tide-ring' }),
      // The same craft aimed differently is another action, with its own key.
      ActionIds.job({ ...craft, reach: 'rare' }),
      ActionIds.job({ ...craft, reach: 'epic' }),
      ActionIds.job({ kind: 'supply', creatureId: 'c1', supplyId: 'wave-band' }),
      ActionIds.job({ kind: 'dismantle', creatureId: 'c1', itemIds: ['a'] }),
      ActionIds.job({ kind: 'dismantle', creatureId: 'c1', itemIds: ['a', 'b'] }),
    ];
    expect(new Set(names).size).toBe(names.length);
  });

  it('names a run by the order of its team', () => {
    expect(ActionIds.dungeonRun(['a', 'b', 'c'])).toBe(ActionIds.dungeonRun(['a', 'b', 'c']));
    expect(ActionIds.dungeonRun(['a', 'b', 'c'])).not.toBe(ActionIds.dungeonRun(['c', 'b', 'a']));
  });

  it('never gives two kinds of intent the same name, even for the same id', () => {
    // Different kinds of action on the same id must not share a key.
    const names = [
      ActionIds.train('x'),
      ActionIds.evolve('x'),
      ActionIds.claimJob('x'),
      ActionIds.starter('x'),
    ];
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('isStaleError', () => {
  it('is true for a 404 or a 409, whatever the code', () => {
    expect(isStaleError(new ApiError(404, 'not_found'))).toBe(true);
    expect(isStaleError(new ApiError(409, 'slot_taken'))).toBe(true);
    expect(isStaleError(new ApiError(404, null))).toBe(true);
  });

  it('is false for other answers and for failures with no answer', () => {
    expect(isStaleError(new ApiError(400, 'invalid_body'))).toBe(false);
    expect(isStaleError(new ApiError(429, 'rate_limited'))).toBe(false);
    expect(isStaleError(new ApiError(500, 'internal_error'))).toBe(false);
    expect(isStaleError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isStaleError(undefined)).toBe(false);
  });
});
