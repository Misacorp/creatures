/**
 * The house's requests as a value the screens read (`useHouseApi`), with the real ones (`housing-api.ts`) as the default. The workbench
 * and tests give a house its own answers with `HouseApiContext.Provider`, so a screen can be looked at and tapped through with no
 * server (the workbench bundle may not name the API, `dev-build.test.ts`). The default calls through the module at the time of the call.
 */
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import * as real from './housing-api';

export interface HouseApi {
  fetchOwnHouse: typeof real.fetchOwnHouse;
  fetchHouse: typeof real.fetchHouse;
  fetchHouses: typeof real.fetchHouses;
  fetchCatalogue: typeof real.fetchCatalogue;
  buildPart: typeof real.buildPart;
  craftItem: typeof real.craftItem;
  placePiece: typeof real.placePiece;
  setSkin: typeof real.setSkin;
  setHousemate: typeof real.setHousemate;
  giftHouse: typeof real.giftHouse;
  stampHouse: typeof real.stampHouse;
  collectMail: typeof real.collectMail;
  markSeen: typeof real.markSeen;
}

/** The real requests. */
export const REAL_HOUSE_API: HouseApi = {
  fetchOwnHouse: (...a) => real.fetchOwnHouse(...a),
  fetchHouse: (...a) => real.fetchHouse(...a),
  fetchHouses: (...a) => real.fetchHouses(...a),
  fetchCatalogue: (...a) => real.fetchCatalogue(...a),
  buildPart: (...a) => real.buildPart(...a),
  craftItem: (...a) => real.craftItem(...a),
  placePiece: (...a) => real.placePiece(...a),
  setSkin: (...a) => real.setSkin(...a),
  setHousemate: (...a) => real.setHousemate(...a),
  giftHouse: (...a) => real.giftHouse(...a),
  stampHouse: (...a) => real.stampHouse(...a),
  collectMail: (...a) => real.collectMail(...a),
  markSeen: (...a) => real.markSeen(...a),
};

export const HouseApiContext = createContext<HouseApi>(REAL_HOUSE_API);

export function useHouseApi(): HouseApi {
  return useContext(HouseApiContext);
}
