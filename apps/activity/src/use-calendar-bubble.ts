/**
 * The wall calendar's speech bubble, like the creatures' (`use-room-bubbles.ts`): after a random wait
 * the calendar says one short line about the day for a few seconds, then the next wait starts. Paused
 * while the page is hidden, and nothing is said without a forecast. Local flavour only; the randomness is
 * the browser's crypto source, never `Math.random`.
 */
import { createCryptoRng } from '@creatures/game';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  CALENDAR_BUBBLE_SHOW_MS,
  bubbleLines,
  calendarBubbleGap,
  pickBubble,
} from './weather-view';
import type { Forecast } from './weather-types';

/** The line on screen now, or null. */
export function useCalendarBubble(forecast: Forecast | null): string | null {
  const [line, setLine] = useState<string | null>(null);
  const latest = useRef(forecast);
  latest.current = forecast;

  useEffect(() => {
    const rng = createCryptoRng((array) => {
      crypto.getRandomValues(array as Uint32Array<ArrayBuffer>);
      return array;
    });
    let timer: ReturnType<typeof setTimeout> | undefined;

    const wait = (): void => {
      timer = setTimeout(speak, calendarBubbleGap(rng));
    };
    const speak = (): void => {
      const said = pickBubble(rng, bubbleLines(latest.current));
      if (said === null) {
        wait();
        return;
      }
      setLine(said);
      timer = setTimeout(() => {
        setLine(null);
        wait();
      }, CALENDAR_BUBBLE_SHOW_MS);
    };
    const onVisibility = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      if (document.hidden) setLine(null);
      else wait();
    };

    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) wait();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  return line;
}
