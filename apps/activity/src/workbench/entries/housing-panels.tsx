import { useState } from 'preact/hooks';
import { SAMPLE_STATE } from '../../creature-card-sample';
import { BuildPanel } from '../../housing/BuildPanel';
import { CataloguePanel } from '../../housing/CataloguePanel';
import { GiftButton } from '../../housing/GiftButton';
import { Guestbook } from '../../housing/Guestbook';
import { MailboxPanel } from '../../housing/MailboxPanel';
import { PartPreview } from '../../housing/PartPreview';
import { SkinPicker } from '../../housing/SkinPicker';
import { SpotPicker } from '../../housing/SpotPicker';
import { StampPicker } from '../../housing/StampPicker';
import { VisitList } from '../../housing/VisitList';
import { WorkbenchPanel } from '../../housing/WorkbenchPanel';
import {
  SAMPLE_NOW,
  sampleCatalogue,
  sampleGuestbook,
  sampleHouse,
  sampleList,
  sampleOwn,
} from '../../housing/house-sample';
import { str } from '../props';
import type { Entry, Props } from '../types';

/** The housing panels on the fixed samples (`house-sample.ts`): what a player holds is the one control most of them share. */
const HOLDS = { kind: 'select', options: ['rich', 'poor', 'empty'] } as const;
const holds = (p: Props) => {
  const mode = str(p, 'holds');
  return sampleOwn(mode === 'poor' || mode === 'empty' ? mode : 'rich');
};
const none = () => undefined;
const GROUP = 'Creatures & game pieces' as const;
const FILE = 'apps/activity/src/housing/';

function BuildDemo({ p }: { p: Props }) {
  const [open, setOpen] = useState<string | null>(null);
  const house = sampleHouse();
  return (
    <BuildPanel
      house={house}
      own={holds(p)}
      busy={false}
      error={null}
      onPay={none}
      open={open}
      onOpen={setOpen}
      renderPreview={(partId, size) => <PartPreview house={house} partId={partId} size={size} />}
    />
  );
}

const buildPanel: Entry = {
  name: 'BuildPanel',
  file: `${FILE}BuildPanel.tsx`,
  group: GROUP,
  description:
    'The house’s parts as rows (a small picture, the name, a pip for each line of the price, lit when paid); a tap opens the part’s page with what is still owed and Pay in. Parts that cannot be built yet follow, muted, with their reason.',
  controls: { holds: HOLDS },
  defaults: { holds: 'rich' },
  presets: [
    { name: 'A rich player', props: {} },
    { name: 'A poor player', props: { holds: 'poor' } },
    { name: 'Holding nothing', props: { holds: 'empty' } },
  ],
  render: (p) => <BuildDemo p={p} />,
};

const workbenchPanel: Entry = {
  name: 'WorkbenchPanel',
  file: `${FILE}WorkbenchPanel.tsx`,
  group: GROUP,
  description:
    'Every blueprint the player knows as a recipe card, by set in accordions; Make crafts at once and the count beside the piece goes up.',
  controls: { holds: HOLDS },
  defaults: { holds: 'rich' },
  presets: [
    { name: 'A rich player', props: {} },
    { name: 'A poor player', props: { holds: 'poor' } },
    { name: 'No blueprints', props: { holds: 'empty' } },
  ],
  render: (p) => <WorkbenchPanel own={holds(p)} busy={false} error={null} onCraft={none} />,
};

const cataloguePanel: Entry = {
  name: 'CataloguePanel',
  file: `${FILE}CataloguePanel.tsx`,
  group: GROUP,
  description:
    'Everything that exists, by kind and set, with owned and placed counts; what is not found yet is a silhouette with a one-line hint.',
  controls: { state: { kind: 'select', options: ['loaded', 'loading', 'failed'] } },
  defaults: { state: 'loaded' },
  presets: [
    { name: 'Loaded', props: {} },
    { name: 'Loading', props: { state: 'loading' } },
    { name: 'Could not load', props: { state: 'failed' } },
  ],
  render: (p) => (
    <CataloguePanel
      catalogue={str(p, 'state') === 'loaded' ? sampleCatalogue() : null}
      failed={str(p, 'state') === 'failed'}
      onRetry={none}
    />
  ),
};

const spotPicker: Entry = {
  name: 'SpotPicker',
  file: `${FILE}SpotPicker.tsx`,
  group: GROUP,
  description:
    'What goes in one spot of a room: Empty, the pieces that fit (free copies first, then the ones that move here from another room), the blueprints not made yet; a bed also asks who sleeps there.',
  controls: {
    spot: { kind: 'select', options: ['floor-small-a', 'floor-large-a', 'window-a'] },
  },
  defaults: { spot: 'floor-small-a' },
  presets: [
    { name: 'A small floor spot', props: {} },
    { name: 'The big floor spot', props: { spot: 'floor-large-a' } },
    { name: 'The window', props: { spot: 'window-a' } },
  ],
  render: (p) => {
    const house = sampleHouse();
    const room = house.rooms.find((r) => r.id === 'hut:hearth') ?? house.rooms[0];
    if (room === undefined) return null;
    return (
      <SpotPicker
        room={room}
        spotId={str(p, 'spot')}
        own={sampleOwn('rich')}
        housemates={house.housemates}
        creatures={SAMPLE_STATE.creatures}
        placedIn={{ 'cosy-cupboard': 'Kitchen' }}
        busy={false}
        onPlace={none}
        onHousemate={none}
        onMake={none}
      />
    );
  },
};

