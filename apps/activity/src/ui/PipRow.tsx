interface PipRowProps {
  count: number;
  /** How many pips are lit (the first ones), or which of them are. */
  lit: number | ((index: number) => boolean);
  /**
   * A mark for one pip: `fest` for a bonus day (a gold ring until it is lit), `raised` for a step a
   * supply adds (the Expected haul; lit in the "gained" colour).
   */
  mark?: (index: number) => 'fest' | 'raised' | undefined;
  /** `md` is the larger pip of the dungeon screens. */
  size?: 'sm' | 'md';
  /**
   * Says what the row means, in words. Without it the row is decoration for text next to it and is
   * hidden from assistive technology.
   */
  label?: string;
}

/** A small row of square pips: steps of something, some of them lit. */
export function PipRow({ count, lit, mark, size = 'sm', label }: PipRowProps) {
  const isLit = typeof lit === 'number' ? (i: number) => i < lit : lit;
  const spoken = label !== undefined;
  return (
    <span
      class={size === 'md' ? 'pips md' : 'pips'}
      role={spoken ? 'img' : undefined}
      aria-label={label}
      aria-hidden={spoken ? undefined : 'true'}
    >
      {Array.from({ length: count }, (_, i) => {
        const classes = [isLit(i) ? 'on' : '', mark?.(i) ?? ''].filter((c) => c !== '').join(' ');
        return <i key={i} class={classes === '' ? undefined : classes} />;
      })}
    </span>
  );
}
