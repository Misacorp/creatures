import { content } from '@creatures/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LeetSource } from '../src/leet';
import {
  eligiblePlayerIds,
  leaveParty,
  partyCountFor,
  playerPower,
  snakeDraft,
} from '../src/raid-roster';
import { eventTimes, weekIdFor, weekIndex } from '../src/raid-schedule';
import { T0, USER_ID } from './helpers';
import { DAY, HELSINKI, HOUR, MINUTE, W02, count, rows, runRaid, seedPlayer } from './raid-helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

const partySizes = (sql: SqlStorage, week = W02.id): number[] =>
  rows<{ n: number }>(
    sql,
    'SELECT COUNT(*) AS n FROM raid_party_members WHERE week_id = ? GROUP BY party ORDER BY party',
    week,
  ).map((r) => r.n);

describe('snakeDraft', () => {
  it('deals the strongest first, then reverses each round', () => {
    const players = [10, 9, 8, 7, 6, 5].map((power, i) => ({ userId: `u${i}`, power }));
    expect(snakeDraft(players, 2)).toEqual([
      ['u0', 'u3', 'u4'], // 10, 7, 6
      ['u1', 'u2', 'u5'], // 9, 8, 5
    ]);
  });

  it('sorts by power whatever the input order, and breaks ties by id', () => {
    const players = [
      { userId: 'b', power: 5 },
      { userId: 'a', power: 5 },
      { userId: 'c', power: 9 },
    ];
    expect(snakeDraft(players, 3)).toEqual([['c'], ['a'], ['b']]);
    expect(snakeDraft([...players].reverse(), 3)).toEqual([['c'], ['a'], ['b']]);
  });

  it('keeps party sizes within one of each other and the power sums close', () => {
    const players = Array.from({ length: 31 }, (_, i) => ({ userId: `u${i}`, power: 300 - i * 7 }));
    const groups = snakeDraft(players, 3);
    expect(groups.map((g) => g.length).sort()).toEqual([10, 10, 11]);
    const power = new Map(players.map((p) => [p.userId, p.power]));
    const sums = groups.map((g) => g.reduce((t, id) => t + (power.get(id) ?? 0), 0));
    expect(Math.max(...sums) - Math.min(...sums)).toBeLessThanOrEqual(300);
    // Everyone appears exactly once.
    expect(groups.flat().sort()).toEqual(players.map((p) => p.userId).sort());
  });

  it('needs at least one party', () => {
    expect(() => snakeDraft([], 0)).toThrow();
    expect(partyCountFor(0)).toBe(0);
    expect(partyCountFor(15)).toBe(1);
    expect(partyCountFor(16)).toBe(2);
    expect(partyCountFor(30)).toBe(2);
    expect(partyCountFor(31)).toBe(3);
  });
});

