import { GLOSSARY_SECTIONS } from '@creatures/game';
import { useEffect, useRef, useState } from 'preact/hooks';
import { HowToPlay } from '../../HowToPlay';
import { glyphOrUnknown } from '../../glyphs';
import { Sprite } from '../../sprites/Sprite';
import { Popover, PopoverBack, PopoverCard, popupProps } from '../../ui/Popover';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';

const SAMPLE_LINES = [
  'Hits the front row first.',
  'Fills its meter from reactions.',
  'Fires on its own with Auto fire on.',
  'Costs nothing to use.',
];

function cardLines(count: number): string[] {
  return SAMPLE_LINES.slice(0, count);
}

/** The card the popover pages show: a picture, a title, text, lines, a note and a link. */
function SampleCard({ p }: { p: Props }) {
  return (
    <PopoverCard
      visual={<Sprite sprite={glyphOrUnknown('gem')} scale={4} />}
      title={str(p, 'title')}
      short={str(p, 'short')}
      lines={cardLines(num(p, 'lines'))}
      note={bool(p, 'note') ? 'The general rule behind this trick.' : null}
      {...(bool(p, 'more')
        ? { more: { label: 'More in How to play', onMore: () => undefined } }
        : {})}
    />
  );
}

/** A button and its popover; the state is held here so it opens and closes like in the game. */
function PopoverDemo({ p }: { p: Props }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(bool(p, 'open'));
  const wanted = bool(p, 'open');
  // A preset or the control changes `open`: follow it.
  useEffect(() => {
    setOpen(wanted);
  }, [wanted]);
  const page = str(p, 'layer') === 'page';
  const size = str(p, 'size');
  return (
    <div class="wb-pop-stage">
      <button
        ref={anchor}
        type="button"
        {...popupProps(open)}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        Tap me
      </button>
      {open && (
        <Popover
          anchor={() => anchor.current}
          label={str(p, 'title')}
          layer={page ? 'page' : 'stage'}
          {...(size === 'compact' || size === 'wide' ? { size } : {})}
          onClose={() => {
            setOpen(false);
          }}
        >
          <SampleCard p={p} />
        </Popover>
      )}
    </div>
  );
}

const CARD_CONTROLS = {
  title: { kind: 'text', maxLength: 40 },
  short: { kind: 'text', maxLength: 120 },
  lines: { kind: 'number', min: 0, max: 4 },
  note: { kind: 'toggle' },
  more: { kind: 'toggle' },
} as const;

const CARD_DEFAULTS = {
  title: 'Shield Wall',
  short: 'Blocks the next hit for the whole party.',
  lines: 2,
  note: false,
  more: true,
} as const;

const popover: Entry = {
  name: 'Popover',
  file: 'apps/activity/src/ui/Popover.tsx',
  group: 'Popovers',
  description:
    'The one popover of the game: a small dialog with a pointer arrow that sits above what you tapped (or below it when there is no room) and closes on Escape or a tap outside. Every tag, creature and boss icon uses it.',
  controls: {
    open: { kind: 'toggle' },
    layer: { kind: 'select', options: ['stage', 'page'] },
    size: { kind: 'select', options: ['auto', 'compact', 'wide'] },
    ...CARD_CONTROLS,
  },
  defaults: { open: false, layer: 'stage', size: 'auto', ...CARD_DEFAULTS },
  presets: [
    { name: 'Closed', props: { open: false } },
    { name: 'Open (stage, compact)', props: { open: true } },
    { name: 'Open (page, wide)', props: { open: true, layer: 'page' } },
    {
      name: 'Long text',
      props: {
        open: true,
        short: 'A long sentence that wraps over several lines to show how the popover grows.',
        lines: 4,
        note: true,
      },
    },
  ],
  render: (p) => <PopoverDemo p={p} />,
};

const popoverCard: Entry = {
  name: 'PopoverCard',
  file: 'apps/activity/src/ui/Popover.tsx',
  group: 'Popovers',
  description:
    'The content of an explaining popover: a little picture, a bold title, a short answer, a few lines, a muted note and a "More in How to play" link. Shown here without the popover around it.',
  controls: CARD_CONTROLS,
  defaults: CARD_DEFAULTS,
  presets: [
    { name: 'Title only', props: { short: '', lines: 0, more: false } },
    { name: 'Full', props: { lines: 4, note: true, more: true } },
  ],
  render: (p) => (
    <div class="popover popover-wide wb-static-popover">
      <SampleCard p={p} />
    </div>
  ),
};

const popoverBack: Entry = {
  name: 'PopoverBack',
  file: 'apps/activity/src/ui/Popover.tsx',
  group: 'Popovers',
  description:
    'The back control at the top of a popover that has several faces (for example a creature, then one of its tags): an arrow and the place it goes back to.',
  controls: { text: { kind: 'text', maxLength: 30 } },
  defaults: { text: 'Cindle' },
  presets: [
    { name: 'Short', props: { text: 'Cindle' } },
    { name: 'Long name', props: { text: 'Sir Reginald Fluffington III' } },
  ],
  render: (p) => (
    <div class="popover popover-wide wb-static-popover">
      <PopoverBack label={`Back to ${str(p, 'text')}`} onBack={() => undefined}>
        {str(p, 'text')}
      </PopoverBack>
    </div>
  ),
};

const ALL_SECTIONS = 'all (top)';

const howToPlay: Entry = {
  name: 'HowToPlay',
  file: 'apps/activity/src/HowToPlay.tsx',
  group: 'Popovers',
  description:
    'The How to play page, the last resort for how things work: its sections in order, each with a small picture built from the game\'s own pieces. "More in How to play" in a popover opens it at that section. Close does nothing here.',
  controls: { section: { kind: 'select', options: [ALL_SECTIONS, ...GLOSSARY_SECTIONS] } },
  defaults: { section: ALL_SECTIONS },
  presets: [
    { name: 'From the top', props: {} },
    { name: 'Gear', props: { section: 'gear' } },
    { name: 'Creatures', props: { section: 'creatures' } },
  ],
  render: (p) => {
    const section = GLOSSARY_SECTIONS.find((s) => s === str(p, 'section')) ?? null;
    return <HowToPlay section={section} nonce={0} onClose={() => undefined} />;
  },
};

export const popoverEntries: readonly Entry[] = [popover, popoverCard, popoverBack, howToPlay];
