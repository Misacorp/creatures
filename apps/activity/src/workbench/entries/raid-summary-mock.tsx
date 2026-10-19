import { RaidSummaryMock, type SummaryVariant } from '../../RaidSummaryMock';
import '../raid-summary-mock.css';
import { SUMMARY_CASES, summaryCase } from '../raid-summary-data';
import { bool, str } from '../props';
import type { Entry } from '../types';

/** The variants by the name the page offers. */
const VARIANTS: Readonly<Record<string, SummaryVariant>> = {
  'Now (today)': 'now',
  'A: Scoreboard first': 'A',
  'B: Hero moment': 'B',
  'C: Your raid': 'C',
  'D: Podium': 'D',
};
const VARIANT_NAMES = Object.keys(VARIANTS);
const CASE_NAMES = SUMMARY_CASES.map((s) => s.label);

const raidSummaryMock: Entry = {
  name: 'RaidSummaryMock',
  file: 'apps/activity/src/RaidSummaryMock.tsx',
  group: 'Loot & reveals',
  description:
    "Mock-ups of the raid summary (the result card after a raid stage and after the Sunday finale) for Misa to choose from: today's card, then a scoreboard first, one big moment, your own raid first, and a podium. Workbench only: the game still draws the old card. All of them are fed the same sample data and show the same rewards.",
  controls: {
    variant: { kind: 'select', options: VARIANT_NAMES },
    sample: { kind: 'select', options: CASE_NAMES },
    detailsOpen: { kind: 'toggle' },
  },
  defaults: {
    variant: VARIANT_NAMES[1] ?? 'Now (today)',
    sample: CASE_NAMES[0] ?? '',
    detailsOpen: false,
  },
  presets: VARIANT_NAMES.flatMap((variant) =>
    SUMMARY_CASES.map((s) => ({
      name: `${variant}: ${s.label}`,
      props: { variant, sample: s.label },
    })),
  ),
  render: (p) => (
    <RaidSummaryMock
      variant={VARIANTS[str(p, 'variant')] ?? 'now'}
      input={summaryCase(str(p, 'sample')).input}
      detailsOpen={bool(p, 'detailsOpen')}
    />
  ),
};

export const raidSummaryEntries: readonly Entry[] = [raidSummaryMock];