describe('week creation', () => {
  it('creates the current week lazily on a raid read, with the rotating boss', async () => {
    await runRaid((ctx) => {
      const player = seedPlayer(ctx, 1);
      expect(count(ctx.sql, 'raid_weeks')).toBe(0);
      const view = ctx.core.raid.view(player.id, HELSINKI);
      expect(view.weekId).toBe('2027-W02');
      expect(view.status).toBe('open');
      const expectedBoss = content.bosses[weekIndex('2027-W02') % content.bosses.length];
      expect(view.boss.id).toBe(expectedBoss?.id);
      expect(rows(ctx.sql, 'SELECT week_id, boss_id, status FROM raid_weeks')).toEqual([
        { week_id: '2027-W02', boss_id: expectedBoss?.id, status: 'open' },
      ]);
      // Reading again does not create a second week or party.
      ctx.core.raid.view(player.id, HELSINKI);
      expect(count(ctx.sql, 'raid_weeks')).toBe(1);
      expect(count(ctx.sql, 'raid_parties')).toBe(1);
    });
  });

  it('rotates through the content bosses week after week', async () => {
    await runRaid(
      (ctx) => {
        const player = seedPlayer(ctx, 1);
        const seen: string[] = [];
        for (let i = 0; i < content.bosses.length; i++) {
          // Each Tuesday 12:00Z is inside a new week.
          ctx.clock.t = Date.parse('2027-01-12T12:00:00Z') + i * 7 * DAY;
          ctx.sql.exec('UPDATE players SET last_seen_at = ?', ctx.clock.t);
          seen.push(ctx.core.raid.view(player.id, HELSINKI).boss.id);
        }
        expect(new Set(seen).size).toBe(content.bosses.length);
      },
      { start: Date.parse('2027-01-12T12:00:00Z') },
    );
  });

  it('opens the week at Monday 13:37, not at midnight', async () => {
    await runRaid(
      (ctx) => {
        const player = seedPlayer(ctx, 1);
        // Monday 2027-01-11 13:36 Helsinki is still the previous week.
        ctx.clock.t = Date.parse('2027-01-11T11:36:00Z');
        expect(ctx.core.raid.view(player.id, HELSINKI).weekId).toBe('2027-W01');
        ctx.clock.t = Date.parse('2027-01-11T11:37:00Z');
        expect(ctx.core.raid.view(player.id, HELSINKI).weekId).toBe('2027-W02');
      },
      { start: Date.parse('2027-01-11T10:00:00Z') },
    );
  });

  it('skips weeks that were never opened instead of creating them late', async () => {
    await runRaid((ctx) => {
      const player = seedPlayer(ctx, 1);
      ctx.core.raid.view(player.id, HELSINKI);
      expect(
        rows(ctx.sql, 'SELECT week_id, event, outcome FROM raid_events ORDER BY rowid'),
      ).toEqual([
        { week_id: '2027-W01', event: 'weekStart', outcome: 'skipped' },
        { week_id: '2027-W01', event: 'phase1', outcome: 'skipped' },
        { week_id: '2027-W01', event: 'phase2', outcome: 'skipped' },
        { week_id: '2027-W01', event: 'finale', outcome: 'skipped' },
        { week_id: '2027-W02', event: 'weekStart', outcome: 'ran' },
      ]);
      expect(count(ctx.sql, 'raid_weeks')).toBe(1);
    });
  });
});

