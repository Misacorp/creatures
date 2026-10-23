import { describe, expect, it } from 'vitest';
import { content, gamesIsSmall } from '../src/index';

/** The Games' size rule, on the shipped species: small is stage 1 of a line that still evolves. */
function species(id: string) {
  const s = content.creatures.find((c) => c.id === id);
  if (s === undefined) throw new Error(`no species ${id}`);
  return s;
}

describe('gamesIsSmall', () => {
  it('counts a stage 1 creature that can still evolve as small', () => {
    expect(gamesIsSmall(species('splashet'))).toBe(true);
    expect(gamesIsSmall(species('mudlump'))).toBe(true);
  });

  it('counts an evolved creature as big', () => {
    expect(gamesIsSmall(species('tidewing'))).toBe(false);
    expect(gamesIsSmall(species('bogwarden'))).toBe(false);
  });

  it('counts a single-stage line as big: it is full grown at stage 1', () => {
    expect(gamesIsSmall(species('lanternfin'))).toBe(false);
    expect(gamesIsSmall(species('hearthshell'))).toBe(false);
    expect(gamesIsSmall(species('coralynx'))).toBe(false);
  });
});
