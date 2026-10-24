import type { ComponentChildren } from 'preact';
import { createContext } from 'preact';
import { useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { cssVars } from '../../css-vars';
import { useElementWidth, usePrefersReducedMotion } from '../../hooks';
import { drawSprites } from '../../room-canvas';
import { Sprite } from '../../sprites/Sprite';
import type { SpriteDef } from '../../sprites/sprite-data';
import type { Placement } from './pixel';
import { propSprite, type PropName } from './props';
import {
  ACTOR_SIZE,
  GAMES_SCENES,
  SCENE_SIZE,
  STANDS_SIZE,
  type GamesSceneId,
  type SceneLayers,
} from './scenes';
import { RAMPS, type RampName } from './tint';

/** How often the idle animation ticks (water, steam, the crowd), in ms. */
export const SCENE_TICK_MS = 260;
/** The width assumed until the scene has been measured. */
const FALLBACK_WIDTH = 390;
/** Draw only what is this close to the view (scene pixels), so a long Melon Run stays cheap. */
const CULL_MARGIN = 64;

/** The largest whole scale at which the 192 px wide scene fits a width (2 at 390 px). */
export function gamesScale(width: number): number {
  return Math.max(1, Math.floor(width / SCENE_SIZE.width));
}

/** How a scene fills a width: drawn at a whole `scale`, then stretched by `zoom` (nearest neighbour). */
export interface GamesFit {
  scale: number;
  /** 1 when the width is a whole multiple of the scene (or narrower than one scene). */
  zoom: number;
}

/**
 * The scene stretched to the whole width (Misa, 2026-10-23: at 360 px the whole scale was 1x and the
 * show was tiny): drawn at the largest whole scale that fits, then zoomed the rest of the way with
 * `image-rendering: pixelated`, so actors and props, placed in the same drawn space, stay on their
 * pixels. A width that is a whole multiple (576 px: 3x) stays whole, with no zoom.
 */
export function gamesFit(width: number): GamesFit {
  const scale = gamesScale(width);
  const exact = width / SCENE_SIZE.width;
  if (exact <= scale) return { scale, zoom: 1 };
  return { scale, zoom: Math.round((exact / scale) * 10_000) / 10_000 };
}

interface SceneView {
  scale: number;
  cameraX: number;
  frame: number;
}

const SceneContext = createContext<SceneView>({ scale: 2, cameraX: 0, frame: 0 });

/** A counter that ticks every `ms` while `on` (stopped under reduced motion by the caller). */
function useTick(ms: number, on: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!on) return undefined;
    const id = setInterval(() => {
      setTick((t) => t + 1);
    }, ms);
    return () => {
      clearInterval(id);
    };
  }, [ms, on]);
  return tick;
}

function visible(placements: readonly Placement[], cameraX: number): Placement[] {
  const left = cameraX - CULL_MARGIN;
  const right = cameraX + SCENE_SIZE.width + CULL_MARGIN;
  return placements.filter((p) => p.x + CULL_MARGIN >= left && p.x <= right);
}

function Layer({
  placements,
  scale,
  cameraX,
  width,
  height,
  layer,
}: {
  placements: readonly Placement[];
  scale: number;
  cameraX: number;
  width: number;
  height: number;
  layer: 'back' | 'front';
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pxWidth = width * scale;
  const pxHeight = height * scale;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) {
      drawSprites(ctx, visible(placements, cameraX), scale, -cameraX * scale, {
        width: pxWidth,
        height: pxHeight,
      });
    }
  }, [placements, scale, cameraX, pxWidth, pxHeight]);
  return (
    <canvas
      ref={ref}
      class={`games-layer games-${layer}`}
      width={pxWidth}
      height={pxHeight}
      aria-hidden="true"
    />
  );
}

export interface GamesSceneProps {
  scene: GamesSceneId;
  /** `stands` draws the scene's crowd strip (192x48) instead of the scene. */
  variant?: 'scene' | 'stands' | undefined;
  /** The left edge of the view in scene pixels (the Melon Run scrolls); default 0. */
  cameraX?: number | undefined;
  /** How wide the world is, for a scene that repeats sideways (scene pixels). */
  worldWidth?: number | undefined;
  /** The sauna's heat, 0 to 100. */
  heat?: number | undefined;
  /** The floe's horizontal radius in scene pixels. */
  floeRadius?: number | undefined;
  /** The light; only `day` is drawn so far. */
  phase?: 'day' | undefined;
  /** Run the idle animation (it never runs when the player prefers reduced motion). */
  animate?: boolean | undefined;
  /** A fixed animation frame (the workbench and tests); overrides the ticking. */
  frame?: number | undefined;
  /** Text for screen readers; without it the scene is decorative. */
  label?: string | undefined;
  /** A fixed whole scale instead of filling the width (no zoom). */
  scale?: number | undefined;
  /** The actors, drawn between the back and the front layer (see `GamesActor`). */
  children?: ComponentChildren | undefined;
  /** Things drawn over the front layer (plates on the table fronts, a splash in front of everything). */
  overlay?: ComponentChildren | undefined;
}

