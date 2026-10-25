import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseGameState } from '../api';
import type { Profile } from '../expedition-types';
import { parseProfile } from '../expedition-parse';
import profileFixture from '../fixtures/expedition-profile.json';
import stateOffer from '../fixtures/expedition-state-offer.json';
import {
  byClass,
  byName,
  createPage,
  find,
  visibleText,
  type FakeElement,
  type Page,
} from '../test-dom';
import { HomeBook } from './HomeBook';
import { JournalPage } from './JournalPage';
import { StatsPage } from './StatsPage';

const fetchProfile = vi.fn<() => Promise<Profile>>();
vi.mock('../expedition-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../expedition-api')>()),
  fetchProfile: () => fetchProfile(),
}));

const profile = parseProfile(profileFixture);
const creatures = parseGameState(stateOffer).creatures;

let page: Page | null = null;

beforeEach(() => {
  fetchProfile.mockReset();
});

afterEach(() => {
  page?.unmount();
  page = null;
});

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
};

describe('the Journal page', () => {
  it('has Back to Home at the top, then the Journal as it was', () => {
    const onBack = vi.fn();
    page = createPage();
    page.draw(<JournalPage profile={profile} onBack={onBack} />);
    expect(byClass(page.root, 'drill-head')).toHaveLength(1);
    expect(visibleText(first(byClass(page.root, 'drill-title')))).toBe('Journal');
    expect(visibleText(page.root)).toContain('3 / 45 pages found');
    expect(byClass(page.root, 'journal-place').length).toBeGreaterThan(1);
    page.click(first(byName(page.root, 'button', /^‹ Back/)));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('goes back on Escape', () => {
    const onBack = vi.fn();
    page = createPage();
    page.draw(<JournalPage profile={profile} onBack={onBack} />);
    page.key(first(byName(page.root, 'button', /^‹ Back/)), 'Escape');
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('the Journal as a place', () => {
  it('has no Back when opened from the dock, and Back to where it came from when a pin opened it', async () => {
    fetchProfile.mockResolvedValue(profile);
    const onBack = vi.fn();
    page = createPage();
    page.draw(<HomeBook page="journal" creatures={creatures} tripsFinished={0} />);
    await flush();
    expect(byClass(page.root, 'drill-head')).toHaveLength(0);
    expect(byName(page.root, 'button', /^‹ Back/)).toHaveLength(0);
    expect(visibleText(page.root)).toContain('3 / 45 pages found');
    page.draw(<HomeBook page="journal" creatures={creatures} tripsFinished={0} onBack={onBack} />);
    await flush();
    page.click(first(byName(page.root, 'button', /^‹ Back/)));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('keeps Back (when there is one) if the profile fails to load', async () => {
    fetchProfile.mockRejectedValue(new Error('down'));
    page = createPage();
    page.draw(
      <HomeBook page="journal" creatures={creatures} tripsFinished={0} onBack={() => undefined} />,
    );
    await flush();
    expect(byName(page.root, 'button', /^‹ Back/)).toHaveLength(1);
  });
});

describe('the Stats page', () => {
  function draw(onBack = () => undefined): Page {
    const drawn = createPage();
    page = drawn;
    drawn.draw(<StatsPage profile={profile} creatures={creatures} onBack={onBack} />);
    return drawn;
  }

  it('groups the stats by area, in order, with a table each', () => {
    const p = draw();
    const groups = byClass(p.root, 'stat-group');
    expect(groups.map((g) => g.getAttribute('data-group'))).toEqual([
      'expeditions',
      'dungeon',
      'collection',
      'raid',
    ]);
    const dungeon = visibleText(groups[1] as FakeElement);
    expect(dungeon).toContain('Runs finished');
    expect(dungeon).toContain('Runs cleared');
    for (const group of groups) expect(byClass(group, 'data-table')).toHaveLength(1);
  });

  it('keeps the milestones and leaves out the list of explorers', () => {
    const p = draw();
    const text = visibleText(p.root);
    expect(text).toContain('Milestones');
    expect(byClass(p.root, 'milestone').length).toBeGreaterThan(5);
    expect(text).not.toContain('Explorers');
    expect(byClass(p.root, 'explorer-row')).toHaveLength(0);
  });

  it('has Back to Home at the top', () => {
    const onBack = vi.fn();
    const p = draw(onBack);
    expect(visibleText(first(byClass(p.root, 'drill-title')))).toBe('Stats');
    p.click(first(byName(p.root, 'button', /^‹ Back/)));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('draws only text and no markup from the data', () => {
    expect(find(draw().root, (el) => el.localName === 'img')).toHaveLength(0);
  });
});

describe('HomeBook', () => {
  it('says it is opening, then draws the page asked for', async () => {
    fetchProfile.mockResolvedValue(profile);
    page = createPage();
    page.draw(
      <HomeBook page="stats" creatures={creatures} tripsFinished={3} onBack={() => undefined} />,
    );
    expect(visibleText(page.root)).toContain('Opening the book');
    expect(byName(page.root, 'button', /^‹ Back/)).toHaveLength(1);
    await flush();
    page.update(() => undefined);
    expect(byClass(page.root, 'stat-group')).toHaveLength(4);
  });

  it('draws the Journal for the Journal page', async () => {
    fetchProfile.mockResolvedValue(profile);
    page = createPage();
    page.draw(
      <HomeBook page="journal" creatures={creatures} tripsFinished={3} onBack={() => undefined} />,
    );
    await flush();
    page.update(() => undefined);
    expect(byClass(page.root, 'journal-place').length).toBeGreaterThan(1);
    expect(byClass(page.root, 'stat-group')).toHaveLength(0);
  });

  it('says so when the profile fails, and still has Back and a retry', async () => {
    fetchProfile.mockRejectedValue(new Error('offline'));
    const onBack = vi.fn();
    page = createPage();
    page.draw(<HomeBook page="stats" creatures={creatures} tripsFinished={3} onBack={onBack} />);
    await flush();
    page.update(() => undefined);
    expect(visibleText(page.root)).toContain('Could not load it.');
    fetchProfile.mockResolvedValue(profile);
    page.click(first(byName(page.root, 'button', 'Try again')));
    await flush();
    page.update(() => undefined);
    expect(byClass(page.root, 'stat-group')).toHaveLength(4);
    page.click(first(byName(page.root, 'button', /^‹ Back/)));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
