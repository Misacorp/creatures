import { useState } from 'preact/hooks';
import { EvolveDrawer } from '../../EvolveDrawer';
import { sampleCreature } from '../../creature-card-sample';
import type { Creature } from '../../api';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';

/** Every line that evolves: its stage-1 species, its two forms, and what the evolution costs. */
const FORMS = {
  Splashet: { species: 'splashet', first: 'tidewing', second: 'geyserpup', essence: 20 },
  Cindle: { species: 'cindle', first: 'pyrelynx', second: 'wickat', essence: 20 },
  Sproutle: { species: 'sproutle', first: 'thornbuck', second: 'sunfawn', essence: 20 },
  Zipmouse: { species: 'zipmouse', first: 'voltaro', second: 'ohmouse', essence: 20 },
  Mistnewt: { species: 'mistnewt', first: 'fogwyrm', second: 'drizzlewt', essence: 20 },
  Ashmole: { species: 'ashmole', first: 'magmole', second: 'kilnmole', essence: 20 },
  Stormray: { species: 'stormray', first: 'tempestray', second: 'halcyray', essence: 40 },
  Mossback: { species: 'mossback', first: 'ancientshell', second: 'bloomback', essence: 40 },
} as const;
const LINES = Object.keys(FORMS) as readonly (keyof typeof FORMS)[];

/** The creature the screen is for: a stage-1 creature of the line at its evolution level, with its two forms. */
function creatureFor(p: Props): Creature {
  const base = sampleCreature('evolve choice');
  const name = str(p, 'line');
  const form = LINES.map((line) => FORMS[line]).find((f) => f.species === name.toLowerCase());
  const { species, first, second, essence } = form ?? FORMS.Sproutle;
  return {
    ...base,
    species,
    line: species,
    level: num(p, 'level'),
    fusionCount: num(p, 'fusions'),
    shiny: bool(p, 'shiny'),
    evolution: {
      toSpecies: first,
      level: 15,
      essence,
      available: bool(p, 'ready'),
      ...(str(p, 'forms') === 'one' ? {} : { alt: { toSpecies: second } }),
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
          Evolve
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
    'The evolve screen, in a Drawer, for every evolve. A line with two forms (every shipped line) shows both side by side (picture, name, element and role, ability, HP, Attack and Speed on the new form), nothing picked at first, one button for the form that is picked and a line that the choice is permanent. A line with one form (none ships today; "forms" set to one) shows that form on one full-width card with no sentence about it, already picked, so the one button works at once.',
  controls: {
    line: { kind: 'select', options: LINES },
    forms: { kind: 'select', options: ['two', 'one'] },
    level: { kind: 'number', min: 15, max: 30 },
    fusions: { kind: 'number', min: 0, max: 5 },
    shiny: { kind: 'toggle' },
    ready: { kind: 'toggle' },
    busy: { kind: 'toggle' },
  },
  defaults: {
    line: 'Sproutle',
    forms: 'two',
    level: 15,
    fusions: 0,
    shiny: false,
    ready: true,
    busy: false,
  },
  presets: [
    { name: 'Sproutle: Thornbuck or Sunfawn', props: {} },
    { name: 'Zipmouse: Voltaro or Ohmouse', props: { line: 'Zipmouse' } },
    { name: 'Splashet: Tidewing or Geyserpup', props: { line: 'Splashet' } },
    { name: 'Cindle: Pyrelynx or Wickat', props: { line: 'Cindle' } },
    { name: 'Mistnewt: Fogwyrm or Drizzlewt', props: { line: 'Mistnewt' } },
    { name: 'Ashmole: Magmole or Kilnmole', props: { line: 'Ashmole' } },
    { name: 'Stormray: Tempestray or Halcyray', props: { line: 'Stormray' } },
    { name: 'Mossback: Ancientshell or Bloomback', props: { line: 'Mossback' } },
    { name: 'Shiny Mossback (the longest names)', props: { line: 'Mossback', shiny: true } },
    {
      name: 'One form: Cindle, only Pyrelynx (none ships today)',
      props: { line: 'Cindle', forms: 'one' },
    },
    {
      name: 'One form, shiny Mossback (the longest name)',
      props: { line: 'Mossback', forms: 'one', shiny: true },
    },
    { name: 'One form, not ready (the button stays off)', props: { forms: 'one', ready: false } },
    { name: 'Fused and shiny', props: { fusions: 3, shiny: true, level: 18 } },
    { name: 'Not ready (the button stays off)', props: { ready: false } },
    { name: 'Busy', props: { busy: true } },
  ],
  render: (p) => <EvolveDemo key={`${str(p, 'line')}-${str(p, 'forms')}`} p={p} />,
};

export const evolveEntries: readonly Entry[] = [evolveDrawer];
