/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment --
   These tests read parts of response bodies (`Json.body` is `any` on purpose). */
/**
 * Phase 5 step 9a: the School's weekly teacher and lessons (migration 65, `valley-school.ts`, the `/api/valley/school*` routes, the
 * `school-teacher` dev tool, learning on the card). Announced on Friday 00:00 guild-local, here Monday to Wednesday; the talent drawn once
 * by the band rule; a student seated before or during the stay learns by the next morning and goes back to its post by itself.
 */
import {
  VALLEY_RULES,
  ValleyViewSchema,
  benefitCounts,
  teacherCandidates,
  type ValleyView,
} from '@creatures/game';
import { combatV2 } from '@creatures/game/combat-v2';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { ON, type Json } from './dev-helpers';
import { runCore, type CoreContext } from './helpers';
import { HOUR, give, newKey, sessionCaller, type SessionCaller } from './kit';
import { count, nextGuild, rows, seedPlayer } from './raid-helpers';
import { grantFirstTalent, learnedOf, recordFound } from '../src/talent-v2-store';

const SYSTEMS = { ...ON, valleySystems: true, combatV2: true, dailyAllowance: true } as const;
const FLAG_OFF = { ...ON, dailyAllowance: true } as const;
const S = VALLEY_RULES.school;
const DAY_MS = 24 * HOUR;
const CHANNEL = '123456789012345678';
// The test clock starts on Friday 2027-01-15 08:00 UTC (10:00 in Helsinki): next Monday's teacher is announced.
const FRIDAY = 1_800_000_000_000;
// Thursday 10:00 Helsinki: the one day between the stay and the announcement.
const THURSDAY = FRIDAY - DAY_MS;
// The teacher of the Monday 2027-01-18 stay.
const WEEK = '2027-01-18';
const MONDAY_NOON = Date.UTC(2027, 0, 18, 10);
const TUESDAY_NOON = Date.UTC(2027, 0, 19, 10);
const TALENT_IDS = Object.keys(combatV2.talents);

interface P {
  id: string;
  creatureIds: string[];
  api: SessionCaller<Json['body']>;
  state: () => Promise<Json>;
}

async function newPlayer(ctx: CoreContext, n: number, species?: string[]): Promise<P> {
  const seeded = seedPlayer(ctx, n, {
    creatures: species?.length ?? 3,
    level: 3,
    ...(species === undefined ? {} : { species }),
  });
  const api = await sessionCaller<Json['body']>(ctx, { id: seeded.id, displayName: seeded.name });
  const p = {
    id: seeded.id,
    creatureIds: seeded.creatureIds,
    api,
    state: () => api.call('GET', '/api/state'),
  };
  await p.state();
  return p;
}

const view = (res: Json): ValleyView => v.parse(ValleyViewSchema, res.body.valley);
const school = (p: P) => p.api.call('GET', '/api/valley/school');
const sit = (p: P, index: number, creatureId: string | null) =>
  p.api.call('POST', '/api/valley/school/seat', { index, creatureId });
const queue = (ctx: CoreContext) =>
  rows<{ key: string; channel_id: string; content: string }>(
    ctx.sql,
    "SELECT key, channel_id, content FROM discord_posts WHERE key LIKE 'school:%' ORDER BY id",
  );
const setChannel = (ctx: CoreContext): void => {
  ctx.sql.exec('UPDATE guild_meta SET announce_channel_id = ? WHERE id = 1', CHANNEL);
};
const lineOf = (ctx: CoreContext, creatureId: string): string =>
  ctx.sql.exec<{ line: string }>('SELECT line FROM creatures WHERE id = ?', creatureId).one().line;
const bookOf = (ctx: CoreContext, userId: string, line: string): string[] =>
  rows<{ talent_id: string }>(
    ctx.sql,
    `SELECT talent_id FROM line_talents WHERE user_id = '${userId}' AND line = '${line}' ORDER BY talent_id`,
  ).map((r) => r.talent_id);
const seatHolds = (ctx: CoreContext, seatId: string): string | null =>
  ctx.sql
    .exec<{ creature_id: string | null }>(
      'SELECT creature_id FROM valley_seats WHERE seat_id = ?',
      seatId,
    )
    .one().creature_id;
