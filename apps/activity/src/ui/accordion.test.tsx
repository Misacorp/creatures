import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byClass, byRole, createPage, find, type FakeElement, type Page } from '../test-dom';
import { Accordion, AccordionGroup } from './Accordion';
import {
  accordionStorageKey,
  loadAccordionOpen,
  loadGroupOpen,
  motionAllowed,
} from './accordion-state';

let page: Page | null = null;
const stored = new Map<string, string>();

beforeEach(() => {
  stored.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => {
        stored.set(key, value);
      },
    },
  });
});

afterEach(() => {
  page?.unmount();
  page = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, 'localStorage');
});

function draw(vnode: Parameters<Page['draw']>[0]): Page {
  page ??= createPage();
  page.draw(vnode);
  return page;
}

function heads(p: Page): FakeElement[] {
  return byClass(p.root, 'acc-head');
}

function isOpen(head: FakeElement): boolean {
  return head.getAttribute('aria-expanded') === 'true';
}

describe('Accordion (uncontrolled)', () => {
  it('starts closed with a real button header and no body', () => {
    const p = draw(<Accordion title="Details">Hello</Accordion>);
    const [head] = heads(p);
    expect(head?.localName).toBe('button');
    expect(head?.getAttribute('type')).toBe('button');
    expect(head?.getAttribute('aria-expanded')).toBe('false');
    expect(head?.getAttribute('aria-controls')).toBeTruthy();
    expect(head?.textContent).toContain('Details');
    expect(byRole(p.root, 'region')).toHaveLength(0);
    expect(p.root.textContent).not.toContain('Hello');
  });

  it('opens and closes by click, and the region is labelled by the header', () => {
    const p = draw(<Accordion title="Details">Hello</Accordion>);
    const [head] = heads(p);
    if (head === undefined) throw new Error('no header');
    p.click(head);
    expect(isOpen(head)).toBe(true);
    const [region] = byRole(p.root, 'region');
    expect(region?.textContent).toContain('Hello');
    expect(region?.getAttribute('aria-labelledby')).toBe(head.getAttribute('id'));
    expect(region?.getAttribute('id')).toBe(head.getAttribute('aria-controls'));
    expect(region?.hasAttribute('hidden')).toBe(false);
    p.click(head);
    expect(isOpen(head)).toBe(false);
    expect(byRole(p.root, 'region')).toHaveLength(0);
  });

  it('is operated by the keyboard like any button (a native button, in the tab order)', () => {
    // Enter and Space on a focused <button> fire a click in the browser, so there is no key handler
    // to double toggle; what must hold is that the header is a focusable button and a click works.
    const p = draw(<Accordion title="Details">Hello</Accordion>);
    const [head] = heads(p);
    if (head === undefined) throw new Error('no header');
    expect(head.localName).toBe('button');
    expect(head.hasAttribute('disabled')).toBe(false);
    expect(head.getAttribute('tabindex')).not.toBe('-1');
    const enter = p.key(head, 'Enter');
    const space = p.key(head, ' ');
    expect(enter.defaultPrevented).toBe(false);
    expect(space.defaultPrevented).toBe(false);
    expect(isOpen(head)).toBe(false);
    p.click(head);
    expect(isOpen(head)).toBe(true);
  });

  it('honours defaultOpen and calls onToggle with the new state', () => {
    const seen: boolean[] = [];
    const p = draw(
      <Accordion
        title="Details"
        defaultOpen
        onToggle={(open) => {
          seen.push(open);
        }}
      >
        Hello
      </Accordion>,
    );
    const [head] = heads(p);
    if (head === undefined) throw new Error('no header');
    expect(isOpen(head)).toBe(true);
    p.click(head);
    p.click(head);
    expect(seen).toEqual([false, true]);
  });

  it('shows the meta, the icon slot and a label for assistive technology', () => {
    const p = draw(
      <Accordion
        title="More"
        meta="2 new"
        metaTone="gold"
        label="More about Cindle"
        icon={{ kind: 'glyph', id: 'unknown' }}
      >
        Hello
      </Accordion>,
    );
    const [head] = heads(p);
    expect(head?.getAttribute('aria-label')).toBe('More about Cindle');
    const [meta] = byClass(p.root, 'acc-meta');
    expect(meta?.textContent).toBe('2 new');
    expect(byClass(meta ?? p.root, 'gold')).toHaveLength(1);
    expect(byClass(p.root, 'acc-icon')).toHaveLength(1);
    expect(byClass(p.root, 'acc-icon')[0]?.getAttribute('aria-hidden')).toBe('true');
  });

  it('wraps the header in a heading when asked', () => {
    const p = draw(
      <Accordion title="Section" headingLevel={3}>
        Hello
      </Accordion>,
    );
    expect(byClass(p.root, 'acc-heading')[0]?.localName).toBe('h3');
  });

  it('draws the title as text, never as markup', () => {
    const p = draw(<Accordion title="<b>Bold</b>">Hello</Accordion>);
    const [head] = heads(p);
    expect(head?.textContent).toContain('<b>Bold</b>');
    expect(find(p.root, (el) => el.localName === 'b')).toHaveLength(0);
  });

  it('keeps the body in the page, hidden, with keepMounted', () => {
    const p = draw(
      <Accordion title="Rename" keepMounted>
        Hello
      </Accordion>,
    );
    const [head] = heads(p);
    if (head === undefined) throw new Error('no header');
    const [region] = byRole(p.root, 'region');
    expect(region?.hasAttribute('hidden')).toBe(true);
    p.click(head);
    expect(byRole(p.root, 'region')[0]?.hasAttribute('hidden')).toBe(false);
  });
});

