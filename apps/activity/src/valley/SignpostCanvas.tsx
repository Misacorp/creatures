/**
 * The Signpost as a canvas (Misa, 2026-11-11; the rule is "A place is a canvas" in `ux-patterns.md`; the scouts are `systems/scouts.md`).
 * The place opens on its scene: the road and its signpost, the scouts standing at their seats in front of it, the dashed outline of the next
 * seat with its price, and two props, the crate of finds waiting in the packs and the plans table of the project board. A click on the
 * signpost opens the expedition map as the canvas (`SignpostMap`: the Expeditions screen's map with the scouts at the place they are
 * at), which pans by drag, wheel and trackpad, and a click on a destination there opens its drawer (`DestinationPanel`: who scouts
 * there, seat, kit, confirm; for a scout already there its pack, change, move and rest). Nothing scrolls, nothing is a page of forms.
 *
 * What a click opens follows the side rule (`PlaceCanvas`): the right drawer is for the one thing that was clicked (a destination, a seat,
 * the new-seat step), the left drawer for the collections that belong to no one spot (the packs of every seat, the project board). A phone
 * shows the open panel as its own page. Every action is the game's and the server decides.
 */
import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import type { Creature, ValleyVisit } from '../api';
import { creatureName } from '../game';
import { busyReason } from '../gear-view';
import { cssVars } from '../css-vars';
import { dropOutcome } from '../slot-outcome';
import { TOUCH_HOLD_MS } from '../dnd-core';
import { useDragDrop } from '../use-drag-drop';
import { Bar } from '../ui/Bar';
import { PriceLine } from '../ui/CountBadge';
import { DragGhost } from '../ui/DragGhost';
import { Nameplate } from '../ui/Nameplate';
import { CommonsBoard, type CommonsActions } from './CommonsBoard';
import { DestinationPanel, SeatBuyPanel, type DestinationStep } from './DestinationPanel';
import { CanvasTarget, PanelBody, PlaceCanvas, type CanvasPanel, type Opener } from './PlaceCanvas';
import { SceneFrame, sceneGeometry } from './SceneFrame';
import { SignpostMap, signpostMapScale } from './SignpostMap';
import type { SignpostActions } from './SignpostSeats';
import { At, CreatureSprite, SpeechBubble, useSize } from './parts';
import { Tray } from './Tray';
import { trayFor, type TrayInput } from './tray-state';
import { seatAt } from './seat-parts';
import { commonsOf, percentFilled, placeOf } from './commons-view';
import { scaffoldSteps } from './scaffold';
import {
  PROP,
  PROP_HIT,
  fullPackCount,
  seatLabel,
  signpostLayout,
  signpostScale,
  signpostSceneDraw,
} from './signpost-canvas';
import { signpostMapPlaces } from './signpost-map';
import { fitPreview, packLine, placeName, seatPrice } from './signpost-view';

/** The id of the card a hand drops a creature on to help build (the project board's communal seat). */
const COMMUNAL_DROP = 'communal:signpost';

/** What the canvas shows: its scene, or the expedition map. */
export type SignpostView = 'scene' | 'map';

/** The right drawer: the one thing that was clicked. */
type Right =
  | {
      kind: 'place';
      id: string;
      start: DestinationStep;
      seatId: string | null;
      from: Opener | null;
    }
  | { kind: 'buy'; from: Opener | null };

/** The left drawer: a collection. */
type Left = { kind: 'packs' | 'board'; from: Opener | null };

/** What the canvas can open at the start (the workbench and the tests show each). */
export interface SignpostCanvasStart {
  view?: SignpostView;
  /** A destination's drawer to open (on the map), with the step and the seat it starts from. */
  place?: string;
  step?: DestinationStep;
  seatId?: string;
  buy?: boolean;
  packs?: boolean;
  board?: boolean;
}

export interface SignpostCanvasProps {
  visit: ValleyVisit;
  creatures: readonly Creature[];
  trayInput: TrayInput;
  acorns: number;
  busy: boolean;
  error?: string | null;
  actions: SignpostActions;
  commons?: CommonsActions | undefined;
  onOpenPaddock: () => void;
  start?: SignpostCanvasStart | undefined;
}

function startRight(start: SignpostCanvasStart | undefined, visit: ValleyVisit): Right | null {
  if (start?.place !== undefined) {
    return {
      kind: 'place',
      id: start.place,
      start: start.step ?? 'hub',
      seatId: start.seatId ?? null,
      from: null,
    };
  }
  if (start?.buy === true && visit.seatPrices.next !== null) return { kind: 'buy', from: null };
  return null;
}

