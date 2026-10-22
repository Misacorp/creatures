/**
 * What the Workshop's blueprint card opens: the job drawer (`JobDrawer`) for a gear craft. Pure: the card and the
 * workbench build the same thing from the blueprint view and the gear; the server checks every start again.
 */
import { craftInputs } from './conversion-view';
import type { GearState, ReachId } from './gear-types';
import {
  durationFor,
  nominalDurationCountItem,
  nominalHours,
  type BlueprintView,
} from './gear-view';
import type { SupplyJob } from './supply-job';
import type { CraftSpec } from './use-job-wizard';

/** The part of the drawer's props that depends on the craft (the rest is the page's: gear, creatures, busy, error). */
export type CraftJob = SupplyJob;

/**
 * The drawer's job for a blueprint. The recipe at the top is a plain craft for the best crafter (what the card
 * lists); the Reach step shows the exact numbers for the creature picked. The Crafting level asked is the
 * blueprint's own.
 */
export function craftJob(
  bp: Pick<BlueprintView, 'baseId' | 'name' | 'cost' | 'needsCraftingLevel'>,
  gear: Pick<GearState, 'parts' | 'balances'>,
  craft: Pick<CraftSpec, 'load'>,
  onCraft: (baseId: string, creatureId: string, reach: ReachId, treat: boolean) => Promise<boolean>,
): CraftJob {
  return {
    title: `Craft ${bp.name}`,
    helpKind: 'craft',
    recipe: {
      inputs: craftInputs(bp.cost, 0, gear.parts, gear.balances.bait),
      outputs: [
        {
          key: `item-${bp.baseId}`,
          icon: { kind: 'gear', baseId: bp.baseId },
          amount: 1,
          name: bp.name,
        },
      ],
      duration: nominalDurationCountItem(nominalHours() * 3_600_000),
      verb: 'Craft',
    },
    spec: {
      kind: 'craft',
      cost: {},
      minLevel: bp.needsCraftingLevel,
      durationAtLevel: durationFor,
      finish: 'Craft',
      craft: { blueprintId: bp.baseId, load: craft.load },
    },
    onStart: (creatureId, treat, reach) => onCraft(bp.baseId, creatureId, reach, treat),
  };
}