describe('Accordion (controlled)', () => {
  it('follows the open prop and only asks through onToggle', () => {
    const asked: boolean[] = [];
    const view = (open: boolean) => (
      <Accordion
        title="Details"
        open={open}
        onToggle={(next) => {
          asked.push(next);
        }}
      >
        Hello
      </Accordion>
    );
    const p = draw(view(false));
    const [head] = heads(p);
    if (head === undefined) throw new Error('no header');
    p.click(head);
    // The caller did not change the prop, so nothing opened.
    expect(asked).toEqual([true]);
    expect(isOpen(head)).toBe(false);
    p.draw(view(true));
    expect(isOpen(head)).toBe(true);
    expect(byRole(p.root, 'region')).toHaveLength(1);
    p.click(head);
    expect(asked).toEqual([true, false]);
    expect(isOpen(head)).toBe(true);
    p.draw(view(false));
    expect(isOpen(head)).toBe(false);
  });
});

describe('AccordionGroup', () => {
  const group = (exclusive: boolean, defaultOpen?: string) => (
    <AccordionGroup
      exclusive={exclusive}
      label="Details"
      {...(defaultOpen === undefined ? {} : { defaultOpen })}
    >
      <Accordion name="a" title="A">
        Body A
      </Accordion>
      <Accordion name="b" title="B">
        Body B
      </Accordion>
    </AccordionGroup>
  );

  it('keeps one open at a time when exclusive', () => {
    const p = draw(group(true, 'a'));
    const [a, b] = heads(p);
    if (a === undefined || b === undefined) throw new Error('no headers');
    expect([isOpen(a), isOpen(b)]).toEqual([true, false]);
    p.click(b);
    expect([isOpen(a), isOpen(b)]).toEqual([false, true]);
    expect(byRole(p.root, 'region')).toHaveLength(1);
    p.click(b);
    expect([isOpen(a), isOpen(b)]).toEqual([false, false]);
  });

  it('lets several be open when not exclusive', () => {
    const p = draw(group(false));
    const [a, b] = heads(p);
    if (a === undefined || b === undefined) throw new Error('no headers');
    p.click(a);
    p.click(b);
    expect([isOpen(a), isOpen(b)]).toEqual([true, true]);
  });

  it('is named for assistive technology', () => {
    const p = draw(group(true));
    const [el] = find(p.root, (e) => e.getAttribute('role') === 'group');
    expect(el?.getAttribute('aria-label')).toBe('Details');
  });

  it('remembers the open one with persistKey', () => {
    const view = (
      <AccordionGroup exclusive persistKey="test:group">
        <Accordion name="a" title="A">
          Body A
        </Accordion>
        <Accordion name="b" title="B">
          Body B
        </Accordion>
      </AccordionGroup>
    );
    const p = draw(view);
    const [, b] = heads(p);
    if (b === undefined) throw new Error('no header');
    p.click(b);
    expect(stored.get(accordionStorageKey('test:group'))).toBe('b');
    expect(loadGroupOpen('test:group')).toBe('b');
    p.unmount();
    page = null;
    const again = draw(view);
    expect(heads(again).map(isOpen)).toEqual([false, true]);
  });
});

