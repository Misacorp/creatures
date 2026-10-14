import { useEffect, useMemo, useRef } from 'preact/hooks';
import { parseSprite, swapPalette, type SpriteDef } from './sprite-data';

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
  class?: string;
}

/** Draws pixel-art data onto a canvas at an integer scale, with sharp edges. */
export function Sprite({
  sprite,
  scale = 4,
  alt,
  palette,
  bob = false,
  class: extra,
}: SpriteProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const factor = Math.max(1, Math.floor(scale));
  const parsed = useMemo(
    () => parseSprite(palette === undefined ? sprite : swapPalette(sprite, palette)),
    [sprite, palette],
  );

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
