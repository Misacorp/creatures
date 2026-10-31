/* global console */
import process from 'node:process';
import { loadModule } from './load.mjs';
const { mod, close } = await loadModule('/src/tidalVariants.ts');
const slot = Number(process.argv[2] ?? 6);
const f = (m) => `kill ${(m.kill * 100).toFixed(0)}% pot ${(m.pot * 100).toFixed(0)}%`;
const t = mod.committed;
const ten = Array(10).fill('c');
const V = {
  committed: [() => ({}), undefined],
  'no moves': [() => ({ moves: [] }), undefined],
  'no escalation': [() => ({ escalation: undefined }), undefined],
  'no slippery': [() => ({}), {}],
  'no cards (adapts, shake)': [() => ({ cards: [] }), undefined],
  'no shake': [() => ({ cards: ['adapts'] }), undefined],
  'no sweeps': [
    (s) => ({
      moves: s.moves.filter((m) => !['row', 'rows', 'columns', 'randomRow'].includes(m[5])),
    }),
    undefined,
  ],
  'no scatter': [(s) => ({ moves: s.moves.filter((m) => m[5] !== 'scatter') }), undefined],
  'no wind-up': [(s) => ({ moves: s.moves.filter((m) => !m[7]?.windUp) }), undefined],
  'no plain row': [
    () => ({ plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 2500 } }),
    undefined,
  ],
};
for (const [name, [patch, extra]] of Object.entries(V)) {
  mod.withTidal(
    patch,
    () => {
      const c = mod.measureClassic(slot, t);
      const m = mod.measureMixed(slot, t, {});
      const k = mod.measureMixed(slot, t, { order: ten });
      const p = mod.measurePrepared(slot, t);
      console.log(
        name.padEnd(26),
        'classic',
        f(c),
        '| mixed',
        f(m),
        '| 10 casual',
        f(k),
        '| prepared',
        f(p),
      );
    },
    extra,
  );
}
await close();