export function SignpostCanvas(props: SignpostCanvasProps) {
  const { visit, creatures, trayInput, acorns, busy, actions, commons, start } = props;
  const error = props.error ?? null;
  const [view, setView] = useState<SignpostView>(
    start?.view ?? (start?.place !== undefined ? 'map' : 'scene'),
  );
  const [right, setRight] = useState<Right | null>(() => startRight(start, visit));
  const [left, setLeft] = useState<Left | null>(() =>
    start?.packs === true
      ? { kind: 'packs', from: null }
      : start?.board === true
        ? { kind: 'board', from: null }
        : null,
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const size = useSize(rootRef);

  const creatureOf = (id: string | null): Creature | undefined =>
    id === null ? undefined : creatures.find((c) => c.id === id);

  const drag = useDragDrop<string>({
    disabled: busy,
    stripRef: rootRef,
    touchHoldMs: TOUCH_HOLD_MS,
    locate: (p) => seatAt(p.x, p.y),
    onDrop: (creatureId, seatId) => {
      if (seatId === null) return dropOutcome('none', null, null, 'Cancelled.');
      if (seatId === COMMUNAL_DROP && commons !== undefined) {
        void commons.post('signpost', creatureId);
        return dropOutcome('valid', null, null, '');
      }
      const seat = visit.seats.find((s) => s.id === seatId);
      if (seat === undefined || seat.creatureId === creatureId) {
        return dropOutcome('none', null, null, '');
      }
      void actions.post({ seatId, creatureId });
      return dropOutcome('valid', null, null, '');
    },
  });
  const carried = creatureOf(drag.drag?.creatureId ?? null);
  // A hand over a seat previews the change in its fit before the drop (V-POST-4).
  const overSeat = visit.seats.find((s) => s.id === drag.drag?.over);
  const preview =
    carried !== undefined && overSeat !== undefined
      ? fitPreview(carried, overSeat, visit, creatures)
      : null;

  const free = creatures.filter((c) => busyReason(c) === null);
  const ordered = trayFor(free, trayInput);

  const owned = visit.seats.length;
  const nextPrice = visit.seatPrices.next;
  const slots = owned + (nextPrice === null ? 0 : 1);
  const commonsView = commonsOf(visit);
  const signpostPlace = placeOf(commonsView, 'signpost');
  const scaffold =
    signpostPlace?.state === 'open' ? scaffoldSteps(percentFilled(signpostPlace) / 100) : 0;
  const helperId = commonsView?.communal.find((c) => c.place === 'signpost')?.creatureId ?? null;
  const helper = creatureOf(helperId);
  const fullPacks = fullPackCount(visit.seats);

  const selected = right?.kind === 'place' ? right.id : null;
  const mapPlaces = signpostMapPlaces(visit, creatures, selected);
  const mapScale = signpostMapScale(size.width, size.height);

  const closeTop = (): void => {
    if (right !== null) setRight(null);
    else if (left !== null) setLeft(null);
    else if (view === 'map') setView('scene');
  };

  // --- The drawers' panels ---

  let rightPanel: CanvasPanel | null = null;
  if (right !== null) {
    const from = right.from;
    const close = (): void => {
      setRight(null);
    };
    if (right.kind === 'place') {
      rightPanel = {
        title: placeName(right.id),
        wizard: true,
        returnFocusTo: from,
        backLabel: 'to the map',
        onClose: close,
        children: (
          <DestinationPanel
            key={`${right.id}:${right.start}:${right.seatId ?? ''}`}
            visit={visit}
            destinationId={right.id}
            creatures={creatures}
            acorns={acorns}
            busy={busy}
            error={error}
            actions={actions}
            start={right.start}
            seatId={right.seatId}
            onClose={close}
          />
        ),
      };
    } else {
      rightPanel = {
        title: 'The signpost',
        wizard: true,
        returnFocusTo: from,
        onClose: close,
        children: (
          <SeatBuyPanel
            visit={visit}
            acorns={acorns}
            busy={busy}
            error={error}
            actions={actions}
            onClose={close}
          />
        ),
      };
    }
  }

  let leftPanel: CanvasPanel | null = null;
  if (left !== null) {
    const base = {
      returnFocusTo: left.from,
      onClose: () => {
        setLeft(null);
      },
    };
    if (left.kind === 'packs') {
      leftPanel = {
        ...base,
        title: 'Packs',
        children: (
          <PanelBody>
            {visit.seats.length === 0 ? (
              <p class="muted">Take a seat, and what your scouts find waits here.</p>
            ) : (
              <ul class="sg-packs" aria-label="The packs">
                {visit.seats.map((seat, i) => {
                  const scout = creatureOf(seat.creatureId);
                  const name = `Seat ${String(i + 1)}${scout === undefined ? '' : `: ${creatureName(scout)}`}`;
                  return (
                    <li key={seat.id}>
                      <button
                        type="button"
                        class="sp-line sp-pack"
                        aria-label={`${name}, ${placeName(seat.destination)}. ${packLine(seat)}. Show this seat`}
                        onClick={(event) => {
                          setView('map');
                          setRight({
                            kind: 'place',
                            id: seat.destination,
                            start: scout === undefined ? 'who' : 'seat-view',
                            seatId: seat.id,
                            from: { el: event.currentTarget, byKeyboard: false },
                          });
                        }}
                      >
                        <Bar
                          value={seat.store.hours}
                          max={seat.store.capHours}
                          label={name}
                          class="sp-bar"
                        />
                        <span class="sp-pack-text">
                          {name}, {placeName(seat.destination)}, {packLine(seat)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </PanelBody>
        ),
      };
    } else {
      leftPanel = {
        ...base,
        title: 'Project board',
        children: (
          <PanelBody>
            {commons !== undefined && (
              <CommonsBoard
                place="signpost"
                visit={visit}
                creatures={creatures}
                acorns={acorns}
                busy={busy}
                actions={commons}
                dropId={COMMUNAL_DROP}
                over={drag.drag?.over === COMMUNAL_DROP}
              />
            )}
          </PanelBody>
        ),
      };
    }
  }

  const openLeft = (kind: Left['kind']) => (opener: Opener) => {
    setLeft({ kind, from: opener });
  };

  // --- The scene ---

  const draw = signpostSceneDraw(scaffold, slots);
  const scene = (
    <SceneFrame
      id="signpost"
      label="Signpost, scouts"
      draw={draw}
      onLeave={closeTop}
      scaleFor={signpostScale}
    >
      {(measured) => {
        // A scene not measured yet (no size) is laid out as a phone's, so the targets are there from the first draw.
        const g =
          measured.W > 0 && measured.H > 0
            ? measured
            : sceneGeometry(390, 640, signpostScale(390, 640));
        const lay = signpostLayout(g, slots);
        const plate = (x: number, y: number, text: string): ComponentChildren => (
          <At x={g.X(x)} y={g.Y(y)} class="vy-feet-plate">
            <Nameplate size="sm">{text}</Nameplate>
          </At>
        );
        const propBox = (p: { x: number; y: number }): { x: number; y: number } => ({
          x: p.x - (PROP_HIT - PROP) / 2,
          y: p.y - (PROP_HIT - PROP) / 2,
        });
        const placeAt =
          (seatId: string, step: DestinationStep, destination: string) => (opener: Opener) => {
            setRight({ kind: 'place', id: destination, start: step, seatId, from: opener });
          };
        return (
          <>
            {helper !== undefined && (
              <At
                x={g.X(lay.art.x + Math.floor(lay.art.width / 2) - 8)}
                y={g.Y(lay.art.y + lay.art.height - 22)}
                class="vy-stand"
              >
                <CreatureSprite creature={helper} scale={g.s} />
              </At>
            )}
            {visit.seats.map((seat, i) => {
              const cell = lay.cells[i];
              const scout = creatureOf(seat.creatureId);
              if (cell === undefined || scout === undefined) return null;
              return (
                <span key={seat.id}>
                  <At x={g.X(cell.stand.x)} y={g.Y(cell.stand.y)} class="vy-stand">
                    <CreatureSprite creature={scout} scale={g.s} flip={i % 2 === 1} />
                  </At>
                  {seat.store.full && seat.paused === null && (
                    <At x={g.X(cell.stand.x)} y={g.Y(cell.stand.y)} class="vy-over">
                      <span
                        class="vy-region-box"
                        ref={cssVars({ '--pw': `${String(PROP * g.s)}px`, '--ph': '0px' })}
                      />
                      <SpeechBubble glyph="gift" count={null} />
                    </At>
                  )}
                  {plate(cell.x + cell.w / 2, cell.stand.y + PROP + 2, creatureName(scout))}
                </span>
              );
            })}
            {fullPacks > 0 && (
              <At x={g.X(lay.crate.x)} y={g.Y(lay.crate.y)} class="vy-over">
                <span
                  class="vy-region-box"
                  ref={cssVars({ '--pw': `${String(PROP * g.s)}px`, '--ph': '0px' })}
                />
                <SpeechBubble glyph="gift" count={fullPacks} />
              </At>
            )}
            {plate(lay.crate.x + PROP / 2, lay.crate.y + PROP + 2, 'Packs')}
            {plate(lay.plans.x + PROP / 2, lay.plans.y + PROP + 2, 'Board')}

            {/* The targets, over everything above: each a real button. */}
            <CanvasTarget
              g={g}
              x={lay.art.x}
              y={lay.art.y}
              w={lay.art.width}
              h={lay.art.height - 8}
              label="The signpost: the map of places to scout. Open the map"
              onClick={() => {
                setView('map');
              }}
            />
            {visit.seats.map((seat, i) => {
              const cell = lay.cells[i];
              if (cell === undefined) return null;
              const scout = creatureOf(seat.creatureId);
              const n = i + 1;
              const open =
                right?.kind === 'place' &&
                right.seatId === seat.id &&
                right.id === seat.destination;
              if (scout === undefined) {
                return (
                  <CanvasTarget
                    key={seat.id}
                    g={g}
                    x={cell.x}
                    y={cell.y}
                    w={cell.w}
                    h={cell.h}
                    seat={seat.id}
                    slot
                    over={drag.drag?.over === seat.id}
                    label={seatLabel(n, undefined, '', '')}
                    expanded={open}
                    disabled={busy}
                    onClick={placeAt(seat.id, 'who', seat.destination)}
                  >
                    <span class="cv-price">Seat {n}</span>
                  </CanvasTarget>
                );
              }
              return (
                <CanvasTarget
                  key={seat.id}
                  g={g}
                  x={cell.x}
                  y={cell.y}
                  w={cell.w}
                  h={cell.h}
                  seat={seat.id}
                  over={drag.drag?.over === seat.id}
                  label={seatLabel(
                    n,
                    { name: creatureName(scout), level: scout.level },
                    placeName(seat.destination),
                    packLine(seat),
                  )}
                  expanded={open}
                  disabled={busy}
                  onClick={placeAt(seat.id, 'seat-view', seat.destination)}
                />
              );
            })}
            {nextPrice !== null && lay.cells[owned] !== undefined && (
              <CanvasTarget
                g={g}
                x={lay.cells[owned].x}
                y={lay.cells[owned].y}
                w={lay.cells[owned].w}
                h={lay.cells[owned].h}
                slot
                label="A new seat. Buy it"
                expanded={right?.kind === 'buy'}
                disabled={busy}
                onClick={(opener) => {
                  setRight({ kind: 'buy', from: opener });
                }}
              >
                <span class="cv-price">
                  <PriceLine price={seatPrice(nextPrice)} />
                </span>
              </CanvasTarget>
            )}
            <CanvasTarget
              g={g}
              {...propBox(lay.crate)}
              w={PROP_HIT}
              h={PROP_HIT}
              label={`The packs${fullPacks > 0 ? `: ${String(fullPacks)} full` : ''}. Open`}
              expanded={left?.kind === 'packs'}
              onClick={openLeft('packs')}
            />
            {commonsView !== null && (
              <CanvasTarget
                g={g}
                {...propBox(lay.plans)}
                w={PROP_HIT}
                h={PROP_HIT}
                label="The project board. Open"
                expanded={left?.kind === 'board'}
                onClick={openLeft('board')}
              />
            )}
          </>
        );
      }}
    </SceneFrame>
  );

  const main =
    view === 'map' ? (
      <SignpostMap
        places={mapPlaces}
        selected={selected}
        night={visit.night}
        scale={mapScale}
        onPick={(id) => {
          setRight((now) =>
            now?.kind === 'place' && now.id === id
              ? now
              : { kind: 'place', id, start: 'hub', seatId: null, from: null },
          );
        }}
        onBack={() => {
          setRight(null);
          setView('scene');
        }}
      />
    ) : (
      scene
    );

  return (
    <div
      class="sg-root"
      ref={rootRef}
      data-carrying={drag.drag === null ? undefined : 'yes'}
      data-over={drag.drag?.over ?? undefined}
      data-view={view}
    >
      <PlaceCanvas
        label="Signpost"
        scene={main}
        left={leftPanel}
        right={rightPanel}
        below={
          <Tray
            creatures={ordered}
            input={trayInput}
            label="Creatures to post"
            onPick={props.onOpenPaddock}
            drag={drag}
          />
        }
      />
      {preview !== null && (
        <p class="sp-line sp-preview sg-preview" data-arrow={preview.arrow} role="status">
          <span class="sp-arrow" aria-hidden="true" />
          <span>{preview.text}</span>
        </p>
      )}
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
