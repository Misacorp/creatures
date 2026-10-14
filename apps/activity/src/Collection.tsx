import { Tag } from './ui/Tag';
import { trainingCost } from '@creatures/game';
import { useState } from 'preact/hooks';
import type { Creature, GameState } from './api';
import { shinyPalette } from './art';
import { CardGear } from './CardGear';
import { GlossaryTag } from './Glossary';
import type { GearState } from './gear-types';
import { gearShare } from './gear-view';
import { glyphOrUnknown } from './glyphs';
import { abilityDef } from './live';
import { Bar } from './ui/Bar';
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
  /** The gear view; null until it has loaded. */
  gear: GearState | null;
  busy: boolean;
  /** Wears an item or (null) takes it off; resolves true when the server accepted it. */
  onEquip: (gearId: string, creatureId: string | null) => Promise<boolean>;
  onTrain: (creature: Creature) => void;
  onEvolve: (creature: Creature) => void;
  onRename: (creature: Creature, nickname: string | null) => void;
  /** Makes this creature the one that lounges in the living room. */
  onLounge: (creature: Creature) => void;
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

/** One stat with gear folded in, and the gear's own share next to it in the gear colour ("ATK 79 +12"). */
function StatPart({
  label,
  stat,
  creature,
}: {
  label: string;
  stat: 'hp' | 'atk' | 'spd';
  creature: Creature;
}) {
  const share = gearShare(creature).find((s) => s.stat === stat)?.amount ?? 0;
  return (
    <span class="stat-part">
      {label} {creature.statsWithGear[stat]}
      {share > 0 && (
        <>
          {' '}
          <span class="gear-share" aria-label={`plus ${String(share)} from gear`}>
            +{share}
          </span>
        </>
      )}
    </span>
  );
}

function CreatureCard({
  creature,
  state,
  gear,
  busy,
  onEquip,
  onTrain,
  onEvolve,
  onRename,
  onLounge,
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
            <ElementChip element={species.element} role={species.role} />
            <Tag entry="rarity">{capitalize(species.rarity)}</Tag>
          </>
        )}
        {isFestivalSpecies(creature.species) && (
          <Tag kind="badge" tone="festival" entry="festival">
            Festival
          </Tag>
        )}
        {creature.shiny && (
          <Tag kind="badge" tone="shiny" entry="shiny">
            Shiny
          </Tag>
        )}
        {creature.away && (
          <Tag kind="badge" tone="away" entry="away">
            Away
          </Tag>
        )}
        {creature.busy?.kind === 'job' && (
          <Tag kind="badge" tone="busy" entry="workshop">
            On a job
          </Tag>
        )}
        {creature.id === state.loungerId && (
          <Tag kind="badge" tone="good">
            Lounging
          </Tag>
        )}
        {isFirstOnServer(creature, state.serverFirsts) && (
          <Tag kind="badge" tone="first" entry="first-on-server">
            First on server
          </Tag>
        )}
      </p>
      {isFestivalSpecies(creature.species) && (
        <p class="muted">Won in a Festival week. It is not found on expeditions.</p>
      )}
      <Bar
        value={creature.level}
        max={creature.levelCap}
        label={`Training progress: level ${String(creature.level)} / ${String(creature.levelCap)}`}
      />
      <p class="stats">
        <StatPart label="HP" stat="hp" creature={creature} /> ·{' '}
        <StatPart label="ATK" stat="atk" creature={creature} /> ·{' '}
        <StatPart label="SPD" stat="spd" creature={creature} />
      </p>
      <CardGear
        creature={creature}
        creatures={state.creatures}
        gear={gear}
        busy={busy}
        onEquip={onEquip}
      />
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
        <GlossaryTag entry="fusion" label={`Fusion ${String(creature.fusionCount)} / 5`}>
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
      {creature.busy === null && creature.id !== state.loungerId && (
        <p>
          <button
            type="button"
            class="lounge-button"
            disabled={busy}
            onClick={() => {
              onLounge(creature);
            }}
          >
            Lounge
          </button>
        </p>
      )}
      <About creature={creature} />
      <RenameForm creature={creature} busy={busy} onRename={onRename} />
    </li>
  );
}

export function Collection({
  state,
  gear,
  busy,
  onEquip,
  onTrain,
  onEvolve,
  onRename,
  onLounge,
}: Props) {
  if (state.creatures.length === 0) return <p class="muted">No creatures yet.</p>;
  return (
    <ul class="cards">
      {state.creatures.map((creature) => (
        <CreatureCard
          key={creature.id}
          creature={creature}
          state={state}
          gear={gear}
          busy={busy}
          onEquip={onEquip}
          onTrain={onTrain}
          onEvolve={onEvolve}
          onRename={onRename}
          onLounge={onLounge}
        />
      ))}
    </ul>
  );
}
