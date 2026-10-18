import { describe, expect, it } from 'vitest';
import { FIXTURE_SETS } from '../fixture-sets';

/**
 * Plays every fixture set of `test/fixture-sets.ts` and prints one `FIXTURE <json>` line per set. It
 * asserts nothing about the fixtures; `scripts/capture-fixtures.mjs` (`pnpm fixtures:capture`) runs it
 * with `vitest.capture.config.ts` and turns the lines into the files of `apps/activity/src/fixtures`.
 * It is not part of `pnpm test`. One test per set, named `capture <set>`, so the script can run one set.
 */
describe('capture the fixture sets', () => {
  for (const set of FIXTURE_SETS) {
    it(`capture ${set.name}`, async () => {
      const captured = await set.run();
      const named = new Set([...Object.keys(set.files.responses), ...(set.files.skipped ?? [])]);
      // A response nobody names would be lost silently, and a named one the scenario no longer
      // makes would leave a stale file.
      expect(Object.keys(captured.responses).filter((k) => !named.has(k))).toEqual([]);
      expect(Object.keys(set.files.responses).filter((k) => !(k in captured.responses))).toEqual(
        [],
      );
      const line = { set: set.name, nibble: set.nibble, files: set.files, captured };
      console.log('FIXTURE ' + JSON.stringify(line));
    });
  }
});
