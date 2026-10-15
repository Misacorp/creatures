import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { legacyDigest, type DigestEntry } from './legacy-digest';

/**
 * Today's archetypes (casual, daily, top earner, newcomer) with today's income must play out exactly
 * as they did before player profiles and income models existed: same dice, same decisions, same
 * numbers. The fixture was taken from commit 3f31620; if this test fails, a change moved the
 * existing `pnpm sim` results.
 */
describe('today is unchanged', () => {
  const expected = JSON.parse(
    readFileSync(new URL('./fixtures/legacy-digest.json', import.meta.url).pathname, 'utf8'),
  ) as Record<string, DigestEntry>;
  let actual: Record<string, DigestEntry> = {};
  beforeAll(() => {
    actual = legacyDigest();
  }, 120_000);

  for (const id of Object.keys(expected)) {
    it(`${id}: same numbers as before`, () => {
      expect(actual[id]).toEqual(expected[id]);
    });
  }
});
