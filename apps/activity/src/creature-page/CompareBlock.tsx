import type { ItemCompare } from './compare-view';

/**
 * What Equip would change for this creature: stats after the swap against now as small deltas ("Attack +12",
 * "HP −30"), then a line for each set bonus gained or lost. The sign is in the words, so colour (green up,
 * red down) is never the only signal; a screen reader hears "plus" and "minus". Plain text only. It sits next
 * to the Equip button, so it reads as the answer to "what does Equip do?".
 */
export function CompareBlock({ compare }: { compare: ItemCompare }) {
  const lines = [...compare.stats, ...compare.sets];
  if (lines.length === 0) {
    return <p class="ip-compare-none">No stat change</p>;
  }
  return (
    <ul class="ip-compare" aria-label="Equipping it changes">
      {lines.map((line) => (
        <li key={line.key} class={line.kind}>
          <span aria-hidden="true">{line.text}</span>
          <span class="visually-hidden">{line.spoken}</span>
        </li>
      ))}
    </ul>
  );
}
