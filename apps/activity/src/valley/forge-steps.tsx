/**
 * The Forge's steps that used to be sheets over a drawer (Misa, 2026-11-14: "no sheet over a drawer"): an item's card (opened from the
 * bag, with the dismantle flow after it) and the fire's numbers (opened from the project board). Each is a step of the panel that holds
 * it, with Back; where it shows is one switch (`valley/drawer-step`): in place of the list (`replace`, and always on a phone), or on a
 * wide window in the other drawer (`beside`).
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ValleyVisit } from '../api';
import { useWide } from '../ui/wide-layout';
import { FireNumbers } from './CommonsFire';
import { stepBeside } from './drawer-step';
import { StepHold } from './PanelStep';
import type { CanvasPanel } from './PlaceCanvas';

/** The item card, or the dismantle flow, as the bag's owner (the Workshop) builds it: the step's content and how it goes back. */
export interface ForgeCard {
  /** The panel's heading when the card is in the right drawer (the item's name). */
  title: string;
  /** The step (a `StepBody`, with its own Back). */
  node: ComponentChildren;
  /** Back to the bag (from the card), or to the card (from the flow); also the right drawer's X and Escape. */
  onClose: () => void;
  /** Ends the card and the flow whole (its drawer went, or an anvil took the right drawer). */
  dismiss: () => void;
}

export type StepList = 'bag' | 'board';

export interface ForgeSteps {
  /** A left panel's list with its step in place of it (or the list alone); `wizard` says the body has its own Back. */
  hold: (
    kind: StepList,
    list: ComponentChildren,
  ) => { children: ComponentChildren; wizard: boolean };
  /** The right drawer's panel when a step opens beside the list (wide window, `beside` look), else null. */
  side: CanvasPanel | null;
  openFire: () => void;
}

export function useForgeSteps({
  card,
  left,
  anvilOpen,
  visit,
  startFire,
}: {
  card: ForgeCard | null | undefined;
  /** Which left panel is open. */
  left: string | null;
  /** An anvil's, buy or order panel holds the right drawer. */
  anvilOpen: boolean;
  visit: ValleyVisit;
  startFire: boolean;
}): ForgeSteps {
  const wide = useWide();
  const beside = stepBeside(wide);
  const [fire, setFire] = useState(startFire);
  const cardOn = card !== null && card !== undefined && left === 'bag';
  const fireOn = fire && left === 'board';

  // A step belongs to its list: the list's drawer closing, or the right drawer being taken by an anvil, ends it.
  useEffect(() => {
    if (card !== null && card !== undefined && (left !== 'bag' || (beside && anvilOpen)))
      card.dismiss();
  }, [left, beside, anvilOpen, card !== null && card !== undefined]);
  useEffect(() => {
    if (fire && (left !== 'board' || (beside && anvilOpen))) setFire(false);
  }, [left, beside, anvilOpen, fire]);

  const closeFire = (): void => {
    setFire(false);
  };
  const fireNode = (
    <FireNumbers visit={visit} backLabel="to the project board" onBack={closeFire} />
  );

  let side: CanvasPanel | null = null;
  if (beside && !anvilOpen) {
    if (cardOn) {
      side = { title: card.title, wizard: true, onClose: card.onClose, children: card.node };
    } else if (fireOn) {
      side = { title: 'The fire', wizard: true, onClose: closeFire, children: fireNode };
    }
  }

  return {
    hold: (kind, list) => {
      const step = beside
        ? null
        : kind === 'bag'
          ? cardOn
            ? card.node
            : null
          : fireOn
            ? fireNode
            : null;
      return {
        children: <StepHold list={list} step={step} />,
        wizard: step !== null,
      };
    },
    side,
    openFire: () => {
      setFire(true);
    },
  };
}
