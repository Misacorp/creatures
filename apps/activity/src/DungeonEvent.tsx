import type { DungeonEventView } from './dungeon-types';
import { RevealShell } from './ui/RevealShell';

/**
 * A mystery room: its name, the scene, and the two things the player may do, each with what it does
 * written out exactly (the odds of a gamble too). Picking one is the act; the server rolls any odds
 * and the run goes on at the map with the outcome in a line. The card comes into view when it opens.
 * All the words are content: drawn as text.
 */
export function DungeonEvent({
  event,
  busy,
  onPick,
}: {
  event: DungeonEventView;
  busy: boolean;
  /** The player picked option 0 or 1. */
  onPick: (option: 0 | 1) => void;
}) {
  return (
    <RevealShell
      id="dungeon-event-heading"
      title={event.name}
      class="dungeon-event"
      arrive
      footer={<></>}
    >
      <p class="event-scene">{event.text}</p>
      <ul class="event-options" aria-label="What will you do?">
        {event.options.map((option, index) => (
          <li key={option.label}>
            <button
              type="button"
              class="event-option"
              disabled={busy}
              onClick={() => {
                onPick(index === 0 ? 0 : 1);
              }}
            >
              <strong class="pix">{option.label}</strong> <span>{option.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </RevealShell>
  );
}
