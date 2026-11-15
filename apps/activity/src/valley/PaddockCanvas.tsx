/**
 * The Paddock as a canvas (the rule is "A place is a canvas" in `ux-patterns.md`): the yard fills the view, the creatures at home roam in
 * it and everything is done by clicking something in it. Nothing scrolls. The place opens straight on this scene; the HUD's back leaves
 * for the valley.
 *
 * - A roaming creature is a tap with its plate (level and name): it opens in the right drawer (`CreatureHub`: where it is, help build, and
 *   "Open its page", the Creatures page's page as the next step). A hand still picks it up and puts it down anywhere in the yard (a drag
 *   never opens a drawer).
 * - The gate is a tap while newcomers wait (they stand at it, at most two drawn): the right drawer holds the waiting catches, keep or
 *   release (`GatePanel`; the gate's auto-answer line is on each card).
 * - "Creatures" under the meadow (or "+N more" when not all fit) opens the left drawer with the whole Creatures page (`Collection`: find,
 *   filter, cards, pages). The waiting catches are not repeated there: they are at the gate.
 * - The project lives in the builders' corner (`builders-corner.ts`), only while one is being built: its table opens the board (left drawer),
 *   its helper seat picks who helps build (right drawer, the Bonfire's `HelperPanel`). A helper posted at the Paddock hammers there.
 *
 * What a click opens follows the side rule (`PlaceCanvas`): the right drawer is for the one thing clicked, the left for collections. A
 * phone shows the open panel as its own page. The scene keeps one size and place for the whole visit; drawers lie over its edges.
 */
import type { ComponentProps } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Creature, ValleyVisit } from '../api';
import { Collection } from '../Collection';
import { creatureName } from '../game';
import { usePrefersReducedMotion } from '../hooks';
import type { PendingCatch } from '../talent-types';
import { HelperPanel, type HelperPost } from './BonfirePanels';
import { CommonsBoard, type CommonsActions, type CommonsStart } from './CommonsBoard';
import { CreatureHub, CreatureStep, GatePanel } from './PaddockPanels';
import { CanvasTarget, PanelBody, PlaceCanvas, type CanvasPanel, type Opener } from './PlaceCanvas';
import { Draggable, PLATES_Z } from './PlaceScene';
import { SceneFrame, sceneGeometry, type SceneGeometry } from './SceneFrame';
import { At, CreatureSprite, Pic, isStill, useTick } from './parts';
import { moreLabel } from './bonfire-cast';
import { FLAG_AT, HELPER_AT, TABLE_BOX, pileMaterial, pileSize } from './builders-corner';
import { cornerSprite } from './builders-corner-art';
import { commonsOf, percentFilled, placeOf } from './commons-view';
import {
  creaturesSpot,
  gateSpots,
  gateTarget,
  meadowAt,
  paddockLayout,
  paddockSceneDraw,
  paddockScale,
  roamersOf,
  whereLine,
} from './paddock-canvas';
import { CREATURE_PX } from './place-cast';
import { plateGap, roamMeadow, standBounds } from './place-plates';
import { scaffoldSteps } from './scaffold';
import { useRoamers } from './use-roamers';
import { depthOf } from './valley-logic';
import type { Rect } from './valley-art';

/** A creature held by a hand: above every creature, below the nameplates. */
const LIFTED_Z = PLATES_Z - 1;
/** Roamers step 8 times a second. */
const TICK_MS = 125;

/** The right drawer: the one thing that was clicked. */
type Right =
  | { kind: 'creature'; id: string; step: 'hub' | 'page'; from: Opener | null }
  | { kind: 'gate'; from: Opener | null }
  | { kind: 'helper'; from: Opener | null };

/** The left drawer: a collection. */
type Left = { kind: 'board' | 'creatures'; from: Opener | null };

/** What the canvas can open at the start (the workbench and the tests show each). */
export type PaddockStart = CommonsStart & {
  sheet?: boolean;
  creatures?: boolean;
  helper?: boolean;
  gate?: boolean;
  /** A creature's drawer, and the step it opens on. */
  creature?: string;
  page?: boolean;
};