describe('roster', () => {
  it('counts players with a creature who opened the game or leeted in the last 14 days', async () => {
    await runRaid((ctx) => {
      const now = ctx.clock.t;
      const seenRecently = seedPlayer(ctx, 1, { lastSeenAt: now - 13 * DAY });
      const seenLongAgo = seedPlayer(ctx, 2, { lastSeenAt: now - 15 * DAY });
      const leeted = seedPlayer(ctx, 3, { lastSeenAt: now - 20 * DAY });
      const leetedLongAgo = seedPlayer(ctx, 4, { lastSeenAt: now - 20 * DAY });
      const noCreature = seedPlayer(ctx, 5, { creatures: 0 });
      const justOnTime = seedPlayer(ctx, 6, { lastSeenAt: now - 14 * DAY });
      const justLate = seedPlayer(ctx, 7, { lastSeenAt: now - 14 * DAY - 1 });
      // A leet credit counts as activity, by the time it was credited.
      ctx.clock.t = now - 3 * DAY;
      ctx.core.credit({
        userId: leeted.id,
        currency: 'bait',
        amount: 5,
        source: 'leet',
        idempotencyKey: 'leet:recent',
      });
      ctx.clock.t = now - 20 * DAY;
      ctx.core.credit({
        userId: leetedLongAgo.id,
        currency: 'bait',
        amount: 5,
        source: 'leet',
        idempotencyKey: 'leet:old',
      });
      // Other ledger entries are not activity.
      ctx.clock.t = now - 1 * DAY;
      ctx.core.credit({
        userId: seenLongAgo.id,
        currency: 'bait',
        amount: 5,
        source: 'expedition',
        idempotencyKey: 'other:recent',
      });
      ctx.clock.t = now;

      const eligible = eligiblePlayerIds(ctx.sql, now);
      expect(new Set(eligible)).toEqual(new Set([seenRecently.id, leeted.id, justOnTime.id]));
      expect(eligible).toEqual([...eligible].sort());
      for (const p of [seenLongAgo, leetedLongAgo, noCreature, justLate]) {
        expect(eligible).not.toContain(p.id);
      }
      // The week uses the same rule.
      ctx.core.raid.currentWeek(HELSINKI);
      expect(
        new Set(
          rows<{ user_id: string }>(ctx.sql, 'SELECT user_id FROM raid_party_members').map(
            (r) => r.user_id,
          ),
        ),
      ).toEqual(new Set(eligible));
    });
  });

  it('no longer honours opt-outs: a stored row and the old route change nothing', async () => {
    await runRaid((ctx) => {
      const a = seedPlayer(ctx, 1);
      const b = seedPlayer(ctx, 2);
      const names = () =>
        ctx.core.raid
          .view(a.id, HELSINKI)
          .roster.map((r) => r.displayName)
          .sort();
      expect(names()).toEqual(['Player 1', 'Player 2']);

      // The old route answers "not opted out" and leaves the player where they are.
      expect(ctx.core.raid.setOptOut(HELSINKI)).toEqual({
        ok: true,
        value: { optOut: false },
      });
      expect(count(ctx.sql, 'raid_opt_outs')).toBe(0);
      expect(names()).toEqual(['Player 1', 'Player 2']);

      // A row left by the old button (before this change) is ignored by the roster.
      ctx.sql.exec('INSERT INTO raid_opt_outs (week_id, user_id) VALUES (?, ?)', W02.id, b.id);
      expect(eligiblePlayerIds(ctx.sql, ctx.clock.t)).toContain(b.id);
      leaveParty(ctx.sql, W02.id, b.id);
      ctx.core.raid.syncRoster(W02.id);
      expect(names()).toEqual(['Player 1', 'Player 2']);
      expect(ctx.core.raid.view(b.id, HELSINKI).you).toMatchObject({
        inRoster: true,
        optOut: false,
      });
    });
  });

  it('still refuses the retired opt-out route once phase 1 has resolved', async () => {
    await runRaid((ctx) => {
      const a = seedPlayer(ctx, 1);
      ctx.core.raid.view(a.id, HELSINKI);
      ctx.clock.t = W02.afterPhase1 + HOUR;
      expect(ctx.core.raid.setOptOut(HELSINKI)).toEqual({
        ok: false,
        status: 409,
        error: 'locked',
      });
      expect(ctx.core.raid.view(a.id, HELSINKI).you.canOptOut).toBe(false);
    });
  });
});

