import { describe, expect, it } from 'vitest';
import { navStateFor } from './nav-state';

describe('navStateFor', () => {
  it('closes Settings and clears Back and the Needs-you filter on any plain change of place', () => {
    expect(navStateFor('games')).toEqual({
      tab: 'games',
      settingsOpen: false,
      backTo: null,
      creaturesNeeds: false,
    });
    expect(navStateFor('workshop').settingsOpen).toBe(false);
  });

  it('keeps a Back that was set on purpose, tied to the screen it was set for', () => {
    expect(navStateFor('journal', { backTo: 'home' }).backTo).toEqual({
      place: 'journal',
      to: 'home',
    });
  });

  it('turns the Needs-you filter on only when asked, and only for the Creatures view', () => {
    expect(navStateFor('collection', { needsFilter: true }).creaturesNeeds).toBe(true);
    expect(navStateFor('collection').creaturesNeeds).toBe(false);
    expect(navStateFor('games', { needsFilter: true }).creaturesNeeds).toBe(false);
  });
});
