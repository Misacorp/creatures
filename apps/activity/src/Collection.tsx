import { trainingCost } from '@creatures/game';
import { useState } from 'preact/hooks';
import type { Creature, GameState } from './api';
import { shinyPalette } from './art';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { abilityDef } from './live';
import { PixelBar } from './PixelBar';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import {
  capitalize,
  creatureAbilityText,
  creatureName,
  evolutionText,
  fusionStars,
  getSpecies,
  isFestivalSpecies,
  isFirstOnServer,
  personalityLine,
  speciesAbout,
  speciesName,
} from './game';

interface Props {
  state: GameState;
  busy: boolean;
  onTrain: (creature: Creature) => void;
  onEvolve: (creature: Creature) => void;
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

/** Description, traits and personality: a short read about the creature. No art notes. */
function About({ creature }: { creature: Creature }) {
  const about = speciesAbout(creature.species);
  const personality = personalityLine(creature.quirk);
  if (about === null) return null;
  return (
    <details class="about">
      <summary>About</summary>
      <p>{about.description}</p>
      <ul class="tags traits" aria-label="Traits">
        {about.traits.map((trait) => (
          <li class="tag" key={trait}>
            {trait}
          </li>
        ))}
      </ul>
      {personality !== null && <p class="muted">{personality}</p>}
    </details>
  );
}

function CreatureCard({
  creature,
  state,
  busy,
  onTrain,
  onEvolve,
  onRename,
}: { creature: Creature; state: GameState } & Omit<Props, 'state'>) {
  const species = getSpecies(creature.species);
  const cost = creature.trainCost;
  const canAfford = cost !== null && state.balances.bait >= cost;
  const discounted = cost !== null && cost < trainingCost(creature.level);
  const evolve =
    creature.evolution === undefined
      ? null
      : evolutionText(creature.level, creature.evolution, state.balances.essence);
  const abilityText = creatureAbilityText(creature, abilityDef);
  const abilityInfo = creature.ability === null ? undefined : abilityDef(creature.ability.id);
  const trainLabel =
    cost === null
      ? 'Max level'
      : creature.away
        ? `Train (${String(cost)} Bait), away`
        : `Train (${String(cost)} Bait)`;
  const shinyColours = creature.shiny ? shinyPalette(creature.species) : undefined;
  // A shiny without its own palette gets a sparkle frame instead.
  const sparkleFrame = creature.shiny && shinyColours === undefined;
  const sparkle = glyphOrUnknown('sparkle');
  return (
    <li class="card-item creature-card">
      <div class={sparkleFrame ? 'portrait sparkle-frame' : 'portrait'}>
        <Sprite
          sprite={creatureSpriteOrFallback(creature.species)}
          scale={5}
          bob
          alt={`${creatureName(creature)}${creature.shiny ? ' (shiny)' : ''}`}
          {...(shinyColours === undefined ? {} : { palette: shinyColours })}
        />
        {sparkleFrame && (
          <>
            <Sprite sprite={sparkle} scale={2} class="sparkle one" />
            <Sprite sprite={sparkle} scale={2} class="sparkle two" />
          </>
        )}
      </div>
      <div class="name-row">
        <h3>{creatureName(creature)}</h3>
        <GlossaryTag entry="level" look="chip" class="lvl-tag pix">
          Lv {creature.level}
        </GlossaryTag>
      </div>
      {creature.nickname !== null && <p class="muted">{speciesName(creature.species)}</p>}
      <p class="tags">
        {species !== undefined && (
          <>
            <ElementChip element={species.element} role={capitalize(species.role)} />
            <GlossaryTag entry="rarity" look="chip" class="tag">
              {capitalize(species.rarity)}
            </GlossaryTag>
          </>
        )}
        {isFestivalSpecies(creature.species) && (
          <GlossaryTag entry="festival" look="chip" class="badge festival">
            Festival
          </GlossaryTag>
        )}
        {creature.shiny && (
          <GlossaryTag entry="shiny" look="chip" class="badge shiny">
            Shiny
          </GlossaryTag>
        )}
        {creature.away && (
          <GlossaryTag entry="away" look="chip" class="badge away">
            Away
          </GlossaryTag>
        )}
        {isFirstOnServer(creature, state.serverFirsts) && (
          <GlossaryTag entry="first-on-server" look="chip" class="badge first">
            First on server
          </GlossaryTag>
        )}
      </p>
      {isFestivalSpecies(creature.species) && (
        <p class="muted">Won in a Festival week. It is not found on expeditions.</p>
      )}
      <PixelBar
        value={creature.level}
        max={creature.levelCap}
        label={`Training progress: level ${String(creature.level)} of ${String(creature.levelCap)}`}
      />
      <p class="stats">
        HP {creature.stats.hp} · ATK {creature.stats.atk} · SPD {creature.stats.spd}
      </p>
      {abilityText !== null && (
        <div class="creature-ability">
          <p class={abilityText.unlocked ? undefined : 'locked'}>
            {abilityText.unlocked && abilityInfo !== undefined ? (
              <>
                <GlossaryTag ability={abilityInfo.id}>{abilityInfo.name}</GlossaryTag>:{' '}
                {abilityInfo.description}
              </>
            ) : (
              <GlossaryTag entry="creature-ability">{abilityText.line}</GlossaryTag>
            )}
          </p>
          {abilityText.teaser !== null && <p class="muted">{abilityText.teaser}</p>}
        </div>
      )}
      <p class="stars">
        <GlossaryTag entry="fusion" label={`Fusion ${String(creature.fusionCount)} of 5`}>
          <span aria-hidden="true">{fusionStars(creature.fusionCount)}</span>
        </GlossaryTag>
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
        <GlossaryTag entry="training-cost" look="help" class="train-help" />
        {discounted && <span class="muted"> Catch-up discount</span>}
      </p>
      {evolve !== null &&
        (evolve.available ? (
          <p>
            <button
              type="button"
              class="primary"
              disabled={busy}
              onClick={() => {
                onEvolve(creature);
              }}
            >
              {evolve.label}
            </button>
          </p>
        ) : (
          <p class="locked">{evolve.label}</p>
        ))}
      <About creature={creature} />
      <RenameForm creature={creature} busy={busy} onRename={onRename} />
    </li>
  );
}

export function Collection({ state, busy, onTrain, onEvolve, onRename }: Props) {
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
          onEvolve={onEvolve}
          onRename={onRename}
        />
      ))}
    </ul>
  );
}
