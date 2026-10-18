import { useState } from 'preact/hooks';
import { ItemCorners, ItemSprite } from '../../GearArt';
import { Drawer } from '../../ui/Drawer';
import { Slot, SlotRow } from '../../ui/Slot';
import { TalentInSlot } from '../../creature-page/PageSlots';
import { talentView } from '../../creature-card-sample';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';

const NOTHING = () => undefined;

const KINDS = ['gear', 'talent'] as const;
const STATES = ['filled', 'empty', 'locked'] as const;
const LAYOUTS = ['one slot', 'gear row', 'talent pair', 'talent trio'] as const;

const GOLDEN = talentView('quick-to-pounce', true);
const PLAIN = talentView('waits-for-the-moment', false);

function GearFilled({ level }: { level: number }) {
  return (
    <Slot
      kind="gear"
      state="filled"
      rarity="rare"
      label={`Hat: Kelp Cap, item level ${String(level)}. Change`}
      onClick={NOTHING}
    >
      <ItemSprite baseId="kelp-cap" scale={6} />
      <ItemCorners level={level} baseId="kelp-cap" />
    </Slot>
  );
}

function SlotDemo({ p }: { p: Props }) {
  const kind = str(p, 'kind') === 'talent' ? 'talent' : 'gear';
  const state = STATES.find((s) => s === str(p, 'state')) ?? 'filled';
  const name = str(p, 'name');
  const layout = str(p, 'layout');
  if (layout === 'gear row') {
    return (
      <SlotRow
        label="Gear"
        slots={[
          <GearFilled key="hat" level={2} />,
          <Slot
            key="scarf"
            kind="gear"
            state="empty"
            name="Scarf"
            label="Scarf: empty. Choose one"
            onClick={NOTHING}
          />,
          <Slot
            key="charm"
            kind="gear"
            state="locked"
            opensAt={13}
            label="Charm: opens at level 13"
          />,
        ]}
      />
    );
  }
  if (layout === 'talent pair' || layout === 'talent trio') {
    return (
      <SlotRow
        label="Talents"
        slots={[
          <Slot
            key="1"
            kind="talent"
            state="filled"
            label="Talent slot 1: Quick to Pounce, golden. Change"
            onClick={NOTHING}
          >
            <TalentInSlot talent={GOLDEN} />
          </Slot>,
          layout === 'talent pair' ? (
            <Slot
              key="2"
              kind="talent"
              state="locked"
              opensAt={20}
              label="Talent slot 2: opens at level 20"
            />
          ) : (
            <Slot
              key="2"
              kind="talent"
              state="empty"
              name="Talent"
              label="Talent slot 2: empty. Open the Talent Book"
              onClick={NOTHING}
            />
          ),
          ...(layout === 'talent trio'
            ? [
                <Slot
                  key="3"
                  kind="talent"
                  state="locked"
                  opensAt={25}
                  label="Talent slot 3: opens at level 25"
                />,
              ]
            : []),
        ]}
      />
    );
  }
  // One slot, as the controls say (it sits in the first of three columns, so its size is true).
  const corner = str(p, 'corner');
  const one =
    state === 'locked' ? (
      <Slot kind={kind} state="locked" opensAt={num(p, 'opensAt')} label="Locked slot" />
    ) : state === 'empty' ? (
      <Slot kind={kind} state="empty" name={name} label="Empty slot" onClick={NOTHING} />
    ) : (
      <Slot
        kind={kind}
        state="filled"
        label="Filled slot"
        {...(kind === 'gear' ? { rarity: 'rare' as const } : {})}
        {...(kind === 'talent' && corner !== '' ? { corner } : {})}
        onClick={NOTHING}
      >
        {kind === 'gear' ? (
          <>
            <ItemSprite baseId="kelp-cap" scale={6} />
            <ItemCorners level={4} baseId="kelp-cap" />
          </>
        ) : (
          <TalentInSlot talent={bool(p, 'golden') ? GOLDEN : PLAIN} />
        )}
      </Slot>
    );
  return <SlotRow label="One slot" slots={[one, <span key="b" />, <span key="c" />]} />;
}