describe('parties', () => {
  it('keeps up to 15 players in one party', async () => {
    await runRaid((ctx) => {
      for (let i = 1; i <= 15; i++) seedPlayer(ctx, i);
      ctx.core.raid.currentWeek(HELSINKI);
      expect(partySizes(ctx.sql)).toEqual([15]);
    });
  });

  it('splits 16 players into two parties of 8', async () => {
    await runRaid((ctx) => {
      for (let i = 1; i <= 16; i++) seedPlayer(ctx, i);
      ctx.core.raid.currentWeek(HELSINKI);
      expect(partySizes(ctx.sql)).toEqual([8, 8]);
    });
  });

  it('splits 31 players into three parties (11, 10, 10) balanced by team power', async () => {
    await runRaid((ctx) => {
      for (let i = 1; i <= 31; i++) seedPlayer(ctx, i, { level: 1 + (i % 15) });
      ctx.core.raid.currentWeek(HELSINKI);
      expect(partySizes(ctx.sql)).toEqual([11, 10, 10]);
      const sums = [1, 2, 3].map((p) =>
        rows<{ user_id: string }>(
          ctx.sql,
          'SELECT user_id FROM raid_party_members WHERE party = ?',
          p,
        ).reduce((total, r) => total + playerPower(ctx.sql, r.user_id), 0),
      );
      // Party 1 has one more player, so allow about one average player of difference.
      const average = sums.reduce((a, b) => a + b, 0) / 31;
      expect(Math.max(...sums) - Math.min(...sums)).toBeLessThan(average * 1.5);
    });
  });

  it('balances party strength: the totals stay close even with very uneven players', async () => {
    await runRaid((ctx) => {
      for (let i = 1; i <= 20; i++) seedPlayer(ctx, i, { level: i <= 10 ? 15 : 2 });
      ctx.core.raid.currentWeek(HELSINKI);
      // Count the strong players (the first ten) in each party: a snake draft spreads them evenly.
      const strongPerParty = [1, 2].map(
        (p) =>
          rows<{ user_id: string }>(
            ctx.sql,
            'SELECT user_id FROM raid_party_members WHERE party = ?',
            p,
          ).filter((r) => Number(BigInt(r.user_id) % 10n ** 17n) <= 10).length,
      );
      expect(strongPerParty).toEqual([5, 5]);
    });
  });

  it('puts a late joiner into the smallest party before phase 1', async () => {
    await runRaid((ctx) => {
      for (let i = 1; i <= 16; i++) seedPlayer(ctx, i);
      ctx.core.raid.currentWeek(HELSINKI);
      // Make the parties uneven: party 2 loses a member.
      const inParty2 = rows<{ user_id: string }>(
        ctx.sql,
        'SELECT user_id FROM raid_party_members WHERE party = 2 LIMIT 1',
      )[0]?.user_id as string;
      // They drop out (they are no longer active), so the late-joiner sync does not take them back.
      leaveParty(ctx.sql, W02.id, inParty2);
      ctx.sql.exec('UPDATE players SET last_seen_at = 0 WHERE user_id = ?', inParty2);
      expect(partySizes(ctx.sql)).toEqual([8, 7]);

      const late = seedPlayer(ctx, 40);
      ctx.core.raid.view(late.id, HELSINKI);
      expect(partySizes(ctx.sql)).toEqual([8, 8]);
      expect(
        rows<{ party: number }>(
          ctx.sql,
          'SELECT party FROM raid_party_members WHERE user_id = ?',
          late.id,
        )[0]?.party,
      ).toBe(2);
    });
  });

  it('opens a new party when every party is full', async () => {
    await runRaid((ctx) => {
      for (let i = 1; i <= 15; i++) seedPlayer(ctx, i);
      ctx.core.raid.currentWeek(HELSINKI);
      const late = seedPlayer(ctx, 50);
      ctx.core.raid.view(late.id, HELSINKI);
      expect(partySizes(ctx.sql)).toEqual([15, 1]);
    });
  });

  it('fixes membership after phase 1: later arrivals are not in the roster', async () => {
    await runRaid((ctx) => {
      const a = seedPlayer(ctx, 1);
      ctx.core.raid.view(a.id, HELSINKI);
      ctx.clock.t = W02.afterPhase1 + HOUR;
      // Phase 1 resolves (and locks the roster) on this read; only then does the late player appear.
      expect(ctx.core.raid.view(a.id, HELSINKI).status).toBe('phase1');
      const late = seedPlayer(ctx, 2);
      const view = ctx.core.raid.view(late.id, HELSINKI);
      expect(view.status).toBe('phase1');
      expect(view.you.inRoster).toBe(false);
      expect(view.roster.map((r) => r.displayName)).toEqual(['Player 1']);
      expect(ctx.core.raid.place(late.id, HELSINKI, late.creatureIds[0] as string, 0)).toEqual({
        ok: false,
        status: 409,
        error: 'not_in_roster',
      });
    });
  });
});

