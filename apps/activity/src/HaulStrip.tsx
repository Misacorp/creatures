import type { ComponentChildren } from 'preact';
import type { ExpeditionLength } from './expedition-types';
import { GlossaryTag } from './Glossary';
import { GameIcon } from './ui/GameIcon';
import { PipRow } from './ui/PipRow';
import { kitLevels, type TripContext } from './boost-view';
import { expectedHaul, haulTitle } from './haul-view';

/**
 * "Expected haul": what this trip can bring, with the effects of the chosen supplies folded in, as a row
 * of icons. Each icon has a short word under it (and the fuller line as hover text and for screen
 * readers), and four pips that compare with the best any trip does; the pips a supply adds are lit in
 * the "gained" colour (Misa, 2026-10-21: no "+" marks). No chances are shown as numbers. With the
 * explorer's rank, the last icon is the end-of-trip choice, its chance in quarters (the word opens the
 * push-on help). It sits just above the Send button.
 */
export function HaulStrip({
  length,
  element,
  kit,
  summary,
  trip,
  rank = null,
  look = 'pips',
}: {
  /** The trip's settings in a line (`TripSummary`), under the heading. */
  summary?: ComponentChildren;
  length: ExpeditionLength;
  /** The element of the place (its shards drop here); null for a mixed place. */
  element: string | null;
  /** The chosen supplies' ids. */
  kit: readonly string[];
  /** The whole trip (place, explorer): the detail lines follow the boost brackets for it. */
  trip?: TripContext;
  /** The explorer's rank: adds the end-of-trip choice as the last icon. Null: no choice icon. */
  rank?: number | null;
  /** `pips`: four square pips. `bar`: the same four steps as one segmented bar, like the boss's HP. */
  look?: 'pips' | 'bar';
}) {
  const rows = expectedHaul(
    length,
    element,
    kit,
    trip === undefined ? null : kitLevels(trip, kit),
    rank,
  );
  return (
    <section class="haul" aria-labelledby="haul-title">
      <h4 id="haul-title" class="label">
        Expected haul
      </h4>
      {summary}
      <ul class={look === 'bar' ? 'worth bars' : 'worth'} aria-label={haulTitle(length, kit)}>
        {rows.map((row) => (
          <li
            key={row.key}
            class={`worth-item${row.level === 0 ? ' none' : ''}${row.boosted ? ' boosted' : ''}`}
            title={row.detail}
          >
            <span class="worth-icon">
              <GameIcon icon={row.icon} scale={4} />
            </span>
            {/* Four steps against the best a trip does; the supplies' steps in their own colour. */}
            <PipRow
              count={4}
              lit={row.level}
              mark={(i) => (i >= row.baseLevel && i < row.level ? 'raised' : undefined)}
            />
            <span class="worth-name">
              {row.key === 'choice' ? (
                <GlossaryTag entry="push-on" look="text">
                  {row.label}
                </GlossaryTag>
              ) : (
                row.label
              )}
            </span>
            <span class="visually-hidden">{row.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