const slot: Entry = {
  name: 'Slot',
  file: 'apps/activity/src/ui/Slot.tsx',
  group: 'Slots',
  description:
    'One slot for a creature\'s gear (Hat, Scarf, Charm) and its talents, side by side across the full width: filled it shows the item icon (with its level, "Lv 4", in the corner) or the talent name and number (golden ones shimmer), empty it names itself ("Scarf", "Talent"), locked it is muted with the level it opens at ("Lv 7"). A tappable one is a button that opens a Drawer (also SlotRow, the row they stand in).',
  covers: ['SlotRow'],
  controls: {
    layout: { kind: 'select', options: LAYOUTS },
    kind: { kind: 'select', options: KINDS },
    state: { kind: 'select', options: STATES },
    name: { kind: 'text', maxLength: 12 },
    opensAt: { kind: 'number', min: 1, max: 30 },
    corner: { kind: 'text', maxLength: 10 },
    golden: { kind: 'toggle' },
  },
  defaults: {
    layout: 'gear row',
    kind: 'gear',
    state: 'filled',
    name: 'Scarf',
    opensAt: 7,
    corner: '',
    golden: true,
  },
  presets: [
    { name: 'Gear: filled, empty, locked', props: {} },
    { name: 'Talents: golden and locked', props: { layout: 'talent pair' } },
    { name: 'Talents: three (filled, empty, locked)', props: { layout: 'talent trio' } },
    { name: 'One gear slot, filled', props: { layout: 'one slot' } },
    { name: 'One gear slot, empty', props: { layout: 'one slot', state: 'empty' } },
    { name: 'One gear slot, locked', props: { layout: 'one slot', state: 'locked' } },
    {
      name: 'One talent slot, plain',
      props: { layout: 'one slot', kind: 'talent', golden: false },
    },
    { name: 'One talent slot, golden', props: { layout: 'one slot', kind: 'talent' } },
  ],
  render: (p) => <SlotDemo p={p} />,
};

const SAMPLE_LINES = [
  'Kelp Cap, Lv 2',
  'Trail Cap, Lv 1',
  'Felt Hat, Lv 6',
  'Acorn Cap, Lv 4',
  'Static Hood, Lv 7',
  'Forge Hood, Lv 5',
  'Coal-Warm Cap, Lv 9',
  "Wayfarer's Hood, Lv 11",
  'Brine Hood, Lv 12',
  'Bark Hood, Lv 13',
];

/** A phone-sized window with a button that opens the drawer, so it can be tried (and the focus goes back to the button). */
function DrawerDemo({ p }: { p: Props }) {
  const [open, setOpen] = useState(bool(p, 'open'));
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const lines = SAMPLE_LINES.slice(0, num(p, 'lines'));
  return (
    <div class="v3-phone short">
      <div class="v3-pad">
        <p class="muted">The app, behind the drawer.</p>
        <button
          type="button"
          onClick={(event) => {
            setOpener(event.currentTarget);
            setOpen(true);
          }}
        >
          Open the drawer
        </button>
      </div>
      <Drawer
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title={str(p, 'title')}
        {...(bool(p, 'meta') ? { meta: `${String(lines.length)} items` } : {})}
        {...(bool(p, 'toolbar')
          ? { toolbar: <p class="muted">A search field would sit here.</p> }
          : {})}
        {...(bool(p, 'footer')
          ? {
              footer: (
                <button type="button" class="primary">
                  A pinned button
                </button>
              ),
            }
          : {})}
        returnFocusTo={opener}
      >
        <ul class="ip-list">
          {lines.map((line) => (
            <li class="ip-row" key={line}>
              <span class="pix">{line}</span>
            </li>
          ))}
        </ul>
      </Drawer>
    </div>
  );
}

const drawer: Entry = {
  name: 'Drawer',
  file: 'apps/activity/src/ui/Drawer.tsx',
  group: 'Popovers',
  description:
    'A bottom drawer: a sheet that slides up over a backdrop that dims the app. It closes by a tap on the backdrop, a tap or pull down on the drag handle, Escape or the close button; the focus moves in, Tab stays inside, and closing gives the focus back to the slot that opened it. The heading, an optional toolbar and footer stay put while the body scrolls. It holds the item picker and the Talent Book.',
  controls: {
    open: { kind: 'toggle' },
    title: { kind: 'text', maxLength: 30 },
    meta: { kind: 'toggle' },
    toolbar: { kind: 'toggle' },
    footer: { kind: 'toggle' },
    lines: { kind: 'number', min: 0, max: SAMPLE_LINES.length },
  },
  defaults: { open: true, title: 'Hat', meta: true, toolbar: false, footer: false, lines: 8 },
  presets: [
    { name: 'Open, a list', props: {} },
    { name: 'Closed (press the button)', props: { open: false } },
    { name: 'With a toolbar', props: { toolbar: true } },
    { name: 'With a pinned footer', props: { footer: true } },
    { name: 'A long body (scrolls)', props: { lines: 10, footer: true, toolbar: true } },
    { name: 'Nearly empty', props: { lines: 1, meta: false } },
  ],
  render: (p) => <DrawerDemo key={`${String(bool(p, 'open'))}`} p={p} />,
};

export const slotDrawerEntries: readonly Entry[] = [slot, drawer];
