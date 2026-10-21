import { Tag } from './ui/Tag';
import type { PickerOption } from './gear-view';
import { busyKind, durationCountItem } from './gear-view';
import { CountBadge } from './ui/CountBadge';
import { CreatureList } from './ui/CreatureList';
import { baseOption, type PickerOption as Row } from './roster-picker';

/** A worker row: the list's row plus how long the job takes with this creature. */
type WorkerRow = Row & { durationMs: number };

/**
 * Who does the work: the shared creature list (`ui/CreatureList`) in `choose` mode (native radios) with each
 * one's Crafting level as the quiet line and how long the job would take with it as a clock badge at the right.
 * A creature that is busy is listed but cannot be picked; the row says why at its right (the status badge).
 */
export function CreaturePicker({
  name,
  options,
  value,
  onChange,
}: {
  /** Names the radio group; unique on the page. */
  name: string;
  options: readonly PickerOption[];
  value: string | null;
  onChange: (creatureId: string) => void;
}) {
  const rows = options.map(({ creature, level, busy, durationMs }): WorkerRow => {
    const kind = busyKind(creature);
    return {
      ...baseOption(creature),
      note: `Crafting level ${String(level)}`,
      disabled: busy,
      ...(kind === null ? {} : { busy: kind }),
      durationMs,
    };
  });
  return (
    <CreatureList
      options={rows}
      selection={{
        mode: 'choose',
        name,
        value,
        onChange,
        legend: (
          <>
            Who does the work? <Tag entry="skill-crafting">Crafting skill</Tag>
          </>
        ),
      }}
      chips={false}
      reasonSide
      side={(row) => <CountBadge {...durationCountItem(row.durationMs)} />}
    />
  );
}
