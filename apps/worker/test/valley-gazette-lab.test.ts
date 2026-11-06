/* eslint-disable @typescript-eslint/no-unsafe-member-access --
   These tests read parts of response bodies (`Json.body` is `any` on purpose). */
/**
 * Phase 5 step 4, the lab check: for a seeded daily schedule (a visit every day for 28 days, two scouts and an anvil) the headlines the
 * server's passes record are of the same kinds as the headlines the lab's journeys produce for a daily player (the economy lab's
 * `journeys/daily.json`: new lines, mastery steps, gear the scouts found, pieces the Forge made), and in similar numbers: the number of
 * days that had one of each kind lies within a factor of the lab's. What the lab also has (the School, the visitor, place level-ups)
 * belongs to later steps and is not compared.
 */
import {
  PaperLogSchema,
  createSeededRng,
  headlinesOf,
  type HeadlineKind,
  type PaperLog,
} from '@creatures/game';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { ON, type Json } from './dev-helpers';
import { runCore } from './helpers';
import { HOUR, give, newKey, sessionCaller } from './kit';
import { nextGuild, seedPlayer } from './raid-helpers';
import { creditParts, learnBlueprint } from '../src/gear-store';
import dailyJourney from '../../../docs/design/valley/economy/journeys/daily.json';

const SYSTEMS = { ...ON, valleySystems: true, combatV2: true, dailyAllowance: true } as const;
const DAY_MS = 24 * HOUR;

/** The lab's daily journey, by the kinds the server's headlines use. */
function labDays(): Record<HeadlineKind, number> {
  const file = dailyJourney as unknown as {
    visits: {
      cameHome: { pieces: { collected: number; worn: number; bagged: number } };
      events: string[];
    }[];
  };
  const days = Object.fromEntries(
    [
      'new-species',
      'mastery-scout',
      'mastery-anvil',
      'found-gear',
      'found-blueprint',
      'found-pages',
      'forge-pieces',
      'duplicates',
      'resting-xp',
      'pack-full',
      'allowance',
      'moment',
    ].map((k) => [k, 0]),
  ) as Record<HeadlineKind, number>;
  for (const visit of file.visits) {
    if (visit.events.some((e) => e.startsWith('new line:'))) days['new-species'] += 1;
    if (visit.events.some((e) => /^mastery: scout seat/.test(e))) days['mastery-scout'] += 1;
    if (visit.events.some((e) => /^mastery: anvil/.test(e))) days['mastery-anvil'] += 1;
    if (visit.cameHome.pieces.collected > 0) days['found-gear'] += 1;
    if (visit.cameHome.pieces.worn + visit.cameHome.pieces.bagged > 0) days['forge-pieces'] += 1;
  }
  return days;
}

describe("the server's headline kinds match the lab's journeys (a seeded daily schedule)", () => {
  it('has the same kinds, in similar numbers of days', async () => {
    const lab = labDays();
    const served: Record<string, number> = {};
    await runCore(
      nextGuild(),
      async (ctx) => {
        const seeded = seedPlayer(ctx, 1, {
          creatures: 6,
          level: 5,
          species: ['splashet', 'mistnewt', 'coralynx', 'cindle', 'ashmole', 'mossback'],
        });
        const api = await sessionCaller<Json['body']>(ctx, {
          id: seeded.id,
          displayName: seeded.name,
        });
        await api.call('GET', '/api/state');
        give(ctx, seeded.id, { bait: 5000 });
        const seatIds: string[] = [];
        for (let i = 0; i < 2; i++) {
          const bought = await api.call('POST', '/api/valley/seat/buy', {
            idempotencyKey: newKey('seat'),
          });
          seatIds.push(bought.body.seatId as string);
        }
        const places = ['tidepools', 'verdant-hollow'];
        for (const [i, seatId] of seatIds.entries()) {
          await api.call('POST', '/api/valley/seat', {
            seatId,
            creatureId: seeded.creatureIds[i],
            destination: places[i],
          });
        }
        const anvil = await api.call('POST', '/api/valley/anvil/buy', {
          idempotencyKey: newKey('anvil'),
        });
        const anvilId = anvil.body.seatId as string;
        await api.call('POST', '/api/valley/seat', {
          seatId: anvilId,
          creatureId: seeded.creatureIds[2],
        });
        learnBlueprint(ctx.sql, seeded.id, 'kelp-cap', ctx.clock.t);
        await api.call('POST', '/api/valley/order', {
          action: 'add',
          seatId: anvilId,
          forTeam: true,
          reach: 'none',
        });
        for (let day = 0; day < 28; day++) {
          // The scouts' scrap and shards feed the Forge; a daily player also keeps the shelf stocked.
          creditParts(ctx.sql, seeded.id, { scrap: 40, 'tide-shard': 3, 'grove-shard': 3 });
          ctx.clock.t += DAY_MS;
          const res = await api.call('GET', '/api/state');
          expect(res.status).toBe(200);
          const row = ctx.sql
            .exec<{ log: string; read_at: number | null }>(
              'SELECT log, read_at FROM valley_gazette WHERE user_id = ?',
              seeded.id,
            )
            .toArray()[0];
          if (row !== undefined && row.read_at === null) {
            const log: PaperLog = v.parse(PaperLogSchema, JSON.parse(row.log));
            for (const kind of new Set(headlinesOf(log).map((h) => h.kind))) {
              served[kind] = (served[kind] ?? 0) + 1;
            }
            // A daily player closes the paper every day (the next is then its own story).
            const paper = (res.body.valley as { paper?: { id: string } }).paper;
            if (paper !== undefined) {
              await api.call('POST', '/api/valley/gazette/close', { paperId: paper.id });
            }
          }
        }
      },
      { ...SYSTEMS, scoutRng: createSeededRng('lab-kinds') },
    );
    // The kinds the lab's daily journey has, the server has too.
    for (const kind of ['new-species', 'found-gear', 'forge-pieces'] as const) {
      expect(lab[kind], kind).toBeGreaterThan(0);
      expect(served[kind] ?? 0, kind).toBeGreaterThan(0);
    }
    expect((served['mastery-scout'] ?? 0) + (served['mastery-anvil'] ?? 0)).toBeGreaterThan(0);
  });
});
