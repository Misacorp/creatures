import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { legacyDigest, type DigestEntry } from './legacy-digest';

/**
 * Today's archetypes (casual, daily, top earner, newcomer) with today's income must play out exactly
 * as they did before player profiles and income models existed: same dice, same decisions, same
 * numbers. The fixture was first taken from commit 3f31620; if this test fails, a change moved the
 * existing `pnpm sim` results.
 *
 * Re-pinned on 2026-10-16 (B-010, the raid curve), on purpose: the pinned runs raid at the Boss Rank
 * ladder, and the curve legitimately changes what those weeks do. Every server now starts at rank 1
 * (it was placed by its creatures' levels), the boss's HP, Attack, plain attacks and crit chance
 * come from the per-rank table (`RULES.raid.curve`) instead of 1.4^(rank-1), and a won finale pays
 * the new reward slot (a blueprint or pre-upgraded gear) and the jackpot Essence the worker pays. The profiles, income models and journey
 * recorder still change nothing: only the raid rules moved. The headline numbers in the fixture show
 * the shift (more finales won, more gear and blueprints).
 *
 * Re-pinned again on 2026-10-16 (B-011, the supplies rework), on purpose: supplies cannot be bought
 * (no Bait goes to them, so the archetypes train more), the dungeon drops a supply and a scrap on
 * every run, the workshop makes supplies and the recipes are cheaper.
 *
 * Re-pinned again on 2026-10-16 (Gear A), on purpose: items are Hat, Scarf and Charm with item levels,
 * tiers and lines, worn under the wear rule; upgrades, Improve and enchants are gone (gear no longer
 * costs Essence); the week records lost their upgrade fields; and 12 gear share targets were added.
 *
 * Re-pinned again on 2026-10-16 (Gear B, the crafting loop), on purpose: the workshop aims crafts with a
 * Reach (Essence, shards, glimmer) and takes unneeded items apart in dismantle jobs (a creature, a
 * slot, time; the refund is a range with Essence) instead of instantly, repeat blueprints add
 * well-thumbed marks, and the week records gained Reach and dismantle counters. Then once more the same day
 * (B-015, no free lottery): a craft's scrap grows with the item level, a dismantle returns under half of it,
 * and a Reach takes no extra shards.
 *
 * Re-pinned again on 2026-10-16 (Creatures A, B-014), on purpose: a roll on a trip brings a creature
 * only with a chance (the rest bring a small find), a duplicate is answered with Teach, Fuse or Release
 * instead of fusing by itself or turning into Bait, every creature carries a talent that adds to its
 * stats and its sheet, lures cost Bait, the dungeon no longer drops lures and the dupe shield starts at
 * a streak of 3. The first player's Bait earned is the same; their team power is lower (fewer
 * creatures, so fewer fusions, and no duplicate Bait).
 *
 * Re-pinned again on 2026-10-17 (Creatures B, B-016), on purpose: creatures level up from what they do
 * (trips, the dungeon, raid stages, Workshop jobs; treats double it) and wait at levels 10 and 20 for a
 * ribbon, Bait no longer buys levels, and the new-species pity forces a creature or a new species on
 * long dry streaks of trips. The archetypes' levels, so their team power and the raid weeks, moved.
 */
describe('today is unchanged', () => {
  const expected = JSON.parse(
    readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'legacy-digest.json'),
      'utf8',
    ),
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
