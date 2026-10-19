import { glyphOrUnknown } from '../../glyphs';
import { Sprite } from '../../sprites/Sprite';
import { DataTable, type DataRow } from '../../ui/DataTable';
import { bool, str } from '../props';
import type { Entry } from '../types';

const gain = (n: number) => (
  <span class="gear-share" aria-label={`plus ${String(n)} from gear`}>
    +{n}
  </span>
);

/** Row sets the game really shows: the creature page's stats (with and without gear), its facts, an XP breakdown. */
const ROW_SETS: Readonly<Record<string, readonly DataRow[]>> = {
  'Stats with gear': [
    { label: 'HP', value: 349, extra: gain(204) },
    { label: 'Attack', value: 128, extra: gain(67) },
    { label: 'Speed', value: 56, extra: gain(14) },
  ],
  'Stats, some without gear': [
    { label: 'HP', value: 1204, extra: gain(88) },
    { label: 'Attack', value: 96 },
    { label: 'Speed', value: 7, extra: gain(5) },
  ],
  'Stats, no gear': [
    { label: 'HP', value: 349 },
    { label: 'Attack', value: 128 },
    { label: 'Speed', value: 56 },
  ],
  Facts: [
    { label: 'Fusion', value: '★★ 2 / 5' },
    { label: 'Ribbons', value: 'Bronze, Silver' },
    { label: 'Explorer rank', value: '3' },
    { label: 'Explorer XP', value: '412 / 600' },
    { label: 'Trips', value: '18' },
  ],
  'XP breakdown': [
    {
      label: 'Treat',
      value: '3x',
      icon: <Sprite sprite={glyphOrUnknown('treat')} scale={2} class="xp-boost-icon" />,
    },
    { label: 'Hearty Breakfast', value: '1.25x' },
    { label: 'Cold Snap', value: '0.8x' },
    { label: 'Total', value: '3.15x', total: true },
  ],
  'Long labels': [
    { label: 'A label long enough to need two lines on a narrow phone', value: '12 / 40' },
    { label: 'Short', value: 'A value that is quite long too' },
  ],
};
const SETS = Object.keys(ROW_SETS);

const dataTable: Entry = {
  name: 'DataTable',
  file: 'apps/activity/src/ui/DataTable.tsx',
  group: 'Creatures & game pieces',
  description:
    "A table of data in a panel a shade darker than the one around it, with padding and square corners: rows of a label and a value, an optional second value column (the gear's share, \"+204\") and an optional gold total row. The creature page's stats and facts and the experience multiplier's breakdown use it. In a popover the names are in the text colour (bright), in the body font.",
  controls: {
    rows: { kind: 'select', options: SETS },
    where: { kind: 'select', options: ['panel', 'popover'] },
    tabular: { kind: 'toggle' },
    bright: { kind: 'toggle' },
  },
  defaults: { rows: 'Stats with gear', where: 'panel', tabular: true, bright: false },
  presets: [
    { name: 'Stats with gear (the creature page)', props: {} },
    { name: 'Stats, some without gear', props: { rows: 'Stats, some without gear' } },
    { name: 'Stats, no gear', props: { rows: 'Stats, no gear' } },
    { name: 'Facts (About)', props: { rows: 'Facts', tabular: false } },
    {
      name: 'Breakdown in a popover, with a total',
      props: { rows: 'XP breakdown', where: 'popover', tabular: false, bright: true },
    },
    { name: 'Long labels wrap', props: { rows: 'Long labels', tabular: false } },
  ],
  render: (p) => {
    const table = (
      <DataTable
        rows={ROW_SETS[str(p, 'rows')] ?? []}
        tabular={bool(p, 'tabular')}
        bright={bool(p, 'bright')}
        {...(str(p, 'where') === 'popover' ? { class: 'xp-boost-lines' } : {})}
      />
    );
    return str(p, 'where') === 'popover' ? (
      <div class="popover popover-wide wb-static-popover">{table}</div>
    ) : (
      table
    );
  },
};

export const dataTableEntries: readonly Entry[] = [dataTable];
