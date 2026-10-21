import { createContext, type ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import type { Creature } from './api';
import { TAKE_OFF_ID, WEARS_IT_NOTE, equipOptions } from './equip-picker';
import type { GearItem } from './gear-types';
import { RosterPicker } from './ui/RosterPicker';

/**
 * What a found item's popover needs to offer "Equip": `open` closes nothing itself (the popover does) and
 * shows the creature sheet for the item, the same list as the Workshop's "Equip on" (`equipOptions`).
 * `null` (outside `EquipHost`, or no creatures) means the card has no Equip button.
 */
export interface EquipFromCard {
  open: (item: GearItem, anchor: HTMLElement | null) => void;
}

export const EquipContext = createContext<EquipFromCard | null>(null);

/**
 * Provides `EquipContext` and draws the creature sheet when it is open. `onEquip` is the Workshop's equip
 * action (the server decides; errors and the fresh views are handled by the caller). Without creatures there
 * is nothing to equip on, so the context is null.
 */
export function EquipHost({
  creatures,
  onEquip,
  children,
}: {
  creatures: readonly Creature[];
  onEquip: (itemId: string, creatureId: string | null) => unknown;
  children: ComponentChildren;
}) {
  const [target, setTarget] = useState<GearItem | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const api: EquipFromCard | null =
    creatures.length === 0
      ? null
      : {
          open: (item, from) => {
            anchor.current = from;
            setTarget(item);
          },
        };
  return (
    <EquipContext.Provider value={api}>
      {children}
      {target !== null && creatures.length > 0 && (
        <RosterPicker
          title="Equip on"
          options={equipOptions(target, creatures)}
          placedNote={WEARS_IT_NOTE}
          showEffects={false}
          reasonSide
          anchor={() => anchor.current}
          onPick={(id) => {
            setTarget(null);
            // The creature that wears it already: nothing to ask the server.
            if (id === target.equippedOn) return;
            void onEquip(target.id, id === TAKE_OFF_ID ? null : id);
          }}
          onClose={() => {
            setTarget(null);
          }}
        />
      )}
    </EquipContext.Provider>
  );
}
