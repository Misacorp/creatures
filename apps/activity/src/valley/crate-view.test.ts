/**
 * The sealed crate's words and order (`crate-view.ts`): the reveal's order (worst first, best last), a piece's card, the summary with a full
 * bag, the position moves (tap, skip, the last piece waits) and the crate's names on the map and in the Places list.
 */
import { describe, expect, it } from 'vitest';
import type { CratePiece } from '../api';
import { SAMPLE_GEAR } from '../creature-card-sample';
import type { GearRarity } from '../gear-types';
import {
  advance,
  crateAlt,
  crateBubbleLine,
  crateLabel,
  crateLine,
  crateSummary,
  countsLine,
  onLastPiece,
  pieceCard,
  revealOrder,
  skipTo,
} from './crate-view';
import { placeBubbles } from './place-state';
import { forgeSystemsLine } from './forge-view';
import { sampleValley } from './signpost-sample';
import { homeInput } from '../workbench/home-sample';
import { homeAlerts } from '../home-view';

const BASE = SAMPLE_GEAR.items[0];
if (BASE === undefined) throw new Error('fixture');

const piece = (
  id: string,
  rarity: GearRarity,
  itemLevel: number,
  wornBy: string | null = null,
): CratePiece => ({
  item: { ...BASE, id, rarity, itemLevel },
  wornBy,
  madeBy: 'smith-1',
});

const names: Record<string, string> = { 'smith-1': 'Sprig', 'c-2': 'Pip' };
const nameOf = (id: string): string | undefined => names[id];

describe('the reveal order: worst first, best last', () => {
  it('keeps a list that is already in order', () => {
    const list = [piece('a', 'rare', 3), piece('b', 'rare', 9), piece('c', 'epic', 4)];
    expect(revealOrder(list).map((p) => p.item.id)).toEqual(['a', 'b', 'c']);
  });

  it('puts epic after rare, a higher item level later and ties in the order they came', () => {
    const list = [
      piece('epic-low', 'epic', 2),
      piece('rare-high', 'rare', 12),
      piece('rare-low', 'rare', 3),
      piece('rare-low-2', 'rare', 3),
    ];
    expect(revealOrder(list).map((p) => p.item.id)).toEqual([
      'rare-low',
      'rare-low-2',
      'rare-high',
      'epic-low',
    ]);
  });

  it('does not change the list it is given', () => {
    const list = [piece('b', 'epic', 1), piece('a', 'rare', 1)];
    revealOrder(list);
    expect(list.map((p) => p.item.id)).toEqual(['b', 'a']);
  });
});

describe('a piece card', () => {
  it('names the piece, its rarity and level, who put it on and who made it', () => {
    const card = pieceCard(piece('a', 'epic', 13, 'c-2'), nameOf);
    expect(card.rarityLabel).toBe('Epic');
    expect(card.level).toBe(13);
    expect(card.wearLine).toBe('Pip puts it on');
    expect(card.madeLine).toBe('Made by Sprig');
    expect(card.spoken).toBe(`Epic ${card.name}, item level 13. Pip puts it on. Made by Sprig`);
  });

  it('has no wear line for a piece that went to the bag, and no maker for a gone anvil', () => {
    const bag = pieceCard({ ...piece('a', 'rare', 5), madeBy: null }, nameOf);
    expect(bag.wearLine).toBeNull();
    expect(bag.madeLine).toBeNull();
    expect(bag.spoken).toBe(`Rare ${bag.name}, item level 5`);
  });

  it('does not make up a name for a creature it does not know', () => {
    expect(pieceCard(piece('a', 'rare', 5, 'gone'), nameOf).wearLine).toBe('A creature puts it on');
  });
});

