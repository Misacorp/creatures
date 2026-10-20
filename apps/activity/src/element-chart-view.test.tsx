import { content, type ElementChart } from '@creatures/game';
import { afterEach, describe, expect, it } from 'vitest';
import { chartGrid, elementLine, elementLines, percentText } from './element-chart-view';
import { ElementChartGrid } from './ui/ElementChartGrid';
import { byClass, createPage, visibleText, type Page } from './test-dom';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

describe('the element chart grid', () => {
  const grid = chartGrid();
  const cell = (attacker: string, defender: string) =>
    grid.rows.find((r) => r.attacker === attacker)?.cells.find((c) => c.defender === defender);

  it('is square: every element is a row and a column, in content order', () => {
    expect(grid.elements).toEqual(content.elements.map((e) => e.id));
    expect(grid.elements).toContain('mire');
    for (const row of grid.rows) {
      expect(row.cells.map((c) => c.defender)).toEqual(grid.elements);
    }
  });

  it('reads each cell from the chart: 150%, 75% or blank', () => {
    expect(cell('tide', 'ember')).toMatchObject({ kind: 'strong', text: '150%' });
    expect(cell('ember', 'tide')).toMatchObject({ kind: 'weak', text: '75%' });
    expect(cell('mire', 'ember')).toMatchObject({ kind: 'strong', text: '150%' });
    expect(cell('ember', 'mire')).toMatchObject({ kind: 'strong', text: '150%' });
    expect(cell('tide', 'mire')).toMatchObject({ kind: 'weak', text: '75%' });
    expect(cell('grove', 'mire')).toMatchObject({ kind: 'neutral', text: '' });
    expect(cell('tide', 'tide')).toMatchObject({ kind: 'neutral', text: '' });
  });

  it('has a cell for each chart pair, and no other cell is marked', () => {
    const marked = grid.rows.flatMap((r) => r.cells).filter((c) => c.kind !== 'neutral');
    expect(marked).toHaveLength(content.elementChart.length);
    expect(percentText(7_500)).toBe('75%');
  });

  it('follows a chart it is given (an element added without touching the code)', () => {
    const chart: ElementChart = [{ attacker: 'tide', defender: 'grove', bp: 15_000 }];
    const small = chartGrid(chart, ['tide', 'grove']);
    expect(small.rows[0]?.cells.map((c) => c.text)).toEqual(['', '150%']);
    expect(small.rows[1]?.cells.map((c) => c.text)).toEqual(['', '']);
  });
});

describe('the line of each element', () => {
  it('reads strong against, weak to and resists from the chart helpers', () => {
    expect(elementLine('mire')).toBe('Mire: strong against Ember · weak to Ember · resists Tide');
    expect(elementLine('tide')).toBe('Tide: strong against Ember · weak to Spark · resists Ember');
  });

  it('has one line per element, and says so when there are no matchups', () => {
    expect(elementLines().map((l) => l.element)).toEqual(content.elements.map((e) => e.id));
    expect(elementLine('grove', [])).toBe('Grove: no matchups');
  });
});

describe('ElementChartGrid', () => {
  it('draws a 5 x 5 table of cells and one line per element', () => {
    page = createPage();
    page.draw(<ElementChartGrid />);
    expect(byClass(page.root, 'chart-cell')).toHaveLength(25);
    expect(byClass(page.root, 'chart-lines')[0]?.childNodes).toHaveLength(5);
    const text = visibleText(page.root);
    expect(text).toContain('150%');
    expect(text).toContain('75%');
    expect(text).toContain('Mire: strong against Ember');
  });

  it('can leave the lines out', () => {
    page = createPage();
    page.draw(<ElementChartGrid lines={false} />);
    expect(byClass(page.root, 'chart-lines')).toHaveLength(0);
  });
});
