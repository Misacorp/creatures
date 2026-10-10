import { trainingCost } from '@creatures/game';
import { useState } from 'preact/hooks';
import type { Creature, GameState } from './api';
import {
  capitalize,
  creatureName,
  elementName,
  fusionStars,
  getSpecies,
  isFirstOnServer,
  speciesName,
} from './game';

interface Props {
  state: GameState;
  busy: boolean;
  onTrain: (creature: Creature) => void;
  onRename: (creature: Creature, nickname: string | null) => void;
}

function RenameForm({
  creature,
  busy,
  onRename,
}: {
  creature: Creature;
  busy: boolean;
  onRename: Props['onRename'];
}) {
  const [draft, setDraft] = useState(creature.nickname ?? '');
  const inputId = `nickname-${creature.id}`;
  return (
    <details class="rename">
      <summary>Rename</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          // Empty means "clear the nickname"; the server does the real cleaning and validation.
          onRename(creature, draft.trim() === '' ? null : draft);
        }}
      >
        <label for={inputId}>Nickname for {speciesName(creature.species)}</label>
        <input
          id={inputId}
          type="text"
          value={draft}
          maxLength={40}
          autoComplete="off"
          onInput={(event) => {
            setDraft(event.currentTarget.value);
          }}
        />
        <button type="submit" disabled={busy}>
          Save nickname
        </button>
      </form>
    </details>
  );
}

function CreatureCard({
  creature,
  state,
  busy,
  onTrain,
  onRename,
}: { creature: Creature; state: GameState } & Omit<Props, 'state'>) {
  const species = getSpecies(creature.species);
  const cost = creature.trainCost;
  const canAfford = cost !== null && state.balances.bait >= cost;
  const discounted = cost !== null && cost < trainingCost(creature.level);
  const trainLabel =
    cost === null
      ? 'Max level'
      : creature.away
        ? `Train (${String(cost)} Bait), away`
        : `Train (${String(cost)} Bait)`;
  return (
    <li class="card-item">
      <h3>{creatureName(creature)}</h3>
      {creature.nickname !== null && <p class="muted">{speciesName(creature.species)}</p>}
      <p class="tags">
        {species !== undefined && (
          <>
            <span class="tag">{elementName(species.element)}</span>
            <span class="tag">{capitalize(species.rarity)}</span>
            <span class="tag">{capitalize(species.role)}</span>
          </>
        )}
        {creature.shiny && <span class="badge shiny">Shiny</span>}
        {creature.away && <span class="badge away">Away</span>}
        {isFirstOnServer(creature, state.serverFirsts) && (
          <span class="badge first">First on server</span>
        )}
      </p>
      <p>
        Level {creature.level} / {creature.levelCap}
      </p>
      <p class="stats">
        HP {creature.stats.hp} · ATK {creature.stats.atk} · SPD {creature.stats.spd}
      </p>
      <p class="stars" aria-label={`Fusion ${String(creature.fusionCount)} of 5`}>
        <span aria-hidden="true">{fusionStars(creature.fusionCount)}</span>
      </p>
      <p>
        <button
          type="button"
          class="primary"
          disabled={busy || creature.away || cost === null || !canAfford}
          onClick={() => {
            onTrain(creature);
          }}
        >
          {trainLabel}
        </button>
        {discounted && <span class="muted"> Catch-up discount</span>}
      </p>
      {creature.evolution !== undefined && (
        <p class="locked">
          Locked: Evolve at level {creature.evolution.level} (needs {creature.evolution.essence}{' '}
          Essence, from raids)
        </p>
      )}
      <RenameForm creature={creature} busy={busy} onRename={onRename} />
    </li>
  );
}

export function Collection({ state, busy, onTrain, onRename }: Props) {
  if (state.creatures.length === 0) return <p class="muted">No creatures yet.</p>;
  return (
    <ul class="cards">
      {state.creatures.map((creature) => (
        <CreatureCard
          key={creature.id}
          creature={creature}
          state={state}
          busy={busy}
          onTrain={onTrain}
          onRename={onRename}
        />
      ))}
    </ul>
  );
}
