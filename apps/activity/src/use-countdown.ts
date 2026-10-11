import { useEffect, useState } from 'preact/hooks';
import { nextCountdownChange } from './countdown';

/**
 * The milliseconds left until `startsAtLocal` (a local-clock time: the server's start time minus the
 * clock offset), or null while the countdown is not wanted. It wakes up just after the number is due
 * to change (each whole second in the last 30, then once more when "FIGHT!" ends), so the number on
 * screen follows the server's start time without a ticker running every second all week. It makes no
 * requests.
 */
export function useRemaining(startsAtLocal: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startsAtLocal === null) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = (): void => {
      const at = Date.now();
      setNow(at);
      const wait = nextCountdownChange(startsAtLocal - at);
      // A few milliseconds past the boundary, so the new second has really begun.
      if (wait !== null) timer = setTimeout(tick, wait + 15);
    };
    tick();
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [startsAtLocal]);
  return startsAtLocal === null ? null : startsAtLocal - now;
}
