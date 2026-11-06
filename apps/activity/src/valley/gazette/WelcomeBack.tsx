/**
 * The welcome-back moment in the game (`VALLEY` on; `systems/return.md`, V-RET-0 and V-RET-4a): on the first open
 * after time away (when today's away notice would show) the Valley Gazette opens as a sheet over the valley
 * (`ui/Drawer`, the app's one sheet) with two or three stories made from the notice's counts and one button, "...and N
 * more things", that closes it onto the valley, where the bubbles wait at their places. Closing it in any way
 * (the button, the X, a swipe, Escape) dismisses the notice exactly as the Home paper's "Got it" does (once), and
 * plays the coming-home moment: Bait and Essence fly into the HUD's purse, which counts up (display only: the
 * server's totals were in already). It keeps its own copy of the notice, because dismissing clears the game's.
 *
 * With the valley's systems on (`paper` is given, null or not) the data source is the server's paper instead of today's notice
 * (phase 5 step 4): the stories are the paper's headlines (`paper-stories.ts`), it opens once for each unread paper (a reload replays it
 * until it is closed), closing it tells the server (`onClosePaper`: marks it read), what flies into the purse is what the paper says came
 * home, and the paper's one decision (a scout's way deeper, V-RET-3) is the choice at its end. A raid or Games notice that is waiting is
 * dismissed with it, so it does not linger.
 */
import { useMemo, useRef, useState } from 'preact/hooks';
import type { Paper as ServerPaper } from '@creatures/game';
import type { AwaySummary, Balances } from '../../api';
import { usePrefersReducedMotion } from '../../hooks';
import { hasAwayNotice } from '../../home/away-notice';
import { ActionButton } from '../../ui/ActionButton';
import { Drawer } from '../../ui/Drawer';
import { isStill } from '../parts';
import { ComingHome } from './ComingHome';
import { Gazette, type GazetteChoice } from './Gazette';
import { decisionOf, gazetteOfPaper, paperNote } from './paper-stories';
import {
  flyMode,
  gainsText,
  originOf,
  purseDisplay,
  withAllowance,
  type Point,
} from './coming-home';
import {
  gazetteDate,
  gazetteOf,
  homeNote,
  moreLabel,
  paperGains,
  type AwayWorld,
  type HomeGain,
} from './stories';

/** Where the numbers start when the paper cannot be measured (a phone's middle). */
const FALLBACK_FROM: Point = { x: 195, y: 520 };

interface Paper {
  /** Today's notice (the flag off); null when the paper is the server's. */
  away: AwaySummary | null;
  /** The server's paper (the valley's systems on); null when it is today's notice. */
  served: ServerPaper | null;
  date: string;
  /** The Acorns the allowance brought home this visit (the valley's systems), flown in with the rest; 0 when none. */
  brought: number;
}

/** The moment of coming home: where it starts and what flies (the amounts the paper showed when it closed). */
interface Homing {
  from: Point;
  gains: HomeGain[];
}

