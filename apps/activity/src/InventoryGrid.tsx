import type { Creature } from './api';
import { creatureName } from './game';
import { ItemFrame, ItemSprite } from './GearArt';
import type { GearItem } from './gear-types';
import { gearName, rarityName, sortItems } from './gear-view';

/**
 * The bag as a grid of item sprites with rarity frames and their +level. Each cell is a real button
 * (arrow-free, Tab and Enter work); its spoken label has the name, level, rarity and who wears it.
 */
export function InventoryGrid({
  items,
  creatures,
  selectedId,
  onSelect,
}: {
  items: readonly GearItem[];
  creatures: readonly Creature[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul class="inv-grid" aria-label="Gear in your bag">
      {sortItems(items).map((item) => {
        const wearer = creatures.find((c) => c.id === item.equippedOn);
        const label = [
          `${gearName(item.baseId)} plus ${String(item.level)}`,
          rarityName(item.rarity),
          wearer === undefined ? null : `worn by ${creatureName(wearer)}`,
          item.jobId === null ? null : 'in a job',
        ]
          .filter((part) => part !== null)
          .join(', ');
        return (
          <li key={item.id}>
            <button
              type="button"
              class={item.id === selectedId ? 'inv-cell selected' : 'inv-cell'}
              aria-pressed={item.id === selectedId}
              aria-label={label}
              onClick={() => {
                onSelect(item.id);
              }}
            >
              <ItemFrame rarity={item.rarity}>
                <ItemSprite baseId={item.baseId} scale={4} />
              </ItemFrame>
              <span class="item-level pix" aria-hidden="true">
                +{item.level}
              </span>
              {wearer !== undefined && (
                <span class="item-flag worn pix" aria-hidden="true">
                  worn
                </span>
              )}
              {wearer === undefined && item.jobId !== null && (
                <span class="item-flag pix" aria-hidden="true">
                  job
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
