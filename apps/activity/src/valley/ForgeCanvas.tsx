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
import { cssVars } from '../css-vars';
import { dropOutcome } from '../slot-outcome';
import { TOUCH_HOLD_MS } from '../dnd-core';
import { useDragDrop } from '../use-drag-drop';
import { Bar } from '../ui/Bar';
import { PriceLine } from '../ui/CountBadge';
import { DragGhost } from '../ui/DragGhost';
import { Nameplate } from '../ui/Nameplate';
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
import { CanvasTarget, PanelBody, PlaceCanvas, type CanvasPanel } from './PlaceCanvas';
import { SceneFrame } from './SceneFrame';
import { At, CreatureSprite, Pic, SpeechBubble } from './parts';
import { Tray } from './Tray';
import { trayFor, type TrayInput } from './tray-state';
import { seatAt } from './seat-parts';
import { commonsOf, percentFilled, placeOf } from './commons-view';
import { scaffoldSteps } from './scaffold';
import { ANVIL_PROP } from './forge-props';
import {
  PROP,
  PROP_HIT,
  anvilGlyph,
  anvilLabel,
  floorTotal,
  forgeScale,
  forgeSceneDraw,
  yardLayout,
} from './forge-canvas';
import { anvilName, anvilPrice, floorLine } from './forge-view';

/** The right drawer: the one thing that was clicked. */
type Right =
  | { kind: 'anvil'; anvilId: string; start: AnvilStep; from: HTMLElement | null }
  | { kind: 'buy'; from: HTMLElement | null }
  | {
      kind: 'order';
      open: OrderOpen & { baseId?: string };
      /** The anvil whose wizard the order was opened from; Back leaves for it (null: the order leaves for the scene). */
      back: string | null;
      from: HTMLElement | null;
    };

