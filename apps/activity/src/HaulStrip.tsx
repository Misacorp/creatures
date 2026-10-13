import type { ExpeditionLength } from './expedition-types';
import { ExpIcon, Pips } from './ExpeditionIcons';
import { expectedHaul, haulTitle } from './haul-view';

/**
 * "Expected haul": what this trip can bring, with the effects of the chosen supplies folded in, as a row
 * of icons. Each icon has a short word under it (and the fuller line as hover text and for screen
 * readers), and up to four pips that compare with the best any trip does. A "+" marks what a supply
 * raises. No chances are shown as numbers. It sits just above the Send button.
 */
export function HaulStrip({
  length,
  element,
  kit,
}: {
  length: ExpeditionLength;
  /** The element of the place (its shards drop here); null for a mixed place. */
  element: string | null;
  /** The chosen supplies' ids. */
  kit: readonly string[];
}) {
  const rows = expectedHaul(length, element, kit);
  return (
    <section class="haul" aria-labelledby="haul-title">
      <h4 id="haul-title" class="label">
        Expected haul
      </h4>
      <p class="muted haul-for">{haulTitle(length, kit)}</p>
      <ul class="worth" aria-label={haulTitle(length, kit)}>
        {rows.map((row) => (
          <li
            key={row.key}
            class={`worth-item${row.level === 0 ? ' none' : ''}${row.boosted ? ' boosted' : ''}`}
            title={row.detail}
          >
            <ExpIcon icon={row.icon} scale={4} />
            <Pips level={row.level} />
            <span class="worth-name">
              {row.label}
              {row.boosted && (
                <span class="worth-plus" aria-hidden="true">
                  {' +'}
                </span>
              )}
            </span>
            <span class="visually-hidden">
              {row.detail}
              {row.boosted ? ', raised by your supplies' : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
