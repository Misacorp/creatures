import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import type { Creature } from '../api';
import { ActionIds } from '../actions';
import { errorText } from '../game';
import { buyStallOffer, setGamesEntry } from '../games-api';
import type { GamesView, LineupEvent, StallOffer, StallPurchase } from '../games-types';
import { entryOf, replayStart, screenOf, withSlot } from '../games-view';
import { useServerNow } from '../hooks';
import { formatCountdown } from '../time-format';
import { Alert } from '../ui/Alert';
import { DrillHead } from '../ui/DrillHead';
import { GameIcon } from '../ui/GameIcon';
import { PixelHeading } from '../ui/PixelHeading';
import { useActionRunner } from '../use-action-runner';
import { EntryPicker } from './EntryPicker';
import { GamesResults } from './GamesResults';
import { GamesShow } from './GamesShow';
import { EventCard } from './GamesParts';
import { MedalCabinet } from './MedalCabinet';
import { PrizeStall } from './PrizeStall';

/** What the Games routes refuse, in the game's words. */
export const GAMES_ERRORS: Readonly<Record<string, string>> = {
  entries_closed: 'Entries are closed for this show.',
  not_in_lineup: 'That event is not in the show.',
  already_entered: 'That creature is already in another event.',
  invalid_team: 'That team does not fit the event.',
  creature_not_found: 'That creature is not yours.',
  stall_closed: 'The Prize Stall is closed.',
  limit_reached: 'Sold out this week.',
  insufficient_medals: 'Not enough medal points.',
  key_conflict: 'That purchase is already done.',
  offer_not_found: 'That prize is gone.',
};

/** The requests the tab makes (the workbench gives fakes). */
export interface GamesApi {
  setEntry: typeof setGamesEntry;
  buy: typeof buyStallOffer;
}

const SERVER_API: GamesApi = { setEntry: setGamesEntry, buy: buyStallOffer };

/** A piece of the tab that follows the server's clock every second (a countdown), alone. */
function Ticking({
  offset,
  children,
}: {
  offset: number;
  children: (serverNow: number) => ComponentChildren;
}) {
  const now = useServerNow(offset, true);
  return <>{children(now)}</>;
}

/** The title plate of the tab and the countdown chip to the next show. */
export function GamesHeader({ showAt, serverNow }: { showAt: number; serverNow: number }) {
  const left = showAt - serverNow;
  return (
    <header class="gt-head">
      <PixelHeading as="h3" outline="ink-drop" class="gt-title">
        Valley Games
      </PixelHeading>
      {left > 0 && (
        <span class="gt-chip pix" aria-label={`Show in ${formatCountdown(left, 'short')}`}>
          <span class="gt-chip-play" aria-hidden="true">
            ▶
          </span>
          <GameIcon icon={{ kind: 'glyph', id: 'clock' }} scale={2} />
          {formatCountdown(left, 'short')}
        </span>
      )}
    </header>
  );
}

