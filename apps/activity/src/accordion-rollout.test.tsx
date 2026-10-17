import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LedgerEntry } from './api';
import { parseProfile } from './expedition-parse';
import profileFixture from './fixtures/expedition-profile.json';
import { Journal } from './Journal';
import { RecentActivity } from './RecentActivity';
import { byClass, byName, createPage, visibleText, type FakeElement, type Page } from './test-dom';

const fetchLedger = vi.hoisted(() => vi.fn());
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  fetchLedger,
}));

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
  fetchLedger.mockReset();
});

const tsx = import.meta.glob<string>(['./**/*.tsx', '!./**/*.test.tsx', '!./workbench/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
describe('every disclosure is the Accordion', () => {
  it('has no <details> or <summary> in the game (the workbench is its own tool)', () => {
    const found = Object.entries(tsx)
      .filter(([, source]) => /<details|<summary/.test(source))
      .map(([file]) => file);
    expect(Object.keys(tsx).length).toBeGreaterThan(50);
    expect(found).toEqual([]);
  });
});

describe('Recent Bait activity', () => {
  const entry: LedgerEntry = {
    id: 1,
    currency: 'bait',
    amount: 25,
    source: 'allowance',
    createdAt: 0,
    meta: { day: '2026-10-20' },
  };

  it('loads nothing until it is opened, then loads each time it opens', async () => {
    fetchLedger.mockResolvedValue([entry]);
    page = createPage();
    page.draw(<RecentActivity refreshKey={null} />);
    expect(fetchLedger).not.toHaveBeenCalled();
    const head = byName(page.root, 'button', 'Recent Bait activity')[0] as FakeElement;
    expect(head.getAttribute('aria-expanded')).toBe('false');

    page.click(head);
    expect(fetchLedger).toHaveBeenCalledTimes(1);
    expect(visibleText(page.root)).toContain('Loading...');
    await vi.waitFor(() => {
      expect(visibleText((page as Page).root)).toContain('+25 Bait');
    });

    page.click(head);
    expect(byClass(page.root, 'recent')).toHaveLength(0);
    page.click(head);
    expect(fetchLedger).toHaveBeenCalledTimes(2);
  });
});

describe('the Journal place groups', () => {
  it('have the count on the header and open when something is found there', () => {
    const profile = parseProfile(profileFixture);
    page = createPage();
    page.draw(<Journal profile={profile} />);
    const heads = byClass(page.root, 'acc-head');
    expect(heads.length).toBeGreaterThan(1);
    for (const head of heads) {
      expect(byClass(head, 'acc-meta')[0]?.textContent).toMatch(/^\d+ \/ \d+$/);
    }
    const open = heads.filter((h) => h.getAttribute('aria-expanded') === 'true');
    expect(open.length).toBeGreaterThan(0);
    expect(open.length).toBeLessThan(heads.length);
    for (const head of heads) {
      const found = Number(byClass(head, 'acc-meta')[0]?.textContent.split(' / ')[0]);
      expect(head.getAttribute('aria-expanded')).toBe(found > 0 ? 'true' : 'false');
    }
  });
});
