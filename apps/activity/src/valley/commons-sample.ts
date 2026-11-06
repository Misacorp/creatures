/**
 * Sample `valley.commons` blocks (the workbench and the tests): the five places with a project open, being built or waiting, a few
 * collections with some sockets set, the fire and the hearth. The numbers follow `VALLEY_RULES` loosely (a project's parts are worth 1,
 * 0.5 and 2 Acorns' worth a unit and split 0.4, 0.4 and 0.2 of its size); they only have to look right.
 */
import { VALLEY_RULES, type ValleyCommonsPlace, type ValleyCommonsView } from '@creatures/game';
import type { Creature, ValleyVisit } from '../api';

type Place = ValleyCommonsPlace;

const PLACES = VALLEY_RULES.commons.places;
const BOARDS = VALLEY_RULES.collections.boards;

/** An open project of `size` filled to `fraction` (0 to 1) of each part; `given` is the viewer's own part in Acorns' worth. */
export function openPlace(
  id: string,
  level: number,
  size: number,
  fraction: number,
  extra: Partial<Place> = {},
): Place {
  const need = { acorns: size * 0.4, scrap: size * 0.8, shards: size * 0.1 };
  const left = 1 - fraction;
  const given = extra.mine?.given ?? 0;
  return {
    id,
    level,
    max: VALLEY_RULES.commons.maxLevel,
    cosmetic: 0,
    state: 'open',
    project: {
      size,
      progress: size * fraction,
      needs: {
        acorns: Math.ceil(need.acorns * left),
        scrap: Math.ceil(need.scrap * left),
        shards: Math.ceil(need.shards * left),
      },
      shardElement: VALLEY_RULES.commons.placeElement[id] ?? 'ember',
      cosmetic: false,
    },
    buildDaysLeft: 0,
    mine: { given, shareBp: given > 0 ? Math.round((given / (size * fraction)) * 10_000) : 0 },
    plaque: [],
    keepsakes: 0,
    ...extra,
  };
}

/** A place that has finished a level and builds for `days` more before the next opens. */
export function buildingPlace(
  id: string,
  level: number,
  days: number,
  plaque: string[],
  extra: Partial<Place> = {},
): Place {
  return {
    id,
    level,
    max: VALLEY_RULES.commons.maxLevel,
    cosmetic: 0,
    state: 'building',
    project: null,
    buildDaysLeft: days,
    mine: { given: 0, shareBp: 0 },
    plaque,
    keepsakes: plaque.includes('You') ? 1 : 0,
    ...extra,
  };
}

/** A place the guided start has not reached yet. */
export function waitingPlace(id: string): Place {
  return {
    id,
    level: 1,
    max: VALLEY_RULES.commons.maxLevel,
    cosmetic: 0,
    state: 'waiting',
    project: null,
    buildDaysLeft: 0,
    mine: { given: 0, shareBp: 0 },
    plaque: [],
    keepsakes: 0,
  };
}

/** A collection board with the sockets in `finders` set (a name for a set one, null for an open one). */
export function sampleBoard(
  place: string,
  finders: readonly (string | null)[],
): ValleyCommonsView['collections'][number] {
  const sockets = (BOARDS[place] ?? []).map((source, k) => ({
    source,
    set: finders[k] !== undefined && finders[k] !== null,
    finder: finders[k] ?? null,
  }));
  return { place, sockets, done: sockets.length > 0 && sockets.every((s) => s.set) };
}

