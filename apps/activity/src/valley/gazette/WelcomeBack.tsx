/**
 * The welcome-back moment in the game (`VALLEY` on; `systems/return.md`, V-RET-0 and V-RET-4a): on the first open
 * after time away (when today's away notice would show) the Valley Gazette opens as a sheet over the valley
 * (`ui/Drawer`, the app's one sheet) with two or three stories made from the notice's counts and one button, "...and N
 * more things", that closes it onto the valley, where the bubbles wait at their places. Closing it in any way
 * (the button, the X, a swipe, Escape) dismisses the notice exactly as the Home paper's "Got it" does (once), and
 * plays the coming-home moment: Bait and Essence fly into the HUD's purse, which counts up (display only: the
 * server's totals were in already). It keeps its own copy of the notice, because dismissing clears the game's.
 */
import { useMemo, useRef, useState } from 'preact/hooks';
import type { AwaySummary, Balances } from '../../api';
import { usePrefersReducedMotion } from '../../hooks';
import { hasAwayNotice } from '../../home/away-notice';
import { ActionButton } from '../../ui/ActionButton';
import { Drawer } from '../../ui/Drawer';
import { isStill } from '../parts';
import { ComingHome } from './ComingHome';
import { Gazette } from './Gazette';
import { flyMode, originOf, purseDisplay, type Point } from './coming-home';
import {
  awayGains,
  gazetteDate,
  gazetteOf,
  moreLabel,
  type AwayWorld,
  type HomeGain,
} from './stories';

/** Where the numbers start when the paper cannot be measured (a phone's middle). */
const FALLBACK_FROM: Point = { x: 195, y: 520 };

interface Paper {
  away: AwaySummary;
  date: string;
  gains: HomeGain[];
}

export function WelcomeBack({
  away,
  world,
  now,
  timezone,
  balances,
  onDismiss,
  onPurse,
}: {
  /** Today's notice (`GameState.awayRewards`): null once dismissed. */
  away: AwaySummary | null;
  /** What the client holds about the real finds and who was there (the stories read it; it may fill in after the sheet opens). */
  world: AwayWorld;
  /** The server's clock (ms). */
  now: number;
  /** The guild's timezone; null before the first full state has come. */
  timezone: string | null;
  /** The purse's totals now (the HUD shows them). */
  balances: Balances;
  /** Dismisses the notice on the server (`POST /api/away/dismiss`, `until` is its last payout): today's call. */
  onDismiss: (until: number) => void;
  /** What the HUD's purse shows while the numbers count up; null when it shows the real totals. */
  onPurse: (display: Balances | null) => void;
}) {
  const [paper, setPaper] = useState<Paper | null>(null);
  const [open, setOpen] = useState(false);
  const [homing, setHoming] = useState<Point | null>(null);
  const reduced = usePrefersReducedMotion();
  /** The last payout the paper was shown for: it opens once for each, and a dismissal that failed does not reopen it. */
  const shownFor = useRef<number | null>(null);
  const closed = useRef(true);
  const counted = useRef<Record<string, number>>({});
  const balancesRef = useRef(balances);
  balancesRef.current = balances;

  // A notice we have not shown opens the paper (once for each last payout), with its own copy of the notice.
  if (hasAwayNotice(away) && shownFor.current !== away.until) {
    shownFor.current = away.until;
    closed.current = false;
    setPaper({
      away,
      date: gazetteDate(now, timezone),
      gains: awayGains(away),
    });
    setOpen(true);
  }

  const gains = paper?.gains ?? [];
  const display = (): Balances => {
    const total = balancesRef.current;
    const at = (resource: string, now: number): number => {
      const g = gains.find((x) => x.resource === resource);
      return g === undefined ? now : purseDisplay(now, g.amount, counted.current[resource] ?? 0);
    };
    return { ...total, bait: at('bait', total.bait), essence: at('essence', total.essence) };
  };
  const mode = useMemo(() => flyMode({ reduced, still: isStill() }), [reduced]);

  if (paper === null) return null;
  // Made on every draw from the latest state: the bag may load after the sheet is up.
  const plan = gazetteOf(paper.away, world);

  const close = (): void => {
    if (closed.current) return;
    closed.current = true;
    const el = document.body.querySelector('.gz-paper');
    const from = el === null ? FALLBACK_FROM : originOf(el.getBoundingClientRect());
    setOpen(false);
    onDismiss(paper.away.until);
    counted.current = {};
    if (paper.gains.length > 0) setHoming(from);
  };

  return (
    <>
      <Drawer
        open={open}
        onClose={close}
        title="Welcome back"
        titleHidden
        class="gz-sheet"
        footer={<ActionButton label={moreLabel(plan.more)} wide large onClick={close} />}
      >
        <Gazette stories={plan.stories} date={paper.date} />
      </Drawer>
      {homing !== null && (
        <ComingHome
          gains={gains}
          from={homing}
          mode={mode}
          onCount={(resource, n) => {
            counted.current[resource] = n;
            onPurse(display());
          }}
          onDone={() => {
            setHoming(null);
            onPurse(null);
          }}
        />
      )}
    </>
  );
}
