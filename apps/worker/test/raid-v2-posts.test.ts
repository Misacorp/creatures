// The Discord posts of a combat v2 raid week (docs/design/combat/integration.md, sections 4 and 15): the Monday reveal and a stage post,
// queued by the real scheduler. The text itself is proved in discord-format.test.ts.
import { describe, expect, it } from 'vitest';
import type { PostEmbed, PostMessage } from '../src/discord-format';
import { HELSINKI, rows, runRaid, joinRaid } from './raid-helpers';
import { V2_WEEK, v2Player } from './raid-v2-helpers';

const CHANNEL = '555555555555555555';

const posts = (sql: SqlStorage) =>
  rows<{ key: string; channel_id: string; content: string; status: string }>(
    sql,
    'SELECT key, channel_id, content, status FROM discord_posts ORDER BY id',
  );
const embedOf = (stored: string | undefined): PostEmbed =>
  (JSON.parse(stored ?? '{}') as PostMessage).embeds[0] as PostEmbed;

describe('the Discord posts of a combat v2 week', () => {
  it('queues the reveal on Monday and a stage post at stage 1', async () => {
    await runRaid(
      async (ctx) => {
        const players = [1, 2, 3, 4].map((n) => v2Player(ctx, n, { level: 22 }));
        const [first] = players as [(typeof players)[0]];
        await ctx.core.createSession(
          ctx.guildId,
          { id: first.id, displayName: first.name },
          CHANNEL,
        );
        expect(posts(ctx.sql).map((p) => p.key)).toEqual(['raid:2027-W02:weekStart:all']);
        const reveal = embedOf(posts(ctx.sql)[0]?.content);
        expect(reveal.author).toEqual({ name: 'New raid week · Boss Rank 1' });
        expect(reveal.title).toBe('Tidal Colossus');
        expect(reveal.fields.map((f) => f.name)).toContain('Stage 1');

        joinRaid(ctx, players);
        ctx.clock.t = V2_WEEK.stage1 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        const all = posts(ctx.sql);
        expect(all.map((p) => p.key)).toEqual([
          'raid:2027-W02:weekStart:all',
          'raid:2027-W02:stage1:1',
        ]);
        expect(all[1]).toMatchObject({ channel_id: CHANNEL, status: 'pending' });
        const stage = embedOf(all[1]?.content);
        expect(stage.author).toEqual({ name: 'Raid · Stage 1' });
        expect(stage.fields[0]?.name).toBe('Top fighters');
      },
      { start: V2_WEEK.open, core: { combatV2: true } },
    );
  });
});
