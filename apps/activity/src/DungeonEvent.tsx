import type { DungeonEventView } from './dungeon-types';
import { ChoiceButton, ChoiceList } from './ui/ChoiceList';
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
      <ChoiceList label="What will you do?">
        {event.options.map((option, index) => (
          <ChoiceButton
            key={option.label}
            label={option.label}
            line={option.description}
            disabled={busy}
            onClick={() => {
              onPick(index === 0 ? 0 : 1);
            }}
          />
        ))}
      </ChoiceList>
    </RevealShell>
  );
}
