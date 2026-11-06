import { describe, expect, it } from 'vitest';
import { NO_ALERTS } from '../tab-alerts';
import { homeInput } from '../workbench/home-sample';
import { castFor } from './place-cast';
import { placeBubbles, placeStates } from './place-state';
import { fullFloor, sampleAnvil, sampleOrder, shardWait, withAnvils } from './forge-sample';
import {
  anvilBuyReason,
  anvilPrice,
  exchangeReason,
  exchangeSources,
  floorLine,
  forgeCalm,
  forgeSystemsLine,
  needsItems,
  orderWait,
  pieceLine,
  tinkerLine,
} from './forge-view';
import { sayParts, sayText } from '../resource-count';
import { sampleValley } from './signpost-sample';
import { isSmithing, trayBadge, trayFor, trayStates } from './tray-state';

const base = homeInput('busy', true);
const free = base.creatures.map((c) => ({ ...c, busy: null, away: false }));
const [a, b] = free;
if (a === undefined || b === undefined) throw new Error('fixture');
const plain = sampleValley(free, []);
const BP = 'kelp-cap';

describe('a smith in the raid (V-POST-7)', () => {
  it('is paused, not at work and not tinkering, and the Forge says so when nobody else works', () => {
    const paused = sampleAnvil('an', a.id, [sampleOrder('o1', BP, 3)], {
      paused: 'raid',
      tinkering: null,
    });
    const visit = withAnvils(plain, [paused]);
    expect(forgeSystemsLine(visit)).toBe('a smith is in the raid');
    expect(forgeCalm(visit)).toBe('A smith is in the raid');
    const mixed = withAnvils(plain, [paused, sampleAnvil('an2', b.id, [sampleOrder('o2', BP, 3)])]);
    expect(forgeSystemsLine(mixed)).toBe('1 smith at work');
  });
});

describe('the Forge words', () => {
  it('an order says what a piece takes and what it waits on', () => {
    const o = sampleOrder('o1', BP, 3, { reach: 'rare', waiting: 'shard' });
    expect(needsItems(o).map((i) => [i.key, i.amount])).toEqual([
      ['scrap', 36],
      ['shards:tide', 1],
      ['essence', 25],
    ]);
    expect(sayParts(orderWait(o) ?? [])).toEqual(['Waiting for ', ['shards:tide', undefined]]);
    expect(orderWait(sampleOrder('o2', BP, 1))).toBeNull();
    expect(sayParts(orderWait(sampleOrder('o3', BP, 1, { waiting: 'essence' })) ?? [])).toEqual([
      'Waiting for ',
      ['essence', undefined],
    ]);
  });

  it('a smith that tinkers says why, in plain words and for how long', () => {
    const wait = shardWait('a1', a.id, BP, 5);
    // Q64: shards change hands at the Market, so before it is built the line says so; after, it is the plain wait.
    expect(sayParts(tinkerLine(wait, true) ?? [])).toEqual([
      'Waiting for ',
      ['shards:tide', undefined],
      ' for 5 h',
    ]);
    expect(sayParts(tinkerLine(wait, false) ?? [])).toEqual([
      'Waiting for ',
      ['shards:tide', undefined],
      ' for 5 h. The Market will trade for them once the valley builds it.',
    ]);
    expect(tinkerLine(sampleAnvil('a2', a.id, []), false)).toEqual([
      'Nothing is ordered, so the smith tinkers',
    ]);
    expect(tinkerLine(fullFloor('a3', a.id, BP), false)).toEqual(['The floor is full']);
    expect(tinkerLine(sampleAnvil('a4', a.id, [sampleOrder('o', BP, 2)]), false)).toBeNull();
  });

  it('the piece in hand reads as its name, its rarity and the time left', () => {
    const anvil = sampleAnvil('a1', a.id, [sampleOrder('o1', BP, 3)]);
    expect(pieceLine(anvil)).toMatch(/^Kelp Cap, 10 h left$/);
    expect(pieceLine(fullFloor('a2', a.id, BP))).toMatch(/\(Rare\)/);
    expect(pieceLine(sampleAnvil('a3', null, []))).toBeNull();
  });

  it('the floor says how full it is', () => {
    expect(floorLine(sampleAnvil('a1', a.id, []))).toBe('Floor 2 / 5');
    expect(floorLine(fullFloor('a2', a.id, BP))).toBe('Floor full');
  });

  it('the Places line puts a full floor first, then a tinkering anvil, then the smiths at work', () => {
    const working = withAnvils(plain, [
      sampleAnvil('a1', a.id, [sampleOrder('o1', BP, 2)]),
      sampleAnvil('a2', b.id, [sampleOrder('o2', BP, 2)]),
    ]);
    expect(forgeSystemsLine(working)).toBe('2 smiths at work');
    expect(forgeSystemsLine(withAnvils(plain, [shardWait('a1', a.id, BP, 3)]))).toBe(
      'an anvil is tinkering',
    );
    expect(
      forgeSystemsLine(
        withAnvils(plain, [fullFloor('a1', a.id, BP), shardWait('a2', b.id, BP, 3)]),
      ),
    ).toBe('the floor is full');
    expect(forgeSystemsLine(plain)).toBe('a free anvil waits');
    expect(placeStates({ ...base, visit: working }).forge).toBe('2 smiths at work');
  });

  it('a floor that is full is the Forge bubble; a short input only after a day (V-FORGE-4)', () => {
    const full = withAnvils(plain, [fullFloor('a1', a.id, BP)]);
    expect(placeBubbles(NO_ALERTS, { ...base, visit: full }).map((x) => x.place)).toContain(
      'forge',
    );
    const brief = withAnvils(plain, [shardWait('a1', a.id, BP, 5)]);
    expect(placeBubbles(NO_ALERTS, { ...base, visit: brief }).map((x) => x.place)).not.toContain(
      'forge',
    );
    const long = withAnvils(plain, [shardWait('a1', a.id, BP, 30)]);
    expect(placeBubbles(NO_ALERTS, { ...base, visit: long }).map((x) => x.place)).toContain(
      'forge',
    );
  });

  it('the next anvil says why it cannot be bought', () => {
    expect(anvilPrice({ acorns: 123, scrap: 38 }).items.map((i) => [i.key, i.amount])).toEqual([
      ['bait', 123],
      ['scrap', 38],
    ]);
    expect(anvilPrice({ acorns: 0, scrap: 0 })).toEqual({ text: 'free', items: [] });
    const second = withAnvils(plain, [sampleAnvil('a1', a.id, [])]);
    const short = (reason: ReturnType<typeof anvilBuyReason>) =>
      typeof reason === 'object' && reason !== null
        ? {
            have: reason.have.map((i) => [i.key, i.amount]),
            cost: reason.cost.map((i) => [i.key, i.amount]),
          }
        : reason;
    expect(short(anvilBuyReason(second, 500))).toMatchObject({ have: [['scrap', 0]] });
    expect(short(anvilBuyReason(second, 10))).toMatchObject({
      have: [
        ['bait', 10],
        ['scrap', 0],
      ],
    });
    const rich = {
      ...second,
      forge: { ...second.forge, shelf: { ...second.forge.shelf, scrap: 99 } },
    };
    expect(anvilBuyReason(rich, 500)).toBeNull();
    expect(short(anvilBuyReason(rich, 10))).toMatchObject({ have: [['bait', 10]] });
    expect(
      anvilBuyReason(
        withAnvils(plain, [sampleAnvil('a1', a.id, []), sampleAnvil('a2', b.id, [])]),
        999,
      ),
    ).toMatch(/no more anvils/);
  });

  it('the exchange pays from piles of at least the rate, never from the element it gets', () => {
    const forge = {
      ...plain.forge,
      shelf: { ...plain.forge.shelf, shards: { tide: 0, ember: 7, grove: 2, spark: 0, mire: 3 } },
    };
    expect(exchangeSources(forge, 'tide')[0]).toEqual({ element: 'ember', held: 7 });
    expect(exchangeSources(forge, 'ember').map((s) => s.element)).not.toContain('ember');
    expect(exchangeReason(forge, 'tide', null, 1)).toBeNull();
    expect(sayParts(exchangeReason(forge, 'tide', 'grove', 1) ?? [])).toEqual([
      'You need ',
      ['shards:grove', 3],
      '.',
    ]);
    expect(
      sayParts(
        exchangeReason({ ...forge, shelf: { ...forge.shelf, shards: {} } }, 'tide', null, 1) ?? [],
      ),
    ).toEqual(['You need ', ['shards:any', 3], ' of one other kind.']);
    // The screen shows icons and numbers; the words of a spoken line are the library's names.
    expect(sayText(exchangeReason(forge, 'tide', 'grove', 1) ?? [])).toContain('3 Grove Shard');
  });
});