describe('one alarm for every schedule', () => {
  /** A leet source that reports which raid events were done when the sync ran. */
  function recordingSource(sqlRef: { sql: SqlStorage | null }) {
    const seen: string[][] = [];
    const source: LeetSource = {
      getDays() {
        const done =
          sqlRef.sql === null
            ? []
            : rows<{ week_id: string; event: string }>(
                sqlRef.sql,
                "SELECT week_id, event FROM raid_events WHERE outcome = 'ran' ORDER BY rowid",
              ).map((r) => `${r.week_id}:${r.event}`);
        seen.push(done);
        return Promise.resolve({ days: [], nextCursor: null, hasMore: false });
      },
    };
    return { source, seen };
  }

  it('arms the alarm for the earliest of the leet sync and the next raid event', async () => {
    const ref = { sql: null as SqlStorage | null };
    const { source } = recordingSource(ref);
    await runRaid(
      async (ctx) => {
        ref.sql = ctx.sql;
        const secret = await ctx.core.createSession(ctx.guildId, {
          id: USER_ID,
          displayName: 'Misa',
        });
        // Friday 10:00Z: phase 1 (11:37Z) is three minutes before the sync (11:40Z).
        expect(await ctx.storage.getAlarm()).toBe(eventTimes(W02.id, HELSINKI).phase1);
        // A request that finds the alarm gone runs what is due and re-arms: phase 1 has run, so
        // the next event is Saturday's phase 2 (11:37Z), again before that day's sync (11:40Z).
        ctx.clock.t = Date.parse('2027-01-15T10:40:00Z');
        await ctx.storage.deleteAlarm();
        await ctx.request(secret, '/api/me');
        ctx.clock.t = Date.parse('2027-01-15T11:30:00Z'); // sessions idle out after an hour
        await ctx.request(secret, '/api/me');
        expect(count(ctx.sql, 'raid_events', "event = 'phase1' AND outcome = 'ran'")).toBe(0);
        ctx.clock.t = Date.parse('2027-01-15T11:50:00Z');
        await ctx.storage.deleteAlarm();
        await ctx.request(secret, '/api/me');
        expect(count(ctx.sql, 'raid_events', "event = 'phase1' AND outcome = 'ran'")).toBe(1);
        expect(await ctx.storage.getAlarm()).toBe(eventTimes(W02.id, HELSINKI).phase2);
      },
      { core: { createLeetSource: () => source } },
    );
  });

  it('runs raid events and the sync in time order when the alarm fires', async () => {
    const ref = { sql: null as SqlStorage | null };
    const { source, seen } = recordingSource(ref);
    await runRaid(
      async (ctx) => {
        ref.sql = ctx.sql;
        seedPlayer(ctx, 1);
        // Saturday 12:00Z. Due: week start, phase 1 (Fri), phase 2 (Sat 11:37Z), all before the
        // sync slot (11:40Z), so the sync sees them done and not the finale.
        ctx.clock.t = Date.parse('2027-01-16T12:00:00Z');
        await ctx.core.alarm();
        expect(seen).toEqual([['2027-W02:weekStart', '2027-W02:phase1', '2027-W02:phase2']]);
        expect(await ctx.storage.getAlarm()).toBe(Date.parse('2027-01-17T11:40:00Z'));

        // Sunday 19:00Z. The sync slot (11:40Z) comes before the finale (18:00Z): the sync runs
        // first, then the finale.
        ctx.clock.t = Date.parse('2027-01-17T19:00:00Z');
        await ctx.core.alarm();
        expect(seen).toHaveLength(2);
        expect(seen[1]).toEqual(['2027-W02:weekStart', '2027-W02:phase1', '2027-W02:phase2']);
        expect(rows(ctx.sql, "SELECT status FROM raid_weeks WHERE week_id = '2027-W02'")).toEqual([
          { status: 'finale' },
        ]);
        // Next: Monday's week start (11:37Z) is before Monday's sync (11:40Z).
        expect(await ctx.storage.getAlarm()).toBe(Date.parse('2027-01-18T11:37:00Z'));
      },
      { core: { createLeetSource: () => source } },
    );
  });

  it('runs raid events without a leet source and arms only raid alarms', async () => {
    await runRaid(
      async (ctx) => {
        seedPlayer(ctx, 1);
        ctx.clock.t = W02.afterPhase2;
        await ctx.core.alarm();
        expect(await ctx.storage.getAlarm()).toBe(eventTimes(W02.id, HELSINKI).finale);
        expect(count(ctx.sql, 'raid_results')).toBe(2);
      },
      { core: { createLeetSource: () => null } },
    );
  });

  it('runs missed events late and in order on the next wake-up', async () => {
    await runRaid(async (ctx) => {
      const secret = await ctx.core.createSession(ctx.guildId, {
        id: USER_ID,
        displayName: 'Misa',
      });
      ctx.sql.exec(
        `INSERT INTO creatures (id, user_id, line, species, level, origin, caught_at)
         VALUES (?, ?, 'splashet', 'splashet', 3, 'test', 0)`,
        crypto.randomUUID(),
        USER_ID,
      );
      // The object slept through Friday, Saturday and Sunday. The next session wakes it up.
      ctx.clock.t = Date.parse('2027-01-17T19:00:00Z');
      const secret2 = await ctx.core.createSession(ctx.guildId, {
        id: USER_ID,
        displayName: 'Misa',
      });
      expect(secret2).not.toBe(secret);
      const res = await ctx.request(secret2, '/api/me');
      expect(res.status).toBe(200);
      expect(
        rows(ctx.sql, 'SELECT phase FROM raid_results ORDER BY rowid').map((r) => r.phase),
      ).toEqual(['phase1', 'phase2', 'finale']);
      expect(
        rows(
          ctx.sql,
          "SELECT event FROM raid_events WHERE week_id = '2027-W02' ORDER BY rowid",
        ).map((r) => r.event),
      ).toEqual(['weekStart', 'phase1', 'phase2', 'finale']);
    });
  });

  it('runs a finale missed over the week change, still for its own week', async () => {
    await runRaid(
      (ctx) => {
        const a = seedPlayer(ctx, 1);
        ctx.core.raid.view(a.id, HELSINKI);
        // Asleep from Friday morning until Tuesday of the next week.
        ctx.clock.t = Date.parse('2027-01-19T10:00:00Z');
        ctx.sql.exec('UPDATE players SET last_seen_at = ?', ctx.clock.t);
        const view = ctx.core.raid.view(a.id, HELSINKI);
        expect(view.weekId).toBe('2027-W03');
        expect(rows(ctx.sql, 'SELECT week_id, phase FROM raid_results ORDER BY rowid')).toEqual([
          { week_id: '2027-W02', phase: 'phase1' },
          { week_id: '2027-W02', phase: 'phase2' },
          { week_id: '2027-W02', phase: 'finale' },
        ]);
        expect(rows(ctx.sql, 'SELECT week_id, status FROM raid_weeks ORDER BY week_id')).toEqual([
          { week_id: '2027-W02', status: 'finale' },
          { week_id: '2027-W03', status: 'open' },
        ]);
      },
      { start: Date.parse('2027-01-15T10:00:00Z') },
    );
  });

  it('is idempotent: duplicate alarms and repeated events change nothing', async () => {
    await runRaid(async (ctx) => {
      seedPlayer(ctx, 1);
      ctx.clock.t = W02.afterFinale;
      await ctx.core.alarm();
      const snapshot = () => ({
        results: count(ctx.sql, 'raid_results'),
        events: count(ctx.sql, 'raid_events'),
        ledger: count(ctx.sql, 'ledger'),
        pity: rows(ctx.sql, 'SELECT * FROM jackpot_pity'),
      });
      const before = snapshot();
      await ctx.core.alarm();
      await ctx.core.alarm();
      const times = eventTimes(W02.id, HELSINKI);
      ctx.core.raid.runEvent({ weekId: W02.id, event: 'finale', at: times.finale }, HELSINKI);
      ctx.core.raid.runEvent({ weekId: W02.id, event: 'phase1', at: times.phase1 }, HELSINKI);
      expect(snapshot()).toEqual(before);
    });
  });

  it('retries a failing event in a minute instead of looping, and logs only the error type', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await runRaid((ctx) => {
      const a = seedPlayer(ctx, 1);
      ctx.core.raid.view(a.id, HELSINKI);
      // A week whose boss no longer exists in the content: its phases cannot resolve.
      ctx.sql.exec("UPDATE raid_weeks SET boss_id = 'not-a-boss secret-text'");
      ctx.clock.t = W02.afterPhase1;
      expect(ctx.core.raid.runDue(HELSINKI)).toBe(0);
      expect(count(ctx.sql, 'raid_results')).toBe(0);
      expect(error).toHaveBeenCalledWith('raid event failed', 'Error');
      expect(JSON.stringify(error.mock.calls)).not.toContain('secret-text');
    });
  });
});

describe('time helpers used by the calendar', () => {
  it('sanity: T0 is Friday of 2027-W02 in Helsinki', () => {
    expect(weekIdFor(T0, HELSINKI)).toBe('2027-W02');
    expect(MINUTE).toBe(60_000);
  });
});