export interface PaddockCanvasProps {
  /** What the Creatures page reads and does (the left drawer is that page): the game's state, gear, actions and the popover's "View". */
  collection: ComponentProps<typeof Collection>;
  visit: ValleyVisit;
  /** The Paddock's project board and communal seat; absent leaves the yard with no project. */
  commons?: CommonsActions | undefined;
  acorns?: number;
  /** Who sits at the School's bench (they are not in the yard). */
  studying?: ReadonlySet<string>;
  start?: PaddockStart;
}

export function PaddockCanvas({
  collection,
  visit,
  commons,
  acorns = 0,
  studying = new Set<string>(),
  start = {},
}: PaddockCanvasProps) {
  const { state, gear, busy } = collection;
  const creatures = state.creatures;
  const [right, setRight] = useState<Right | null>(() =>
    start.creature !== undefined
      ? {
          kind: 'creature',
          id: start.creature,
          step: start.page === true ? 'page' : 'hub',
          from: null,
        }
      : start.gate === true
        ? { kind: 'gate', from: null }
        : start.helper === true
          ? { kind: 'helper', from: null }
          : null,
  );
  const [left, setLeft] = useState<Left | null>(() =>
    start.sheet === true || start.view !== undefined
      ? { kind: 'board', from: null }
      : start.creatures === true
        ? { kind: 'creatures', from: null }
        : null,
  );

  // The popover's "View" (a creature in another scene): that creature's page, in the right drawer.
  const request = collection.openRequest ?? null;
  const handled = collection.onOpenHandled;
  useEffect(() => {
    if (request === null) return;
    if (creatures.some((c) => c.id === request)) {
      setRight({ kind: 'creature', id: request, step: 'page', from: null });
    }
    handled?.();
  }, [request]);

  const block = commonsOf(visit);
  const place = placeOf(block, 'paddock');
  const helperId = block?.communal.find((c) => c.place === 'paddock')?.creatureId ?? null;
  const helper = helperId === null ? undefined : creatures.find((c) => c.id === helperId);
  const roamers = useMemo(
    () => roamersOf(creatures, visit, helperId, studying),
    [creatures, visit, helperId, studying],
  );
  const waiting = state.pending;
  const steps =
    place?.state === 'open' && place.level < place.max
      ? scaffoldSteps(percentFilled(place) / 100)
      : 0;
  const post: HelperPost | undefined =
    commons === undefined || place === undefined
      ? undefined
      : { creatureId: helper?.id ?? null, actions: commons };
  // The builders' corner stands while a project is being built (open for gifts, or building its three days) below the top level,
  // and while a helper is posted whatever the level, so that helper is never out of sight.
  const building =
    place !== undefined &&
    (((place.state === 'open' || place.state === 'building') && place.level < place.max) ||
      helperId !== null);
  const corner = post !== undefined && building;
  const material = pileMaterial(place?.level ?? 1);
  const size = pileSize(place === undefined ? 0 : percentFilled(place));
  const draw = useMemo(
    () => paddockSceneDraw(steps, corner ? { material, size } : null),
    [steps, corner, material, size],
  );

  const closeTop = (): void => {
    if (right !== null) setRight(null);
    else if (left !== null) setLeft(null);
  };
  const openGate = (): void => {
    setRight({ kind: 'gate', from: null });
  };

  // --- The drawers' panels ---

  let rightPanel: CanvasPanel | null = null;
  const closeRight = (): void => {
    setRight(null);
  };
  if (right?.kind === 'creature') {
    const one = creatures.find((c) => c.id === right.id);
    if (one !== undefined) {
      const hub = right.step === 'hub';
      rightPanel = {
        title: creatureName(one),
        // The page's own head has the Back (to the hub); the hub's first step has none but the X.
        wizard: !hub,
        returnFocusTo: right.from,
        backLabel: 'to the yard',
        onClose: closeRight,
        children: hub ? (
          <CreatureHub
            key={`hub-${right.id}`}
            creature={one}
            where={whereLine(one, visit, studying)}
            helper={post}
            busy={busy}
            onPage={() => {
              setRight({ ...right, step: 'page' });
            }}
            onClose={closeRight}
          />
        ) : (
          <CreatureStep
            key={`page-${right.id}`}
            creature={one}
            state={state}
            gear={gear}
            busy={busy}
            actions={collection}
            loadGames={collection.loadGames}
            onBack={() => {
              setRight({ ...right, step: 'hub' });
            }}
            onAnswerCatch={openGate}
          />
        ),
      };
    }
  } else if (right?.kind === 'gate') {
    rightPanel = {
      title: 'The gate',
      returnFocusTo: right.from,
      backLabel: 'to the yard',
      onClose: closeRight,
      children: <GatePanel state={state} busy={busy} actions={collection.catchActions} />,
    };
  } else if (right?.kind === 'helper' && post !== undefined) {
    rightPanel = {
      title: 'The Paddock',
      wizard: true,
      returnFocusTo: right.from,
      onClose: closeRight,
      children: (
        <HelperPanel
          visit={visit}
          creatures={creatures}
          helper={post}
          onClose={closeRight}
          place="paddock"
          title="Who helps build the Paddock?"
          backLabel="to the yard"
        />
      ),
    };
  }

  let leftPanel: CanvasPanel | null = null;
  if (left !== null) {
    const base = {
      returnFocusTo: left.from,
      onClose: () => {
        setLeft(null);
      },
    };
    if (left.kind === 'board') {
      leftPanel = {
        ...base,
        title: 'Project board',
        children: (
          <PanelBody>
            <div class="fc-hub">
              {commons !== undefined && (
                <CommonsBoard
                  place="paddock"
                  host="panel"
                  visit={visit}
                  creatures={creatures}
                  acorns={acorns}
                  busy={busy}
                  actions={commons}
                  {...(start.view === undefined
                    ? {}
                    : {
                        start: {
                          view: start.view,
                          ...(start.row === undefined ? {} : { row: start.row }),
                        },
                      })}
                />
              )}
            </div>
          </PanelBody>
        ),
      };
    } else {
      leftPanel = {
        ...base,
        title: 'Creatures',
        children: (
          <PanelBody>
            <Collection
              {...collection}
              openRequest={null}
              onOpenHandled={undefined}
              catchesElsewhere={openGate}
            />
          </PanelBody>
        ),
      };
    }
  }

  // --- The scene ---

  const scene = (
    <SceneFrame
      key="yard"
      id="paddock"
      label="Paddock"
      draw={draw}
      onLeave={closeTop}
      scaleFor={(width, height) => paddockScale(width, height, corner)}
    >
      {(measured) => {
        // A scene not measured yet (no size) is laid out as a phone's, so the targets are there from the first draw.
        const g =
          measured.W > 0 && measured.H > 0
            ? measured
            : sceneGeometry(390, 640, paddockScale(390, 640, corner));
        const lay = paddockLayout(g, corner);
        return (
          <PaddockInside
            key={`${String(g.W)}-${String(g.H)}-${String(g.s)}`}
            g={g}
            box={lay.box}
            roamers={roamers}
            waiting={waiting}
            helper={helper}
            corner={lay.corner}
            open={{
              board: left?.kind === 'board',
              creatures: left?.kind === 'creatures',
              creatureId: right?.kind === 'creature' ? right.id : null,
              gate: right?.kind === 'gate',
              helper: right?.kind === 'helper',
            }}
            hearthOpen={place?.state === 'open'}
            busy={busy}
            onCreature={(id, opener) => {
              setRight({ kind: 'creature', id, step: 'hub', from: opener });
            }}
            onGate={(opener) => {
              setRight({ kind: 'gate', from: opener });
            }}
            onHelper={(opener) => {
              setRight({ kind: 'helper', from: opener });
            }}
            onBoard={(opener) => {
              setLeft({ kind: 'board', from: opener });
            }}
            onCreatures={(opener) => {
              setLeft({ kind: 'creatures', from: opener });
            }}
          />
        );
      }}
    </SceneFrame>
  );

  return (
    <div class="pk-root">
      <PlaceCanvas label="Paddock" scene={scene} left={leftPanel} right={rightPanel} />
      {roamers.length === 0 && waiting.length === 0 && (
        <p class="visually-hidden" role="status">
          Nobody is home
        </p>
      )}
    </div>
  );
}

