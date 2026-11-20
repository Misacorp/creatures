import { afterEach, describe, expect, it } from 'vitest';
import { byClass, createPage, type FakeElement, type Page } from '../test-dom';
import { Elsewhere } from './Elsewhere';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

/** An empty element of the page, as the real one Elsewhere is given. */
const host = (p: Page): FakeElement & HTMLElement => {
  const el = p.document.createElement('div');
  p.document.body.appendChild(el);
  return el as FakeElement & HTMLElement;
};

describe('Elsewhere', () => {
  it('draws nothing while it has no host, and nothing where it stands', () => {
    const p = createPage();
    page = p;
    p.draw(
      <div class="here">
        <Elsewhere into={null}>
          <span class="there">hello</span>
        </Elsewhere>
      </div>,
    );
    expect(byClass(p.root, 'there')).toHaveLength(0);
  });

  it('draws its children into the host, not where it stands, and follows what changes', () => {
    const p = createPage();
    page = p;
    const into = host(p);
    p.draw(
      <div class="here">
        <Elsewhere into={into}>
          <span class="there">one</span>
        </Elsewhere>
      </div>,
    );
    expect(byClass(into, 'there')).toHaveLength(1);
    expect(byClass(p.root, 'there')).toHaveLength(0);
    p.draw(
      <div class="here">
        <Elsewhere into={into}>
          <span class="there">two</span>
        </Elsewhere>
      </div>,
    );
    expect(byClass(into, 'there')).toHaveLength(1);
    expect(byClass(into, 'there')[0]?.textContent).toBe('two');
  });

  it('empties the old host when the host changes', () => {
    const p = createPage();
    page = p;
    const first = host(p);
    const second = host(p);
    const draw = (into: HTMLElement | null) => {
      p.draw(
        <Elsewhere into={into}>
          <span class="there">x</span>
        </Elsewhere>,
      );
    };
    draw(first);
    expect(byClass(first, 'there')).toHaveLength(1);
    draw(second);
    expect(byClass(first, 'there')).toHaveLength(0);
    expect(byClass(second, 'there')).toHaveLength(1);
    draw(null);
    expect(byClass(second, 'there')).toHaveLength(0);
  });

  it('empties the host when it goes', () => {
    const p = createPage();
    page = p;
    const into = host(p);
    p.draw(
      <Elsewhere into={into}>
        <span class="there">x</span>
      </Elsewhere>,
    );
    expect(byClass(into, 'there')).toHaveLength(1);
    p.draw(<div />);
    expect(byClass(into, 'there')).toHaveLength(0);
  });
});
