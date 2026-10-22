/**
 * What the Workshop's supply card can do with the chosen supply, and what its job drawer (`JobDrawer`) shows for
 * each action: Craft, Refine, Recycle. Pure: the card and the workbench both build the same thing from the
 * stock, the gear view and the creatures; the server checks every start again.
 */
import type { Creature } from './api';
import {
  conversionDurationFor,
  conversionOf,
  craftInputs,
  shortText,
  supplyBadge,
  type ConversionView,
} from './conversion-view';
import type { GearState } from './gear-types';
import {
  nominalDurationCountItem,
  supplyCraftViews,
  supplyDurationFor,
  supplyLevelBlocker,
} from './gear-view';
import type { JobDrawerProps } from './JobWizard';

export type SupplyAction = 'craft' | 'refine' | 'recycle';
export type SupplyCraftView = ReturnType<typeof supplyCraftViews>[number];

/** What the card shows of the chosen supply: the recipes it takes part in and why each button is off. */
export interface SupplyActions {
  /** Why nobody can craft it yet (the Crafting level); null when somebody can. */
  blocker: string | null;
  refine: ConversionView | null;
  recycle: ConversionView | null;
  /** Why Refine / Recycle is off (the words under its button); null when it can start. */
  refineReason: string | null;
  recycleReason: string | null;
}

export function supplyActions(
  view: SupplyCraftView,
  stock: Readonly<Record<string, number>>,
  gear: Pick<GearState, 'skills' | 'parts'>,
  creatures: readonly Creature[],
): SupplyActions {
  const blockerOf = (level: number) => supplyLevelBlocker(level, gear.skills, creatures);
  const refine = conversionOf('refine', view.id, stock, gear.parts);
  const recycle = conversionOf('recycle', view.id, stock, gear.parts);
  return {
    blocker: blockerOf(view.level),
    refine,
    recycle,
    refineReason:
      refine === null
        ? 'Already the best tier.'
        : (shortText(refine.inputs) ?? blockerOf(refine.level)),
    recycleReason:
      recycle === null
        ? 'Basic cannot be recycled.'
        : (shortText(recycle.inputs) ?? blockerOf(recycle.level)),
  };
}

/** The part of the drawer's props that depends on the job (the rest is the page's: gear, creatures, busy, error). */
export type SupplyJob = Pick<JobDrawerProps, 'title' | 'helpKind' | 'recipe' | 'spec' | 'onStart'>;

export interface SupplyStarters {
  onCraft: (supplyId: string, creatureId: string, treat: boolean) => Promise<boolean>;
  onConvert: (recipeId: string, creatureId: string, treat: boolean) => Promise<boolean>;
}

/** The drawer's job for an action on the chosen supply; null when the supply has no such recipe. */
export function supplyJob(
  action: SupplyAction,
  view: SupplyCraftView,
  actions: SupplyActions,
  gear: Pick<GearState, 'parts' | 'balances'>,
  starters: SupplyStarters,
): SupplyJob | null {
  if (action === 'craft') {
    return {
      title: `Craft ${view.name}`,
      helpKind: 'supply',
      recipe: {
        inputs: craftInputs(view.cost, view.bait, gear.parts, gear.balances.bait),
        outputs: [supplyBadge(view.id, view.yieldCount)],
        duration: nominalDurationCountItem(supplyDurationFor(view.id, 1)),
        verb: 'Craft',
      },
      spec: {
        kind: 'supply',
        cost: view.cost,
        bait: view.bait,
        minLevel: view.level,
        durationAtLevel: (level) => supplyDurationFor(view.id, level),
        finish: 'Craft',
        extraBlocker: actions.blocker,
      },
      onStart: (creatureId, treat) => starters.onCraft(view.id, creatureId, treat),
    };
  }
  const conversion = action === 'refine' ? actions.refine : actions.recycle;
  if (conversion === null) return null;
  return {
    title: `${conversion.verb} ${view.name}`,
    helpKind: 'convert',
    recipe: {
      inputs: conversion.inputs,
      outputs: conversion.outputs,
      duration: nominalDurationCountItem(conversionDurationFor(conversion.id, 1)),
      verb: conversion.verb,
    },
    spec: {
      kind: 'convert',
      cost: {},
      minLevel: conversion.level,
      durationAtLevel: (level) => conversionDurationFor(conversion.id, level),
      finish: `Start ${conversion.verb.toLowerCase()}`,
      extraBlocker: action === 'refine' ? actions.refineReason : actions.recycleReason,
    },
    onStart: (creatureId, treat) => starters.onConvert(conversion.id, creatureId, treat),
  };
}
