/**
 * The Forge as a canvas (Misa, 2026-11-11; the rule is "A place is a canvas" in `ux-patterns.md`): the forge's art fills the view with
 * its yard in front of it, and everything is done by clicking something in it. Nothing scrolls.
 *
 * In the scene: an anvil for each one the player owns (with its smith standing at it and a small bubble for what the smith does), then
 * the dashed outline of the next anvil with its price as icons, which opens the buy step; under them three props, each the way into a
 * collection (the plans table, the chest that is the bag, the crate of finished pieces that is the floor); and the forge itself, which
 * opens the fire and the project board. Under the scene stay the shelf (scrap, shards, Essence) and the creature tray (a hand can still
 * carry a creature onto an anvil).
 *
 * What a click opens follows the side rule (`PlaceCanvas`): the right drawer is for the one thing that was clicked (an anvil's wizard,
 * `ForgeAnvilPanel`, or the order wizard, `OrderEditor`, or the buy step), the left drawer for the collections that belong to no one
 * spot (the bag, the floor, the plans, the project board). A phone shows the open panel as its own page. Every action is the game's
 * and the server decides.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Creature, ValleyVisit } from '../api';
import type { BlueprintView } from '../gear-view';
import { busyReason } from '../gear-view';
import { creatureName } from '../game';
import { dropOutcome } from '../slot-outcome';
import { TOUCH_HOLD_MS } from '../dnd-core';
import { useDragDrop } from '../use-drag-drop';
import { Bar } from '../ui/Bar';
import { DragGhost } from '../ui/DragGhost';
import { CommonsBoard, type CommonsActions } from './CommonsBoard';
import { CommonsFire } from './CommonsFire';
import {
  COMMUNAL_DROP,
  Shelf,
  type ForgeActions,
  type ForgeStart,
  type OrderOpen,
} from './ForgeAnvils';
import { ForgeAnvilPanel, type AnvilStep } from './ForgeAnvilPanel';
import { ForgeBuyPanel } from './ForgeBuyPanel';
import { OrderEditor, type OrderShell } from './OrderEditor';
import { PanelBody, PlaceCanvas, openerOf, type CanvasPanel, type Opener } from './PlaceCanvas';
import { SceneFrame, sceneGeometry } from './SceneFrame';
import { Tray } from './Tray';
import { trayFor, type TrayInput } from './tray-state';
import { seatAt } from './seat-parts';
import { commonsOf, percentFilled, placeOf } from './commons-view';
import { scaffoldSteps } from './scaffold';
import { floorTotal, forgeScale, outsideSceneDraw } from './forge-canvas';
import { interiorScale, interiorSceneDraw } from './forge-interior';
import { ForgeInside, ForgeOutside, type InsideOpen } from './ForgeScenes';
import { anvilName, floorLine } from './forge-view';

/** The right drawer: the one thing that was clicked. */
type Right =
  | { kind: 'anvil'; anvilId: string; start: AnvilStep; from: Opener | null }
  | { kind: 'buy'; from: Opener | null }
  | {
      kind: 'order';
      open: OrderOpen & { baseId?: string };
      /** The anvil whose wizard the order was opened from; Back leaves for it (null: the order leaves for the scene). */
      back: string | null;
      from: Opener | null;
    };

/** The left drawer: a collection or an overview. */
type Left = { kind: 'bag' | 'floor' | 'plans' | 'board'; from: Opener | null };

/** The player's anvils and what they pass in. */
export interface ForgeCanvasProps {
  visit: ValleyVisit;
  creatures: readonly Creature[];
  trayInput: TrayInput;
  acorns: number;
  busy: boolean;
  error: string | null;
  actions: ForgeActions;
  commons?: CommonsActions | undefined;
  onOpenPaddock: () => void;
  onOpenMarket: (to: string | null) => void;
  start?: ForgeStart | undefined;
  /** An order wizard open at the start (the workbench shows each): an anvil, and a blueprint or an order. */
  orderStart?: { anvilId: string; baseId?: string; orderId?: string } | undefined;
  /** The blueprints the order wizard offers; null until the gear view has loaded. */
  blueprints: readonly BlueprintView[] | null;
  /** The bag (the Workshop draws it: its grid, filter, item card and dismantle flow). */
  bag: ComponentChildren;
  /** The plans table's list (the Workshop draws it); `onOrder` opens the order wizard on a blueprint. */
  plans: (onOrder: (baseId: string, opener: HTMLElement) => void) => ComponentChildren;
  /** The bag has no room: its chest says so. */
  bagFull: boolean;
  /** Something in the bag needs a look (a dismantle result, a gear notice): the bag opens, and its chest says so. */
  bagAttention: boolean;
  /** Start inside the workshop (the workbench and the tests); else it opens outside unless something that lives inside is asked for. */
  inside?: boolean | undefined;
}