const bait = (ctx: CoreContext, p: P): number => ctx.core.balances(p.id).bait;

/** A scout seat of the player's own (the first is free), with `creatureId` posted to it. */
async function postScout(p: P, creatureId: string): Promise<string> {
  const bought = await p.api.call('POST', '/api/valley/seat/buy', {
    idempotencyKey: newKey('seat'),
  });
  expect(bought.status).toBe(200);
  const seatId = bought.body.seatId as string;
  const posted = await p.api.call('POST', '/api/valley/seat', { seatId, creatureId });
  expect(posted.status).toBe(200);
  return seatId;
}

describe('migration 65: the School tables', () => {
  it('creates school_weeks, school_students and the seat home column, empty', async () => {
    await runCore(
      nextGuild(),
      (ctx) => {
        for (const table of ['school_weeks', 'school_students']) {
          expect(count(ctx.sql, `pragma_table_info('${table}')`, "name = 'week_key'"), table).toBe(
            1,
          );
          expect(count(ctx.sql, table)).toBe(0);
        }
        expect(count(ctx.sql, "pragma_table_info('valley_seats')", "name = 'home_seat_id'")).toBe(
          1,
        );
      },
      SYSTEMS,
    );
  });
});

describe('with VALLEY_SYSTEMS off nothing of the School exists', () => {
  it('answers 404 on both routes, writes no row, and the dev tool is gone', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        expect((await school(p)).status).toBe(404);
        expect((await sit(p, 0, p.creatureIds[0] ?? null)).status).toBe(404);
        await ctx.core.alarm();
        expect(count(ctx.sql, 'school_weeks')).toBe(0);
        expect(count(ctx.sql, 'school_students')).toBe(0);
        const dev = await p.api.call('POST', '/api/dev/school-teacher', { mode: 'arrive' });
        expect(dev.status).toBe(404);
      },
      FLAG_OFF,
    );
  });

  it('learning on the card keeps the flat price off the valley', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1, ['sproutle']);
        const id = p.creatureIds[0] ?? '';
        const state = await p.state();
        const creature = (
          state.body.creatures as { id: string; talentsV2?: { learnBait: number } }[]
        ).find((c) => c.id === id);
        // Combat v2 is on here but the valley systems are off: today's flat price.
        expect(creature?.talentsV2?.learnBait).toBe(10);
      },
      { ...ON, combatV2: true, dailyAllowance: true },
    );
  });
});

