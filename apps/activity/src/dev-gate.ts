/**
 * The gate of the staging-only debug panel (`src/dev/`, plan in `docs/design/dev-tools.md`). This file
 * is the only place in the main bundle that mentions the panel, and it does so with a dynamic `import()`
 * behind two checks:
 *
 * - `__DEV_TOOLS_BUILD__`: a build-time constant (`vite.config.ts`). In a production build it is the
 *   literal `false`, so the `import()` below is dead code and the panel is not in the bundle at all.
 * - `enabled`: the server said `devTools: true` (only the staging Worker does; `/api/config` and
 *   `/api/me`). Every dev route refuses with a 404 anyway when the server's gate is off.
 */
import type { JSX } from 'preact';
import type { Creature } from './api';
import type { Tab } from './tabs';

/** What the game gives the panel. */
export interface DevPanelProps {
  /** The tab on screen: its section opens first. */
  tab: Tab;
  /** The player's creatures, for the pickers. */
  creatures: readonly Creature[];
  /** Called after a tool changed something, so the game reloads its state and views. */
  onChanged: () => void;
}

export interface DevPanelModule {
  default: (props: DevPanelProps) => JSX.Element | null;
}

export type DevPanelLoader = () => Promise<DevPanelModule>;

/**
 * Starts loading the panel's code, or answers null when it must not load: a production build, or a
 * server that did not turn the tools on. `load` is for tests.
 */
export function loadDevPanel(
  enabled: boolean,
  load?: DevPanelLoader,
): Promise<DevPanelModule> | null {
  if (__DEV_TOOLS_BUILD__ && enabled) {
    return (load ?? (() => import('./dev/Panel')))();
  }
  return null;
}
