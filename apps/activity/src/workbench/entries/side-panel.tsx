import { useWide } from '../../ui/wide-layout';
import { SidePanel } from '../../ui/SidePanel';
import { WideLayout } from '../../ui/WideLayout';
import { bool, str } from '../props';
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

export const sidePanelEntries: readonly Entry[] = [wideLayout, sidePanel];
