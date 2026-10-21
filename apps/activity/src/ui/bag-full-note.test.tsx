import { afterEach, describe, expect, it, vi } from 'vitest';
import { LootList } from '../LootList';
import { byClass, byName, createPage, visibleText, type Page } from '../test-dom';
import { BagFullNote } from './BagFullNote';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

describe('the full bag', () => {
  it('warns with the count and a way to the Workshop once the bag is at or over the cap', () => {
    page = createPage();
    const onOpen = vi.fn();
    page.draw(
      <BagFullNote inventory={{ cap: 60, used: 61, reserved: 1 }} onOpenWorkshop={onOpen} />,
    );
    const [note] = byClass(page.root, 'bag-full-note');
    expect(visibleText(note ?? page.root)).toContain('Your bag is full (62 / 60)');
    expect(visibleText(note ?? page.root)).toContain('Gear you find becomes parts.');
    const [button] = byName(page.root, 'button', /Workshop/);
    if (button === undefined) throw new Error('no Workshop button');
    page.click(button);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('shows nothing while the bag has room or has not loaded', () => {
    page = createPage();
    page.draw(
      <div>
        <BagFullNote inventory={{ cap: 60, used: 58, reserved: 1 }} />
        <BagFullNote inventory={null} />
      </div>,
    );
    expect(byClass(page.root, 'bag-full-note')).toHaveLength(0);
  });

  it('says on the results why a found item became parts', () => {
    page = createPage();
    page.draw(
      <LootList
        loot={{
          gear: [],
          converted: [{ baseId: 'trail-cap', rarity: 'common', itemLevel: 3 }],
          parts: { scrap: 2 },
          blueprints: [],
        }}
        label="Loot"
      />,
    );
    expect(visibleText(page.root)).toMatch(/Your bag was full, so .+ became parts\./);
  });
});
