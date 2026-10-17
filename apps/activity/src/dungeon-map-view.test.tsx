import { afterEach, describe, expect, it, vi } from 'vitest';
import { DungeonMap } from './DungeonMap';
import { SAMPLE_MAP, sampleState } from './dungeon-map-sample';
import {
  byClass,
  byName,
  byRole,
  createPage,
  visibleText,
  type FakeElement,
  type Page,
} from './test-dom';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

function draw(vnode: Parameters<Page['draw']>[0]): Page {
  page = createPage();
  page.draw(vnode);
  return page;
}

describe('DungeonMap', () => {
  it('draws every room as a labelled button and every path in one SVG', () => {
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={null} />);
    const buttons = byClass(p.root, 'dmap-node');
    expect(buttons).toHaveLength(SAMPLE_MAP.nodes.length);
    for (const b of buttons) {
      expect(b.localName).toBe('button');
      expect(b.getAttribute('aria-label')).toMatch(/Show details$/);
    }
    const paths = byClass(p.root, 'dmap-edge');
    expect(paths).toHaveLength(SAMPLE_MAP.nodes.reduce((n, r) => n + r.next.length, 0));
    expect(byName(p.root, 'button', /^Room boss: Coil Baron/)).toHaveLength(1);
  });

  it('marks the rooms by where the run stands', () => {
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={sampleState('midway')} />);
    const status = (label: RegExp): string =>
      first(byName(p.root, 'button', label)).getAttribute('class') ?? '';
    expect(status(/Fight: Ember Mite/)).toContain('s-current');
    expect(first(byName(p.root, 'button', /Fight: Ember Mite/)).getAttribute('aria-current')).toBe(
      'step',
    );
    expect(status(/Fight: Drift Wisp/)).toContain('s-reachable');
    expect(status(/Fight: Ash Sprite/)).toContain('s-visited');
    expect(status(/Fierce Moss Lurker/)).toContain('s-locked');
    expect(byClass(p.root, 'dmap-edge').map((e) => e.getAttribute('class'))).toContain(
      'dmap-edge taken',
    );
  });

  it('opens the drawer on a tap, and Go closes it and calls onGo for a reachable room', () => {
    const onGo = vi.fn();
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={sampleState('midway')} onGo={onGo} />);
    expect(byRole(p.root, 'dialog')).toHaveLength(0);
    p.click(first(byName(p.root, 'button', /Fight: Drift Wisp/)));
    const dialog = first(byRole(p.root, 'dialog'));
    expect(visibleText(dialog)).toContain('Drift Wisp');
    expect(visibleText(dialog)).toContain('HP 380');
    expect(visibleText(dialog)).toContain('Echoing');
    p.click(first(byName(p.root, 'button', /^Go to /)));
    expect(onGo).toHaveBeenCalledWith('f2l1');
    expect(byRole(p.root, 'dialog')).toHaveLength(0);
  });

  it('has no Go in the preview, and says a room off the path is not on it', () => {
    const preview = draw(<DungeonMap map={SAMPLE_MAP} state={null} />);
    preview.click(first(byName(preview.root, 'button', /^Fight: Puddle Imp/)));
    expect(byName(preview.root, 'button', /^Go/)).toHaveLength(0);
    expect(visibleText(preview.root)).not.toContain('Not on your path.');
    preview.unmount();

    const p = draw(<DungeonMap map={SAMPLE_MAP} state={sampleState('midway')} onGo={vi.fn()} />);
    p.click(first(byName(p.root, 'button', /^Fierce Moss Lurker/)));
    expect(byName(p.root, 'button', /^Go/)).toHaveLength(0);
    expect(visibleText(first(byRole(p.root, 'dialog')))).toContain('Not on your path.');
  });

  it('waits on Go while busy', () => {
    const p = draw(
      <DungeonMap map={SAMPLE_MAP} state={sampleState('midway')} onGo={vi.fn()} busy />,
    );
    p.click(first(byName(p.root, 'button', /Fight: Drift Wisp/)));
    expect(first(byName(p.root, 'button', /^Go to /)).getAttribute('disabled')).not.toBeNull();
  });

  it('says what a mystery room, a cache and the camp are, with no Go while the camp waits', () => {
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={sampleState('camp')} onGo={vi.fn()} />);
    p.click(first(byName(p.root, 'button', /^Mystery room/)));
    expect(visibleText(p.root)).toContain("Something stirs. You'll see when you step in.");
    p.click(first(byName(p.root, 'button', 'Close')));
    p.click(first(byName(p.root, 'button', /^Cache/)));
    expect(visibleText(p.root)).toContain('Free loot: Bait and scrap for your pack.');
    p.click(first(byName(p.root, 'button', 'Close')));
    p.click(first(byName(p.root, 'button', /^Camp/)));
    expect(visibleText(first(byRole(p.root, 'dialog')))).toContain('Rest, swap a creature');
    expect(byName(p.root, 'button', /^Go/)).toHaveLength(0);
  });

  it('shows an elite as Fierce, with an Elite tag', () => {
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={null} />);
    p.click(first(byName(p.root, 'button', /^Fierce Moss Lurker/)));
    const dialog = first(byRole(p.root, 'dialog'));
    expect(byClass(dialog, 'dnd-name')[0]?.textContent).toBe('Fierce Moss Lurker');
    expect(visibleText(dialog)).toContain('Elite');
    expect(visibleText(dialog)).toContain('Thorns');
  });
});
