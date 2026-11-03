/**
 * The live finale's one input on combat v2, under the stage: a button for the caller's action (Rally, Shield Wall with a row, Purge) that
 * says the round it takes effect in, and the Auto fire switch as it is today (on: it acts by itself in its round; off: it waits for the
 * caller and still acts in the last round). The server decides what is allowed; the button only offers what can work, and shows the
 * server's reason when a press is refused. Every word is the game's own: text.
 */
import { useState } from 'preact/hooks';
import { AutoFireToggle } from './AutoFireToggle';
import {
  ACTION_LINE,
  ACTION_NAME,
  canFire,
  canToggleAuto,
  inputStatus,
  isActionId,
  wallRowName,
} from './finale-v2';
import type { LiveAbilityV2, LiveSnapshotV2 } from './fight-v2-api';
import { ActionButton } from './ui/ActionButton';
import { Alert } from './ui/Alert';
import { Segmented } from './ui/Segmented';

export function FinaleInputV2({
  snapshot,
  ability,
  busy,
  error,
  onFire,
  onAuto,
}: {
  snapshot: Pick<LiveSnapshotV2, 'status' | 'round' | 'rounds' | 'bossDef'>;
  ability: LiveAbilityV2;
  busy: boolean;
  /** What the server said to the last press, when it refused. */
  error: string | null;
  /** Fires the input; `row` goes with a Shield Wall. */
  onFire: (row: number | undefined) => void;
  /** Turns Auto fire on or off (`hold` is off). */
  onAuto: (on: boolean) => void;
}) {
  const id = ability.abilityId;
  const known = isActionId(id);
  const rows = snapshot.bossDef?.rows ?? 1;
  const [picked, setPicked] = useState<number | null>(null);
  const row = picked ?? ability.row ?? 0;
  const status = inputStatus(ability, snapshot.rounds);
  const fire = canFire(snapshot, ability) && !busy;
  const walls = ability.kind === 'shieldWall';
  const name = known ? ACTION_NAME[id] : id;
  const next = snapshot.round + 1;
  return (
    <section class="finale-input" aria-label="Your finale action">
      <p class="muted">{known ? ACTION_LINE[id] : ''}</p>
      {walls && !ability.fired && ability.mode !== 'fired' && (
        <Segmented
          label="Row to protect"
          options={Array.from({ length: rows }, (_, r) => ({
            id: String(r),
            label: wallRowName(r),
          }))}
          value={String(row)}
          onChange={(value) => {
            setPicked(Number(value));
          }}
        />
      )}
      <div class="finale-input-row">
        <ActionButton
          label={name}
          detail={fire ? `Acts in round ${String(next)}` : status.text}
          disabled={!fire}
          onClick={() => {
            onFire(walls ? row : undefined);
          }}
        />
        <AutoFireToggle
          on={ability.autoFire}
          disabled={busy || !canToggleAuto(snapshot, ability)}
          label={name}
          onToggle={onAuto}
        />
      </div>
      {walls && (ability.fired || ability.mode === 'fired') && ability.row !== null && (
        <p class="muted">{`${wallRowName(ability.row)} is protected.`}</p>
      )}
      {error !== null && <Alert level="alert">{error}</Alert>}
    </section>
  );
}
