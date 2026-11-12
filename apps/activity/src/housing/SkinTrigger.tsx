import { DropChevron } from '../ui/DropChevron';
import { GameIcon } from '../ui/GameIcon';
import { itemName } from './house-names';
import { SKIN_KIND_NAMES } from './SkinPicker';
import type { SkinKind } from './spot-view';

/**
 * The roof, walls, frame, wallpaper, floor, trim or ceiling in use, as a trigger that opens the list of them: it looks like a dropdown
 * (the skin's picture, its name and a chevron), the way the stamp trigger does. Its spoken name says which one ("Roof: Thatch"). A
 * trim, ceiling or frame left as built (`id` null) shows the dashed empty mark of the pickers and "As built".
 */
export function SkinTrigger({
  kind,
  id,
  onOpen,
}: {
  kind: SkinKind;
  id: string | null;
  onOpen: () => void;
}) {
  const name = id === null ? 'As built' : itemName(id);
  return (
    <button
      type="button"
      class="equip-trigger hp-skin-trigger"
      aria-haspopup="dialog"
      aria-label={`${SKIN_KIND_NAMES[kind]}: ${name}`}
      onClick={onOpen}
    >
      {id === null ? (
        <span class="hp-empty-mark" aria-hidden="true" />
      ) : (
        <GameIcon icon={{ kind: 'house', id }} scale={2} />
      )}
      <span class="equip-name">{name}</span>
      <DropChevron />
    </button>
  );
}
