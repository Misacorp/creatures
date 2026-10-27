import { describe, expect, it } from 'vitest';
import { placeCard, previewIdFor } from './hover';

describe('the wiki hover card script', () => {
  it('finds the card of a link to an entry, and none for anything else', () => {
    expect(previewIdFor('#knack-steady-mark')).toBe('tip-knack-steady-mark');
    expect(previewIdFor('#creature-splashet')).toBe('tip-creature-splashet');
    for (const bad of [
      null,
      '',
      '#',
      'https://example.com/#a',
      '/wiki.html#a',
      '#A b',
      '#a"b',
      '#a>',
    ]) {
      expect(previewIdFor(bad), String(bad)).toBeNull();
    }
  });

  const view = { width: 1000, height: 700 };
  const card = { width: 300, height: 120 };

  it('puts the card under the link when there is room', () => {
    const at = placeCard({ left: 200, top: 100, width: 80, height: 20 }, card, view);
    expect(at).toEqual({ left: 200, top: 126, above: false });
  });

  it('flips above the link when there is no room below', () => {
    const at = placeCard({ left: 200, top: 650, width: 80, height: 20 }, card, view);
    expect(at).toEqual({ left: 200, top: 650 - 6 - 120, above: true });
  });

  it('stays below when there is no room above either, and inside the window', () => {
    const at = placeCard({ left: 10, top: 20, width: 80, height: 20 }, card, {
      width: 400,
      height: 150,
    });
    expect(at.above).toBe(false);
    expect(at.top).toBe(22);
    expect(at.top + card.height).toBeLessThanOrEqual(150 - 8);
  });

  it('keeps the card inside the window sideways, at 390 px too', () => {
    const right = placeCard({ left: 950, top: 100, width: 40, height: 20 }, card, view);
    expect(right.left).toBe(1000 - 300 - 8);
    const left = placeCard({ left: -20, top: 100, width: 40, height: 20 }, card, view);
    expect(left.left).toBe(8);
    const phone = placeCard(
      { left: 300, top: 300, width: 60, height: 20 },
      { width: 340, height: 100 },
      { width: 390, height: 800 },
    );
    expect(phone.left).toBe(390 - 340 - 8);
    expect(phone.left + 340).toBeLessThanOrEqual(390);
  });
});
