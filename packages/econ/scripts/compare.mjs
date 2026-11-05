// Compares a live report (the `valley-report` dev route's answer, src/compare.ts) with the lab: `pnpm --filter @creatures/econ compare <live-report.json>`.
/* global console */
import process from 'node:process';
import { loadModule } from './load.mjs';

let loaded;
let code;
try {
  loaded = await loadModule('/src/compareCli.ts');
  code = loaded.mod.main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  code = 2;
} finally {
  await loaded?.close();
}
process.exitCode = code;
