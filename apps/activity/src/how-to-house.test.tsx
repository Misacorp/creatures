/**
 * The How to play page's house picture: the postcard is loaded on demand (the first load carries no housing art, see
 * `first-load-housing.test.ts`), with the Home glyph in its box until it is in, and the section's chips include Skin.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { HousePicture, SectionArt } from './HowToPlayArt';
import { byClass, createPage, type Page } from './test-dom';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

async function settle(p: Page): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  p.update(() => undefined);
}

describe('the house section of How to play', () => {
  it('shows the glyph in the box until the postcard is loaded, then the postcard', async () => {
    let resolve: ((m: typeof import('./housing/HousePostcard')) => void) | undefined;
    const pending = new Promise<typeof import('./housing/HousePostcard')>((r) => {
      resolve = r;
    });
    page = createPage();
    page.draw(<HousePicture load={() => pending} />);
    expect(byClass(page.root, 'howto-house')).toHaveLength(1);
    expect(byClass(page.root, 'hp-postcard')).toHaveLength(0);
    resolve?.(await import('./housing/HousePostcard'));
    await settle(page);
    expect(byClass(page.root, 'hp-postcard')).toHaveLength(1);
  });

  it('keeps the glyph when the postcard cannot load', async () => {
    page = createPage();
    page.draw(<HousePicture load={() => Promise.reject(new Error('offline'))} />);
    await settle(page);
    expect(byClass(page.root, 'howto-house')).toHaveLength(1);
    expect(byClass(page.root, 'hp-postcard')).toHaveLength(0);
    expect(byClass(page.root, 'howto-house')[0]?.childNodes.length).toBe(1);
  });

  it('names Skin among the words of the house', () => {
    page = createPage();
    page.draw(<SectionArt id="housing" />);
    expect(page.root.textContent).toContain('Skin');
  });
});
