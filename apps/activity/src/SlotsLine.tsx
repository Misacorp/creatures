import type { Slots } from './expedition-types';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import { slotsLine } from './trip-view';
import { Bar } from './ui/Bar';

/**
 * The phone map's one-line slots header, above the "out now" strip: "3 / 4 slots in use" and, while a
 * slot is still to be earned, a lock, a small bar and its count ("11 / 26"); the full sentence (the shelf's
 * words) is there for screen readers.
 */
export function SlotsLine({ slots }: { slots: Slots }) {
  const line = slotsLine(slots);
  return (
    <p class="slots-line pix-panel" aria-label="Expedition slots">
      <span>{line.use}</span>
      {line.next !== null && (
        <span class="trip-shelf-next muted">
          <Sprite sprite={glyphOrUnknown('lock')} scale={2} />
          <span class="visually-hidden">{line.next}</span>
          <span class="slots-line-next" aria-hidden="true">
            {line.progress === null
              ? ''
              : `${String(line.progress.value)} / ${String(line.progress.max)}`}
          </span>
          <Bar
            class="trip-shelf-bar"
            value={line.progress?.value ?? 0}
            max={line.progress?.max ?? 1}
            label={line.next}
          />
        </span>
      )}
    </p>
  );
}