/** The anvil whose queue holds this order. */
function anvilOfOrder(visit: ValleyVisit, orderId: string): string | null {
  return visit.anvils.find((a) => a.orders.some((o) => o.id === orderId))?.id ?? null;
}

function startRight(props: ForgeCanvasProps): Right | null {
  const { visit, start, orderStart } = props;
  if (orderStart !== undefined) {
    return {
      kind: 'order',
      open:
        orderStart.orderId === undefined
          ? {
              kind: 'add',
              anvilId: orderStart.anvilId,
              opener: null,
              ...(orderStart.baseId === undefined ? {} : { baseId: orderStart.baseId }),
            }
          : { kind: 'edit', orderId: orderStart.orderId, opener: null },
      back: null,
      from: null,
    };
  }
  if (start?.picker !== undefined)
    return { kind: 'anvil', anvilId: start.picker, start: 'smith', from: null };
  if (start?.kit !== undefined)
    return { kind: 'anvil', anvilId: start.kit, start: 'kit', from: null };
  if (start?.floor !== undefined)
    return { kind: 'anvil', anvilId: start.floor, start: 'floor', from: null };
  if (start?.buy === true && visit.anvilPrices.next !== null) return { kind: 'buy', from: null };
  return null;
}

function startLeft(props: ForgeCanvasProps): Left | null {
  const { start } = props;
  if (start?.bag === true) return { kind: 'bag', from: null };
  if (start?.commons !== undefined || start?.fire === true) return { kind: 'board', from: null };
  return null;
}

