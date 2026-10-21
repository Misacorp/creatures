import { tripMs } from '@creatures/game';
import { useState } from 'preact/hooks';
import type { Creature } from './api';
import type { TripContext } from './boost-view';
import { destinationCards, type DestinationCard } from './destination-view';
import type { SendRequest } from './expedition-api';
import type { DestinationsView, ExpeditionLength, Slots, SupplyPick } from './expedition-types';
import { getSpecies } from './game';
import { useWizard, type Wizard, type WizardStep } from './ui/use-wizard';
import {
  clampLength,
  defaultExplorer,
  explorerOptions,
  sendBlocker,
  stepBlocker,
  type ExplorerOption,
  type SendStep,
} from './send-view';

/** The steps of the phone wizard in order: the title of each, what Back goes back to (said only to screen readers) and its forward button. */
export const SEND_STEP_DEFS: readonly WizardStep<SendStep>[] = [
  { id: 'who', title: 'Who goes', backLabel: 'to the place', next: 'Next' },
  { id: 'pack', title: 'Pack up', backLabel: 'to who goes', next: 'Next' },
  { id: 'ready', title: 'Ready', backLabel: 'to packing up', next: 'Send' },
];

/** What the send form needs from the app. The destination is fixed: the place was chosen on the map. */
export interface SendFormInput {
  creatures: readonly Creature[];
  /** The destinations the server listed. */
  view: DestinationsView;
  /** The id of the place the explorer goes to. */
  destination: string;
  slots: Slots;
  stock: Readonly<Record<string, number>>;
  /** The player's Bait: a treat costs some of it. */
  bait: number;
  /** The guild's timezone, always explicit (null when unknown). */
  timezone: string | null;
  /** The step to start on (Who by default). */
  initialStep?: SendStep;
  /** Back on the first step (Who) calls this: the sheet goes back to the place view. */
  onExit?: (() => void) | undefined;
}

/** The send form's state and everything derived from it, for one fixed place. */
export interface SendForm {
  /** The place, or undefined when the server does not list it. */
  place: DestinationCard | undefined;
  /** Every creature, free ones first, each with why it cannot go (when it cannot). */
  options: ExplorerOption[];
  /** The explorer that goes: the one picked while it exists, else the first that can go. */
  explorer: ExplorerOption | undefined;
  pickExplorer: (creatureId: string) => void;
  /** The explorer's rank (1 without an explorer). */
  rank: number;
  /** The trip length, clamped to what the explorer's rank allows (12 h by default). */
  length: ExpeditionLength;
  setLength: (length: ExpeditionLength) => void;
  picks: SupplyPick[];
  setPicks: (picks: SupplyPick[]) => void;
  /** A treat is packed (asked for, and the Bait still covers it). */
  treat: boolean;
  setTreat: (treat: boolean) => void;
  treatCost: number;
  bait: number;
  stock: Readonly<Record<string, number>>;
  timezone: string | null;
  /** What the haul strip works its boost brackets out for. */
  trip: TripContext;
  /** The place's element for the haul strip (null for a mixed place). */
  element: string | null;
  /** When the summary says the trip is back, if sent now. */
  now: number;
  endsAt: number;
  /** Why a send is refused as chosen; null when it can go. */
  blocker: string | null;
  /** Why Next is disabled on the current step; null when it is not. */
  stepBlocker: string | null;
  /** The request to send; null while there is no explorer or place. */
  request: SendRequest | null;
  /** The wizard's position and moves (`ui/Wizard`); the panel layout ignores it. */
  wizard: Wizard<SendStep>;
  /** The wizard's current step. */
  step: SendStep;
  /** After a send that started: puts the supplies and the treat down and goes back to Who. */
  reset: () => void;
}

/**
 * The send form's state for a fixed place: who goes, how long, the supplies, a treat, the wizard step,
 * and what follows from them (the blocker, the trip context for the haul strip and summary, the request).
 * Defaults are the old send screen's: the first explorer that can go, 12 h (clamped to the rank), no
 * supplies, no treat. The server decides every send; this only collects the choice.
 */
export function useSendForm(input: SendFormInput): SendForm {
  const { creatures, view, destination, slots, stock, bait, timezone, initialStep, onExit } = input;
  const [creatureId, setCreatureId] = useState<string | null>(null);
  const [wanted, setLength] = useState<ExpeditionLength>('long');
  const [picks, setPicks] = useState<SupplyPick[]>([]);
  // A treat for this one trip (never kept for the next: it costs Bait each time).
  const [asked, setTreat] = useState(false);
  const wizard = useWizard(SEND_STEP_DEFS, { initial: initialStep, onExit });
  const step = wizard.step;

  // Who can go depends on the place's rank gate; the card depends on who goes (stars, deeper area).
  const bare = destinationCards(view, undefined, timezone).find((c) => c.id === destination);
  const options = explorerOptions(creatures, bare, view);
  const explorer = defaultExplorer(options, creatureId);
  const place = destinationCards(view, explorer?.creature, timezone).find(
    (c) => c.id === destination,
  );
  const rank = explorer?.rank ?? 1;
  const length = clampLength(wanted, rank);
  const choice = {
    slots,
    explorer,
    place,
    length,
    picks,
    stock,
    none: options[0]?.blocked ?? null,
  };
  const blocker = sendBlocker(choice);
  const blockedHere = stepBlocker(step, choice);
  const treatCost = explorer?.creature.treatCost ?? 0;
  // A treat the Bait no longer covers (the explorer changed, or Bait was spent) is not packed.
  const treat = asked && explorer !== undefined && bait >= treatCost;
  const now = Date.now();
  const trip: TripContext = {
    length,
    place: place?.id ?? null,
    role: explorer === undefined ? null : (getSpecies(explorer.creature.species)?.role ?? null),
    stars: explorer?.stars ?? 0,
    twist: place !== undefined && view.special.destination === place.id ? view.special.twist : null,
  };
  const request: SendRequest | null =
    explorer === undefined || place === undefined
      ? null
      : {
          creatureId: explorer.creature.id,
          destination: place.id,
          duration: length,
          supplies: picks,
          ...(treat ? { treat: true } : {}),
        };

  return {
    place,
    options,
    explorer,
    pickExplorer: setCreatureId,
    rank,
    length,
    setLength,
    picks,
    setPicks,
    treat,
    setTreat,
    treatCost,
    bait,
    stock,
    timezone,
    trip,
    element: place?.element ?? null,
    now,
    endsAt: now + tripMs(length, rank),
    blocker,
    stepBlocker: blockedHere,
    request,
    wizard,
    step,
    reset: () => {
      setPicks([]);
      setTreat(false);
      wizard.goTo('who');
    },
  };
}
