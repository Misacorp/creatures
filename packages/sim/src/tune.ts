import { RULES, content, dungeonContent } from '@creatures/game';

/**
 * Walks `keys` from `start`; an array is indexed by a whole number or searched by `id`, so
 * `gimmicks.great-wave.then.power` and `phases.phase2.clearAtLossBp` work.
 */
function walk(start: unknown, keys: readonly string[]): unknown {
  return keys.reduce<unknown>((obj, k) => {
    if (Array.isArray(obj)) {
      return /^[0-9]+$/.test(k)
        ? (obj as unknown[])[Number(k)]
        : obj.find((x: unknown) => (x as { id?: unknown }).id === k);
    }
    return typeof obj === 'object' && obj !== null
      ? (obj as Record<string, unknown>)[k]
      : undefined;
  }, start);
}

/**
 * Tuning overrides for the simulator: change a number in `RULES`, a boss, a dungeon foe or a creature
 * for the length of a run, to try a setting without editing the files. `raid.curve.ranks.3.hpBp=21000`,
 * `boss.thornmother.baseHp=4300`, `boss.cinder-wyrm.gimmicks.cinder-fall.power=9000` (arrays are
 * searched by id; a charged move's own numbers are under `then`), `foe.ember-mite.baseHp=200` and
 * `creature.sproutle.baseStats.atk=24` are examples. Only existing integer numbers can be overridden.
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
    if (path[0] === 'boss' && path.length >= 2) {
      target = walk(
        content.bosses.find((b) => b.id === path[1]),
        path.slice(2),
      );
    } else if (path[0] === 'foe' && path.length >= 2) {
      target = walk(
        dungeonContent.foes.find((f) => f.id === path[1]),
        path.slice(2),
      );
    } else if (path[0] === 'creature' && path.length >= 2) {
      // `creature.sproutle.baseStats.atk=24`: a number inside one creature's content.
      target = walk(
        content.creatures.find((c) => c.id === path[1]),
        path.slice(2),
      );
    } else {
      target = walk(RULES, path);
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
