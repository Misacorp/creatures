import { content } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { sampleCreature } from '../creature-card-sample';
import { FALLBACK_STARTER, starterCreature, starterLook } from './starter-creature';

const starterIds = content.creatures.filter((c) => c.starter).map((c) => c.id);

/** A creature of `species` (its line the species' own, as for every stage-1 starter), caught at `caughtAt`. */
function owned(id: string, species: string, caughtAt: number, line = species) {
  return { ...sampleCreature('growing'), id, species, line, caughtAt, shiny: false };
}

describe('the starter rule', () => {
  it('has starters in the content, and Sproutle is one of them', () => {
    expect(starterIds).toContain(FALLBACK_STARTER);
  });

  it('is the oldest owned creature of a starter line', () => {
    const creatures = [
      owned('late', 'splashet', 3000),
      owned('first', 'cindle', 1000),
      owned('second', 'sproutle', 2000),
    ];
    expect(starterCreature(creatures)?.id).toBe('first');
    expect(starterLook(creatures)).toEqual({ species: 'cindle', shiny: false });
  });

  it('skips a creature that is not of a starter line, however old', () => {
    const wild = content.creatures.find((c) => !starterIds.includes(c.line));
    if (wild === undefined) throw new Error('the content has a non-starter line');
    const creatures = [owned('wild', wild.id, 1, wild.line), owned('mine', 'sproutle', 500)];
    expect(starterCreature(creatures)?.id).toBe('mine');
  });

  it('follows the starter through its evolution, by line, and draws the evolved form', () => {
    const evolved = content.creatures.find((c) => c.line === 'cindle' && c.stage > 1);
    if (evolved === undefined) throw new Error('the cindle line evolves');
    const creatures = [owned('x', evolved.id, 100, 'cindle'), owned('y', 'sproutle', 900)];
    expect(starterLook(creatures).species).toBe(evolved.id);
  });

  it('breaks a tie by id so it never changes between loads', () => {
    const a = owned('a', 'cindle', 10);
    const b = owned('b', 'sproutle', 10);
    expect(starterCreature([b, a])?.id).toBe('a');
    expect(starterCreature([a, b])?.id).toBe('a');
  });

  it('draws Sproutle when nothing owned can be the starter', () => {
    expect(starterCreature([])).toBeNull();
    expect(starterLook([])).toEqual({ species: 'sproutle', shiny: false });
  });

  it('keeps the starter shiny colours', () => {
    const shiny = { ...owned('s', 'cindle', 1), shiny: true };
    expect(starterLook([shiny])).toEqual({ species: 'cindle', shiny: true });
  });
});
