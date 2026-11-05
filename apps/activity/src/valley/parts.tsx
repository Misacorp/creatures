/**
 * Small shared parts of the valley: a sprite placed on the map, the window-size and clock hooks, the glyph and
 * plain-sprite wrappers (the label on art is `ui/Nameplate`).
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { shinyPalette } from '../art';
import { cssVars } from '../css-vars';
import { glyphOrUnknown } from '../glyphs';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';
import { Sprite } from '../sprites/Sprite';
import type { SpriteDef } from '../sprites/sprite-data';
import type { Creature } from '../api';

/** Whether this is a screenshot (`&bare=1`): motion holds still so every shot is the same. */
export function isStill(): boolean {
  return typeof window !== 'undefined' && /[?&]bare=1/.test(window.location.hash);
}

/** A tick that counts up every `ms` while `on`; holds at 0 otherwise. */
export function useTick(ms: number, on: boolean): number {
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

/** The size of an element (CSS px), following resizes. */
export function useSize(ref: { current: HTMLElement | null }): { width: number; height: number } {
  const [size, setSize] = useState({ width: 390, height: 780 });
  useEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    const update = (): void => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return size;
}

/**
 * Something placed at (`x`, `y`) CSS px inside a positioned scene (its top-left), by CSS variables (no
 * inline style). Decorative unless it holds a button.
 */
export function At({
  x,
  y,
  class: extra,
  children,
  hidden = true,
  z,
}: {
  x: number;
  y: number;
  /** Draw order among the things in the scene (`depthOf`: lower feet in front); else the document order. */
  z?: number;
  class?: string | undefined;
  children: ComponentChildren;
  hidden?: boolean;
}) {
  return (
    <span
      class={`vy-at${extra === undefined ? '' : ` ${extra}`}`}
      ref={cssVars({
        '--x': `${String(Math.round(x))}px`,
        '--y': `${String(Math.round(y))}px`,
        ...(z === undefined ? {} : { '--z': z }),
      })}
      aria-hidden={hidden ? 'true' : undefined}
    >
      {children}
    </span>
  );
}

/** A creature's sprite at a scale, mirrored when it faces left, its shiny colours when shiny. */
export function CreatureSprite({
  creature,
  scale,
  flip = false,
  class: extra,
}: {
  creature: Pick<Creature, 'species' | 'shiny'>;
  scale: number;
  flip?: boolean;
  class?: string;
}) {
  const palette = creature.shiny ? shinyPalette(creature.species) : undefined;
  const classes = ['vy-creature'];
  if (flip) classes.push('vy-flip');
  if (extra !== undefined) classes.push(extra);
  return (
    <Sprite
      sprite={creatureSpriteOrFallback(creature.species)}
      scale={scale}
      class={classes.join(' ')}
      {...(palette === undefined ? {} : { palette })}
    />
  );
}

/** A glyph sprite (`glyphs.ts`). */
export function Glyph({ id, scale = 2 }: { id: string; scale?: number }) {
  return <Sprite sprite={glyphOrUnknown(id)} scale={scale} />;
}

/** A plain sprite. */
export function Pic({
  sprite,
  scale = 2,
  class: extra,
}: {
  sprite: SpriteDef;
  scale?: number;
  class?: string;
}) {
  return (
    <Sprite sprite={sprite} scale={scale} {...(extra === undefined ? {} : { class: extra })} />
  );
}

/** An up arrow of pixels (evolution), drawn as an SVG of squares. */
export function UpArrow() {
  return (
    <svg
      class="vy-up"
      viewBox="0 0 5 6"
      width="10"
      height="12"
      aria-hidden="true"
      shape-rendering="crispEdges"
    >
      <path d="M2 0h1v1h1v1h1v1H3v3H2V3H0V2h1V1h1z" />
    </svg>
  );
}

/** What waits at a place: the glyph on an ink chip and a count when more than one, in a speech bubble above it. */
export function SpeechBubble({
  glyph,
  count,
  class: extra,
}: {
  glyph: string;
  count: number | null;
  class?: string | undefined;
}) {
  return (
    <span class={`vy-bubble${extra === undefined ? '' : ` ${extra}`}`} aria-hidden="true">
      <span class="vy-bubble-body">
        <span class="vy-bubble-pic">
          <Glyph id={glyph} scale={2} />
        </span>
        {count !== null && <span class="vy-time pix">{count}</span>}
      </span>
      <span class="vy-bubble-tail" />
    </span>
  );
}
