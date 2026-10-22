import { DungeonTreasure } from './DungeonTreasure';
import type { DungeonEventView } from './dungeon-types';
import { ChoiceButton, ChoiceList } from './ui/ChoiceList';
import { RevealShell } from './ui/RevealShell';

/**
 * A mystery room: its name, the scene, and the two things the player may do, each with what it does
 * written out exactly (the odds of a gamble too). Picking one is the act; the server rolls any odds
 * and the run goes on at the map with the outcome in a line. The card comes into view when it opens.
 * A rare room that rolled a prize (the Blue Chasm) shows it between the scene and the choice, so the player
 * decides knowing what is across. All the words are content: drawn as text.
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
      pix
      arrive
      footer={<></>}
    >
      <p class="event-scene prose">{event.text}</p>
      {event.treasure !== undefined && (
        <section class="event-treasure" aria-labelledby="event-treasure-heading">
          <h4 id="event-treasure-heading" class="pix">
            The treasure
          </h4>
          <DungeonTreasure treasure={event.treasure} />
        </section>
      )}
      <ChoiceList label="What will you do?">
        {event.options.map((option, index) => (
          <ChoiceButton
            key={option.label}
            label={option.label}
            line={
              option.blocked === undefined
                ? option.description
                : `${option.description} ${option.blocked}`
            }
            disabled={busy || option.blocked !== undefined}
            onClick={() => {
              onPick(index === 0 ? 0 : 1);
            }}
          />
        ))}
      </ChoiceList>
    </RevealShell>
  );
}
