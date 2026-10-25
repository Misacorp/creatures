import { describe, expect, it } from 'vitest';
import { navStateFor } from './nav-state';

describe('navStateFor', () => {
  it('closes Settings and clears the Needs-you filter on any plain change of place', () => {
    expect(navStateFor('games')).toEqual({
      tab: 'games',
      settingsOpen: false,
      creaturesNeeds: false,
    });
    expect(navStateFor('workshop').settingsOpen).toBe(false);
  });

  it('turns the Needs-you filter on only when asked, and only for the Creatures view', () => {
    expect(navStateFor('collection', { needsFilter: true }).creaturesNeeds).toBe(true);
    expect(navStateFor('collection').creaturesNeeds).toBe(false);
    expect(navStateFor('games', { needsFilter: true }).creaturesNeeds).toBe(false);
  });
});
