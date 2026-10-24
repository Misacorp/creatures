import { afterEach, describe, expect, it, vi } from 'vitest';
import { hudAmount } from './CurrencyPile';
import { Hud } from './Hud';
import { PopoverHost } from './PopoverHost';
import { byClass, byName, createPage, find, type Page } from './test-dom';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

describe('hudAmount', () => {
  it('shows whole numbers with thousands separators up to 9,999, then short', () => {
    expect(hudAmount(0)).toBe('0');
    expect(hudAmount(36)).toBe('36');
    expect(hudAmount(1240)).toBe('1,240');
    expect(hudAmount(9999)).toBe('9,999');
    expect(hudAmount(12345)).toBe('12.3K');
    expect(hudAmount(2_500_000)).toBe('2.5M');
  });

  it('never shows a negative, fractional or broken amount', () => {
    expect(hudAmount(-5)).toBe('0');
    expect(hudAmount(Number.NaN)).toBe('0');
    expect(hudAmount(7.9)).toBe('7');
  });
});

describe('Hud', () => {
  it('names the place in the page heading, shows both currencies with numbers and has the help button', () => {
    page = createPage();
    const onHelp = vi.fn();
    page.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <Hud
          title="Expeditions"
          balances={{ bait: 1240, essence: 36 }}
          helpRef={{ current: null }}
          onHelp={onHelp}
        />
      </PopoverHost>,
    );
    const heading = find(page.root, (el) => el.localName === 'h1');
    expect(heading.map((h) => h.textContent)).toEqual(['Expeditions']);
    const pile = byClass(page.root, 'currency-pile');
    expect(pile).toHaveLength(1);
    expect(pile[0]?.textContent).toContain('1,240');
    expect(pile[0]?.textContent).toContain('36');
    expect(pile[0]?.getAttribute('aria-label')).toBe('Currencies: 1240 Bait, 36 Essence');
    const help = byName(page.root, 'button', 'How to play');
    expect(help).toHaveLength(1);
    const [button] = help;
    if (button === undefined) throw new Error('no help button');
    page.click(button);
    expect(onHelp).toHaveBeenCalledOnce();
  });
});
