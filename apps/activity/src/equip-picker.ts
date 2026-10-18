/**
 * The options of the Workshop item drawer's "Equip on" picker (the creature sheet of `ui/RosterPicker.tsx`),
 * as plain data: who can wear the item first, then who cannot with a short reason, and "Take off" first when
 * the item is worn. Pure. The wear rule is the game's (`wearBlock`) and the server still decides every equip
 * (`apps/worker/src/gear.ts`, `equip`): it refuses a creature that is away or on a job, and also refuses to
 * move or take off an item whose wearer is away or on a job (what a creature wears is frozen then).
 */
import { wearBlock } from '@creatures/game';
import type { Creature } from './api';
import { capitalize, creatureName, getSpecies } from './game';
import type { GearItem } from './gear-types';
import { ON_A_JOB_REASON, busyReason } from './gear-view';
import type { PickerOption } from './roster-picker';

/** The id of the "Take off" option (no creature has it). */
export const TAKE_OFF_ID = 'take-off';

/** What the picker says for the creature that wears the item now (picking it changes nothing). */
export const WEARS_IT_NOTE = 'Wears it now';

/**
 * Why a creature cannot take the item, in as few words as fit ("Needs level 7", "Guards only", "Away on a
 * trip", "On a job"); null when it can. "Needs level" is the item's level or the level its slot opens at,
 * whichever blocks. Away and on a job come first, as the server checks them first.
 */
export function equipReason(
  item: Pick<GearItem, 'slot' | 'tag' | 'itemLevel'>,
  creature: Pick<Creature, 'level' | 'species' | 'busy' | 'away'>,
): string | null {
  const frozen = busyReason(creature);
  if (frozen !== null) return frozen;
  const species = getSpecies(creature.species);
  if (species === undefined) return null;
  const block = wearBlock(item, { level: creature.level, role: species.role });
  if (block === null) return null;
  return block.reason === 'role'
    ? `${capitalize(block.role)}s only`
    : `Needs level ${String(block.needs)}`;
}

function creatureOption(creature: Creature, disabled: string | null, wears: boolean): PickerOption {
  const species = getSpecies(creature.species);
  return {
    id: creature.id,
    name: creatureName(creature),
    species: creature.species,
    level: creature.level,
    element: species?.element ?? 'unknown',
    role: species?.role ?? '',
    onBoard: wears,
    disabled,
    effect: null,
    recommended: false,
  };
}

/**
 * The picker's options for `item`: "Take off" when it is worn (disabled with the reason when its wearer is
 * frozen), the creature that wears it, the creatures that can take it (highest level first), then the ones
 * that cannot, each with its reason (also highest level first). When the wearer is frozen nobody can take
 * the item from it, and every other creature says whose fault that is ("Cindle is away on a trip").
 */
export function equipOptions(
  item: Pick<GearItem, 'slot' | 'tag' | 'itemLevel' | 'equippedOn'>,
  creatures: readonly Creature[],
): PickerOption[] {
  const wearer = creatures.find((c) => c.id === item.equippedOn);
  const wearerFrozen = wearer === undefined ? null : busyReason(wearer);
  const stuck =
    wearer === undefined || wearerFrozen === null
      ? null
      : `${creatureName(wearer)} is ${wearerFrozen === ON_A_JOB_REASON ? 'on a job' : 'away on a trip'}`;
  const byLevel = (a: PickerOption, b: PickerOption): number =>
    b.level - a.level || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const others = creatures
    .filter((c) => c.id !== wearer?.id)
    .map((c) => creatureOption(c, stuck ?? equipReason(item, c), false));
  const able = others.filter((o) => o.disabled === null).sort(byLevel);
  const unable = others.filter((o) => o.disabled !== null).sort(byLevel);
  const lead: PickerOption[] = [];
  if (wearer !== undefined) {
    lead.push({
      id: TAKE_OFF_ID,
      name: 'Take off',
      species: '',
      level: 0,
      element: '',
      role: '',
      onBoard: false,
      disabled: stuck,
      effect: null,
      recommended: false,
      action: true,
    });
    lead.push(creatureOption(wearer, null, true));
  }
  return [...lead, ...able, ...unable];
}
