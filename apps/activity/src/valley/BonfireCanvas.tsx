/**
 * The Bonfire as a canvas (the rule is "A place is a canvas" in `ux-patterns.md`): the fire in its meadow fills the view and everything
 * is done by clicking something in it. Nothing scrolls. The place opens straight on this scene (no page under it); the HUD's back
 * leaves for the valley.
 *
 * The fire's one idea is that creatures chill round it (Misa, 2026-11-15), as in the living room: the creatures resting round it are
 * the scene, each a tap with its plate (level, name and the experience it gained this visit; the tap opens that creature in the right
 * drawer); other players' creatures sit among them (a tap shows their owner's plate, as at the Forge), and "+N more" stands for the
 * resting creatures that did not get a seat (opens the left drawer with everyone resting).
 *
 * The hearth's project is somewhere else: the builders' corner (`builders-corner.ts`), clearly apart near the bottom of the screen and
 * there only while a project is being built. The table opens the project board (left drawer); the helper's seat beside it (a dashed
 * outline while empty) picks who helps build (right drawer), and its helper hammers there, not at the fire. With the hearth at its top
 * level the corner goes, the fire's area takes the space, and the fire itself opens the board.
 *
 * What a click opens follows the side rule (`PlaceCanvas`): the right drawer is for the one thing that was clicked (a creature, the
 * helper's seat), the left for the collections that belong to no one spot (the project board, everyone resting). A phone shows the open
 * panel as its own page. The scene keeps one size and place for the whole visit; drawers lie over its edges.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { clampToArea } from './creature-drag';
import type { Creature, GameState, ValleyVisit } from '../api';
import { creatureName } from '../game';
import { TOUCH_HOLD_MS } from '../dnd-core';
import { busyReason } from '../gear-view';
import { dropOutcome } from '../slot-outcome';
import { DragGhost } from '../ui/DragGhost';
import { useDragDrop } from '../use-drag-drop';
import { Nameplate } from '../ui/Nameplate';
import { CommonsBoard, type CommonsActions, type CommonsStart } from './CommonsBoard';
import { HelperPanel, RestingList, RestingPanel, type HelperPost } from './BonfirePanels';
import { NO_TAG_STATE } from './CreatureSummary';
import { CanvasTarget, PanelBody, PlaceCanvas, type CanvasPanel, type Opener } from './PlaceCanvas';
import { Draggable, PLATES_Z } from './PlaceScene';
import { seatAt } from './seat-parts';
import { Tray } from './Tray';
import { trayFor, type TrayInput } from './tray-state';
import { SceneFrame, sceneGeometry, type SceneGeometry } from './SceneFrame';
import { At, CreatureSprite, Pic } from './parts';
import {
  atTheFire,
  bonfireCalm,
  fireSpots,
  moreCount,
  moreLabel,
  moreSpot,
  restingOf,
  visitorsOf,
  type FireSpot,
} from './bonfire-cast';
import {
  bonfireLayout,
  bonfireScale,
  bonfireSceneDraw,
  fireTarget,
  groundArea,
  groundBlocks,
  resettlePlaced,
  settleOnGround,
} from './bonfire-canvas';
import {
  CORNER_GROUP,
  FLAG_AT,
  HELPER_AT,
  TABLE_BOX,
  pileMaterial,
  pileSize,
} from './builders-corner';
import { cornerSprite } from './builders-corner-art';
import { commonsOf, hearthLine, percentFilled, placeOf } from './commons-view';
import { CREATURE_PX } from './place-cast';
import { scaffoldSteps } from './scaffold';
import { depthOf } from './valley-logic';
import { WARMING_FLAME } from './valley-art';
import { GRAND_LEVEL, bonfireName } from './valley-places';
import type { Rect } from './valley-art';

/** The right drawer: the one thing that was clicked. */
type Right =
  { kind: 'resting'; id: string; from: Opener | null } | { kind: 'helper'; from: Opener | null };

/** The left drawer: a collection. */
type Left = { kind: 'board' | 'resting'; from: Opener | null };

/** A creature held by a hand: above every creature, below the nameplates. */
const LIFTED_Z = PLATES_Z - 1;

/** Where a hand put a resting creature down, in scene pixels from the fire art's top-left (display only, never sent to the server). */
type Placed = Readonly<Record<string, { x: number; y: number }>>;

/** The helper spot's drop id: a creature dropped on it (from the tray) is posted as the hearth's helper. */
export const HELPER_DROP = 'communal:bonfire';

