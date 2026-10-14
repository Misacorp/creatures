import { ProgressTrack } from '../../ProgressTrack';
import type { TrackStep } from '../../progress-track';
import { XpBar } from '../../XpBar';
import { Bar } from '../../ui/Bar';
import { PipRow } from '../../ui/PipRow';
import { StreakTrack } from '../../ui/StreakTrack';
import { streakPips } from '../../dungeon-text';
import { BossHp, SegmentBar } from '../../ui/SegmentBar';
import { TimerBar } from '../../ui/TimerBar';
import { GLYPH_IDS } from '../data';
import { bool, num, str } from '../props';
import type { Entry } from '../types';

const TONES = ['gold', 'spark'] as const;

function tone(value: string): 'gold' | 'spark' {
  return value === 'spark' ? 'spark' : 'gold';
}

const bar: Entry = {
  name: 'Bar',
  file: 'apps/activity/src/ui/Bar.tsx',
  group: 'Bars',
  description:
    'A thin pixel progress bar with a gold fill; it shows how far along something is, for example a running expedition or a Workshop job.',
  controls: {
    value: { kind: 'number', min: 0, max: 200 },
    max: { kind: 'number', min: 1, max: 200 },
    tone: { kind: 'select', options: TONES },
    smooth: { kind: 'toggle' },
    label: { kind: 'text' },
  },
  defaults: { value: 50, max: 100, tone: 'gold', smooth: false, label: 'Craft progress' },
  presets: [
    { name: 'Empty', props: { value: 0 } },
    { name: 'Half', props: { value: 50 } },
    { name: 'Full', props: { value: 100 } },
    { name: 'Push-on (spark)', props: { value: 60, tone: 'spark' } },
  ],
  render: (p) => (
    <Bar
      value={num(p, 'value')}
      max={num(p, 'max')}
      label={str(p, 'label')}
      tone={tone(str(p, 'tone'))}
      smooth={bool(p, 'smooth')}
    />
  ),
};

const timerBar: Entry = {
  name: 'TimerBar',
  file: 'apps/activity/src/ui/TimerBar.tsx',
  group: 'Bars',
  description:
    'A bar that fills as a timer runs out, with the time left (or "Ready") written under it; used for expeditions and Workshop jobs.',
  controls: {
    percent: { kind: 'number', min: 0, max: 100 },
    ready: { kind: 'toggle' },
    tone: { kind: 'select', options: TONES },
    state: { kind: 'text' },
    label: { kind: 'text' },
  },
  defaults: {
    percent: 40,
    ready: false,
    tone: 'gold',
    state: '2 h 14 min left',
    label: 'Craft Wave Band: 40% done',
  },
  presets: [
    { name: 'Just started', props: { percent: 2, state: '5 h left' } },
    { name: 'Half', props: { percent: 50, state: '1 h 30 min left' } },
    { name: 'Ready', props: { percent: 100, ready: true, state: 'Ready to claim' } },
  ],
  render: (p) => (
    <TimerBar
      startedAt={0}
      endsAt={100_000}
      now={num(p, 'percent') * 1000}
      label={str(p, 'label')}
      state={str(p, 'state')}
      ready={bool(p, 'ready')}
      tone={tone(str(p, 'tone'))}
    />
  ),
};

