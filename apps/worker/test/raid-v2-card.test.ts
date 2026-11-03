// The v2 week view's board parts (docs/design/combat/integration.md, section 9): the boss card (armour, rule cards, the Escalating meter,
// the plain attack and the moves with their library labels), the lap's track and the move preview, which is the engine's own targeting
// over the board as it stands. A v1 view has none of it.
import { describe, expect, it } from 'vitest';
import type { CoreContext } from './helpers';
import type { RaidV2Part } from '../src/raid-v2-view';
import { HELSINKI, joinRaid, rows, runRaid } from './raid-helpers';
import { V2_WEEK, v2Player } from './raid-v2-helpers';

const V2 = { combatV2: true } as const;
const run = (fn: (ctx: CoreContext) => void) =>
  runRaid(fn, { start: V2_WEEK.open, core: V2 });

const v2Of = (ctx: CoreContext, id: string): RaidV2Part => {
  const v = ctx.core.raid.view(id, HELSINKI).v2;
  if (v === undefined) throw new Error('not a v2 view');
  return v;
};

const setSlot = (ctx: CoreContext, slot: number): void => {
  ctx.sql.exec(
    'INSERT INTO raid_track (id, slot, best_share_bp, failed_weekends) VALUES (1, ?, 0, 0)',
    slot,
  );
};

describe('the v2 week view: boss card, track and preview', () => {
  it('shows the tutorial boss with no rule card and no Escalating meter', async () => {
    await run((ctx) => {
      const a = v2Player(ctx, 1);
      const v = v2Of(ctx, a.id);
      expect(v.slot).toBe(1);
      expect(v.card.cards).toEqual([]);
      expect(v.card.escalation).toBeNull();
      expect(v.card.armour).toBeGreaterThan(0);
      // The plain attack and the moves keep their labels (the moves are the boss's attacks, not rules).
      expect(v.card.plain.label).toBe('Front Sweep');
      expect(v.card.moves.length).toBeGreaterThan(0);
      const spear = v.card.moves.find((m) => m.id === 'deepwater-spear');
      expect(spear).toMatchObject({
        name: 'Deepwater Spear',
        label: 'Nemesis Lance',
        shape: 'columns',
        every: 3,
        turn: 1,
        windUp: false,
        later: false,
      });
      expect(v.card.moves.find((m) => m.id === 'riptide')?.windUp).toBe(true);
    });
  });

  it('shows a later boss with its rule cards and its Escalating meter', async () => {
    await run((ctx) => {
      setSlot(ctx, 3);
      const a = v2Player(ctx, 1);
      const v = v2Of(ctx, a.id);
      expect(v.slot).toBe(3);
      expect(v.card.cards.length).toBeGreaterThan(0);
      expect(v.card.cards.every((c) => c.name !== '' && c.asks !== '' && c.id !== 'plain')).toBe(
        true,
      );
      expect(v.card.escalation).toMatchObject({ step: 0 });
      expect(v.card.strengthBp).toBeGreaterThan(0);
      expect(v.card.strengthBp).toBeLessThanOrEqual(10_000);
      // The two-row boss has two rows: its turns run from row 1 to row 2.
      expect(v.rows).toBe(2);
      expect(Math.max(...v.card.moves.map((m) => m.turn))).toBeLessThanOrEqual(1);
    });
  });

  it('names the five bosses of the lap and the one this week fights, on every lap', async () => {
    await run((ctx) => {
      setSlot(ctx, 8);
      const a = v2Player(ctx, 1);
      const { track } = v2Of(ctx, a.id);
      expect(track.order.map((b) => b.id)).toEqual([
        'tidal-colossus',
        'cinder-wyrm',
        'storm-sovereign',
        'old-bogback',
        'thornmother',
      ]);
      expect(track.order.every((b) => b.name !== '')).toBe(true);
      // Slot 8 is the third boss of the second lap.
      expect(track.index).toBe(2);
    });
  });

  it('previews the slots of each fixed-rule move and the plain attack, and leaves a Wind-up move unaimed', async () => {
    await run((ctx) => {
      const players = [1, 2, 3, 4].map((n) => v2Player(ctx, n));
      const [a] = players as [(typeof players)[0]];
      expect(v2Of(ctx, a.id).preview).toBeNull();
      joinRaid(ctx, players);
      const v = v2Of(ctx, a.id);
      const preview = v.preview;
      expect(preview).not.toBeNull();
      const standing = new Set(
        rows<{ slot: number }>(ctx.sql, 'SELECT slot FROM raid_placements').map((r) => r.slot),
      );
      // The plain attack is aimed at a creature standing on the board (the front-most, or a taunter).
      expect(standing.has(preview?.plain ?? -1)).toBe(true);
      // Every fixed move names creatures that stand; a Wind-up move (Riptide) and a roll (Backflow's Wild) are null.
      const moves = preview?.moves ?? {};
      expect(moves['riptide']).toBeNull();
      expect(moves['rogue-wave']).toBeNull();
      const fixed = Object.entries(moves).filter(([, slots]) => slots !== null);
      expect(fixed.length).toBeGreaterThan(0);
      for (const [, slots] of fixed) expect((slots ?? []).every((s) => standing.has(s))).toBe(true);
      // Undertow sweeps the whole front row (row 0), so exactly the creatures of row 0 are lit.
      const front = v.creatures.filter((c) => c.row === 0).map((c) => c.slot);
      expect([...(moves['undertow'] ?? [])].sort((x, y) => x - y)).toEqual(
        front.sort((x, y) => x - y),
      );
    });
  });

  it('gives each board creature its Knack name', async () => {
    await run((ctx) => {
      const players = [1, 2].map((n) => v2Player(ctx, n));
      joinRaid(ctx, players);
      const board = v2Of(ctx, (players[0] as (typeof players)[0]).id).creatures;
      expect(board.length).toBe(6);
      expect(board.every((c) => c.knack !== null && c.knackName !== null)).toBe(true);
    });
  });
});
