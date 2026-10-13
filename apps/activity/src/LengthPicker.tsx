import type { ExpeditionLength } from './expedition-types';
import { ExpIcon, Pips } from './ExpeditionIcons';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import { lengthOptions, nextLengthUnlock, tripWorth, lengthLabel } from './trip-view';

/**
 * What a trip is good for, in pictures: a row of small icons (catch rolls, explorer XP, scrap, shards,
 * glimmer, a blueprint, a found supply, a journal page), each with up to four pips that show how it
 * compares with the best any trip length does. The exact chance or amount is in each one's label.
 */
export function WorthStrip({
  length,
  element,
}: {
  length: ExpeditionLength;
  element: string | null;
}) {
  const rows = tripWorth(length, element);
  return (
    <ul class="worth" aria-label={`What a ${lengthLabel(length)} trip is good for`}>
      {rows.map((row) => (
        <li
          key={row.key}
          class={row.level === 0 ? 'worth-item none' : 'worth-item'}
          title={row.label}
        >
          <ExpIcon icon={row.icon} scale={4} />
          <Pips level={row.level} />
          <span class="visually-hidden">{row.label}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The trip lengths this explorer can send, as a radio group (2, 6 and 12 h, and 24 h from rank 5), each
 * with the time it takes this explorer (higher ranks are quicker) and its catch rolls, and the strip of
 * what the chosen length is good for. A length that opens at a higher rank is mentioned, not hidden.
 */
export function LengthPicker({
  name,
  rank,
  value,
  element,
  onChange,
}: {
  name: string;
  rank: number;
  value: ExpeditionLength;
  /** The element of the place (its shards drop here); null for a mixed place. */
  element: string | null;
  onChange: (length: ExpeditionLength) => void;
}) {
  const options = lengthOptions(rank);
  const next = nextLengthUnlock(rank);
  return (
    <fieldset class="lengths">
      <legend>How long?</legend>
      <div class="length-options">
        {options.map((option) => (
          <label key={option.id} class={`length-option${value === option.id ? ' on' : ''}`}>
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={value === option.id}
              onChange={() => {
                onChange(option.id);
              }}
            />
            <span class="pix length-label">{option.label}</span>
            <span class="muted length-takes">
              <Sprite sprite={glyphOrUnknown('clock')} scale={2} /> {option.takes}
            </span>
          </label>
        ))}
      </div>
      {next !== null && (
        <p class="muted">
          {lengthLabel(next.length)} trips open at{' '}
          <GlossaryTag entry="explorer-rank" look="text">
            explorer rank
          </GlossaryTag>{' '}
          {next.rank}.
        </p>
      )}
      <p class="label">A {lengthLabel(value)} trip is good for</p>
      <WorthStrip length={value} element={element} />
      <p class="muted">
        Longer trips are worth much more than the hours they take. The pips compare with the best a
        trip does.
      </p>
    </fieldset>
  );
}
