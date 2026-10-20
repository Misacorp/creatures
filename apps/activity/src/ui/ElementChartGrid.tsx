import type { Element, ElementChart } from '@creatures/game';
import { elementSlug } from '../art';
import { chartGrid, elementLines } from '../element-chart-view';
import { elementName } from '../game';
import { GameIcon } from './GameIcon';

/**
 * The element chart: a grid with the attacker down the side and the defender across the top, each
 * cell the damage a hit deals (150%, 75%, or blank for normal), and under it one line for each
 * element ("Mire: strong against Ember · weak to Ember · resists Tide"). Both are read from the
 * chart, so adding an element or a pair changes the picture and nothing else. The cell text is
 * the cue; colour only backs it up. Fits 360 px with five elements: icons head the columns.
 */
export function ElementChartGrid({
  chart,
  elements,
  lines = true,
}: {
  chart?: ElementChart;
  elements?: readonly Element[];
  /** The per-element lines under the grid (default on). */
  lines?: boolean;
}) {
  const grid = chartGrid(chart, elements);
  const sentences = lines ? elementLines(chart, elements) : [];
  return (
    <div class="chart pix-panel">
      <table class="chart-grid">
        <caption class="chart-caption">Down: who hits. Across: who is hit.</caption>
        <thead>
          <tr>
            <td aria-hidden="true" />
            {grid.elements.map((el) => (
              <th key={el} scope="col" class={`chart-head el-${elementSlug(el)}`}>
                <span class="chart-icon">
                  <GameIcon icon={{ kind: 'element', element: el }} scale={2} />
                </span>
                <span class="visually-hidden">{elementName(el)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row) => (
            <tr key={row.attacker}>
              <th scope="row" class={`chart-side el-${elementSlug(row.attacker)}`}>
                <span class="chart-icon">
                  <GameIcon icon={{ kind: 'element', element: row.attacker }} scale={2} />
                </span>
                <span class="chart-name">{elementName(row.attacker)}</span>
              </th>
              {row.cells.map((cell) => (
                <td
                  key={cell.defender}
                  class={`chart-cell ${cell.kind}`}
                  data-attacker={cell.attacker}
                  data-defender={cell.defender}
                >
                  {cell.text}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {sentences.length > 0 && (
        <ul class="chart-lines">
          {sentences.map((s) => (
            <li key={s.element} class={`el-${elementSlug(s.element)}`}>
              {s.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