describe('the summary', () => {
  it('counts what the crate held, best first, and how many were put on at once', () => {
    const pieces = [piece('a', 'rare', 3), piece('b', 'rare', 9, 'c-2'), piece('c', 'epic', 4)];
    const sum = crateSummary({ pieces, sealed: 0, bagFull: false });
    expect(sum.total).toBe(3);
    expect(sum.counts).toEqual([
      { rarity: 'epic', count: 1 },
      { rarity: 'rare', count: 2 },
    ]);
    expect(countsLine(sum.counts)).toBe('1 epic, 2 rare');
    expect(sum.worn).toBe(1);
    expect(sum.sealedLine).toBeNull();
  });

  it('says when the bag is full and some stay sealed', () => {
    const sum = crateSummary({ pieces: [piece('a', 'rare', 3)], sealed: 2, bagFull: true });
    expect(sum.sealedLine).toBe('The bag is full, 2 stay sealed.');
  });

  it('says how many stay sealed without blaming the bag when it is not the reason', () => {
    const sum = crateSummary({ pieces: [piece('a', 'rare', 3)], sealed: 1, bagFull: false });
    expect(sum.sealedLine).toBe('1 stay sealed.');
  });

  it('is empty for a crate that held nothing', () => {
    const sum = crateSummary({ pieces: [], sealed: 0, bagFull: false });
    expect(sum.total).toBe(0);
    expect(sum.counts).toEqual([]);
  });
});

describe('the reveal moves', () => {
  it('a tap goes one piece on and stops at the summary (the piece count)', () => {
    expect(advance(0, 3)).toBe(1);
    expect(advance(2, 3)).toBe(3);
    expect(advance(3, 3)).toBe(3);
  });

  it('skip goes straight to the summary', () => {
    expect(skipTo(5)).toBe(5);
    expect(skipTo(0)).toBe(0);
  });

  it('only the last piece, the best, waits for the player', () => {
    expect(onLastPiece(0, 3)).toBe(false);
    expect(onLastPiece(2, 3)).toBe(true);
    expect(onLastPiece(3, 3)).toBe(false);
    expect(onLastPiece(0, 0)).toBe(false);
  });
});

describe('the crate on the map and in the room', () => {
  it('reads the glow and the time of day into the art alts', () => {
    expect(crateAlt('rare', true)).toBeUndefined();
    expect(crateAlt('rare', false)).toBe('day');
    expect(crateAlt('epic', true)).toBe('epic');
    expect(crateAlt('epic', false)).toBe('epic-day');
    expect(crateAlt(null, true)).toBeUndefined();
  });

  it('names the crate for the scene button without naming a piece', () => {
    expect(crateLabel({ count: 3, cap: 30, best: 'epic' })).toBe(
      'The sealed crate: 3 pieces, something epic inside. Open it',
    );
    expect(crateLabel({ count: 1, cap: 30, best: 'rare' })).toBe(
      'The sealed crate: 1 piece, something rare inside. Open it',
    );
    expect(crateBubbleLine('rare')).toBe('Something rare waits in the sealed crate');
    expect(crateLine('epic')).toBe('something epic waits');
  });

  const busy = homeInput('nothing waiting', true);
  const free = busy.creatures.map((c) => ({ ...c, busy: null, away: false }));
  const withCrate = (count: number, best: 'rare' | 'epic' | null) => {
    const visit = sampleValley(free, []);
    return { ...visit, forge: { ...visit.forge, crate: { count, cap: 30, best } } };
  };

  it('gives the Forge a bubble on the map, with a count, only while the crate holds pieces', () => {
    const none = placeBubbles(homeAlerts(busy), { ...busy, visit: withCrate(0, null) });
    expect(none.some((b) => b.place === 'forge')).toBe(false);
    const some = placeBubbles(homeAlerts(busy), { ...busy, visit: withCrate(3, 'epic') });
    const bubble = some.find((b) => b.place === 'forge');
    expect(bubble?.count).toBe(3);
    expect(bubble?.spoken).toBe('Something epic waits in the sealed crate');
    const one = placeBubbles(homeAlerts(busy), { ...busy, visit: withCrate(1, 'rare') });
    expect(one.find((b) => b.place === 'forge')?.count).toBeNull();
  });

  it("is the Forge's line in the Places list while it holds pieces", () => {
    expect(forgeSystemsLine(withCrate(2, 'rare'))).toBe('something rare waits');
    expect(forgeSystemsLine(withCrate(0, null))).toBe('a free anvil waits');
  });
});
