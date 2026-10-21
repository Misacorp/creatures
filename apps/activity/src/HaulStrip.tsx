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
 * readers), and up to four pips that compare with the best any trip does. A "+" marks what a supply
 * raises, one to four of them for the bracket of the boost on this trip (`boost-view.ts`). No chances are
 * shown as numbers. When the supplies make the end-of-trip choice likely or certain, a last "Choice" icon
 * says so (the fork, "Likely" or "Guaranteed" in place of the pips; the word opens the push-on help). It
 * sits just above the Send button.
 */
export function HaulStrip({
  length,
  element,
  kit,
  summary,
  trip,
  choice = 'none',
}: {
  /** The trip's settings in a line (`TripSummary`), under the heading. */
  summary?: ComponentChildren;
  length: ExpeditionLength;
  /** The element of the place (its shards drop here); null for a mixed place. */
  element: string | null;
  /** The chosen supplies' ids. */
  kit: readonly string[];
  /** The whole trip (place, explorer): the "+" marks follow the boost brackets for it. Absent: a plain mark. */
  trip?: TripContext;
  /** The end-of-trip choice the supplies give (`kitChoice`); none draws no Choice icon. */
  choice?: 'guaranteed' | 'likely' | 'none';
}) {
  const rows = expectedHaul(length, element, kit, trip === undefined ? null : kitLevels(trip, kit));
  return (
    <section class="haul" aria-labelledby="haul-title">
      <h4 id="haul-title" class="label">
        Expected haul
      </h4>
      {summary}
      <ul class="worth" aria-label={haulTitle(length, kit)}>
        {rows.map((row) => (
          <li
            key={row.key}
            class={`worth-item${row.level === 0 ? ' none' : ''}${row.boosted ? ' boosted' : ''}`}
            title={row.detail}
          >
            <GameIcon icon={row.icon} scale={4} />
            {/* Four pips: how much of the best a trip brings (the words are the label). */}
            <PipRow count={4} lit={row.level} />
            <span class="worth-name">
              {row.label}
              {row.boosted && (
                <span class="worth-plus" aria-hidden="true">
                  {` ${'+'.repeat(Math.max(1, row.bracket))}`}
                </span>
              )}
            </span>
            <span class="visually-hidden">
              {row.detail}
              {row.boosted && row.bracket === 0 ? ', raised by your supplies' : ''}
            </span>
          </li>
        ))}
        {choice !== 'none' && (
          <li class={`worth-item worth-choice ${choice}`}>
            <GameIcon icon={{ kind: 'glyph', id: 'fork' }} scale={4} />
            <span class="worth-chance" aria-hidden="true">
              {choice === 'guaranteed' ? 'Guaranteed' : 'Likely'}
            </span>
            <span class="worth-name">
              <GlossaryTag entry="push-on" look="text">
                Choice
              </GlossaryTag>
            </span>
            <span class="visually-hidden">
              {choice === 'guaranteed'
                ? ': guaranteed at the end of the trip'
                : ': likely at the end of the trip'}
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}