/** What stands in the scene over its canvas: the roamers, the gate, the corner and the "Creatures" button, each tap a `CanvasTarget`. */
function PaddockInside({
  g,
  box,
  roamers,
  waiting,
  helper,
  corner,
  open,
  hearthOpen,
  busy,
  onCreature,
  onGate,
  onHelper,
  onBoard,
  onCreatures,
}: {
  g: SceneGeometry;
  box: { x: number; y: number; width: number; height: number };
  roamers: readonly Creature[];
  waiting: readonly PendingCatch[];
  helper: Creature | undefined;
  /** The builders' corner's top-left (scene pixels), or null when the Paddock has no project being built. */
  corner: { x: number; y: number } | null;
  open: {
    board: boolean;
    creatures: boolean;
    creatureId: string | null;
    gate: boolean;
    helper: boolean;
  };
  hearthOpen: boolean;
  busy: boolean;
  onCreature: (id: string, opener: Opener) => void;
  onGate: (opener: Opener) => void;
  onHelper: (opener: Opener) => void;
  onBoard: (opener: Opener) => void;
  onCreatures: (opener: Opener) => void;
}) {
  const seat = corner === null ? null : { x: corner.x + HELPER_AT.x, y: corner.y + HELPER_AT.y };
  const scene = { W: g.W, H: g.H, s: g.s, top: g.top };
  const bounds = standBounds(scene);
  // The meadow stops a sprite short of the gate, where the newcomers wait.
  const gates = gateSpots(waiting.length);
  const first = gates[0];
  const stop = first === undefined ? Infinity : box.x + first.x - CREATURE_PX;
  const limited = { ...bounds, width: Math.max(1, Math.min(bounds.width, stop - bounds.x + 1)) };
  const { area, fit } = roamMeadow(meadowAt(box), roamers.length, limited, plateGap(g.s));
  const shown = roamers.slice(0, Math.min(roamers.length, fit));
  const more = roamers.length - shown.length;
  const spot = creaturesSpot(box, g.s);
  const gate = gateTarget();
  return (
    <>
      <Yard
        g={g}
        creatures={shown}
        area={area}
        dragArea={bounds}
        openId={open.creatureId}
        onCreature={onCreature}
      />
      {/* The newcomers at the gate, then the gate's tap over them. */}
      {gates.map((n, i) => {
        const card = waiting[i];
        return card === undefined ? null : (
          <At
            key={card.id}
            x={g.X(box.x + n.x)}
            y={g.Y(box.y + n.y)}
            class="vy-stand"
            z={depthOf(box.x + n.x, box.y + n.y)}
          >
            <CreatureSprite creature={card} scale={g.s} />
          </At>
        );
      })}
      {waiting.length > 0 && (
        <CanvasTarget
          g={g}
          x={box.x + gate.x}
          y={box.y + gate.y}
          w={gate.w}
          h={gate.h}
          z={PLATES_Z}
          label={`The gate, ${String(waiting.length)} ${waiting.length === 1 ? 'newcomer waits' : 'newcomers wait'}. Choose what to do`}
          plate={waiting.length === 1 ? 'Newcomer' : 'Newcomers'}
          plateAt={gate.h + 2}
          expanded={open.gate}
          onClick={onGate}
        />
      )}
      {/* The helper works at the table, facing it: the Forge's hammer-fall. */}
      {helper !== undefined && seat !== null && (
        <At x={g.X(seat.x)} y={g.Y(seat.y)} class="vy-stand" z={depthOf(seat.x, seat.y)}>
          <CreatureSprite creature={helper} scale={g.s} flip class="fi-hammer fi-d1" />
        </At>
      )}
      {/* The empty spot's flag: a piece of the scene's art, no tap of its own (the dashed outline over it is the target). */}
      {corner !== null && helper === undefined && (
        <At x={g.X(corner.x + FLAG_AT.x)} y={g.Y(corner.y + FLAG_AT.y)}>
          <Pic sprite={cornerSprite('help-flag')} scale={g.s} />
        </At>
      )}
      {corner !== null && (
        <CanvasTarget
          g={g}
          x={corner.x + TABLE_BOX.x}
          y={corner.y + TABLE_BOX.y}
          w={TABLE_BOX.w}
          h={TABLE_BOX.h}
          label={`The builders' table, ${hearthOpen ? "the Paddock's project is open" : 'the Paddock is being built'}. Open the project board`}
          plate="Project"
          plateAt={TABLE_BOX.h + 1}
          expanded={open.board}
          onClick={onBoard}
        />
      )}
      {seat !== null && (
        <CanvasTarget
          g={g}
          x={seat.x}
          y={seat.y}
          w={CREATURE_PX}
          h={CREATURE_PX}
          z={PLATES_Z + depthOf(seat.x, seat.y)}
          slot={helper === undefined}
          label={
            helper === undefined
              ? "The helper spot at the builders' table: nobody helps build. Choose a creature"
              : `${creatureName(helper)}, level ${String(helper.level)}, helping build the Paddock at the builders' table. Change`
          }
          plate={helper === undefined ? 'Helper' : creatureName(helper)}
          {...(helper === undefined ? {} : { plateMeta: { level: helper.level } })}
          plateAt={CREATURE_PX + 1}
          expanded={open.helper}
          disabled={busy}
          onClick={onHelper}
        />
      )}
      <CanvasTarget
        g={g}
        x={spot.x - 14}
        y={spot.y}
        w={28}
        h={Math.ceil(32 / g.s)}
        z={PLATES_Z}
        label={
          more > 0
            ? `${moreLabel(more)}: show all your creatures`
            : 'Creatures: find and open any of your creatures'
        }
        plate={more > 0 ? moreLabel(more) : 'Creatures'}
        plateAt={0}
        expanded={open.creatures}
        onClick={onCreatures}
      />
    </>
  );
}

