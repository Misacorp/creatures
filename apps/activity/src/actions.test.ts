import { describe, expect, it } from 'vitest';
import { ActionIds, isStaleError } from './actions';
import { ApiError } from './api';
import type { DungeonAct } from './dungeon-types';

describe('action names', () => {
  it('pins the name of every keyed action', () => {
    expect(ActionIds.starter('splashet')).toBe('starter:splashet');
    expect(ActionIds.ribbon('c1')).toBe('ribbon:c1');
    expect(ActionIds.evolve('c1')).toBe('evolve:c1');
    expect(ActionIds.claimJob('j1')).toBe('claim-job:j1');
    expect(ActionIds.dungeonStart(['a', 'b', 'c'])).toBe('dungeon-start:["a","b","c"]');
    expect(
      ActionIds.send({
        creatureId: 'c1',
        destination: 'tide-pools',
        duration: 'short',
        supplies: [{ source: 'owned', id: 'lantern' }],
      }),
    ).toBe('send:c1:tide-pools:short:owned:lantern');
  });

  it('makes a treat another action: the same trip, job or run with one is not the same request', () => {
    const trip = {
      creatureId: 'c1',
      destination: 'tide-pools',
      duration: 'short' as const,
      supplies: [],
    };
    expect(ActionIds.send({ ...trip, treat: true })).toBe(`${ActionIds.send(trip)}:treat`);
    expect(ActionIds.send({ ...trip, treat: false })).toBe(ActionIds.send(trip));
    const craft = {
      kind: 'craft' as const,
      creatureId: 'c1',
      blueprintId: 'kelp-cap',
      reach: 'none' as const,
    };
    expect(ActionIds.job({ ...craft, treat: true })).toBe(`${ActionIds.job(craft)}:treat`);
    const supply = { kind: 'supply' as const, creatureId: 'c1', supplyId: 'lure-basic' };
    expect(ActionIds.job({ ...supply, treat: true })).not.toBe(ActionIds.job(supply));
    // A run is named by its team and by who got a treat, whatever order the treats came in.
    expect(ActionIds.dungeonStart(['a', 'b', 'c'], ['b', 'a'])).toBe(
      ActionIds.dungeonStart(['a', 'b', 'c'], ['a', 'b']),
    );
    expect(ActionIds.dungeonStart(['a', 'b', 'c'], ['a'])).not.toBe(
      ActionIds.dungeonStart(['a', 'b', 'c']),
    );
  });

  it('names the answers of the duplicate choice and the Talent Book', () => {
    expect(ActionIds.catchChoice('p1', { choice: 'release' })).toBe('catch:p1:release:');
    expect(ActionIds.catchChoice('p1', { choice: 'fuse', creatureId: 'c1' })).toBe(
      'catch:p1:fuse:c1',
    );
    expect(ActionIds.catchChoice('p1', { choice: 'teach', creatureId: 'c1' })).toBe(
      'catch:p1:teach:c1',
    );
    // The same card answered another way, or for another creature, is another action (another key).
    expect(ActionIds.catchChoice('p1', { choice: 'teach', creatureId: 'c2' })).not.toBe(
      ActionIds.catchChoice('p1', { choice: 'teach', creatureId: 'c1' }),
    );
    expect(ActionIds.catchChoice('p1', { choice: 'recommended' })).not.toBe(
      ActionIds.catchChoice('p1', { choice: 'release' }),
    );
    expect(ActionIds.catchAll()).toBe('catch-all');
    expect(ActionIds.talentSlot('c1', 'playful', true, 2)).toBe('talent-slot:c1:playful:g:2');
    expect(ActionIds.talentSlot('c1', 'playful', false, 2)).not.toBe(
      ActionIds.talentSlot('c1', 'playful', true, 2),
    );
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
    expect(ActionIds.dungeonStart(['a', 'b', 'c'])).toBe(ActionIds.dungeonStart(['a', 'b', 'c']));
    expect(ActionIds.dungeonStart(['a', 'b', 'c'])).not.toBe(
      ActionIds.dungeonStart(['c', 'b', 'a']),
    );
  });

  it('names a dungeon act by its run, its step and what it does', () => {
    const at = (step: number, act: Parameters<typeof ActionIds.dungeonAct>[2]) =>
      ActionIds.dungeonAct('run1', step, act);
    expect(at(2, { type: 'move', node: 'f1l0' })).toBe('dungeon-act:run1:2:move:f1l0');
    expect(at(3, { type: 'event', option: 1 })).toBe('dungeon-act:run1:3:event:1');
    expect(at(4, { type: 'home' })).toBe('dungeon-act:run1:4:home');
    expect(at(4, { type: 'descend' })).toBe('dungeon-act:run1:4:descend');
    // The same act at the same step is the same action (a retry keeps its key)...
    expect(at(2, { type: 'move', node: 'f1l0' })).toBe(at(2, { type: 'move', node: 'f1l0' }));
    // ...and anything else is another one.
    const camp: Extract<DungeonAct, { type: 'camp' }> = {
      type: 'camp',
      choice: 'swap',
      out: 'a',
      in: 'd',
      order: ['a', 'b', 'c'],
    };
    const names = [
      at(2, { type: 'move', node: 'f1l0' }),
      at(2, { type: 'move', node: 'f1l1' }),
      at(3, { type: 'move', node: 'f1l0' }),
      ActionIds.dungeonAct('run2', 2, { type: 'move', node: 'f1l0' }),
      at(2, { type: 'event', option: 0 }),
      at(2, { type: 'event', option: 1 }),
      at(2, { type: 'home' }),
      at(2, { type: 'descend' }),
      at(2, { type: 'camp', choice: 'rest' }),
      at(2, { type: 'camp', choice: 'keepsake', keepsake: 'k1' }),
      at(2, { type: 'camp', choice: 'keepsake', keepsake: 'k2' }),
      at(2, camp),
      at(2, { ...camp, in: 'e' }),
      at(2, { ...camp, order: ['b', 'a', 'c'] }),
    ];
    expect(new Set(names).size).toBe(names.length);
  });

  it('never gives two kinds of intent the same name, even for the same id', () => {
    // Different kinds of action on the same id must not share a key.
    const names = [
      ActionIds.ribbon('x'),
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
