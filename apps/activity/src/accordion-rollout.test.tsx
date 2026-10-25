import { afterEach, describe, expect, it } from 'vitest';
import { parseProfile } from './expedition-parse';
import profileFixture from './fixtures/expedition-profile.json';
import { Journal } from './Journal';
import { byClass, createPage, type Page } from './test-dom';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
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
