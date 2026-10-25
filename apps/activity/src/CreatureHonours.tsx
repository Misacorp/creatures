import type { Creature } from './api';
import type { GamesMedal, MedalCounts } from './games-types';
import { Sprite } from './sprites/Sprite';
import type { SpriteDef } from './sprites/sprite-data';

/**
 * Where a creature's honours sit on its card, to compare in the workbench (Misa, 2026-10-25): at the end of
 * the name's line, pinned to the card's top edge, over the portrait, or at the end of the experience bar.
 */
export const HONOURS_LOOKS = ['name', 'pinned', 'portrait', 'xp'] as const;
export type HonoursLook = (typeof HONOURS_LOOKS)[number];

const INK = '#0d0a1a';

/** A rosette with two tails: a ribbon the creature has earned (Bronze at level 10, Silver at 20). */
const ROSETTE_ROWS = [
  '..kkkkk..',
  '.kpqpqpk.',
  'kpqfffqpk',
  'kqfffffqk',
  'kpfffffpk',
  'kqqfffqqk',
  '.kpqpqpk.',
  '..ktkuk..',
  '.ktk.kuk.',
  '.ktk.kuk.',
  'ktk...kuk',
  'kk.....kk',
];

const ROSETTES: readonly SpriteDef[] = [
  {
    rows: ROSETTE_ROWS,
    palette: { k: INK, p: '#c87a3a', q: '#8a4e22', f: '#e8a860', t: '#b8452f', u: '#7a2a1f' },
  },
  {
    rows: ROSETTE_ROWS,
    palette: { k: INK, p: '#d8dce8', q: '#8f97b0', f: '#f4f6fb', t: '#4f8fe6', u: '#2f5fa8' },
  },
];

/** A medal on a short ribbon, its face left plain for the count drawn over it. */
const COIN_ROWS = [
  '..tt...uu..',
  '...tt.uu...',
  '....tuu....',
  '...kkkkk...',
  '.kkaaaaakk.',
  '.kafffffdk.',
  'kafffffffdk',
  'kafffffffdk',
  'kafffffffdk',
  'kafffffffdk',
  'kafffffffdk',
  '.kafffffdk.',
  '.kkdddddkk.',
  '...kkkkk...',
];

const COINS: Readonly<Record<GamesMedal, SpriteDef>> = {
  gold: {
    rows: COIN_ROWS,
    palette: { k: INK, a: '#fff0b0', f: '#ffd25a', d: '#c8952b', t: '#4f8fe6', u: '#2f5fa8' },
  },
  silver: {
    rows: COIN_ROWS,
    palette: { k: INK, a: '#ffffff', f: '#d8dce8', d: '#8f97b0', t: '#ff5f6d', u: '#b8303f' },
  },
  bronze: {
    rows: COIN_ROWS,
    palette: { k: INK, a: '#f6c08a', f: '#d08a4a', d: '#8a5228', t: '#6fdc8c', u: '#3a9a5a' },
  },
};

const MEDALS: readonly GamesMedal[] = ['gold', 'silver', 'bronze'];

/** True when the creature has anything to show: a ribbon, or a medal of any metal. */
export function hasHonours(ribbons: number, medals: MedalCounts | undefined): boolean {
  return ribbons > 0 || (medals !== undefined && MEDALS.some((m) => medals[m] > 0));
}

/**
 * A creature's ribbons as rosettes and its Valley Games medals as small medals with the count on their face:
 * decoration only (hidden from screen readers; the page says the same in words), no words drawn. A metal it
 * has none of is left out, and nothing at all is drawn for a creature with neither.
 */
export function CreatureHonours({
  creature,
  medals,
  look,
}: {
  creature: Pick<Creature, 'ribbons'>;
  medals: MedalCounts | undefined;
  look: HonoursLook;
}) {
  if (!hasHonours(creature.ribbons, medals)) return null;
  const rosettes = ROSETTES.slice(0, Math.max(0, creature.ribbons));
  return (
    <span class={`cc-honours is-${look}`} aria-hidden="true">
      {rosettes.length > 0 && (
        <span class="cc-rosettes">
          {rosettes.map((sprite, i) => (
            <Sprite key={i} sprite={sprite} scale={2} class="cc-rosette" />
          ))}
        </span>
      )}
      {medals !== undefined &&
        MEDALS.filter((m) => medals[m] > 0).map((m) => (
          <span key={m} class={`cc-coin is-${m}`}>
            <Sprite sprite={COINS[m]} scale={2} />
            <span class="cc-coin-n">{medals[m] > 99 ? '99' : medals[m]}</span>
          </span>
        ))}
    </span>
  );
}
