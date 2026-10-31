import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { blinkSprite, twinkleSpots, twinkleSprite } from './creature-life';
import { REST, subscribeLife, type LifeState } from './life-clock';
import { parseSprite, swapPalette, type SpriteDef } from './sprite-data';

/** A creature that blinks (and, when shiny, twinkles) now and then: the seed sets its own rhythm. */
export interface SpriteLife {
  /** The creature's or the species' id: two seeds blink out of step. */
  seed: string;
  shiny?: boolean;
}

interface SpriteProps {
  sprite: SpriteDef;
  /** Whole screen pixels per sprite pixel. */
  scale?: number;
  /** Text for screen readers. Without it the sprite is decorative and hidden from them. */
  alt?: string;
  /** Replaces palette entries, for example a shiny variant. */
  palette?: Readonly<Record<string, string>>;
  /** Idle bob (a CSS animation that stops when the player prefers reduced motion). */
  bob?: boolean;
  /** Blink now and then, and twinkle when shiny. Creature sprites only (16x16, the shared face). Still under reduced motion. */
  life?: SpriteLife;
  /** Shows one frame of the life and no timer (the workbench's held presets). */
  hold?: Partial<LifeState>;
  class?: string;
}

/** Draws pixel-art data onto a canvas at an integer scale, with sharp edges. */
export function Sprite({
  sprite,
  scale = 4,
  alt,
  palette,
  bob = false,
  life,
  hold,
  class: extra,
}: SpriteProps) {
  const [ticking, setTicking] = useState<LifeState>(REST);
  const seed = life?.seed;
  const shiny = life?.shiny === true;
  useEffect(() => {
    if (seed === undefined || hold !== undefined) return undefined;
    const stop = subscribeLife(seed, shiny, setTicking);
    return () => {
      stop();
      // The next listener starts at rest and only notifies on a change, so clear a blink or twinkle left over.
      setTicking(REST);
    };
  }, [seed, shiny, hold]);
  const state: LifeState =
    life === undefined ? REST : hold !== undefined ? { ...REST, ...hold } : ticking;
  const ref = useRef<HTMLCanvasElement>(null);
  const factor = Math.max(1, Math.floor(scale));
  const { blink, twinkle, spotIndex } = state;
  const parsed = useMemo(() => {
    let def = palette === undefined ? sprite : swapPalette(sprite, palette);
    if (blink) def = blinkSprite(def);
    if (twinkle !== 0) {
      const spots = twinkleSpots(sprite);
      const spot = spots[spotIndex % Math.max(1, spots.length)];
      if (spot !== undefined) def = twinkleSprite(def, spot, twinkle);
    }
    return parseSprite(def);
  }, [sprite, palette, blink, twinkle, spotIndex]);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, parsed.width * factor, parsed.height * factor);
    for (const cell of parsed.cells) {
      ctx.fillStyle = cell.colour;
      ctx.fillRect(cell.x * factor, cell.y * factor, factor, factor);
    }
  }, [parsed, factor]);

  const classes = ['sprite'];
  if (bob) classes.push('bob');
  if (extra !== undefined) classes.push(extra);
  return (
    <canvas
      ref={ref}
      class={classes.join(' ')}
      width={parsed.width * factor}
      height={parsed.height * factor}
      role={alt === undefined ? undefined : 'img'}
      aria-label={alt}
      aria-hidden={alt === undefined ? 'true' : undefined}
    />
  );
}