/** The commons as a young server has them: the hearth and the Signpost open, the Forge building, the rest not yet. */
export function sampleCommons(
  overrides: Partial<ValleyCommonsView> & { places?: Place[] } = {},
): ValleyCommonsView {
  const places: Place[] = overrides.places ?? [
    openPlace('bonfire', 1, 400, 0.35, { mine: { given: 60, shareBp: 0 } }),
    buildingPlace('forge', 2, 2, ['Ada', 'Mia', 'Tobias'], { keepsakes: 1 }),
    openPlace('signpost', 2, 900, 0.28, { plaque: ['Ada', 'Mia', 'Tobias', 'You'], keepsakes: 1 }),
    openPlace('paddock', 1, 600, 0.1),
    waitingPlace('school'),
  ];
  return {
    places,
    collections: PLACES.map((id) =>
      sampleBoard(id, id === 'forge' ? [null, 'Mia', null, null, 'Ada'] : []),
    ),
    fire: {
      level: 12,
      milli: 12_400,
      next: 25,
      recent: [
        { source: 'place', place: 'forge', at: 1_799_700_000_000 },
        { source: 'collection', place: 'signpost', at: 1_799_600_000_000 },
      ],
    },
    hearthBp: 10_000,
    keystones: { found: 1, meanDays: 21 },
    communal: PLACES.map((id) => ({
      place: id,
      seatId: null,
      creatureId: null,
      storeHours: 0,
      perDay: 6,
    })),
    ...overrides,
  };
}

/** The commons presets the workbench shows. */
export const COMMONS_PRESETS = [
  'off',
  'young server',
  'full collection',
  'the fire grown',
  'bonfire level 3',
  'helpers posted',
] as const;

/** The commons of a preset, with the first creatures of the roster as helpers where the preset has them. */
export function presetCommons(
  preset: string,
  roster: readonly Pick<Creature, 'id'>[],
): ValleyCommonsView | null {
  const young = sampleCommons();
  const [a, b] = roster;
  switch (preset) {
    case 'young server':
      return young;
    case 'full collection':
      return sampleCommons({
        collections: PLACES.map((id) =>
          sampleBoard(id, id === 'signpost' ? ['Ada', 'Mia', 'Tobias', 'Sam', 'You'] : []),
        ),
      });
    case 'the fire grown':
      return sampleCommons({
        fire: {
          level: 52,
          milli: 52_300,
          next: 80,
          recent: [
            { source: 'boss', place: null, at: 1_799_700_000_000 },
            { source: 'collection', place: 'signpost', at: 1_799_650_000_000 },
            { source: 'place', place: 'forge', at: 1_799_600_000_000 },
            { source: 'cosmetic', place: 'paddock', at: 1_799_500_000_000 },
            { source: 'master', place: null, at: 1_799_400_000_000 },
          ],
        },
      });
    case 'bonfire level 3':
      return sampleCommons({
        hearthBp: 10_800,
        places: [
          openPlace('bonfire', 3, 900, 0.28, { plaque: ['Ada', 'Mia', 'Tobias'], keepsakes: 1 }),
          buildingPlace('forge', 3, 1, ['Ada', 'Mia', 'Tobias', 'You']),
          openPlace('signpost', 2, 900, 0.5, { plaque: ['Ada', 'Mia'] }),
          openPlace('paddock', 2, 900, 0.1),
          waitingPlace('school'),
        ],
      });
    case 'helpers posted': {
      const base = sampleCommons();
      return {
        ...base,
        communal: base.communal.map((c, i) =>
          (c.place === 'signpost' && a !== undefined) || (c.place === 'bonfire' && b !== undefined)
            ? {
                ...c,
                seatId: `communal-${c.place}`,
                creatureId: (i === 0 ? b?.id : a?.id) ?? null,
              }
            : c,
        ),
      };
    }
    default:
      return null;
  }
}

/** The same valley with a commons block in it; each creature on a communal seat is `helping` (and `helper` posts one more at `place`). */
export function withCommons(
  visit: ValleyVisit,
  commons: ValleyCommonsView = sampleCommons(),
  helper?: { place: string; creatureId: string },
): ValleyVisit {
  const communal = commons.communal.map((c) =>
    helper !== undefined && c.place === helper.place
      ? { ...c, seatId: `communal-${c.place}`, creatureId: helper.creatureId }
      : c,
  );
  const seatOf = new Map(
    communal.flatMap((c) => (c.creatureId === null ? [] : [[c.creatureId, c.place] as const])),
  );
  const creatures = visit.creatures.map((c) => {
    const place = seatOf.get(c.id);
    return place === undefined
      ? c
      : { ...c, state: 'helping' as const, seatId: `communal-${place}` };
  });
  return { ...visit, creatures, commons: { ...commons, communal } };
}
