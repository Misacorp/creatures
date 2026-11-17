/**
 * The house as one picture (`docs/design/housing.md` 4.4): the cutaway dollhouse drawn on two canvases (the back layer up to
 * the sleeping housemates, the front layer over them) at an integer scale, in a box that pans both ways like the valley
 * map (`ui/use-drag-scroll`, native touch scroll, `ui/PanHint`). Every room is a button over the picture: a tap focuses it
 * (`onRoom`). The mailbox and the workbench are buttons too when `onFixture` is given. The scene shows, it does not tell: no
 * captions over rooms. Nothing moves; the housemates breathe only in the focus view (`RoomFocus`).
 */
import { useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import { type HouseView } from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import { bossSprite } from '../sprites/creature-sprites';
import { FALLBACK_SILHOUETTE } from '../sprites/creature-sprites';
import { cssVars } from '../css-vars';
import { creatureName } from '../game';
import { useElementWidth } from '../hooks';
import { PanHint } from '../ui/PanHint';
import { openerOf, ToolCue, type Opener } from '../valley/PlaceCanvas';
import { useSize } from '../valley/parts';
import { useDragScroll } from '../ui/use-drag-scroll';
import { keepsakeArt } from './house-art';
import { useHousePhase } from './house-phase';
import { nudgePlates } from './plate-nudge';
import { paintPlacements } from './house-paint';
import type { Lighting } from './house-light';
import { HousePostcard } from './HousePostcard';
import {
  composeHouse,
  GROUND_MARGIN,
  overviewScale,
  overviewScroll,
  sceneMinWidth,
  type DisplayDrawing,
  type Placement,
  SIDE,
  type SceneCreature,
  type SceneModel,
} from './house-scene';
import { useEffect } from 'preact/hooks';

/** The view is at most this share of the window's height (the stylesheet's 60vh). */
const VIEW_HEIGHT = 0.6;

/** The width assumed until the box has been measured. */
const FALLBACK_WIDTH = 390;

/** The integer scale for a box `width` CSS px wide: 2 on a phone, 3 from 700 px (a house is big). */
export function defaultHouseScale(width: number): number {
  return width >= 700 ? 3 : 2;
}

/** What the scene needs from the app to draw a raid plaque and a keepsake: the boss's art and the set's keepsake. */
export const HOUSE_DRAWING: DisplayDrawing = {
  bossSprite: (id) => bossSprite(id) ?? FALLBACK_SILHOUETTE,
  keepsake: keepsakeArt,
};

/** One canvas of the scene, at one pixel per scene pixel (the stylesheet scales it by an integer). */
export function SceneLayer({
  placements,
  width,
  height,
  layer,
  lighting,
}: {
  placements: readonly Placement[];
  width: number;
  height: number;
  layer: 'back' | 'front';
  /** The scene's phase and lights (`model.lighting`); absent: day. */
  lighting?: Lighting;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Painted before the browser shows the frame: a canvas whose size changed is blank until painted, so a later effect flashes.
  useLayoutEffect(() => {
    paintPlacements(ref.current?.getContext('2d') ?? null, placements, width, height, lighting);
  }, [placements, width, height, lighting]);
  return (
    <canvas
      ref={ref}
      class={`house-layer house-${layer}`}
      width={width}
      height={height}
      aria-hidden="true"
    />
  );
}

/** Where the scroll position of the overview is remembered across a visit to a room and back. */
export interface ScrollMemory {
  current: { left: number; top: number } | null;
}

export interface HouseSceneProps {
  house: HouseView;
  /** `own`: your house (the mailbox and workbench are buttons); `visit`: read-only. */
  mode: 'own' | 'visit';
  /** A room was tapped (`opener`: the button, for the canvas's drawers to give the focus back to). */
  onRoom: (roomId: string, opener: Opener) => void;
  /** The mailbox or the workbench was tapped (own house; absent: they are only pictures). */
  onFixture?: (kind: 'mailbox' | 'workbench', opener: Opener) => void;
  /** The mailbox's spoken name ("Mailbox, 2 gifts waiting"). */
  mailboxLabel?: string;
  /** Gifts wait in the mailbox: its flag is up (down otherwise). */
  mailWaiting?: boolean;
  /**
   * The integer scale for a box this wide (CSS px). Default (`overviewScale`): the largest whole scale (2 on a phone, 3 on a wide
   * window at most) at which the building fits; else 2, centred on the building.
   */
  scaleFor?: (width: number) => number;
  /** Where the box's scroll is kept while a room is open. */
  memory?: ScrollMemory;
  /** Show the whole house as a postcard above the cutaway when the cutaway cannot (default: yes). */
  postcard?: boolean;
  /** A room to bring into view and focus (the part that was just built): the cutaway scrolls to it. */
  focusRoom?: string | null;
  /** Rooms that open with a short stepped reveal (the new part); with reduced motion they simply appear. */
  reveal?: readonly string[];
  /**
   * The scene is a place's canvas (`valley/PlaceCanvas`, "A place is a canvas"): it fills the height it is given instead of being at
   * most 60vh high, each room and fixture wears a name plate, and none shows a hover ring or a focus ring (the keyboard's cue is the
   * art scenes' gold arrow, `styles/views/art-focus.css`).
   */
  canvas?: boolean;
}

/** The cutaway: see the file comment. */
export function HouseScene({
  house,
  mode,
  onRoom,
  onFixture,
  mailboxLabel = 'Mailbox',
  mailWaiting = false,
  scaleFor,
  memory,
  postcard,
  focusRoom = null,
  reveal = [],
  canvas = false,
}: HouseSceneProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const boxWidth = useElementWidth(rootRef, FALLBACK_WIDTH);
  const phase = useHousePhase();
  // How big the house is by itself: the scale is the largest that shows all of it, if any does.
  const natural = useMemo(
    () => composeHouse(house, { content: housing, creatures: 'skip', drawing: HOUSE_DRAWING }),
    [house],
  );
  // A canvas fills its stage: the box is as high as the stage; else the view is at most 60vh.
  const unmeasured = useRef<HTMLDivElement>(null);
  const stageSize = useSize(canvas ? viewRef : unmeasured);
  const boxHeight = canvas
    ? stageSize.height
    : typeof window === 'undefined'
      ? 480
      : window.innerHeight * VIEW_HEIGHT;
  // The building is what has to fit (with the grass its door stands on): the workbench and the mailbox in the yard are a pan away.
  const fit = overviewScale(
    boxWidth,
    natural.box.w + 2 * SIDE,
    natural.box.h + GROUND_MARGIN,
    boxHeight,
  );
  const scale = Math.max(1, Math.floor(scaleFor === undefined ? fit.scale : scaleFor(boxWidth)));
  // A canvas is a map you pan, never a page with a postcard above it.
  const wholeInView = canvas || (scaleFor === undefined ? fit.fits : true);
  // Stepped, so a resize tick of a few pixels (a scrollbar, a phone's toolbar) neither re-composes the house nor resizes the canvas.
  const minWidth = sceneMinWidth(boxWidth, scale);
  // A canvas taller than the house: the sky goes on above it (stepped like the width, so a small resize draws nothing new).
  const minHeight = sceneMinWidth(boxHeight, scale);
  const model: SceneModel = useMemo(
    () =>
      composeHouse(house, {
        content: housing,
        minWidth,
        ...(canvas ? { minHeight } : {}),
        creatures: 'draw',
        drawing: HOUSE_DRAWING,
        mailWaiting,
        phase,
      }),
    [house, minWidth, minHeight, mailWaiting, phase],
  );
  useDragScroll(viewRef);
  // A plate near the edge of what the stage shows is moved in, so it is never cut ("Workbenc"); again as the picture pans.
  useLayoutEffect(() => {
    const view = viewRef.current;
    if (
      !canvas ||
      view === null ||
      typeof view.getBoundingClientRect !== 'function' ||
      typeof requestAnimationFrame !== 'function'
    ) {
      return undefined;
    }
    let frame = 0;
    const again = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        nudgePlates(view);
      });
    };
    nudgePlates(view);
    view.addEventListener('scroll', again, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      view.removeEventListener('scroll', again);
    };
  }, [canvas, model, scale, boxWidth, boxHeight]);
  // The scene is composed a little wider than the box (the stepped width); the stage shows the box's width of it, centred, so a
  // house that fits is not scrolled by the rounding. `shift` is the hidden strip left of the stage, in CSS px (whole scene px).
  const fullW = model.width * scale;
  const stageW = Math.min(fullW, Math.max(boxWidth, natural.width * scale));
  const shift = Math.floor((fullW - stageW) / 2 / scale) * scale;
  const shown = {
    start: { x: model.start.x - shift / scale, y: model.start.y },
    groundY: model.groundY,
    width: stageW / scale,
    height: model.height,
  };
  // Start where the whole house is: all of it in view when it fits, else centred on the building with the grass line near the
  // bottom of the box; come back to where it was after a visit to a room.
  const placedFor = useRef('');
  useLayoutEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    const key = `${String(scale)}:${String(stageW)}:${String(model.height)}`;
    if (placedFor.current === key) return;
    placedFor.current = key;
    if (memory?.current != null) {
      view.scrollLeft = memory.current.left;
      view.scrollTop = memory.current.top;
      return;
    }
    const at = overviewScroll(shown, scale, view.clientWidth || boxWidth, view.clientHeight || 0);
    view.scrollLeft = at.left;
    view.scrollTop = at.top;
  }, [scale, stageW, model.height]);
  // The room that was just built: scrolled into the middle of the view, and focused for a screen reader and the keyboard.
  const focusRoomReady = focusRoom !== null && model.rooms.some((r) => r.roomId === focusRoom);
  useLayoutEffect(() => {
    const view = viewRef.current;
    const room = model.rooms.find((r) => r.roomId === focusRoom);
    if (view === null || room === undefined) return;
    view.scrollLeft = Math.max(
      0,
      Math.round((room.x + room.w / 2) * scale - shift - view.clientWidth / 2),
    );
    view.scrollTop = Math.max(0, Math.round((room.y + room.h / 2) * scale - view.clientHeight / 2));
    view.querySelector<HTMLElement>(`[data-room="${room.roomId}"]`)?.focus({ preventScroll: true });
  }, [focusRoom, focusRoomReady]);
  useEffect(() => {
    const view = viewRef.current;
    if (view === null || memory === undefined) return undefined;
    const remember = (): void => {
      memory.current = { left: view.scrollLeft, top: view.scrollTop };
    };
    view.addEventListener('scroll', remember, { passive: true });
    return () => {
      view.removeEventListener('scroll', remember);
    };
  }, [memory]);
  const owner = house.owner.name;
  const label = mode === 'own' ? 'Your house' : `${owner}'s house`;
  return (
    <div
      class="house-scene"
      data-mode={mode}
      data-scale={scale}
      data-canvas={canvas ? 'yes' : undefined}
      ref={rootRef}
    >
      {!wholeInView && postcard !== false && (
        <div class="house-postcard-band">
          <HousePostcard house={house} maxWidth={boxWidth} label={label} />
        </div>
      )}
      <div class="house-view" ref={viewRef} role="group" aria-label={label} data-audit-clip>
        <div
          class="house-stage house-stage-clip"
          ref={cssVars({
            '--sw': `${String(stageW)}px`,
            '--hh': `${String(model.height * scale)}px`,
          })}
        >
          <div
            class="house-plane"
            ref={cssVars({
              '--hw': `${String(fullW)}px`,
              '--shift': `${String(-shift)}px`,
            })}
          >
            <SceneLayer
              placements={model.back}
              width={model.width}
              height={model.height}
              layer="back"
              lighting={model.lighting}
            />
            <SceneLayer
              placements={model.front}
              width={model.width}
              height={model.height}
              layer="front"
              lighting={model.lighting}
            />
            {model.rooms.map((room) => (
              <button
                key={room.roomId}
                type="button"
                class="house-room"
                data-outdoor={room.outdoor ? 'true' : undefined}
                data-room={room.roomId}
                aria-label={roomLabel(
                  room.name,
                  model.creatures.filter((c) => c.roomId === room.roomId),
                )}
                ref={boxVars(room, scale)}
                onClick={(event) => {
                  onRoom(room.roomId, openerOf(event.currentTarget));
                }}
              >
                {canvas && <ToolCue name={room.name} inside />}
              </button>
            ))}
            {model.rooms
              .filter((room) => reveal.includes(room.roomId))
              .map((room) => (
                <span
                  key={room.roomId}
                  class="house-reveal"
                  aria-hidden="true"
                  ref={boxVars(room, scale)}
                />
              ))}
            {onFixture !== undefined &&
              model.fixtures
                .filter((f) => f.kind === 'mailbox' || f.kind === 'workbench')
                .map((f) => (
                  <button
                    key={f.kind}
                    type="button"
                    class="house-fixture"
                    aria-label={f.kind === 'mailbox' ? mailboxLabel : 'Workbench'}
                    ref={boxVars(f, scale)}
                    onClick={(event) => {
                      if (f.kind === 'mailbox' || f.kind === 'workbench') {
                        onFixture(f.kind, openerOf(event.currentTarget));
                      }
                    }}
                  >
                    {canvas && <ToolCue name={f.kind === 'mailbox' ? 'Mailbox' : 'Workbench'} />}
                  </button>
                ))}
          </div>
        </div>
      </div>
      <PanHint target={viewRef} id="house" />
    </div>
  );
}

/** A room button's spoken name: the room, and who is asleep in it ("Loft, Splashet asleep"). */
export function roomLabel(name: string, sleepers: readonly SceneCreature[]): string {
  if (sleepers.length === 0) return name;
  const who = sleepers.map((c) =>
    creatureName({
      nickname: c.housemate.creature.nickname,
      species: c.housemate.creature.species,
    }),
  );
  return `${name}, ${who.join(' and ')} asleep`;
}

/** A box in scene pixels as CSS custom properties in screen pixels (`--x`, `--y`, `--w`, `--h`). */
export function boxVars(
  box: { x: number; y: number; w: number; h: number },
  scale: number,
): (el: HTMLElement | null) => void {
  return cssVars({
    '--x': `${String(box.x * scale)}px`,
    '--y': `${String(box.y * scale)}px`,
    '--w': `${String(box.w * scale)}px`,
    '--h': `${String(box.h * scale)}px`,
  });
}
