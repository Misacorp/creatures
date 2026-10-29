/**
 * Your free creatures lined up on a scene's floor to be picked (who goes on the trip, who works the anvil,
 * who joins the raid): each a real button of its sprite standing on the ground, its name and level
 * under it in the pixel font. The picked one steps forward a pixel and gets the ring. No list, no rows.
 */
import type { Creature } from '../../api';
import { creatureName } from '../../game';
import { CreatureSprite } from './parts';

export function LineUp({
  label,
  creatures,
  picked,
  onPick,
}: {
  /** What the line-up is for ("Who goes to Verdant Hollow?"), for screen readers. */
  label: string;
  creatures: readonly Creature[];
  picked: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <ul class="pv-lineup" aria-label={label}>
      {creatures.map((c) => {
        const on = c.id === picked;
        return (
          <li key={c.id}>
            <button
              type="button"
              class={`pv-pick${on ? ' on' : ''}`}
              aria-pressed={on}
              aria-label={`${creatureName(c)}, level ${String(c.level)}`}
              onClick={() => {
                onPick(c.id);
              }}
            >
              <CreatureSprite creature={c} scale={3} />
              <span class="pv-pick-name pix" aria-hidden="true">
                {creatureName(c)}
              </span>
              <span class="pv-pick-level pix" aria-hidden="true">
                Lv {c.level}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
