import { baitCount } from './count-items';
import { CountBadge } from './ui/CountBadge';

/**
 * What a job costs in Bait, as the Bait badge with what the player has after it. Short of Bait it turns red
 * (the badge is underlined, the words "not enough" are there for assistive technology).
 */
export function BaitCost({ cost, have }: { cost: number; have: number }) {
  const short = have < cost;
  return (
    <p class={short ? 'bait-cost short' : 'bait-cost'}>
      <CountBadge {...baitCount(cost)} />
      <span class="muted">(you have {have})</span>
      {short && <span class="visually-hidden"> Not enough Bait.</span>}
    </p>
  );
}
