import { afterEach, describe, expect, it, vi } from 'vitest';
import { hudAmount } from './CurrencyPile';
import { Hud } from './Hud';
import { PopoverHost } from './PopoverHost';
import { byClass, byName, createPage, find, visibleText, type Page } from './test-dom';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
  vi.unstubAllGlobals();
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

describe('the currency popover', () => {
  const entry = (id: number, amount: number, source: string, currency = 'bait') => ({
    id,
    currency,
    amount,
    source,
    createdAt: id,
    meta: null,
  });

  it('lists recent Bait income only, loaded when it opens, and warns when the leet sync fails', async () => {
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    page = createPage();
    const loadLedger = vi
      .fn()
      .mockResolvedValue([
        entry(4, 30, 'allowance'),
        entry(3, -12, 'train'),
        entry(2, 5, 'x', 'essence'),
        entry(1, 20, 'rank_gift'),
      ]);
    page.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <Hud
          title="Home"
          balances={{ bait: 1, essence: 2 }}
          leetSync={{
            source: 'http',
            lastAttemptAt: 1,
            lastSyncedAt: null,
            lastError: 'timeout',
            lastDays: null,
          }}
          loadLedger={loadLedger}
          helpRef={{ current: null }}
          onHelp={() => undefined}
        />
      </PopoverHost>,
    );
    expect(loadLedger).not.toHaveBeenCalled();
    const [pile] = byClass(page.root, 'currency-pile');
    if (pile === undefined) throw new Error('no pile');
    page.click(pile);
    expect(loadLedger).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      const items = byClass((page as Page).root, 'income-list')[0]?.textContent ?? '';
      expect(items).toContain('+30 · daily allowance');
      expect(items).toContain('+20 · explorer rank gift');
      expect(items).not.toContain('train');
      expect(items).not.toContain('-12');
    });
    expect(visibleText(page.root)).toContain("the leet bot didn't answer");
  });

  it('has a Settings cog next to "?" when it can open Settings, and none otherwise', () => {
    page = createPage();
    const onSettings = vi.fn();
    const draw = (withCog: boolean) => {
      page?.draw(
        <PopoverHost onOpenHowTo={() => undefined}>
          <Hud
            title="Home"
            balances={{ bait: 1, essence: 2 }}
            helpRef={{ current: null }}
            onHelp={() => undefined}
            {...(withCog ? { onSettings } : {})}
          />
        </PopoverHost>,
      );
    };
    draw(false);
    expect(byName(page.root, 'button', 'Settings')).toHaveLength(0);
    draw(true);
    const [cog] = byName(page.root, 'button', 'Settings');
    if (cog === undefined) throw new Error('no cog');
    // It sits just before "?" in the tools, and is a picture (a canvas), not a word.
    const tools = byClass(page.root, 'hud-tools')[0];
    if (tools === undefined) throw new Error('no tools');
    const names = find(tools, (el) => el.localName === 'button').map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(names.slice(-2)).toEqual(['Settings', 'How to play']);
    expect(cog.getAttribute('class')).toBe('hud-gear');
    page.click(cog);
    expect(onSettings).toHaveBeenCalledOnce();
  });
});
