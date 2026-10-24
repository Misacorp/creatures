import type { Screen } from './tabs';

/** What going to a screen sets besides the screen itself (see `navStateFor`). */
export interface GoOptions {
  /** Where Back goes on the new screen (a pin that opened it); leave out for none. */
  backTo?: Screen;
  /** Open the Creatures view with its "Needs you" filter on. */
  needsFilter?: boolean;
}

/** The navigation state every change of screen leaves behind, whichever route it took. */
export interface NavState {
  tab: Screen;
  settingsOpen: boolean;
  backTo: { place: Screen; to: Screen } | null;
  creaturesNeeds: boolean;
}

/**
 * Going to a screen from anywhere (dock, a trophy shelf, a notice, a pin, a link): Settings closes, Back is
 * cleared unless the caller set one on purpose, and the Creatures "Needs you" filter is off unless asked.
 */
export function navStateFor(screen: Screen, opts: GoOptions = {}): NavState {
  return {
    tab: screen,
    settingsOpen: false,
    backTo: opts.backTo === undefined ? null : { place: screen, to: opts.backTo },
    creaturesNeeds: screen === 'collection' && opts.needsFilter === true,
  };
}