/** The left drawer: a collection or an overview. */
type Left = { kind: 'bag' | 'floor' | 'plans' | 'board'; from: HTMLElement | null };

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
  const scaffold = forgePlace?.state === 'open' ? scaffoldSteps(percentFilled(forgePlace) / 100) : 0;
  const draw = useMemo(() => forgeSceneDraw(owned, scaffold, slots), [owned, scaffold, slots]);
  const marketBuilt = visit.market?.open === true;
  const helperId = commonsView?.communal.find((c) => c.place === 'forge')?.creatureId ?? null;
  const helper = creatureOf(helperId);
  const waiting = floorTotal(visit.anvils);

  const closeTop = (): void => {
    if (right !== null) setRight(null);
    else if (left !== null) setLeft(null);
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
        setRight(
          back === null ? null : { kind: 'anvil', anvilId: back, start: 'hub', from },
        );
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
                visit.anvils.find((a) => a.orders.length < visit.forge.queueMax) ??
                visit.anvils[0];
              if (room === undefined) return;
              setRight({
                kind: 'order',
                open: { kind: 'add', anvilId: room.id, baseId, opener },
                back: null,
                from: opener,
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
                          from: event.currentTarget,
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

  const openLeft = (kind: Left['kind']) => (opener: HTMLElement) => {
    setLeft({ kind, from: opener });
  };

  // --- The scene ---

  const scene = (
    <SceneFrame
      id="forge"
      label="Forge, Workshop"
      draw={draw}
      onLeave={closeTop}
      scaleFor={forgeScale}
    >
      {(g) => {
        // A scene not measured yet (width 0) draws nothing to click.
        if (g.W <= 0 || g.H <= 0) return null;
        const lay = yardLayout(g, slots);
        const plate = (x: number, y: number, text: string): ComponentChildren => (
          <At x={g.X(x)} y={g.Y(y)} class="vy-feet-plate">
            <Nameplate size="sm">{text}</Nameplate>
          </At>
        );
        const propBox = (p: { x: number; y: number }): { x: number; y: number } => ({
          x: p.x - (PROP_HIT - PROP) / 2,
          y: p.y - (PROP_HIT - PROP) / 2,
        });
        return (
          <>
            {helper !== undefined && (
              <At
                x={g.X(lay.art.x + Math.floor(lay.art.width / 2) - 26)}
                y={g.Y(lay.art.y + lay.art.height - 20)}
                class="vy-stand"
              >
                <CreatureSprite creature={helper} scale={g.s} />
              </At>
            )}
            {visit.anvils.map((anvil, i) => {
              const cell = lay.cells[i];
              const smith = creatureOf(anvil.creatureId);
              const glyph = anvilGlyph(anvil);
              if (cell === undefined || smith === undefined) return null;
              return (
                <span key={anvil.id}>
                  <At x={g.X(cell.smith.x)} y={g.Y(cell.smith.y)} class="vy-stand">
                    <CreatureSprite creature={smith} scale={g.s} flip={i % 2 === 1} />
                  </At>
                  {glyph !== null && (
                    <At x={g.X(cell.smith.x)} y={g.Y(cell.smith.y)} class="vy-over">
                      <span
                        class="vy-region-box"
                        ref={cssVars({ '--pw': `${String(PROP * g.s)}px`, '--ph': '0px' })}
                      />
                      <SpeechBubble glyph={glyph} count={null} />
                    </At>
                  )}
                  {plate(cell.x + cell.w / 2, cell.anvil.y + PROP, creatureName(smith))}
                </span>
              );
            })}
            {waiting > 0 && (
              <At x={g.X(lay.crate.x)} y={g.Y(lay.crate.y)} class="vy-over">
                <span
                  class="vy-region-box"
                  ref={cssVars({ '--pw': `${String(PROP * g.s)}px`, '--ph': '0px' })}
                />
                <SpeechBubble glyph="gift" count={waiting} />
              </At>
            )}
            {(props.bagFull || props.bagAttention) && (
              <At x={g.X(lay.chest.x)} y={g.Y(lay.chest.y)} class="vy-over">
                <span
                  class="vy-region-box"
                  ref={cssVars({ '--pw': `${String(PROP * g.s)}px`, '--ph': '0px' })}
                />
                <SpeechBubble glyph="warning" count={null} />
              </At>
            )}
            {plate(lay.plans.x + PROP / 2, lay.plans.y + PROP + 2, 'Plans')}
            {plate(lay.chest.x + PROP / 2, lay.chest.y + PROP + 2, 'Bag')}
            {plate(lay.crate.x + PROP / 2, lay.crate.y + PROP + 2, 'Floor')}

            {/* The targets, over everything above: each a real button. */}
            {commonsView !== null && (
              <CanvasTarget
                g={g}
                x={lay.art.x}
                y={lay.art.y}
                w={lay.art.width}
                h={lay.art.height - 8}
                label="The forge: the fire and the project board. Open"
                expanded={left?.kind === 'board'}
                onClick={openLeft('board')}
              />
            )}
            {visit.anvils.map((anvil, i) => {
              const cell = lay.cells[i];
              if (cell === undefined) return null;
              const smith = creatureOf(anvil.creatureId);
              const name = anvilName(visit, anvil);
              return (
                <CanvasTarget
                  key={anvil.id}
                  g={g}
                  x={cell.x}
                  y={cell.y}
                  w={cell.w}
                  h={cell.h}
                  seat={anvil.id}
                  over={drag.drag?.over === anvil.id}
                  label={anvilLabel(
                    name,
                    smith === undefined
                      ? undefined
                      : { name: creatureName(smith), level: smith.level },
                    anvil,
                    marketBuilt,
                  )}
                  expanded={
                    (right?.kind === 'anvil' && right.anvilId === anvil.id) ||
                    (right?.kind === 'order' &&
                      (right.open.kind === 'add'
                        ? right.open.anvilId
                        : anvilOfOrder(visit, right.open.orderId)) === anvil.id)
                  }
                  disabled={busy}
                  onClick={(opener) => {
                    setRight({
                      kind: 'anvil',
                      anvilId: anvil.id,
                      start: smith === undefined ? 'smith' : 'hub',
                      from: opener,
                    });
                  }}
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
                label="A new anvil. Buy it"
                expanded={right?.kind === 'buy'}
                disabled={busy}
                onClick={(opener) => {
                  setRight({ kind: 'buy', from: opener });
                }}
              >
                <span class="cv-ghost" aria-hidden="true">
                  <Pic sprite={ANVIL_PROP} scale={g.s} />
                </span>
                <span class="cv-price">
                  <PriceLine price={anvilPrice(nextPrice)} />
                </span>
              </CanvasTarget>
            )}
            <CanvasTarget
              g={g}
              {...propBox(lay.plans)}
              w={PROP_HIT}
              h={PROP_HIT}
              label="The plans: the blueprints you know. Open"
              expanded={left?.kind === 'plans'}
              onClick={openLeft('plans')}
            />
            <CanvasTarget
              g={g}
              {...propBox(lay.chest)}
              w={PROP_HIT}
              h={PROP_HIT}
              label={`The bag${props.bagFull ? ', full' : ''}. Open`}
              expanded={left?.kind === 'bag'}
              onClick={openLeft('bag')}
            />
            <CanvasTarget
              g={g}
              {...propBox(lay.crate)}
              w={PROP_HIT}
              h={PROP_HIT}
              label={`The floor: ${waiting === 0 ? 'nothing waiting' : `${String(waiting)} pieces waiting`}. Open`}
              expanded={left?.kind === 'floor'}
              onClick={openLeft('floor')}
            />
          </>
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