describe('the teacher is announced Friday and here Monday to Wednesday (V-SCH-11)', () => {
  it('is away from Thursday to Friday 00:00 Helsinki: nothing is shown and no row is made', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = THURSDAY;
        const p = await newPlayer(ctx, 1);
        const away = await school(p);
        expect(away.status).toBe(200);
        expect(away.body).toMatchObject({
          phase: 'away',
          talent: null,
          arrivesAt: null,
          wouldLearn: [],
        });
        expect(count(ctx.sql, 'school_weeks')).toBe(0);
        // Thursday 23:59 Helsinki (21:59 UTC): still away. Friday 00:00 Helsinki (22:00 UTC Thursday): announced.
        ctx.clock.t = Date.UTC(2027, 0, 14, 21, 59);
        expect((await school(p)).body.phase).toBe('away');
        ctx.clock.t = Date.UTC(2027, 0, 14, 22, 0);
        const told = await school(p);
        expect(told.body.phase).toBe('announced');
        expect(told.body.talent).toMatchObject({
          id: expect.any(String),
          name: expect.any(String),
        });
        expect(count(ctx.sql, 'school_weeks')).toBe(1);
        expect(
          ctx.sql.exec<{ week_key: string }>('SELECT week_key FROM school_weeks').one().week_key,
        ).toBe(WEEK);
      },
      SYSTEMS,
    );
  });

  it('shows the stay as Monday 00:00 to Thursday 00:00 Helsinki and is here until then', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        const announced = await school(p);
        expect(announced.body.phase).toBe('announced');
        // Monday 00:00 Helsinki is Sunday 22:00 UTC.
        expect(announced.body.arrivesAt).toBe(Date.UTC(2027, 0, 17, 22));
        expect(announced.body.leavesAt).toBe(
          Date.UTC(2027, 0, 17, 22) + S.teacherStayDays * DAY_MS,
        );
        ctx.clock.t = MONDAY_NOON;
        expect((await school(p)).body.phase).toBe('here');
        // Wednesday 23:59 Helsinki (21:59 UTC): still here; Thursday 00:00: gone.
        ctx.clock.t = Date.UTC(2027, 0, 20, 21, 59);
        expect((await school(p)).body.phase).toBe('here');
        ctx.clock.t = Date.UTC(2027, 0, 20, 22, 0);
        expect((await school(p)).body.phase).toBe('away');
        // One row for the whole announcement and stay.
        expect(count(ctx.sql, 'school_weeks')).toBe(1);
      },
      SYSTEMS,
    );
  });

  it('wakes the object for Friday 00:00 (a pure time, after now)', async () => {
    await runCore(
      nextGuild(),
      (ctx) => {
        const weeks = ctx.core.valleySchoolWeeks;
        if (weeks === null) throw new Error('no school');
        expect(weeks.nextAnnounceAt(Date.UTC(2027, 0, 12, 12))).toBe(Date.UTC(2027, 0, 14, 22));
        expect(weeks.nextAnnounceAt(FRIDAY)).toBe(Date.UTC(2027, 0, 21, 22));
        expect(weeks.nextAnnounceAt(Date.UTC(2027, 0, 14, 22))).toBe(Date.UTC(2027, 0, 21, 22));
      },
      SYSTEMS,
    );
  });

  it('the alarm at Friday 00:00 draws the talent and queues one post with the name and Discord time stamps', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = THURSDAY;
        await newPlayer(ctx, 1);
        setChannel(ctx);
        await ctx.core.ensureAlarm();
        const armed = await ctx.storage.getAlarm();
        expect(armed).not.toBeNull();
        expect(armed ?? 0).toBeLessThanOrEqual(Date.UTC(2027, 0, 14, 22));
        ctx.clock.t = Date.UTC(2027, 0, 14, 22, 0, 5);
        await ctx.core.alarm();
        expect(count(ctx.sql, 'school_weeks')).toBe(1);
        const posts = queue(ctx);
        expect(posts).toHaveLength(1);
        expect(posts[0]?.key).toBe(`school:${WEEK}`);
        const row = ctx.sql
          .exec<{ talent_id: string; posted_at: number | null }>(
            'SELECT talent_id, posted_at FROM school_weeks',
          )
          .one();
        expect(row.posted_at).not.toBeNull();
        const text = posts[0]?.content ?? '';
        expect(text).toContain(combatV2.talents[row.talent_id]?.name ?? '?');
        // The stay's first day and its last (a second before Thursday 00:00 Helsinki), as date stamps.
        expect(text).toContain(`<t:${String(Date.UTC(2027, 0, 17, 22) / 1000)}:D>`);
        expect(text).toContain(`<t:${String((Date.UTC(2027, 0, 20, 22) - 1000) / 1000)}:D>`);
        await ctx.core.alarm();
        expect(queue(ctx)).toHaveLength(1);
        expect(count(ctx.sql, 'school_weeks')).toBe(1);
      },
      SYSTEMS,
    );
  });
});

