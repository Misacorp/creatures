import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RaidBoardSocketDeps } from './raid-board-socket';
import { createPage, type Page } from './test-dom';
import { useRaidBoardLive, type RaidBoardLiveInputs } from './use-raid-board-live';

interface Made {
  deps: RaidBoardSocketDeps;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}
const made: Made[] = [];
vi.mock('./raid-board-socket', () => ({
  createRaidBoardSocket: (deps: RaidBoardSocketDeps) => {
    const entry: Made = { deps, start: vi.fn(), stop: vi.fn() };
    made.push(entry);
    return { start: entry.start, stop: entry.stop, state: () => 'idle' };
  },
}));

let page: Page | null = null;
beforeEach(() => {
  made.length = 0;
});
afterEach(() => {
  page?.unmount();
  page = null;
});

const base: RaidBoardLiveInputs = {
  offered: true,
  open: true,
  week: '2027-W02',
  party: 1,
  current: () => null,
  show: () => undefined,
  reload: () => undefined,
};

function Probe(props: Partial<RaidBoardLiveInputs>) {
  useRaidBoardLive({ ...base, ...props });
  return <p>raid</p>;
}

describe('useRaidBoardLive', () => {
  it('opens the socket for the shown party and closes it when the tab is left', () => {
    page = createPage();
    page.draw(<Probe />);
    expect(made).toHaveLength(1);
    expect(made[0]?.deps).toMatchObject({ week: '2027-W02', party: 1 });
    expect(made[0]?.start).toHaveBeenCalledTimes(1);
    expect(made[0]?.stop).not.toHaveBeenCalled();
    page.unmount();
    page = null;
    expect(made[0]?.stop).toHaveBeenCalledTimes(1);
  });

  it('keeps one socket across redraws, and moves to the new party when the party changes', () => {
    page = createPage();
    page.draw(<Probe />);
    page.draw(<Probe />);
    expect(made).toHaveLength(1);
    page.draw(<Probe party={2} />);
    expect(made).toHaveLength(2);
    expect(made[0]?.stop).toHaveBeenCalledTimes(1);
    expect(made[1]?.deps).toMatchObject({ party: 2 });
  });

  it('opens none when the server does not offer it, nothing is shown or the finale has the tab', () => {
    page = createPage();
    page.draw(<Probe offered={false} />);
    page.draw(<Probe open={false} />);
    page.draw(<Probe party={null} />);
    page.draw(<Probe week={null} />);
    expect(made).toHaveLength(0);
  });

  it('closes when the finale takes the tab, and reopens after', () => {
    page = createPage();
    page.draw(<Probe />);
    page.draw(<Probe open={false} />);
    expect(made[0]?.stop).toHaveBeenCalledTimes(1);
    page.draw(<Probe />);
    expect(made).toHaveLength(2);
  });

  it('hands the socket the latest handlers, not the first ones', () => {
    page = createPage();
    const first = vi.fn();
    const second = vi.fn();
    page.draw(<Probe reload={first} />);
    page.draw(<Probe reload={second} />);
    made[0]?.deps.reload();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
