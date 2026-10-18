/**
 * A small pixel armchair, drawn as an SVG of square cells in the text's own colour (no emoji, no picture
 * file), like the padlock of the slots. It marks the lounge: the Lounge button and the "Lounging" badge.
 * Decorative: the words next to it say what it is.
 */
const ROWS = [
  '.#######.',
  '.#######.',
  '#.#####.#',
  '#.#####.#',
  '#########',
  '#########',
  '.#.....#.',
  '.#.....#.',
] as const;

/** One square per filled cell, joined into the one path the icon draws. */
const PATH = ROWS.flatMap((row, y) =>
  [...row].flatMap((cell, x) => (cell === '#' ? [`M${String(x)} ${String(y)}h1v1h-1z`] : [])),
).join('');

export function ArmchairIcon({ class: extra }: { class?: string }) {
  return (
    <svg
      class={`armchair-icon${extra === undefined ? '' : ` ${extra}`}`}
      viewBox="0 0 9 8"
      width="18"
      height="16"
      aria-hidden="true"
      focusable="false"
      shape-rendering="crispEdges"
    >
      <path d={PATH} />
    </svg>
  );
}
