import type { Slots } from './expedition-types';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import { slotsLine } from './trip-view';
import { Bar } from './ui/Bar';

/**
 * The open expedition slots as little squares (filled while a trip is out), and what opens the next one
 * as a progress line. `slots.next` comes from the server: more finished trips for the second slot, then
 * the sum of the explorers' ranks.
 */
export function SlotsStrip({ slots }: { slots: Slots }) {
  const line = slotsLine(slots);
  return (
    <section class="slots-strip" aria-label="Expedition slots">
      <p class="slots-head">
        <GlossaryTag entry="expedition-slot" look="text">
          Slots
        </GlossaryTag>
        <span class="slot-pips" aria-hidden="true">
          {Array.from({ length: slots.total }, (_, i) => (
            <i key={i} class={i < slots.used ? 'slot-pip used' : 'slot-pip'} />
          ))}
          {line.next !== null && (
            <span class="slot-pip locked">
              <Sprite sprite={glyphOrUnknown('lock')} scale={1} />
            </span>
          )}
        </span>
        <span class="muted">{line.use}</span>
      </p>
      {line.next !== null && (
        <>
          <Bar value={line.progress?.value ?? 0} max={line.progress?.max ?? 1} label={line.next} />
          <p class="muted slots-next">{line.next}</p>
        </>
      )}
    </section>
  );
}