/**
 * A Valley Games scene: the back tiles and props on one canvas, the actors (`children`) over it, the
 * front props (the table fronts, steam) on a second canvas over them, like the living room's layers.
 * It fills the container's width (`gamesFit`: the largest whole scale, then zoomed the rest of the way,
 * nearest neighbour) and shows a 192 px wide view at `cameraX`; a fixed `scale` is drawn as it is.
 */
export function GamesScene({
  scene,
  variant = 'scene',
  cameraX = 0,
  worldWidth,
  heat = 0,
  floeRadius,
  animate = true,
  frame: fixedFrame,
  label,
  children,
  overlay,
  scale: fixedScale,
}: GamesSceneProps) {
  const box = useRef<HTMLDivElement>(null);
  const width = useElementWidth(box, FALLBACK_WIDTH);
  const { scale, zoom } =
    fixedScale === undefined
      ? gamesFit(width)
      : { scale: Math.max(1, Math.floor(fixedScale)), zoom: 1 };
  const reduced = usePrefersReducedMotion();
  const tick = useTick(SCENE_TICK_MS, animate && !reduced && fixedFrame === undefined);
  const frame = fixedFrame ?? tick;
  const art = GAMES_SCENES[scene];
  const layers: SceneLayers = useMemo(
    () =>
      variant === 'stands'
        ? art.stands({ frame })
        : art.layers({ frame, heat, floeRadius, width: worldWidth }),
    [art, variant, frame, heat, floeRadius, worldWidth],
  );
  const size = variant === 'stands' ? STANDS_SIZE : SCENE_SIZE;
  const camera = Math.max(0, Math.min(Math.round(cameraX), layers.width - size.width));
  const view = useMemo(() => ({ scale, cameraX: camera, frame }), [scale, camera, frame]);
  return (
    <div class="games-scene" ref={box} data-scene={scene} data-variant={variant}>
      <div
        class={zoom === 1 ? 'games-fit' : 'games-fit is-zoomed'}
        data-audit-clip
        ref={cssVars({
          '--fw': `${String(size.width * scale * zoom)}px`,
          '--fh': `${String(size.height * scale * zoom)}px`,
          '--zoom': String(zoom),
        })}
      >
        <div
          class="games-stage"
          ref={cssVars({
            '--w': `${String(size.width * scale)}px`,
            '--h': `${String(size.height * scale)}px`,
          })}
          role={label === undefined ? undefined : 'img'}
          aria-label={label}
        >
          <Layer
            placements={layers.back}
            scale={scale}
            cameraX={camera}
            width={size.width}
            height={size.height}
            layer="back"
          />
          <SceneContext.Provider value={view}>
            <div class="games-actors">{children}</div>
          </SceneContext.Provider>
          <Layer
            placements={layers.front}
            scale={scale}
            cameraX={camera}
            width={size.width}
            height={size.height}
            layer="front"
          />
          {overlay !== undefined && (
            <SceneContext.Provider value={view}>
              <div class="games-overlay">{overlay}</div>
            </SceneContext.Provider>
          )}
        </div>
      </div>
    </div>
  );
}

/** What is happening to an actor, drawn over it. */
export type ActorState = 'none' | 'flame' | 'sweat' | 'dizzy' | 'zap' | 'flat' | 'heal' | 'swim';

export const ACTOR_STATES: readonly ActorState[] = [
  'none',
  'flame',
  'sweat',
  'dizzy',
  'zap',
  'flat',
  'heal',
  'swim',
];

/** The overlay prop of a state and where it sits, relative to the sprite's top-left (scene px). */
const OVERLAYS: Readonly<Partial<Record<ActorState, { prop: PropName; x: number; y: number }>>> = {
  flame: { prop: 'flame', x: 4, y: -9 },
  sweat: { prop: 'sweat', x: 12, y: 0 },
  dizzy: { prop: 'dizzy', x: 0, y: -4 },
  zap: { prop: 'zap', x: 9, y: -6 },
  heal: { prop: 'heal', x: 10, y: -5 },
  swim: { prop: 'ripple', x: 0, y: 11 },
};

