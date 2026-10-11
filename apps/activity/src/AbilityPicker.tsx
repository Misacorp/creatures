import { content } from '@creatures/game';
import { abilityName, abilityPlanText } from './live';

/** The player's finale ability, one of the four from the content pack. */
export function AbilityPicker({
  current,
  editable,
  busy,
  onPick,
}: {
  current: { abilityId: string; chosen: boolean };
  /** False once the finale has started: the pick is locked. */
  editable: boolean;
  busy: boolean;
  onPick: (abilityId: string) => void;
}) {
  return (
    <section class="raid-section" aria-labelledby="raid-ability-heading">
      <h3 id="raid-ability-heading">Finale ability</h3>
      <p>
        Your ability: <strong>{abilityName(current.abilityId)}</strong>{' '}
        <span class="muted">
          {current.chosen ? '(chosen by you)' : '(assigned for you: pick one to choose)'}
        </span>
      </p>
      <p class="muted">
        {editable
          ? 'Each player gets one ability for the live Sunday finale. If you do nothing it still fires on its own, at full strength. You can change your pick until the finale starts.'
          : 'The finale has started, so your pick is locked.'}
      </p>
      <ul class="cards ability-cards">
        {content.finaleAbilities.map((def) => {
          const selected = def.id === current.abilityId;
          const classes = selected ? 'ability-card selected' : 'ability-card';
          return (
            <li key={def.id}>
              <button
                type="button"
                class={classes}
                aria-pressed={selected}
                disabled={busy || !editable || (selected && current.chosen)}
                onClick={() => {
                  onPick(def.id);
                }}
              >
                <span class="chip-name">
                  {def.name}
                  {selected && <span class="badge good ability-badge">Your pick</span>}
                </span>
                <span>{def.description}</span>
                <span class="muted">{abilityPlanText(def)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
