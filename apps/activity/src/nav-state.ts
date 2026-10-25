import type { Place } from './tabs';

/** What going to a place sets besides the place itself (see `navStateFor`). */
export interface GoOptions {
  /** Open the Creatures view with its "Needs you" filter on. */
  needsFilter?: boolean;
}

/** The navigation state every change of place leaves behind, whichever route it took. */
export interface NavState {
  tab: Place;
  settingsOpen: boolean;
  creaturesNeeds: boolean;
}

/**
 * Going to a place from anywhere (dock, a trophy shelf, a notice, a link): Settings closes and the Creatures
 * "Needs you" filter is off unless asked.
 */
export function navStateFor(place: Place, opts: GoOptions = {}): NavState {
  return {
    tab: place,
    settingsOpen: false,
    creaturesNeeds: place === 'collection' && opts.needsFilter === true,
  };
}
