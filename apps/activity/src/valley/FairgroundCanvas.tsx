/**
 * The Fairground (Valley Games) as a canvas (the rule is "A place is a canvas" in `ux-patterns.md`; Misa's pick A, stalls, 2026-11-20):
 * the tent, one stall for each event of the day, the Prize Stall and a Rules board, in one scene that fills the view and never scrolls.
 * Everything is done by clicking something in it:
 *
 * - A stall (plate: the event) opens its event in the right drawer: its story, what it favours and your entry slots; a slot opens the
 *   creature list as a step (`StallPanel`). The creatures you entered stand at its counter. A creature dragged from the tray onto a
 *   stall enters it by the same server action; a locked or full stall refuses with its line under the scene.
 * - The Prize Stall (shuttered but on Wednesdays, its plate then says when it opens) and the Rules board open in the right drawer,
 *   and the tent opens the schedule. The grandstand fills with a crowd when entries lock; after a show, the medals hang on the tent.
 * - Two corner buttons, "Last show" and "Medals", open the left drawer: last show's results and its replay, and the medal cabinet.
 * - While the show runs (or is replayed) it takes the picture over: `GamesShow` as the stage in place of the scene, the commentary, the
 *   event pips and the replay controls under it, the live standings in the left drawer ("Standings").
 *
 * What a click opens follows the side rule (`PlaceCanvas`). A phone shows the open panel as its own page. The pictures are all named
 * in `fairground-canvas-art.ts`, the layout is `fairground-canvas.ts`.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Creature } from '../api';
import { ActionIds } from '../actions';
import { creatureName, errorText } from '../game';
import { buyStallOffer, setGamesEntry } from '../games-api';
import type { GamesView, LineupEvent, StallOffer, StallPurchase } from '../games-types';
import { replayStart, screenOf } from '../games-view';
import { dropOutcome } from '../slot-outcome';
import { TOUCH_HOLD_MS } from '../dnd-core';
import { useServerNow } from '../hooks';
import { formatCountdown, formatZoned } from '../time-format';
import { useActionRunner } from '../use-action-runner';
import { useDragDrop } from '../use-drag-drop';
import { Alert } from '../ui/Alert';
import { DragGhost } from '../ui/DragGhost';
import { useWide } from '../ui/wide-layout';
import { GAMES_ERRORS } from '../games/GamesTab';
import { GamesShow } from '../games/GamesShow';
import { dropEntry, putEntry } from '../games/entry-flow';
import { sceneOf } from '../games/ShowStage';
import {
  LastShowPanel,
  MedalsPanel,
  PrizePanel,
  RulesPanel,
  ShowPanel,
  StallPanel,
} from './FairgroundPanels';
import {
  CanvasTarget,
  PanelBody,
  PlaceCanvas,
  ToolCue,
  openerOf,
  type CanvasPanel,
  type Opener,
} from './PlaceCanvas';
import { SceneFrame, sceneGeometry, type SceneGeometry } from './SceneFrame';
import { Tray } from './Tray';
import { At, CreatureSprite, Glyph } from './parts';
import { paint } from './paint';
import { POSTER, type RosetteMetal, posterArt } from './fairground-canvas-art';
import {
  eventOfSeat,
  fairLayout,
  fairSceneDraw,
  fairScale,
  posterBox,
  stallCasts,
  stallSeat,
  type StallEvent,
} from './fairground-canvas';
import { seatAt } from './seat-parts';
import { trayBadge, trayFor, type TrayInput } from './tray-state';
import type { GamesApi } from '../games/GamesTab';
import { PLATES_Z } from './PlaceScene';
import { depthOf } from './valley-logic';

const SERVER_API: GamesApi = { setEntry: setGamesEntry, buy: buyStallOffer };

/** The right drawer: the one thing that was clicked. */
type Right =
  | { kind: 'stall'; eventId: string; from: Opener | null }
  | { kind: 'prize'; from: Opener | null }
  | { kind: 'rules'; from: Opener | null }
  | { kind: 'tent'; from: Opener | null };

/** The left drawer: what belongs to no one spot. */
interface Left {
  kind: 'last' | 'medals' | 'standings';
  from: Opener | null;
}

