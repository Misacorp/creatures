/**
 * The Valley Games state the game screen holds (the tab, its pip and the living room's trophy shelf):
 * loaded once the game is on screen, again when the tab opens, and at the moments the view changes by
 * itself (the lock, the show's start, its end). The payload can be a few hundred KB while a show is
 * stored, so it is never polled.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { fetchGames } from './games-api';
import type { GamesView } from './games-types';
import { GAMES_GRACE_MS, nextRefetchAt } from './games-view';
import { MAX_TIMER_MS } from './tab-alerts';

/** The day of the newest awarded show in a view (null: none yet). */
export function awardedDay(view: GamesView | null): string | null {
  return view?.you.lastResults?.day ?? null;
}

/**
 * True when `next` carries a show's awards that `prev` did not: the creatures' experience changed on the
 * server, so the game state must be reloaded (or the result rows would draw stale XP bars).
 */
export function newAwards(prev: GamesView | null, next: GamesView): boolean {
  const day = awardedDay(next);
  return day !== null && prev !== null && day !== awardedDay(prev);
}

/** `onAwards` runs when a load brings a show's awards (see `newAwards`). */
export function useGames(enabled: boolean, offset: number, onAwards?: () => void) {
  const [view, setView] = useState<GamesView | null>(null);
  const latest = useRef<GamesView | null>(null);
  const [failed, setFailed] = useState(false);
  // Only the newest load may land (an older answer would show an older phase).
  const seq = useRef(0);

  function load(): void {
    const mine = ++seq.current;
    fetchGames().then(
      (next) => {
        if (mine !== seq.current) return;
        if (newAwards(latest.current, next)) onAwards?.();
        latest.current = next;
        setView(next);
        setFailed(false);
      },
      () => {
        if (mine === seq.current) setFailed(true);
      },
    );
  }

  /** Puts an action's answer on screen; a load still running would be older, so it is dropped. */
  function replace(next: GamesView): void {
    seq.current += 1;
    latest.current = next;
    setView(next);
  }

  useEffect(() => {
    if (enabled) load();
  }, [enabled]);

  const due = view === null ? null : nextRefetchAt(view, Date.now() + offset);
  useEffect(() => {
    if (due === null) return undefined;
    const wait = Math.min(Math.max(0, due - (Date.now() + offset)) + GAMES_GRACE_MS, MAX_TIMER_MS);
    const timer = setTimeout(load, wait);
    return () => {
      clearTimeout(timer);
    };
  }, [due, offset]);

  return { view, failed, load, replace };
}
