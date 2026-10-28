import { writeFileSync } from 'node:fs';
import { CARDS } from './cards';
import { buildTalentSection } from './talentReport';
import { TEAM_BOSS_WIN_RATE } from './teamShare';
import { buildTeamShareSection } from './teamShareReport';
import { buildCatalogue, buildKeywords, buildReport } from './report';

/** `pnpm --filter @creatures/lab report [-- --quick] [--out <file>]`: writes the lab report; `--talents` prints only the talent section, `--team` only its team share. */
export function main(args: readonly string[]): number {
  const quick = args.includes('--quick');
  if (args.includes('--team')) {
    // Tuning loop: only the talents' share of the team's result.
    const t0 = Date.now();
    const section = buildTeamShareSection({
      cards: CARDS.filter((c) => c.id !== 'adapts'),
      quick,
      winRate: TEAM_BOSS_WIN_RATE,
    });
    console.log(section.md.join('\n'));
    if (args.includes('--json')) console.log(JSON.stringify(section.data));
    console.log(`team share in ${Math.round((Date.now() - t0) / 1000)} s`);
    return 0;
  }
  if (args.includes('--talents')) {
    // Tuning loop: only the talent section, to the console (nothing is written).
    const t0 = Date.now();
    const section = buildTalentSection({ cards: CARDS.filter((c) => c.id !== 'adapts'), quick });
    console.log(section.teamMd.join('\n'));
    console.log(section.md.slice(section.md.findIndex((l) => l.startsWith('| Role'))).join('\n'));
    console.log(`talent section in ${Math.round((Date.now() - t0) / 1000)} s`);
    return 0;
  }
  const i = args.indexOf('--out');
  const out = i >= 0 ? args[i + 1] : '../../docs/design/combat/lab-report.md';
  const t = Date.now();
  const report = buildReport({ quick });
  if (out) {
    writeFileSync(out, report.markdown + '\n');
    writeFileSync(out.replace(/\.md$/, '.json'), JSON.stringify(report.data, null, 1) + '\n');
    writeFileSync(out.replace(/lab-report\.md$/, 'knacks.md'), buildCatalogue() + '\n');
    writeFileSync(out.replace(/lab-report\.md$/, 'keywords.md'), buildKeywords() + '\n');
  }
  console.log(`lab report written to ${out} in ${Math.round((Date.now() - t) / 1000)} s`);
  return 0;
}