describe('the weekly pick (V-SCH-12)', () => {
  it('draws a talent the band rule allows from the books as they stand, and never golden', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        // Eight players on mixed lines; two have found a talent each.
        const lines = ['splashet', 'cindle', 'sproutle', 'zipmouse', 'mistnewt', 'ashmole'];
        for (let n = 1; n <= 8; n++) {
          const own = [lines[n % 6] ?? 'splashet', lines[(n + 2) % 6] ?? 'cindle'];
          await newPlayer(ctx, n, own);
        }
        const first = ctx.sql
          .exec<{ user_id: string; line: string }>('SELECT user_id, line FROM creatures LIMIT 1')
          .one();
        const pool = combatV2.pools[first.line] ?? [];
        recordFound(
          ctx.sql,
          first.user_id,
          first.line,
          { talentId: pool[0] ?? '', golden: false },
          ctx.clock.t,
        );
        const p = await sessionCaller<Json['body']>(ctx, { id: first.user_id, displayName: 'x' });
        const told = await p.call('GET', '/api/valley/school');
        expect(told.status).toBe(200);
        const row = ctx.sql
          .exec<{ talent_id: string; players: number; benefits: number }>(
            'SELECT talent_id, players, benefits FROM school_weeks',
          )
          .one();
        // Recompute the candidates from the same tables.
        const owned = rows<{ user_id: string; line: string }>(
          ctx.sql,
          'SELECT DISTINCT user_id, line FROM creatures',
        );
        const books = rows<{ user_id: string; line: string; talent_id: string }>(
          ctx.sql,
          'SELECT user_id, line, talent_id FROM line_talents',
        );
        const players = [...new Set(owned.map((o) => o.user_id))].map((id) => ({
          lines: new Map(
            owned
              .filter((o) => o.user_id === id)
              .map((o) => [
                o.line,
                new Set(
                  books
                    .filter((b) => b.user_id === id && b.line === o.line)
                    .map((b) => b.talent_id),
                ),
              ]),
          ),
        }));
        const counts = benefitCounts(TALENT_IDS, combatV2.pools, players);
        const allowed = teacherCandidates(counts, players.length).map((i) => TALENT_IDS[i]);
        expect(players).toHaveLength(8);
        expect(row.players).toBe(8);
        expect(allowed).toContain(row.talent_id);
        // A few players (2 up to a quarter of 8), never everyone.
        expect(row.benefits).toBe(counts[TALENT_IDS.indexOf(row.talent_id)]);
        expect(row.benefits).toBeGreaterThanOrEqual(1);
        expect(row.benefits).toBeLessThan(8);
        // The pick never wrote a book entry (golden or not).
        expect(count(ctx.sql, 'line_talents')).toBe(1);
      },
      SYSTEMS,
    );
  });

  it('is made once: a later change of the books does not draw again', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        const first = (await school(p)).body.talent.id;
        const line = lineOf(ctx, p.creatureIds[0] ?? '');
        for (const id of combatV2.pools[line] ?? []) {
          recordFound(ctx.sql, p.id, line, { talentId: id, golden: false }, ctx.clock.t);
        }
        expect((await school(p)).body.talent.id).toBe(first);
        expect(count(ctx.sql, 'school_weeks')).toBe(1);
      },
      SYSTEMS,
    );
  });

  it('draws no talent when nobody benefits (no teacher that week), and says so', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1, ['sproutle']);
        for (const id of combatV2.pools['sproutle'] ?? []) {
          recordFound(ctx.sql, p.id, 'sproutle', { talentId: id, golden: false }, ctx.clock.t);
        }
        setChannel(ctx);
        const told = await school(p);
        expect(told.body).toMatchObject({ phase: 'announced', talent: null, wouldLearn: [] });
        expect(
          ctx.sql.exec<{ talent_id: string | null }>('SELECT talent_id FROM school_weeks').one()
            .talent_id,
        ).toBeNull();
        expect(queue(ctx)).toHaveLength(0);
        expect((await sit(p, 0, p.creatureIds[0] ?? null)).body).toMatchObject({
          error: 'no_teacher',
        });
      },
      SYSTEMS,
    );
  });
});

