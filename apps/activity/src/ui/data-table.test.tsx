import { afterEach, describe, expect, it } from 'vitest';
import { byClass, createPage, find, visibleText, type FakeElement, type Page } from '../test-dom';
import { DataTable, type DataRow } from './DataTable';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

function draw(rows: readonly DataRow[], props: { tabular?: boolean; bright?: boolean } = {}) {
  page = createPage();
  page.draw(<DataTable rows={rows} {...props} />);
  const [table] = byClass(page.root, 'data-table');
  if (table === undefined) throw new Error('no table');
  return table;
}

const classes = (el: FakeElement): string => el.getAttribute('class') ?? '';
const cells = (row: FakeElement, tag: 'dt' | 'dd'): FakeElement[] =>
  find(row, (el) => el.localName === tag);

describe('the DataTable', () => {
  it('is a description list with one group of label and value per row', () => {
    const table = draw([
      { label: 'HP', value: 349 },
      { label: 'Attack', value: 128 },
    ]);
    expect(table.localName).toBe('dl');
    const rows = byClass(table, 'data-row');
    expect(rows.map((row) => row.localName)).toEqual(['div', 'div']);
    expect(rows.map((row) => cells(row, 'dt').map(visibleText))).toEqual([['HP'], ['Attack']]);
    expect(rows.map((row) => cells(row, 'dd').map(visibleText))).toEqual([['349'], ['128']]);
    // Every term sits in a group of the list, never loose.
    expect(find(table, (el) => el.localName === 'dt')).toHaveLength(2);
  });

  it('adds a second value column only when a row has an extra value, and leaves other rows without one', () => {
    const plain = draw([{ label: 'HP', value: 1 }]);
    expect(classes(plain)).not.toContain('wide');
    expect(byClass(plain, 'data-extra')).toHaveLength(0);
    page?.unmount();
    const wide = draw([
      { label: 'HP', value: 349, extra: '+204' },
      { label: 'Attack', value: 128 },
    ]);
    expect(classes(wide)).toContain('wide');
    const [first, second] = byClass(wide, 'data-row');
    expect(byClass(first as FakeElement, 'data-extra').map(visibleText)).toEqual(['+204']);
    expect(byClass(second as FakeElement, 'data-extra')).toHaveLength(0);
    expect(cells(second as FakeElement, 'dd').map(visibleText)).toEqual(['128']);
  });

  it('puts a picture before the label, inside the term', () => {
    const table = draw([
      { label: 'Treat', value: '3x', icon: <span class="pic" /> },
      { label: 'Other', value: '1x' },
    ]);
    const [first, second] = byClass(table, 'data-row');
    const term = cells(first as FakeElement, 'dt')[0] as FakeElement;
    expect(byClass(term, 'pic')).toHaveLength(1);
    expect(visibleText(term)).toBe('Treat');
    expect(byClass(second as FakeElement, 'pic')).toHaveLength(0);
  });

  it('marks the closing row as the total', () => {
    const table = draw([
      { label: 'Treat', value: '3x' },
      { label: 'Total', value: '3x', total: true },
    ]);
    const rows = byClass(table, 'data-row');
    expect(rows.map((row) => classes(row).includes('total'))).toEqual([false, true]);
    expect(byClass(table, 'total')).toHaveLength(1);
  });

  it('has options for tabular figures and bright labels, off by default', () => {
    const rows = [{ label: 'HP', value: 1 }];
    const plain = classes(draw(rows));
    expect(plain).toContain('data-table');
    expect(plain).not.toContain('tabular');
    expect(plain).not.toContain('bright');
    page?.unmount();
    const set = classes(draw(rows, { tabular: true, bright: true }));
    expect(set).toContain('tabular');
    expect(set).toContain('bright');
  });

  it('shows text only, with no inline style, and an empty list as an empty table', () => {
    const table = draw([{ label: '<b>HP</b>', value: '<i>1</i>' }]);
    expect(visibleText(table)).toContain('<b>HP</b>');
    expect(visibleText(table)).toContain('<i>1</i>');
    expect(find(table, (el) => el.hasAttribute('style'))).toHaveLength(0);
    expect(find(table, (el) => el.localName === 'b' || el.localName === 'i')).toHaveLength(0);
    page?.unmount();
    expect(byClass(draw([]), 'data-row')).toHaveLength(0);
  });
});
