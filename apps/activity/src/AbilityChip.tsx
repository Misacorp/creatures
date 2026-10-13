import { useState } from 'preact/hooks';
import { AbilityPicker } from './AbilityPicker';
import { abilitiesSummary } from './raid-abilities';
import type { RaidView, TeamCreatureView } from './raid-api';

/**
 * One "Abilities: Auto" chip. It says what the player has set up in a few words and opens the basic
 * ability pick and the Auto fire switches when tapped. Nothing here is required: left alone, every
 * ability fires by itself.
 */
export function AbilityChip({
  you,
  current,
  abilities,
  team,
  editable,
  busy,
  onPick,
  onAutoFire,
}: {
  you: Pick<RaidView['you'], 'ability' | 'abilities'>;
  current: { abilityId: string; chosen: boolean };
  abilities: RaidView['you']['abilities'];
  team: readonly TeamCreatureView[];
  editable: boolean;
  busy: boolean;
  onPick: (abilityId: string) => void;
  onAutoFire: (target: string, on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = abilitiesSummary(you);
  return (
    <section class="raid-section ability-chip-section" aria-label="Finale abilities">
      <button
        type="button"
        class={summary.customised ? 'ability-chip custom' : 'ability-chip'}
        aria-expanded={open}
        aria-controls="raid-abilities"
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <span class="ability-chip-label">Abilities:</span>
        <strong class="ability-chip-text">{summary.text}</strong>
        <span class="roster-caret" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div id="raid-abilities">
          <AbilityPicker
            current={current}
            abilities={abilities}
            team={team}
            editable={editable}
            busy={busy}
            onPick={onPick}
            onAutoFire={onAutoFire}
          />
        </div>
      )}
    </section>
  );
}
