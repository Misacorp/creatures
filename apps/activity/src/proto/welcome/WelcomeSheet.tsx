/**
 * The welcome-back popup (`systems/return.md`, V-RET-0): a sheet over the valley (`ui/Drawer`, the app's one
 * sheet) with two or three highlights of what happened while the player was away, told as a comic strip or as
 * the Valley Gazette (the dev strip switches; the same highlights), and one button at the end, "...and 13 more
 * things", that closes it onto the valley, where the rest waits as markers at their places. Nothing needs a
 * tap before that; closing loses nothing.
 */
import { useEffect, useState } from 'preact/hooks';
import { usePrefersReducedMotion } from '../../hooks';
import { ActionButton } from '../../ui/ActionButton';
import { Drawer } from '../../ui/Drawer';
import { isStill } from '../valley/parts';
import { ComicStrip } from './ComicStrip';
import { Gazette } from './Gazette';
import { moreLabel, type Cast, type Welcome } from './highlights';
import { frozenAt } from './welcome-world';

export type Look = 'comic' | 'gazette';

/** The next panel appears this long after the last (ms). */
export const PANEL_MS = 1100;

/** How many panels have appeared `ms` into the popup: the first at once, then one every `PANEL_MS`. */
export function panelsShown(ms: number, total: number): number {
  return Math.min(total, 1 + Math.floor(Math.max(0, ms) / PANEL_MS));
}

/** The panels that have appeared: all at once with reduced motion, held at `&t=` in a screenshot. */
function useShown(total: number): number {
  const reduced = usePrefersReducedMotion();
  const frozen = typeof window === 'undefined' ? null : frozenAt(window.location.hash);
  const instant = reduced || (frozen === null && isStill());
  const [ms, setMs] = useState(frozen ?? 0);
  const waiting = !instant && frozen === null && panelsShown(ms, total) < total;
  useEffect(() => {
    if (!waiting) return undefined;
    const id = window.setInterval(() => {
      setMs((t) => t + PANEL_MS / 2);
    }, PANEL_MS / 2);
    return () => {
      window.clearInterval(id);
    };
  }, [waiting]);
  return instant ? total : panelsShown(ms, total);
}

export function WelcomeSheet({
  welcome,
  cast,
  look,
  open,
  onClose,
}: {
  welcome: Welcome;
  cast: Cast;
  look: Look;
  open: boolean;
  onClose: () => void;
}) {
  const total = welcome.highlights.length;
  const shown = useShown(total);
  // The comic tells the small ones first and the biggest last; the gazette leads with the biggest.
  const told = [...welcome.highlights].reverse();
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Welcome back"
      titleHidden={look === 'gazette'}
      class="wb-sheet"
      footer={<ActionButton label={moreLabel(welcome.more)} wide large onClick={onClose} />}
    >
      {look === 'comic' ? (
        <ComicStrip stories={told} cast={cast} shown={shown} />
      ) : (
        <Gazette stories={welcome.highlights} cast={cast} date={welcome.date} />
      )}
    </Drawer>
  );
}
