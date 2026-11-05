import { afterEach, describe, expect, it } from 'vitest';
import { byClass, createPage, type Page } from '../test-dom';
import { Column, Columns } from './Columns';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

function draw(node: preact.ComponentChild): Page {
  page = createPage();
  page.draw(node);
  return page;
}

describe('Columns', () => {
  it('has its breakpoint and ratio in its classes, then the screen own class', () => {
    const p = draw(
      <Columns from="80rem" ratio="5-4" class="raid-page">
        <Column>left</Column>
        <Column>right</Column>
      </Columns>,
    );
    expect(byClass(p.root, 'cols')[0]?.getAttribute('class')).toBe(
      'cols cols-80 cols-r-5-4 raid-page',
    );
    expect(byClass(p.root, 'col')).toHaveLength(2);
  });

  it('puts the 60 rem breakpoint and the other ratios in the classes', () => {
    const p = draw(
      <Columns from="60rem" ratio="1-3">
        <Column>left</Column>
      </Columns>,
    );
    expect(byClass(p.root, 'cols')[0]?.getAttribute('class')).toBe('cols cols-60 cols-r-1-3');
  });

  it('marks a sticky column and a stacked one with classes, never inline styles', () => {
    const p = draw(
      <Columns from="60rem" ratio="2-3">
        <Column sticky stack="roomy">
          side
        </Column>
        <Column stack="tight">main</Column>
      </Columns>,
    );
    const [side, main] = byClass(p.root, 'col');
    expect(side?.getAttribute('class')).toBe('col col-sticky col-stack-roomy');
    expect(main?.getAttribute('class')).toBe('col col-stack-tight');
    expect(p.root.querySelectorAll('[style]')).toHaveLength(0);
  });

  it('gives the root to rootRef', () => {
    const ref = { current: null as HTMLDivElement | null };
    draw(
      <Columns from="60rem" ratio="2-3" rootRef={ref}>
        <Column>x</Column>
      </Columns>,
    );
    expect(ref.current?.getAttribute('class')).toContain('cols');
  });
});
