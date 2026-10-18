import { describe, expect, it } from 'vitest';
import { SAMPLE_STATE, sampleCreature, sampleRoster } from './creature-card-sample';
import { creatureNeeds, needyIds } from './creature-needs';

const plainState = { ...SAMPLE_STATE, pending: [] };

describe('what a creature needs', () => {
  it('needs nothing while it just grows', () => {
    expect(creatureNeeds(sampleCreature('growing'), plainState)).toEqual([]);
    expect(creatureNeeds(sampleCreature('top level'), plainState)).toEqual([]);
  });

  it('needs its ribbon once the server says it is ready, with the cost', () => {
    const [need, ...rest] = creatureNeeds(sampleCreature('ribbon ready'), plainState);
    expect(rest).toEqual([]);
    expect(need).toEqual({
      kind: 'ribbon',
      label: 'Earn Bronze Ribbon',
      detail: '6 scrap and 2 Ember shards',
    });
  });

  it('does not need a ribbon it cannot pay yet', () => {
    expect(creatureNeeds(sampleCreature('ribbon short'), plainState)).toEqual([]);
  });

  it('needs to evolve when the server says it can', () => {
    expect(creatureNeeds(sampleCreature('evolve ready'), plainState)).toEqual([
      { kind: 'evolve', label: 'Evolve into Pyrelynx', detail: '20 Essence' },
    ]);
    const locked = sampleCreature('evolve ready');
    const notYet = {
      ...locked,
      evolution: { toSpecies: 'pyrelynx', level: 15, essence: 20, available: false },
    };
    expect(creatureNeeds(notYet, plainState)).toEqual([]);
  });

  it('shows an evolve that is blocked while the creature is away or on a job, with the busy wording', () => {
    const ready = sampleCreature('evolve ready');
    expect(creatureNeeds({ ...ready, away: true }, plainState)).toEqual([
      {
        kind: 'evolve',
        label: 'Evolve into Pyrelynx',
        detail: 'Away on an expedition',
        blocked: 'Away on an expedition',
      },
    ]);
    const onJob = { ...ready, busy: { kind: 'job' as const, id: 'job-1' } };
    expect(creatureNeeds(onJob, plainState)[0]).toMatchObject({
      detail: 'On a job in the Workshop',
      blocked: 'On a job in the Workshop',
    });
  });

  it('needs to answer a waiting catch it can take, and only that one', () => {
    const pending = SAMPLE_STATE.pending[0];
    if (pending === undefined) throw new Error('the fixture has a waiting catch');
    const target = sampleCreature('growing');
    const other = { ...target, id: 'someone-else' };
    const state = {
      ...SAMPLE_STATE,
      pending: [{ ...pending, offered: { ...pending.offered, teach: [target.id], fuse: [] } }],
    };
    const [need] = creatureNeeds(target, state);
    expect(need?.kind).toBe('duplicate');
    expect(need?.detail).toBe('Splashet');
    expect(creatureNeeds(other, state)).toEqual([]);
  });

  it('says how many catches wait when there are several', () => {
    const target = sampleCreature('growing');
    const state = {
      ...SAMPLE_STATE,
      pending: SAMPLE_STATE.pending.slice(0, 3).map((card) => ({
        ...card,
        offered: { ...card.offered, teach: [target.id], fuse: [target.id] },
      })),
    };
    const [need] = creatureNeeds(target, state);
    expect(need).toEqual({
      kind: 'duplicate',
      label: 'Answer waiting catches',
      detail: '3 waiting',
    });
  });

  it('needs a talent slot filled when one is open and empty, the book has a talent and the Bait is there', () => {
    const creature = sampleCreature('talent to fill');
    const [need] = creatureNeeds(creature, plainState);
    expect(need).toEqual({
      kind: 'talent',
      label: 'Fill talent slot 2',
      detail: '10 Bait',
    });
    const poor = { ...plainState, balances: { ...plainState.balances, bait: 9 } };
    expect(creatureNeeds(creature, poor)).toEqual([]);
    const emptyBook = { ...creature, talents: { ...creature.talents, book: [] } };
    expect(creatureNeeds(emptyBook, plainState)).toEqual([]);
  });

  it('lists the needs in the order of the card: ribbon, evolve, catch, talent', () => {
    const target = {
      ...sampleCreature('talent to fill'),
      ribbon: {
        ...(sampleCreature('ribbon ready').ribbon as NonNullable<
          ReturnType<typeof sampleCreature>['ribbon']
        >),
      },
      evolution: { toSpecies: 'pyrelynx', level: 15, essence: 20, available: true },
    };
    const pending = SAMPLE_STATE.pending[0];
    if (pending === undefined) throw new Error('the fixture has a waiting catch');
    const state = {
      ...SAMPLE_STATE,
      pending: [{ ...pending, offered: { ...pending.offered, teach: [target.id], fuse: [] } }],
    };
    expect(creatureNeeds(target, state).map((n) => n.kind)).toEqual([
      'ribbon',
      'evolve',
      'duplicate',
      'talent',
    ]);
  });
});

describe('who needs the player', () => {
  it('collects the ids of the creatures with any need', () => {
    const roster = sampleRoster(12);
    expect([...needyIds(roster, plainState)].sort()).toEqual(['sample-0', 'sample-2']);
  });
});
