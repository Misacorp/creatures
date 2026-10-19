/**
 * The gear view (inventory, parts, blueprints, jobs) of `Game`: loaded once the game is on screen
 * (the first load also gives the welcome kit, once), loaded again on request, and replaced by the
 * fresh view an action answers with.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { fetchGear } from './gear-api';
import type { GearState } from './gear-types';

export function useGearState(enabled: boolean) {
  // Gear, parts, blueprints and jobs; null until the first load (or when it failed).
  const [gear, setGear] = useState<GearState | null>(null);
  const [failed, setFailed] = useState(false);
  // Counts gear views that came from an action, so a slower load that started before one is dropped.
  const version = useRef(0);

  /** Loads the gear view (inventory, parts, jobs). */
  function load(): void {
    const startedAt = version.current;
    fetchGear().then(
      (next) => {
        // An action answered while this was on its way: its view is newer.
        if (version.current !== startedAt) return;
        setGear(next);
        setFailed(false);
      },
      () => {
        setFailed(true);
      },
    );
  }

  // The gear view loads once the game is on screen, so the collection can offer its items at once.
  useEffect(() => {
    if (enabled) load();
  }, [enabled]);

  /** Puts the view an action answered with on screen; a load still on its way is dropped. */
  function replace(next: GearState): void {
    version.current += 1;
    setGear(next);
    setFailed(false);
  }

  return { gear, failed, load, replace };
}
