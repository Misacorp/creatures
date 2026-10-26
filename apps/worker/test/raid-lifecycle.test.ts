import { content } from '@creatures/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LeetSource } from '../src/leet';
import { eligiblePlayerIds, partyCountFor } from '../src/raid-roster';
import { eventTimes, weekIdFor, weekIndex } from '../src/raid-schedule';
import { T0, USER_ID } from './helpers';
import {
  DAY,
  HELSINKI,
  HOUR,
  MINUTE,
  W02,
  count,
  joinRaid,
  rows,
  runRaid,
  seedMember,
  seedPlayer,
} from './raid-helpers';
import { captureConsole } from './kit';

afterEach(() => {
  vi.restoreAllMocks();
});

const partySizes = (sql: SqlStorage, week = W02.id): number[] =>
  rows<{ n: number }>(
    sql,
    'SELECT COUNT(*) AS n FROM raid_party_members WHERE week_id = ? GROUP BY party ORDER BY party',
    week,
  ).map((r) => r.n);

describe('parties', () => {
  it('needs the smallest number of parties of at most 15 players', () => {
    expect(partyCountFor(0)).toBe(0);
    expect(partyCountFor(15)).toBe(1);
    expect(partyCountFor(16)).toBe(2);
    expect(partyCountFor(30)).toBe(2);
    expect(partyCountFor(31)).toBe(3);
  });
});

describe('week creation', () => {
  it('creates the current week lazily on a raid read, with the rotating boss and nobody in it', async () => {
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
      // Opening the week joins nobody and makes no party: that happens when someone places.
      expect(count(ctx.sql, 'raid_party_members')).toBe(0);
      expect(count(ctx.sql, 'raid_parties')).toBe(0);
      ctx.core.raid.view(player.id, HELSINKI);
      expect(count(ctx.sql, 'raid_weeks')).toBe(1);
      joinRaid(ctx, player);
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

describe('the active roster', () => {
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
      // Being active puts nobody in the raid: the week has no members until someone places.
      ctx.core.raid.currentWeek(HELSINKI);
      expect(count(ctx.sql, 'raid_party_members')).toBe(0);
    });
  });
});

describe('joining by placing', () => {
  it('joins on the first placement and brings exactly what was placed', async () => {
    await runRaid((ctx) => {
      const a = seedPlayer(ctx, 1);
      const b = seedPlayer(ctx, 2);
      const names = () =>
        ctx.core.raid
          .view(a.id, HELSINKI)
          .roster.map((r) => r.displayName)
          .sort();
      expect(names()).toEqual([]);
      expect(ctx.core.raid.view(a.id, HELSINKI).you).toMatchObject({
        inRoster: false,
        party: null,
        canEdit: true,
        team: null,
      });

      expect(ctx.core.raid.place(a.id, HELSINKI, a.creatureIds[0] as string, 4)).toEqual({
        ok: true,
        value: null,
      });
      const view = ctx.core.raid.view(a.id, HELSINKI);
      expect(view.you).toMatchObject({ inRoster: true, party: 1 });
      // One creature placed: that is all they bring. The other two are not picked for them.
      expect(view.you.team?.creatures.map((c) => [c.creatureId, c.slot])).toEqual([
        [a.creatureIds[0], 4],
      ]);
      expect(view.party?.row.filter((s) => s.creature !== null)).toHaveLength(1);
      expect(names()).toEqual(['Player 1']);
      // The other player placed nothing, so they are not in it.
      expect(ctx.core.raid.view(b.id, HELSINKI).you.inRoster).toBe(false);
    });
  });
});

