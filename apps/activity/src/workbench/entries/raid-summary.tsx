import { RaidSummaryCard } from '../../RaidSummaryCard';
import { SUMMARY_CASES, summaryCase } from '../raid-summary-data';
import { bool, str } from '../props';
import type { Entry } from '../types';

const CASE_NAMES = SUMMARY_CASES.map((s) => s.label);

const raidSummaryCard: Entry = {
  name: 'RaidSummaryCard',
  file: 'apps/activity/src/RaidSummaryCard.tsx',
  group: 'Loot & reveals',
  description:
    'The raid summary: the card after a raid stage and after the Sunday finale. The title with its Cleared badge on one line, the boss and how it ended (its HP bar, your place, and its attack order and moves as icons to tap), every player in a scoreboard with column headings and your row marked, three highlights, your rewards as count badges, and the older lists folded under More numbers. Shown here with sample servers of 11, 6 and 3 players; the boss and its moves come from the content.',
  controls: {
    sample: { kind: 'select', options: CASE_NAMES },
    mode: { kind: 'select', options: ['Finale card', 'In the Results list'] },
    detailsOpen: { kind: 'toggle' },
  },
  defaults: { sample: CASE_NAMES[0] ?? '', mode: 'Finale card', detailsOpen: false },
  presets: [
    ...SUMMARY_CASES.map((s) => ({ name: s.label, props: { sample: s.label } })),
    {
      name: 'In the Results list (phase 2, 6 players)',
      props: { sample: 'Phase 2 cleared, 6 players', mode: 'In the Results list' },
    },
    {
      name: 'Every folded table open',
      props: { sample: 'Finale cleared, 11 players', detailsOpen: true },
    },
  ],
  render: (p) => (
    <RaidSummaryCard
      input={summaryCase(str(p, 'sample')).input}
      mode={str(p, 'mode') === 'In the Results list' ? 'result' : 'reveal'}
      id="wb-raid-summary"
      onReplay={() => undefined}
      onDismiss={str(p, 'mode') === 'In the Results list' ? undefined : () => undefined}
      detailsOpen={bool(p, 'detailsOpen')}
    />
  ),
};

export const raidSummaryEntries: readonly Entry[] = [raidSummaryCard];