describe('nesting', () => {
  it('styles an accordion inside another as nested, and gives it its own state', () => {
    const p = draw(
      <Accordion title="Outer" defaultOpen>
        <Accordion title="Inner">Deep</Accordion>
      </Accordion>,
    );
    const [outer, inner] = heads(p);
    if (outer === undefined || inner === undefined) throw new Error('no headers');
    expect(inner.getAttribute('class')).toContain('nested');
    expect(outer.getAttribute('class')).not.toContain('nested');
    p.click(inner);
    expect([isOpen(outer), isOpen(inner)]).toEqual([true, true]);
    expect(p.root.textContent).toContain('Deep');
  });

  it('is not part of the group of its parent', () => {
    const p = draw(
      <AccordionGroup exclusive defaultOpen="a">
        <Accordion name="a" title="A">
          <Accordion name="x" title="Inner">
            Deep
          </Accordion>
        </Accordion>
        <Accordion name="b" title="B">
          Body B
        </Accordion>
      </AccordionGroup>,
    );
    const [a, inner] = heads(p);
    if (a === undefined || inner === undefined) throw new Error('no header');
    p.click(inner);
    expect(p.root.textContent).toContain('Deep');
    // Opening the inner one did not close the outer one (they are not in the same group).
    expect(isOpen(a)).toBe(true);
  });

  it('marks the compact variant', () => {
    const p = draw(
      <Accordion title="More" variant="compact">
        Hello
      </Accordion>,
    );
    expect(heads(p)[0]?.getAttribute('class')).toContain('compact');
  });
});

describe('persistKey', () => {
  const view = (key: string, defaultOpen = false) => (
    <Accordion title="Details" persistKey={key} defaultOpen={defaultOpen}>
      Hello
    </Accordion>
  );

  it('stores the state on each toggle and restores it next time', () => {
    const p = draw(view('bait:123'));
    const [head] = heads(p);
    if (head === undefined) throw new Error('no header');
    p.click(head);
    expect(stored.get(accordionStorageKey('bait:123'))).toBe('1');
    p.unmount();
    page = null;
    const again = draw(view('bait:123'));
    expect(isOpen(heads(again)[0] ?? again.root)).toBe(true);
  });

  it('lets a remembered closed state win over defaultOpen', () => {
    stored.set(accordionStorageKey('bait:1'), '0');
    const p = draw(view('bait:1', true));
    expect(isOpen(heads(p)[0] ?? p.root)).toBe(false);
  });

  it('keeps viewers apart by key', () => {
    stored.set(accordionStorageKey('bait:1'), '1');
    expect(loadAccordionOpen('bait:1')).toBe(true);
    expect(loadAccordionOpen('bait:2')).toBeNull();
  });

  it('ignores a garbage value', () => {
    stored.set(accordionStorageKey('bait:1'), 'maybe');
    expect(loadAccordionOpen('bait:1')).toBeNull();
  });

  it('still works when storage throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });
    const p = draw(view('bait:9'));
    const [head] = heads(p);
    if (head === undefined) throw new Error('no header');
    p.click(head);
    expect(isOpen(head)).toBe(true);
  });

  it('still works when touching localStorage itself throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('blocked');
      },
    });
    const p = draw(view('bait:9'));
    const [head] = heads(p);
    if (head === undefined) throw new Error('no header');
    p.click(head);
    expect(isOpen(head)).toBe(true);
  });

  it('is not used by a controlled accordion', () => {
    const p = draw(
      <Accordion title="Details" persistKey="bait:7" open={false}>
        Hello
      </Accordion>,
    );
    p.click(heads(p)[0] ?? p.root);
    expect(stored.size).toBe(0);
  });
});

describe('motion', () => {
  it('is off when matchMedia is missing or reduced motion is asked for', () => {
    expect(motionAllowed()).toBe(false);
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    expect(motionAllowed()).toBe(false);
  });

  it('keeps the body for the close animation, then removes it', () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    const p = draw(
      <Accordion title="Details" defaultOpen>
        Hello
      </Accordion>,
    );
    const [head] = heads(p);
    if (head === undefined) throw new Error('no header');
    p.click(head);
    const [closing] = byRole(p.root, 'region');
    expect(closing?.getAttribute('data-phase')).toBe('closing');
    p.update(() => {
      vi.advanceTimersByTime(300);
    });
    expect(byRole(p.root, 'region')).toHaveLength(0);
    p.click(head);
    expect(byRole(p.root, 'region')[0]?.getAttribute('data-phase')).toBe('opening');
    p.update(() => {
      vi.advanceTimersByTime(300);
    });
    expect(byRole(p.root, 'region')[0]?.hasAttribute('data-phase')).toBe(false);
  });
});
