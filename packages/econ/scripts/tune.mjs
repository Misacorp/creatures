// Runs the economy lab's tuner (src/tuneCli.ts): `pnpm --filter @creatures/econ tune -- --dials projectSize,scoutScrap`.
// It proposes dial values; it never edits rules.ts.
/* global console */
import process from 'node:process';
import { loadModule } from './load.mjs';

let loaded;
let code;
try {
  loaded = await loadModule('/src/tuneCli.ts');
  code = loaded.mod.main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  code = 1;
} finally {
  await loaded?.close();
}
process.exitCode = code;
