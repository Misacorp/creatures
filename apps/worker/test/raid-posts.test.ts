import { RULES, content, scaleEssence } from '@creatures/game';
import type { FightEvent } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_CHARS } from '../src/discord-format';
import { findKeyMoment, mostUsedReaction } from '../src/raid-posts';
import { eventTimes } from '../src/raid-schedule';
import type { CoreContext } from './helpers';
import {
  DAY,
  HELSINKI,
  HOUR,
  W02,
  count,
  forcePool,
  rows,
  runRaid,
  seedPlayer,
  type Seeded,
} from './raid-helpers';

const CHANNEL = '555555555555555555';
const ZWSP = '\u200B';
const NASTY = '@everyone <@123> **bold**';

/** The flat Essence a cleared stage pays in the (only) week: the base amount scaled by its rank. */
function flatPaid(ctx: Pick<CoreContext, 'sql'>, stage: 'phase1' | 'phase2' | 'finale'): number {
  const week = rows<{ rank: number; festival: number }>(
    ctx.sql,
    'SELECT rank, festival FROM raid_weeks',
  )[0] as { rank: number; festival: number };
  return scaleEssence(RULES.raid.essence.flat[stage], {
    rank: week.rank,
    festival: week.festival === 1,
  });
}

const posts = (ctx: Pick<CoreContext, 'sql'>) =>
  rows<{
    key: string;
    channel_id: string;
    content: string;
    status: string;
    next_attempt_at: number;
  }>(
    ctx.sql,
    'SELECT key, channel_id, content, status, next_attempt_at FROM discord_posts ORDER BY id',
  );

/** Seeds players, sets the announcement channel (or not) and opens the week. */
async function openWeek(
  ctx: CoreContext,
  n: number,
  options: { channel?: string | null; level?: number; name?: (i: number) => string } = {},
): Promise<Seeded[]> {
  const players = Array.from({ length: n }, (_, i) =>
    seedPlayer(ctx, i + 1, {
      level: options.level ?? 15,
      ...(options.name === undefined ? {} : { name: options.name(i + 1) }),
    }),
  );
  const first = players[0] as Seeded;
  // Session creation stores the channel, then catches up: the week opens and the reveal is queued.
  await ctx.core.createSession(
    ctx.guildId,
    { id: first.id, displayName: first.name },
    options.channel === undefined ? CHANNEL : options.channel,
  );
  return players;
}

