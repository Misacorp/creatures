/* global console */
import process from 'node:process';
import { loadModule } from './load.mjs';
const { mod, close } = await loadModule('/src/tidalVariants.ts');
const only = process.argv[2];
const f = (m) => `kill ${(m.kill * 100).toFixed(0)}% pot ${(m.pot * 100).toFixed(0)}%`;
const run = (label, fn) => console.log(label.padEnd(44), f(fn()));
const t = mod.committed;
const slots = only ? [Number(only)] : [6, 11];
for (const slot of slots) {
  console.log('== slot', slot);
  run('classic (4 cols)', () => mod.measureClassic(slot, t));
  run('mixed (path)', () => mod.measureMixed(slot, t, {}));
  const C = (c) => ({ casual: { ...mod.PATH_CASUAL, ...c } });
  const ten = Array(10).fill('c');
  const four = Array(4).fill('c');
  for (const [name, order] of [
    ['4 casual', four],
    ['10 casual', ten],
    ['mixed', undefined],
  ]) {
    const o = order ? { order } : {};
    run(`${name} path`, () => mod.measureMixed(slot, t, { ...o }));
    run(`${name} trio (S+P+G random species, no knack)`, () =>
      mod.measureMixed(slot, t, { ...o, ...C({ compose: 'trio' }) }),
    );
    run(`${name} trio + own knacks`, () =>
      mod.measureMixed(slot, t, { ...o, ...C({ compose: 'trio', knack: 'own' }) }),
    );
    run(`${name} trio + daily levels`, () =>
      mod.measureMixed(slot, t, { ...o, ...C({ compose: 'trio', roster: 'daily' }) }),
    );
    run(`${name} trio + knacks + daily`, () =>
      mod.measureMixed(slot, t, { ...o, ...C({ compose: 'trio', knack: 'own', roster: 'daily' }) }),
    );
  }
  run('classic trio x4, no knack', () => mod.measureClassicWide(slot, t, 4, undefined, 20, false));
  run('classic trio x10 cols (knacks)', () => mod.measureClassicWide(slot, t, 10));
  run('classic trio x10 cols (no knacks)', () =>
    mod.measureClassicWide(slot, t, 10, undefined, 20, false),
  );
}
await close();
