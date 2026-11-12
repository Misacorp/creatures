import { DropChevron } from '../ui/DropChevron';
import { GameIcon } from '../ui/GameIcon';
import { chipName, itemName } from './house-names';
import { drawnLook } from './interior-art';
import { SKIN_KIND_NAMES } from './SkinPicker';
import type { SkinKind } from './spot-view';

/** A layer chip's spoken name: "Ceiling look: Plain Ceiling, White oak", so it never reads like a spot ("Ceiling: Oak Lamp"). */
export function lookLabel(kind: SkinKind, id: string | null): string {
  const drawn = drawnLook(kind, id);
  return `${SKIN_KIND_NAMES[kind]} look: ${drawn === null ? 'none' : itemName(drawn)}`;
}

/**
 * The roof, walls, frame, wallpaper, floor, trim or ceiling in use, as a trigger that opens the list of them: it looks like a dropdown
 * (the skin's picture in a fixed 16 px box, its short name and a chevron), the way the stamp trigger does. The short name is the
 * pattern or skin word ("Damask", "Thatch"; `chipName`); its spoken name is whole ("Wallpaper look: Damask Paper, Rose"). A ceiling or
 * frame left as built shows its starter; a trim left off shows the dashed empty mark and the layer's word, muted.
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
  const drawn = drawnLook(kind, id);
  return (
    <button
      type="button"
      class="equip-trigger hp-skin-trigger"
      aria-haspopup="dialog"
      aria-label={lookLabel(kind, id)}
      onClick={onOpen}
    >
      <span class="hp-chip-pic" aria-hidden="true">
        {drawn === null ? (
          <span class="hp-empty-mark" />
        ) : (
          <GameIcon icon={{ kind: 'house', id: drawn, box: 16 }} scale={1} />
        )}
      </span>
      {drawn === null ? (
        <span class="equip-name equip-empty">{SKIN_KIND_NAMES[kind]}</span>
      ) : (
        <span class="equip-name">{chipName(drawn)}</span>
      )}
      <DropChevron />
    </button>
  );
}
