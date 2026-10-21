import { useRef, useState } from 'preact/hooks';

/** One step of a wizard. `Id` is the caller's own union of step ids ("who" | "pack" | "ready"). */
export interface WizardStep<Id extends string = string> {
  id: Id;
  /** The heading shown in the head. Plain text. */
  title: string;
  /** What Back goes back to, said only to screen readers ("to the place": "‹ Back to the place"). */
  backLabel: string;
  /** The label of the forward button on this step; "Next" when missing. On the last step it is the finish label. */
  next?: string;
}

/** What `useWizard` returns: the position and the moves. The pieces in `ui/Wizard` read it. */
export interface Wizard<Id extends string = string> {
  steps: readonly WizardStep<Id>[];
  /** The current step's definition. */
  current: WizardStep<Id>;
  /** The current step's id. */
  step: Id;
  /** Its place in the list, from 0. */
  index: number;
  first: boolean;
  last: boolean;
  /** Whether Back does something: not on the first step unless the wizard has an `onExit`. */
  canBack: boolean;
  /** One step on (stays on the last step; the finish is the caller's). */
  next: () => void;
  /** One step back; on the first step it calls `onExit` when there is one. */
  back: () => void;
  /** Straight to a step. An id that is not in the list is ignored. */
  goTo: (id: Id) => void;
  /** Back to the starting step. */
  reset: () => void;
}

export interface WizardOptions<Id extends string> {
  /** The step to start on, and to go back to on `reset` (the first by default). */
  initial?: Id | undefined;
  /** Called by Back on the first step (leave the wizard: back to the place view, close). Without it Back does nothing there. */
  onExit?: (() => void) | undefined;
}

function indexOf<Id extends string>(steps: readonly WizardStep<Id>[], id: Id): number {
  return steps.findIndex((s) => s.id === id);
}

/**
 * The position of a step-by-step flow: which step it is on and how to move. It knows nothing about what
 * the steps hold, whether the step may be left (the caller passes `blocked` to `WizardFooter`) or where
 * it is drawn. `onExit` is read at the moment of the call, so a new closure each render is fine.
 */
export function useWizard<Id extends string>(
  steps: readonly WizardStep<Id>[],
  options: WizardOptions<Id> = {},
): Wizard<Id> {
  const first = steps[0];
  if (first === undefined) throw new Error('a wizard needs at least one step');
  const start =
    options.initial !== undefined && indexOf(steps, options.initial) >= 0
      ? options.initial
      : first.id;
  const [step, setStep] = useState<Id>(start);
  const exit = useRef(options.onExit);
  exit.current = options.onExit;
  const index = Math.max(indexOf(steps, step), 0);
  const current = steps[index] ?? first;
  return {
    steps,
    current,
    step: current.id,
    index,
    first: index === 0,
    last: index === steps.length - 1,
    canBack: index > 0 || options.onExit !== undefined,
    next: () => {
      setStep((steps[Math.min(index + 1, steps.length - 1)] ?? current).id);
    },
    back: () => {
      if (index === 0) exit.current?.();
      else setStep((steps[index - 1] ?? first).id);
    },
    goTo: (id) => {
      if (indexOf(steps, id) >= 0) setStep(id);
    },
    reset: () => {
      setStep(start);
    },
  };
}
