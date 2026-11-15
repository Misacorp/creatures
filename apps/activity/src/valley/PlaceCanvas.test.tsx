/**
 * The canvas shell: a wide window has a left and a right drawer beside the scene, a phone has one full page and no drawer; targets are
 * real, named buttons. (The focus rule and Escape need a real browser: the valley e2e checks them.)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { byClass, byName, createPage, visibleText, FakeElement, type Page } from '../test-dom';
import { CanvasTarget, PanelBody, PlaceCanvas, panFor, type CanvasPanel } from './PlaceCanvas';
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

describe('the scene under the drawers', () => {
  it('wide: the scene is the whole stage and the drawers lie over it, after it, so the scene is never squeezed', () => {
    const p = draw(true, panel('Bag'), panel('Anvil 1'));
    const stage = byClass(p.root, 'pc-stage')[0];
    const kids = (stage?.childNodes ?? []).map((c) =>
      c instanceof FakeElement ? (c.getAttribute('class') ?? '') : '',
    );
    expect(kids[0]).toContain('pc-main');
    expect(kids.slice(1).every((c) => c.includes('pc-side'))).toBe(true);
  });

  it('keeps a drawer first-step Back only when the panel asks (it goes to another panel)', () => {
    const keep: CanvasPanel = { ...panel('Order'), keepBack: true };
    const p = draw(true, null, keep);
    expect(byClass(p.root, 'pc-side')[0]?.getAttribute('data-keepback')).toBe('yes');
    p.unmount();
    const plain = draw(true, null, panel('Anvil 1'));
    expect(byClass(plain.root, 'pc-side')[0]?.getAttribute('data-keepback')).toBeNull();
  });

  it('pans only as far as it must to keep the clicked thing clear of a drawer, never when it already is', () => {
    // Clear span 0 to 700 (a 1100 wide stage with a right drawer of 400): in it, no pan.
    expect(panFor(100, 200, 0, 700)).toBe(0);
    // Under the right drawer: moves left until it is 12 px clear.
    expect(panFor(680, 760, 0, 700)).toBe(-(760 - 688));
    // Under the left drawer (clear from 384): moves right.
    expect(panFor(318, 382, 384, 1100)).toBe(384 + 12 - 318);
    // A thing that cannot fit leaves the scene where it is rather than pan the wrong way.
    expect(panFor(300, 900, 384, 700)).toBeLessThanOrEqual(0);
  });
});

describe('CanvasTarget', () => {
  it('draws its plate (the cue) as text under it, and no plate for a thing that has none', () => {
    const g = sceneGeometry(390, 640, 3);
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
          label="The plans"
          plate="Plans"
          onClick={() => undefined}
        />
        <CanvasTarget g={g} x={50} y={20} w={24} h={24} label="Hidden" onClick={() => undefined} />
      </>,
    );
    const plates = byClass(p.root, 'cv-plate');
    expect(plates).toHaveLength(1);
    expect(plates[0]?.textContent).toBe('Plans');
    expect(plates[0]?.getAttribute('aria-hidden')).toBe('true');
  });

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