export function WelcomeBack({
  away,
  world,
  now,
  timezone,
  balances,
  brought = 0,
  onDismiss,
  onPurse,
  paper: served,
  onClosePaper,
  onPushOn,
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
  /** The Acorns the allowance brought home with this visit (`valley.allowance.brought`; the valley's systems on), 0 otherwise. */
  brought?: number;
  /** Dismisses the notice on the server (`POST /api/away/dismiss`, `until` is its last payout): today's call. */
  onDismiss: (until: number) => void;
  /** What the HUD's purse shows while the numbers count up; null when it shows the real totals. */
  onPurse: (display: Balances | null) => void;
  /** The valley's systems are on: the server's unread paper (`valley.paper`), or null; absent: today's notice is the source. */
  paper?: ServerPaper | null;
  /** Tells the server the paper was closed (`POST /api/valley/gazette/close`). */
  onClosePaper?: (paperId: string) => void;
  /** Takes the paper's decision: sends the scout deeper (`POST /api/valley/deep`); true when the server took it. */
  onPushOn?: (seatId: string) => Promise<boolean>;
}) {
  const [paper, setPaper] = useState<Paper | null>(null);
  /** The paper's choice was taken (its button is then the line that says so). */
  const [pushed, setPushed] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [open, setOpen] = useState(false);
  const [homing, setHoming] = useState<Homing | null>(null);
  // What the polite status region says by the purse: the gains, once, when the moment starts.
  const [said, setSaid] = useState('');
  const reduced = usePrefersReducedMotion();
  /** The last payout the paper was shown for: it opens once for each, and a dismissal that failed does not reopen it. */
  const shownFor = useRef<number | string | null>(null);
  const closed = useRef(true);
  const counted = useRef<Record<string, number>>({});
  const balancesRef = useRef(balances);
  balancesRef.current = balances;

  // A notice we have not shown opens the paper (once for each last payout), with its own copy of the notice.
  if (served !== undefined) {
    // The valley's systems: the server's paper opens once for each unread paper (a reload replays it).
    if (served !== null && shownFor.current !== served.id) {
      shownFor.current = served.id;
      closed.current = false;
      setSaid('');
      setPushed(false);
      setPaper({
        away,
        served,
        date: gazetteDate(served.at, timezone),
        brought: served.brought.acorns,
      });
      setOpen(true);
    }
  } else if (hasAwayNotice(away) && shownFor.current !== away.until) {
    shownFor.current = away.until;
    closed.current = false;
    setSaid('');
    setPaper({
      away,
      served: null,
      date: gazetteDate(now, timezone),
      brought,
    });
    setOpen(true);
  }

  const flying = useRef<HomeGain[]>([]);
  const display = (): Balances => {
    const total = balancesRef.current;
    const at = (resource: string, now: number): number => {
      const g = flying.current.find((x) => x.resource === resource);
      return g === undefined ? now : purseDisplay(now, g.amount, counted.current[resource] ?? 0);
    };
    return { ...total, bait: at('bait', total.bait), essence: at('essence', total.essence) };
  };
  const mode = useMemo(() => flyMode({ reduced, still: isStill() }), [reduced]);

  // The status region is mounted before it has anything to say, so a screen reader hears the change.
  const status = (
    <div class="visually-hidden" role="status" aria-live="polite">
      {said}
    </div>
  );
  if (paper === null) return status;
  // Made on every draw from the latest state: the bag may load after the sheet is up.
  const plan =
    paper.served === null
      ? gazetteOf(paper.away as AwaySummary, world)
      : gazetteOfPaper(paper.served, world.creatures);

  const offered = paper.served === null ? null : decisionOf(paper.served.decision, world.creatures);
  const choice: GazetteChoice | null =
    offered === null
      ? null
      : {
          text: offered.text,
          trade: offered.trade,
          label: offered.label,
          taken: pushed ? offered.taken : null,
          busy: pushing,
          onTake: () => {
            if (pushing || pushed || onPushOn === undefined) return;
            setPushing(true);
            void onPushOn(offered.seatId).then((ok) => {
              setPushing(false);
              if (ok) setPushed(true);
            });
          },
        };

  const close = (): void => {
    if (closed.current) return;
    closed.current = true;
    const el = document.body.querySelector('.gz-paper');
    const from = el === null ? FALLBACK_FROM : originOf(el.getBoundingClientRect());
    setOpen(false);
    if (paper.served !== null) {
      onClosePaper?.(paper.served.id);
      // A raid or Games notice waiting beside the paper is dismissed with it.
      if (hasAwayNotice(away)) onDismiss(away.until);
    } else if (paper.away !== null) {
      onDismiss(paper.away.until);
    }
    counted.current = {};
    // What flies is what the paper showed (and, with the valley's systems, the Acorns the allowance brought home): with the server's
    // paper, what it says came home.
    const gains = withAllowance(
      paper.served === null ? paperGains(plan.stories) : [],
      paper.brought,
    );
    flying.current = gains;
    if (gains.length > 0) {
      setHoming({ from, gains });
      setSaid(gainsText(gains));
    }
  };

  return (
    <>
      {status}
      <Drawer
        open={open}
        onClose={close}
        title="Welcome back"
        titleHidden
        class="gz-sheet"
        footer={<ActionButton label={moreLabel(plan.more)} wide large onClick={close} />}
      >
        <Gazette
          stories={plan.stories}
          date={paper.date}
          note={
            paper.served === null ? homeNote(paper.away as AwaySummary) : paperNote(paper.served)
          }
          choice={choice}
        />
      </Drawer>
      {homing !== null && (
        <ComingHome
          gains={homing.gains}
          from={homing.from}
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
