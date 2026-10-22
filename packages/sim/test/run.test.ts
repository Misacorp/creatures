import { describe, expect, it } from 'vitest';
import { buildReportJson, buildReportMarkdown } from '../src/report';
import { LONG_RUN_WEEKS } from '../src/ladder';
import {
  PITY_WEEKS,
  SWEEP_COUNTS,
  TRIP_LONG_WEEKS,
  defaultSettings,
  horizonsOf,
  snapshotWeeks,
} from '../src/run';
import { sharedTinyRun, tinyRun } from './helpers';

describe('simulation run', () => {
  it('gives an identical report.json and report.md for the same seed', () => {
    // The only test that builds two independent runs: the shared run and one more.
    const first = sharedTinyRun();
    const second = tinyRun();
    expect(buildReportJson(first)).toBe(buildReportJson(second));
    expect(buildReportMarkdown(first)).toBe(buildReportMarkdown(second));
  });

  it('keeps the headline numbers of the shipped income at tiny size', () => {
    // A "did the sim move" alarm, in readable numbers rather than a hash: seed `test`, TINY settings, the
    // shipped `allowance` income. Any rule, content or simulator change that touches the economy, the
    // raid or the dungeon will move some of these. If this fails, work out why the numbers moved, and
    // say so in the PR description (and in `docs/balance/log.md` for a balance change) before you
    // update them. They are never updated just to get green.
    // 2026-10-19: Lantern Light lengthens basic abilities too, and a Festival win gives a Lantern Night
    // piece the player lacks (a Hat or Scarf carries stats where the Charm did not): the long run wins
    // more finales (0.67 to 0.83, final rank 3 to 4), a dungeon run lasts a little longer (4.44 to 4.47
    // fights) and the creature ratio barely moves (1.2754 to 1.2781).
    // 2026-10-19 (later): every XP multiplier multiplies (the treat, each Boon and Omen, each gear line, each
    // trip bonus: `xp-boost.ts`) instead of the shares adding up. Explorer XP from a trip's milestones, twist,
    // goal and gear is now their product (a little more, so ranks and slots come a touch sooner), and a day
    // with a Boon and an Omen on experience multiplies them. The tiny run has only 4 raid weeks, so one flipped
    // week moves the raid rates by 0.25 (here two weeks flip, 0.75 to 0.25 for both); the start share, top share, creature ratio
    // and mean fights move by about 1% each. Experience per hour of a long trip (75.41) is unchanged.
    // 2026-10-19 (Serpentine): Cinder Wyrm now acts row by row instead of by Speed, on purpose, so its
    // fights play out differently and the dice of everything simulated after them shift. The raid
    // win rates stay at 0.25, the finale start share goes 0.4903 to 0.5073, the top share 0.2551 to
    // 0.2958, the creature ratio 1.2668 to 1.0673, a dungeon run 4.4643 to 4.3214 fights (home rate
    // 0.1339 to 0.1696) and the long run wins every finale (0.8333 to 1, final rank 4 to 5). The tiny
    // run is only 4 raid weeks and a few runs, so these are noise-sized moves from changed dice, not
    // a balance change.
    // 2026-10-19 (Mire): Mire species joined the catalogue, with the fifth element's gear: seven Mire bases
    // (more blueprints and drops to draw from), four Mire element lines in every item's line pool and a
    // fifth shard kind for a random shard. No creature is catchable yet (the Sunken Fen comes next), so
    // nothing but those draws changed: with Mire's bases, lines and shard kind left out of the draws every
    // number below came back to its old value exactly (checked before the re-pin). Moved: the raid phase 1
    // and finale win rates 0.25 to 0.75 (one flipped week in 4 each), finale start share 0.5073 to 0.4231,
    // top share 0.2958 to 0.2956, creature ratio 1.0673 to 1.0067, a dungeon run 4.3214 to 4.5268 fights
    // (home rate 0.1696 to 0.1339) and the long run 1 to 0.8333 finale wins (final rank 5 to 4). Noise-sized
    // moves from shifted dice in a tiny run, not a balance change; the Experience rate and the top level
    // did not move.
    // 2026-10-20 (Sunken Fen): the Mire content landed: Old Bogback is the fifth raid boss in the rotation
    // (weeks now cycle through five bosses, so the tiny run meets it where it met Storm Sovereign), the
    // dungeon has two more foes, a floor boss and the Muddy room (bigger pools, so every seeded draw of a
    // map shifts), Mudlump and Squelch are catchable in the Sunken Fen (a new place, a new journal set and
    // two more species in every catch draw) and every boss and foe has a low `baseSpd` (no effect: dodge is
    // off). Checked by taking Old Bogback out again: the raid phase 1 win rate (0.75 to 0.6667) and the
    // finale start share (0.4231 to 0.4322) are Old Bogback's, a week it plays differently; the rest moved
    // with the other changes: the finale win rate 0.75 to 0.5 (one more week flips in 4), top share 0.2956
    // to 0.2529, creature ratio 1.0067 to 1.1972, a dungeon run 4.5268 to 4.7232 fights (home rate 0.1339
    // to 0.1429). The long run (0.8333, final rank 4), the top level and the Experience rate did not move.
    // Noise-sized moves from changed pools and dice in a tiny run, not a balance change.
    // 2026-10-20 (dodge and debuff lines): Fleet, Light-footed, Riposte, Momentum and Slipstream joined the
    // item line pools, Clean coat, Heavy hand and Clinging started rolling on items, and three talents were
    // added (Slips Away, Long Strides, Soot on Its Paws). Dodge and effects are off, so none of it acts in a
    // fight; the new lines score 0 while their switch is off. Checked by emptying the new lines' weights and
    // taking the talents out again: every number came back to its old value exactly. So the moves are only
    // the larger pools and talent lists changing every seeded draw after them: the raid phase 1 win rate 0.6667
    // to 1 and the finale win rate 0.5 to 1 (two flipped weeks in 4), finale start share 0.4322 to 0.2549, top
    // share 0.2529 to 0.2934, creature ratio 1.1972 to 1.0065, a dungeon run 4.7232 to 4.6518 fights (home rate
    // 0.1429 to 0.125). The long run, the top level and the Experience rate did not move.
    // 2026-10-20 (dodge and status effects switched on, balance pass, B-023): dodge and effects are on, the
    // five bosses have new HP and Attack (30 to 33), and Light-footed's values doubled. A tiny run only has
    // 4 raid weeks, so the moves are dice shifts, not a measure: the raid win rates stay at 1, finale start
    // share 0.2549 to 0.2414, top share 0.2934 to 0.3162, creature ratio 1.0065 to 1.5963, a dungeon run
    // 4.6518 to 4.9464 fights (home rate, top level, Experience rate and the long run did not move).
    // 2026-10-20 (integration of the push-on timer, Workshop Refine and Recycle, expedition ticks, dungeon
    // rewards B-024, the economy targets B-025, the lantern bonus roll and the supply retunes): expedition
    // ticks pay more XP, scrap, gear and creatures (and no catch pity), and a full dungeon clear pays about
    // 1.5 crafts and 1 gear. Moved: Experience per hour of a long trip 75.4138 to 145.8809, casual top level
    // at week 4 10 to 14, a dungeon run 4.9464 to 5.7232 fights (home rate 0.125 to 0.0893), creature ratio
    // 1.5963 to 1.0154, finale start share 0.2414 to 0.2369, top share 0.3162 to 0.3159, the long run
    // 0.8333 to 1 finale wins (final rank 4 to 5). The raid win rates stay at 1 (4 raid weeks, dice shifts).
    // 2026-10-20 (B-026, raid retune for the tick economy, steeper fusion thresholds 1, 4, 9, 18, 34, early
    // gear levels lower): boss HP 20 to 40% up with a new rank curve, Attack 33 to 35, expedition gear at
    // item level 1 a rank and dungeon gear a level every 3 depths. A tiny run only has 4 raid weeks, so these
    // are dice shifts and the real effect of the raid retune (harder teams, fewer wins) shows in the quick
    // sim, not here. Moved: finale start share 0.2369 to 0.2968, top share 0.3159 to 0.3371, creature ratio
    // 1.0154 to 1.3609, Experience per hour of a long trip 145.8809 to 131.3262 (the trip's gear finds are
    // worth less), a dungeon run 5.7232 to 5.2946 fights (home rate 0.0893 to 0.0804), the long run 1 to
    // 0.8333 finale wins (final rank 5 to 4). The raid phase 1 and finale win rates stay at 1 (4 raid weeks).
    // 2026-10-21 (richer rank gifts): ranks 2 to 10 pay more Bait and scrap and, from rank 4, shards of the
    // explorer's element and from rank 5 a gear piece, so the sim's gear stream draws differently. A tiny run
    // is dice, not a measure: finale start share 0.2968 to 0.3250, top share 0.3371 to 0.3022, creature
    // ratio 1.3609 to 1.3887, a dungeon run 5.2946 to 5.2321 fights (home rate 0.0804 to 0.0893). The raid
    // win rates, the casual top level, Experience per hour and the long run did not move.
    // 2026-10-21 (long trips stay the efficient choice): satchel-great and lantern-great moved part of their
    // fixed bonus into their per-tick bonus, so trips with them draw differently. Dice at this size: finale
    // start share 0.3250 to 0.3084, top share 0.3022 to 0.3015, creature ratio 1.3887 to 1.3802, a dungeon
    // run 5.2321 to 5.1339 fights (home rate 0.0893 to 0.1071). Nothing else moved.
    // 2026-10-21 (B-028, dungeon experience per room): creatures earn per room they stood in (fights by kind,
    // caches, mystery rooms) instead of 35 a fight and 60 for a clear, so levels, and the dice after them,
    // move a little. Dice at this size: finale start share 0.3084 to 0.3044, top share 0.3015 to 0.309,
    // creature ratio 1.3802 to 1.3962, a dungeon run 5.1339 to 5.3036 fights (home rate 0.1071 to 0.1161).
    // Nothing else moved.
    // 2026-10-22 (B-030, three more common mystery rooms): the map shuffles the event list onto each map, so
    // every seeded map and the dice after it differ, and the Cursed Idol's curse is folded into later fights.
    // Dice at this size: the raid finale win rate 1 to 0.8333 (4 raid weeks: one lost finale), finale start
    // share 0.3044 to 0.3220, top share 0.309 to 0.3066, creature ratio 1.3962 to 1.2558, a dungeon run
    // 5.3036 to 5.0446 fights (home rate 0.1161 to 0.1071). The quick sim (B-030) is
    // the measure, not this.
    // 2026-10-22 (the dungeon's reflect split, B-031): Thorns and Molten Shell hit differently, so dungeon
    // fights, HP, experience and the dice after them move. Dice at this size: the raid finale win rate
    // 0.8333 to 1 (the lost finale is won), finale start share 0.322 to 0.2948, top share 0.3066 to 0.2977,
    // creature ratio 1.2558 to 1.3876, a dungeon run 5.0446 to 5.3214 fights (home rate 0.1071 to 0.1339).
    // The casual top level, Experience per hour and the long run's rank did not move.
    const m = sharedTinyRun().analysis.metrics;
    const headline: Record<string, number> = {
      'raid.typical.phase1ClearRate': 1,
      'raid.typical.finaleWinRate': 1,
      'raid.typical.finaleStartShare': 0.2948,
      'fair.topShareMedian': 0.2977,
      'choice.creatureRatioMax': 1.3876,
      'econ.casualTopLevelWeek4': 14,
      'exp.rate.long': 131.3262,
      'dungeon.meanFights': 5.3214,
      'dungeon.dailyHomeRate': 0.1339,
      'longrun.typical.finaleWinRate': 0.8333,
      'longrun.typicalFinalRank': 4,
    };
    for (const [id, expected] of Object.entries(headline)) {
      expect(m[id], id).toBeCloseTo(expected, 3);
    }
  });

  it('gives a different report for a different seed', () => {
    expect(buildReportJson(tinyRun({ seed: 'other' }))).not.toBe(buildReportJson(sharedTinyRun()));
  });

  it('plays the shipped horizons unless a test shortens them', () => {
    // `pnpm sim` and `pnpm sim:quick` carry no override, so their numbers cannot move.
    for (const mode of ['full', 'quick'] as const) {
      const settings = defaultSettings(mode);
      expect(settings.pityWeeks).toBeUndefined();
      expect(settings.longRunWeeks).toBeUndefined();
      expect(settings.tripLongWeeks).toBeUndefined();
      expect(settings.studyWeeks).toBeUndefined();
      expect(horizonsOf(settings)).toEqual({
        pityWeeks: 20,
        longRunWeeks: 30,
        tripLongWeeks: 60,
        gearWeeks: 30,
        creaturesWeeks: 30,
      });
    }
    expect([PITY_WEEKS, LONG_RUN_WEEKS, TRIP_LONG_WEEKS]).toEqual([20, 30, 60]);
    expect(horizonsOf({ ...defaultSettings('quick'), pityWeeks: 6, studyWeeks: 7 })).toMatchObject({
      pityWeeks: 6,
      longRunWeeks: 30,
      gearWeeks: 7,
      creaturesWeeks: 7,
    });
  });

  it('writes a report with the required sections and valid JSON', () => {
    const out = sharedTinyRun();
    const md = buildReportMarkdown(out);
    for (const heading of [
      '# Balance simulator report',
      '## Summary',
      '## Bosses',
      '## Raid curve by Boss Rank (journey servers)',
      '## Gear share of fight-scored power (journey servers)',
      '## Archetype progression',
      '## Long-running servers',
      '## Daily dungeon',
      '## Elements',
      '## Creatures',
      '## Outliers',
      '## Example fight',
    ]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain('`test`');
    expect(md).toMatch(/[✅❌—]/u);
    const json = JSON.parse(buildReportJson(out)) as {
      settings: { seed: string };
      targets: unknown[];
    };
    expect(json.settings.seed).toBe('test');
    expect(json.targets).toHaveLength(96);
  });

  it('marks metrics it did not measure as not measured', () => {
    // 3 weeks: no week-4 or week-6 data, so those economy targets cannot be measured.
    const out = tinyRun({ weeks: 3 });
    const byId = new Map(out.evaluation.map((t) => [t.id, t]));
    expect(byId.get('econ-casual-level-15')?.status).toBe('not_measured');
    expect(byId.get('econ-daily-species')?.status).toBe('not_measured');
    expect(byId.get('econ-power-ratio')?.status).toBe('not_measured');
    expect(byId.get('raid-finale-15')?.status).toBe('not_measured');
  });

  it('rejects a bad week count', () => {
    expect(() => tinyRun({ weeks: 0 })).toThrow(RangeError);
  });

  it('snapshots at weeks 4 and 8, or the last week for short runs', () => {
    expect(snapshotWeeks(12)).toEqual([4, 8]);
    expect(snapshotWeeks(5)).toEqual([4]);
    expect(snapshotWeeks(3)).toEqual([3]);
    expect(SWEEP_COUNTS).toEqual([1, 5, 10, 15]);
  });
});
