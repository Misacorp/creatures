import { describe, expect, it } from 'vitest';
import { badgeFor, badgeLabel, placePopover, usedBadge, type Box } from './stage-abilities';

const ability = (over: Partial<Parameters<typeof badgeFor>[0]> = {}) => ({
  mode: 'default' as const,
  fired: false,
  firedAtRound: null,
  fireAtRound: null,
  defaultRound: 7,
  ...over,
});
const used = { key: 'm1:c0', ability: 'flare-strike', creature: 'a', round: 5 };

describe('ability badges', () => {
  it('shows auto fire on with its default round, pulsing while it can still be used', () => {
    expect(badgeFor(ability(), null, true)).toEqual({
      kind: 'auto',
      round: 7,
      pulse: true,
      label: 'Auto fire on, round 7',
    });
    expect(badgeFor(ability(), null, false).pulse).toBe(false);
  });

  it('has no round when the server does not know the default', () => {
    expect(badgeFor(ability({ defaultRound: 0 }), null, true)).toMatchObject({
      kind: 'auto',
      round: null,
      label: 'Auto fire on',
    });
  });

  it('shows auto fire off as manual, without a pulse', () => {
    expect(badgeFor(ability({ mode: 'held' }), null, true)).toEqual({
      kind: 'manual',
      round: null,
      pulse: false,
      label: 'Auto fire off',
    });
  });

  it('shows a pressed ability with the round it fires in', () => {
    expect(badgeFor(ability({ mode: 'fired', fireAtRound: 6 }), null, false)).toMatchObject({
      kind: 'pressed',
      round: 6,
      label: 'Fires in round 6',
    });
    expect(badgeFor(ability({ mode: 'fired' }), null, false).label).toBe('Fires next round');
  });

  it('shows the used state with the round it fired, once the stage has played it', () => {
    expect(badgeFor(ability({ mode: 'fired', fireAtRound: 5 }), used, false)).toEqual(usedBadge(5));
    expect(usedBadge(5)).toEqual({
      kind: 'used',
      round: 5,
      pulse: false,
      label: 'Used in round 5',
    });
  });

  it('keeps an ability the server has fired as pressed until the stage plays it', () => {
    const b = badgeFor(ability({ mode: 'fired', fired: true, firedAtRound: 5 }), null, false);
    expect(b).toMatchObject({ kind: 'pressed', round: 5, pulse: false });
  });

  it('gives every state its own words, so it never rests on colour alone', () => {
    const labels = [
      badgeLabel('auto', 7),
      badgeLabel('manual', null),
      badgeLabel('pressed', 7),
      badgeLabel('used', 7),
    ];
    expect(new Set(labels).size).toBe(4);
    for (const label of labels) expect(label).not.toMatch(/\bhold\b/i);
  });
});

describe('placePopover', () => {
  const bounds: Box = { left: 0, top: 0, width: 280, height: 600 };
  const size = { width: 232, height: 150 };
  const anchor = (left: number, top: number): Box => ({ left, top, width: 40, height: 60 });

  it('goes below the creature and is centred on it', () => {
    const at = placePopover(anchor(120, 200), bounds, size);
    expect(at.placement).toBe('below');
    expect(at.y).toBe(60 + 6);
    // The anchor's centre is 140, so the popover starts 116 to the left of it, and the arrow points at it.
    expect(at.x + 120).toBe(140 - 116);
    expect(at.arrowX).toBe(116);
  });

  it('stays inside the bounds at both sides and keeps the arrow on the creature', () => {
    const left = placePopover(anchor(0, 100), bounds, size);
    expect(left.x).toBe(0);
    expect(left.arrowX).toBe(20);
    const right = placePopover(anchor(240, 100), bounds, size);
    expect(right.x + 240 + size.width).toBeLessThanOrEqual(280);
    expect(right.arrowX).toBeLessThanOrEqual(size.width - 10);
  });

  it('flips above when there is no room below', () => {
    const at = placePopover(anchor(100, 500), bounds, size);
    expect(at.placement).toBe('above');
    expect(at.y).toBe(-(size.height + 6));
  });

  it('is clamped into the bounds when neither side has room', () => {
    const small: Box = { left: 0, top: 0, width: 280, height: 160 };
    const at = placePopover(anchor(100, 50), small, size);
    expect(at.placement).toBe('below');
    expect(50 + at.y).toBeGreaterThanOrEqual(0);
    expect(50 + at.y + size.height).toBeLessThanOrEqual(160);
  });

  it('works in any coordinate space (the bounds need not start at zero)', () => {
    const shifted: Box = { left: 500, top: 300, width: 280, height: 600 };
    const at = placePopover(anchor(520, 320), shifted, size);
    expect(520 + at.x).toBeGreaterThanOrEqual(500);
    expect(520 + at.x + size.width).toBeLessThanOrEqual(780);
  });
});