const segmentBar: Entry = {
  name: 'SegmentBar',
  file: 'apps/activity/src/ui/SegmentBar.tsx',
  group: 'Bars',
  description:
    'A stepped HP bar: twenty red segments for a boss (optionally with its numbers written over the bar, as in the dungeon), five green ones under a creature in the fight; the segments that were just lost blink.',
  controls: {
    size: { kind: 'select', options: ['boss', 'unit'] },
    current: { kind: 'number', min: 0, max: 1000 },
    max: { kind: 'number', min: 1, max: 1000 },
    previous: { kind: 'number', min: -1, max: 1000 },
    label: { kind: 'text' },
    text: { kind: 'text' },
  },
  defaults: { size: 'boss', current: 600, max: 1000, previous: -1, label: 'Boss HP', text: '' },
  presets: [
    { name: 'Full', props: { current: 1000 } },
    { name: 'Half', props: { current: 500 } },
    { name: 'Last sliver', props: { current: 1 } },
    { name: 'Just hit', props: { current: 500, previous: 800 } },
    { name: 'Creature (unit)', props: { size: 'unit', current: 60, max: 100 } },
    { name: 'With the numbers on the bar', props: { current: 620, text: '620 / 1000' } },
  ],
  render: (p) => {
    const previous = num(p, 'previous');
    return (
      <SegmentBar
        size={str(p, 'size') === 'unit' ? 'unit' : 'boss'}
        current={num(p, 'current')}
        max={num(p, 'max')}
        {...(previous < 0 ? {} : { previous })}
        label={str(p, 'label')}
        {...(str(p, 'text') === '' ? {} : { text: str(p, 'text') })}
      />
    );
  },
};

const bossHp: Entry = {
  name: 'BossHp',
  file: 'apps/activity/src/ui/SegmentBar.tsx',
  group: 'Bars',
  description:
    "The boss's HP bar with the numbers written out under it; it sits on the boss card of the Raid tab and over the finale stage.",
  controls: {
    caption: { kind: 'text' },
    current: { kind: 'number', min: 0, max: 100000 },
    max: { kind: 'number', min: 1, max: 100000 },
    previous: { kind: 'number', min: -1, max: 100000 },
  },
  defaults: { caption: 'Boss HP this week', current: 6400, max: 10000, previous: -1 },
  presets: [
    { name: 'Full', props: { current: 10000 } },
    { name: 'Half', props: { current: 5000 } },
    { name: 'Nearly dead', props: { current: 120 } },
    { name: 'Just hit', props: { current: 5000, previous: 7000 } },
  ],
  render: (p) => {
    const previous = num(p, 'previous');
    return (
      <BossHp
        caption={str(p, 'caption')}
        current={num(p, 'current')}
        max={num(p, 'max')}
        {...(previous < 0 ? {} : { previous })}
      />
    );
  },
};

const xpBar: Entry = {
  name: 'XpBar',
  file: 'apps/activity/src/XpBar.tsx',
  group: 'Bars',
  description:
    'A thick XP bar with its words ("120 of 200 XP") drawn over the fill; it shows a creature\'s or explorer\'s progress to the next rank, with optional rank caps at both ends.',
  controls: {
    value: { kind: 'number', min: 0, max: 1000 },
    max: { kind: 'number', min: 0, max: 1000 },
    text: { kind: 'text' },
    startCap: { kind: 'text', maxLength: 12 },
    endCap: { kind: 'text', maxLength: 12 },
  },
  defaults: { value: 120, max: 200, text: '', startCap: 'Rank 2', endCap: 'Rank 3' },
  presets: [
    { name: 'Empty', props: { value: 0 } },
    { name: 'Half', props: { value: 100 } },
    { name: 'Nearly full', props: { value: 199 } },
    { name: 'Top rank', props: { value: 200, text: 'Top rank', endCap: '' } },
  ],
  render: (p) => (
    <XpBar
      value={num(p, 'value')}
      max={num(p, 'max')}
      label="Explorer XP"
      text={str(p, 'text') === '' ? undefined : str(p, 'text')}
      startCap={str(p, 'startCap') === '' ? undefined : str(p, 'startCap')}
      endCap={str(p, 'endCap') === '' ? undefined : str(p, 'endCap')}
    />
  ),
};

