import { afterEach, describe, expect, it, vi } from 'vitest';
import { byClass, createPage, type FakeElement, type Page } from '../test-dom';
import { Slot, SlotRow } from './Slot';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

function draw(vnode: Parameters<Page['draw']>[0]): Page {
  page ??= createPage();
  page.draw(vnode);
  return page;
}

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

describe('Slot', () => {
  it('a locked slot is not a button and says the level it opens at', () => {
    const onClick = vi.fn();
    const p = draw(
      <Slot
        kind="gear"
        state="locked"
        opensAt={7}
        label="Scarf: opens at level 7"
        onClick={onClick}
      />,
    );
    const slot = first(byClass(p.root, 'slot'));
    expect(slot.localName).toBe('div');
    expect(slot.textContent).toBe('Lv 7');
    expect(slot.getAttribute('aria-label')).toBe('Scarf: opens at level 7');
    p.click(slot);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('an empty slot is a button that names itself and has no other text', () => {
    const onClick = vi.fn();
    const p = draw(
      <Slot
        kind="gear"
        state="empty"
        name="Scarf"
        label="Scarf: empty"
        onClick={onClick}
        expanded
      />,
    );
    const slot = first(byClass(p.root, 'slot'));
    expect(slot.localName).toBe('button');
    expect(slot.textContent).toBe('Scarf');
    expect(slot.getAttribute('aria-haspopup')).toBe('dialog');
    expect(slot.getAttribute('aria-expanded')).toBe('true');
    p.click(slot);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('a filled slot shows what it holds and a tiny corner mark that is not read twice', () => {
    const p = draw(
      <Slot
        kind="gear"
        state="filled"
        corner="Lv 4"
        label="Hat: Kelp Cap, item level 4"
        onClick={() => undefined}
      >
        <span class="icon">icon</span>
      </Slot>,
    );
    const slot = first(byClass(p.root, 'slot'));
    expect(first(byClass(slot, 'icon')).textContent).toBe('icon');
    const corner = first(byClass(slot, 'slot-corner'));
    expect(corner.textContent).toBe('Lv 4');
    expect(corner.getAttribute('aria-hidden')).toBe('true');
    expect(slot.getAttribute('aria-expanded')).toBe('false');
    // No slot-name text on a filled slot.
    expect(byClass(slot, 'slot-word')).toHaveLength(0);
  });

  it('a filled slot without a handler is plain content', () => {
    const p = draw(
      <Slot kind="talent" state="filled" label="Signature talent">
        Name
      </Slot>,
    );
    expect(first(byClass(p.root, 'slot')).localName).toBe('div');
  });

  it('can be switched off', () => {
    const onClick = vi.fn();
    const p = draw(
      <Slot kind="talent" state="empty" name="Talent" label="Talent" onClick={onClick} disabled />,
    );
    p.click(first(byClass(p.root, 'slot')));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('SlotRow', () => {
  it('stands the slots side by side: two or three columns, more than three wrap in two', () => {
    const slot = (n: number) => (
      <Slot key={n} kind="talent" state="locked" opensAt={n} label={`slot ${String(n)}`} />
    );
    const p = draw(<SlotRow label="Talents" slots={[slot(1), slot(2)]} />);
    expect(first(byClass(p.root, 'slot-row')).getAttribute('class')).toContain('cols-2');
    p.draw(<SlotRow label="Gear" slots={[slot(1), slot(2), slot(3)]} />);
    expect(first(byClass(p.root, 'slot-row')).getAttribute('class')).toContain('cols-3');
    p.draw(<SlotRow label="Talents" slots={[slot(1), slot(2), slot(3), slot(4)]} />);
    expect(first(byClass(p.root, 'slot-row')).getAttribute('class')).toContain('cols-2');
  });
});
