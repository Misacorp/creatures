import { afterEach, describe, expect, it } from 'vitest';
import { byClass, createPage, visibleText, type FakeElement, type Page } from '../test-dom';
import { PopoverCard } from './Popover';

/**
 * The content of an explaining popover (ux-patterns.md, "Spacing inside a popover" and the rule after it):
 * the title and its short answer are one group, and a picture sits beside that group, never on a line of
 * its own above the title.
 */

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

function draw(vnode: preact.ComponentChild): FakeElement {
  page = createPage();
  page.draw(vnode);
  const [body] = byClass(page.root, 'pop-body');
  if (body === undefined) throw new Error('no card');
  return body;
}

describe('PopoverCard', () => {
  it('puts the picture beside the title and its short answer', () => {
    const body = draw(
      <PopoverCard visual={<span class="pic" />} title="Tide" short="Water." lines={['One.']} />,
    );
    const [head] = byClass(body, 'pop-head');
    if (head === undefined) throw new Error('no head');
    expect(byClass(head, 'pop-visual')).toHaveLength(1);
    const [text] = byClass(head, 'pop-head-text');
    expect(visibleText(first(byClass(text as FakeElement, 'pop-heading')))).toBe('TideWater.');
    // The lines go below the pair.
    expect(byClass(head, 'pop-lines')).toHaveLength(0);
    expect(byClass(body, 'pop-lines')).toHaveLength(1);
  });

  it('is the heading group alone without a picture', () => {
    const body = draw(<PopoverCard title="Front" short="Hit first." />);
    expect(byClass(body, 'pop-head')).toHaveLength(0);
    expect(byClass(body, 'pop-heading')).toHaveLength(1);
  });
});

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}
