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
import { gridLook } from './interior-art';
import {
  sampleCatalogue,
  sampleGuestbook,
  sampleHouse,
  sampleHut,
  sampleList,
  sampleOwn,
} from './house-sample';
import { giftReason } from './GiftButton';
import { recipeCell } from './WorkbenchPanel';
import { giftRows } from './MailboxPanel';
import { ownedStamps } from './StampPicker';
import {
  EMPTY_CHOICE,
  NOBODY,
  currentLook,
  skinBody,
  hasGroundChoice,
  skinChoices,
  sleeperOptions,
  spotView,
} from './spot-view';
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

  it('lists the room patterns a player can make in Rooms and the frames in Outside, in rows by layer, never the starters', () => {
    const groups = workbenchGroups(sampleOwn('empty'));
    const rooms = groups.find((g) => g.id === 'rooms');
    const ids = rooms?.recipes.map((r) => r.id) ?? [];
    expect(rooms?.title).toBe('Rooms');
    expect(ids).toContain('paper-stripes');
    expect(ids).not.toContain('frame-painted');
    expect(ids).not.toContain('paper-plain');
    expect(ids).not.toContain('paper-damask');
    expect(rooms?.rows?.map((r) => r.title)).toEqual(['Wallpaper', 'Floor', 'Trim', 'Ceiling']);
    const outside = groups.find((g) => g.id === 'exterior');
    expect(outside?.title).toBe('Outside');
    expect(outside?.recipes.map((r) => r.id)).toContain('frame-painted');
    expect(outside?.rows?.map((r) => r.id)).toContain('frame');
    const rich = workbenchGroups(sampleOwn('rich')).find((g) => g.id === 'exterior');
    expect(rich?.recipes.some((r) => r.id.startsWith('paper-'))).toBe(false);
    // the rows are the group's recipes, nothing more or less
    for (const g of [rooms, outside]) {
      expect(g?.rows?.flatMap((r) => r.recipes)).toEqual(g?.recipes);
    }
  });

  it('shows a pattern made already as had, not out of reach, and its card says every colour', () => {
    const own = sampleOwn('empty');
    const made = { ...own, items: { ...own.items, skins: [...own.items.skins, 'paper-stripes'] } };
    const recipe = workbenchGroups(made)
      .find((g) => g.id === 'rooms')
      ?.recipes.find((r) => r.id === 'paper-stripes');
    expect(recipe?.done).toBe(true);
    expect(recipe === undefined ? undefined : recipeCell(recipe).muted).toBe(false);
    expect(recipe?.output.name).toBe('Wide Stripe Paper, every colour');
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
    const skins = catalogueGroups(sampleCatalogue(), 'skins');
    for (const group of workbenchGroups(own)) {
      if (group.held === null) continue;
      const same = (group.rows === undefined ? catalogue : skins).find((g) => g.id === group.id);
      expect(same, group.id).toBeDefined();
      expect(group.held.total, group.id).toBe(same?.tiles.length);
    }
    const cosy = workbenchGroups(own).find((g) => g.id === 'cosy');
    expect(cosy?.held?.owned).toBe(
      housing.pieces.filter((p) => p.set === 'cosy' && (own.items.pieces[p.id] ?? 0) > 0).length,
    );
  });

  it('shows the room patterns in a Rooms group of the skins, one tile per pattern', () => {
    const groups = catalogueGroups(sampleCatalogue(), 'skins');
    const rooms = groups.find((g) => g.id === 'rooms');
    expect(rooms?.title).toBe('Rooms');
    const roomKinds = ['wall', 'floor', 'trim', 'ceiling'];
    expect(rooms?.tiles).toHaveLength(
      housing.skins.filter((s) => s.set === null && roomKinds.includes(s.kind)).length,
    );
    expect(rooms?.rows?.map((r) => r.title)).toEqual(['Wallpaper', 'Floor', 'Trim', 'Ceiling']);
    const outside = groups.find((g) => g.id === 'exterior');
    expect(outside?.title).toBe('Outside');
    expect(outside?.rows?.map((r) => r.title)).toEqual(['Roof', 'Walls', 'Frame', 'Ground']);
    const plain = rooms?.tiles.find((t) => t.id === 'paper-plain');
    expect(plain).toMatchObject({ unknown: false, owned: 1, name: 'Plain Plaster' });
    expect(plain?.line).toContain('plaster');
    expect(rooms?.tiles.find((t) => t.id === 'paper-damask')).toMatchObject({ unknown: true });
    expect(groups.find((g) => g.id === 'exterior')?.tiles.some((t) => t.id === 'paper-plain')).toBe(
      false,
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

  it('lists a generated pattern once with its colours, the one in use first with its colour', () => {
    const own = { ...sampleOwn('empty'), items: { ...sampleOwn('empty').items, skins: [] } };
    const floors = skinChoices('floor', 'floor-boards:walnut', own);
    expect(floors[0]).toMatchObject({
      id: 'floor-boards',
      here: true,
      kind: 'owned',
      colour: 'walnut',
    });
    expect(floors[0]?.colours).toContain('oak');
    expect(floors.filter((c) => c.id === 'floor-boards')).toHaveLength(1);
    // Starters are owned by rule, with no row; the workbench ones are known, not made.
    expect(floors.find((c) => c.id === 'floor-checker')?.kind).toBe('blueprint');
    // Drop and feat patterns stay hidden until learned.
    expect(floors.some((c) => c.id === 'floor-parquet')).toBe(false);
  });

  it('puts None first for a trim only; a ceiling or frame left as built is its starter, in use', () => {
    const own = sampleOwn('empty');
    expect(skinChoices('trim', null, own)[0]).toMatchObject({
      kind: 'bare',
      name: 'None',
      here: true,
    });
    expect(skinChoices('frame', null, own).some((c) => c.kind === 'bare')).toBe(false);
    expect(skinChoices('frame', null, own)[0]).toMatchObject({ id: 'frame-timber', here: true });
    expect(skinChoices('ceiling', null, own)[0]).toMatchObject({ id: 'ceiling-plain', here: true });
    expect(skinChoices('wall', 'cosy-wall', own).some((c) => c.kind === 'bare')).toBe(false);
  });

  it('lists the grounds that fit the room kind by the content rule, and always the one worn', () => {
    const own = sampleOwn('empty');
    const built = ['hut', 'garden', 'orchard', 'terrace', 'balcony'];
    const ids = (current: string, kind: string) =>
      skinChoices('ground', current, own, { kind, built }).map((c) => c.id);
    expect(ids('orchard-apple', 'orchard')).toEqual([
      'orchard-apple',
      'orchard-plum',
      'orchard-pear',
    ]);
    // a ground of a kind a room does not fit is still listed while it is worn (an old look), never the other kind's grounds
    expect(ids('lawn', 'orchard')).toEqual([
      'lawn',
      'orchard-apple',
      'orchard-plum',
      'orchard-pear',
    ]);
    expect(ids('deck', 'balcony')).toEqual(['deck']);
    expect(ids('lawn', 'garden')).toEqual(['lawn']);
    expect(
      skinChoices('ground', 'orchard-plum', own, { kind: 'orchard', built }).find((c) => c.here)
        ?.id,
    ).toBe('orchard-plum');
    // the plum and pear come with the orchard part: had (owned by rule) once it is built
    const choices = skinChoices('ground', 'orchard-apple', own, { kind: 'orchard', built });
    expect(choices.every((c) => c.kind === 'owned')).toBe(true);
  });

  it('shows each pattern of a grid in a colour of its own, the worn one for the pattern in use, the same each time', () => {
    const looks = ['paper-stripes', 'paper-polka', 'paper-floral', 'paper-damask'].map((id, i) =>
      gridLook(id, i),
    );
    expect(new Set(looks.map((l) => l.split(':')[1])).size).toBe(4);
    expect(looks).toEqual(
      ['paper-stripes', 'paper-polka', 'paper-floral', 'paper-damask'].map((id, i) =>
        gridLook(id, i),
      ),
    );
    expect(gridLook('paper-damask', 3, 'forest')).toBe('paper-damask:forest');
    expect(gridLook('paper-damask', 3, 'no-such')).toBe(looks[3]);
    expect(gridLook('thatch', 2)).toBe('thatch');
  });

  it('shows a Ground chip only for a room kind with more than one fitting ground', () => {
    expect(hasGroundChoice('orchard')).toBe(true);
    for (const kind of ['garden', 'pond', 'terrace', 'balcony', 'pool']) {
      expect(hasGroundChoice(kind), kind).toBe(false);
    }
  });

  it('reads the look a picker opens on and makes the request that sets it', () => {
    const house = sampleHouse();
    const base = house.rooms[0];
    if (base === undefined) throw new Error('no room');
    const room = { ...base, trim: 'trim-classic:paint-sage' };
    expect(currentLook(house, room, 'trim')).toBe('trim-classic:paint-sage');
    expect(currentLook(house, room, 'ceiling')).toBeNull();
    expect(currentLook(house, undefined, 'wall')).toBeUndefined();
    expect(currentLook(house, undefined, 'frame')).toBeNull();
    expect(skinBody('trim', room.id, null)).toEqual({
      target: 'room',
      roomId: room.id,
      trim: null,
    });
    expect(skinBody('wall', room.id, 'paper-plain:sky')).toEqual({
      target: 'room',
      roomId: room.id,
      wall: 'paper-plain:sky',
    });
    expect(skinBody('ground', room.id, 'deck')).toEqual({
      target: 'room',
      roomId: room.id,
      floor: 'deck',
    });
    expect(skinBody('frame', null, 'frame-stone:grey')).toEqual({
      target: 'exterior',
      frame: 'frame-stone:grey',
    });
    expect(skinBody('wall', null, 'paper-plain:sky')).toBeNull();
    expect(skinBody('roof', null, null)).toBeNull();
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
