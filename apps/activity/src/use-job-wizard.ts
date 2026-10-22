import { useEffect, useState } from 'preact/hooks';
import type { Creature } from './api';
import type {
  CraftOption,
  CraftPreview,
  GearState,
  JobKind,
  PartsBundle,
  ReachId,
} from './gear-types';
import { startBlocker, type PickerOption } from './gear-view';
import { jobWho, type JobWho } from './job-who';
import { useJobPreview, type PreviewStatusName } from './use-job-preview';
import { useWizard, type Wizard, type WizardStep } from './ui/use-wizard';

/**
 * The steps of a Workshop job: who does the work, then the summary with the treat and the start. A gear craft
 * has one more between them, how hard to reach.
 */
export type JobStep = 'who' | 'reach' | 'ready';

/** What makes a job a gear craft: the blueprint and the way to ask the server for the odds of a creature. */
export interface CraftSpec {
  blueprintId: string;
  /** The server's preview of this craft for a creature (its odds, cost and time for each Reach). */
  load: (creatureId: string, blueprintId: string) => Promise<CraftPreview>;
}

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
  /** Set for a gear craft: it adds the Reach step and takes its cost and time from the server's preview. */
  craft?: CraftSpec;
}

/** The steps of a job, in order. Back on Who closes the drawer, which is why it says so. */
export function jobSteps(finish: string, withReach = false): readonly WizardStep<JobStep>[] {
  return [
    { id: 'who', title: 'Who crafts', backLabel: 'and close', next: 'Next' },
    ...(withReach
      ? [
          {
            id: 'reach' as const,
            title: 'How hard do you reach?',
            backLabel: 'to who crafts',
            next: 'Next',
          },
        ]
      : []),
    {
      id: 'ready',
      title: 'Ready',
      backLabel: withReach ? 'to how hard you reach' : 'to who crafts',
      next: finish,
    },
  ];
}

/** The Reach step's state: the server's preview for the picked creature and the way chosen from it. */
export interface JobReach {
  status: PreviewStatusName;
  preview: CraftPreview | null;
  /** The chosen way (a locked one is never chosen; a plain craft when nothing else is). */
  chosen: CraftOption | undefined;
  choose: (reach: ReachId) => void;
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
  /** The Reach step's state; null for a job without one. */
  reach: JobReach | null;
  /** How long the job takes the picked creature: the chosen Reach's time for a craft. */
  durationMs: number | null;
  /** The call to make on finish; null while there is nobody to do the job. `reach` is 'none' for a job without Reach. */
  request: { creatureId: string; treat: boolean; reach: ReachId } | null;
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
  start?:
    | { step?: JobStep | undefined; treat?: boolean | undefined; reach?: ReachId | undefined }
    | undefined;
}): JobWizard {
  const { spec, gear, creatures } = input;
  const [choice, setChoice] = useState<string | null>(null);
  const [asked, setTreat] = useState(input.start?.treat === true);
  const [reachChoice, setReach] = useState<ReachId>(input.start?.reach ?? 'none');
  const craft = spec.craft;
  const wizard = useWizard(jobSteps(spec.finish, craft !== undefined), {
    onExit: input.onExit,
    initial: input.start?.step,
  });

  const who = jobWho(creatures, gear.skills, spec.durationAtLevel, spec.minLevel);
  const chosenWho = who.able.find((o) => o.creature.id === choice);
  const picked = chosenWho ?? who.able[0];
  const bait = spec.bait ?? 0;
  const treatBait = gear.balances.bait - bait;
  const treat = asked && picked !== undefined && treatBait >= picked.creature.treatCost;

  // A craft's numbers are the server's for the picked creature; they follow what the player holds.
  const { status, preview } = useJobPreview(
    craft === undefined ? null : (picked?.creature.id ?? null),
    (creatureId) =>
      craft === undefined
        ? Promise.reject(new Error('no craft'))
        : craft.load(creatureId, craft.blueprintId),
    [craft?.blueprintId, gear.serverNow],
  );
  const chosen: CraftOption | undefined =
    preview?.options.find((o) => o.reach === reachChoice && o.unlocked) ??
    preview?.options.find((o) => o.reach === 'none');
  const reach: JobReach | null =
    craft === undefined ? null : { status, preview, chosen, choose: setReach };

  const startCheck = startBlocker(gear, creatures, {
    kind: spec.kind,
    cost: chosen?.parts ?? spec.cost,
    ...(chosen === undefined ? {} : { essence: chosen.essence }),
    bait,
  });
  // Past Who the numbers must be here: say so rather than leave the button silently grey.
  const waiting =
    craft === undefined || wizard.step === 'who' || picked === undefined
      ? null
      : status === 'loading'
        ? 'Loading the odds...'
        : status === 'failed'
          ? 'The odds did not load. Go back and pick again.'
          : preview?.locked === true
            ? `Needs Crafting level ${String(preview.needsCraftingLevel)}.`
            : null;
  const blocker = startCheck ?? spec.extraBlocker ?? who.blocker ?? waiting;
  const ready = craft === undefined || (chosen !== undefined && preview?.locked !== true);

  const nobody = picked === undefined;
  useEffect(() => {
    if (nobody && wizard.step !== 'who') wizard.goTo('who');
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
    reach,
    durationMs: picked === undefined ? null : (chosen?.durationMs ?? picked.durationMs),
    request:
      picked === undefined || !ready
        ? null
        : { creatureId: picked.creature.id, treat, reach: chosen?.reach ?? 'none' },
  };
}
