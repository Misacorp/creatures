import { afterEach, describe, expect, it } from 'vitest';
import { useRef } from 'preact/hooks';
import { createPage, type FakeElement, type Page } from './test-dom';
import { useHowTo } from './use-how-to';

/** The stylesheets as text: the tests' DOM has no layout, so the stacking order is checked in the source. */
const styles = import.meta.glob<string>(
  ['./styles/base/tokens.css', './styles/components/drawer.css', './styles/views/how-to-play.css'],
  { query: '?raw', import: 'default', eager: true },
);
const tokens = styles['./styles/base/tokens.css'] ?? '';

/** The number a `--z-*` token is set to. */
function zToken(name: string): number {
  const match = new RegExp(`--${name}: (\\d+);`).exec(tokens);
  if (match === null) throw new Error(`no --${name}`);
  return Number(match[1]);
}

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

type Api = ReturnType<typeof useHowTo>;

/** A game-like page: a cog in the HUD, a "link" that opens How to play, no "?" button on screen. */
function Probe({ out, withLink }: { out: { api?: Api }; withLink: boolean }) {
  const main = useRef<HTMLElement>(null);
  const help = useRef<HTMLButtonElement>(null);
  const api = useHowTo(main, help);
  out.api = api;
  return (
    <main class="page" ref={main}>
      <button class="hud-gear">cog</button>
      {withLink && (
        <button
          class="link"
          onClick={() => {
            api.open(null);
          }}
        >
          link
        </button>
      )}
    </main>
  );
}

const one = (root: FakeElement, cls: string): FakeElement => {
  const el = root.querySelector(`.${cls}`);
  if (el === null) throw new Error(`no .${cls}`);
  return el;
};

describe('useHowTo', () => {
  it('returns focus to the element that opened the page when it closes, and makes main inert meanwhile', () => {
    page = createPage();
    const out: { api?: Api } = {};
    page.draw(<Probe out={out} withLink />);
    const link = one(page.root, 'link');
    const main = page.root.querySelector('.page');
    if (main === null) throw new Error('no main');
    page.update(() => {
      link.focus();
    });
    page.click(link);
    expect(out.api?.howTo).not.toBeNull();
    expect(main.hasAttribute('inert')).toBe(true);
    page.update(() => {
      out.api?.close();
    });
    expect(main.hasAttribute('inert')).toBe(false);
    expect(page.document.activeElement).toBe(link);
    expect(one(page.root, 'hud-gear').focused).toBe(0);
  });

  it('falls back to the HUD cog when the opener is gone', () => {
    page = createPage();
    const out: { api?: Api } = {};
    page.draw(<Probe out={out} withLink />);
    const link = one(page.root, 'link');
    page.update(() => {
      link.focus();
    });
    page.click(link);
    // The opener leaves the page while How to play is open (a popover closing, Settings closing).
    page.draw(<Probe out={out} withLink={false} />);
    page.update(() => {
      out.api?.close();
    });
    expect(page.document.activeElement).toBe(one(page.root, 'hud-gear'));
  });
});

describe('How to play stacking', () => {
  // `main` is inert while the page is open, and a drawer lives inside `main`: a drawer drawn over the
  // page would hide it and ignore every tap (#77).
  it('draws the page over an open drawer and under the popover layer', () => {
    expect(styles['./styles/components/drawer.css']).toContain('z-index: var(--z-drawer);');
    expect(styles['./styles/views/how-to-play.css']).toContain('z-index: var(--z-howto);');
    expect(zToken('z-howto')).toBeGreaterThan(zToken('z-drawer'));
    expect(zToken('z-howto')).toBeLessThan(zToken('z-popover-layer'));
  });
});