/** The creatures at home roaming the meadow, each a draggable tap that opens its drawer (a drag swallows the click that ends it). */
function Yard({
  g,
  creatures,
  area,
  dragArea,
  openId,
  onCreature,
}: {
  g: SceneGeometry;
  creatures: readonly Creature[];
  area: Rect;
  /** Where a hand may put a creature down: the whole scene, not only the meadow it wanders. */
  dragArea: Rect;
  openId: string | null;
  onCreature: (id: string, opener: Opener) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const moving = !reduced && !isStill();
  const tick = useTick(TICK_MS, moving);
  const [held, setHeld] = useState<{ id: string; x: number; y: number } | null>(null);
  const people = useRoamers(creatures, tick, moving, area, plateGap(g.s), held);
  return (
    <>
      {people.map((p) => (
        <At
          key={p.key}
          x={g.X(p.x)}
          y={g.Y(p.y)}
          class="vy-stand"
          z={held?.id === p.key ? LIFTED_Z : depthOf(p.x, p.y)}
        >
          <CreatureSprite creature={p.creature} scale={g.s} flip={p.flip} />
        </At>
      ))}
      {people.map((p) => (
        <Draggable
          key={p.key}
          x={p.x}
          y={p.y}
          g={g}
          hand={{
            area: dragArea,
            lifted: held?.id === p.key,
            onHold: (x, y) => {
              setHeld({ id: p.key, x, y });
            },
            onDrop: () => {
              setHeld(null);
            },
          }}
        >
          <CanvasTarget
            g={g}
            x={p.x}
            y={p.y}
            w={CREATURE_PX}
            h={CREATURE_PX}
            z={PLATES_Z + depthOf(p.x, p.y)}
            label={`${creatureName(p.creature)}, level ${String(p.creature.level)}, at home in the Paddock. Show this creature`}
            plate={creatureName(p.creature)}
            plateMeta={{ level: p.creature.level }}
            plateAt={CREATURE_PX + 1}
            expanded={openId === p.key}
            onClick={(opener) => {
              onCreature(p.key, opener);
            }}
          />
        </Draggable>
      ))}
    </>
  );
}