/** The lineup: the day's event cards. */
export function Lineup({
  view,
  creatures,
  busy,
  onSlot,
}: {
  view: GamesView;
  creatures: readonly Creature[];
  busy: boolean;
  onSlot?: ((event: LineupEvent, slot: number, button: HTMLButtonElement) => void) | undefined;
}) {
  const { next } = view;
  return (
    <section class="gt-lineup" aria-label="Events">
      <ul class="ge-cards">
        {next.lineup.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            next={next}
            creatures={creatures}
            busy={busy}
            onSlot={
              next.open && onSlot !== undefined
                ? (slot, button) => {
                    onSlot(event, slot, button);
                  }
                : undefined
            }
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * The Games tab (docs/design/valley-games.md). While entries are open: the title and the countdown,
 * your last show (medals, pins, experience, ▶ replays), the day's events with their slots (only what
 * you enter runs: there is no auto-entry). From the lock to the show: the stands and the countdown. While
 * the show plays (live, or a replay): only the show, edge to edge on a phone (a replay with Back). Else
 * always: your medal cabinet and the Prize Stall.
 */
export function GamesTab({
  view,
  failed,
  creatures,
  selfId,
  offset,
  onView,
  onReload,
  onPurchased,
  api = SERVER_API,
}: {
  view: GamesView | null;
  failed: boolean;
  creatures: readonly Creature[];
  selfId: string;
  /** Server clock minus local clock. */
  offset: number;
  /** Puts an action's answer on screen. */
  onView: (view: GamesView) => void;
  onReload: () => void;
  /** A prize was bought: the balances and the bag changed. */
  onPurchased: () => void;
  api?: GamesApi;
}) {
  const { busy, error, setError, run, runKeyed } = useActionRunner({
    errorText: (err, currency) => errorText(err, currency, GAMES_ERRORS),
    onStale: onReload,
  });
  const [picker, setPicker] = useState<{ eventId: string; slot: number } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [replay, setReplay] = useState<number | null>(null);
  const [purchase, setPurchase] = useState<StallPurchase['purchase'] | null>(null);

  if (view === null) {
    return failed ? (
      <Alert level="alert" title="The Games did not load.">
        <button type="button" onClick={onReload}>
          Try again
        </button>
      </Alert>
    ) : (
      <p class="muted">Loading…</p>
    );
  }
  const current = view;
  const serverNow = Date.now() + offset;
  const screen = screenOf(current, serverNow);
  const show = current.show;
  const names = Object.fromEntries((show?.players ?? []).map((p) => [p.id, p.name]));

  async function setEntry(event: LineupEvent, slot: number, creatureId: string | null) {
    const { next } = current;
    await run(async () => {
      let entries = next.entries;
      const from = creatureId === null ? null : entryOf(next, creatureId);
      if (from !== null && from !== event.id && creatureId !== null) {
        // Moving: the server refuses a creature that is in another event, so it leaves that one first.
        const left = await api.setEntry(
          next.day,
          from,
          (entries[from] ?? []).filter((id) => id !== creatureId),
        );
        entries = left.entries;
      }
      const list = withSlot(entries[event.id] ?? [], slot, creatureId);
      const answer = await api.setEntry(next.day, event.id, list);
      onView({ ...current, next: answer });
    });
  }

  const errorLine = error !== null && (
    <Alert
      key={error}
      level="alert"
      onDismiss={() => {
        setError(null);
      }}
    >
      {error}
    </Alert>
  );

  if (replay !== null && show !== null) {
    return (
      <div class="games-tab">
        <DrillHead
          title="Last show"
          backLabel="to the Games"
          focus
          onBack={() => {
            setReplay(null);
          }}
        />
        <div class="gt-bleed">
          <GamesShow
            events={show.events}
            lineup={show.timeline.map((s) => s.eventId)}
            mode="replay"
            youId={selfId}
            names={names}
            startMs={replay}
          />
        </div>
      </div>
    );
  }

  if (screen === 'show' && show !== null) {
    // While the show plays, it is the whole tab (Misa, 2026-10-23); it ends by itself and the tab returns.
    return (
      <div class="games-tab is-show">
        {errorLine}
        <div class="gt-bleed">
          <GamesShow
            events={show.events}
            lineup={show.timeline.map((s) => s.eventId)}
            mode="live"
            startsAt={show.showAt}
            serverNow={serverNow}
            youId={selfId}
            names={names}
            onDone={onReload}
          />
        </div>
      </div>
    );
  }

  const pickedEvent =
    picker === null ? undefined : current.next.lineup.find((e) => e.id === picker.eventId);
  const results = current.you.lastResults;
  const lineup = (
    <Lineup
      view={current}
      creatures={creatures}
      busy={busy}
      onSlot={(event, slot, button) => {
        opener.current = button;
        setPicker({ eventId: event.id, slot });
      }}
    />
  );
  const lineupScreen = (
    <>
      {results !== undefined && (
        <GamesResults
          results={results.results}
          lineup={show?.lineup ?? current.next.lineup}
          creatures={creatures}
          onReplay={
            show === null || show.day !== results.day
              ? undefined
              : (eventId) => {
                  setReplay(eventId === null ? 0 : replayStart(show, eventId));
                }
          }
        />
      )}
      {lineup}
    </>
  );

  return (
    <div class="games-tab">
      {screen === 'lineup' && (
        <Ticking offset={offset}>
          {(now) => <GamesHeader showAt={current.next.showAt} serverNow={now} />}
        </Ticking>
      )}
      {errorLine}
      {screen === 'stands' && (
        <div class="gt-bleed">
          <GamesShow
            events={[]}
            lineup={current.next.lineup.map((e) => e.id)}
            mode="live"
            startsAt={current.next.showAt}
            serverNow={serverNow}
            youId={selfId}
            onDone={onReload}
          />
        </div>
      )}
      {screen === 'stands' && lineup}
      {screen === 'lineup' && lineupScreen}
      <MedalCabinet you={current.you} board={current.board} selfId={selfId} />
      <Ticking offset={offset}>
        {(now) => (
          <PrizeStall
            stall={current.stall}
            pocket={current.you.pocket}
            serverNow={now}
            timezone={current.timezone}
            busy={busy}
            purchase={purchase}
            onDismissPurchase={() => {
              setPurchase(null);
            }}
            onBuy={(offer: StallOffer) => {
              void runKeyed(ActionIds.gamesBuy(current.stall.week, offer.id, offer.left), (key) =>
                api.buy(offer.id, key),
              ).then((answer) => {
                if (answer === undefined) return;
                onView({ ...current, you: answer.you, stall: answer.stall });
                setPurchase(answer.purchase);
                onPurchased();
              });
            }}
          />
        )}
      </Ticking>
      {picker !== null && pickedEvent !== undefined && (
        <EntryPicker
          event={pickedEvent}
          slot={picker.slot}
          next={current.next}
          creatures={creatures}
          busy={busy}
          returnFocusTo={opener.current}
          onClose={() => {
            setPicker(null);
          }}
          onPick={(creatureId) => {
            setPicker(null);
            void setEntry(pickedEvent, picker.slot, creatureId);
          }}
          onClear={() => {
            setPicker(null);
            void setEntry(pickedEvent, picker.slot, null);
          }}
        />
      )}
    </div>
  );
}
