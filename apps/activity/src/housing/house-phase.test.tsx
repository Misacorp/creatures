import { afterEach, describe, expect, it } from 'vitest';
import type { RoomPhase } from '@creatures/game';
import { createPage, type Page } from '../test-dom';
import { devPhase } from '../use-room-phase';
import { HouseHost } from './HouseHost';
import { useHousePhase } from './house-phase';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

describe('the house phase', () => {
  const seen: RoomPhase[] = [];
  function Probe() {
    seen.push(useHousePhase());
    return <p>probe</p>;
  }
  // The host loads the place on demand; a stand-in module draws the probe where the place would be.
  const load = () =>
    Promise.resolve({ HousePlace: Probe } as unknown as typeof import('./HousePlace'));

  async function settle(p: Page): Promise<void> {
    for (let i = 0; i < 8; i++) await Promise.resolve();
    p.update(() => undefined);
  }

  it('is day outside a provider', () => {
    page = createPage();
    seen.length = 0;
    page.draw(<Probe />);
    expect(seen).toEqual(['day']);
  });

  it("is the living room's phase inside the house, whatever page of it is open", async () => {
    page = createPage();
    seen.length = 0;
    page.draw(<HouseHost load={load} phase="night" creatures={[]} now={0} />);
    await settle(page);
    expect(seen.at(-1)).toBe('night');
  });

  it('defaults to day when the host is given none', async () => {
    page = createPage();
    seen.length = 0;
    page.draw(<HouseHost load={load} creatures={[]} now={0} />);
    await settle(page);
    expect(seen.at(-1)).toBe('day');
  });
});

describe('the dev override of the phase', () => {
  it('reads ?phase= in a dev build and ignores anything else', () => {
    if (!__DEV_TOOLS_BUILD__) {
      expect(devPhase('?phase=night')).toBeNull();
      return;
    }
    expect(devPhase('?phase=night')).toBe('night');
    expect(devPhase('?x=1&phase=twilight')).toBe('twilight');
    expect(devPhase('?phase=day')).toBe('day');
    expect(devPhase('?phase=dawn')).toBeNull();
    expect(devPhase('')).toBeNull();
    expect(devPhase(null)).toBeNull();
  });
});