/** What the canvas can open at the start (the workbench and the tests show each). */
export interface FairgroundStart {
  right?: 'stall' | 'prize' | 'rules' | 'tent';
  /** The event whose stall opens (the first, by default). */
  eventId?: string;
  left?: 'last' | 'medals';
}

export function FairgroundCanvas(props: {
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
  /** The creature tray under the scene (a hand carries a creature from it onto a stall). */
  trayInput: TrayInput;
  /** A tap on a tray creature: the Paddock, as everywhere in the valley. */
  onOpenPaddock: () => void;
  api?: GamesApi;
  start?: FairgroundStart;
}) {
  if (props.view === null) {
    return (
      <div class="fg-root fg-wait">
        {props.failed ? (
          <Alert level="alert" title="The Games did not load.">
            <button type="button" onClick={props.onReload}>
              Try again
            </button>
          </Alert>
        ) : (
          <p class="muted">Loading…</p>
        )}
      </div>
    );
  }
  return <Fair {...props} view={props.view} />;
}

/** The medals of last show's results as rosettes, in lineup order (none off the podium). */
export function rosettesOf(view: GamesView): RosetteMetal[] {
  const results = view.you.lastResults?.results ?? [];
  return results.flatMap((r) => (r.medal === null ? [] : [r.medal]));
}

/** The canvas's one plate for the prize stall: its name, or when it opens. */
function prizePlate(view: GamesView): string {
  return view.stall.open
    ? 'Prize Stall'
    : `Opens ${formatZoned(view.stall.opensAt, view.timezone, 'short')}`;
}

/** The tent's plate: the countdown to the show while the stands are filling, else when it plays. */
function tentPlate(view: GamesView, now: number, locked: boolean): string {
  const left = view.next.showAt - now;
  return locked && left > 0
    ? `Show in ${formatCountdown(left, 'short')}`
    : `Show ${formatZoned(view.next.showAt, view.timezone, 'short')}`;
}

