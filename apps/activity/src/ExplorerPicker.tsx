import { GlossaryTag } from './Glossary';
import { Stars } from './ExpeditionIcons';
import { cssVars } from './css-vars';
import type { ExplorerOption } from './send-view';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';

/**
 * Who goes: a radio list of creatures, each with its sprite, level, explorer rank, XP bar and its
 * familiarity stars at the chosen place. A creature that cannot go (away, on a job, rank too low for the
 * place) is listed but disabled, with the reason in words. Native radios: arrow keys and screen readers
 * work as usual.
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
  return (
    <fieldset class="picker explorer-picker">
      <legend>Who goes?</legend>
      {options.map((option) => {
        const { creature } = option;
        const selected = value === creature.id;
        const blocked = option.blocked !== null;
        return (
          <label key={creature.id} class={`pick${blocked ? ' busy' : ''}${selected ? ' on' : ''}`}>
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
                {blocked ? (
                  option.blocked
                ) : (
                  <>
                    Explorer rank {option.rank}
                    {' · '}
                    {option.creature.explorer.trips}{' '}
                    {option.creature.explorer.trips === 1 ? 'trip' : 'trips'}
                  </>
                )}
              </span>
              <span
                class="xp pick-xp"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(option.bar.pct)}
                aria-label={`${option.name}'s explorer XP: ${option.bar.text}`}
              >
                <span ref={cssVars({ '--pct': `${String(option.bar.pct)}%` })} />
              </span>
              <span class="pick-meta">{option.bar.text}</span>
              <span class="pick-stars">
                <Stars
                  stars={option.stars}
                  label={`${String(option.stars)} of 3 stars at this place`}
                />
              </span>
            </span>
          </label>
        );
      })}
      <p class="muted pick-help">
        <GlossaryTag entry="explorer-rank" look="text">
          Explorer rank
        </GlossaryTag>{' '}
        and{' '}
        <GlossaryTag entry="familiarity" look="text">
          familiarity
        </GlossaryTag>{' '}
        belong to each creature, so choose who goes where.
      </p>
    </fieldset>
  );
}