const pipRow: Entry = {
  name: 'PipRow',
  file: 'apps/activity/src/ui/PipRow.tsx',
  group: 'Bars',
  description:
    'A small row of square pips, some of them lit: steps of something, such as the dungeon streak or the five weeks of a raid season.',
  controls: {
    count: { kind: 'number', min: 1, max: 12 },
    lit: { kind: 'number', min: 0, max: 12 },
    size: { kind: 'select', options: ['sm', 'md'] },
    festivalPip: { kind: 'number', min: 0, max: 12 },
    spoken: { kind: 'toggle' },
  },
  defaults: { count: 7, lit: 3, size: 'md', festivalPip: 0, spoken: true },
  presets: [
    { name: 'Empty', props: { lit: 0 } },
    { name: 'Half', props: { lit: 3 } },
    { name: 'Full', props: { lit: 7 } },
    { name: 'Festival pip (6th)', props: { lit: 2, festivalPip: 6 } },
  ],
  render: (p) => {
    const festival = num(p, 'festivalPip');
    return (
      <PipRow
        count={num(p, 'count')}
        lit={num(p, 'lit')}
        size={str(p, 'size') === 'sm' ? 'sm' : 'md'}
        mark={(i) => (festival > 0 && i === festival - 1 ? 'fest' : undefined)}
        {...(bool(p, 'spoken')
          ? { label: `${String(num(p, 'lit'))} of ${String(num(p, 'count'))}` }
          : {})}
      />
    );
  },
};

const UNLOCK_ICONS = ['bait', 'flag', 'star', 'gem', 'lantern', 'map-scrap'].filter((id) =>
  GLYPH_IDS.includes(id),
);

function trackSteps(count: number): TrackStep[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    label: `Rank ${String(i + 1)}`,
    unlocks:
      i % 3 === 2
        ? []
        : [
            {
              icon: UNLOCK_ICONS[i % UNLOCK_ICONS.length] ?? 'unknown',
              text: `Unlock ${String(i + 1)}`,
            },
            ...(i % 2 === 0 ? [{ icon: 'star', text: 'Another thing' }] : []),
          ],
  }));
}

const progressTrack: Entry = {
  name: 'ProgressTrack',
  file: 'apps/activity/src/ProgressTrack.tsx',
  group: 'Bars',
  description:
    'A horizontal rank timeline showing the step before, the current step and the next one with what each unlocks; it is on the explorer profile and the dungeon start screen.',
  controls: {
    steps: { kind: 'number', min: 1, max: 8 },
    current: { kind: 'number', min: 0, max: 7 },
    edge: { kind: 'toggle' },
    between: { kind: 'number', min: 0, max: 8 },
    glossaryLabels: { kind: 'toggle' },
  },
  defaults: { steps: 6, current: 2, edge: false, between: 4, glossaryLabels: false },
  presets: [
    { name: 'First step', props: { current: 0 } },
    { name: 'Middle', props: { current: 2 } },
    { name: 'Last step (Max)', props: { current: 5 } },
    {
      name: 'Dungeon depth (edge to edge, pips between)',
      props: { steps: 2, current: 0, edge: true, between: 4, glossaryLabels: true },
    },
  ],
  render: (p) => (
    <ProgressTrack
      steps={trackSteps(num(p, 'steps'))}
      current={Math.min(num(p, 'current'), num(p, 'steps') - 1)}
      label="Explorer ranks"
      edge={bool(p, 'edge')}
      between={num(p, 'between')}
      {...(bool(p, 'glossaryLabels') ? { labelEntry: 'depth' } : {})}
    />
  ),
};

const streakTrack: Entry = {
  name: 'StreakTrack',
  file: 'apps/activity/src/ui/StreakTrack.tsx',
  group: 'Bars',
  description:
    'The daily dungeon streak after a run: a row of seven days lit up to today, with a small gift under each reward day (the 3rd and 7th).',
  controls: { streak: { kind: 'number', min: 0, max: 30 } },
  defaults: { streak: 3 },
  presets: [
    { name: 'No streak', props: { streak: 0 } },
    { name: 'Day 1', props: { streak: 1 } },
    { name: 'Day 3 (a reward)', props: { streak: 3 } },
    { name: 'Day 7 (the cycle is full)', props: { streak: 7 } },
    { name: 'Day 8 (starts again)', props: { streak: 8 } },
  ],
  render: (p) => (
    <StreakTrack
      pips={streakPips(num(p, 'streak'))}
      label={`Streak: day ${String(num(p, 'streak'))}`}
    />
  ),
};

export const barEntries: readonly Entry[] = [
  bar,
  timerBar,
  segmentBar,
  bossHp,
  xpBar,
  pipRow,
  progressTrack,
  streakTrack,
];
