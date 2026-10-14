import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { shinyPalette } from './art';
import { cssVars } from './css-vars';
import { useElementWidth, usePrefersReducedMotion } from './hooks';
import { usePopoverTrigger } from './PopoverHost';
import { SmallCreature } from './SmallCreature';
import { drawSprites } from './room-canvas';
import type { Resident } from './room-data';
import { edgeFill, fnv1a, roomScale } from './room-layout';
import {
  allBusyLabel,
  edgePlacements,
  layerPlacements,
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
import type { SpriteDef } from './sprites/sprite-data';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { PopoverCard, popupProps } from './ui/Popover';
import { useRoomBubbles } from './use-room-bubbles';
import { useRoomScroll } from './use-room-scroll';

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

interface LivingRoomProps {
  /** Everyone present who has a lounger or a busy note, the player included. */
  residents: readonly Resident[];
  /** The player's own user id: the room starts centred on their spot. */
  selfId: string;
  /** The activity instance id: with the user ids it decides who sits where. */
  instanceId: string;
  /** The room's art in the light of the moment (see `roomScene`); night by default. */
  scene?: RoomScene;
  /** The title row, laid over the top wall band; it does not scroll with the room. */
  children?: ComponentChildren;
}

/**
 * The living room: a pixel strip (288x56 logical pixels) with every present player's lounging
 * creature in its own spot. Back props are one canvas, front props another, and the creatures are
 * buttons in between (so a creature on a chair sits behind the table). Wide windows show it centred
 * at the largest integer scale that fits, with wall and floor tiles out to both edges; narrow ones
 * show it at scale 3 and scroll sideways (see `use-room-scroll.ts`). Creatures bob and now and then
 * one shows a short speech bubble, all local.
 */
export function LivingRoom({
  residents,
  selfId,
  instanceId,
  scene = sceneOf('night'),
  children,
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

  useRoomScroll({
    viewport: viewRef,
    scrolling: scroll,
    scale,
    selfSpotX: own?.spot.x ?? null,
    roomPixelWidth: roomWidth,
    reducedMotion: reduced,
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
      <div class="room-view" ref={viewRef} role="group" aria-label="Living room">
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
              ref={spotVars(seat, scale, originX)}
            >
              {seat.info === null || seat.resident.creature === null ? (
                <NoteSpot name={seat.resident.name} scale={scale} note={scene.note} />
              ) : (
                <SmallCreature
                  id={seat.resident.creature.id}
                  info={seat.info}
                  label={seat.label}
                  class="room-creature"
                >
                  <Sprite
                    sprite={creatureSpriteOrFallback(seat.resident.creature.species)}
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
        </div>
      </div>
      {children !== undefined && <div class="room-head">{children}</div>}
      <p class="room-count pix">{residents.length} here</p>
    </div>
  );
}
