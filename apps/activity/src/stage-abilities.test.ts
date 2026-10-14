import { describe, expect, it } from 'vitest';
import { badgeFor, badgeLabel, popoverStateLine, unitTap, usedBadge } from './stage-abilities';

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

describe('popoverStateLine', () => {
  it('writes one short line for each state', () => {
    expect(popoverStateLine(badgeFor(ability(), null, true))).toBe('Auto fire \u00b7 round 7');
    expect(popoverStateLine(badgeFor(ability({ defaultRound: 0 }), null, true))).toBe('Auto fire');
    expect(popoverStateLine(badgeFor(ability({ mode: 'held' }), null, true))).toBe(
      'Auto fire off \u00b7 last round',
    );
    expect(popoverStateLine(badgeFor(ability({ mode: 'fired' }), null, false))).toBe(
      'Fires next round',
    );
    expect(
      popoverStateLine(badgeFor(ability({ mode: 'fired', fireAtRound: 6 }), null, false)),
    ).toBe('Fires in round 6');
    expect(popoverStateLine(usedBadge(5))).toBe('Used in round 5');
  });
});

describe('what a tap on a creature does', () => {
  it('opens the ability popover for your creature with an ability', () => {
    expect(unitTap(true, true)).toBe('ability');
  });

  it('opens a note for your creature without one, so a tap never does nothing', () => {
    expect(unitTap(true, false)).toBe('note');
  });

  it('does nothing for other players and guests', () => {
    expect(unitTap(false, false)).toBe('none');
    expect(unitTap(false, true)).toBe('none');
  });
});