export function BonfireCanvas({
  creatures,
  visit,
  trayInput,
  onOpenPaddock,
  level,
  commons,
  acorns = 0,
  busy = false,
  tagState = NO_TAG_STATE,
  start = {},
}: {
  creatures: readonly Creature[];
  visit: ValleyVisit;
  /** The creature tray under the scene (as at the Forge): what each creature is doing. */
  trayInput: TrayInput;
  /** A tap on a tray creature (as on the other places). */
  onOpenPaddock: () => void;
  /** The bonfire's place level (1 until the commons grow it). */
  level: number;
  /** The hearth's project board (the commons): its gifts and its helper seat; absent leaves the fire with no project. */
  commons?: CommonsActions | undefined;
  /** The player's Acorns (the `bait` balance). */
  acorns?: number;
  busy?: boolean;
  /** What a creature's tags read in its drawer (lounging, first on server); absent shows none of those. */
  tagState?: Pick<GameState, 'loungerId' | 'loungeXp' | 'serverFirsts'>;
  /** What is open at the start (the workbench and the tests show each). */
  start?: CommonsStart & { sheet?: boolean; resting?: boolean; helper?: boolean };
}) {
  const [right, setRight] = useState<Right | null>(() =>
    start.helper === true ? { kind: 'helper', from: null } : null,
  );
  const [left, setLeft] = useState<Left | null>(() =>
    start.sheet === true || start.view !== undefined
      ? { kind: 'board', from: null }
      : start.resting === true
        ? { kind: 'resting', from: null }
        : null,
  );
  const [peek, setPeek] = useState<string | null>(null);
  // Resting creatures a hand has moved: where each now stands, from the fire. Positions are display-only, as in the Paddock.
  const [placed, setPlaced] = useState<Placed>({});

  const art = bonfireName(level);
  const grand = level >= GRAND_LEVEL;
  const resting = useMemo(() => restingOf(creatures, visit), [creatures, visit]);
  const visitors = useMemo(() => visitorsOf(visit), [visit]);
  const fireside = useMemo(
    () => atTheFire(resting, visitors, visit.settledAt),
    [resting, visitors, visit],
  );
  // A creature that left the fire forgets where a hand put it (it takes a seat again when it comes back).
  const firesideKey = fireside.map((r) => r.creature.id).join(',');
  useEffect(() => {
    const here = new Set(firesideKey.split(','));
    setPlaced((was) => {
      const kept = Object.entries(was).filter(([id]) => here.has(id));
      return kept.length === Object.keys(was).length ? was : Object.fromEntries(kept);
    });
  }, [firesideKey]);
  const block = commonsOf(visit);
  const place = placeOf(block, 'bonfire');
  const hearth = block === null ? null : hearthLine(block.hearthBp);
  const calm = bonfireCalm(resting);
  // The scaffolding rises round the fire as the project fills (V-COM-6); at the top level the fire is finished.
  const steps =
    place?.state === 'open' && place.level < place.max
      ? scaffoldSteps(percentFilled(place) / 100)
      : 0;
  const helperId = block?.communal.find((c) => c.place === 'bonfire')?.creatureId ?? null;
  const helper = helperId === null ? undefined : creatures.find((c) => c.id === helperId);
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
  // The pile of materials in the corner grows with the project (small, medium, large) and changes with the level's material.
  const material = pileMaterial(place?.level ?? 1);
  const size = pileSize(place === undefined ? 0 : percentFilled(place));
  const draw = useMemo(
    () => bonfireSceneDraw(art, steps, corner ? { material, size } : null),
    [art, steps, corner, material, size],
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  // A creature of the tray dragged onto the helper spot is posted as the hearth's helper; a drag never opens a drawer.
  const drag = useDragDrop<string>({
    disabled: busy,
    stripRef: rootRef,
    touchHoldMs: TOUCH_HOLD_MS,
    locate: (p) => seatAt(p.x, p.y),
    onDrop: (creatureId, dropId) => {
      if (dropId === null) return dropOutcome('none', null, null, 'Cancelled.');
      if (dropId === HELPER_DROP && commons !== undefined && creatureId !== helperId) {
        void commons.post('bonfire', creatureId);
        return dropOutcome('valid', null, null, '');
      }
      return dropOutcome('none', null, null, '');
    },
  });
  const carried = creatures.find((c) => c.id === drag.drag?.creatureId);
  const ordered = trayFor(
    creatures.filter((c) => busyReason(c) === null),
    trayInput,
  );

  const closeTop = (): void => {
    if (right !== null) setRight(null);
    else if (left !== null) setLeft(null);
  };

  // --- The drawers' panels ---

  let rightPanel: CanvasPanel | null = null;
  if (right?.kind === 'resting') {
    const one = resting.find((r) => r.creature.id === right.id);
    const whole = creatures.find((c) => c.id === right.id);
    if (one !== undefined && whole !== undefined) {
      rightPanel = {
        title: creatureName(one.creature),
        returnFocusTo: right.from,
        backLabel: 'to the fire',
        onClose: () => {
          setRight(null);
        },
        children: (
          <RestingPanel
            key={right.id}
            resting={one}
            creature={whole}
            tagState={tagState}
            helper={post}
            busy={busy}
            onClose={() => {
              setRight(null);
            }}
          />
        ),
      };
    }
  } else if (right?.kind === 'helper' && post !== undefined) {
    rightPanel = {
      title: 'The hearth',
      wizard: true,
      returnFocusTo: right.from,
      onClose: () => {
        setRight(null);
      },
      children: (
        <HelperPanel
          visit={visit}
          creatures={creatures}
          helper={post}
          onClose={() => {
            setRight(null);
          }}
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
              {hearth !== null && <p class="sp-note">{hearth}</p>}
              {commons !== undefined && (
                <CommonsBoard
                  place="bonfire"
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
        title: 'Resting by the fire',
        children: (
          <RestingList
            resting={resting}
            onPick={(id) => {
              setRight({ kind: 'resting', id, from: null });
            }}
          />
        ),
      };
    }
  }

  // --- The scene ---

  const scene = (
    <SceneFrame
      key="fire"
      id="bonfire"
      label="Bonfire"
      draw={draw}
      onLeave={closeTop}
      scaleFor={(width, height) => bonfireScale(width, height, grand, corner)}
    >
      {(measured) => {
        // A scene not measured yet (no size) is laid out as a phone's, so the targets are there from the first draw.
        const g =
          measured.W > 0 && measured.H > 0
            ? measured
            : sceneGeometry(390, 640, bonfireScale(390, 640, grand, corner));
        const lay = bonfireLayout(g, grand, corner);
        const box = lay.box;
        const spots = fireSpots(fireside, box, g, { grand });
        // "+N more" counts the player's own resting creatures that did not get a seat (a visitor's seat is not one of them). The scene
        // keeps room for its button under the front seat (`bonfireScale`), so it is never cut off at the bottom.
        const more = moreCount(resting.length, spots.filter((s) => s.owner === undefined).length);
        const moreAt = moreSpot(box, g.s, grand);
        const fire = fireTarget(grand);
        return (
          <BonfireInside
            g={g}
            art={box}
            spots={spots}
            helper={helper}
            corner={lay.corner}
            fire={corner ? null : { x: box.x + fire.x, y: box.y + fire.y, w: fire.w, h: fire.h }}
            more={more}
            moreAt={moreAt}
            dragOver={drag.drag?.over === HELPER_DROP}
            ground={{
              area: groundArea(g, box),
              blocks: groundBlocks(g, lay, grand),
              placed,
              onPlace: (id, at) => {
                setPlaced((was) => ({ ...was, [id]: at }));
              },
            }}
            open={{
              board: left?.kind === 'board',
              resting: left?.kind === 'resting',
              restingId: right?.kind === 'resting' ? right.id : null,
              helper: right?.kind === 'helper',
            }}
            hearthOpen={place?.state === 'open'}
            peek={peek}
            busy={busy}
            onPeek={setPeek}
            onCreature={(id, opener) => {
              setRight({ kind: 'resting', id, from: opener });
            }}
            onHelper={(opener) => {
              setRight({ kind: 'helper', from: opener });
            }}
            onFire={(opener) => {
              setLeft({ kind: 'board', from: opener });
            }}
            onMore={(opener) => {
              setLeft({ kind: 'resting', from: opener });
            }}
          />
        );
      }}
    </SceneFrame>
  );

  return (
    <div
      class="bc-root"
      ref={rootRef}
      data-carrying={drag.drag === null ? undefined : 'yes'}
      data-over={drag.drag?.over ?? undefined}
    >
      <PlaceCanvas
        label="Bonfire"
        scene={scene}
        left={leftPanel}
        right={rightPanel}
        below={
          <Tray
            creatures={ordered}
            input={trayInput}
            label="Creatures to post"
            onPick={onOpenPaddock}
            drag={drag}
          />
        }
      />
      {calm !== '' && (
        <p class="visually-hidden" role="status">
          {calm}
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

/** What stands in the scene over its canvas: the creatures, the corner, the fire and "+N more", each real button a `CanvasTarget`. */
function BonfireInside({
  g,
  art,
  spots,
  helper,
  corner,
  fire,
  more,
  moreAt,
  open,
  dragOver,
  ground,
  hearthOpen,
  peek,
  busy,
  onPeek,
  onCreature,
  onHelper,
  onFire,
  onMore,
}: {
  g: SceneGeometry;
  /** The fire's art box (scene pixels): resting creatures face it. */
  art: { x: number; y: number; width: number };
  spots: readonly FireSpot[];
  helper: Creature | undefined;
  /** The builders' corner's top-left (scene pixels), or null when the hearth has no project being built. */
  corner: { x: number; y: number } | null;
  /** The fire's own target: only when there is no corner (its table opens the board then). */
  fire: { x: number; y: number; w: number; h: number } | null;
  more: number;
  moreAt: { x: number; y: number };
  open: { board: boolean; resting: boolean; restingId: string | null; helper: boolean };
  /** A tray creature is carried over the helper spot. */
  dragOver: boolean;
  /** What a hand moving a resting creature needs: the ground it may stand on, what it may not stand over, and where each one was put. */
  ground: {
    area: Rect;
    blocks: readonly Rect[];
    placed: Placed;
    onPlace: (id: string, at: { x: number; y: number }) => void;
  };
  hearthOpen: boolean;
  peek: string | null;
  busy: boolean;
  onPeek: (id: string | null) => void;
  onCreature: (id: string, opener: Opener) => void;
  onHelper: (opener: Opener) => void;
  onFire: (opener: Opener) => void;
  onMore: (opener: Opener) => void;
}) {
  const seat = corner === null ? null : { x: corner.x + HELPER_AT.x, y: corner.y + HELPER_AT.y };
  const [held, setHeld] = useState<{ id: string; x: number; y: number } | null>(null);
  const heldNow = useRef(held);
  heldNow.current = held;
  // Where each resting creature stands now: its seat, or where a hand put it (kept on the ground), or under the hand.
  const middle = art.x + art.width / 2;
  const placedAt = (id: string): { x: number; y: number } | undefined => {
    const mine = ground.placed[id];
    return mine === undefined
      ? undefined
      : clampToArea(ground.area, art.x + mine.x, art.y + mine.y);
  };
  // The seats may have turned over since a hand put a creature down: a seat that now lands on one is the one that stays, the placed
  // creature is settled to the nearest free spot (a held one is under the hand, not on the ground).
  const settled = resettlePlaced(
    spots.flatMap((spot) => {
      const at = placedAt(spot.creature.id);
      return at === undefined || held?.id === spot.creature.id
        ? []
        : [{ id: spot.creature.id, ...at }];
    }),
    spots.filter((spot) => ground.placed[spot.creature.id] === undefined),
    ground.area,
    ground.blocks,
    g.s,
  );
  const stands = spots.map((spot) => {
    const mine = ground.placed[spot.creature.id];
    const at =
      held?.id === spot.creature.id
        ? held
        : mine === undefined
          ? spot
          : (settled[spot.creature.id] ?? spot);
    // A creature moved by hand faces the fire from whichever side it stands.
    const flip =
      mine === undefined && held?.id !== spot.creature.id ? spot.flip : at.x + 8 > middle;
    return { ...spot, x: at.x, y: at.y, flip };
  });
  return (
    <>
      {/* The creatures, then the targets over them: a plate is the one cue that a thing can be clicked. */}
      {stands.map((spot) => (
        <At
          key={spot.creature.id}
          x={g.X(spot.x)}
          y={g.Y(spot.y)}
          class="vy-stand"
          z={held?.id === spot.creature.id ? LIFTED_Z : depthOf(spot.x, spot.y)}
        >
          <CreatureSprite
            creature={spot.creature}
            scale={g.s}
            flip={spot.flip}
            idle={spot.creature.id}
          />
          {spot.warm && (
            <span class="vy-flame" aria-hidden="true">
              <Pic sprite={WARMING_FLAME} scale={g.s} />
            </span>
          )}
        </At>
      ))}
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
      {fire !== null && (
        <CanvasTarget
          g={g}
          {...fire}
          label="The hearth. Open the hearth's page"
          plate="Hearth"
          plateAt={fire.h + 2}
          expanded={open.board}
          onClick={onFire}
        />
      )}
      {corner !== null && (
        <CanvasTarget
          g={g}
          x={corner.x + TABLE_BOX.x}
          y={corner.y + TABLE_BOX.y}
          w={TABLE_BOX.w}
          h={TABLE_BOX.h}
          label={`The builders' table, ${hearthOpen ? "the hearth's project is open" : 'the hearth is being built'}. Open the project board`}
          plate="Project"
          group={CORNER_GROUP}
          plateAt={TABLE_BOX.h + 1}
          expanded={open.board}
          onClick={onFire}
        />
      )}
      {stands.map((spot) => {
        const name = creatureName(spot.creature);
        const visitor = spot.owner !== undefined;
        const peeking = visitor && peek === spot.creature.id;
        const z = PLATES_Z + depthOf(spot.x, spot.y);
        const id = spot.creature.id;
        return (
          <span key={id}>
            <Draggable
              x={spot.x}
              y={spot.y}
              g={g}
              hand={{
                area: ground.area,
                lifted: held?.id === id,
                onHold: (x, y) => {
                  setHeld({ id, x, y });
                },
                onDrop: () => {
                  // Put down: anywhere on the ground, but never over a tree, the fire, the corner or another creature.
                  const at = heldNow.current;
                  setHeld(null);
                  if (at === null || at.id !== id) return;
                  const to = settleOnGround(
                    at,
                    ground.area,
                    ground.blocks,
                    stands.filter((o) => o.creature.id !== id),
                    g.s,
                  );
                  ground.onPlace(id, { x: to.x - art.x, y: to.y - art.y });
                },
              }}
            >
              <CanvasTarget
                g={g}
                x={spot.x}
                y={spot.y}
                w={CREATURE_PX}
                h={CREATURE_PX}
                z={z}
                label={
                  visitor
                    ? `${spot.owner ?? ''}'s ${name}, level ${String(spot.creature.level)}, visiting the fire. Show who`
                    : `${name}, level ${String(spot.creature.level)}, ${spot.where}${spot.warm ? ', warming up' : ''}. Show this creature`
                }
                {...(peeking
                  ? {}
                  : {
                      plate: visitor ? '' : name,
                      plateMeta: {
                        level: spot.creature.level,
                        ...(spot.owner === undefined ? {} : { owner: spot.owner }),
                        ...(spot.gained > 0 ? { gain: spot.gained } : {}),
                      },
                      plateAt: CREATURE_PX + 1,
                    })}
                expanded={visitor ? peeking : open.restingId === spot.creature.id}
                onClick={(opener) => {
                  if (visitor) onPeek(peeking ? null : spot.creature.id);
                  else onCreature(spot.creature.id, opener);
                }}
              />
            </Draggable>
            {peeking && (
              <At
                x={g.X(spot.x + CREATURE_PX / 2)}
                y={g.Y(spot.y + CREATURE_PX) + 2}
                class="vy-feet-plate vy-over"
                z={z}
              >
                <Nameplate size="sm" level={spot.creature.level} owner={spot.owner}>
                  {name}
                </Nameplate>
              </At>
            )}
          </span>
        );
      })}
      {seat !== null && (
        <CanvasTarget
          g={g}
          x={seat.x}
          y={seat.y}
          w={CREATURE_PX}
          h={CREATURE_PX}
          z={PLATES_Z + depthOf(seat.x, seat.y)}
          slot={helper === undefined}
          seat={HELPER_DROP}
          over={dragOver}
          label={
            helper === undefined
              ? "The helper spot at the builders' table: nobody helps build. Choose a creature"
              : `${creatureName(helper)}, level ${String(helper.level)}, helping build the hearth at the builders' table. Change`
          }
          plate={helper === undefined ? 'Helper' : creatureName(helper)}
          group={CORNER_GROUP}
          {...(helper === undefined ? {} : { plateMeta: { level: helper.level } })}
          plateAt={CREATURE_PX + 1}
          expanded={open.helper}
          disabled={busy}
          onClick={onHelper}
        />
      )}
      {more > 0 && (
        <CanvasTarget
          g={g}
          x={moreAt.x - 14}
          y={moreAt.y}
          w={28}
          h={Math.ceil(32 / g.s)}
          z={PLATES_Z}
          label={`${moreLabel(more)}: show everyone resting`}
          plate={moreLabel(more)}
          plateAt={0}
          expanded={open.resting}
          onClick={onMore}
        />
      )}
    </>
  );
}
