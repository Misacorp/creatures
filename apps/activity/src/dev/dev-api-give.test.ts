import { describe, expect, it } from 'vitest';
import { describeBench, parsePresetChoices } from './dev-api';

describe('the give answers', () => {
  it('says what a grant did in one sentence', () => {
    expect(describeBench('grant-currency', { balances: { bait: 70, essence: 2 } })).toBe(
      'Balance now 70 Bait and 2 Essence.',
    );
    expect(describeBench('grant-gear', { given: 1 })).toBe('1 item given.');
    expect(describeBench('grant-gear', { given: 5 })).toBe('5 items given.');
    expect(describeBench('grant-xp', { creatures: 2, levelsGained: 1 })).toBe(
      '2 creatures paid, 1 level gained.',
    );
    expect(describeBench('grant-creature', { createdCount: 1, creatureIds: ['a', 'b'] })).toBe(
      '2 creatures set, 1 new.',
    );
    expect(describeBench('grant-gear', {})).toBeNull();
    expect(describeBench('grant-currency', { balances: 5 })).toBeNull();
  });
});

describe('the player list', () => {
  const list = {
    you: 'a',
    players: [
      {
        userId: 'a',
        name: 'Ann',
        creatures: 1,
        items: 0,
        roster: [{ id: 'c1', species: 'cindle', level: 3 }],
      },
    ],
    presets: [],
  };

  it('reads the caller and each player’s creatures', () => {
    const read = parsePresetChoices(list);
    expect(read?.you).toBe('a');
    expect(read?.players[0]?.roster).toEqual([{ id: 'c1', species: 'cindle', level: 3 }]);
  });

  it('refuses a list without the caller or with a broken roster', () => {
    expect(parsePresetChoices({ ...list, you: undefined })).toBeNull();
    expect(
      parsePresetChoices({ ...list, players: [{ ...list.players[0], roster: [{ id: 1 }] }] }),
    ).toBeNull();
    expect(
      parsePresetChoices({ ...list, players: [{ ...list.players[0], roster: undefined }] }),
    ).toBeNull();
  });
});
