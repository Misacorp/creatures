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
 *
 * Re-pinned again on 2026-10-17 (B-018, items carry base stats), on purpose: a Hat and a Scarf have fixed
 * base stats (Attack and HP, some a crit stat) instead of percentage implicits, better bases unlock at item
 * levels 5 and 10, local lines change an item's own stats, and Festival gear is a normal-level,
 * normal-rarity piece with a unique line. The archetypes' team power moved a little (first player's
 * top-3 power 376 to 361 and 198 to 261 in two of the pinned runs); Bait earned and the runs without gear are the same.
 *
 * Re-pinned again on 2026-10-17 (Boons and Omens, B-017), on purpose: every day now has a Boon and, from Boss
 * Rank 3, an Omen, drawn from a seeded stream of their own and applied to the raid stage, the dungeon runs,
 * the trips and the Workshop jobs of the day. The draws touch no other stream, so the same players check in
 * and the same dice are thrown; what moved is what the days do (a trip's time, creature experience, the
 * fights). Weather off (`weather: false`) plays the economy as it was.
 *
 * Re-pinned again on 2026-10-17 (Teach goes to the Talent Book), on purpose: a talent taught from a
 * duplicate no longer takes a slot, it waits in the creature's book, and the sim player slots it for Bait:
 * into an empty slot, or in place of a weaker slotted talent (as a player reading the book would). The
 * first player's top-3 power and raids won are what they were before the change (333, 361, 261, 203);
 * Bait earned is the same, and some Bait now goes to slotting.
 *
 * Re-pinned again on 2026-10-18 (branch evolutions: Sunfawn and Ohmouse), on purpose: a simulated player
 * whose line grows two ways takes the form whose role the rest of the team lacks (`pickBranch`), so a
 * Sproutle on a team that already has a Guard becomes a Sunfawn (a Support with less HP and more Speed)
 * instead of a Thornbuck. Adding the species changes nothing by itself (with the first form always
 * taken, all five digests were as before). Bait earned is the same. The first player's top-3 power and
 * raids won moved: 333 to 378 and 7 to 6 raids (default-8w), 361 to 349 and 5 to 4 (five-nogear), 261 to
 * 197 and 5 to 4 (behaviour), 203 to 200 (fifteen-nodungeon). Nothing was tuned: the scalars are as they were.
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