describe('a lesson (V-SCH-13)', () => {
  it('seats a creature off its post, teaches it by the next morning and sends it back', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1, ['sproutle']);
        const pip = p.creatureIds[0] ?? '';
        const scout = await postScout(p, pip);
        const told = await school(p);
        const talent = told.body.talent.id as string;
        const line = lineOf(ctx, pip);
        expect(told.body.wouldLearn).toContain(pip);
        // The seat takes the creature off its post.
        const seated = await sit(p, 0, pip);
        expect(seated.status).toBe(200);
        expect(seatHolds(ctx, scout)).toBeNull();
        const afterSeat = await school(p);
        expect(afterSeat.body.seats[0]).toMatchObject({ index: 0, creatureId: pip });
        // It learns by the next morning: Tuesday 00:00 Helsinki (Monday 22:00 UTC) for a student seated before the arrival.
        expect(afterSeat.body.seats[0].learnsAt).toBe(Date.UTC(2027, 0, 18, 22));
        // Not on Monday noon.
        ctx.clock.t = MONDAY_NOON;
        await p.state();
        expect(bookOf(ctx, p.id, line)).not.toContain(talent);
        expect(seatHolds(ctx, scout)).toBeNull();
        // On Tuesday: the talent is in the book (never golden) and the student is back at its post.
        ctx.clock.t = TUESDAY_NOON;
        await p.state();
        const entry = ctx.sql
          .exec<{ golden: number }>(
            'SELECT golden FROM line_talents WHERE user_id = ? AND line = ? AND talent_id = ?',
            p.id,
            line,
            talent,
          )
          .toArray()[0];
        expect(entry?.golden).toBe(0);
        expect(seatHolds(ctx, scout)).toBe(pip);
        expect((await school(p)).body.seats[0]).toMatchObject({ creatureId: null, learnsAt: null });
        expect(
          ctx.sql
            .exec<{ lessons: number }>(
              'SELECT lessons FROM school_students WHERE user_id = ? AND week_key = ?',
              p.id,
              WEEK,
            )
            .one().lessons,
        ).toBe(1);
        // The talent is in the book only: the creature learns it on its card.
        expect(learnedOf(ctx.sql, pip).map((l) => l.talentId)).not.toContain(talent);
      },
      SYSTEMS,
    );
  });

  it('a student seated on a day of the stay learns by the next morning', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1, ['sproutle']);
        const pip = p.creatureIds[0] ?? '';
        ctx.clock.t = MONDAY_NOON;
        const talent = (await school(p)).body.talent.id as string;
        expect((await sit(p, 0, pip)).status).toBe(200);
        // Seated Monday 12:00 UTC: Tuesday 00:00 Helsinki.
        expect((await school(p)).body.seats[0].learnsAt).toBe(Date.UTC(2027, 0, 18, 22));
        ctx.clock.t = Date.UTC(2027, 0, 18, 22, 1);
        await p.state();
        expect(bookOf(ctx, p.id, lineOf(ctx, pip))).toContain(talent);
      },
      SYSTEMS,
    );
  });

  it('a student that cannot learn (the book has it by then) goes home with nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1, ['sproutle']);
        const pip = p.creatureIds[0] ?? '';
        const talent = (await school(p)).body.talent.id as string;
        expect((await sit(p, 0, pip)).status).toBe(200);
        // A find puts the talent in the book before the morning.
        recordFound(
          ctx.sql,
          p.id,
          lineOf(ctx, pip),
          { talentId: talent, golden: true },
          ctx.clock.t,
        );
        ctx.clock.t = TUESDAY_NOON;
        await p.state();
        // Still golden (the lesson never touches a found entry) and one entry only.
        expect(
          ctx.sql
            .exec<{ golden: number }>(
              'SELECT golden FROM line_talents WHERE user_id = ? AND talent_id = ?',
              p.id,
              talent,
            )
            .one().golden,
        ).toBe(1);
        expect(count(ctx.sql, 'school_students', `user_id = '${p.id}' AND lessons > 0`)).toBe(0);
        expect((await school(p)).body.seats[0].creatureId).toBeNull();
      },
      SYSTEMS,
    );
  });

  it('refuses a creature that would not learn, a second student of the line, a seat that does not exist and a stranger', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        // A cindle's or a splashet's line may not hold the talent.
        const p = await newPlayer(ctx, 1, ['sproutle', 'cindle', 'splashet']);
        const told = await school(p);
        const learners = told.body.wouldLearn as string[];
        const first = learners[0] ?? '';
        const none = p.creatureIds.find((id) => !learners.includes(id));
        if (none !== undefined) {
          expect((await sit(p, 0, none)).body).toMatchObject({ error: 'would_not_learn' });
        }
        // Another creature of the first one's line (a second slot of the line) is a second student of that line.
        const twin = p.creatureIds.find((id) => id !== first) ?? '';
        ctx.sql.exec(
          'UPDATE creatures SET line = ?, line_slot = 2 WHERE id = ?',
          lineOf(ctx, first),
          twin,
        );
        expect((await sit(p, 0, first)).status).toBe(200);
        expect((await sit(p, 1, twin)).body).toMatchObject({ error: 'line_seated' });
        expect((await sit(p, S.seats, first)).status).toBe(400);
        const other = await newPlayer(ctx, 2, ['zipmouse']);
        expect((await sit(p, 1, other.creatureIds[0] ?? '')).status).toBe(404);
        // Away: no teacher.
        ctx.clock.t = THURSDAY;
        expect((await sit(p, 1, twin)).body).toMatchObject({ error: 'no_teacher' });
      },
      SYSTEMS,
    );
  });

  it('seating again swaps with the old student, and emptying a seat puts the student back at its post', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1, ['sproutle', 'cindle', 'splashet']);
        const told = await school(p);
        const learners = told.body.wouldLearn as string[];
        expect(learners.length).toBeGreaterThanOrEqual(2);
        const [a, b] = learners as [string, string];
        const scoutA = await postScout(p, a);
        expect((await sit(p, 0, a)).status).toBe(200);
        expect(seatHolds(ctx, scoutA)).toBeNull();
        // Emptying the seat sends it back to its post.
        expect((await sit(p, 0, null)).status).toBe(200);
        expect(seatHolds(ctx, scoutA)).toBe(a);
        // A student of the same seat is displaced by another: the displaced goes home.
        expect((await sit(p, 0, a)).status).toBe(200);
        expect((await sit(p, 0, b)).status).toBe(200);
        expect(seatHolds(ctx, scoutA)).toBe(a);
        expect((await school(p)).body.seats[0].creatureId).toBe(b);
      },
      SYSTEMS,
    );
  });
});

