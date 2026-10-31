/* global console */
import process from 'node:process';
import { loadModule } from './load.mjs';
const { mod, close } = await loadModule('/src/tidalVariants.ts');
const f = (m) => `kill ${(m.kill * 100).toFixed(0)}% pot ${(m.pot * 100).toFixed(0)}%`;
const t = mod.committed;
const which = process.argv[2] ?? 'all';
const swap = (s, ids, to) => s.moves.map((m) => (ids.includes(m[0]) ? to(m) : m));
const V = {
  'base': () => ({}),
  // The two big Wind-up sweeps become one big hit on the strongest (a Wind-up single), several per 4 columns.
  'sweeps->big hits on strongest (x2.5 power)': (s) => ({
    moves: swap(s, ['spring-tide', 'great-wave'], (m) => [m[0], m[1], m[2], m[3], 'strongest', 'single', Math.round(m[6] * 2.5), { windUp: true, anchors: 1, perColumns: 4 }]),
  }),
  'sweeps->big hits on strongest (x1.5 power)': (s) => ({
    moves: swap(s, ['spring-tide', 'great-wave'], (m) => [m[0], m[1], m[2], m[3], 'strongest', 'single', Math.round(m[6] * 1.5), { windUp: true, anchors: 1, perColumns: 4 }]),
  }),
  'all rows->line3 (3 wide) same power': (s) => ({
    moves: swap(s, ['spring-tide', 'great-wave', 'undertow'], (m) => [m[0], m[1], m[2], m[3], m[4], 'line3', m[6], { ...(m[7] ?? {}), anchors: 1, perColumns: 4 }]),
  }),
};
for (const [name, patch] of Object.entries(V)) {
  if (which !== 'all' && !name.startsWith(which)) continue;
  for (const slot of [6, 11]) {
    mod.withTidal(patch, () => {
      console.log(name.padEnd(46), `slot ${slot}`, 'classic', f(mod.measureClassic(slot, t)), '| prep', f(mod.measurePrepared(slot, t)), '| mixed A1', f(mod.measureMixed(slot, t, {}, 40, 2, undefined, 0)), '| A2', f(mod.measureMixed(slot, t, {}, 40, 2, undefined, 1)));
    });
  }
}
await close();
