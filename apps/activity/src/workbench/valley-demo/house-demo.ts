/**
 * The valley demo's House with housing on (`ValleyDemo`, `housing`): the house's reads answered from the workbench's samples, so the
 * canvas (`housing/HousePlace`) can be looked at and tapped through with no server. Only the reads (the own house, the list of
 * houses, a visited house, the catalogue) are answered; a spend or a change fails like a server that is not there. The stub is on while
 * the demo is. Workbench only: nothing here ships.
 */
import type { RoomPhase } from '@creatures/game';
import { createSession } from '../../api';
import { sampleCatalogue, sampleHouse, sampleList, sampleOwn } from '../../housing/house-sample';
import { ESTATE, HUT, sceneHouse, sceneOwn } from '../../housing/house-scene-sample';

/** How the demo's house stands: not at all, a hut, a house a few weeks in, the whole estate, and the estate in the evening or at night. */
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

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** Signs the demo in (the stub answers the sign-in too, so the house's requests carry a token). */
export function demoSignIn(): Promise<unknown> {
  return createSession('demo', 'demo');
}

/** Answers the house's reads for `setting` until the returned function is called. */
export function installHouseApi(setting: string): () => void {
  const real = globalThis.fetch.bind(globalThis);
  const answer = own(setting);
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url, 'http://demo.local').pathname;
    const method = (init?.method ?? 'GET').toUpperCase();
    if (path === '/api/auth/session') {
      return Promise.resolve(
        json({
          sessionToken: 'demo',
          accessToken: 'demo',
          guildId: '1',
          user: { id: '1', displayName: 'Demo' },
        }),
      );
    }
    if (method === 'GET') {
      if (path === '/api/house') return Promise.resolve(json(answer));
      if (path === '/api/house/catalogue') return Promise.resolve(json(sampleCatalogue()));
      if (path === '/api/houses') return Promise.resolve(json(sampleList()));
      if (path.startsWith('/api/houses/')) {
        return Promise.resolve(json({ house: sceneHouse({ parts: ESTATE, housemates: 2 }) }));
      }
    }
    if (path.startsWith('/api/house')) {
      return Promise.resolve(
        new Response(JSON.stringify({ error: 'demo' }), { status: 503, headers: {} }),
      );
    }
    return real(input, init);
  };
  return () => {
    globalThis.fetch = real;
  };
}
