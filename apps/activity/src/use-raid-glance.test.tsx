import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RaidGlance } from './home-view';
import type { RaidView } from './raid-api';
import { createPage, type Page } from './test-dom';
import { glanceOf, nextScheduleTime, useRaidGlance } from './use-raid-glance';

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

function Probe({ enabled, onHome = true }: { enabled: boolean; onHome?: boolean }) {
  const { raid, load } = useRaidGlance(enabled, onHome, 0);
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

describe('nextScheduleTime', () => {
  it('is the nearest moment still ahead, or null once the week is over', () => {
    const glance = { schedule: { weekStart: 100, phase1: 200, phase2: 300, finale: 400 } };
    expect(nextScheduleTime(glance, 150)).toBe(200);
    expect(nextScheduleTime(glance, 200)).toBe(300);
    expect(nextScheduleTime(glance, 400)).toBeNull();
  });
});

describe('useRaidGlance on Home', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads again each time the screen becomes Home, by any route', async () => {
    fetchRaid.mockResolvedValue({ schedule: SCHEDULE } as RaidView);
    page = createPage();
    page.draw(<Probe enabled onHome={false} />);
    await flush();
    expect(fetchRaid).toHaveBeenCalledTimes(1);
    page.draw(<Probe enabled onHome />);
    await flush();
    expect(fetchRaid).toHaveBeenCalledTimes(2);
    page.draw(<Probe enabled onHome />);
    expect(fetchRaid).toHaveBeenCalledTimes(2);
  });

  it('reloads once when the next phase or the finale passes while Home stays open, and stops on leaving', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const week = { weekStart: 0, phase1: 2_000, phase2: 3_000, finale: 4_000 };
    fetchRaid.mockResolvedValue({ schedule: week } as RaidView);
    page = createPage();
    page.draw(<Probe enabled />);
    await vi.advanceTimersByTimeAsync(0);
    page.draw(<Probe enabled />);
    expect(fetchRaid).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchRaid).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchRaid).toHaveBeenCalledTimes(2);
    // Leaving Home clears the timer: the next phase does not load.
    page.draw(<Probe enabled onHome={false} />);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchRaid).toHaveBeenCalledTimes(2);
  });

  it('does not loop when the week is over and the server still sends it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    fetchRaid.mockResolvedValue({ schedule: SCHEDULE } as RaidView);
    page = createPage();
    page.draw(<Probe enabled />);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchRaid).toHaveBeenCalledTimes(1);
  });
});
