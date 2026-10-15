import { content } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { BossStrike } from './stage';
import { forecastNextRound, strikeLabel } from './telegraph';

const names = {
  creatures: { a: 'Cindle', b: 'Dew', c: 'Zip', d: 'Ray' } as Record<string, string>,
  gimmicks: {
    undertow: 'Undertow',
    'lightning-rod': 'Lightning Rod',
    'bramble-bind': 'Bramble Bind',
    backdraft: 'Backdraft',
  } as Record<string, string>,
};
const strike = (over: Partial<BossStrike>): BossStrike => ({
  action: 'attack',
  gimmick: null,
  targets: [],
  zone: null,
  blocked: [],
  guarded: null,
  ...over,
});

describe('strike labels', () => {
  it('names the attack and whom it hits, in plain words', () => {
    expect(
      strikeLabel(strike({ action: 'hit_zone', gimmick: 'undertow', zone: 'front' }), names).text,
    ).toBe('Undertow · whole FRONT row');
    expect(
      strikeLabel(
        strike({ action: 'strike_highest_atk', gimmick: 'lightning-rod', targets: ['a'] }),
        names,
      ).text,
    ).toBe('Lightning Rod · Cindle');
    expect(
      strikeLabel(
        strike({ action: 'silence_ends', gimmick: 'bramble-bind', targets: ['b', 'd'] }),
        names,
      ).text,
    ).toBe('Bramble Bind · both ends');
    expect(strikeLabel(strike({ action: 'attack', targets: ['c'] }), names).text).toBe(
      'Attack · Zip',
    );
  });

  it('says when a guard stepped in, when only one end was silenced and when the trap is set', () => {
    expect(strikeLabel(strike({ targets: ['b'], guarded: 'a' }), names).area).toBe(
      'Dew, guarding Cindle',
    );
    expect(
      strikeLabel(
        strike({ action: 'silence_ends', gimmick: 'bramble-bind', targets: ['b'] }),
        names,
      ).area,
    ).toBe('Dew');
    expect(strikeLabel(strike({ action: 'reflect_armed', gimmick: 'backdraft' }), names).text).toBe(
      'Backdraft · reflects the first reaction',
    );
    expect(
      strikeLabel(strike({ action: 'reflect', gimmick: 'backdraft', targets: ['c'] }), names).text,
    ).toBe('Backdraft · reflected onto Zip');
  });

  it('falls back to the ids and to generic words when the names are missing', () => {
    expect(strikeLabel(strike({ targets: ['zz'] }), { creatures: {} }).text).toBe('Attack · zz');
    expect(strikeLabel(strike({ action: 'hit_zone', zone: 'back' }), { creatures: {} }).text).toBe(
      'Zone hit · whole BACK row',
    );
    expect(strikeLabel(strike({ action: 'other', gimmick: 'x', targets: [] }), names).title).toBe(
      'Boss move',
    );
  });

  it('is only ever text: a name with markup stays as it is', () => {
    const evil = { creatures: { a: '<img src=x onerror=alert(1)>' } };
    expect(strikeLabel(strike({ targets: ['a'] }), evil).text).toBe(
      'Attack · <img src=x onerror=alert(1)>',
    );
  });
});

