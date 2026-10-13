import { Stars } from './ExpeditionIcons';
import { GlossaryTag } from './Glossary';
import { tripsHereText, type ExplorerOption } from './send-view';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { ProgressTrack } from './ProgressTrack';
import { rankIndex, rankSteps } from './rank-track';
import { XpBar } from './XpBar';

const STEPS = rankSteps();

/**
 * Who goes: a radio list of creatures. One row each: its sprite, name and level; its explorer rank; the
 * XP bar with the current rank on the left and the next on the right; and its familiarity at the chosen
 * place (the stars and the trips there), because familiarity is a trait of the creature, not of the
 * place. Under the list, the rank track of the creature that goes: the previous, current and next rank
 * and what each unlocks. A creature that cannot go (away, on a job, rank too low for the place) is
 * listed but disabled, with the reason in words. Native radios: arrow keys and screen readers work as
 * usual.
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
  return (
    <>
      <fieldset class="picker explorer-picker">
        <legend>Who goes?</legend>
        {options.map((option) => {
          const { creature } = option;
          const selected = value === creature.id;
          const blocked = option.blocked !== null;
          return (
            <label
              key={creature.id}
              class={`pick${blocked ? ' busy' : ''}${selected ? ' on' : ''}`}
            >
              <input
                type="radio"
                name={name}
                value={creature.id}
                checked={selected}
                disabled={blocked}
                onChange={() => {
                  onChange(creature.id);
                }}
              />
              <Sprite sprite={creatureSpriteOrFallback(creature.species)} scale={3} />
              <span class="pick-text">
                <span class="pick-name pix">
                  {option.name} <span class="lvl">Lv {creature.level}</span>
                </span>
                <span class="pick-meta">
                  <GlossaryTag entry="explorer-rank" look="text">
                    Explorer rank
                  </GlossaryTag>{' '}
                  {option.rank}
                  {blocked && ` · ${option.blocked ?? ''}`}
                </span>
                <XpBar
                  value={option.xp.value}
                  max={option.xp.max}
                  label={`${option.name}'s explorer XP`}
                  {...(option.xp.text === undefined ? {} : { text: option.xp.text })}
                  startCap={option.xp.startCap}
                  {...(option.xp.endCap === undefined ? {} : { endCap: option.xp.endCap })}
                />
                <span class="pick-fam">
                  <GlossaryTag entry="familiarity" look="chip" class="tag">
                    Familiarity
                  </GlossaryTag>
                  <Stars
                    stars={option.stars}
                    label={`${String(option.stars)} of 3 stars at this place`}
                  />
                  <span class="muted">{tripsHereText(option.trips)}</span>
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
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