export interface GamesActorProps {
  /** Feet-centre in scene pixels (world pixels on a scrolling scene). */
  x: number;
  y: number;
  sprite: SpriteDef;
  /** Palette overrides (a shiny creature). */
  palette?: Readonly<Record<string, string>> | undefined;
  state?: ActorState | undefined;
  /** Facing left instead of right. */
  flip?: boolean | undefined;
  /** A tiny bar over the head, 0 to 1 (heat taken, food eaten); none when undefined. */
  meter?: number | undefined;
  meterTint?: RampName | undefined;
  /** Draw order; higher is in front. Defaults to the feet's y. */
  z?: number | undefined;
  /** Text for screen readers (the creature's name). */
  label?: string | undefined;
}

/**
 * One creature in a `GamesScene`, placed by its feet-centre in scene pixels, with an optional state over
 * it (a flame, sweat, dizzy stars, a zap, a heal, or squashed flat) and a tiny meter. It is purely
 * positional: the playback moves it by changing `x` and `y`.
 */
export function GamesActor({
  x,
  y,
  sprite,
  palette,
  state = 'none',
  flip = false,
  meter,
  meterTint = 'gold',
  z,
  label,
}: GamesActorProps) {
  const { scale, cameraX, frame } = useContext(SceneContext);
  const left = (x - cameraX - ACTOR_SIZE / 2) * scale;
  const top = (y - ACTOR_SIZE) * scale;
  const overlay = OVERLAYS[state];
  const ramp = RAMPS[meterTint];
  const classes = ['games-actor'];
  if (state === 'flat') classes.push('is-flat');
  if (flip) classes.push('is-flipped');
  return (
    <div
      class={classes.join(' ')}
      ref={cssVars({
        '--x': `${String(left)}px`,
        '--y': `${String(top)}px`,
        '--z': String(z ?? y),
        '--s': `${String(scale)}px`,
      })}
      data-state={state}
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
    >
      <div class="games-actor-body">
        <Sprite sprite={sprite} scale={scale} {...(palette === undefined ? {} : { palette })} />
      </div>
      {overlay !== undefined && (
        <div
          class="games-actor-fx"
          ref={cssVars({
            '--fx-x': `${String(overlay.x * scale)}px`,
            '--fx-y': `${String(overlay.y * scale)}px`,
          })}
        >
          <Sprite sprite={propSprite(overlay.prop, frame)} scale={scale} />
        </div>
      )}
      {meter !== undefined && (
        <div
          class="games-meter"
          ref={cssVars({
            '--pct': `${String(Math.round(Math.max(0, Math.min(1, meter)) * 100))}%`,
            '--meter': ramp[1],
            '--meter-dark': ramp[3],
          })}
        >
          <div class="games-meter-fill" />
        </div>
      )}
    </div>
  );
}

export interface GamesSpriteProps {
  /** Scene pixels: the sprite's bottom-centre (`feet`, the default), centre or top-left. */
  x: number;
  y: number;
  sprite: SpriteDef;
  anchor?: 'feet' | 'centre' | 'top-left' | undefined;
  flip?: boolean | undefined;
  /** Draw order; higher is in front. Defaults to y. */
  z?: number | undefined;
}

/**
 * Any sprite placed in a `GamesScene` by scene pixels (a plate, the melon, a shark fin, a splash), at the
 * scene's scale and camera. Purely positional, like `GamesActor`.
 */
export function GamesSprite({ x, y, sprite, anchor = 'feet', flip = false, z }: GamesSpriteProps) {
  const { scale, cameraX } = useContext(SceneContext);
  const w = sprite.rows[0]?.length ?? 0;
  const width = sprite.mirror === true ? w * 2 : w;
  const height = sprite.rows.length;
  const left = anchor === 'top-left' ? x : x - width / 2;
  const top = anchor === 'top-left' ? y : anchor === 'centre' ? y - height / 2 : y - height;
  return (
    <div
      class={flip ? 'games-sprite is-flipped' : 'games-sprite'}
      ref={cssVars({
        '--x': `${String(Math.round((left - cameraX) * scale))}px`,
        '--y': `${String(Math.round(top * scale))}px`,
        '--z': String(z ?? y),
      })}
    >
      <Sprite sprite={sprite} scale={scale} />
    </div>
  );
}
