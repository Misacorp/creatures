import type { Creature } from './api';
import type { GamesMedal } from './games-types';
import { Sprite } from './sprites/Sprite';
import type { SpriteDef } from './sprites/sprite-data';

/**
 * A creature's honours on its card (Misa, 2026-10-28; decisions.md): its ribbons as muted strips hanging
 * from the card's top edge behind everything, and its Valley Games medals small, pinned over the card's top
 * edge at the right, with the count on their face. Decoration only: hidden from screen readers (the page
 * says the same in words), no words drawn.
 */

type RibbonKind = 'gold' | 'silver' | 'bronze';

/** The ribbons held, highest first: 1 Bronze, 2 Silver and Bronze, 3 Gold, Silver and Bronze. */
export function ribbonsHeld(ribbons: number): RibbonKind[] {
  const held: RibbonKind[] = [];
  if (ribbons >= 3) held.push('gold');
  if (ribbons >= 2) held.push('silver');
  if (ribbons >= 1) held.push('bronze');
  return held;
}

/** The ribbons as strips behind the card's content; the higher the ribbon, the longer its strip. */
export function CardRibbons({ creature }: { creature: Pick<Creature, 'ribbons'> }) {
  const held = ribbonsHeld(creature.ribbons);
  if (held.length === 0) return null;
  return (
    <span class="cc-ribbons" aria-hidden="true">
      {held.map((kind) => (
        <span key={kind} class={`cc-ribbon is-${kind}`} />
      ))}
    </span>
  );
}

const INK = '#0d0a1a';

/** A small medal on a short ribbon, its face left plain for the count drawn over it. */
const COIN_ROWS = [
  '..tt.uu..',
  '...tuu...',
  '...kkk...',
  '.kkaaakk.',
  '.kafffdk.',
  'kafffffdk',
  'kafffffdk',
  'kafffffdk',
  '.kafffdk.',
  '.kkdddkk.',
  '...kkk...',
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

/** A metal not won yet: the same medal as a flat dark shape in its ink outline, with no count. */
const SILHOUETTE: SpriteDef = {
  rows: COIN_ROWS,
  palette: { k: INK, a: '#4a4370', f: '#4a4370', d: '#4a4370', t: '#4a4370', u: '#4a4370' },
};

const MEDALS: readonly GamesMedal[] = ['gold', 'silver', 'bronze'];

/**
 * The medals small, always in the same three places (gold, silver, bronze) so the leftmost one reads as
 * the best at a glance; a metal not won yet is a silhouette with no count. Nothing at all for a creature
 * that has won none.
 */
export function CardMedals({ creature }: { creature: Pick<Creature, 'medals'> }) {
  const { medals } = creature;
  if (MEDALS.every((m) => medals[m] === 0)) return null;
  return (
    <span class="cc-medals" aria-hidden="true">
      {MEDALS.map((m) =>
        medals[m] > 0 ? (
          <span key={m} class={`cc-coin is-${m}`}>
            <Sprite sprite={COINS[m]} scale={2} />
            <span class="cc-coin-n">{medals[m] > 99 ? '99' : medals[m]}</span>
          </span>
        ) : (
          <span key={m} class={`cc-coin is-${m} is-none`}>
            <Sprite sprite={SILHOUETTE} scale={2} />
          </span>
        ),
      )}
    </span>
  );
}
