// The read budget of the combat v2 paths (the `COMBAT_V2` flag on; docs/design/combat/integration.md, section 8):
// the creature page load, a Knack save, a talent learn and a role-changing evolution, in the month-old guild of
// `read-world.ts` where every creature carries a v2 talent and a Knack and each player's books are full. Like
// `read-budget.test.ts`: each budget is about 1.5x what the path read when it was set (the measured value is
// next to it), a failure lists the top statements, and a budget is raised only with a reason in the PR. It is a
// file of its own because the guild is seeded once per file.
import { describe, expect, it } from 'vitest';
import { MINUTE } from './raid-helpers';
import { expectReadsUnder } from './read-meter';
import { callAs, inGuild, seedWorld, userId } from './read-world';

/** Budgets, rows read per call (the measured value is in the comment). */
const BUDGET_V2 = {
  '/api/state': 900, // measured 607: the creature page load with the flag on (465 in the v1 world; the v2 books and learned talents add 2 statements, about 140 rows)
  knack: 650, // measured 435: saving a Knack, which answers with the state (the Knack itself is 3 statements)
  learn: 680, // measured 454: learning a talent for Bait (the ledger spend, the book check, the insert), and the state
  evolve: 700, // measured 461: a role-changing evolution with its replacement roll (the line's book is read once per slot), and the state
} as const;

describe('read budget: combat v2', () => {
  it('measures the creature page load, a Knack save, a talent learn and a role-changing evolution with the flag on', async () => {
    await inGuild(async (env) => {
      const { metered, clock } = env;
      const world = await seedWorld(env, { combatV2: true });
      const { core, secrets, creatures } = world;
      const mine = creatures[userId(1)] ?? [];
      const first = mine[0] as string;
      // Warm: the first call of the day pays one-off work.
      clock.t += 6 * MINUTE;
      await callAs(core, secrets, 1, '/api/state');
      clock.t += MINUTE;
      const measured = await metered.measure(() => callAs(core, secrets, 1, '/api/state'));
      const state = measured.reads;
      const body = measured.result as {
        creatures: { id: string; knack?: string | null; talentsV2?: { book: unknown[] } }[];
      };
      // The payload is the v2 one: a Knack and the line's whole book on every creature.
      expect(body.creatures.find((c) => c.id === first)?.talentsV2?.book).toHaveLength(7);
      expect(body.creatures.every((c) => c.knack !== undefined)).toBe(true);

      const knack = (
        await metered.measure(() =>
          callAs(core, secrets, 1, `/api/creatures/${first}/knack`, {
            method: 'PUT',
            body: { knack: null },
          }),
        )
      ).reads;

      // A talent in the line's book that the creature has not learned (it learned only its own).
      const row = metered.sql
        .exec<{ line: string }>('SELECT line FROM creatures WHERE id = ?', first)
        .one();
      const learned = metered.sql
        .exec<{ talent_id: string }>(
          'SELECT talent_id FROM creature_talents_v2 WHERE creature_id = ?',
          first,
        )
        .toArray()
        .map((r) => r.talent_id);
      const other = metered.sql
        .exec<{ talent_id: string }>(
          'SELECT talent_id FROM line_talents WHERE user_id = ? AND line = ?',
          userId(1),
          row.line,
        )
        .toArray()
        .map((r) => r.talent_id)
        .find((id) => !learned.includes(id));
      expect(other, 'a talent in the book that the creature has not learned').toBeDefined();
      const learn = (
        await metered.measure(() =>
          callAs(core, secrets, 1, `/api/creatures/${first}/talents-v2/learn`, {
            method: 'POST',
            body: { talentId: other, idempotencyKey: 'read-budget-learn-0001' },
          }),
        )
      ).reads;

      // A Mossback at level 15 grows into the Payoff Bloomback; its slotted Setter-only talent is replaced.
      const moss = metered.sql
        .exec<{ id: string }>(
          "SELECT id FROM creatures WHERE user_id = ? AND species = 'mossback'",
          userId(1),
        )
        .one().id;
      metered.sql.exec('UPDATE creatures SET level = 15 WHERE id = ?', moss);
      metered.sql.exec('DELETE FROM creature_talents_v2 WHERE creature_id = ?', moss);
      metered.sql.exec(
        "INSERT INTO creature_talents_v2 (creature_id, talent_id, slot, learned_at) VALUES (?, 'owners-mark', 1, 1)",
        moss,
      );
      const evolve = (
        await metered.measure(() =>
          callAs(core, secrets, 1, `/api/creatures/${moss}/evolve`, {
            method: 'POST',
            body: { species: 'bloomback', idempotencyKey: 'read-budget-evolve-0001' },
          }),
        )
      ).reads;

      expectReadsUnder('v2 /api/state', state, BUDGET_V2['/api/state']);
      expectReadsUnder('v2 knack save', knack, BUDGET_V2.knack);
      expectReadsUnder('v2 talent learn', learn, BUDGET_V2.learn);
      expectReadsUnder('v2 evolve', evolve, BUDGET_V2.evolve);
    });
  }, 60_000);
});
