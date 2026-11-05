import type { PickerOption } from '../roster-picker';
import { CreatureList } from './CreatureList';

import { PickSheet } from './PickSheet';
interface RosterPickerProps {
  /** The dialog's name, which also heads it ("Choose a creature for Middle, lane 3"). */
  title: string;
  /** One line under the title ("2 / 3 placed"). Without one, no line is drawn. */
  status?: string;
  options: readonly PickerOption[];
  /** What an option says for a creature that is placed already ("On the board · moves here"). */
  placedNote: string;
  /** Show each option's line about what it would do in the slot (the effect preview). */
  showEffects: boolean;
  /** Put each option's reason ("Away", "On a job") at the right of its row (see `CreatureList`). */
  reasonSide?: boolean;
  /** The slot that opened it: focus goes back there when it closes. */
  anchor: () => HTMLElement | null;
  onPick: (creatureId: string) => void;
  onClose: () => void;
}

/**
 * The creature picker of the Raid Roster and the dungeon team: a `PickSheet` with a listbox of the player's
 * creatures (`CreatureList`, which says what each option shows).
 */
export function RosterPicker(props: RosterPickerProps) {
  return (
    <PickSheet
      title={props.title}
      {...(props.status === undefined ? {} : { status: props.status })}
      class="roster-picker"
      anchor={props.anchor}
      onClose={props.onClose}
    >
      <CreatureList
        options={props.options}
        selection={{ mode: 'pick', onPick: props.onPick }}
        placedNote={props.placedNote}
        showEffects={props.showEffects}
        {...(props.reasonSide === true ? { reasonSide: true } : {})}
      />
    </PickSheet>
  );
}
