import { RULES, basicAbilities } from '@creatures/game';
import { AutoFireToggle } from './AutoFireToggle';
import { abilityName, abilityPlanText, creatureAbilityRows } from './live';
import type { AbilityPreview, TeamCreatureView } from './raid-api';

/**
 * "Your finale abilities": the basic ability (one of the four basic abilities in the content pack,
 * picked here) and the abilities of the team creatures that have reached their unlock level. Locked
 * ones are listed too, so players can see what training a creature would give.
 */
export function AbilityPicker({
  current,
  abilities,
  team,
  editable,
  busy,
  onPick,
  onAutoFire,
}: {
  current: { abilityId: string; chosen: boolean };
  /** What the player brings with their current team (`you.abilities` of the Raid view). */
  abilities: readonly AbilityPreview[];
  team: readonly TeamCreatureView[];
  /** False once the finale has started: the pick is locked. */
  editable: boolean;
  busy: boolean;
  onPick: (abilityId: string) => void;
  /** Sets the Auto fire preference of one ability: `target` is `basic` or a team creature's id. */
  onAutoFire: (target: string, on: boolean) => void;
}) {
  const creatureRows = creatureAbilityRows(abilities, team);
  const basicAutoFire = abilities.find((a) => a.creatureId === null)?.autoFire ?? true;
  return (
    <section class="raid-section" aria-labelledby="raid-ability-heading">
      <h3 id="raid-ability-heading">Your finale abilities</h3>
      <h4>Basic ability</h4>
      <p>
        Your basic ability: <strong>{abilityName(current.abilityId)}</strong>{' '}
        <span class="muted">
          {current.chosen ? '(chosen by you)' : '(assigned for you: pick one to choose)'}
        </span>
      </p>
      <p class="muted">
        {editable
          ? "Everyone brings one basic ability to the live Sunday finale. It is weaker than a trained creature's ability. If you do nothing it still fires on its own. You can change your pick until the finale starts."
          : 'The finale has started, so your pick is locked.'}
      </p>
      <p class="ability-auto">
        <AutoFireToggle
          on={basicAutoFire}
          disabled={busy || !editable}
          label={`your basic ability, ${abilityName(current.abilityId)}`}
          onToggle={(on) => {
            onAutoFire('basic', on);
          }}
        />
        <span class="muted">
          {basicAutoFire
            ? 'Fires by itself in its round.'
            : "Waits for you in the finale. It still fires in the last round if you don't."}
        </span>
      </p>
      <ul class="cards ability-cards">
        {basicAbilities().map((def) => {
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
      <h4>Creature abilities</h4>
      {creatureRows.length === 0 ? (
        <p class="muted">
          You have no team creatures yet. Every creature gets a finale ability at level{' '}
          {String(RULES.abilities.unlockLevel)}.
        </p>
      ) : (
        <>
          <p class="muted">
            Each team creature at the unlock level adds one more ability to the finale. Each fires
            once.
          </p>
          <ul class="plain-list creature-abilities">
            {creatureRows.map((row) => (
              <li key={row.creatureId} class={row.unlocked ? 'live-ability you' : 'live-ability'}>
                <strong>{row.title}</strong>. <span>{row.effect}</span>{' '}
                <span class={row.unlocked ? 'muted' : 'locked'}>{row.status}</span>
                {row.unlocked && (
                  <span class="ability-auto">
                    <AutoFireToggle
                      on={row.autoFire}
                      disabled={busy || !editable}
                      label={row.title}
                      onToggle={(on) => {
                        onAutoFire(row.creatureId, on);
                      }}
                    />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
