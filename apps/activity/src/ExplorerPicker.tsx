import { Tag } from './ui/Tag';
import { Stars } from './ExpeditionIcons';
import { busyKind } from './gear-view';
import { tripsHereText, type ExplorerOption } from './send-view';
import { CreatureList } from './ui/CreatureList';
import { baseOption, type PickerOption as Row } from './roster-picker';
import { ProgressTrack } from './ProgressTrack';
import { rankIndex, rankSteps } from './rank-track';
import { XpBar } from './XpBar';

const STEPS = rankSteps();

/** An explorer row: the list's row plus what the explorer block under the name draws. */
type ExplorerRow = Row & { explorer: ExplorerOption };

/**
 * Who goes: the shared creature list (`ui/CreatureList`) in `choose` mode (native radios). One row each: its
 * sprite, name and level; under them (the `more` block) its explorer rank, the XP bar with the current rank on
 * the left and the next on the right, and its familiarity at the chosen place (the stars and the trips there),
 * because familiarity is a trait of the creature, not of the place. Under the list, the rank track of the
 * creature that goes: the previous, current and next rank and what each unlocks. A creature that cannot go
 * (away, on a job, rank too low for the place) is listed but disabled, with the reason under its name.
 */
export function ExplorerPicker({
  name,
  options,
  value,
  onChange,
}: {
  /** Names the radio group; unique on the page. */
  name: string;
  options: readonly ExplorerOption[];
  value: string | null;
  onChange: (creatureId: string) => void;
}) {
  const chosen = options.find((o) => o.creature.id === value);
  const rows = options.map((explorer): ExplorerRow => {
    const kind = busyKind(explorer.creature);
    return {
      ...baseOption(explorer.creature),
      name: explorer.name,
      disabled: explorer.blocked,
      ...(kind === null || explorer.blocked === null ? {} : { busy: kind }),
      explorer,
    };
  });
  return (
    <>
      <CreatureList
        options={rows}
        selection={{ mode: 'choose', name, value, onChange, legend: 'Who goes?' }}
        fieldClass="explorer-picker"
        more={({ explorer: option }) => (
          <>
            <XpBar
              value={option.xp.value}
              max={option.xp.max}
              label={`${option.name}'s explorer XP`}
              {...(option.xp.text === undefined ? {} : { text: option.xp.text })}
              startCap={option.xp.startCap}
              {...(option.xp.endCap === undefined ? {} : { endCap: option.xp.endCap })}
              kind="explorer"
            />
            <span class="pick-fam">
              <Tag entry="familiarity">Familiarity</Tag>
              <Stars
                stars={option.stars}
                label={`${String(option.stars)} / 3 stars at this place`}
              />
              <span class="muted">{tripsHereText(option.trips)}</span>
            </span>
          </>
        )}
      />
      {chosen !== undefined && (
        <ProgressTrack
          steps={STEPS}
          current={rankIndex(chosen.rank)}
          label={`${chosen.name}'s explorer rank`}
        />
      )}
    </>
  );
}
