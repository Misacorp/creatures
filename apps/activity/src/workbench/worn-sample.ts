import { gearContent } from '@creatures/game';
import { itemLookId } from '../gear-sprites';
import { LOOK_CLASS, classSlot } from '../sprites/data/worn-sprites';

/** The nth base of a worn slot, by the worn class of its look. */
function nthOf(slot: 'hat' | 'scarf' | 'charm', n: number): string | undefined {
  return gearContent.bases.filter((b) => {
    const cls = LOOK_CLASS[itemLookId(b.id)];
    return cls !== undefined && classSlot(cls) === slot;
  })[n]?.id;
}

/** A few outfits of real content bases for the workbench: a hat, a scarf, a charm, all three, two. */
export function wornBaseIds(): string[][] {
  const pick = (...ids: (string | undefined)[]): string[] =>
    ids.filter((id): id is string => id !== undefined);
  return [
    pick(nthOf('hat', 0)),
    pick(nthOf('scarf', 0)),
    pick(nthOf('charm', 0)),
    pick(nthOf('hat', 2), nthOf('scarf', 2), nthOf('charm', 2)),
    pick(nthOf('hat', 1), nthOf('scarf', 1)),
  ];
}
