/**
 * The finale action of a combat v2 week, on the Raid tab before the finale (docs/design/combat/integration.md, section 4): each player's one
 * live input is Rally, Shield Wall or Purge. The server reads the pick from the finale ability choice (`PUT /api/raid/ability`; a player who
 * picked none is dealt the next of the three) and Auto fire from `PUT /api/raid/autofire`; the row a Shield Wall protects is chosen in the
 * fight. Nothing here is required: left alone, the action acts by itself in its round. Closed for good when the finale starts.
 */
import { AutoFireToggle } from './AutoFireToggle';
import { ACTION_IDS, ACTION_LINE, ACTION_NAME, isActionId, type ActionId } from './finale-v2';
import type { RaidView } from './raid-api';
import { Segmented } from './ui/Segmented';

export function AbilityChipV2({
  you,
  editable,
  busy,
  onPick,
  onAutoFire,
}: {
  you: Pick<RaidView['you'], 'ability' | 'abilities'>;
  /** Before the finale starts. */
  editable: boolean;
  busy: boolean;
  onPick: (abilityId: ActionId) => void;
  onAutoFire: (on: boolean) => void;
}) {
  const current = you.ability;
  if (current === null || !isActionId(current.abilityId)) return null;
  const autoFire = you.abilities[0]?.autoFire ?? true;
  return (
    <section class="raid-section ability-chip-section finale-action" aria-label="Finale action">
      <Segmented
        label="Your finale action"
        options={ACTION_IDS.map((id) => ({ id, label: ACTION_NAME[id] }))}
        value={current.abilityId}
        onChange={(id) => {
          if (editable && !busy) onPick(id);
        }}
      />
      <p class="muted">{ACTION_LINE[current.abilityId]}</p>
      <AutoFireToggle
        on={autoFire}
        disabled={!editable || busy}
        label={ACTION_NAME[current.abilityId]}
        onToggle={onAutoFire}
      />
    </section>
  );
}
