import { RULES, content } from '@creatures/game';

/**
 * Tuning overrides for the simulator: change a number in `RULES` or a boss's base HP for the length
 * of a run, to try a setting without editing the files. `raid.scaling.rankStepBp=3000` and
 * `boss.thornmother.baseHp=4300` are examples. Only existing integer numbers can be overridden.
 * The shipped values are not touched on disk; the caller restores them with the returned function.
 */
export function applyOverrides(spec: string): () => void {
  const undo: (() => void)[] = [];
  for (const part of spec.split(',').filter((x) => x.trim() !== '')) {
    const m = /^([A-Za-z0-9_.-]+)=(-?[0-9]+)$/.exec(part.trim());
    if (m === null) throw new Error(`cannot read "${part}" (expected path=integer)`);
    const path = (m[1] as string).split('.');
    const value = Number(m[2]);
    const key = path.pop() as string;
    let target: unknown;
    if (path[0] === 'boss' && path.length === 2) {
      target = content.bosses.find((b) => b.id === path[1]);
    } else {
      target = path.reduce<unknown>(
        (obj, k) =>
          typeof obj === 'object' && obj !== null ? (obj as Record<string, unknown>)[k] : undefined,
        RULES,
      );
    }
    if (typeof target !== 'object' || target === null) throw new Error(`no such setting "${m[1]}"`);
    const record = target as Record<string, unknown>;
    const old = record[key];
    if (typeof old !== 'number') throw new Error(`"${m[1]}" is not a number`);
    record[key] = value;
    undo.push(() => {
      record[key] = old;
    });
  }
  return () => {
    for (const f of undo.reverse()) f();
  };
}