describe('the forecast one round ahead', () => {
  const row = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('says Undertow hits FRONT in the round before it, and marks the zone', () => {
    // Undertow fires on rounds 3, 6, 9 and 12.
    expect(forecastNextRound('tidal-colossus', 2, 12, row, [], names)).toEqual({
      text: 'Next round: Undertow hits FRONT',
      zones: ['front'],
      ends: [],
    });
    expect(forecastNextRound('tidal-colossus', 3, 12, row, [], names)).toBeNull();
    expect(forecastNextRound('tidal-colossus', 11, 12, row, [], names)?.zones).toEqual(['front']);
  });

  it('names the zone the hit really lands on when the aimed zone is down', () => {
    // Front is a and b; with both down, Undertow falls to the nearest zone with someone standing.
    expect(forecastNextRound('tidal-colossus', 2, 12, row, ['a', 'b'], names)).toEqual({
      text: 'Next round: Undertow hits MIDDLE',
      zones: ['middle'],
      ends: [],
    });
    expect(
      forecastNextRound('tidal-colossus', 2, 12, row, ['a', 'b', 'c', 'd'], names)?.zones,
    ).toEqual(['back']);
  });

  it('words a strike on the strongest generically, since Attack is not known on the stage', () => {
    expect(forecastNextRound('storm-sovereign', 4, 12, row, [], names)).toEqual({
      text: 'Next round: Lightning Rod strikes your strongest',
      zones: [],
      ends: [],
    });
  });

  it('marks the living creatures at both ends of the row for a silence', () => {
    expect(forecastNextRound('thornmother', 1, 12, row, [], names)).toEqual({
      text: 'Next round: Bramble Bind silences both ends',
      zones: [],
      ends: ['a', 'f'],
    });
    // A fallen end creature passes the silence to the next one standing, as the engine does.
    expect(forecastNextRound('thornmother', 1, 12, row, ['a'], names)?.ends).toEqual(['b', 'f']);
    expect(
      forecastNextRound('thornmother', 1, 12, row, ['a', 'b', 'c', 'd', 'e'], names)?.ends,
    ).toEqual(['f']);
    expect(forecastNextRound('thornmother', 1, 12, ['solo'], [], names)?.ends).toEqual(['solo']);
    expect(forecastNextRound('thornmother', 2, 12, row, [], names)).toBeNull();
  });

  it('says the reflect trap is coming', () => {
    expect(forecastNextRound('cinder-wyrm', 6, 12, row, [], names)?.text).toBe(
      'Next round: Backdraft reflects the first reaction',
    );
  });

  it('is nothing before the fight, in the last round, or for an unknown boss', () => {
    expect(forecastNextRound('storm-sovereign', 0, 12, row, [], names)).toBeNull();
    expect(forecastNextRound('storm-sovereign', 12, 12, row, [], names)).toBeNull();
    expect(forecastNextRound('storm-sovereign', 13, 12, row, [], names)).toBeNull();
    expect(forecastNextRound('nobody', 3, 12, row, [], names)).toBeNull();
  });

  it('agrees with the content for every boss and round: warned exactly when a gimmick is due', () => {
    for (const boss of content.bosses) {
      for (let round = 1; round < boss.finaleRounds; round++) {
        const f = forecastNextRound(boss.id, round, boss.finaleRounds, row, [], {});
        const due = boss.gimmicks.filter((g) =>
          'every' in g.trigger ? (round + 1) % g.trigger.every === 0 : true,
        );
        expect(f === null, `${boss.id} round ${String(round)}`).toBe(due.length === 0);
        for (const g of due) expect(f?.text).toContain(g.name);
      }
    }
  });
});

describe('the wording of a single row (the dungeon)', () => {
  it('names the creature at a place instead of a whole row', () => {
    const label = (zone: 'front' | 'middle' | 'back') =>
      strikeLabel(strike({ action: 'hit_zone', gimmick: 'undertow', zone }), names, 'row').text;
    expect(label('front')).toBe('Undertow · the left creature');
    expect(label('middle')).toBe('Undertow · the middle creature');
    expect(label('back')).toBe('Undertow · the right creature');
    // The raid keeps its words, and so does an unnamed zone hit on a row.
    expect(
      strikeLabel(strike({ action: 'hit_zone', gimmick: 'undertow', zone: 'back' }), names).text,
    ).toBe('Undertow · whole BACK row');
    expect(strikeLabel(strike({ action: 'hit_zone' }), names, 'row').area).toBe('a creature');
  });

  it('leaves every other kind of action as it was', () => {
    const silence = strike({
      action: 'silence_ends',
      gimmick: 'bramble-bind',
      targets: ['b', 'd'],
    });
    expect(strikeLabel(silence, names, 'row').text).toBe(strikeLabel(silence, names).text);
  });

  it('warns about the creature at the place in the forecast, and still marks the zone', () => {
    // Undertow fires on rounds 3, 6, 9 and 12.
    const forecast = forecastNextRound('tidal-colossus', 2, 12, ['a', 'b', 'c'], [], names, 'row');
    expect(forecast).toEqual({
      text: 'Next round: Undertow hits the left creature',
      zones: ['front'],
      ends: [],
    });
  });
});
