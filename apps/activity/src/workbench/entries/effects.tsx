import type { ElementChart } from '@creatures/game';
import { EffectIcons } from '../../ui/EffectIcons';
import { ElementChartGrid } from '../../ui/ElementChartGrid';
import { bool, num } from '../props';
import type { Entry } from '../types';

/** A made-up chart for the "one pair" preset: the grid follows whatever chart it is given. */
const TWO_ELEMENT_CHART: ElementChart = [{ attacker: 'tide', defender: 'ember', bp: 15_000 }];

const elementChartGrid: Entry = {
  name: 'ElementChartGrid',
  file: 'apps/activity/src/ui/ElementChartGrid.tsx',
  group: 'Creatures & game pieces',
  description:
    'The element chart in How to play: a grid with the attacker down the side and the defender across the top (150%, 75% or blank for normal damage), then one line per element ("Mire: strong against Ember · weak to Ember · resists Tide"). All of it is read from the chart in the content, so a new element or pair changes the picture and nothing else.',
  controls: {
    lines: { kind: 'toggle' },
    smallChart: { kind: 'toggle' },
  },
  defaults: { lines: true, smallChart: false },
  presets: [
    { name: 'The shipped chart, five elements', props: {} },
    { name: 'Grid only', props: { lines: false } },
    { name: 'A chart of two elements and one pair', props: { smallChart: true } },
  ],
  render: (p) => (
    <ElementChartGrid
      lines={bool(p, 'lines')}
      {...(bool(p, 'smallChart') ? { chart: TWO_ELEMENT_CHART, elements: ['tide', 'ember'] } : {})}
    />
  ),
};

const effectIcons: Entry = {
  name: 'EffectIcons',
  file: 'apps/activity/src/ui/EffectIcons.tsx',
  group: 'Creatures & game pieces',
  description:
    'The status effects on a fighter on the fight stage: a small chip with the effect\'s glyph, its stacks ("×5") and, beside the boss, the turns left; on a creature only the glyph and the stacks. Tap one for what the effect means. Only Mired exists today.',
  controls: {
    stacks: { kind: 'number', min: 1, max: 5 },
    turns: { kind: 'number', min: 1, max: 5 },
    onCreature: { kind: 'toggle' },
  },
  defaults: { stacks: 5, turns: 3, onCreature: false },
  presets: [
    { name: 'On the boss: Mired ×5, 3 turns', props: {} },
    { name: 'On the boss: one stack, last turn', props: { stacks: 1, turns: 1 } },
    { name: 'On a creature (small)', props: { stacks: 2, turns: 2, onCreature: true } },
  ],
  render: (p) => (
    <div class="effect-sample">
      <EffectIcons
        compact={bool(p, 'onCreature')}
        effects={[{ effect: 'mired', stacks: num(p, 'stacks'), turnsLeft: num(p, 'turns') }]}
      />
    </div>
  ),
};

export const effectEntries: readonly Entry[] = [elementChartGrid, effectIcons];
