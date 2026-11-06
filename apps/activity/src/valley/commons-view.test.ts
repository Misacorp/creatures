import { describe, expect, it } from 'vitest';
import {
  boardName,
  commonsOf,
  daysLeft,
  fireNextLine,
  flameScale,
  giftPrice,
  giveRows,
  hearthLine,
  hearthPercent,
  levelLine,
  levelOf,
  percentFilled,
  placeMention,
  socketWords,
  stateLine,
  stillNeeded,
  warmthWords,
  yourPart,
} from './commons-view';
import { buildingPlace, openPlace, sampleCommons, waitingPlace } from './commons-sample';

const purse = {
  acorns: 1000,
  scrap: 80,
  shards: { tide: 4, ember: 4, grove: 1, spark: 0, mire: 7 },
};

describe('the commons in words', () => {
  it('the level, and the extras past the max', () => {
    expect(levelLine(openPlace('forge', 2, 900, 0.1))).toBe('Level 2 / 5');
    expect(levelLine(openPlace('forge', 5, 900, 0.1))).toBe('Level 5, finished');
    expect(levelLine(openPlace('forge', 5, 900, 0.1, { cosmetic: 2 }))).toBe('Level 5, 2 extras');
    expect(levelLine(openPlace('forge', 5, 900, 0.1, { cosmetic: 1 }))).toBe('Level 5, 1 extra');
  });

  it('what is still needed, whole units, an empty part left out, "1 Acorn" for one', () => {
    const p = openPlace('signpost', 2, 900, 0.28);
    const shape = (items: ReturnType<typeof stillNeeded>) => items.map((i) => [i.key, i.amount]);
    expect(shape(stillNeeded(p))).toEqual([
      ['bait', 260],
      ['scrap', 519],
      ['shards:grove', 65],
    ]);
    if (p.project === null) throw new Error('fixture');
    expect(
      shape(
        stillNeeded({
          ...p,
          project: { ...p.project, needs: { acorns: 0.4, scrap: 0, shards: 1 } },
        }),
      ),
    ).toEqual([
      ['bait', 1],
      ['shards:grove', 1],
    ]);
    expect(stillNeeded(buildingPlace('forge', 2, 2, []))).toEqual([]);
  });

  it('the percent filled: whole, never over 100, zero with no project', () => {
    expect(percentFilled(openPlace('forge', 1, 400, 0.286))).toBe(28);
    expect(percentFilled(openPlace('forge', 1, 400, 1))).toBe(100);
    expect(percentFilled(waitingPlace('school'))).toBe(0);
  });

  it('what a place says in each state', () => {
    expect(stateLine(openPlace('forge', 1, 400, 0.1))).toMatch(/open for gifts/);
    expect(stateLine(buildingPlace('bonfire', 2, 2, []))).toBe(
      'The hearth is being built, 2 days left.',
    );
    expect(stateLine(buildingPlace('signpost', 2, 1, []))).toBe(
      'The road is being built, 1 day left.',
    );
    expect(stateLine(waitingPlace('market'))).toBe('Opens once the hearth has grown.');
    expect(stateLine(waitingPlace('forge'))).toBe('Opens once the Market is built.');
    expect(stateLine(waitingPlace('school'))).toBe(
      'Opens once the hearth, the Market and the Forge have grown.',
    );
    expect(daysLeft(0)).toBe('1 day left');
  });

  it("the player's own part only, and nothing when nothing was given", () => {
    expect(yourPart(openPlace('forge', 1, 400, 0.5, { mine: { given: 60, shareBp: 3100 } }))).toBe(
      'You gave 31% of this.',
    );
    expect(yourPart(openPlace('forge', 1, 400, 0.5))).toBe('');
    expect(yourPart(openPlace('forge', 1, 400, 0.5, { mine: { given: 1, shareBp: 3 } }))).toBe(
      'You gave 1% of this.',
    );
  });

  it('the Places list mentions a project only while it builds', () => {
    const commons = sampleCommons();
    expect(placeMention(commons, 'forge')).toBe('the Forge is being built, 2 days left');
    expect(placeMention(commons, 'signpost')).toBeNull();
    expect(placeMention(commons, 'school')).toBeNull();
    expect(placeMention(null, 'forge')).toBeNull();
  });

  it('the bonfire level and the hearth', () => {
    expect(levelOf(sampleCommons(), 'bonfire')).toBe(1);
    expect(levelOf(null, 'bonfire')).toBe(1);
    expect(commonsOf(null)).toBeNull();
    expect(hearthPercent(10_800)).toBe(8);
    expect(hearthLine(10_000)).toBeNull();
    expect(hearthLine(11_200)).toBe("The hearth adds 12% to every creature's growth.");
  });
});