export function ForgeCanvas(props: ForgeCanvasProps) {
  const { visit, creatures, trayInput, acorns, busy, error, actions, commons, start } = props;
  const [right, setRight] = useState<Right | null>(() => startRight(props));
  const [left, setLeft] = useState<Left | null>(() => startLeft(props));
  // The Forge opens on its outside; a click on the building goes in. What is asked for at the start (an anvil's wizard, the bag) lives inside.
  const [inside, setInside] = useState<boolean>(
    () => props.inside ?? (startRight(props) !== null || startLeft(props)?.kind === 'bag'),
  );
  const rootRef = useRef<HTMLDivElement | null>(null);

  // A result waiting in the bag (a dismantle's pieces, a notice of changed gear): the bag opens on it.
  useEffect(() => {
    if (props.bagAttention) setLeft((now) => now ?? { kind: 'bag', from: null });
  }, [props.bagAttention]);

  const creatureOf = (id: string | null): Creature | undefined =>
    id === null ? undefined : creatures.find((c) => c.id === id);

  const drag = useDragDrop<string>({
    disabled: busy,
    stripRef: rootRef,
    touchHoldMs: TOUCH_HOLD_MS,
    locate: (p) => seatAt(p.x, p.y),
    onDrop: (creatureId, anvilId) => {
      if (anvilId === null) return dropOutcome('none', null, null, 'Cancelled.');
      if (anvilId === COMMUNAL_DROP && commons !== undefined) {
        void commons.post('forge', creatureId);
        return dropOutcome('valid', null, null, '');
      }
      const anvil = visit.anvils.find((a) => a.id === anvilId);
      if (anvil === undefined || anvil.creatureId === creatureId) {
        return dropOutcome('none', null, null, '');
      }
      void actions.post({ seatId: anvilId, creatureId });
      return dropOutcome('valid', null, null, '');
    },
  });
  const carried = creatureOf(drag.drag?.creatureId ?? null);

  const free = creatures.filter((c) => busyReason(c) === null);
  const ordered = trayFor(free, trayInput);

  const owned = visit.anvils.length;
  const nextPrice = visit.anvilPrices.next;
  const slots = owned + (nextPrice === null ? 0 : 1);
  const commonsView = commonsOf(visit);
  const forgePlace = placeOf(commonsView, 'forge');
  const scaffold =
    forgePlace?.state === 'open' ? scaffoldSteps(percentFilled(forgePlace) / 100) : 0;
  const drawOutside = useMemo(() => outsideSceneDraw(scaffold), [scaffold]);
  const drawInside = useMemo(
    () => interiorSceneDraw(owned, slots, visit.night),
    [owned, slots, visit.night],
  );
  const marketBuilt = visit.market?.open === true;
  const helperId = commonsView?.communal.find((c) => c.place === 'forge')?.creatureId ?? null;
  const helper = creatureOf(helperId);
  const waiting = floorTotal(visit.anvils);

  /** The door: back outside. What was open for an anvil closes with the room; the project board is outside too and stays. */
  const goOutside = (): void => {
    setRight(null);
    setLeft((now) => (now?.kind === 'board' ? now : null));
    setInside(false);
  };

  const closeTop = (): void => {
    if (right !== null) setRight(null);
    else if (left !== null) setLeft(null);
    else if (inside) goOutside();
  };

  // --- The drawers' panels ---

  const orderShell: OrderShell = ({ children, footer }) => (
    <PanelBody footer={footer}>{children}</PanelBody>
  );

  let rightPanel: CanvasPanel | null = null;
  if (right !== null) {
    const from = right.from;
    if (right.kind === 'anvil') {
      const anvil = visit.anvils.find((a) => a.id === right.anvilId);
      rightPanel = {
        title: anvil === undefined ? 'Anvil' : anvilName(visit, anvil),
        wizard: true,
        returnFocusTo: from,
        backLabel: 'to the forge',
        onClose: () => {
          setRight(null);
        },
        children: (
          <ForgeAnvilPanel
            key={right.anvilId}
            visit={visit}
            anvilId={right.anvilId}
            creatures={creatures}
            acorns={acorns}
            busy={busy}
            error={error}
            actions={actions}
            start={right.start}
            onOrder={(open) => {
              setRight({ kind: 'order', open, back: right.anvilId, from });
            }}
            onOpenMarket={props.onOpenMarket}
            onClose={() => {
              setRight(null);
            }}
          />
        ),
      };
    } else if (right.kind === 'buy') {
      rightPanel = {
        title: 'The forge',
        wizard: true,
        returnFocusTo: from,
        onClose: () => {
          setRight(null);
        },
        children: (
          <ForgeBuyPanel
            visit={visit}
            acorns={acorns}
            busy={busy}
            error={error}
            actions={actions}
            onClose={() => {
              setRight(null);
            }}
          />
        ),
      };
    } else {
      const anvilId =
        right.open.kind === 'add' ? right.open.anvilId : anvilOfOrder(visit, right.open.orderId);
      const anvil = visit.anvils.find((a) => a.id === anvilId);
      const back = right.back;
      const leave = (): void => {
        setRight(back === null ? null : { kind: 'anvil', anvilId: back, start: 'hub', from });
      };
      rightPanel = {
        title: anvil === undefined ? 'Order' : anvilName(visit, anvil),
        wizard: true,
        returnFocusTo: from,
        onClose: leave,
        children: (
          <OrderEditor
            key={right.open.kind === 'add' ? right.open.anvilId : right.open.orderId}
            open={right.open}
            visit={visit}
            blueprints={props.blueprints}
            busy={busy}
            error={error}
            onOrder={actions.order}
            onClose={leave}
            shell={orderShell}
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
    if (left.kind === 'bag') {
      leftPanel = { ...base, title: 'Bag', children: <PanelBody>{props.bag}</PanelBody> };
    } else if (left.kind === 'plans') {
      leftPanel = {
        ...base,
        title: 'Plans',
        children: (
          <PanelBody>
            {props.plans((baseId, opener) => {
              const room =
                visit.anvils.find((a) => a.orders.length < visit.forge.queueMax) ?? visit.anvils[0];
              if (room === undefined) return;
              setRight({
                kind: 'order',
                open: { kind: 'add', anvilId: room.id, baseId, opener },
                back: null,
                from: openerOf(opener),
              });
            })}
          </PanelBody>
        ),
      };
    } else if (left.kind === 'floor') {
      leftPanel = {
        ...base,
        title: 'Floor',
        children: (
          <PanelBody>
            {visit.anvils.length === 0 ? (
              <p class="muted">Buy an anvil, and what it makes waits here.</p>
            ) : (
              <ul class="fg-orders" aria-label="The floors">
                {visit.anvils.map((anvil) => (
                  <li key={anvil.id}>
                    <button
                      type="button"
                      class="sp-line sp-pack"
                      aria-label={`${anvilName(visit, anvil)}: ${floorLine(anvil)}. Show the floor and what this anvil brings`}
                      onClick={(event) => {
                        setRight({
                          kind: 'anvil',
                          anvilId: anvil.id,
                          start: 'floor',
                          from: openerOf(event.currentTarget),
                        });
                      }}
                    >
                      <Bar
                        value={anvil.floor.count}
                        max={anvil.floor.cap}
                        label={anvilName(visit, anvil)}
                        class="sp-bar"
                      />
                      <span class="sp-pack-text">
                        {anvilName(visit, anvil)}: {floorLine(anvil)}
                      </span>
                    </button>
                  </li>
                ))}
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
            <div class="fc-hub">
              <CommonsFire visit={visit} start={start?.fire === true} />
              {commons !== undefined && (
                <CommonsBoard
                  place="forge"
                  visit={visit}
                  creatures={creatures}
                  acorns={acorns}
                  busy={busy}
                  actions={commons}
                  dropId={COMMUNAL_DROP}
                  over={drag.drag?.over === COMMUNAL_DROP}
                  {...(start?.commons === undefined ? {} : { start: start.commons })}
                />
              )}
            </div>
          </PanelBody>
        ),
      };
    }
  }

  const openLeft = (kind: Left['kind']) => (opener: Opener) => {
    setLeft({ kind, from: opener });
  };

  // --- The scene ---

  const open: InsideOpen = {
    anvilId:
      right?.kind === 'anvil'
        ? right.anvilId
        : right?.kind === 'order'
          ? right.open.kind === 'add'
            ? right.open.anvilId
            : anvilOfOrder(visit, right.open.orderId)
          : null,
    buy: right?.kind === 'buy',
    left: left?.kind ?? null,
  };

  const scene = inside ? (
    <SceneFrame
      key="inside"
      id="forge"
      label="Forge, inside"
      draw={drawInside}
      onLeave={closeTop}
      scaleFor={interiorScale}
    >
      {(measured) => {
        // A scene not measured yet (no size) is laid out as a phone's, so the targets are there from the first draw.
        const g =
          measured.W > 0 && measured.H > 0
            ? measured
            : sceneGeometry(390, 640, interiorScale(390, 640));
        return (
          <ForgeInside
            g={g}
            visit={visit}
            creatureOf={creatureOf}
            busy={busy}
            marketBuilt={marketBuilt}
            slots={slots}
            waiting={waiting}
            bagFull={props.bagFull}
            bagAttention={props.bagAttention}
            open={open}
            overSeat={drag.drag?.over ?? null}
            onAnvil={(anvilId, hasSmith, opener) => {
              setRight({
                kind: 'anvil',
                anvilId,
                start: hasSmith ? 'hub' : 'smith',
                from: opener,
              });
            }}
            onBuy={(opener) => {
              setRight({ kind: 'buy', from: opener });
            }}
            onLeft={(kind, opener) => {
              openLeft(kind)(opener);
            }}
            onOut={goOutside}
          />
        );
      }}
    </SceneFrame>
  ) : (
    <SceneFrame
      key="outside"
      id="forge"
      label="Forge, Workshop"
      draw={drawOutside}
      onLeave={closeTop}
      scaleFor={forgeScale}
    >
      {(measured) => {
        const g =
          measured.W > 0 && measured.H > 0
            ? measured
            : sceneGeometry(390, 640, forgeScale(390, 640));
        return (
          <ForgeOutside
            g={g}
            helper={helper}
            waiting={waiting}
            bagAttention={props.bagFull || props.bagAttention}
            boardOpen={left?.kind === 'board'}
            boardKnown={commonsView !== null}
            onEnter={() => {
              setInside(true);
            }}
            onBoard={openLeft('board')}
          />
        );
      }}
    </SceneFrame>
  );

  return (
    <div
      class="fc-root"
      ref={rootRef}
      data-carrying={drag.drag === null ? undefined : 'yes'}
      data-over={drag.drag?.over ?? undefined}
    >
      <PlaceCanvas
        label="Forge"
        scene={scene}
        left={leftPanel}
        right={rightPanel}
        below={
          <>
            <div class="fc-shelf">
              <Shelf visit={visit} />
            </div>
            <Tray
              creatures={ordered}
              input={trayInput}
              label="Creatures to post"
              onPick={props.onOpenPaddock}
              drag={drag}
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
