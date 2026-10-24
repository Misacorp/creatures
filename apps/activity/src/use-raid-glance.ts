/**
 * The raid's week times for the Home page: the game loads the raid view (the same call the Raid tab makes,
 * `GET /api/raid`) when it opens and again each time Home is shown, so Home's "Coming up" shows the real
 * phase times and the finale. It keeps only the schedule. A failed load is silent: the board just leaves the
 * raid rows out, and the next call tries again. Only the newest load may land.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { RaidGlance } from './home-view';
import { fetchRaid, type RaidView } from './raid-api';

/** What the Home page keeps of a raid view. */
export function glanceOf(view: Pick<RaidView, 'schedule'>): RaidGlance {
  return { schedule: view.schedule };
}

/** The longest a timer may wait (a bigger delay fires at once). */
const MAX_DELAY = 2 ** 31 - 1;

/** The next moment of the schedule after `now` (a phase or the finale), or null when the week is over. */
export function nextScheduleTime(glance: RaidGlance, now: number): number | null {
  let next: number | null = null;
  for (const at of Object.values(glance.schedule)) {
    if (at > now && (next === null || at < next)) next = at;
  }
  return next;
}

/**
 * `enabled`: the game is on screen (a starter is chosen). `onHome`: Home is the screen shown, by any route.
 * Loads when the game opens and each time Home becomes the screen, and once more at the next moment of the
 * loaded schedule while Home stays open (a phase or the finale passing), so its times never go stale.
 * `offset` is the server clock minus the device clock. `raid` is null until the first load lands.
 */
export function useRaidGlance(enabled: boolean, onHome: boolean, offset: number) {
  const [raid, setRaid] = useState<RaidGlance | null>(null);
  const seq = useRef(0);

  function load(): void {
    const mine = ++seq.current;
    fetchRaid().then(
      (view) => {
        if (mine === seq.current) setRaid(glanceOf(view));
      },
      () => undefined,
    );
  }

  useEffect(() => {
    if (enabled && (onHome || seq.current === 0)) load();
  }, [enabled, onHome]);

  // One timer to the next moment of the loaded schedule; a new schedule, leaving Home or unmounting clears it.
  useEffect(() => {
    if (!enabled || !onHome || raid === null) return undefined;
    const now = Date.now() + offset;
    const next = nextScheduleTime(raid, now);
    if (next === null) return undefined;
    const timer = setTimeout(load, Math.min(next - now, MAX_DELAY));
    return () => {
      clearTimeout(timer);
    };
  }, [enabled, onHome, raid]);

  return { raid, load };
}
