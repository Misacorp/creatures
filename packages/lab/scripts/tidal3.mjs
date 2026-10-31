/* global console */
import { loadModule } from './load.mjs';
const { mod, close } = await loadModule('/src/tidalVariants.ts');
const stats = mod.casualStats();
console.log(JSON.stringify(stats, null, 1));
await close();
