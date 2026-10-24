/**
 * The raid's week times for the Home page: the game loads the raid view (the same call the Raid tab makes,
 * `GET /api/raid`) when it opens and again each time Home is opened, so Home's "Coming up" shows the real
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

/** `enabled`: the game is on screen (a starter is chosen). `raid` is null until the first load lands. */
export function useRaidGlance(enabled: boolean) {
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
    if (enabled) load();
  }, [enabled]);

  return { raid, load };
}
