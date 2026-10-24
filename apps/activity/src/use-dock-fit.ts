import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { dockCapacity, type DockWidths, type NavPlace } from './nav-places';

/**
 * How many buttons the phone dock holds right now. The dock first draws every place at its natural width
 * (`measuring`: the list's items carry `data-measure`, the place's id or "more", and `main-nav.css` lets them
 * keep their own size), reads each width and the room, and `dockCapacity` works out how many fit; it does
 * this again when the words change, when the fonts finish loading (the pixel font is wider than the
 * fallback) and, from the stored widths, whenever the list is resized. Everything runs before the first
 * paint. A window with no layout (the tests' fake DOM) never measures: `capacity` stays null, which shows
 * every place. `forced` (a number of buttons, for the tests and the workbench) skips all measuring.
 */
export function useDockFit(
  places: readonly NavPlace[],
  current: string,
  forced: number | undefined,
): { listRef: { current: HTMLUListElement | null }; capacity: number | null; measuring: boolean } {
  const listRef = useRef<HTMLUListElement>(null);
  const [room, setRoom] = useState<number | null>(null);
  const [fonts, setFonts] = useState(0);
  const [widths, setWidths] = useState<{ stamp: string; value: DockWidths | null } | null>(null);
  const stamp = `${places.map((p) => p.label).join('|')}#${String(fonts)}`;
  const measuring = forced === undefined && (widths === null || widths.stamp !== stamp);

  // The room: the list's width, and again when it changes.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list === null) return undefined;
    const read = (): void => {
      const width = list.clientWidth;
      if (typeof width === 'number' && width > 0) setRoom(width);
    };
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(list);
    return () => {
      observer.disconnect();
    };
  }, []);

  // The natural widths, read while every place is drawn at its own size.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!measuring || list === null) return;
    const found: Record<string, number> = {};
    let more = 0;
    for (const node of Array.from(list.childNodes)) {
      const item = node as HTMLElement;
      if (typeof item.getAttribute !== 'function') continue;
      const id = item.getAttribute('data-measure');
      const width = item.offsetWidth;
      if (id === null || typeof width !== 'number' || !(width > 0)) continue;
      if (id === 'more') more = width;
      else found[id] = width;
    }
    const complete = more > 0 && places.every((p) => found[p.id] !== undefined);
    setWidths({ stamp, value: complete ? { places: found, more } : null });
  }, [measuring, stamp]);

  // The pixel font arrives after the first draw; its words are wider than the fallback's.
  useEffect(() => {
    if (typeof document === 'undefined' || !('fonts' in document)) return undefined;
    let live = true;
    void document.fonts.ready.then(() => {
      if (live) setFonts((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, []);

  const value = widths?.value ?? null;
  const fitted =
    forced ?? (value !== null && room !== null ? dockCapacity(places, current, value, room) : null);
  return { listRef, capacity: measuring ? null : fitted, measuring };
}
