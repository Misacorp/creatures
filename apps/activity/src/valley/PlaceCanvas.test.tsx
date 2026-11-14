/**
 * The canvas shell: a wide window has a left and a right drawer beside the scene, a phone has one full page and no drawer; targets are
 * real, named buttons. (The focus rule and Escape need a real browser: the valley e2e checks them.)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { byClass, byName, createPage, visibleText, type Page } from '../test-dom';
import { CanvasTarget, PanelBody, PlaceCanvas, type CanvasPanel } from './PlaceCanvas';
import { sceneGeometry } from './SceneFrame';

let page: Page | null = null;
afterEach(() => {
  vi.stubGlobal('document', {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  page?.unmount();
  vi.unstubAllGlobals();
  page = null;
});

const panel = (title: string): CanvasPanel => ({
  title,
  onClose: () => undefined,
  children: <PanelBody>{`Inside ${title}`}</PanelBody>,
});

function draw(wide: boolean, left: CanvasPanel | null, right: CanvasPanel | null): Page {
  vi.stubGlobal('matchMedia', () => ({
    matches: wide,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  const p = createPage();
  page = p;
  p.draw(<PlaceCanvas label="Test" scene={<p>the scene</p>} left={left} right={right} />);
  return p;
}

describe('PlaceCanvas', () => {
  it('wide: the left and the right drawer sit beside the scene, each with its own side, and there is no page', () => {
    const p = draw(true, panel('Bag'), panel('Anvil 1'));
    const sides = byClass(p.root, 'pc-side');
    expect(sides.map((s) => s.getAttribute('data-side')).sort()).toEqual(['left', 'right']);
    expect(byClass(p.root, 'pc-page')).toHaveLength(0);
    expect(visibleText(p.root)).toMatch(/the scene/);
  });

  it('a phone: no drawer; one page, the right one first, over a scene that stays mounted', () => {
    const p = draw(false, panel('Bag'), panel('Anvil 1'));
    expect(byClass(p.root, 'pc-side')).toHaveLength(0);
    const pages = byClass(p.root, 'pc-page');
    expect(pages).toHaveLength(1);
    expect(pages[0]?.getAttribute('data-side')).toBe('right');
    expect(byClass(p.root, 'pc-root')[0]?.getAttribute('data-page')).toBe('yes');
    expect(visibleText(p.root)).toMatch(/the scene/);
  });

  it('a phone with only a left panel shows it as the page; none open shows no page', () => {
    const left = draw(false, panel('Bag'), null);
    expect(byClass(left.root, 'pc-page')[0]?.getAttribute('data-side')).toBe('left');
    left.unmount();
    const none = draw(false, null, null);
    expect(byClass(none.root, 'pc-page')).toHaveLength(0);
  });
});

describe('CanvasTarget', () => {
  it('is a real button with a name, clicks with its opener, and a slot is dashed', () => {
    const g = sceneGeometry(390, 640, 3);
    const opened: unknown[] = [];
    const p = createPage();
    page = p;
    p.draw(
      <>
        <CanvasTarget
          g={g}
          x={10}
          y={20}
          w={24}
          h={24}
          label="The bag. Open"
          onClick={(o) => opened.push(o)}
        />
        <CanvasTarget
          g={g}
          x={50}
          y={20}
          w={24}
          h={24}
          label="A new anvil. Buy it"
          slot
          onClick={() => undefined}
        />
      </>,
    );
    const bag = byName(p.root, 'button', /^The bag/)[0];
    if (bag === undefined) throw new Error('no bag');
    p.click(bag);
    expect(opened).toHaveLength(1);
    expect(byName(p.root, 'button', /A new anvil/)[0]?.getAttribute('class')).toMatch(/cv-slot/);
  });
});
