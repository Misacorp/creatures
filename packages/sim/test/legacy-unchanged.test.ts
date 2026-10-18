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
 * Re-pinned again on 2026-10-18 (silence by row), on purpose: the raid bosses' silences (Bramble Bind,
 * Choking Vines) now silence the ends of each row instead of the two ends of the line, so Thornmother
 * weeks play out differently. Checked by setting both back to the whole line: the old fixture matched.
 * The fight input carrying the board's row sizes moved nothing here (the sim's rows are full).
 *
 * Re-pinned again on 2026-10-18 (dungeon paths, B-019), on purpose: the daily dungeon is a walk over the day's
 * map (3 to 6 fights, a camp, a pack that is kept whole at home and by half after a defeat, keepsakes, a boss
 * chest) instead of three rooms played at once, foes are weaker at depth 1 and steeper by depth, experience
 * is paid per fight cleared (35, not 60), and the run log gained its outcome, pack and fights. Re-pinned
 * once more when the branch took in the Teach change above, so every hash moved (the first player's top-3
 * power in the first pinned run is 431).
 *
 * Re-pinned again on 2026-10-18 (the Undercroft, B-020), on purpose: the sim draws the day's map with carved
 * doors (a free room on about a third of the maps, which the policy takes when its route passes it), a run
 * that beats the boss at depth 8 or over banks the chest, locks depth + 1 and may go down into the
 * Undercroft (rooms with twice the loot, epic fights, camps, a keeper and its chest), Market Day's scrap
 * is in the pack (halved after a defeat) and the full clear bonus goes to the row that beat the main boss.
 * The run log gained its Undercroft fields and two targets were added (96). Two foe numbers were tuned with
 * it (`RULES.dungeon.hpCurveBp` 300 to 340, `undercroft.depthBonus` 3 to 1). Bait earned and the pinned
 * runs without the dungeon are the same; the first player's top-3 power in the first pinned run moved
 * from 431 to 327 (a different path through the same levels and ribbons). Re-pinned once more when the
 * branch took in the raid's silence by row from main.
 *
 * Re-pinned again on 2026-10-18 (a fallen creature gets back up on the way down, B-021), on purpose: a
 * knocked-out creature recovers `RULES.dungeon.undercroft.reviveBp` of its max HP when the row goes down
 * into the Undercroft, so the policy (over 50% HP after catching its breath) sends about twice as many
 * rows down. Bait earned and the runs without a descent are the same; the first player's top-3 power in
 * the first pinned run moved from 343 to 380 and its raids won from 6 to 7, and 257 to 250 in the second.
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
