// The `apply-roster-preset` dev tool and its data (docs/design/dev-tools.md, "Roster presets").
import { RULES, baseMinLevel, content, gearBase, gearContent } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  PRESET_IDS,
  ROSTER_PRESETS,
  gameItemLevel,
  presetItems,
  presetSummary,
} from '../src/dev-presets';
import { speciesOf } from '../src/species';
import { ON, type Json } from './dev-helpers';
import type { CoreContext } from './helpers';
import { sessionCaller } from './kit';
import { count, rows, runRaid } from './raid-helpers';
import { V2_WEEK, v2Player } from './raid-v2-helpers';

const CORE = { ...ON, combatV2: true } as const;

describe('the preset data', () => {
  for (const id of PRESET_IDS) {
    describe(ROSTER_PRESETS[id].name, () => {
      const preset = ROSTER_PRESETS[id];

      it('names real species at levels they can have, at most two to a line', () => {
        const perLine = new Map<string, number>();
        for (const [species, level] of preset.creatures) {
          const s = speciesOf(species);
          expect(level, species).toBeGreaterThanOrEqual(1);
          expect(level, species).toBeLessThanOrEqual(s.levelCap);
          // A line whose first form cannot be caught is a Festival prize: left out.
          const root = content.creatures.find((c) => c.line === s.line && c.stage === 1);
          expect(root?.catchable, `${species} is a Festival prize`).not.toBe(false);
          perLine.set(s.line, (perLine.get(s.line) ?? 0) + 1);
        }
        for (const [line, n] of perLine) expect(n, line).toBeLessThanOrEqual(2);
      });

      it('has the best first, and enough for a Cinder Wyrm piece (4) and spares, with every role', () => {
        const levels = preset.creatures.map(([, level]) => level);
        expect(levels).toEqual([...levels].sort((a, b) => b - a));
        expect(preset.creatures.length).toBeGreaterThanOrEqual(7);
        const summary = presetSummary(preset);
        for (const role of ['setter', 'payoff', 'guard', 'support']) {
          expect(summary.roles[role], role).toBeGreaterThanOrEqual(1);
        }
        // The first eight (what a tester may bring) cover every role and at least three elements.
        const top = preset.creatures.slice(0, 8).map(([s]) => speciesOf(s));
        expect(new Set(top.map((s) => s.role)).size).toBe(4);
        expect(new Set(top.map((s) => s.element)).size).toBeGreaterThanOrEqual(3);
        expect(Object.keys(summary.elements).length).toBeGreaterThanOrEqual(4);
      });

      it('has gear of real bases at item levels they open, a set for each raid creature and spares', () => {
        const items = presetItems(preset);
        expect(items).toHaveLength(preset.sets * 3 + preset.spares);
        expect(items.length).toBeLessThanOrEqual(RULES.gear.inventoryCap);
        expect(preset.sets).toBeGreaterThanOrEqual(4);
        expect(preset.spares).toBeGreaterThanOrEqual(3);
        for (const item of items) {
          const base = gearBase(item.baseId);
          expect(base, item.baseId).toBeDefined();
          expect(item.itemLevel).toBeGreaterThanOrEqual(baseMinLevel(base ?? { minItemLevel: 1 }));
          expect(item.itemLevel).toBeLessThanOrEqual(RULES.gear.maxItemLevel);
        }
        expect(items[0]?.itemLevel).toBe(gameItemLevel(preset.valleyItemLevel));
        // Every piece's base is a real one of the content.
        const ids = new Set(gearContent.bases.map((b) => b.id));
        expect(items.every((i) => ids.has(i.baseId))).toBe(true);
      });
    });
  }

  it('grows with the weeks', () => {
    const sizes = PRESET_IDS.map((id) => ROSTER_PRESETS[id].creatures.length);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    const top = PRESET_IDS.map((id) => ROSTER_PRESETS[id].creatures[0]?.[1] ?? 0);
    expect(top).toEqual([...top].sort((a, b) => a - b));
  });
});

/** Two testers (names Ann and Bo), a guest and a manager-run session. */
async function setup(ctx: CoreContext) {
  const ann = v2Player(ctx, 1, { name: 'Ann' });
  const bo = v2Player(ctx, 2, { name: 'Bo' });
  const guest = v2Player(ctx, 3, { name: 'Guest' });
  ctx.sql.exec("UPDATE players SET user_id = 'dev-guest-1' WHERE user_id = ?", guest.id);
  ctx.sql.exec("UPDATE creatures SET user_id = 'dev-guest-1' WHERE user_id = ?", guest.id);
  const { call } = await sessionCaller<Json['body']>(ctx, { id: ann.id, displayName: 'Ann' });
  return { ann, bo, call };
}

const owned = (ctx: CoreContext, userId: string) => ({
  creatures: count(ctx.sql, 'creatures', `user_id = '${userId}'`),
  items: count(ctx.sql, 'gear_items', `user_id = '${userId}'`),
});

