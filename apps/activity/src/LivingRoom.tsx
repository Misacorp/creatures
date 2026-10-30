import { useEffect, useRef, useState } from 'preact/hooks';
import { shinyPalette } from './art';
import { cssVars } from './css-vars';
import { TOUCH_HOLD_MS, type Point } from './dnd-core';
import { useElementWidth, usePrefersReducedMotion } from './hooks';
import { usePopoverTrigger, type CreatureAction } from './PopoverHost';
import { SmallCreature } from './SmallCreature';
import { drawSprites } from './room-canvas';
import type { Resident } from './room-data';
import { dropSpotAt, dropSpotIds, edgeFill, fnv1a, roomScale } from './room-layout';
import {
  allBusyLabel,
  edgePlacements,
  layerPlacements,
  moveHereLabel,
  occupiedSpots,
  seatResidents,
  type Placement,
  type Seated,
} from './room-view';
import {
  ROOM_BAND_HEIGHT,
  ROOM_SIZE,
  ROOM_SPOTS,
  SPOT_SIZE,
  roomScene,
  type RoomPhase,
  type RoomScene,
} from './sprites/room-art';
import { Sprite } from './sprites/Sprite';
import { wornSprite } from './worn-gear';
import type { SpriteDef } from './sprites/sprite-data';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { dropOutcome } from './slot-outcome';
import { DragGhost } from './ui/DragGhost';
import { PopoverCard, popupProps } from './ui/Popover';
import { useDragDrop } from './use-drag-drop';
import { useRoomBubbles } from './use-room-bubbles';
import { useRoomScroll } from './use-room-scroll';
import { WeatherCalendar } from './WeatherCalendar';
import { RoomTrophy } from './games/RoomTrophy';
import type { BoardRow } from './games-types';
import type { Forecast } from './weather-types';

const scenes = new Map<RoomPhase, RoomScene>();

/** The scene of a phase, built once (the canvases redraw only when the scene object changes). */
export function sceneOf(phase: RoomPhase): RoomScene {
  let scene = scenes.get(phase);
  if (scene === undefined) {
    scene = roomScene(phase);
    scenes.set(phase, scene);
  }
  return scene;
}

/** The width assumed until the room has been measured (and where there is no layout). */
const FALLBACK_WIDTH = 390;
/** Screen pixels around a spot that still count as "on" it while a creature is carried. */
const SPOT_SLOP = 4;

/** One layer of the scene (back or front props) on a single canvas. */
function RoomLayer({
  placements,
  scale,
  originX,
  width,
  layer,
}: {
  placements: readonly Placement[];
  scale: number;
  originX: number;
  width: number;
  layer: 'back' | 'front';
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const height = ROOM_SIZE.height * scale;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) drawSprites(ctx, placements, scale, originX, { width, height });
  }, [placements, scale, originX, width, height]);
  return (
    <canvas
      ref={ref}
      class={`room-layer room-${layer}`}
      width={width}
      height={height}
      aria-hidden="true"
    />
  );
}

/** A spot's position in the stage, in CSS px, as custom properties. */
function spotVars(seat: Seated, scale: number, originX: number) {
  return cssVars({
    '--x': `${String(originX + seat.spot.x * scale)}px`,
    '--y': `${String(seat.spot.y * scale)}px`,
    '--bob-delay': `${String(-(fnv1a(seat.resident.userId) % 12) / 10)}s`,
  });
}

/** A target marker's place and size in the stage, in CSS px, as custom properties. */
function targetVars(spot: { x: number; y: number }, scale: number, originX: number) {
  return cssVars({
    '--x': `${String(originX + spot.x * scale)}px`,
    '--y': `${String(spot.y * scale)}px`,
    '--size': `${String(SPOT_SIZE.width * scale)}px`,
  });
}

/** Spots near an end of the room keep their bubble inside it. */
function spotEdge(x: number): 'left' | 'right' | undefined {
  if (x < 24) return 'left';
  return x > ROOM_SIZE.width - 40 ? 'right' : undefined;
}

