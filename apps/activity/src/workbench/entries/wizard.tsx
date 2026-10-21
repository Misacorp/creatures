import { useState } from 'preact/hooks';
import { baitCount } from '../../count-items';
import { CountBadge } from '../../ui/CountBadge';
import { Drawer } from '../../ui/Drawer';
import { useWizard, type Wizard, type WizardStep } from '../../ui/use-wizard';
import { WizardFooter, WizardView } from '../../ui/Wizard';
import { bool, str } from '../props';
import type { Entry, Props } from '../types';

const NOTHING = () => undefined;
const IDS = ['lantern', 'snack', 'set'] as const;
type DemoStep = (typeof IDS)[number];

const STEPS: readonly WizardStep<DemoStep>[] = [
  { id: 'lantern', title: 'Pick a lantern', backLabel: 'to the start' },
  { id: 'snack', title: 'Pack a snack', backLabel: 'to the lantern' },
  { id: 'set', title: 'All set', backLabel: 'to the snack', next: 'Light the way' },
];

const BODY: Record<DemoStep, string[]> = {
  lantern: ['A brass one that hums.', 'A paper one that glows.', 'A cracked one, still warm.'],
  snack: ['Seed cake, two slices.', 'Dried berries, a handful.'],
  set: ['The lantern is lit and the snack is packed.', 'Nothing left but the road.'],
};

/** The content of a step: plain lines, so the wizard around it is what the page shows. */
function StepBody({ step }: { step: DemoStep }) {
  return (
    <ul class="ip-list">
      {BODY[step].map((line) => (
        <li class="ip-row" key={line}>
          <span class="pix">{line}</span>
        </li>
      ))}
    </ul>
  );
}

/** The footer of the demo: the reason when `blocked`, and on the last step a finish label and a badge. */
function DemoFooter({
  wizard,
  p,
  onFinish,
}: {
  wizard: Wizard<DemoStep>;
  p: Props;
  onFinish: () => void;
}) {
  const label = str(p, 'finish');
  return (
    <WizardFooter
      wizard={wizard}
      blocked={bool(p, 'blocked') ? `Pick something on "${wizard.current.title}" first.` : null}
      onFinish={onFinish}
      {...(wizard.last && label !== '' ? { label } : {})}
      badge={wizard.last && bool(p, 'badge') ? <CountBadge {...baitCount(3)} /> : undefined}
    />
  );
}

function useDemo(p: Props): { wizard: Wizard<DemoStep>; note: string; finish: () => void } {
  const [note, setNote] = useState('');
  const wizard = useWizard(STEPS, {
    initial: IDS.find((id) => id === str(p, 'step')) ?? 'lantern',
    ...(bool(p, 'exit')
      ? {
          onExit: () => {
            setNote('Back on the first step: onExit ran.');
          },
        }
      : {}),
  });
  return {
    wizard,
    note,
    finish: () => {
      setNote('Finish pressed.');
    },
  };
}

/** The three pieces in a plain box: no Drawer anywhere. */
function PlainDemo({ p }: { p: Props }) {
  const { wizard, note, finish } = useDemo(p);
  return (
    <div class="v3-phone short">
      <div class="v3-pad">
        <WizardView wizard={wizard}>
          <StepBody step={wizard.step} />
        </WizardView>
        <DemoFooter wizard={wizard} p={p} onFinish={finish} />
        <p class="muted" role="status">
          {note}
        </p>
      </div>
    </div>
  );
}

/** The same wizard in a Drawer: head and body in the content, the footer pinned in the footer slot. */
function DrawerDemo({ p }: { p: Props }) {
  const { wizard, note, finish } = useDemo(p);
  return (
    <div class="v3-phone">
      <Drawer
        open
        onClose={NOTHING}
        title="A little errand"
        footer={<DemoFooter wizard={wizard} p={p} onFinish={finish} />}
      >
        <WizardView wizard={wizard} focus>
          <StepBody step={wizard.step} />
        </WizardView>
        <p class="muted" role="status">
          {note}
        </p>
      </Drawer>
    </div>
  );
}

function WizardDemo({ p }: { p: Props }) {
  return str(p, 'where') === 'in a Drawer' ? <DrawerDemo p={p} /> : <PlainDemo p={p} />;
}

export const wizardEntries: Entry[] = [
  {
    name: 'WizardView',
    file: 'apps/activity/src/ui/Wizard.tsx',
    group: 'Controls',
    covers: ['WizardHead', 'WizardFooter'],
    description:
      "A step-by-step flow: a head with Back and the step title, the current step in the middle and a footer with the gold Next button that always says why it is disabled. The last step names its own finish button. It is usually placed inside a Drawer (head and step in the content, the footer pinned in the footer slot) and is what the place sheet's send flow is built on; the pieces work anywhere. Back and Escape go one step back.",
    controls: {
      where: { kind: 'select', options: ['plain', 'in a Drawer'] },
      step: { kind: 'select', options: IDS },
      blocked: { kind: 'toggle' },
      exit: { kind: 'toggle' },
      finish: { kind: 'text', maxLength: 24 },
      badge: { kind: 'toggle' },
    },
    defaults: {
      where: 'plain',
      step: 'lantern',
      blocked: false,
      exit: true,
      finish: '',
      badge: false,
    },
    presets: [
      { name: 'Plain, three steps (outside any drawer)', props: {} },
      { name: 'In a Drawer, footer pinned', props: { where: 'in a Drawer' } },
      { name: 'A blocked step shows its reason', props: { blocked: true } },
      {
        name: 'Last step: finish label and a badge',
        props: { step: 'set', finish: 'Set off', badge: true },
      },
      {
        name: 'In a Drawer, last step with a badge',
        props: { where: 'in a Drawer', step: 'set', finish: 'Set off', badge: true },
      },
      { name: 'No exit from the first step', props: { exit: false } },
    ],
    render: (p) => <WizardDemo key={JSON.stringify(p)} p={p} />,
  },
];
