import { Tag } from './ui/Tag';
import type { PickerOption } from './gear-view';
import { busyKind, durationCountItem } from './gear-view';
import { CountBadge } from './ui/CountBadge';
import { CreatureList } from './ui/CreatureList';
import { baseOption, type PickerOption as Row } from './roster-picker';

/** A worker row: the list's row plus how long the job takes with this creature. */
export type WorkerRow = Row & { durationMs: number };

/**
 * One creature of a job's list as a `CreatureList` row: its Crafting level as the note, the reason it cannot
 * work as the row's reason (a busy creature gets the status badge unless `plainReason`, for a row that is
 * greyed for another reason such as "Needs level 3"), and its time for the job.
 */
export function workerRow(
  { creature, level, busy, durationMs }: PickerOption,
  plainReason = false,
): WorkerRow {
  const kind = plainReason ? null : busyKind(creature);
  return {
    ...baseOption(creature),
    note: `Crafting level ${String(level)}`,
    disabled: busy,
    ...(kind === null ? {} : { busy: kind }),
    durationMs,
  };
}

/** The clock badge at the right of a row that can do the job. */
export function workerSide(row: WorkerRow) {
  return <CountBadge {...durationCountItem(row.durationMs)} />;
}

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
  const rows = options.map((option) => workerRow(option));
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
      side={workerSide}
    />
  );
}
