import type { RefObject } from 'preact';
import { useLayoutEffect } from 'preact/hooks';
import type { Zone } from '@creatures/engine';
import { fxPlanOf } from '../move-fx';
import type { BossStrike } from '../stage';
import { playImpact, playWindup } from './boss-fx';

/**
 * One boss action's animation on the stage (see `boss-fx.ts`): `windup` plays the first half while
 * the boss winds up (`ms`), `impact` the second from the moment it lands. Draws nothing itself and
 * nothing at all with reduced motion: the reticles, the marks and the numbers say it.
 */
export function BossFx({
  phase,
  strike,
  seed,
  ms,
  element,
  layer,
  boss,
  unit,
  zone,
}: {
  phase: 'windup' | 'impact';
  strike: BossStrike;
  /** The action's event index: small stable variations. */
  seed: number;
  /** The wind-up's length (`windup` only). */
  ms: number;
  /** The boss's element: the colour of a move with no theme of its own. */
  element: string | null;
  layer: RefObject<HTMLElement | null>;
  boss: () => HTMLElement | null;
  unit: (id: string) => HTMLElement | null;
  zone: (zone: Zone) => HTMLElement | null;
}) {
  useLayoutEffect(() => {
    const host = layer.current;
    if (host === null) return undefined;
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return undefined;
    }
    const plan = fxPlanOf(strike, element);
    if (plan === null) return undefined;
    const stage = { layer: host, boss: boss(), unit, zone };
    return phase === 'windup' ? playWindup(stage, plan, ms, seed) : playImpact(stage, plan, seed);
  }, []);
  return null;
}