describe('the Forge scene and the tray', () => {
  const input = {
    ...base,
    creatures: free,
    dungeonTeam: null,
    dungeonPhase: null,
    waiting: [],
  };
  const ART = { width: 64, height: 54 };

  it('smiths stand in front of the forge, each at its anvil; a free anvil shows nobody', () => {
    const visit = withAnvils(plain, [
      sampleAnvil('a1', a.id, [sampleOrder('o1', BP, 2)]),
      sampleAnvil('a2', null, []),
    ]);
    const cast = castFor('forge', { ...input, visit }, ART, []);
    expect(cast.stands.map((s) => s.creature.id)).toEqual([a.id]);
    expect(cast.stands[0]?.where).toBe('smithing at anvil 1');
  });

  it('the one step is the first anvil, then a smith for a free anvil, else a calm line', () => {
    const first = castFor('forge', { ...input, visit: plain }, ART, []);
    expect(first.act).toMatchObject({
      kind: 'step',
      label: 'Take your first anvil',
      detail: 'free',
    });
    const open = withAnvils(plain, [sampleAnvil('a1', null, [])]);
    expect(castFor('forge', { ...input, visit: open }, ART, []).act).toMatchObject({
      kind: 'step',
      label: 'Post a smith',
    });
    const busy = withAnvils(plain, [fullFloor('a1', a.id, BP)]);
    const calm = castFor('forge', { ...input, visit: busy, creatures: [a] }, ART, []).act;
    expect(calm).toEqual({ kind: 'calm', line: 'A floor is full' });
  });

  it('a smithing creature shows Smithing in the tray, and does not rest or wander', () => {
    const visit = withAnvils(plain, [sampleAnvil('a1', a.id, [sampleOrder('o1', BP, 2)])]);
    const badge = trayBadge(a, { trips: [], jobs: null, now: 0, ...trayStates(visit) });
    expect(badge.state).toBe('smithing');
    expect(badge.label).toMatch(/Smithing/);
    expect(isSmithing(a, visit)).toBe(true);
    expect(isSmithing(b, visit)).toBe(false);
    const rank = trayFor(free, { trips: [], jobs: null, now: 0, ...trayStates(visit) });
    expect(rank.at(-1)?.id).toBe(a.id);
  });
});
