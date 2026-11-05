import { Column, Columns } from '../../ui/Columns';
import { useWide } from '../../ui/wide-layout';
import { SidePanel } from '../../ui/SidePanel';
import { WideLayout } from '../../ui/WideLayout';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';

const LAYOUTS = ['auto', 'phone', 'desktop'] as const;

/** A stand-in for a screen's main area: a block as tall as a map or an arena. */
function MainBlock() {
  return (
    <div class="wb-wide-main">
      <p class="muted">The main area (a map, the show's arena)</p>
    </div>
  );
}

function PanelBody() {
  return (
    <ul class="wb-wide-list">
      {['Aino', 'Eero', 'Kaisa', 'Misa', 'Ville'].map((name) => (
        <li key={name}>{name}</li>
      ))}
    </ul>
  );
}

function LayoutDemo({ p }: { p: Props }) {
  const auto = useWide();
  const layout = str(p, 'layout');
  const wide = layout === 'desktop' || (layout === 'auto' && auto);
  return (
    <WideLayout
      wide={wide}
      main={<MainBlock />}
      panel={
        bool(p, 'panel') ? (
          <SidePanel title="Side panel" titleId="wb-side-title">
            <PanelBody />
          </SidePanel>
        ) : null
      }
    />
  );
}

const wideLayout: Entry = {
  name: 'WideLayout',
  file: 'apps/activity/src/ui/WideLayout.tsx',
  group: 'Controls',
  description:
    'A main area with a side panel beside it on a wide screen (from 60 rem, `WIDE_QUERY`; the app card widens there): full width with no panel, then two columns, the main area and the 24 rem panel, sticky. Below 60 rem the panel is never drawn: the screen puts its content under the main area or in a sheet. Used by the Expeditions world map and the Valley Games show. Use the full width for the desktop presets.',
  controls: {
    layout: { kind: 'select', options: LAYOUTS },
    panel: { kind: 'toggle' },
  },
  defaults: { layout: 'auto', panel: true },
  presets: [
    { name: 'Desktop, a panel open', props: { layout: 'desktop' } },
    { name: 'Desktop, no panel', props: { layout: 'desktop', panel: false } },
    { name: 'Phone (no panel drawn)', props: { layout: 'phone' } },
  ],
  render: (p) => <LayoutDemo p={p} />,
};

function PanelDemo({ p }: { p: Props }) {
  const bare = bool(p, 'bare');
  return (
    <div class="wb-side-demo">
      {bare ? (
        <SidePanel labelledBy="wb-bare-title">
          <div class="reveal-card">
            <h3 id="wb-bare-title">A card with its own heading</h3>
            <PanelBody />
          </div>
        </SidePanel>
      ) : (
        <SidePanel
          title={str(p, 'title')}
          titleId="wb-side-title"
          onClose={bool(p, 'close') ? () => undefined : undefined}
          footer={
            bool(p, 'footer') ? (
              <button type="button" class="primary">
                Send an explorer here
              </button>
            ) : undefined
          }
        >
          <PanelBody />
        </SidePanel>
      )}
    </div>
  );
}

const sidePanel: Entry = {
  name: 'SidePanel',
  file: 'apps/activity/src/ui/SidePanel.tsx',
  group: 'Controls',
  description:
    'The side panel of a `WideLayout`: a gold heading with an optional pixel X, a body that scrolls inside the panel, and an optional footer pinned at the bottom under a line (the gold button). A bare panel is just the box for a card with its own heading (the trip reveal). The Expeditions place panel has the X; the Valley Games leaderboard has none (it stays while the show does).',
  controls: {
    title: { kind: 'text', maxLength: 40 },
    close: { kind: 'toggle' },
    footer: { kind: 'toggle' },
    bare: { kind: 'toggle' },
  },
  defaults: { title: 'Old Crossroads', close: true, footer: true, bare: false },
  presets: [
    { name: 'A place: X and a footer', props: {} },
    {
      name: 'The Games leaderboard: no X, no footer',
      props: { title: 'Melon Run', close: false, footer: false },
    },
    { name: 'Bare (a reveal card)', props: { bare: true } },
  ],
  render: (p) => <PanelDemo p={p} />,
};

const FROMS = ['60rem', '80rem'] as const;
const RATIOS = ['1-3', '2-3', '5-4'] as const;
const STACKS = ['none', 'tight', 'roomy'] as const;

function ColumnsDemo({ p }: { p: Props }) {
  const from = str(p, 'from') === '80rem' ? '80rem' : '60rem';
  const ratio = RATIOS.find((r) => r === str(p, 'ratio')) ?? '1-3';
  const stack = STACKS.find((s) => s === str(p, 'stack'));
  const rows = Array.from({ length: num(p, 'rows') }, (_, i) => i + 1);
  return (
    <Columns from={from} ratio={ratio}>
      {bool(p, 'notice') && (
        <p class="wb-wide-main">A notice above the work: it spans both columns</p>
      )}
      <Column
        sticky={bool(p, 'sticky')}
        {...(stack === undefined || stack === 'none' ? {} : { stack })}
      >
        <div class="wb-wide-main">The first column{bool(p, 'sticky') ? ' (sticky)' : ''}</div>
        <div class="wb-wide-main">Its second block</div>
      </Column>
      <Column {...(stack === undefined || stack === 'none' ? {} : { stack })}>
        <ul class="wb-wide-list">
          {rows.map((n) => (
            <li key={n}>Row {n} of the second column</li>
          ))}
        </ul>
      </Column>
    </Columns>
  );
}

const columns: Entry = {
  name: 'Columns',
  file: 'apps/activity/src/ui/Columns.tsx',
  group: 'Controls',
  description:
    "A screen's two columns on a desktop that collapse into one list on a phone, with `Column` for each side: `from` is the width where there are two (60 rem or 80 rem), `ratio` how the width is shared, a `Column` can be sticky (only while the window is at least 48 rem high) and stacked with a gap, and any child that is not a Column spans both columns. Used by the Workshop (60 rem, 1-3), the open dungeon run (60 rem, 2-3) and the Raid (80 rem, 5-4). The 80 rem presets need a full-width preview of 1280 px or more.",
  controls: {
    from: { kind: 'select', options: FROMS },
    ratio: { kind: 'select', options: RATIOS },
    stack: { kind: 'select', options: STACKS },
    sticky: { kind: 'toggle' },
    notice: { kind: 'toggle' },
    rows: { kind: 'number', min: 1, max: 40 },
  },
  defaults: { from: '60rem', ratio: '1-3', stack: 'tight', sticky: true, notice: false, rows: 20 },
  presets: [
    { name: 'Workshop: 60 rem, 1-3, sticky, a notice above', props: { notice: true } },
    {
      name: 'Dungeon run: 60 rem, 2-3, roomy',
      props: { ratio: '2-3', stack: 'roomy', sticky: false },
    },
    {
      name: 'Raid: 80 rem, 5-4',
      props: { from: '80rem', ratio: '5-4', stack: 'none', sticky: false, rows: 8 },
    },
  ],
  covers: ['Column'],
  render: (p) => <ColumnsDemo p={p} />,
};

export const sidePanelEntries: readonly Entry[] = [wideLayout, sidePanel, columns];