describe('the give list', () => {
  const place = openPlace('signpost', 2, 900, 0.5);

  it("lists Acorns, scrap, the place's own shards, and other shards only with the exchange rate in hand", () => {
    const rows = giveRows(place, purse, 3);
    expect(rows.map((r) => r.name)).toEqual([
      'Acorns',
      'Scrap',
      'Grove shards',
      'Tide shards, 3 for 1',
      'Ember shards, 3 for 1',
      'Mire shards, 3 for 1',
    ]);
  });

  it('the most to give is what the project takes and the player holds', () => {
    const rows = giveRows(place, purse, 3);
    const acorns = rows.find((r) => r.id === 'acorns');
    expect(acorns?.max).toBe(180);
    const scrap = rows.find((r) => r.id === 'scrap');
    expect(scrap?.max).toBe(80);
    const mire = rows.find((r) => r.id === 'shards:mire');
    // 7 shards pay for 2 units at 3 for 1; each step costs 3.
    expect(mire?.max).toBe(2);
    expect(mire && giftPrice(mire, 2)).toMatchObject({ key: 'shards:mire', amount: 6 });
  });

  it('a row with nothing to give says why', () => {
    const rows = giveRows(place, purse, 3);
    expect(rows.find((r) => r.id === 'shards:grove')?.max).toBe(1);
    const none = giveRows(place, { ...purse, scrap: 0 }, 3).find((r) => r.id === 'scrap');
    expect(none?.reason).toBe('You have none');
    const full = giveRows(
      {
        ...place,
        project:
          place.project === null
            ? null
            : { ...place.project, needs: { acorns: 0, scrap: 9, shards: 5 } },
      },
      purse,
      3,
    ).find((r) => r.id === 'acorns');
    expect(full?.reason).toBe('This part is full');
  });

  it('no project open, no rows', () => {
    expect(giveRows(buildingPlace('forge', 2, 2, []), purse, 3)).toEqual([]);
  });

  it('the price of a gift of one currency each', () => {
    const rows = giveRows(place, purse, 3);
    expect(giftPrice(rows[0]!, 5)).toMatchObject({ key: 'bait', amount: 5 });
    expect(giftPrice(rows[1]!, 5)).toMatchObject({ key: 'scrap', amount: 5 });
    expect(giftPrice(rows[2]!, 1)).toMatchObject({ key: 'shards:grove', amount: 1 });
  });
});

describe('collections, the fire and its words', () => {
  it('a socket says what it asks for and where it turns up', () => {
    expect(socketWords('keystone:tidepools').name).toBe('A keystone of Tidepools');
    expect(socketWords('landmark:2').name).toMatch(/no\. 2/);
    expect(socketWords('resident:3').where).toMatch(/rare resident/);
    expect(socketWords('page:1').name).toMatch(/journal page/);
    expect(socketWords('everyday').name).toBe('A find from daily work');
    expect(boardName('signpost')).toBe('Stones of the Roads');
    expect(boardName('market')).toBe('Collection');
  });

  it('the flame grows at each threshold and the next step is one short line', () => {
    const thresholds = [10, 25, 50, 80];
    expect(flameScale(9, thresholds)).toBe(3);
    expect(flameScale(10, thresholds)).toBe(4);
    expect(flameScale(25, thresholds)).toBe(5);
    expect(flameScale(80, thresholds)).toBe(6);
    expect(flameScale(200, thresholds)).toBe(6);
    const fire = sampleCommons().fire;
    expect(fireNextLine(fire)).toBe('At level 25: a stronger modifier tier.');
    expect(fireNextLine({ ...fire, next: null })).toBeNull();
  });

  it('what warmed the fire, in words', () => {
    expect(warmthWords('place', 'forge')).toBe('The Forge grew');
    expect(warmthWords('collection', 'signpost')).toBe("The Signpost's collection was completed");
    expect(warmthWords('boss', null)).toBe('A boss fell for the first time');
  });
});