/** The note on a cushion: all of this player's creatures are out working. Tap for who it is. */
function NoteSpot({ name, scale, note: art }: { name: string; scale: number; note: SpriteDef }) {
  const { host, ref, open } = usePopoverTrigger<HTMLButtonElement>();
  const note = <Sprite sprite={art} scale={scale} />;
  if (host === null) return note;
  return (
    <button
      ref={ref}
      type="button"
      class="small-creature room-note"
      {...popupProps(open)}
      aria-label={allBusyLabel(name)}
      onClick={() => {
        if (ref.current === null) return;
        host.openCustom(`room-note:${name}`, ref.current, {
          label: allBusyLabel(name),
          body: (
            <PopoverCard
              visual={<Sprite sprite={art} scale={4} />}
              title={name}
              short="All their creatures are out working."
            />
          ),
        });
      }}
    >
      {note}
    </button>
  );
}

/**
 * The keyboard way to move: a button on every empty spot ("Move here: couch, left seat"), the nearest
 * one focused first, and Escape to leave. Same marker as while dragging.
 */
function PickTargets({
  spotIds,
  from,
  scale,
  originX,
  onPick,
  onCancel,
}: {
  spotIds: readonly string[];
  from: { x: number; y: number } | null;
  scale: number;
  originX: number;
  onPick: (spotId: string) => void;
  onCancel: () => void;
}) {
  const spots = ROOM_SPOTS.filter((spot) => spotIds.includes(spot.id));
  const first = useRef<HTMLButtonElement>(null);
  const nearest = [...spots].sort(
    (a, b) =>
      Math.hypot(a.x - (from?.x ?? 0), a.y - (from?.y ?? 0)) -
      Math.hypot(b.x - (from?.x ?? 0), b.y - (from?.y ?? 0)),
  )[0];
  useEffect(() => {
    first.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  return (
    <>
      {spots.map((spot) => (
        <button
          key={spot.id}
          ref={(el) => {
            targetVars(spot, scale, originX)(el);
            if (spot === nearest) first.current = el;
          }}
          type="button"
          class="room-target room-target-pick"
          aria-label={moveHereLabel(spot.id)}
          onClick={() => {
            onPick(spot.id);
          }}
        />
      ))}
    </>
  );
}

interface LivingRoomProps {
  /** Everyone present who has a lounger or a busy note, the player included. */
  residents: readonly Resident[];
  /** The player's own user id: the room starts centred on their spot. */
  selfId: string;
  /** The activity instance id: with the user ids it decides who sits where. */
  instanceId: string;
  /** The room's art in the light of the moment (see `roomScene`); night by default. */
  scene?: RoomScene;
  /**
   * The forecast for the wall calendar (Boons and Omens): null while it loads (the page is blank). Absent:
   * the room has no calendar (the workbench, tests).
   */
  forecast?: Forecast | null;
  /**
   * The Valley Games trophy shelf: the server's medal table (the top three show in its popover) and what
   * its "Games" button does. Absent: no shelf (tests).
   */
  trophy?: { board: readonly BoardRow[]; selfId: string; onOpen: () => void };
  /**
   * Moves the player's own creature to an empty spot (dragging it, or "Move" in its popover). Called
   * with the chosen spot's id; the caller saves it and puts it in the player's own resident (`spot`).
   * Absent: nothing can be moved.
   */
  onMove?: (spotId: string) => void;
  /** Opens the lounge swap (who lounges), from "Swap" in the popover of the player's own creature. */
  onSwap?: () => void;
  /** What lounging gave your own lounger today: its popover shows the Lounging tag. Absent: no tag. */
  ownLoungeXp?: number;
}

/**
 * The living room: a pixel strip (288x56 logical pixels) with every present player's lounging
 * creature in its own spot. Back props are one canvas, front props another, and the creatures are
 * buttons in between (so a creature on a chair sits behind the table). Wide windows show it centred
 * at the largest integer scale that fits, with wall and floor tiles out to both edges; narrow ones
 * show it at scale 3 and scroll sideways (see `use-room-scroll.ts`). Creatures bob and now and then
 * one shows a short speech bubble, all local.
 *
 * The player's own creature can be moved (see `onMove`): pressed and dragged with a mouse, held and
 * dragged with a finger (an earlier swipe still scrolls the room), or picked with the "Move" button of
 * its popover and then a button on a spot. While moving, every empty spot shows a target marker.
 */
export function LivingRoom({
  residents,
  selfId,
  instanceId,
  scene = sceneOf('night'),
  forecast,
  trophy,
  onMove,
  onSwap,
  ownLoungeXp,
}: LivingRoomProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(rootRef, FALLBACK_WIDTH);
  const reduced = usePrefersReducedMotion();
  const { scale, scroll } = roomScale(width);
  const roomWidth = ROOM_SIZE.width * scale;
  const stageWidth = scroll ? roomWidth : width;
  const originX = scroll ? 0 : Math.floor((width - roomWidth) / 2);
  const stageHeight = ROOM_SIZE.height * scale;

  const seated = seatResidents(instanceId, residents, ROOM_SPOTS);
  const own = seated.find((s) => s.resident.userId === selfId);

  // Moving your own creature: dragging (`dragDrop`) or the keyboard way (`picking`).
  const movable = onMove !== undefined && own !== undefined && own.info !== null;
  const [picking, setPicking] = useState(false);
  // The popover of your own creature: Move (the keyboard way to move it) and Swap (who lounges).
  const ownActions: CreatureAction[] = [
    ...(movable
      ? [
          {
            label: 'Move',
            onAct: () => {
              setPicking(true);
            },
          },
        ]
      : []),
    ...(onSwap === undefined ? [] : [{ label: 'Swap', onAct: onSwap }]),
  ];
  const [landed, setLanded] = useState(false);
  const occupied = occupiedSpots(seated);
  const targets = dropSpotIds(ROOM_SPOTS, occupied, selfId);
  const move = (spotId: string | null): void => {
    setLanded(true);
    if (onMove !== undefined && spotId !== null && spotId !== own?.spot.id) onMove(spotId);
  };
  const dragDrop = useDragDrop<string>({
    disabled: !movable || picking,
    stripRef: viewRef,
    touchHoldMs: TOUCH_HOLD_MS,
    locate: (p: Point) => {
      const view = viewRef.current;
      if (view === null) return null;
      const box = view.getBoundingClientRect();
      return dropSpotAt(
        p,
        ROOM_SPOTS,
        targets,
        { view: box, scrollLeft: view.scrollLeft, originX, scale },
        SPOT_SLOP,
      );
    },
    onDrop: (_creatureId, spotId) => {
      move(spotId);
      return dropOutcome('valid', null, null, '');
    },
  });
  const carrying = dragDrop.drag !== null;
  // The keyboard way ends when the creature can no longer be moved (for example it went to work).
  const picks = picking && movable;
  /** Puts the keyboard focus back on your creature (the target buttons it was on are gone). */
  const focusOwn = (): void => {
    viewRef.current?.querySelector<HTMLElement>('[data-draggable="true"] button')?.focus();
  };
  const cancelPick = (): void => {
    setPicking(false);
    focusOwn();
  };
  // Seating reorders the creatures, which drops the focus of the one that moved: take it back.
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    focusOwn();
  }, [own?.spot.id]);

  useRoomScroll({
    viewport: viewRef,
    scrolling: scroll,
    scale,
    selfSpotX: own?.spot.x ?? null,
    roomPixelWidth: roomWidth,
    reducedMotion: reduced,
    holdStill: carrying || picks,
  });

  const bubble = useRoomBubbles(() => {
    const view = viewRef.current;
    return seated
      .filter((s) => {
        if (s.info === null) return false;
        if (!scroll || view === null) return true;
        const middle = (s.spot.x + SPOT_SIZE.width / 2) * scale;
        return middle >= view.scrollLeft && middle <= view.scrollLeft + view.clientWidth;
      })
      .map((s) => s.resident.userId);
  });

  const back = [
    ...edgePlacements(scene.edgeTile, scroll ? { left: 0, right: 0 } : edgeFill(width, scale)),
    ...layerPlacements(scene.props, 'back'),
  ];
  const front = layerPlacements(scene.props, 'front');

  return (
    <div
      class={scroll ? 'room room-scrolls' : 'room'}
      data-scale={scale}
      ref={(el) => {
        rootRef.current = el;
        cssVars({
          '--stage-h': `${String(stageHeight)}px`,
          '--band': `${String(ROOM_BAND_HEIGHT * scale)}px`,
        })(el);
      }}
    >
      <div class="room-view" ref={viewRef} role="group" aria-label="Living room" data-audit-clip>
        <div
          class="room-stage"
          ref={cssVars({
            '--stage-w': `${String(stageWidth)}px`,
            '--stage-h': `${String(stageHeight)}px`,
          })}
        >
          <RoomLayer
            placements={back}
            scale={scale}
            originX={originX}
            width={stageWidth}
            layer="back"
          />
          {seated.map((seat) => (
            <div
              key={seat.resident.userId}
              class="room-spot"
              data-edge={spotEdge(seat.spot.x)}
              data-draggable={movable && seat === own ? 'true' : undefined}
              data-lifted={carrying && seat === own ? 'true' : undefined}
              data-landed={landed && seat === own ? 'true' : undefined}
              ref={spotVars(seat, scale, originX)}
              {...(movable && seat === own
                ? {
                    onPointerDown: (event: PointerEvent) => {
                      dragDrop.startDrag(seat.resident.creature?.id ?? '', event);
                    },
                    onClickCapture: (event: MouseEvent) => {
                      // The click that follows a drag must not open the popover.
                      if (!dragDrop.consumeClick()) return;
                      event.stopPropagation();
                      event.preventDefault();
                    },
                    onAnimationEnd: () => {
                      setLanded(false);
                    },
                  }
                : {})}
            >
              {seat.info === null || seat.resident.creature === null ? (
                <NoteSpot name={seat.resident.name} scale={scale} note={scene.note} />
              ) : (
                <SmallCreature
                  id={seat.resident.creature.id}
                  info={
                    seat === own && ownLoungeXp !== undefined
                      ? { ...seat.info, loungeXp: ownLoungeXp }
                      : seat.info
                  }
                  label={seat.label}
                  class="room-creature"
                  {...(seat === own ? { action: ownActions } : {})}
                >
                  <Sprite
                    sprite={
                      wornSprite(seat.resident.creature.species, seat.resident.creature.gear) ??
                      creatureSpriteOrFallback(seat.resident.creature.species)
                    }
                    scale={scale}
                    bob
                    {...(seat.resident.creature.shiny &&
                    shinyPalette(seat.resident.creature.species) !== undefined
                      ? {
                          palette: shinyPalette(seat.resident.creature.species) as Readonly<
                            Record<string, string>
                          >,
                        }
                      : {})}
                  />
                </SmallCreature>
              )}
              {bubble?.userId === seat.resident.userId && seat.info !== null && (
                <span class="room-bubble" aria-hidden="true">
                  {bubble.line}
                </span>
              )}
            </div>
          ))}
          <RoomLayer
            placements={front}
            scale={scale}
            originX={originX}
            width={stageWidth}
            layer="front"
          />
          {forecast !== undefined && (
            <WeatherCalendar forecast={forecast} scale={scale} originX={originX} />
          )}
          {trophy !== undefined && (
            <RoomTrophy
              sprite={scene.trophy}
              scale={scale}
              originX={originX}
              board={trophy.board}
              selfId={trophy.selfId}
              onOpen={trophy.onOpen}
            />
          )}
          {carrying &&
            ROOM_SPOTS.filter((spot) => targets.includes(spot.id)).map((spot) => (
              <div
                key={spot.id}
                class="room-target"
                data-over={dragDrop.drag?.over === spot.id ? 'true' : undefined}
                aria-hidden="true"
                ref={targetVars(spot, scale, originX)}
              />
            ))}
          {picks && (
            <PickTargets
              spotIds={targets.filter((id) => id !== own?.spot.id)}
              from={own?.spot ?? null}
              scale={scale}
              originX={originX}
              onPick={(spotId) => {
                setPicking(false);
                refocus.current = true;
                move(spotId);
              }}
              onCancel={cancelPick}
            />
          )}
        </div>
      </div>
      {!picks && <p class="room-count pix">{residents.length} here</p>}
      {picks && (
        <p class="room-pick pix">
          <span>Pick a spot</span>
          <button type="button" onClick={cancelPick}>
            Cancel
          </button>
        </p>
      )}
      <DragGhost
        ghostRef={dragDrop.ghostRef}
        creature={
          carrying && own?.resident.creature != null && own.info !== null
            ? { species: own.resident.creature.species, name: own.info.name }
            : undefined
        }
      />
    </div>
  );
}
