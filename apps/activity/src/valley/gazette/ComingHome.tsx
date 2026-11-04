/**
 * The moment of coming home (V-RET-4a): what the visit brought in as large numbers (the shared count badge,
 * the currency's own icon) that rise from the paper's place and fly up into the purse in the HUD, counting up as
 * they go; the purse bumps when they land (`data-landed`, read by the CSS). It never blocks: it draws over the valley without taking
 * taps, and a tap anywhere finishes it. Everything was in the purse before it began, so ending it early
 * loses nothing. Under reduced motion (and in screenshots) nothing flies: "+N" stands beside the purse for a
 * moment. Decoration only: the purse's own label says the total.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { resourceName } from '@creatures/game';
import { cssVars } from '../../css-vars';
import { BAIT_ICON, ESSENCE_ICON } from '../../count-items';
import { resourceIconRef } from '../../icon-ref';
import { CountBadge } from '../../ui/CountBadge';
import { GameIcon } from '../../ui/GameIcon';
import {
  BUMP_MS,
  coinCount,
  coinDelay,
  coinOffset,
  countSteps,
  COUNT_STEPS,
  FLIGHT_MS,
  NOTE_MS,
  stepText,
  targetOf,
  type FlyMode,
  type Point,
} from './coming-home';
import type { HomeGain } from './stories';

/** The purse's place on the screen now (the HUD's currency pile), or the top right corner if it is not drawn. */
function purseTarget(): Point {
  const el = document.body.querySelector('.currency-pile');
  return el === null ? { x: 340, y: 40 } : targetOf(el.getBoundingClientRect());
}

/** The icon of a resource of the library (the purse draws Bait and Essence; others come from the library). */
function iconOf(resource: string) {
  if (resource === 'bait') return BAIT_ICON;
  if (resource === 'essence') return ESSENCE_ICON;
  return resourceIconRef(resource);
}

export function ComingHome({
  gains,
  from,
  mode,
  onCount,
  onDone,
}: {
  gains: readonly HomeGain[];
  /** Where the paper was when it closed. */
  from: Point;
  mode: FlyMode;
  /** How much of a currency has landed so far, for the purse's own count-up (display only). */
  onCount: (resource: string, counted: number) => void;
  /** The moment is over (it ran out, or a tap finished it). */
  onDone: () => void;
}) {
  const to = useMemo(purseTarget, []);
  const [step, setStep] = useState(0);
  const [landed, setLanded] = useState(false);

  // The purse counts with the numbers.
  useEffect(() => {
    for (const g of gains) {
      onCount(g.resource, mode === 'still' ? g.amount : (countSteps(g.amount)[step] ?? g.amount));
    }
  }, [step, mode]);

  // The count-up: one step per tick over the flight; the purse bumps on the last, the moment ends after the bump.
  useEffect(() => {
    if (mode === 'still') {
      const id = setTimeout(onDone, NOTE_MS);
      return () => {
        clearTimeout(id);
      };
    }
    let current = 0;
    let end: ReturnType<typeof setTimeout> | undefined;
    const id = setInterval(() => {
      current += 1;
      setStep(Math.min(current, COUNT_STEPS - 1));
      if (current >= COUNT_STEPS) {
        clearInterval(id);
        setLanded(true);
        end = setTimeout(onDone, BUMP_MS);
      }
    }, FLIGHT_MS / COUNT_STEPS);
    return () => {
      clearInterval(id);
      if (end !== undefined) clearTimeout(end);
    };
  }, [mode]);

  // A tap anywhere finishes it (the listener only listens: the tap still reaches what it hit).
  useEffect(() => {
    const finish = (): void => {
      setLanded(true);
      onDone();
    };
    document.body.addEventListener('pointerdown', finish, true);
    return () => {
      document.body.removeEventListener('pointerdown', finish, true);
    };
  }, [mode]);

  return (
    <div
      class={`gz-fly ${mode}`}
      data-landed={landed ? '' : undefined}
      aria-hidden="true"
      ref={cssVars({
        '--x0': `${String(from.x)}px`,
        '--y0': `${String(from.y)}px`,
        '--x1': `${String(to.x)}px`,
        '--y1': `${String(to.y)}px`,
        '--flight': `${String(FLIGHT_MS)}ms`,
      })}
    >
      {mode !== 'still' &&
        gains.flatMap((g) => {
          const n = coinCount(g.amount);
          return Array.from({ length: n }, (_, i) => {
            const at = coinOffset(i, n);
            return (
              <span
                key={`${g.resource}-${String(i)}`}
                class="gz-coin"
                ref={cssVars({
                  '--cx': `${String(at.x)}px`,
                  '--cy': `${String(at.y)}px`,
                  '--delay': `${String(coinDelay(i, n))}ms`,
                })}
              >
                <GameIcon icon={iconOf(g.resource)} scale={3} />
              </span>
            );
          });
        })}
      {gains.map((g, i) => (
        <span
          key={g.resource}
          class="gz-fly-gain"
          ref={cssVars({ '--row': i })}
          data-resource={g.resource}
        >
          <CountBadge
            icon={iconOf(g.resource)}
            amount={stepText(g.amount, mode === 'still' ? COUNT_STEPS - 1 : step)}
            label={resourceName(g.resource)}
          />
        </span>
      ))}
    </div>
  );
}
