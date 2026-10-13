import type { ExpeditionLength } from './expedition-types';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import { lengthOptions } from './trip-view';

/**
 * The trip lengths this explorer can send (2, 6 and 12 h, and 24 h from a high enough rank), as a radio
 * group. One value per option: the clock and the hours. The time this explorer really takes (higher
 * ranks are quicker) is in the hover text and for screen readers, not as a second number. A length
 * this explorer cannot send yet is simply not listed: the rank track says when it opens.
 */
export function LengthPicker({
  name,
  rank,
  value,
  onChange,
}: {
  name: string;
  rank: number;
  value: ExpeditionLength;
  onChange: (length: ExpeditionLength) => void;
}) {
  const options = lengthOptions(rank);
  return (
    <fieldset class="lengths">
      <legend>How long?</legend>
      <div class="length-options">
        {options.map((option) => (
          <label
            key={option.id}
            class={`length-option${value === option.id ? ' on' : ''}`}
            title={`Takes ${option.takes} for this explorer`}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={value === option.id}
              aria-label={`${option.label}, takes ${option.takes} for this explorer`}
              onChange={() => {
                onChange(option.id);
              }}
            />
            <Sprite sprite={glyphOrUnknown('clock')} scale={3} />
            <span class="pix length-label">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
