/* global console */
import process from 'node:process';
import { loadModule } from './load.mjs';
const { mod, close } = await loadModule('/src/tidalVariants.ts');
const slot = Number(process.argv[2] ?? 6);
const row = Number(process.argv[3] ?? 1500);
const beside = Number(process.argv[4] ?? 2500);
mod.patchKnack('keep-the-heat-in', { rowAreaCutBp: row });
mod.patchKnack('living-shelter', { besideAreaCutBp: beside });
const f = (m) => `kill ${(m.kill * 100).toFixed(0)}% pot ${(m.pot * 100).toFixed(0)}%`;
const t = mod.committed;
console.log(`slot ${slot} row ward ${row} beside ${beside}`);
console.log(' classic', f(mod.measureClassic(slot, t)), '| prepared (answer 1 line)', f(mod.measurePrepared(slot, t)));
console.log(' mixed answer 1 (Reach)', f(mod.measureMixed(slot, t, {}, 40, 2, undefined, 0)));
console.log(' mixed answer 2 (Row Ward)', f(mod.measureMixed(slot, t, {}, 40, 2, undefined, 1)));
await close();