describe('parties by placing', () => {
  it('keeps up to 15 players in one party', async () => {
    await runRaid((ctx) => {
      const players = Array.from({ length: 15 }, (_, i) => seedPlayer(ctx, i + 1));
      joinRaid(ctx, players);
      expect(partySizes(ctx.sql)).toEqual([15]);
    });
  });

  it('puts the 16 players of a server over 15 into two parties of 8', async () => {
    await runRaid((ctx) => {
      // Everyone is active when the first one places: the board is made for two parties.
      const players = Array.from({ length: 16 }, (_, i) => seedPlayer(ctx, i + 1));
      joinRaid(ctx, players);
      expect(partySizes(ctx.sql)).toEqual([8, 8]);
    });
  });

  it('splits 31 players into three parties (11, 10, 10), each joining the party with the fewest', async () => {
    await runRaid((ctx) => {
      const players = Array.from({ length: 31 }, (_, i) =>
        seedPlayer(ctx, i + 1, { level: 1 + ((i + 1) % 15) }),
      );
      joinRaid(ctx, players);
      expect(partySizes(ctx.sql)).toEqual([11, 10, 10]);
    });
  });

  it('puts a joiner into the smallest party before phase 1', async () => {
    await runRaid((ctx) => {
      const players = Array.from({ length: 16 }, (_, i) => seedPlayer(ctx, i + 1));
      joinRaid(ctx, players);
      expect(partySizes(ctx.sql)).toEqual([8, 8]);
      // One of party 2 takes all their creatures off the board: they leave the raid.
      const leaver = rows<{ user_id: string }>(
        ctx.sql,
        'SELECT user_id FROM raid_party_members WHERE party = 2 LIMIT 1',
      )[0]?.user_id as string;
      const gone = players.find((p) => p.id === leaver);
      for (const id of gone?.creatureIds ?? []) {
        expect(ctx.core.raid.unplace(leaver, HELSINKI, id).ok).toBe(true);
      }
      expect(partySizes(ctx.sql)).toEqual([8, 7]);

      const late = seedPlayer(ctx, 40);
      joinRaid(ctx, late);
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
      const players = Array.from({ length: 15 }, (_, i) => seedPlayer(ctx, i + 1));
      joinRaid(ctx, players);
      // A 16th player becomes active after the party filled up: they open a second party.
      seedMember(ctx, 50);
      expect(partySizes(ctx.sql)).toEqual([15, 1]);
    });
  });

  it('shows a player who has not joined the board of the party they would join', async () => {
    await runRaid((ctx) => {
      const players = Array.from({ length: 16 }, (_, i) => seedPlayer(ctx, i + 1));
      const watcher = seedPlayer(ctx, 99);
      joinRaid(ctx, players, { creatures: 1 });
      // 16 players over two parties of 8; the next to join goes to party 1 (the lowest on a tie).
      const view = ctx.core.raid.view(watcher.id, HELSINKI);
      expect(view.you).toMatchObject({ inRoster: false, party: null, canEdit: true });
      expect(view.party?.party).toBe(1);
      expect(view.party?.row.filter((s) => s.creature !== null)).toHaveLength(8);
      // Looking changes nothing.
      expect(partySizes(ctx.sql)).toEqual([8, 8]);
    });
  });

  it('lets a player join after Phase 1 and Phase 2, into the party with the fewest players, until the finale', async () => {
    await runRaid((ctx) => {
      // 16 active players: two parties. Five join before Phase 1: sizes 3 and 2.
      const players = Array.from({ length: 16 }, (_, i) => seedPlayer(ctx, i + 1));
      joinRaid(ctx, players.slice(0, 5), { creatures: 1 });
      expect(partySizes(ctx.sql)).toEqual([3, 2]);
      ctx.clock.t = W02.afterPhase1 + HOUR;
      expect(ctx.core.raid.view(players[0]?.id as string, HELSINKI).status).toBe('phase1');
      // After Phase 1 a newcomer sees the board they would join and can place on it.
      const late = players[5] as (typeof players)[number];
      const before = ctx.core.raid.view(late.id, HELSINKI);
      expect(before.you).toMatchObject({ inRoster: false, canEdit: true });
      expect(before.party?.party).toBe(2);
      expect(ctx.core.raid.place(late.id, HELSINKI, late.creatureIds[0] as string, 5).ok).toBe(
        true,
      );
      expect(partySizes(ctx.sql)).toEqual([3, 3]);
      const after = ctx.core.raid.view(late.id, HELSINKI);
      expect(after.you).toMatchObject({ inRoster: true, party: 2 });
      expect(after.roster.map((r) => r.displayName)).toContain('Player 6');
      // Phase 2 resolves; the next newcomer goes to party 1 (tie, lowest number).
      ctx.clock.t = W02.afterPhase2 + HOUR;
      const later = players[6] as (typeof players)[number];
      expect(ctx.core.raid.view(later.id, HELSINKI).status).toBe('phase2');
      expect(ctx.core.raid.place(later.id, HELSINKI, later.creatureIds[0] as string, 6).ok).toBe(
        true,
      );
      expect(partySizes(ctx.sql)).toEqual([4, 3]);
      // Once the finale starts, nobody joins any more.
      ctx.clock.t = W02.afterFinale + HOUR;
      const last = players[7] as (typeof players)[number];
      expect(ctx.core.raid.view(last.id, HELSINKI).status).toBe('finale');
      expect(ctx.core.raid.place(last.id, HELSINKI, last.creatureIds[0] as string, 7)).toEqual({
        ok: false,
        status: 409,
        error: 'locked',
      });
      expect(partySizes(ctx.sql)).toEqual([4, 3]);
    });
  });

  it('lets a joined player keep moving their creature after phase 1, and a late joiner opens a party that does not exist yet', async () => {
    await runRaid((ctx) => {
      const a = seedMember(ctx, 1);
      ctx.clock.t = W02.afterPhase1 + HOUR;
      expect(ctx.core.raid.view(a.id, HELSINKI).status).toBe('phase1');
      expect(ctx.core.raid.place(a.id, HELSINKI, a.creatureIds[0] as string, 7).ok).toBe(true);
      expect(
        ctx.core.raid
          .view(a.id, HELSINKI)
          .you.team?.creatures.find((c) => c.creatureId === a.creatureIds[0])?.slot,
      ).toBe(7);
      const late = seedPlayer(ctx, 2);
      expect(ctx.core.raid.place(late.id, HELSINKI, late.creatureIds[0] as string, 0).ok).toBe(
        true,
      );
      expect(count(ctx.sql, 'raid_party_members')).toBe(2);
    });
  });

  it('leaves the raid when the last creature comes off the board before phase 1, not after', async () => {
    await runRaid((ctx) => {
      const a = seedMember(ctx, 1, { place: 2 });
      const [first, second, third] = a.creatureIds as [string, string, string];
      expect(ctx.core.raid.unplace(a.id, HELSINKI, first).ok).toBe(true);
      expect(ctx.core.raid.view(a.id, HELSINKI).you.inRoster).toBe(true);
      expect(ctx.core.raid.unplace(a.id, HELSINKI, second).ok).toBe(true);
      expect(ctx.core.raid.view(a.id, HELSINKI).you).toMatchObject({ inRoster: false, team: null });
      expect(count(ctx.sql, 'raid_party_members')).toBe(0);
      expect(count(ctx.sql, 'raid_placements')).toBe(0);
      // Taking off one that was not on the board changes nothing.
      expect(ctx.core.raid.unplace(a.id, HELSINKI, third).ok).toBe(true);
      // They can join again by placing.
      expect(ctx.core.raid.place(a.id, HELSINKI, third, 0).ok).toBe(true);
      expect(ctx.core.raid.view(a.id, HELSINKI).you.inRoster).toBe(true);

      // After Phase 1 the parties are fixed: removing the last creature keeps the player in the party.
      ctx.clock.t = W02.afterPhase1 + HOUR;
      ctx.core.raid.view(a.id, HELSINKI);
      expect(ctx.core.raid.unplace(a.id, HELSINKI, third).ok).toBe(true);
      expect(ctx.core.raid.view(a.id, HELSINKI).you.inRoster).toBe(true);
      expect(count(ctx.sql, 'raid_party_members')).toBe(1);
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
        seedMember(ctx, 1);
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
        seedMember(ctx, 1);
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
      const creatureId = crypto.randomUUID();
      ctx.sql.exec(
        `INSERT INTO creatures (id, user_id, line, species, level, origin, caught_at)
         VALUES (?, ?, 'splashet', 'splashet', 3, 'test', 0)`,
        creatureId,
        USER_ID,
      );
      // Misa joins the week's raid by placing her creature.
      expect(ctx.core.raid.place(USER_ID, HELSINKI, creatureId, 0).ok).toBe(true);
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
        const a = seedMember(ctx, 1);
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
      seedMember(ctx, 1);
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
    const error = captureConsole();
    await runRaid((ctx) => {
      const a = seedMember(ctx, 1);
      ctx.core.raid.view(a.id, HELSINKI);
      // A week whose boss no longer exists in the content: its phases cannot resolve.
      ctx.sql.exec("UPDATE raid_weeks SET boss_id = 'not-a-boss secret-text'");
      ctx.clock.t = W02.afterPhase1;
      expect(ctx.core.raid.runDue(HELSINKI)).toBe(0);
      expect(count(ctx.sql, 'raid_results')).toBe(0);
      expect(error.calls).toContainEqual(['raid event failed', 'Error']);
      expect(JSON.stringify(error.calls)).not.toContain('secret-text');
    });
  });
});

describe('time helpers used by the calendar', () => {
  it('sanity: T0 is Friday of 2027-W02 in Helsinki', () => {
    expect(weekIdFor(T0, HELSINKI)).toBe('2027-W02');
    expect(MINUTE).toBe(60_000);
  });
});
