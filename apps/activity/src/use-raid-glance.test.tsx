import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RaidGlance } from './home-view';
import type { RaidView } from './raid-api';
import { createPage, type Page } from './test-dom';
import { glanceOf, useRaidGlance } from './use-raid-glance';

const SCHEDULE: RaidView['schedule'] = { weekStart: 1, phase1: 2, phase2: 3, finale: 4 };

const fetchRaid = vi.fn<() => Promise<RaidView>>();
vi.mock('./raid-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./raid-api')>()),
  fetchRaid: () => fetchRaid(),
}));

let page: Page | null = null;
let seen: RaidGlance | null = null;
let loadAgain: () => void = () => undefined;

beforeEach(() => {
  fetchRaid.mockReset();
  seen = null;
});

afterEach(() => {
  page?.unmount();
  page = null;
});

function Probe({ enabled }: { enabled: boolean }) {
  const { raid, load } = useRaidGlance(enabled);
  seen = raid;
  loadAgain = load;
  return <p>{raid === null ? 'none' : 'loaded'}</p>;
}

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('glanceOf', () => {
  it('keeps only the week’s times of the raid view', () => {
    expect(glanceOf({ schedule: SCHEDULE })).toEqual({ schedule: SCHEDULE });
  });
});

describe('useRaidGlance', () => {
  it('loads the raid view when the game opens, and keeps its schedule', async () => {
    fetchRaid.mockResolvedValue({ schedule: SCHEDULE } as RaidView);
    page = createPage();
    page.draw(<Probe enabled />);
    await flush();
    page.draw(<Probe enabled />);
    expect(fetchRaid).toHaveBeenCalledTimes(1);
    expect(seen).toEqual({ schedule: SCHEDULE });
  });

  it('asks nothing before the game is on screen (no starter yet)', () => {
    page = createPage();
    page.draw(<Probe enabled={false} />);
    expect(fetchRaid).not.toHaveBeenCalled();
    expect(seen).toBeNull();
  });

  it('fails quietly: no glance, no error, and the next call tries again', async () => {
    fetchRaid.mockRejectedValueOnce(new Error('offline'));
    page = createPage();
    page.draw(<Probe enabled />);
    await flush();
    page.draw(<Probe enabled />);
    expect(seen).toBeNull();

    fetchRaid.mockResolvedValue({ schedule: SCHEDULE } as RaidView);
    loadAgain();
    await flush();
    page.draw(<Probe enabled />);
    expect(fetchRaid).toHaveBeenCalledTimes(2);
    expect(seen).toEqual({ schedule: SCHEDULE });
  });
});
