import { RULES, basicAbilities } from '@creatures/game';
import type { Creature } from './api';
import {
  DUNGEON_ELEMENTS,
  DUNGEON_ZONES,
  DUNGEON_ZONE_NAMES,
  basicParams,
  creatureAbilityChoices,
  defaultRoundOf,
  parseRound,
  roundOptions,
  uselessInDungeon,
  type AbilitySettings,
  type Slots,
} from './dungeon-team';
import { creatureName, elementName } from './game';
import { GlossaryTag } from './Glossary';
import { abilityName, abilityEffectLine } from './live';

interface Props {
  settings: AbilitySettings;
  slots: Slots;
  creatures: readonly Creature[];
  disabled: boolean;
  onChange: (next: AbilitySettings) => void;
}

/** "Auto" or a chosen round, as a native select (keyboard and screen reader friendly). */
function RoundSelect({
  id,
  label,
  value,
  autoRound,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number | null;
  /** The round Auto fires in, for the option's text; null when unknown. */
  autoRound: number | null;
  disabled: boolean;
  onChange: (round: number | null) => void;
}) {
  return (
    <div class="ability-field">
      <label for={id}>{label}</label>
      <select
        id={id}
        value={value === null ? '' : String(value)}
        disabled={disabled}
        onChange={(event) => {
          onChange(parseRound(event.currentTarget.value));
        }}
      >
        {roundOptions().map((o) => (
          <option key={o.label} value={o.value === null ? '' : String(o.value)}>
            {o.value === null && autoRound !== null ? `Auto (round ${String(autoRound)})` : o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * The abilities of the run, set before it starts because there is no live input: the basic ability
 * (one of the four) with Auto or a chosen round, a zone for Shield Wall or an element for Re-mark,
 * and a round for each unlocked creature ability in the team. Each ability fires once in every room.
 */
export function DungeonAbilities({ settings, slots, creatures, disabled, onChange }: Props) {
  const params = basicParams(settings.basicId);
  const choices = creatureAbilityChoices(slots, creatures, settings, creatureName);
  const locked = slots
    .map((id) => creatures.find((c) => c.id === id))
    .filter((c): c is Creature => c !== undefined && c.ability !== null && !c.ability.unlocked);
  return (
    <section class="raid-section" aria-labelledby="dungeon-abilities-heading">
      <h3 id="dungeon-abilities-heading">Abilities for this run</h3>
      <p class="muted">
        There is no live input in the dungeon, so you set your abilities now. Each one fires once in
        every room: in the round you choose, or on <strong>Auto</strong>, its usual round.{' '}
        <GlossaryTag entry="auto-fire" look="help" />
      </p>

      <h4>
        <GlossaryTag entry="basic-ability">Basic ability</GlossaryTag>
      </h4>
      <ul class="cards ability-cards">
        {basicAbilities().map((def) => {
          const selected = def.id === settings.basicId;
          const useless = uselessInDungeon(def.id);
          return (
            <li key={def.id}>
              <button
                type="button"
                class={selected ? 'ability-card selected' : 'ability-card'}
                aria-pressed={selected}
                disabled={disabled || useless}
                onClick={() => {
                  onChange({ ...settings, basicId: def.id });
                }}
              >
                <span class="chip-name">
                  {def.name}
                  {selected && <span class="badge good ability-badge">Your pick</span>}
                </span>
                <span>{def.description}</span>
                {useless && (
                  <span class="muted">
                    Nothing to remove here: dungeon foes have no adaptation.
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div class="ability-fields">
        {params.zone && (
          <div class="ability-field">
            <label for="dungeon-basic-zone">Zone to shield</label>
            <select
              id="dungeon-basic-zone"
              value={settings.zone}
              disabled={disabled}
              onChange={(event) => {
                const zone = DUNGEON_ZONES.find((z) => z === event.currentTarget.value);
                if (zone !== undefined) onChange({ ...settings, zone });
              }}
            >
              {DUNGEON_ZONES.map((z) => (
                <option key={z} value={z}>
                  {DUNGEON_ZONE_NAMES[z]}
                </option>
              ))}
            </select>
          </div>
        )}
        {params.element && (
          <div class="ability-field">
            <label for="dungeon-basic-element">Element to mark</label>
            <select
              id="dungeon-basic-element"
              value={settings.element}
              disabled={disabled}
              onChange={(event) => {
                const element = DUNGEON_ELEMENTS.find((e) => e === event.currentTarget.value);
                if (element !== undefined) {
                  onChange({ ...settings, element });
                }
              }}
            >
              {DUNGEON_ELEMENTS.map((e) => (
                <option key={e} value={e}>
                  {elementName(e)}
                </option>
              ))}
            </select>
          </div>
        )}
        <RoundSelect
          id="dungeon-basic-round"
          label={`${abilityName(settings.basicId)}: fire in`}
          value={settings.basicRound}
          autoRound={defaultRoundOf(settings.basicId)}
          disabled={disabled}
          onChange={(round) => {
            onChange({ ...settings, basicRound: round });
          }}
        />
      </div>

      <h4>
        <GlossaryTag entry="creature-ability">Creature abilities</GlossaryTag>
      </h4>
      {choices.length === 0 && locked.length === 0 && (
        <p class="muted">
          None in this team. A creature gets its own ability at level{' '}
          {String(RULES.abilities.unlockLevel)}.
        </p>
      )}
      <ul class="plain-list creature-abilities">
        {choices.map((choice) => (
          <li key={choice.creatureId} class="live-ability you">
            <GlossaryTag ability={choice.abilityId}>
              <strong>
                {choice.name}'s {abilityName(choice.abilityId)}
              </strong>
            </GlossaryTag>
            . <span>{abilityEffectLine(choice.abilityId)}</span>
            <RoundSelect
              id={`dungeon-round-${choice.creatureId}`}
              label={`${choice.name}: fire in`}
              value={choice.round}
              autoRound={defaultRoundOf(choice.abilityId)}
              disabled={disabled}
              onChange={(round) => {
                onChange({
                  ...settings,
                  creatureRounds: { ...settings.creatureRounds, [choice.creatureId]: round },
                });
              }}
            />
          </li>
        ))}
        {locked.map((c) => (
          <li key={c.id} class="live-ability">
            <span class="muted">
              {creatureName(c)} unlocks its ability at level{' '}
              {String(c.ability?.unlockLevel ?? RULES.abilities.unlockLevel)} (now level{' '}
              {String(c.level)}).
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
