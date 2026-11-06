// Prints the measurement of the five combat v2 three-piece set effects (src/setMeasure.ts): `node scripts/sets.mjs [seeds]`.
// Not part of the default report.
/* global console */
import process from 'node:process';
import { loadModule } from './load.mjs';

const seeds = Number(process.argv[2] ?? 24);
const loaded = await loadModule('/src/setMeasure.ts');
try {
  if (process.argv[3]) loaded.mod.setBoss(Number(process.argv[3]), Number(process.argv[4] ?? 1));
  console.log(loaded.mod.setsReport(seeds).join('\n'));
} finally {
  await loaded.close();
}