function Fair({
  view,
  creatures,
  selfId,
  offset,
  onView,
  onReload,
  onPurchased,
  trayInput,
  onOpenPaddock,
  api = SERVER_API,
  start = {},
}: {
  view: GamesView;
  creatures: readonly Creature[];
  selfId: string;
  offset: number;
  onView: (view: GamesView) => void;
  onReload: () => void;
  onPurchased: () => void;
  trayInput: TrayInput;
  onOpenPaddock: () => void;
  api?: GamesApi;
  start?: FairgroundStart;
}) {
  const { busy, error, setError, run, runKeyed } = useActionRunner({
    errorText: (err, currency) => errorText(err, currency, GAMES_ERRORS),
    onStale: onReload,
  });
  const wide = useWide();
  const now = useServerNow(offset, true);
  const { next, show } = view;
  const screen = screenOf(view, now);
  const [replay, setReplay] = useState<number | null>(null);
  const staged = (screen === 'show' && show !== null) || (replay !== null && show !== null);
  const locked = !next.open;
  const lineup: StallEvent[] = next.lineup.map((e) => ({ id: e.id, team: e.team, name: e.name }));

  const [right, setRight] = useState<Right | null>(() => {
    const kind = start.right;
    if (kind === undefined) return null;
    if (kind === 'stall') {
      const id = start.eventId ?? next.lineup[0]?.id;
      return id === undefined ? null : { kind, eventId: id, from: null };
    }
    return { kind, from: null };
  });
  const [left, setLeft] = useState<Left | null>(
    start.left === undefined ? null : { kind: start.left, from: null },
  );
  const [purchase, setPurchase] = useState<StallPurchase['purchase'] | null>(null);
  const [boardHost, setBoardHost] = useState<HTMLElement | null>(null);
  // A refused drop's line, under the scene: its own, so it never shows in a drawer it has nothing to do with.
  const [dropError, setDropError] = useState<string | null>(null);
  useEffect(() => {
    setDropError(null);
  }, [right?.kind, left?.kind]);

  // The stage opens on its standings on a wide window (a phone keeps the stage in view); they close when the stage does.
  useEffect(() => {
    if (staged) {
      if (wide) setLeft({ kind: 'standings', from: null });
      setRight(null);
      return undefined;
    }
    setLeft((was) => (was?.kind === 'standings' ? null : was));
    return undefined;
  }, [staged, wide]);
  // Escape leaves a replay (a drawer takes Escape first and stops it).
  useEffect(() => {
    if (replay === null) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setReplay(null);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [replay === null]);

  // The live show's clock is corrected by the server's time read once when the stage opens (a value that changed every second would
  // restart the show's frame loop each time).
  const stageClock = useMemo(() => Date.now() + offset, [staged, offset]);
  const byId = useMemo(() => new Map(creatures.map((c) => [c.id, c])), [creatures]);
  const casts = useMemo(
    () => stallCasts(lineup, next.entries, new Set(byId.keys())),
    [next.entries, next.lineup, byId],
  );
  const lineupKey = lineup.map((e) => `${e.id}:${String(e.team)}:${e.name ?? ''}`).join(',');
  const medals = rosettesOf(view);
  const medalsKey = medals.join(',');
  const prizeOpen = view.stall.open;
  const draw = useMemo(
    () => fairSceneDraw(lineup, { locked, prizeOpen, medals }),
    [lineupKey, locked, prizeOpen, medalsKey],
  );

  async function setEntry(event: LineupEvent, slot: number, creatureId: string | null) {
    await run(async () => {
      onView({ ...view, next: await putEntry(api.setEntry, next, event, slot, creatureId) });
    });
  }

  // --- Dragging a creature from the tray onto a stall ---

  const rootRef = useRef<HTMLDivElement | null>(null);
  const drag = useDragDrop<string>({
    disabled: busy || staged,
    stripRef: rootRef,
    touchHoldMs: TOUCH_HOLD_MS,
    locate: (pt) => seatAt(pt.x, pt.y),
    onDrop: (creatureId, seatId) => {
      const eventId = eventOfSeat(seatId);
      const event = next.lineup.find((e) => e.id === eventId);
      if (event === undefined) return dropOutcome('none', null, null, 'Cancelled.');
      const did = dropEntry(next, event, creatureId);
      if (did.kind === 'none') return dropOutcome('none', null, null, '');
      if (did.kind === 'refuse') {
        setDropError(did.message);
        return dropOutcome('invalid', null, did.message, did.message);
      }
      void setEntry(event, did.slot, creatureId);
      return dropOutcome('valid', null, null, '');
    },
  });
  const carried = byId.get(drag.drag?.creatureId ?? '');
  const overSeat = drag.drag?.over ?? null;
  const ordered = trayFor(creatures, trayInput);

  const closeTop = (): void => {
    if (right !== null) setRight(null);
    else if (left !== null && left.kind !== 'standings') setLeft(null);
  };
  const dismissError = (): void => {
    setError(null);
    setDropError(null);
  };
  const lineupNames = show?.lineup ?? next.lineup;
  const onReplay =
    show === null || show.day !== view.you.lastResults?.day
      ? undefined
      : (eventId: string | null) => {
          setLeft((was) => (was?.kind === 'standings' ? was : null));
          setReplay(eventId === null ? 0 : replayStart(show, eventId));
        };

  // --- The drawers' panels ---

  let rightPanel: CanvasPanel | null = null;
  const closeRight = (): void => {
    setRight(null);
  };
  const stallEvent =
    right?.kind === 'stall' ? next.lineup.find((e) => e.id === right.eventId) : undefined;
  // The day rolled and the open stall's event is gone from the lineup: nothing is left to show, so the drawer closes.
  const stallGone = right?.kind === 'stall' && stallEvent === undefined;
  useEffect(() => {
    if (stallGone) setRight(null);
  }, [stallGone]);
  if (right?.kind === 'stall' && stallEvent !== undefined) {
    rightPanel = {
      title: stallEvent.name,
      // The panel's first step has its own Back, so a phone's page draws no second head over it.
      wizard: true,
      returnFocusTo: right.from,
      backLabel: 'to the fair',
      onClose: closeRight,
      children: (
        <StallPanel
          key={stallEvent.id}
          event={stallEvent}
          next={next}
          creatures={creatures}
          busy={busy}
          error={error}
          onDismissError={dismissError}
          onSet={(slot, creatureId) => {
            void setEntry(stallEvent, slot, creatureId);
          }}
          onClose={closeRight}
        />
      ),
    };
  } else if (right?.kind === 'prize') {
    rightPanel = {
      title: 'Prize Stall',
      returnFocusTo: right.from,
      backLabel: 'to the fair',
      onClose: closeRight,
      children: (
        <PrizePanel
          stall={view.stall}
          pocket={view.you.pocket}
          timezone={view.timezone}
          offset={offset}
          busy={busy}
          error={error}
          onDismissError={dismissError}
          purchase={purchase}
          onDismissPurchase={() => {
            setPurchase(null);
          }}
          onBuy={(offer: StallOffer) => {
            void runKeyed(ActionIds.gamesBuy(view.stall.week, offer.id, offer.left), (key) =>
              api.buy(offer.id, key),
            ).then((answer) => {
              if (answer === undefined) return;
              onView({ ...view, you: answer.you, stall: answer.stall });
              setPurchase(answer.purchase);
              onPurchased();
            });
          }}
        />
      ),
    };
  } else if (right?.kind === 'rules') {
    rightPanel = {
      title: 'Rules',
      returnFocusTo: right.from,
      backLabel: 'to the fair',
      onClose: closeRight,
      children: <RulesPanel />,
    };
  } else if (right?.kind === 'tent') {
    rightPanel = {
      title: 'The show',
      returnFocusTo: right.from,
      backLabel: 'to the fair',
      onClose: closeRight,
      children: <ShowPanel next={next} timezone={view.timezone} />,
    };
  }

  let leftPanel: CanvasPanel | null = null;
  const closeLeft = (): void => {
    setLeft(null);
  };
  if (left?.kind === 'last') {
    leftPanel = {
      title: 'Last show',
      returnFocusTo: left.from,
      backLabel: 'to the fair',
      onClose: closeLeft,
      children: (
        <LastShowPanel
          you={view.you}
          lineup={lineupNames}
          creatures={creatures}
          onReplay={onReplay}
        />
      ),
    };
  } else if (left?.kind === 'medals') {
    leftPanel = {
      title: 'Medals',
      returnFocusTo: left.from,
      backLabel: 'to the fair',
      onClose: closeLeft,
      children: <MedalsPanel you={view.you} board={view.board} selfId={selfId} />,
    };
  } else if (left?.kind === 'standings') {
    leftPanel = {
      title: 'Standings',
      returnFocusTo: left.from,
      backLabel: 'to the show',
      onClose: closeLeft,
      children: (
        <PanelBody
          footer={
            replay === null ? undefined : (
              <button
                type="button"
                class="ghost"
                onClick={() => {
                  setReplay(null);
                }}
              >
                Back to the fair
              </button>
            )
          }
        >
          <div class="fg-standings" ref={setBoardHost} />
        </PanelBody>
      ),
    };
  }

  // --- The scene, or the show in its place ---

  const names = Object.fromEntries((show?.players ?? []).map((p) => [p.id, p.name]));
  const stage =
    show !== null && staged ? (
      <div class="fg-stage" data-pushed={wide && left?.kind === 'standings' ? 'yes' : undefined}>
        <GamesShow
          stage
          fill
          boardHost={left?.kind === 'standings' ? boardHost : null}
          events={show.events}
          lineup={show.timeline.map((s) => s.eventId)}
          mode={replay === null ? 'live' : 'replay'}
          {...(replay === null
            ? { startsAt: show.showAt, serverNow: stageClock }
            : { startMs: replay })}
          youId={selfId}
          names={names}
          onDone={replay === null ? onReload : undefined}
        />
      </div>
    ) : null;

  const scene = (
    <SceneFrame
      key="fairground"
      id="fairground"
      label="Fairground"
      draw={draw}
      onLeave={closeTop}
      scaleFor={(width, height) => fairScale(width, height, lineup)}
    >
      {(measured) => {
        // A scene not measured yet (no size) is laid out as a phone's, so the targets are there from the first draw.
        const g =
          measured.W > 0 && measured.H > 0
            ? measured
            : sceneGeometry(390, 640, fairScale(390, 640, lineup));
        return (
          <FairInside
            g={g}
            view={view}
            lineup={next.lineup}
            casts={casts}
            byId={byId}
            now={now}
            locked={locked}
            open={{
              stall: right?.kind === 'stall' ? right.eventId : null,
              prize: right?.kind === 'prize',
              rules: right?.kind === 'rules',
              tent: right?.kind === 'tent',
            }}
            overSeat={overSeat}
            busy={busy}
            onOpen={(next_) => {
              setRight(next_);
            }}
          />
        );
      }}
    </SceneFrame>
  );

  const tools = (
    <div class="pc-tools pc-tools-row" role="group" aria-label="The fair" data-no-pan="yes">
      {staged ? (
        <>
          <button
            type="button"
            class="vy-hatch pc-tool"
            aria-label="Standings. Open"
            aria-expanded={left?.kind === 'standings'}
            onClick={(event) => {
              setLeft(
                left?.kind === 'standings'
                  ? null
                  : { kind: 'standings', from: openerOf(event.currentTarget) },
              );
            }}
          >
            <Glyph id="stats" scale={2} />
            <ToolCue name="Standings" />
          </button>
          {replay !== null && (
            <button
              type="button"
              class="vy-hatch pc-tool"
              aria-label="Back to the fair"
              onClick={() => {
                setReplay(null);
              }}
            >
              <span class="pix fg-back" aria-hidden="true">
                ‹
              </span>
              <ToolCue name="Back" />
            </button>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            class="vy-hatch pc-tool"
            aria-label="Last show. Open"
            aria-expanded={left?.kind === 'last'}
            onClick={(event) => {
              setLeft({ kind: 'last', from: openerOf(event.currentTarget) });
            }}
          >
            <Glyph id="trophy" scale={2} />
            <ToolCue name="Last show" />
          </button>
          <button
            type="button"
            class="vy-hatch pc-tool"
            aria-label="Medals. Open"
            aria-expanded={left?.kind === 'medals'}
            onClick={(event) => {
              setLeft({ kind: 'medals', from: openerOf(event.currentTarget) });
            }}
          >
            <Glyph id="medal-point" scale={2} />
            <ToolCue name="Medals" />
          </button>
        </>
      )}
    </div>
  );

  return (
    <div
      class="fg-root"
      ref={rootRef}
      data-carrying={drag.drag === null ? undefined : 'yes'}
      data-over={drag.drag?.over ?? undefined}
      data-screen={staged ? 'show' : screen}
    >
      <PlaceCanvas
        label="Fairground"
        scene={stage ?? scene}
        left={leftPanel}
        right={staged ? null : rightPanel}
        overlay={tools}
        below={
          <>
            {(dropError ?? (right === null ? error : null)) !== null && (
              <div class="fg-error">
                <Alert key={dropError ?? error} level="alert" onDismiss={dismissError}>
                  {dropError ?? error}
                </Alert>
              </div>
            )}
            <Tray
              creatures={ordered}
              input={trayInput}
              label={staged ? 'Your creatures' : 'Creatures to enter'}
              oneRow
              onPick={onOpenPaddock}
              {...(staged ? {} : { drag })}
              marks={(c) => {
                const entered = Object.entries(next.entries).find(([, ids]) => ids.includes(c.id));
                const event =
                  entered === undefined ? undefined : next.lineup.find((e) => e.id === entered[0]);
                const label = `${trayBadge(c, trayInput).label} Opens the Paddock.`;
                return event === undefined
                  ? { state: 'free', label, mark: null }
                  : {
                      state: 'entered',
                      label: `${creatureName(c)}, level ${String(c.level)}. Entered in ${event.name}. Opens the Paddock.`,
                      mark: <Glyph id="tick" scale={2} />,
                    };
              }}
            />
          </>
        }
      />
      <DragGhost
        ghostRef={drag.ghostRef}
        creature={
          carried === undefined
            ? undefined
            : { species: carried.species, name: creatureName(carried) }
        }
      />
    </div>
  );
}

/** A poster: the event's own scene strip, drawn on a small canvas over the stall's back wall. */
function Poster({ scene, scale }: { scene: string; scale: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const id = sceneOf(scene);
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) paint(ctx, posterArt(id), scale);
  }, [id, scale]);
  return (
    <canvas
      ref={ref}
      class="fg-poster"
      width={POSTER.w * scale}
      height={POSTER.h * scale}
      aria-hidden="true"
    />
  );
}

/** What stands in the scene over its canvas: the posters, who is at each counter, the targets (each real button a `CanvasTarget`). */
function FairInside({
  g,
  view,
  lineup,
  casts,
  byId,
  now,
  locked,
  open,
  overSeat,
  busy,
  onOpen,
}: {
  g: SceneGeometry;
  view: GamesView;
  lineup: readonly LineupEvent[];
  casts: ReturnType<typeof stallCasts>;
  byId: ReadonlyMap<string, Creature>;
  now: number;
  locked: boolean;
  open: { stall: string | null; prize: boolean; rules: boolean; tent: boolean };
  overSeat: string | null;
  busy: boolean;
  onOpen: (right: Right) => void;
}) {
  const lay = fairLayout(g, lineup);
  return (
    <>
      {lineup.map((event) => {
        const box = lay.stalls[event.id];
        if (box === undefined) return null;
        const poster = posterBox(event);
        const cast = casts.find((c) => c.eventId === event.id);
        return (
          <div key={event.id} class="fg-stall" data-event={event.id}>
            {!locked && (
              <At x={g.X(box.x + poster.x)} y={g.Y(box.y + poster.y)} class="fg-poster-at">
                <Poster scene={event.scene} scale={g.s} />
              </At>
            )}
            {event.bonus === true && (
              <At x={g.X(box.x + 2)} y={g.Y(box.y + 2)} class="fg-ribbon-at">
                <span class="fg-ribbon pix">Bonus</span>
              </At>
            )}
            {cast?.stands.map((stand) => {
              const creature = byId.get(stand.creatureId);
              if (creature === undefined) return null;
              const x = box.x + stand.x;
              const y = box.y + stand.y;
              return (
                <At key={stand.creatureId} x={g.X(x)} y={g.Y(y)} class="vy-stand" z={depthOf(x, y)}>
                  <CreatureSprite creature={creature} scale={g.s} idle={creature.id} />
                </At>
              );
            })}
          </div>
        );
      })}
      {lineup.map((event) => {
        const box = lay.stalls[event.id];
        if (box === undefined) return null;
        const mine = casts.find((c) => c.eventId === event.id)?.stands.length ?? 0;
        return (
          <CanvasTarget
            key={event.id}
            g={g}
            x={box.x}
            y={box.y}
            w={box.w}
            h={box.h}
            z={PLATES_Z}
            seat={stallSeat(event.id)}
            over={overSeat === stallSeat(event.id)}
            label={`${event.name}${event.team === 3 ? ', a team event' : ''}${event.bonus === true ? ', the bonus event' : ''}. ${locked ? 'Entries are closed.' : `${String(mine)} of your creatures entered.`} Open the event`}
            plate={event.name}
            plateAt={box.h + 1}
            expanded={open.stall === event.id}
            disabled={busy}
            onClick={(opener) => {
              onOpen({ kind: 'stall', eventId: event.id, from: opener });
            }}
          />
        );
      })}
      <CanvasTarget
        g={g}
        x={lay.tent.x}
        y={lay.tent.y}
        w={lay.tent.w}
        h={lay.tent.h}
        label={`The show tent. ${tentPlate(view, now, locked)}. Open the schedule`}
        plate={tentPlate(view, now, locked)}
        plateAt={lay.tent.h + 1}
        expanded={open.tent}
        onClick={(opener) => {
          onOpen({ kind: 'tent', from: opener });
        }}
      />
      <CanvasTarget
        g={g}
        x={lay.prize.x}
        y={lay.prize.y}
        w={lay.prize.w}
        h={lay.prize.h}
        label={
          view.stall.open
            ? 'The Prize Stall is open. Open the prizes'
            : `The Prize Stall is shuttered. ${prizePlate(view)}. Open it`
        }
        plate={prizePlate(view)}
        plateAt={lay.prize.h + 1}
        expanded={open.prize}
        onClick={(opener) => {
          onOpen({ kind: 'prize', from: opener });
        }}
      />
      <CanvasTarget
        g={g}
        x={lay.rules.x}
        y={lay.rules.y}
        w={lay.rules.w}
        h={lay.rules.h}
        label="The rules of the Valley Games. Open the rules"
        plate="Rules"
        plateAt={lay.rules.h + 1}
        expanded={open.rules}
        onClick={(opener) => {
          onOpen({ kind: 'rules', from: opener });
        }}
      />
    </>
  );
}
