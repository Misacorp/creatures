import type { RefObject } from 'preact';
import { useEffect, useLayoutEffect, useState } from 'preact/hooks';

/** Local time in ms, refreshed every second while `active`. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [active]);
  return now;
}

/**
 * The server's clock in ms (the local clock plus `offset`, which is server minus local), refreshed
 * every second while `active`. Every countdown on a screen reads this one value.
 */
export function useServerNow(offset: number, active: boolean): number {
  return useNow(active) + offset;
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** True while the player asks for less motion. Updates if they change the setting. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia === 'function' && matchMedia(REDUCED_MOTION).matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined;
    const query = matchMedia(REDUCED_MOTION);
    const update = (): void => {
      setReduced(query.matches);
    };
    update();
    query.addEventListener('change', update);
    return () => {
      query.removeEventListener('change', update);
    };
  }, []);
  return reduced;
}

/**
 * True while the media query matches (updates when the window changes). False where there is no
 * `matchMedia` (the tests' fake DOM) until a test provides one.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof matchMedia === 'function' && matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined;
    const list = matchMedia(query);
    const update = (): void => {
      setMatches(list.matches);
    };
    update();
    list.addEventListener('change', update);
    return () => {
      list.removeEventListener('change', update);
    };
  }, [query]);
  return matches;
}

/**
 * The width of an element in CSS pixels, kept up to date as it resizes. `fallback` is used until the
 * element has been measured (and where there is no layout at all).
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    const read = (): void => {
      const measured = Math.round(el.getBoundingClientRect().width);
      if (measured > 0) setWidth(measured);
    };
    read();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);
  return width;
}
