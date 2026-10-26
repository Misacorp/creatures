import { writeFileSync } from 'node:fs';
import { buildCatalogue, buildKeywords, buildReport } from './report';

/** `pnpm --filter @creatures/lab report [-- --quick] [--out <file>]`: writes the lab report. */
export function main(args: readonly string[]): number {
  const quick = args.includes('--quick');
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