describe('the Monday boss reveal', () => {
  it('is queued once when the week opens, with the boss, the times and the player count', async () => {
    await runRaid(
      async (ctx) => {
        await openWeek(ctx, 4);
        const [reveal] = posts(ctx);
        expect(posts(ctx)).toHaveLength(1);
        expect(reveal).toMatchObject({
          key: 'raid:2027-W02:weekStart:all',
          channel_id: CHANNEL,
          status: 'pending',
        });
        const week = rows<{ boss_id: string }>(ctx.sql, 'SELECT boss_id FROM raid_weeks')[0];
        const boss = content.bosses.find((b) => b.id === week?.boss_id);
        const times = eventTimes(W02.id, HELSINKI);
        const text = reveal?.content ?? '';
        expect(text.startsWith(`**A new raid week begins: ${boss?.name}**`)).toBe(true);
        expect(text).toContain(
          `Phase 1: <t:${String(times.phase1 / 1000)}:F> (<t:${String(times.phase1 / 1000)}:R>)`,
        );
        expect(text).toContain(`Phase 2: <t:${String(times.phase2 / 1000)}:F>`);
        expect(text).toContain(`Finale: <t:${String(times.finale / 1000)}:F>`);
        expect(text).toContain('4 players are in this week.');
        // The server's rank, as stored for the week; a normal week says nothing about a Festival.
        const rank = rows<{ rank: number }>(ctx.sql, 'SELECT rank FROM raid_weeks')[0]?.rank;
        expect(rank).toBeGreaterThanOrEqual(1);
        expect(text).toContain(`Boss Rank ${String(rank)}.`);
        expect(text).not.toContain('Festival');
        expect(text.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
        // Running the event again queues nothing new.
        ctx.sql.exec("DELETE FROM raid_events WHERE event = 'weekStart'");
        ctx.core.raid.runEvent(
          { weekId: W02.id, event: 'weekStart', at: times.weekStart },
          HELSINKI,
        );
        expect(posts(ctx)).toHaveLength(1);
        expect(posts(ctx)[0]?.content).toBe(text);
      },
      { start: W02.monday },
    );
  });

  it("lists only the moves the boss has at the week's rank", async () => {
    await runRaid(
      async (ctx) => {
        await openWeek(ctx, 4);
        const week = rows<{ boss_id: string }>(ctx.sql, 'SELECT boss_id FROM raid_weeks')[0];
        const boss = content.bosses.find((b) => b.id === week?.boss_id);
        if (boss === undefined) throw new Error('boss');
        const times = eventTimes(W02.id, HELSINKI);
        const revealAt = (rank: number): string => {
          ctx.sql.exec('DELETE FROM discord_posts');
          ctx.sql.exec("DELETE FROM raid_events WHERE event = 'weekStart'");
          ctx.sql.exec('UPDATE raid_weeks SET rank = ?, effective_rank = ?', rank, rank);
          ctx.core.raid.runEvent(
            { weekId: W02.id, event: 'weekStart', at: times.weekStart },
            HELSINKI,
          );
          return posts(ctx)[0]?.content ?? '';
        };
        const gated = boss.gimmicks.filter((g) => g.fromRank !== undefined);
        expect(gated.map((g) => g.fromRank)).toEqual([4, 7]);
        const [four, seven] = gated;
        if (four === undefined || seven === undefined) throw new Error('gated moves');
        const base = boss.gimmicks.find((g) => g.fromRank === undefined);
        const atRank1 = revealAt(1);
        expect(atRank1).toContain(`${base?.name ?? ''}: `);
        expect(atRank1).not.toContain(four.name);
        expect(atRank1).not.toContain(seven.name);
        const atRank4 = revealAt(4);
        expect(atRank4).toContain(four.name);
        expect(atRank4).not.toContain(seven.name);
        const atRank7 = revealAt(7);
        expect(atRank7).toContain(four.name);
        expect(atRank7).toContain(seven.name);
        expect(atRank7.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
      },
      { start: W02.monday },
    );
  });

  it('is skipped without an announcement channel, and when nobody is in', async () => {
    await runRaid(
      async (ctx) => {
        await openWeek(ctx, 3, { channel: null });
        expect(count(ctx.sql, 'raid_party_members')).toBe(3);
        expect(posts(ctx)).toEqual([]);
      },
      { start: W02.monday },
    );
    await runRaid(
      async (ctx) => {
        const secret = await ctx.core.createSession(
          ctx.guildId,
          { id: '9'.repeat(18), displayName: 'New' },
          CHANNEL,
        );
        expect(secret).not.toBe('');
        // The player has no creature, so nobody is on the roster.
        expect(count(ctx.sql, 'raid_party_members')).toBe(0);
        expect(posts(ctx)).toEqual([]);
      },
      { start: W02.monday },
    );
  });

  it('counts parties when the roster is split', async () => {
    await runRaid(
      async (ctx) => {
        await openWeek(ctx, 16);
        expect(posts(ctx)[0]?.content).toContain('16 players are in this week, in 2 parties.');
      },
      { start: W02.monday },
    );
  });
});

describe('phase posts', () => {
  it('queues one post per party and phase, with the facts of the fight', async () => {
    await runRaid(
      async (ctx) => {
        const players = await openWeek(ctx, 3, {
          name: (i) => (i === 1 ? NASTY : `Player ${String(i)}`),
        });
        // A nickname that tries every trick.
        ctx.sql.exec(
          'UPDATE creatures SET nickname = ? WHERE id = ?',
          '_x_ [y](z)',
          players[0]?.creatureIds[0] ?? '',
        );
        forcePool(ctx.sql, 20_000);
        ctx.clock.t = W02.afterPhase1;
        ctx.core.raid.runDue(HELSINKI);

        const all = posts(ctx);
        expect(all.map((p) => p.key)).toEqual([
          'raid:2027-W02:weekStart:all',
          'raid:2027-W02:phase1:1',
        ]);
        const text = all[1]?.content ?? '';
        const run = rows<{ summary: string }>(ctx.sql, 'SELECT summary FROM raid_results')[0];
        const summary = JSON.parse(run?.summary ?? '{}') as {
          cleared: boolean;
          retreated?: boolean;
        };
        expect(summary.cleared).toBe(true);
        // A stage's boss does not fall: at its HP floor it retreats, and the post says so.
        expect(summary.retreated).toBe(true);
        const boss = text.split('\n')[0];
        expect(boss).toMatch(/^\*\*Phase 1: [^*]+\*\*$/);
        expect(text).toMatch(/Phase 1 cleared: [^\n]+ retreated\.\nThe boss has \d+% HP left\./);
        expect(text).toContain('Top contributors:');
        expect(text).toContain(
          `Essence: every player earned ${String(flatPaid(ctx, 'phase1'))}, plus a bonus share by contribution.`,
        );
        // Phase 1 posts the boss's counter-move.
        const counter = rows<{ adaptation_description: string }>(
          ctx.sql,
          'SELECT adaptation_description FROM raid_parties',
        )[0]?.adaptation_description;
        expect(counter).toBeDefined();
        expect(text).toContain("The boss's counter-move for Phase 2:");
        // Player text is inert wherever it appears.
        expect(text).not.toMatch(/@(?!\u200B)/);
        expect(text).not.toContain('<@123>');
        expect(text).not.toContain('**bold**');
        expect(text).not.toContain('[y](z)');
        expect(text.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
      },
      { start: W02.monday },
    );
  });

  it('adds the key moment and shows the nickname escaped', async () => {
    await runRaid(
      async (ctx) => {
        const players = await openWeek(ctx, 3);
        // Make everyone's first creature easy to spot in the log.
        for (const p of players) {
          ctx.sql.exec(
            'UPDATE creatures SET nickname = ? WHERE id = ?',
            'Nick_Name',
            p.creatureIds[0] ?? '',
          );
        }
        forcePool(ctx.sql, 20_000);
        ctx.clock.t = W02.afterPhase1;
        ctx.core.raid.runDue(HELSINKI);
        const text = posts(ctx)[1]?.content ?? '';
        expect(text).toMatch(
          /Key moment: in round \d+, .+ (hit for \d+ damage|set off .+ for \d+ bonus damage)\./,
        );
        // Wherever the nickname appears, its underscore is escaped.
        if (text.includes('Nick')) expect(text).not.toMatch(/Nick_Name/);
      },
      { start: W02.monday },
    );
  });

  it('names the party when there are several, and posts to every party', async () => {
    await runRaid(
      async (ctx) => {
        await openWeek(ctx, 16);
        forcePool(ctx.sql, 20_000);
        ctx.clock.t = W02.afterPhase1;
        ctx.core.raid.runDue(HELSINKI);
        const phase = posts(ctx).filter((p) => p.key.includes(':phase1:'));
        expect(phase.map((p) => p.key)).toEqual([
          'raid:2027-W02:phase1:1',
          'raid:2027-W02:phase1:2',
        ]);
        expect(phase[0]?.content.split('\n')[0]).toContain('(party 1)');
        expect(phase[1]?.content.split('\n')[0]).toContain('(party 2)');
      },
      { start: W02.monday },
    );
  });

  it('queues exactly once per key, even when the phase runs again', async () => {
    await runRaid(
      async (ctx) => {
        await openWeek(ctx, 3);
        forcePool(ctx.sql, 20_000);
        ctx.clock.t = W02.afterPhase1;
        ctx.core.raid.runDue(HELSINKI);
        const before = posts(ctx);
        expect(before).toHaveLength(2);

        // Running the same event again does nothing.
        const times = eventTimes(W02.id, HELSINKI);
        ctx.core.raid.runEvent({ weekId: W02.id, event: 'phase1', at: times.phase1 }, HELSINKI);
        expect(posts(ctx)).toEqual(before);

        // Even if the result and the done marker are lost and the fight is resolved again (a new
        // fight with a new seed), the key stops a second post and the first text stays.
        ctx.sql.exec("DELETE FROM raid_results WHERE phase = 'phase1'");
        ctx.sql.exec("DELETE FROM raid_events WHERE event = 'phase1'");
        ctx.sql.exec("UPDATE raid_weeks SET status = 'open'");
        ctx.core.raid.runEvent({ weekId: W02.id, event: 'phase1', at: times.phase1 }, HELSINKI);
        expect(count(ctx.sql, 'raid_results', "phase = 'phase1'")).toBe(1);
        expect(posts(ctx)).toEqual(before);
      },
      { start: W02.monday },
    );
  });

  it('commits the post with the result: a failing resolve queues nothing', async () => {
    await runRaid(
      async (ctx) => {
        await openWeek(ctx, 3);
        // An unknown boss makes the resolve throw before anything is stored.
        ctx.sql.exec("UPDATE raid_weeks SET boss_id = 'gone'");
        ctx.clock.t = W02.afterPhase1;
        ctx.core.raid.runDue(HELSINKI);
        expect(count(ctx.sql, 'raid_results')).toBe(0);
        expect(posts(ctx).map((p) => p.key)).toEqual(['raid:2027-W02:weekStart:all']);
      },
      { start: W02.monday },
    );
  });

  it('never lets a post problem block the raid', async () => {
    await runRaid(
      async (ctx) => {
        await openWeek(ctx, 3);
        forcePool(ctx.sql, 20_000);
        // A stored channel that is not valid, and a table that rejects inserts.
        ctx.sql.exec('DROP TABLE discord_posts');
        ctx.sql.exec(
          "CREATE TABLE discord_posts (id INTEGER PRIMARY KEY, key TEXT, channel_id TEXT, content TEXT, status TEXT CHECK (status = 'never'), attempts INTEGER, next_attempt_at INTEGER, created_at INTEGER)",
        );
        ctx.clock.t = W02.afterPhase1;
        ctx.core.raid.runDue(HELSINKI);
        expect(count(ctx.sql, 'raid_results')).toBe(1);
        expect(count(ctx.sql, 'raid_events', "event = 'phase1' AND week_id = '2027-W02'")).toBe(1);
      },
      { start: W02.monday },
    );
  });

  it('queues nothing without an announcement channel', async () => {
    await runRaid(
      async (ctx) => {
        await openWeek(ctx, 3, { channel: null });
        forcePool(ctx.sql, 20_000);
        ctx.clock.t = W02.afterFinale;
        ctx.core.raid.runDue(HELSINKI);
        expect(count(ctx.sql, 'raid_results')).toBe(3);
        expect(posts(ctx)).toEqual([]);
      },
      { start: W02.monday },
    );
  });
});

describe('the finale post', () => {
  it('lists this week’s first-on-server records of the party, and says nothing of the jackpot', async () => {
    await runRaid(
      async (ctx) => {
        const players = await openWeek(ctx, 3, {
          name: (i) => (i === 1 ? '_Ace_' : `Player ${String(i)}`),
        });
        forcePool(ctx.sql, 3_000);
        const [a, b, c] = players as [Seeded, Seeded, Seeded];
        // Players A and B are on their ninth raid without a jackpot: guaranteed on a win.
        ctx.sql.exec(
          'INSERT INTO jackpot_pity (user_id, counter) VALUES (?, 9), (?, 9)',
          a.id,
          b.id,
        );
        // A catch record from this week by C, and one from long ago that must not appear.
        ctx.sql.exec(
          "INSERT INTO server_firsts (kind, species, user_id, drop_id, at) VALUES ('catch', 'splashet', ?, 'd1', ?)",
          c.id,
          W02.monday + HOUR,
        );
        ctx.sql.exec(
          "INSERT INTO server_firsts (kind, species, user_id, drop_id, at) VALUES ('catch', 'cindle', ?, 'd0', ?)",
          c.id,
          W02.monday - 30 * DAY,
        );
        ctx.clock.t = W02.afterFinale;
        ctx.core.raid.runDue(HELSINKI);

        const finale = posts(ctx).find((p) => p.key === 'raid:2027-W02:finale:1');
        const text = finale?.content ?? '';
        const run = rows<{ summary: string }>(
          ctx.sql,
          "SELECT summary FROM raid_results WHERE phase = 'finale'",
        )[0];
        expect((JSON.parse(run?.summary ?? '{}') as { cleared: boolean }).cleared).toBe(true);
        expect(text.startsWith(`**Finale: `)).toBe(true);
        expect(text).toContain(`Essence: every player earned ${String(flatPaid(ctx, 'finale'))}`);
        // One party that won: the post says where the server goes.
        const rank = rows<{ rank: number; rank_after: number }>(
          ctx.sql,
          'SELECT rank, rank_after FROM raid_weeks',
        )[0] as { rank: number; rank_after: number };
        expect(rank.rank_after).toBe(rank.rank + 1);
        expect(text).toContain(`The server climbs to Rank ${String(rank.rank_after)}.`);
        // The jackpot is rolled and recorded behind the scenes; the post never says so.
        expect(
          rows(ctx.sql, "SELECT user_id FROM server_firsts WHERE kind = 'jackpot'"),
        ).toHaveLength(2);
        expect(text.toLowerCase()).not.toContain('jackpot');
        expect(text).toContain('First on the server this week:');
        expect(text).toContain('Splashet caught: Player 3');
        expect(text).not.toContain('Cindle');
        expect(text).not.toContain('Phase 2');
        expect(rows(ctx.sql, 'SELECT key FROM discord_posts ORDER BY id')).toEqual([
          { key: 'raid:2027-W02:weekStart:all' },
          { key: 'raid:2027-W02:phase1:1' },
          { key: 'raid:2027-W02:phase2:1' },
          { key: 'raid:2027-W02:finale:1' },
        ]);
      },
      { start: W02.monday },
    );
  });
});

describe('a Festival week', () => {
  const SHIFT = 4 * 7 * DAY; // 2027-W06
  const FESTIVAL = {
    id: '2027-W06',
    monday: W02.monday + SHIFT,
    afterFinale: W02.afterFinale + SHIFT,
  };

  it('says "Festival week" on Monday, and the finale post names the creature and the rank easing', async () => {
    await runRaid(
      async (ctx) => {
        const players = await openWeek(ctx, 3, {
          name: (i) => (i === 1 ? '_Ace_ @everyone' : `Player ${String(i)}`),
        });
        const creature = content.creatures.find(
          (c) => c.festival === true && c.id === 'hearthshell',
        );
        expect(creature).toBeDefined();
        const monday = posts(ctx)[0]?.content ?? '';
        const rank = rows<{ rank: number }>(ctx.sql, 'SELECT rank FROM raid_weeks')[0]?.rank;
        expect(monday).toContain(`Boss Rank ${String(rank)}.`);
        expect(monday).toContain('Festival week: Hearthshell for every winner, bonus Essence.');

        forcePool(ctx.sql, 3_000);
        ctx.clock.t = FESTIVAL.afterFinale;
        ctx.core.raid.runDue(HELSINKI);
        const finale = posts(ctx).find((p) => p.key === `raid:${FESTIVAL.id}:finale:1`);
        const text = finale?.content ?? '';
        expect(text.startsWith('**Finale: ')).toBe(true);
        // Every member of the winning party got it; names are escaped.
        expect(text).toContain('Festival creature: Hearthshell for ');
        expect(text).toContain('\\_Ace\\_ @\u200Beveryone');
        expect(text).not.toMatch(/@(?!\u200B)/);
        expect(text).toContain('Player 2');
        expect(text).toContain('Player 3');
        // The Festival is over: the server eases by one.
        const week = rows<{ rank: number; rank_after: number }>(
          ctx.sql,
          'SELECT rank, rank_after FROM raid_weeks',
        )[0] as { rank: number; rank_after: number };
        expect(week.rank_after).toBe(Math.max(1, week.rank - 1));
        expect(text).toContain(
          week.rank_after < week.rank
            ? `The Festival is over. The server eases to Rank ${String(week.rank_after)}.`
            : `Rank ${String(week.rank_after)} stays.`,
        );
        // Bonus Essence is what the post says every player earned.
        expect(text).toContain(`Essence: every player earned ${String(flatPaid(ctx, 'finale'))}`);
        // The first Festival win on the server is one of the records.
        expect(text).toContain('Hearthshell won in a Festival: ');
        expect(players).toHaveLength(3);
      },
      { start: FESTIVAL.monday },
    );
  });
});

describe('findKeyMoment', () => {
  const name = (id: string) => `creature ${id}`;
  const owner = (id: string) => (id === 'guest' ? null : `owner of ${id}`);
  const reaction = (id: string) => `reaction ${id}`;

  it('picks the biggest hit or reaction bonus, the earliest on a tie', () => {
    const events: FightEvent[] = [
      { t: 'round_start', round: 1, bossHp: 100, mark: null },
      {
        t: 'hit',
        round: 1,
        creature: 'a',
        damage: 50,
        matchupBp: 10000,
        bonusBp: 0,
        mark: null,
        bossHp: 50,
      },
      {
        t: 'hit',
        round: 2,
        creature: 'b',
        damage: 80,
        matchupBp: 10000,
        bonusBp: 0,
        mark: null,
        bossHp: 0,
      },
      {
        t: 'hit',
        round: 3,
        creature: 'c',
        damage: 80,
        matchupBp: 10000,
        bonusBp: 0,
        mark: null,
        bossHp: 0,
      },
    ];
    expect(findKeyMoment(events, name, owner, reaction)).toEqual({
      kind: 'hit',
      round: 2,
      creature: 'creature b',
      owner: 'owner of b',
      damage: 80,
    });
    events.push({
      t: 'reaction',
      round: 4,
      reaction: 'steam',
      setupCreature: 'a',
      setupPlayer: 'm1',
      payoff: 'guest',
      bonus: 200,
      reflected: false,
    });
    expect(findKeyMoment(events, name, owner, reaction)).toEqual({
      kind: 'reaction',
      round: 4,
      creature: 'creature guest',
      owner: null,
      reaction: 'reaction steam',
      bonus: 200,
    });
  });

  it('ignores reflected reactions, which hurt our side', () => {
    const events: FightEvent[] = [
      {
        t: 'hit',
        round: 1,
        creature: 'a',
        damage: 10,
        matchupBp: 10000,
        bonusBp: 0,
        mark: null,
        bossHp: 90,
      },
      {
        t: 'reaction',
        round: 1,
        reaction: 'steam',
        setupCreature: null,
        setupPlayer: null,
        payoff: 'a',
        bonus: 999,
        reflected: true,
      },
    ];
    expect(findKeyMoment(events, name, owner, reaction)).toMatchObject({ kind: 'hit', damage: 10 });
    expect(findKeyMoment([], name, owner, reaction)).toBeNull();
  });
});

describe('mostUsedReaction', () => {
  it('picks the most used, the smaller id on a tie, and null for none', () => {
    expect(mostUsedReaction({ steam: 2, overload: 5, wildfire: 5 })).toEqual({
      id: 'overload',
      count: 5,
    });
    expect(mostUsedReaction({ steam: 0 })).toBeNull();
    expect(mostUsedReaction({})).toBeNull();
  });
});

describe('the zero-width space after @', () => {
  it('is what keeps a player called @everyone from pinging in a real post', async () => {
    await runRaid(
      async (ctx) => {
        await openWeek(ctx, 3, { name: () => '@everyone' });
        forcePool(ctx.sql, 20_000);
        ctx.clock.t = W02.afterPhase1;
        ctx.core.raid.runDue(HELSINKI);
        const text = posts(ctx)[1]?.content ?? '';
        expect(text).toContain(`@${ZWSP}everyone`);
        expect(text).not.toContain('@everyone');
      },
      { start: W02.monday },
    );
  });
});
