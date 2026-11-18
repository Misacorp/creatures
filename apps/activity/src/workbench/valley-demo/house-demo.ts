/**
 * The valley demo's House with housing on (`HouseDemo`): the house's requests answered from the workbench's samples
 * (`HouseApiContext`), so the canvas (`housing/HousePlace`) can be looked at and tapped through with no server. Only the reads (the
 * own house, the list of houses, a visited house, the catalogue) are answered; a spend or a change fails like a server that is not
 * there. Workbench only: nothing here ships, and nothing here names the API (`dev-build.test.ts`).
 */
import type { RoomPhase } from '@creatures/game';
import type { HouseApi } from '../../housing/house-api-context';
import { sampleCatalogue, sampleHouse, sampleList, sampleOwn } from '../../housing/house-sample';
import { ESTATE, HUT, sceneHouse, sceneOwn } from '../../housing/house-scene-sample';

/** How the demo's house stands: not at all, a hut, a house a few weeks in, the whole estate, the estate in the evening or at night, and the page. */
export const DEMO_HOUSES = [
  'off',
  'hut',
  'a few weeks in',
  'estate',
  'estate at twilight',
  'estate at night',
  'page: a few weeks in',
  'page: estate',
] as const;

/** The House as a page (the Collection group's tab with `VALLEY` off, and the layout before the canvas), not as the valley's canvas. */
export function isPage(setting: string): boolean {
  return setting.startsWith('page');
}

/** The light the demo's house is drawn in. */
export function housePhaseOf(setting: string): RoomPhase {
  return setting.endsWith('night') ? 'night' : setting.endsWith('twilight') ? 'twilight' : 'day';
}

function own(setting: string) {
  if (setting === 'hut') {
    const house = sceneHouse({ parts: HUT, housemates: 0 });
    return { house, own: sceneOwn(house) };
  }
  if (setting.startsWith('estate') || setting === 'page: estate') {
    const house = sceneHouse({ parts: ESTATE, housemates: 2 });
    return { house, own: sceneOwn(house) };
  }
  return { house: sampleHouse(), own: sampleOwn('rich') };
}

const NOT_HERE = (): Promise<never> => Promise.reject(new Error('The demo has no server.'));

/** Sample answers for the reads of `setting`; every change is refused. */
export function sampleHouseApi(setting: string): HouseApi {
  const answer = own(setting);
  return {
    fetchOwnHouse: () => Promise.resolve(answer),
    fetchHouse: () => Promise.resolve({ house: sceneHouse({ parts: ESTATE, housemates: 2 }) }),
    fetchHouses: () => Promise.resolve(sampleList()),
    fetchCatalogue: () => Promise.resolve(sampleCatalogue()),
    buildPart: NOT_HERE,
    craftItem: NOT_HERE,
    placePiece: NOT_HERE,
    setSkin: NOT_HERE,
    setHousemate: NOT_HERE,
    giftHouse: NOT_HERE,
    stampHouse: NOT_HERE,
    collectMail: NOT_HERE,
    markSeen: () => Promise.resolve(),
  };
}
