import {
  canStep,
  flipKeyStep,
  type FlipProps,
  type FlipStep,
  type FlipVia,
  type KeyLike,
} from './flip-logic';

/** Flips by one step when there is a neighbour that way; true when it did. */
export function tryFlip(flip: FlipProps, step: FlipStep, via: FlipVia): boolean {
  if (!canStep(step, flip.index, flip.count)) return false;
  flip.onFlip(step, via);
  return true;
}

/**
 * The key handler of a screen that flips: Left shows the previous thing, Right the next one. It does
 * nothing for a key typed in a text field, a list or a slider, one with a modifier, or one something
 * else already handled; at an end the key is left alone. True when it flipped (the caller then stops the
 * key reaching anything else).
 */
export function handleFlipKey(
  event: KeyLike & { preventDefault: () => void },
  flip: FlipProps | undefined,
): boolean {
  if (flip === undefined) return false;
  const step = flipKeyStep(event);
  if (step === null || !tryFlip(flip, step, 'key')) return false;
  event.preventDefault();
  return true;
}
