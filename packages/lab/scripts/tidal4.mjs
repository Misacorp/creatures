/* global console */
import process from 'node:process';
import { loadModule } from './load.mjs';
const { mod, close } = await loadModule('/src/tidalVariants.ts');
const slot = Number(process.argv[2] ?? 6);
const stats = mod.koByKind(slot, mod.committed, {});
console.log(JSON.stringify(stats, null, 1));
await close();