describe('the Gazette (V-SCH-11, 13)', () => {
  it('tells the announcement once per teacher week, and the lesson learned, ranked with the others', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1, ['sproutle']);
        const pip = p.creatureIds[0] ?? '';
        ctx.clock.t += 12 * HOUR;
        const paper = view(await p.state()).paper;
        const teacher = paper?.headlines.find((h) => h.kind === 'teacher');
        expect(teacher?.talent).toEqual(expect.any(String));
        // Told once: a second return in the same teacher week says nothing of him.
        const talent = teacher?.talent ?? '';
        expect((await sit(p, 0, pip)).status).toBe(200);
        const closed = await p.api.call('POST', '/api/valley/gazette/close', {
          paperId: paper?.id,
        });
        expect(closed.status).toBe(200);
        ctx.clock.t = TUESDAY_NOON;
        const later = view(await p.state()).paper;
        expect(later?.headlines.map((h) => h.kind) ?? []).not.toContain('teacher');
        // The paper's log has the lesson (the headline is one story among the creature stories: the ranking decides if it is told).
        const log = JSON.parse(
          ctx.sql
            .exec<{ log: string }>('SELECT log FROM valley_gazette WHERE user_id = ?', p.id)
            .one().log,
        ) as {
          teacher: string | null;
          lessons: { creatureId: string; talentId: string }[];
          lessonCount: number;
        };
        expect(log.lessons).toEqual([{ creatureId: pip, talentId: talent }]);
        expect(log.lessonCount).toBe(1);
        expect(log.teacher).toBeNull();
      },
      SYSTEMS,
    );
  });

  it('tells nothing of him when the return falls while he is away', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = THURSDAY;
        const p = await newPlayer(ctx, 1);
        ctx.clock.t += 12 * HOUR;
        const paper = view(await p.state()).paper;
        expect(paper?.headlines.map((h) => h.kind) ?? []).not.toContain('teacher');
        expect(count(ctx.sql, 'school_students')).toBe(0);
      },
      SYSTEMS,
    );
  });
});

