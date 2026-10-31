/**
 * Small shared parts of the valley prototype: a creature sprite placed in a scene, the pixel speech
 * bubble and its pictures, the window-size and clock hooks, and the leave door of an interior.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { shinyPalette } from '../../art';
import { cssVars } from '../../css-vars';
import { glyphOrUnknown } from '../../glyphs';
import { ItemSprite } from '../../GearArt';
import { creatureSpriteOrFallback } from '../../sprites/creature-sprites';
import { Sprite } from '../../sprites/Sprite';
import type { SpriteDef } from '../../sprites/sprite-data';
import { CreatureIcon } from '../../CreatureIcon';
import type { Creature } from '../../api';
import type { ProtoWorld } from '../world';
import type { Bubble } from './valley-logic';

/** Whether this is a screenshot (`&bare=1`): motion holds still so every shot is the same. */
export function isStill(): boolean {
  return typeof window !== 'undefined' && /[?&]bare=1/.test(window.location.hash);
}

/** A tick that counts up every `ms` while `on`; holds at 0 otherwise. */
export function useTick(ms: number, on: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!on) return undefined;
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
    }, ms);
    return () => {
      window.clearInterval(id);
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
}: {
  x: number;
  y: number;
  class?: string | undefined;
  children: ComponentChildren;
  hidden?: boolean;
}) {
  return (
    <span
      class={`pv-at${extra === undefined ? '' : ` ${extra}`}`}
      ref={cssVars({ '--x': `${String(Math.round(x))}px`, '--y': `${String(Math.round(y))}px` })}
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
  const classes = ['pv-creature'];
  if (flip) classes.push('pv-flip');
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
      class="pv-up"
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

/** One empty raid slot square (dashed), for the arena's bubble. */
function SlotSquare() {
  return <span class="pv-slot-square" />;
}

/**
 * The bubble's picture for a need: the explorer's face; the crafted item with "!"; one empty slot per creature
 * to place; the lantern; the evolving creature's face and an up arrow; the trophy and the closing time.
 */
export function BubbleArt({ bubble, world }: { bubble: Bubble; world: ProtoWorld }) {
  const need = bubble.need;
  if (bubble.picture !== undefined) {
    return (
      <>
        {bubble.picture.species !== undefined && (
          <CreatureIcon creature={{ species: bubble.picture.species, shiny: false }} />
        )}
        <span class="pv-bubble-pic">
          <Glyph id={bubble.picture.glyph} scale={3} />
        </span>
      </>
    );
  }
  if (need === null) return null;
  switch (need.kind) {
    case 'trip-home': {
      const c = world.creatures.find((x) => x.id === need.creatureId);
      return c === undefined ? <Glyph id="compass" /> : <CreatureIcon creature={c} />;
    }
    case 'job-ready': {
      const job = world.jobs.find((j) => j.id === need.jobId);
      return (
        <>
          <ItemSprite baseId={job?.input.baseId ?? 'kelp-cap'} scale={2} />
          <span class="pv-bang pix">!</span>
        </>
      );
    }
    case 'raid':
      return (
        <>
          {Array.from({ length: need.needed - need.placed }, (_, i) => (
            <SlotSquare key={i} />
          ))}
        </>
      );
    case 'dungeon':
      return <Glyph id="lantern" scale={3} />;
    case 'evolve': {
      const c = world.creatures.find((x) => x.id === need.creatureId);
      return (
        <>
          {c !== undefined && <CreatureIcon creature={c} />}
          <UpArrow />
        </>
      );
    }
    case 'games':
      return (
        <>
          <Glyph id="trophy" scale={2} />
          <span class="pv-time pix">{bubble.time}</span>
        </>
      );
  }
}

/** The pixel speech bubble: ink outline, cream fill, a stepped tail, no rounding. Decorative (the button speaks). */
export function SpeechBubble({
  children,
  class: extra,
}: {
  children: ComponentChildren;
  class?: string | undefined;
}) {
  return (
    <span class={`pv-bubble${extra === undefined ? '' : ` ${extra}`}`} aria-hidden="true">
      <span class="pv-bubble-body">{children}</span>
      <span class="pv-bubble-tail" />
    </span>
  );
}

/** A name plate: bone words in the pixel font on a solid ink plate (buildings, owners, forms). */
export function Plate({ children }: { children: ComponentChildren }) {
  return <span class="pv-plate pix">{children}</span>;
}
