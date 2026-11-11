import { DropChevron } from '../ui/DropChevron';
import { GameIcon } from '../ui/GameIcon';
import { itemName } from './house-names';

const KIND_NAMES = {
  wall: 'Wallpaper',
  floor: 'Floor',
  roof: 'Roof',
  walls: 'Walls',
  ground: 'Ground',
} as const;

/**
 * The roof, walls, wallpaper or floor in use, as a trigger that opens the list of them: it looks like a dropdown (the skin's
 * picture, its name and a chevron), the way the stamp trigger does. Its spoken name says which one ("Roof: Thatch").
 */
export function SkinTrigger({
  kind,
  id,
  onOpen,
}: {
  kind: keyof typeof KIND_NAMES;
  id: string;
  onOpen: () => void;
}) {
  const name = itemName(id);
  return (
    <button
      type="button"
      class="equip-trigger hp-skin-trigger"
      aria-haspopup="dialog"
      aria-label={`${KIND_NAMES[kind]}: ${name}`}
      onClick={onOpen}
    >
      <GameIcon icon={{ kind: 'house', id }} scale={2} />
      <span class="equip-name">{name}</span>
      <DropChevron />
    </button>
  );
}
