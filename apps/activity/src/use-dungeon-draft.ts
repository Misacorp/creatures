import { useEffect, useRef } from 'preact/hooks';
import { createDraftSaver, type DraftSaver } from './dungeon-draft';
import type { Slots } from './dungeon-team';

/**
 * The saver of the setup's team draft for the life of the screen. A waiting row is sent at once when
 * the screen goes away (a tab switch, a run starting) and when the page is hidden or closed
 * (`visibilitychange` to hidden, `pagehide`). `save` is read when a row is sent, so a new function on
 * every render is fine. Without `save` (the workbench) nothing is ever sent.
 */
export function useDungeonDraft(save: ((team: Slots) => Promise<unknown>) | undefined): DraftSaver {
  const latest = useRef(save);
  latest.current = save;
  const saver = useRef<DraftSaver | null>(null);
  if (saver.current === null) {
    saver.current = createDraftSaver((team) => {
      const send = latest.current;
      return send === undefined ? Promise.resolve() : send(team);
    });
  }
  const current = saver.current;

  useEffect(() => {
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') current.flush();
    };
    const onPageHide = (): void => {
      current.flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      current.flush();
    };
  }, [current]);

  return current;
}