describe('the apply-roster-preset tool', () => {
  it('replaces exactly one player’s creatures and bag, and leaves everyone else alone', async () => {
    await runRaid(
      async (ctx) => {
        const { ann, bo, call } = await setup(ctx);
        const boBefore = rows<{ id: string }>(
          ctx.sql,
          `SELECT id FROM creatures WHERE user_id = '${bo.id}' ORDER BY id`,
        );
        // A bait balance (the ledger stays) and Ann's creature on the board and with a Knack.
        ctx.sql.exec(
          "INSERT INTO ledger (user_id, currency, amount, source, idempotency_key, created_at) VALUES (?, 'bait', 7, 'test', 'k1', ?)",
          ann.id,
          ctx.clock.t,
        );
        const ledgerBefore = count(ctx.sql, 'ledger', `user_id = '${ann.id}'`);
        const res = await call('POST', '/api/dev/apply-roster-preset', {
          preset: 'week-8',
          userId: ann.id,
          confirm: ' ann ',
        });
        expect(res).toMatchObject({
          status: 200,
          body: { result: { preset: 'week-8', players: 1, creatures: 18 } },
        });
        const preset = ROSTER_PRESETS['week-8'];
        expect(owned(ctx, ann.id)).toEqual({
          creatures: preset.creatures.length,
          items: presetItems(preset).length,
        });
        // Bo is as he was.
        expect(
          rows<{ id: string }>(
            ctx.sql,
            `SELECT id FROM creatures WHERE user_id = '${bo.id}' ORDER BY id`,
          ),
        ).toEqual(boBefore);
        expect(owned(ctx, bo.id).items).toBe(0);
        expect(count(ctx.sql, 'ledger', `user_id = '${ann.id}'`)).toBe(ledgerBefore);
        // The new creatures: the preset's species and levels, one v2 talent in slot 1 each, no Knack, no old ones left.
        const made = rows<{ species: string; level: number; knack: string | null; id: string }>(
          ctx.sql,
          `SELECT species, level, knack, id FROM creatures WHERE user_id = '${ann.id}' ORDER BY rowid`,
        );
        expect(made.map((c) => [c.species, c.level])).toEqual(preset.creatures);
        expect(made.every((c) => c.knack === null)).toBe(true);
        for (const c of made) {
          const talents = rows<{ slot: number | null }>(
            ctx.sql,
            `SELECT slot FROM creature_talents_v2 WHERE creature_id = '${c.id}'`,
          );
          expect(talents, c.species).toEqual([{ slot: 1 }]);
        }
        expect(
          count(ctx.sql, 'creature_talents_v2', `creature_id NOT IN (SELECT id FROM creatures)`),
        ).toBe(0);
        // The gear is worn by nobody, with the preset's bases.
        const gear = rows<{
          base_id: string;
          rarity: string;
          item_level: number;
          equipped_on: string | null;
        }>(
          ctx.sql,
          `SELECT base_id, rarity, item_level, equipped_on FROM gear_items WHERE user_id = '${ann.id}' ORDER BY rowid`,
        );
        expect(gear.map((g) => [g.base_id, g.rarity, g.item_level])).toEqual(
          presetItems(preset).map((i) => [i.baseId, i.rarity, i.itemLevel]),
        );
        expect(gear.every((g) => g.equipped_on === null)).toBe(true);
      },
      { start: V2_WEEK.open, core: CORE },
    );
  });

  it('leaves the valley bag counter matching the new bag, with the valley systems on', async () => {
    await runRaid(
      async (ctx) => {
        const { ann, call } = await setup(ctx);
        // A stale counter: the reset drops it, and it is made afresh from the new items.
        ctx.sql.exec('INSERT OR REPLACE INTO valley_bag (user_id, items) VALUES (?, 99)', ann.id);
        const res = await call('POST', '/api/dev/apply-roster-preset', {
          preset: 'week-8',
          userId: ann.id,
          confirm: 'ann',
        });
        expect(res.status).toBe(200);
        const items = presetItems(ROSTER_PRESETS['week-8']).length;
        expect(
          rows<{ items: number }>(
            ctx.sql,
            `SELECT items FROM valley_bag WHERE user_id = '${ann.id}'`,
          ),
        ).toEqual([{ items }]);
      },
      { start: V2_WEEK.open, core: { ...CORE, valleySystems: true } },
    );
  });

  it('takes the replaced creatures off the raid board', async () => {
    await runRaid(
      async (ctx) => {
        const { ann, call } = await setup(ctx);
        ctx.core.raid.currentWeek('Europe/Helsinki');
        const first = ann.creatureIds[0] as string;
        ctx.sql.exec(
          'INSERT INTO raid_placements (week_id, party, slot, user_id, creature_id) VALUES (?, 1, 0, ?, ?)',
          V2_WEEK.id,
          ann.id,
          first,
        );
        const res = await call('POST', '/api/dev/apply-roster-preset', {
          preset: 'week-2',
          userId: ann.id,
          confirm: 'Ann',
        });
        expect(res.status).toBe(200);
        expect(count(ctx.sql, 'raid_placements', `user_id = '${ann.id}'`)).toBe(0);
        expect(owned(ctx, ann.id).creatures).toBe(7);
      },
      { start: V2_WEEK.open, core: CORE },
    );
  });

  it('everyone covers each player once, guests never', async () => {
    await runRaid(
      async (ctx) => {
        const { ann, bo, call } = await setup(ctx);
        const guestBefore = owned(ctx, 'dev-guest-1');
        const res = await call('POST', '/api/dev/apply-roster-preset', {
          preset: 'week-2',
          everyone: true,
          confirm: 'everyone',
        });
        const preset = ROSTER_PRESETS['week-2'];
        expect(res).toMatchObject({
          status: 200,
          body: { result: { players: 2, creatures: 14, items: presetItems(preset).length * 2 } },
        });
        for (const id of [ann.id, bo.id]) {
          expect(owned(ctx, id)).toEqual({ creatures: 7, items: presetItems(preset).length });
        }
        expect(owned(ctx, 'dev-guest-1')).toEqual(guestBefore);
      },
      { start: V2_WEEK.open, core: CORE },
    );
  });

  it('applies a second time as the same roster, not a bigger one', async () => {
    await runRaid(
      async (ctx) => {
        const { ann, call } = await setup(ctx);
        for (let i = 0; i < 2; i++) {
          const res = await call('POST', '/api/dev/apply-roster-preset', {
            preset: 'week-24',
            userId: ann.id,
            confirm: 'Ann',
          });
          expect(res.status).toBe(200);
        }
        expect(owned(ctx, ann.id)).toEqual({
          creatures: 28,
          items: presetItems(ROSTER_PRESETS['week-24']).length,
        });
      },
      { start: V2_WEEK.open, core: CORE },
    );
  });

  it('refuses a wrong confirmation, an unknown player, a guest and a bad body, changing nothing', async () => {
    await runRaid(
      async (ctx) => {
        const { ann, bo, call } = await setup(ctx);
        const before = [owned(ctx, ann.id), owned(ctx, bo.id)];
        const send = (body: unknown) => call('POST', '/api/dev/apply-roster-preset', body);
        expect(await send({ preset: 'week-2', userId: ann.id, confirm: 'Bo' })).toMatchObject({
          status: 409,
          body: { error: 'confirm_mismatch' },
        });
        expect(await send({ preset: 'week-2', everyone: true, confirm: 'Ann' })).toMatchObject({
          status: 409,
          body: { error: 'confirm_mismatch' },
        });
        expect(await send({ preset: 'week-2', userId: 'nobody', confirm: 'nobody' })).toMatchObject(
          {
            status: 404,
          },
        );
        expect(
          await send({ preset: 'week-2', userId: 'dev-guest-1', confirm: 'Guest' }),
        ).toMatchObject({ status: 404 });
        for (const body of [
          { preset: 'week-3', userId: ann.id, confirm: 'Ann' },
          { preset: 'week-2', userId: ann.id },
          { preset: 'week-2', userId: ann.id, everyone: true, confirm: 'Ann' },
          { preset: 'week-2', userId: ann.id, confirm: 'Ann', extra: 1 },
        ]) {
          expect(await send(body)).toMatchObject({ status: 400 });
        }
        expect([owned(ctx, ann.id), owned(ctx, bo.id)]).toEqual(before);
      },
      { start: V2_WEEK.open, core: CORE },
    );
  });

  it('does not exist without combat v2', async () => {
    await runRaid(
      async (ctx) => {
        const { ann, call } = await setup(ctx);
        expect(
          await call('POST', '/api/dev/apply-roster-preset', {
            preset: 'week-2',
            userId: ann.id,
            confirm: 'Ann',
          }),
        ).toMatchObject({ status: 404 });
      },
      { start: V2_WEEK.open, core: ON },
    );
  });

  it('lists the guild’s players (no guests) and the presets for the picker', async () => {
    await runRaid(
      async (ctx) => {
        const { ann, call } = await setup(ctx);
        const res = await call('GET', '/api/dev/players');
        expect(res.status).toBe(200);
        const body = res.body as {
          players: { userId: string; name: string }[];
          presets: { id: string }[];
        };
        expect(body.players.map((p) => p.name)).toEqual(['Ann', 'Bo']);
        expect(body.players[0]).toMatchObject({ userId: ann.id, creatures: 5, items: 0 });
        expect(body.presets.map((p) => p.id)).toEqual([...PRESET_IDS]);
        expect(body.presets[0]).toMatchObject({ creatures: 7, items: 15 });
      },
      { start: V2_WEEK.open, core: CORE },
    );
  });
});