const skinPicker: Entry = {
  name: 'SkinPicker',
  file: `${FILE}SkinPicker.tsx`,
  group: GROUP,
  description:
    'The wallpaper, floor, roof or walls to choose from: the ones the player has as pictures, then the ones known but not made yet; the chosen one as a card with Use it or Make.',
  controls: { kind: { kind: 'select', options: ['wall', 'floor', 'roof', 'walls'] } },
  defaults: { kind: 'wall' },
  presets: [
    { name: 'Wallpaper', props: {} },
    { name: 'Floor', props: { kind: 'floor' } },
    { name: 'Roof', props: { kind: 'roof' } },
    { name: 'Walls', props: { kind: 'walls' } },
  ],
  render: (p) => {
    const kind = str(p, 'kind');
    const current = { wall: 'cosy-wall', floor: 'cosy-floor', roof: 'thatch', walls: 'plaster' };
    const k = kind === 'floor' || kind === 'roof' || kind === 'walls' ? kind : 'wall';
    return (
      <SkinPicker
        kind={k}
        current={current[k]}
        own={sampleOwn('rich')}
        busy={false}
        onPick={none}
        onMake={none}
      />
    );
  },
};

const mailboxPanel: Entry = {
  name: 'MailboxPanel',
  file: `${FILE}MailboxPanel.tsx`,
  group: GROUP,
  description:
    'The gifts waiting in the mailbox, one row per giver with its Acorns, and one Collect button that takes them all. An empty mailbox says so and has no button.',
  controls: { gifts: { kind: 'select', options: ['waiting', 'empty'] } },
  defaults: { gifts: 'waiting' },
  presets: [
    { name: 'Gifts waiting', props: {} },
    { name: 'Empty', props: { gifts: 'empty' } },
  ],
  render: (p) => (
    <MailboxPanel
      mailbox={sampleOwn(str(p, 'gifts') === 'empty' ? 'empty' : 'rich').mailbox}
      busy={false}
      onCollect={none}
    />
  ),
};

const visitList: Entry = {
  name: 'VisitList',
  file: `${FILE}VisitList.tsx`,
  group: GROUP,
  description:
    'The server’s houses as rows (the visitor’s own is not in it); a tap opens the house. Each row says what the visitor did there today.',
  controls: { state: { kind: 'select', options: ['loaded', 'loading', 'failed'] } },
  defaults: { state: 'loaded' },
  presets: [
    { name: 'Loaded', props: {} },
    { name: 'Loading', props: { state: 'loading' } },
    { name: 'Could not load', props: { state: 'failed' } },
  ],
  render: (p) => (
    <VisitList
      list={str(p, 'state') === 'loaded' ? sampleList() : null}
      failed={str(p, 'state') === 'failed'}
      onRetry={none}
      onOpen={none}
    />
  ),
};

const guestbook: Entry = {
  name: 'Guestbook',
  file: `${FILE}Guestbook.tsx`,
  group: GROUP,
  description: 'The latest stamps left in the house: the stamp, who left it and when.',
  controls: { entries: { kind: 'select', options: ['some', 'none'] } },
  defaults: { entries: 'some' },
  presets: [
    { name: 'Some stamps', props: {} },
    { name: 'None yet', props: { entries: 'none' } },
  ],
  render: (p) => (
    <Guestbook entries={str(p, 'entries') === 'none' ? [] : sampleGuestbook()} now={SAMPLE_NOW} />
  ),
};

const stampPicker: Entry = {
  name: 'StampPicker',
  file: `${FILE}StampPicker.tsx`,
  group: GROUP,
  description:
    'A visitor’s stamp, pinned like a place’s one action: “Leave a stamp” opens a dropdown of the stamps they hold; choosing one leaves it at once. Once used, or with no stamp held, it is a calm line, never a disabled button.',
  controls: { used: { kind: 'toggle' }, none: { kind: 'toggle' } },
  defaults: { used: false, none: false },
  presets: [
    { name: 'Not used today', props: {} },
    { name: 'Used today', props: { used: true } },
    { name: 'No stamps yet', props: { none: true } },
  ],
  render: (p) => (
    <StampPicker
      owned={p['none'] === true ? [] : sampleOwn('rich').items.stamps}
      used={p['used'] === true}
      busy={false}
      onStamp={none}
    />
  ),
};

const giftButton: Entry = {
  name: 'GiftButton',
  file: `${FILE}GiftButton.tsx`,
  group: GROUP,
  description:
    'A visitor’s gift, pinned like a place’s one action: the gold Gift button says what it gives (“+5 for Anna”). When the day’s gift is used it gives way to a calm line, never a disabled button.',
  controls: { state: { kind: 'select', options: ['open', 'given here', 'given today elsewhere'] } },
  defaults: { state: 'open' },
  presets: [
    { name: 'Open', props: {} },
    { name: 'Given here', props: { state: 'given here' } },
    { name: 'Given elsewhere today', props: { state: 'given today elsewhere' } },
  ],
  render: (p) => (
    <GiftButton
      today={{ gifted: str(p, 'state') === 'given here', stamped: false }}
      giftLeft={str(p, 'state') === 'open'}
      busy={false}
      owner="Anna"
      onGift={none}
    />
  ),
};

export const housingPanelEntries: readonly Entry[] = [
  buildPanel,
  workbenchPanel,
  cataloguePanel,
  spotPicker,
  skinPicker,
  mailboxPanel,
  visitList,
  guestbook,
  stampPicker,
  giftButton,
];
