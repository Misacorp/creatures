/* global console */
import { loadModule } from './load.mjs';
const { mod, close } = await loadModule('/src/tidalVariants.ts');
const own = await mod.ownModule();
const track = await mod.trackModule();
for (const [slot, week] of [
  [6, 7],
  [11, 13],
]) {
  const answers = track.slotAnswersOf(slot);
  answers.forEach((a, k) =>
    console.log(
      `slot ${slot} week ${week} answer ${k + 1}: ownable ${own.lineOwnable(a.line, week)}`,
    ),
  );
}
await close();
