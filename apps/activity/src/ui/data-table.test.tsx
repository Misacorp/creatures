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

  it("marks the viewer's own row, and only that one", () => {
    const table = draw([
      { label: 'Dee', value: 900 },
      { label: 'You', value: 700, mine: true },
      { label: 'Bob', value: 500 },
    ]);
    const rows = byClass(table, 'data-row');
    expect(rows.map((row) => classes(row).includes('mine'))).toEqual([false, true, false]);
    expect(byClass(table, 'mine')).toHaveLength(1);
  });

  describe('with column headings', () => {
    const rows: DataRow[] = [
      { label: 'Dee', value: '4,210', extra: '19%', icon: <span class="pic" /> },
      { label: 'You', value: '2,950', extra: '13%', mine: true },
      { label: 'Raid total', value: '7,160', extra: '100%', total: true },
    ];
    const drawHeaded = (over: Partial<Parameters<typeof DataTable>[0]> = {}) => {
      page = createPage();
      page.draw(
        <DataTable
          rows={rows}
          headings={{ label: 'Player', value: 'Damage', extra: '%' }}
          label="Scoreboard"
          {...over}
        />,
      );
      const [table] = byClass(page.root, 'data-table');
      if (table === undefined) throw new Error('no table');
      return table;
    };
    const tags = (el: FakeElement, tag: string, scope?: string): FakeElement[] =>
      find(
        el,
        (e) => e.localName === tag && (scope === undefined || e.getAttribute('scope') === scope),
      );

    it('becomes a real table with a header row, and the label of each row as its row header', () => {
      const table = drawHeaded();
      expect(table.localName).toBe('table');
      expect(classes(table)).toContain('headed');
      expect(table.getAttribute('aria-label')).toBe('Scoreboard');
      expect(tags(table, 'th', 'col').map(visibleText)).toEqual(['Player', 'Damage', '%']);
      expect(find(table, (e) => e.localName === 'thead')).toHaveLength(1);
      const body = find(table, (e) => e.localName === 'tbody')[0] as FakeElement;
      expect(tags(body, 'th', 'row').map(visibleText)).toEqual(['Dee', 'You', 'Raid total']);
      expect(tags(body, 'td').map(visibleText)).toEqual([
        '4,210',
        '19%',
        '2,950',
        '13%',
        '7,160',
        '100%',
      ]);
    });

    it('keeps the picture, the mine band and the total on their rows', () => {
      const table = drawHeaded();
      const dataRows = byClass(table, 'data-row');
      expect(dataRows.map((r) => r.localName)).toEqual(['tr', 'tr', 'tr']);
      expect(dataRows.map((r) => classes(r).includes('mine'))).toEqual([false, true, false]);
      expect(dataRows.map((r) => classes(r).includes('total'))).toEqual([false, false, true]);
      expect(byClass(dataRows[0] as FakeElement, 'pic')).toHaveLength(1);
    });

    it('has two columns when no heading or row has an extra value', () => {
      const table = drawHeaded({
        rows: [{ label: 'HP', value: 349 }],
        headings: { label: 'Stat', value: 'Value' },
      });
      expect(tags(table, 'th', 'col').map(visibleText)).toEqual(['Stat', 'Value']);
      expect(classes(table)).not.toContain('wide');
      expect(byClass(table, 'data-extra')).toHaveLength(0);
    });

    it('takes more value columns, each with its heading (a medal table: gold, silver, bronze)', () => {
      const table = drawHeaded({
        rows: [
          { label: 'Aino', value: 6, extra: 2, more: [3] },
          { label: 'You', value: 4, extra: 5, more: [1], mine: true },
        ],
        headings: { label: 'Player', value: 'Gold', extra: 'Silver', more: ['Bronze'] },
      });
      expect(tags(table, 'th', 'col').map(visibleText)).toEqual([
        'Player',
        'Gold',
        'Silver',
        'Bronze',
      ]);
      expect(tags(table, 'td').map(visibleText)).toEqual(['6', '2', '3', '4', '5', '1']);
    });

    it('is off by default: no headings means the description list it always was', () => {
      page = createPage();
      page.draw(<DataTable rows={rows} />);
      const [table] = byClass(page.root, 'data-table');
      expect((table as FakeElement).localName).toBe('dl');
      expect(find(page.root, (e) => e.localName === 'th')).toHaveLength(0);
    });
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