describe('learning on the card (V-SCH-10)', () => {
  it('costs the price times the slot it fills, in Acorns, once, with a keyed retry that charges once', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1, ['sproutle']);
        const id = p.creatureIds[0] ?? '';
        const line = lineOf(ctx, id);
        const pool = combatV2.pools[line] ?? [];
        // It has learned its found talent (slot 1); a second talent sits in the book, unlearned.
        grantFirstTalent(
          ctx.sql,
          { nextU32: () => 0 },
          { creatureId: id, userId: p.id, line, now: ctx.clock.t },
        );
        const other = pool.find((t) => !learnedOf(ctx.sql, id).some((l) => l.talentId === t)) ?? '';
        recordFound(ctx.sql, p.id, line, { talentId: other, golden: false }, ctx.clock.t);
        give(ctx, p.id, { bait: 500 });
        const creatureOf = async () =>
          (
            (await p.state()).body.creatures as { id: string; talentsV2: { learnBait: number } }[]
          ).find((c) => c.id === id);
        // The second slot: price x 2.
        expect((await creatureOf())?.talentsV2.learnBait).toBe(S.price * 2);
        const before = bait(ctx, p);
        const key = newKey('learn');
        const learn = () =>
          p.api.call('POST', `/api/creatures/${id}/talents-v2/learn`, {
            talentId: other,
            idempotencyKey: key,
          });
        expect((await learn()).status).toBe(200);
        expect(bait(ctx, p)).toBe(before - S.price * 2);
        // The retry returns the stored result and takes nothing, though the next learning would cost more.
        expect((await learn()).status).toBe(200);
        expect(bait(ctx, p)).toBe(before - S.price * 2);
        // Learned twice is refused.
        expect(
          (
            await p.api.call('POST', `/api/creatures/${id}/talents-v2/learn`, {
              talentId: other,
              idempotencyKey: newKey('learn'),
            })
          ).status,
        ).toBe(409);
      },
      SYSTEMS,
    );
  });
});

describe('the staging tool', () => {
  it('school-teacher arrive brings him on any weekday, announce announces next week now, both once, and valley-fresh clears the week', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = THURSDAY;
        const p = await newPlayer(ctx, 1, ['sproutle']);
        setChannel(ctx);
        expect((await school(p)).body.phase).toBe('away');
        const announced = await p.api.call('POST', '/api/dev/school-teacher', { mode: 'announce' });
        expect(announced.status).toBe(200);
        expect(announced.body.result).toMatchObject({
          weekKey: '2027-01-18',
          phase: 'announced',
          posted: true,
        });
        expect((await school(p)).body.phase).toBe('announced');
        expect(queue(ctx)).toHaveLength(1);
        const brought = await p.api.call('POST', '/api/dev/school-teacher', { mode: 'arrive' });
        expect(brought.status).toBe(200);
        expect(brought.body.result).toMatchObject({ weekKey: '2027-01-11', phase: 'here' });
        expect((await school(p)).body.phase).toBe('here');
        // Safe to repeat: the weeks keep their talents and posts.
        const again = await p.api.call('POST', '/api/dev/school-teacher', { mode: 'announce' });
        expect(again.body.result.talentId).toBe(announced.body.result.talentId);
        expect(queue(ctx)).toHaveLength(2);
        // A bad body is refused; a student can sit on a Tuesday while he is brought.
        expect((await p.api.call('POST', '/api/dev/school-teacher', { mode: 'now' })).status).toBe(
          400,
        );
        expect((await sit(p, 0, p.creatureIds[0] ?? null)).status).toBe(200);
        // The brought stay ends with its week (Monday 00:00 Helsinki): the announced one is the next stay.
        ctx.clock.t = Date.UTC(2027, 0, 17, 22, 0);
        expect((await school(p)).body.phase).toBe('here');
        ctx.clock.t = Date.UTC(2027, 0, 20, 22, 0);
        expect((await school(p)).body.phase).toBe('away');
        expect(count(ctx.sql, 'school_weeks')).toBe(2);
        const fresh = await p.api.call('POST', '/api/dev/valley-fresh', {});
        expect(fresh.status).toBe(200);
        expect(count(ctx.sql, 'school_weeks')).toBe(0);
        expect(count(ctx.sql, 'school_students')).toBe(0);
      },
      SYSTEMS,
    );
  });
});
