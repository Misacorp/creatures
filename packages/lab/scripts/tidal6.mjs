/* global console */
import process from 'node:process';
import { loadModule } from './load.mjs';
const { mod, close } = await loadModule('/src/tidalVariants.ts');
const cards = await mod.cardsModule();
const [card, v, slotArg] = [process.argv[2], Number(process.argv[3] ?? 0), process.argv[4]];
const slots = slotArg ? [Number(slotArg)] : [6, 11];
if (card === 'breakwater') cards.WARD_BOOST_BP.v = v;
if (card === 'tide-guard') cards.COLUMN_GUARD_CUT_BP.v = v;
const f = (m) => `kill ${(m.kill * 100).toFixed(0)}% pot ${(m.pot * 100).toFixed(0)}%`;
const t = mod.committed;
const extra = card === 'none' ? undefined : { 6: ['slippery', card] , 8: ['lucky-strike'] };
for (const slot of slots) {
  mod.withTidal(
    () => ({}),
    () => {
      console.log(`${card} ${v} slot ${slot}:`,
        'classic', f(mod.measureClassic(slot, t)),
        '| prepared', f(mod.measurePrepared(slot, t)),
        '| mixed A1', f(mod.measureMixed(slot, t, {}, 40, 2, undefined, 0)),
        '| mixed A2', f(mod.measureMixed(slot, t, {}, 40, 2, undefined, 1)));
    },
    extra,
  );
}
await close();
