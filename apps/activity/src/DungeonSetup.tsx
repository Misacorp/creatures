import { useEffect, useState } from 'preact/hooks';
import type { Creature } from './api';
import { DungeonAbilities } from './DungeonAbilities';
import { DungeonTeam } from './DungeonTeam';
import {
  DEFAULT_ABILITY_SETTINGS,
  isComplete,
  pruneSlots,
  strongestFirst,
  strongestThree,
  type AbilitySettings,
  type Selection,
  type Slots,
} from './dungeon-team';
import { blockedText, isRetryOffer, RETRY_TEXT } from './dungeon-text';
import type { DungeonToday } from './dungeon-types';
import { GlossaryTag } from './Glossary';

interface Props {
  today: DungeonToday;
  creatures: readonly Creature[];
  /** True while the run is being sent. */
  busy: boolean;
  error: string | null;
  /** The player pressed Enter with a complete team. */
  onEnter: (slots: Slots, settings: AbilitySettings) => void;
  /** Opens the summary of today's earlier run (the first-day retry offer). */
  onSeeLast: () => void;
}

/**
 * The pre-run screen below today's info: the team in its row, the ability settings and the Enter
 * button, or the reason a run is not possible. The choices are the player's; the server checks them
 * all again and decides the run.
 */
export function DungeonSetup({ today, creatures, busy, error, onEnter, onSeeLast }: Props) {
  const [slots, setSlots] = useState<Slots>(() => strongestThree(creatures));
  const [selected, setSelected] = useState<Selection>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [settings, setSettings] = useState<AbilitySettings>(DEFAULT_ABILITY_SETTINGS);

  // The collection can change under the screen (a refresh after another tab): drop creatures that are gone.
  const owned = creatures.map((c) => c.id);
  useEffect(() => {
    setSlots((current) => pruneSlots(current, owned));
    setSelected((current) => (current !== null && owned.includes(current) ? current : null));
  }, [owned.join(',')]);

  const blocked =
    blockedText(today) ??
    (creatures.length < 3 ? blockedText({ blocked: 'need_creatures', canRun: false }) : null);
  if (blocked !== null) {
    return (
      <section class="raid-section" aria-labelledby="dungeon-blocked-heading">
        <h3 id="dungeon-blocked-heading">Not today</h3>
        <p role="status">{blocked}</p>
      </section>
    );
  }

  const complete = isComplete(slots);
  return (
    <>
      {isRetryOffer(today) && (
        <section class="raid-section dungeon-retry" aria-labelledby="dungeon-retry-heading">
          <h3 id="dungeon-retry-heading">
            <GlossaryTag entry="dungeon">One more try</GlossaryTag>
          </h3>
          <p>{RETRY_TEXT}</p>
          <p>
            <button type="button" onClick={onSeeLast}>
              See your last run
            </button>
          </p>
        </section>
      )}
      <section class="raid-section" aria-labelledby="dungeon-team-heading">
        <h3 id="dungeon-team-heading">Pick your team</h3>
        <DungeonTeam
          creatures={strongestFirst(creatures)}
          slots={slots}
          modifiers={today.modifiers}
          selected={selected}
          hint={hint}
          disabled={busy}
          onChange={(next) => {
            setSlots(next.slots);
            setSelected(next.selected);
            setHint(next.hint);
          }}
          onStrongest={() => {
            setSlots(strongestThree(creatures));
            setSelected(null);
            setHint(null);
          }}
        />
      </section>
      <DungeonAbilities
        settings={settings}
        slots={slots}
        creatures={creatures}
        disabled={busy}
        onChange={setSettings}
      />
      <section class="raid-section dungeon-enter" aria-label="Enter the dungeon">
        {error !== null && (
          <p class="error" role="alert">
            {error}
          </p>
        )}
        <p>
          <button
            type="button"
            class="primary"
            disabled={busy || !complete}
            aria-describedby="dungeon-enter-note"
            onClick={() => {
              onEnter(slots, settings);
            }}
          >
            {busy ? 'Entering...' : 'Enter the dungeon'}
          </button>
        </p>
        <p id="dungeon-enter-note" class="muted">
          {complete
            ? 'The run is played out at once on the server, then shown to you. You get one run a day.'
            : 'Put a creature in every slot of the row to enter.'}
        </p>
      </section>
    </>
  );
}
