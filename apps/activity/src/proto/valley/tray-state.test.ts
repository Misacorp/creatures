import { describe, expect, it } from 'vitest';
import { ROSTER_ID, TOUR, creatureOf, initialWorld, worldAtStep } from '../world';
import { placesFor, trayBadge, trayFor } from './tray-state';

describe('the tray', () => {
  it('marks only the exceptions; a free creature carries nothing', () => {
    const world = initialWorld();
    const state = (id: string): string => trayBadge(world, creatureOf(world, id)).state;
    expect(state(ROSTER_ID(4))).toBe('loot');
    expect(state(ROSTER_ID(6))).toBe('ready');
    expect(state(ROSTER_ID(2))).toBe('evolve');
    expect(state(ROSTER_ID(1))).toBe('trip');
    expect(state(ROSTER_ID(7))).toBe('free');
    expect(trayBadge(world, creatureOf(world, ROSTER_ID(4))).label).toBe(
      'Sproutle, level 7. Home from Verdant Hollow with loot.',
    );
    const later = worldAtStep(6);
    expect(trayBadge(later, creatureOf(later, TOUR.raidCreatureIds[0] ?? '')).state).toBe('raid');
    expect(trayBadge(later, creatureOf(later, TOUR.job.creatureId)).state).toBe('job');
  });

  it('lists the ones that need you first, then the free ones, then the busy ones', () => {
    const states = trayFor(initialWorld(), 'valley').map((c) => trayBadge(initialWorld(), c).state);
    expect(states.slice(0, 3)).toEqual(['loot', 'ready', 'evolve']);
    expect(states.at(-1)).toBe('trip');
  });

  it('shows a place only the creatures it is about', () => {
    const world = initialWorld();
    const forge = trayFor(world, 'forge').map((c) => trayBadge(world, c).state);
    expect(forge).not.toContain('trip');
    expect(forge).not.toContain('loot');
    expect(forge[0]).toBe('ready');
    const cave = trayFor(world, 'cave').map((c) => trayBadge(world, c).state);
    expect(new Set(cave)).toEqual(new Set(['free']));
  });

  it('lights the places a creature can go now, and says why not for the rest', () => {
    const world = initialWorld();
    const free = placesFor(world, creatureOf(world, ROSTER_ID(7)));
    expect(free.forge.ok).toBe(true);
    expect(free.arena.ok).toBe(true);
    expect(free.signpost.ok).toBe(true);
    const away = placesFor(world, creatureOf(world, ROSTER_ID(1)));
    expect(away.forge).toEqual({ ok: false, word: 'Away' });
    expect(away.arena).toEqual({ ok: false, word: 'Away' });
    const home = placesFor(world, creatureOf(world, ROSTER_ID(4)));
    expect(home.signpost.ok).toBe(true);
    // Once both explorer slots are out, a free creature cannot take the road.
    const four = worldAtStep(4);
    const full = { ...four, slots: { ...four.slots, used: four.slots.total } };
    expect(placesFor(full, creatureOf(full, ROSTER_ID(7))).signpost).toEqual({
      ok: false,
      word: 'Full',
    });
  });
});
