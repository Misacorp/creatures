import { useEffect, useState } from 'preact/hooks';
import type { Creature } from './api';
import type { GearState, JobKind, PartsBundle } from './gear-types';
import { startBlocker, type PickerOption } from './gear-view';
import { jobWho, type JobWho } from './job-who';
import { useWizard, type Wizard, type WizardStep } from './ui/use-wizard';

/** The two steps of a Workshop job: who does the work, then the summary with the treat and the start. */
export type JobStep = 'who' | 'ready';

/** What a job needs from its caller. Everything else (who is free, the picks, the blocker) is worked out here. */
export interface JobSpec {
  /** The server's job kind, for the start check ("supply" for a craft, "convert" for a refine or recycle). */
  kind: JobKind;
  /** The parts the job takes (the start check says which one is short). */
  cost: PartsBundle;
  /** The Bait it takes besides the parts (a lure); 0 or absent: none. */
  bait?: number;
  /** The Crafting level a creature needs. */
  minLevel: number;
  /** How long the job takes a creature of a Crafting level, in milliseconds. */
  durationAtLevel: (level: number) => number;
  /** The finish button's words ("Craft", "Start refine"). */
  finish: string;
  /** Another reason it cannot start (the recipe's inputs are gone), shown like the others. */
  extraBlocker?: string | null;
}

/** The steps of a job, in order. Back on Who closes the drawer, which is why it says so. */
export function jobSteps(finish: string): readonly WizardStep<JobStep>[] {
  return [
    { id: 'who', title: 'Who crafts', backLabel: 'and close', next: 'Next' },
    { id: 'ready', title: 'Ready', backLabel: 'to who crafts', next: finish },
  ];
}

export interface JobWizard {
  wizard: Wizard<JobStep>;
  who: JobWho;
  /** The creature that does the job: the player's pick while it can still do it, else the first that can. */
  picked: PickerOption | undefined;
  pick: (creatureId: string) => void;
  /** A treat is packed (asked for, and the Bait left after the job's own Bait still covers it). */
  treat: boolean;
  setTreat: (treat: boolean) => void;
  /** The Bait the treat can spend: what is held minus the job's own Bait. */
  treatBait: number;
  /** Why the job cannot start as chosen (on both steps, so a grey button always has its reason); null when it can. */
  blocker: string | null;
  /** The call to make on finish; null while there is nobody to do the job. */
  request: { creatureId: string; treat: boolean } | null;
}

/**
 * The state of the job wizard: who is picked, the treat, and the wizard's position. It is the worker's
 * choice that matters: a creature that became busy (or lost the level) is no longer picked, and if the
 * wizard is on Ready with nobody to do the job it goes back to Who. The server decides every start.
 */
export function useJobWizard(input: {
  spec: JobSpec;
  gear: GearState;
  creatures: readonly Creature[];
  /** Back on Who: the drawer closes. */
  onExit: () => void;
  /** Where it starts (the workbench opens it on Ready with a treat packed); Who with no treat by default. */
  start?: { step?: JobStep | undefined; treat?: boolean | undefined } | undefined;
}): JobWizard {
  const { spec, gear, creatures } = input;
  const [choice, setChoice] = useState<string | null>(null);
  const [asked, setTreat] = useState(input.start?.treat === true);
  const wizard = useWizard(jobSteps(spec.finish), {
    onExit: input.onExit,
    initial: input.start?.step,
  });

  const who = jobWho(creatures, gear.skills, spec.durationAtLevel, spec.minLevel);
  const chosen = who.able.find((o) => o.creature.id === choice);
  const picked = chosen ?? who.able[0];
  const bait = spec.bait ?? 0;
  const treatBait = gear.balances.bait - bait;
  const treat = asked && picked !== undefined && treatBait >= picked.creature.treatCost;
  const blocker =
    startBlocker(gear, creatures, { kind: spec.kind, cost: spec.cost, bait }) ??
    spec.extraBlocker ??
    who.blocker;

  const nobody = picked === undefined;
  useEffect(() => {
    if (nobody && wizard.step === 'ready') wizard.goTo('who');
  }, [nobody, wizard.step]);

  return {
    wizard,
    who,
    picked,
    pick: setChoice,
    treat,
    setTreat,
    treatBait,
    blocker,
    request: picked === undefined ? null : { creatureId: picked.creature.id, treat },
  };
}
