import { useState } from 'preact/hooks';
import { EvolveDrawer } from '../../EvolveDrawer';
import { sampleCreature } from '../../creature-card-sample';
import type { Creature } from '../../api';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';

const LINES = ['Sproutle', 'Zipmouse'] as const;

/** The creature the screen is for: a Sproutle or a Zipmouse at its evolution level, with the forms of its line. */
function creatureFor(p: Props): Creature {
  const base = sampleCreature('evolve choice');
  const zip = str(p, 'line') === 'Zipmouse';
  return {
    ...base,
    species: zip ? 'zipmouse' : 'sproutle',
    line: zip ? 'zipmouse' : 'sproutle',
    level: num(p, 'level'),
    fusionCount: num(p, 'fusions'),
    shiny: bool(p, 'shiny'),
    evolution: {
      toSpecies: zip ? 'voltaro' : 'thornbuck',
      level: 15,
      essence: 20,
      available: bool(p, 'ready'),
      alt: { toSpecies: zip ? 'ohmouse' : 'sunfawn' },
    },
  };
}

/** A phone-sized window with a button that opens the screen, so it can be tried (and the focus goes back to the button). */
function EvolveDemo({ p }: { p: Props }) {
  const [open, setOpen] = useState(true);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const creature = creatureFor(p);
  return (
    <div class="v3-phone short">
      <div class="v3-pad">
        <p class="muted">
          {sent === null ? 'The Creatures tab, behind the screen.' : `Sent: evolve into ${sent}.`}
        </p>
        <button
          type="button"
          onClick={(event) => {
            setOpener(event.currentTarget);
            setOpen(true);
          }}
        >
          Choose an evolution
        </button>
      </div>
      <EvolveDrawer
        open={open}
        creature={creature}
        busy={bool(p, 'busy')}
        onClose={() => {
          setOpen(false);
        }}
        onEvolve={(_creature, species) => {
          setSent(species);
          setOpen(false);
        }}
        returnFocusTo={opener}
      />
    </div>
  );
}

const evolveDrawer: Entry = {
  name: 'EvolveDrawer',
  file: 'apps/activity/src/EvolveDrawer.tsx',
  group: 'Creatures & game pieces',
  description:
    'The evolve screen of a line that grows two ways, in a Drawer: both forms side by side (picture, name, element and role, ability, HP, Attack and Speed on the new form), nothing picked at first, one button for the form that is picked and a line that the choice is permanent. A line with one form skips it and evolves at once.',
  controls: {
    line: { kind: 'select', options: LINES },
    level: { kind: 'number', min: 15, max: 30 },
    fusions: { kind: 'number', min: 0, max: 5 },
    shiny: { kind: 'toggle' },
    ready: { kind: 'toggle' },
    busy: { kind: 'toggle' },
  },
  defaults: { line: 'Sproutle', level: 15, fusions: 0, shiny: false, ready: true, busy: false },
  presets: [
    { name: 'Sproutle: Thornbuck or Sunfawn', props: {} },
    { name: 'Zipmouse: Voltaro or Ohmouse', props: { line: 'Zipmouse' } },
    { name: 'Fused and shiny', props: { fusions: 3, shiny: true, level: 18 } },
    { name: 'Not ready (the button stays off)', props: { ready: false } },
    { name: 'Busy', props: { busy: true } },
  ],
  render: (p) => <EvolveDemo key={`${str(p, 'line')}`} p={p} />,
};

export const evolveEntries: readonly Entry[] = [evolveDrawer];
