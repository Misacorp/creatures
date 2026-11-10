import {
  parseCatalogueView,
  parseHouseListView,
  parseHouseView,
  parseOwnHouseView,
  type HousemateView,
} from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import { describe, expect, it } from 'vitest';
import { SAMPLE_STATE } from '../creature-card-sample';
import { linesPaid, lockedParts, partCards, payOf, takeFor } from './build-view';
import { CATALOGUE_KINDS, catalogueGroups, catalogueTotals } from './catalogue-view';
import { cut } from './house-names';
import {
  sampleCatalogue,
  sampleGuestbook,
  sampleHouse,
  sampleHut,
  sampleList,
  sampleOwn,
} from './house-sample';
import { giftReason } from './GiftButton';
import { giftRows } from './MailboxPanel';
import { ownedStamps } from './StampPicker';
import { EMPTY_CHOICE, NOBODY, skinChoices, sleeperOptions, spotView } from './spot-view';
import { todayLine } from './VisitList';
import { recipeFor, workbenchGroups } from './workbench-view';

function room(id: string) {
  const found = sampleHouse().rooms.find((r) => r.id === id);
  if (found === undefined) throw new Error(`no room ${id}`);
  return found;
}

describe('the samples', () => {
  it('pass the strict view schemas', () => {
    expect(parseHouseView(sampleHouse())).toBeDefined();
    expect(parseHouseView(sampleHut())).toBeDefined();
    for (const mode of ['rich', 'poor', 'empty'] as const) {
      expect(parseOwnHouseView(sampleOwn(mode))).toBeDefined();
    }
    expect(parseCatalogueView(sampleCatalogue())).toBeDefined();
    expect(parseHouseListView(sampleList())).toBeDefined();
    expect(parseHouseView({ ...sampleHouse(), extra: 1 })).toBeUndefined();
  });

  it('name only things the content has', () => {
    const own = sampleOwn('rich');
    const ids = new Set([...housing.pieces, ...housing.skins].map((i) => i.id));
    for (const id of [
      ...Object.keys(own.items.pieces),
      ...own.items.blueprints,
      ...own.items.skins,
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
    for (const entry of sampleGuestbook()) {
      expect(housing.stamps.some((s) => s.id === entry.stampId)).toBe(true);
    }
  });
});

describe('build view', () => {
  it('lists each remaining line with have and need, short ones included', () => {
    const cellar = partCards(sampleOwn('rich')).find((c) => c.id === 'cellar');
    expect(cellar).toBeDefined();
    const bog = cellar?.inputs.find((i) => i.key === 'material:bog-oak');
    expect(bog).toMatchObject({ have: 0, amount: 4 });
    const acorns = cellar?.inputs.find((i) => i.key === 'bait');
    expect(acorns).toMatchObject({ have: 640, amount: 125 });
  });

  it('pays the smaller of held and owed on every line', () => {
    const cellar = partCards(sampleOwn('rich')).find((c) => c.id === 'cellar');
    expect(cellar?.pay.bait).toBe(125);
    expect(cellar?.pay.scrap).toBe(800);
    expect(cellar?.pay.shards).toEqual({ mire: 10 });
    expect(cellar?.pay.materials?.['bog-oak']).toBeUndefined();
    // Six stone from the family: sea-glass (9) is taken before the others.
    expect(Object.values(cellar?.pay.materials ?? {}).reduce((a, b) => a + b, 0)).toBeGreaterThan(
      5,
    );
  });

  it('pays what is held when short, and nothing for a player with nothing', () => {
    const poor = partCards(sampleOwn('poor')).find((c) => c.id === 'cellar');
    expect(poor?.pay.bait).toBe(35);
    expect(poor?.short).toBeNull();
    const none = partCards(sampleOwn('empty'));
    expect(none.map((c) => c.id)).toEqual(['cottage']);
    expect(none[0]?.pay).toEqual({});
    // Nothing to pay in: what the player has against what the first line asks, not a disabled button.
    expect(none[0]?.short).toEqual({
      have: [expect.objectContaining({ amount: 0 })],
      cost: [expect.objectContaining({ amount: 75 })],
    });
  });

  it('counts lines paid for a part in progress', () => {
    const card = partCards(sampleOwn('rich')).find((c) => c.id === 'west-upper');
    expect(card?.started).toBe(true);
    // A pip is lit for every line something was paid into, paid in full or not.
    expect(card?.lines).toEqual({ total: 4, paid: 2 });
  });

  it('lights a pip for a line paid into, and counts the lines paid in full', () => {
    const price = [
      { kind: 'bait' as const, amount: 75 },
      { kind: 'scrap' as const, amount: 400 },
      { kind: 'material' as const, id: 'oak', amount: 6 },
    ];
    expect(linesPaid(price, undefined)).toEqual({ total: 3, touched: 0, full: 0 });
    // 70 of 75 Acorns paid: the first pip is lit, though the line is not paid in full.
    expect(linesPaid(price, [{ kind: 'bait', amount: 5 }, price[1]!, price[2]!])).toEqual({
      total: 3,
      touched: 1,
      full: 0,
    });
    expect(linesPaid(price, [price[1]!, price[2]!])).toEqual({ total: 3, touched: 1, full: 1 });
  });

  it('gives each part that cannot be built yet its reason', () => {
    const house = sampleHouse();
    const locked = lockedParts(house, sampleOwn('rich'));
    expect(locked.find((p) => p.id === 'pool')?.reason).toBe('Needs the Garden first');
    expect(locked.find((p) => p.id === 'east-upper')?.reason).toBe('Needs the East Wing first');
  });

  it('payOf leaves out zero amounts', () => {
    expect(
      payOf({ bait: 0, scrap: 3, shards: { tide: 0, mire: 2 }, materials: { a: 0, b: 1 } }),
    ).toEqual({
      scrap: 3,
      shards: { mire: 2 },
      materials: { b: 1 },
    });
    expect(takeFor([], sampleOwn('rich')).bait).toBe(0);
  });
});

describe('workbench view', () => {
  it('lists known blueprints only, by set, with short lines marked', () => {
    const groups = workbenchGroups(sampleOwn('poor'));
    const ids = groups.flatMap((g) => g.recipes.map((r) => r.id));
    expect(ids).toContain('tidepool-stool');
    expect(ids).not.toContain('moonlit-stool');
    const table = recipeFor('tidepool-table', sampleOwn('poor'));
    expect(table?.affordable).toBe(false);
    expect(table?.reason).toBe('Not enough yet.');
    expect(table?.inputs.filter((i) => i.have < i.amount).length).toBeGreaterThan(0);
  });

  it('counts what can be made now and marks a made skin as done', () => {
    const groups = workbenchGroups(sampleOwn('rich'));
    expect(groups.find((g) => g.id === 'tidepool')?.ready).toBeGreaterThan(0);
    const wall = groups.flatMap((g) => g.recipes).find((r) => r.id === 'tidepool-wall');
    expect(wall).toMatchObject({ done: true, reason: 'You have it already.' });
  });

  it('shows only the starters to a player with nothing', () => {
    const groups = workbenchGroups(sampleOwn('empty'));
    expect(groups.map((g) => g.id)).toContain('cosy');
    expect(groups.some((g) => g.id === 'tidepool')).toBe(false);
  });
});

describe('catalogue view', () => {
  it('counts what is found out of everything', () => {
    const totals = catalogueTotals(sampleCatalogue());
    expect(totals.total).toBe(
      housing.pieces.length +
        housing.skins.length +
        housing.stamps.length +
        housing.materials.length +
        housing.parts.length,
    );
    expect(totals.found).toBeGreaterThan(0);
    expect(totals.found).toBeLessThan(totals.total);
  });

  it('draws what is not found as a silhouette named Unknown, with its hint', () => {
    const tiles = catalogueGroups(sampleCatalogue(), 'furniture').flatMap((g) => g.tiles);
    const moon = tiles.find((t) => t.id === 'moonlit-stool');
    expect(moon).toMatchObject({ unknown: true, name: 'Unknown' });
    expect(moon?.hint.length).toBeGreaterThan(0);
    expect(moon?.label.startsWith('Unknown.')).toBe(true);
    const cosy = tiles.find((t) => t.id === 'cosy-bed');
    expect(cosy).toMatchObject({ unknown: false, name: 'Cosy Bed', owned: 1 });
  });

  it('has four tabs, so they fit one row on a phone, and the garden pieces are groups of Furniture', () => {
    expect(CATALOGUE_KINDS.map((k) => k.id)).toEqual(['furniture', 'skins', 'stamps', 'materials']);
    const groups = catalogueGroups(sampleCatalogue(), 'furniture');
    expect(groups.some((g) => g.id === 'garden')).toBe(true);
    expect(new Set(groups.map((g) => g.id)).size).toBe(groups.length);
  });

  it('agrees with the workbench on how many pieces of a set are made', () => {
    const catalogue = catalogueGroups(sampleCatalogue(), 'furniture');
    const own = sampleOwn('rich');
    for (const group of workbenchGroups(own)) {
      if (group.held === null) continue;
      const same = catalogue.find((g) => g.id === group.id);
      expect(same, group.id).toBeDefined();
      expect(group.held.total, group.id).toBe(same?.tiles.length);
    }
    const cosy = workbenchGroups(own).find((g) => g.id === 'cosy');
    expect(cosy?.held?.owned).toBe(
      housing.pieces.filter((p) => p.set === 'cosy' && (own.items.pieces[p.id] ?? 0) > 0).length,
    );
  });

  it('has tiles for every kind', () => {
    for (const kind of CATALOGUE_KINDS) {
      const groups = catalogueGroups(sampleCatalogue(), kind.id);
      expect(groups.flatMap((g) => g.tiles).length, kind.id).toBeGreaterThan(0);
    }
  });
});

describe('spot view', () => {
  it('lists Empty first, then the pieces that fit, then blueprints', () => {
    const view = spotView(room('hut:hearth'), 'floor-small-a', sampleOwn('rich'));
    expect(view.choices[0]?.id).toBe(EMPTY_CHOICE);
    expect(view.current).toBe('cosy-chair');
    expect(view.choices.some((c) => c.id === 'cosy-chair' && c.here)).toBe(true);
    for (const choice of view.choices.slice(1)) {
      const piece = housing.pieces.find((p) => p.id === choice.id);
      expect(housing.forms.find((f) => f.id === piece?.form)?.spot).toBe('floor-small');
    }
    expect(view.choices.some((c) => c.id === 'cosy-bed')).toBe(false);
  });

  it('keeps the tiles in a fixed order: owned before blueprints, by set, the piece in the spot not moved up', () => {
    const own = sampleOwn('rich');
    const here = spotView(room('hut:hearth'), 'floor-small-a', own);
    const elsewhere = spotView(room('hut:hearth'), 'floor-small-b', own);
    const ids = (v: typeof here): string[] =>
      v.choices.map((c) => c.id).filter((id) => id !== EMPTY_CHOICE);
    // The same tiles in the same order whichever piece the spot holds.
    expect(ids(here)).toEqual(ids(elsewhere));
    const order = housing.sets.map((s) => s.id);
    const owned = here.choices.filter((c) => c.kind === 'free' || c.kind === 'placed');
    const sets = owned.map((c) => (c.setId === null ? -1 : order.indexOf(c.setId)));
    expect(sets).toEqual([...sets].sort((a, b) => a - b));
  });

  it('groups the tiles in runs by set, with the set name as the label and no label for no set', () => {
    const view = spotView(room('hut:hearth'), 'floor-small-a', sampleOwn('rich'));
    expect(view.groups.flatMap((g) => g.choices)).toEqual(view.choices);
    expect(view.groups[0]?.label).toBeNull();
    for (const group of view.groups) {
      expect(
        new Set(group.choices.filter((c) => c.kind !== 'empty').map((c) => c.setId)).size,
      ).toBeLessThanOrEqual(1);
      const named = group.choices.find((c) => c.set !== null);
      if (named !== undefined) expect(group.label).toBe(named.set);
    }
  });

  it('puts a piece with every copy placed among the owned ones, before the blueprints', () => {
    const own = sampleOwn('rich');
    const view = spotView(room('cottage:loft'), 'floor-large-a', own);
    expect(view.bed).toBe(true);
    const placed = view.choices.filter((c) => c.kind === 'placed');
    expect(placed.length).toBeGreaterThan(0);
    const kinds = view.choices.map((c) => c.kind);
    expect(kinds.indexOf('blueprint')).toBeGreaterThan(kinds.lastIndexOf('placed'));
    expect(kinds.indexOf('blueprint')).toBeGreaterThan(kinds.lastIndexOf('free'));
    expect(view.choices.find((c) => c.id === 'hammock')?.kind).toBe('blueprint');
  });

  it('lists skins by kind with the one in use first', () => {
    const wall = skinChoices('wall', 'tidepool-wall', sampleOwn('rich'));
    expect(wall[0]).toMatchObject({ id: 'tidepool-wall', here: true, kind: 'owned' });
    expect(wall.some((c) => c.id === 'cosy-wall' && c.kind === 'owned')).toBe(true);
    expect(
      skinChoices('roof', 'thatch', sampleOwn('rich')).every((c) => c.id !== 'cosy-wall'),
    ).toBe(true);
  });
});

describe('housemate options', () => {
  const creatures = SAMPLE_STATE.creatures;
  const first = creatures[0];
  const second = creatures[1];
  if (first === undefined || second === undefined) throw new Error('sample creatures');
  const sleeping = (id: string, spotId: string): HousemateView => ({
    roomId: 'cottage:loft',
    spotId,
    home: true,
    creature: { id, species: 'x', shiny: false, nickname: null, level: 1 },
  });

  it('puts Nobody first when someone sleeps here, and marks them', () => {
    const rows = sleeperOptions(
      creatures,
      [sleeping(first.id, 'floor-large-a')],
      'cottage:loft',
      'floor-large-a',
    );
    expect(rows[0]?.id).toBe(NOBODY);
    expect(rows.find((r) => r.id === first.id)?.disabled).toBe('Sleeping here');
  });

  it('gives an away creature the reason Away and lets a sleeper elsewhere move', () => {
    const away = { ...second, away: true };
    const rows = sleeperOptions(
      [first, away],
      [sleeping(first.id, 'floor-large-b')],
      'cottage:loft',
      'floor-large-a',
    );
    expect(rows.find((r) => r.id === second.id)).toMatchObject({ disabled: 'Away', busy: 'away' });
    expect(rows.find((r) => r.id === first.id)).toMatchObject({ disabled: null, onBoard: true });
  });

  it('shuts the beds when three creatures sleep already', () => {
    const three = ['a', 'b', 'c'].map((id, i) => sleeping(id, `spot-${String(i)}`));
    const rows = sleeperOptions([first], three, 'cottage:loft', 'floor-large-a');
    expect(rows[0]?.disabled).toBe('All beds taken');
  });
});

describe('small views', () => {
  it('gives the gift its three states', () => {
    expect(giftReason({ gifted: false, stamped: false }, true)).toBeNull();
    expect(giftReason({ gifted: true, stamped: false }, false)).toBe('Given today');
    expect(giftReason({ gifted: false, stamped: false }, false)).toBe('Given elsewhere today');
  });

  it('says what happened at a house today', () => {
    expect(todayLine({ gifted: true, stamped: true })).toBe('Gift given · Stamped');
    expect(todayLine({ gifted: false, stamped: true })).toBe('Stamped');
    expect(todayLine({ gifted: false, stamped: false })).toBe('');
  });

  it('makes one row per gift', () => {
    const rows = giftRows(sampleOwn('rich').mailbox);
    expect(rows.map((r) => [r.name, r.acorns])).toEqual([
      ['Mika', 5],
      ['Juno', 5],
    ]);
    expect(giftRows({ gifts: 3, acorns: 15, from: [] })).toHaveLength(3);
    expect(giftRows(sampleOwn('empty').mailbox)).toEqual([]);
  });

  it('offers only owned stamps, in the content order', () => {
    expect(ownedStamps(['housewarming', 'paw-print', 'nope']).map((s) => s.id)).toEqual([
      'paw-print',
      'housewarming',
    ]);
  });

  it('cuts a long name with an ellipsis by code points', () => {
    expect(cut('Juno', 10)).toBe('Juno');
    expect(cut('Bartholomew-Alexander', 10)).toBe('Bartholom…');
    expect(cut('🐾🐾🐾🐾', 3)).toBe('🐾🐾…');
  });
});
