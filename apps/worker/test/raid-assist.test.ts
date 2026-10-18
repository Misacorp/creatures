import { compactRow } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { awayMembers } from '../src/raid-assist';
import { buildPartyBoard, buildPhaseInput } from '../src/raid-resolve';
import { partyMembers } from '../src/raid-roster';
import { eventTimes } from '../src/raid-schedule';
import { LATEST_SCHEMA_VERSION, undoPlacedByMigration, type CoreContext } from './helpers';
import { HELSINKI, HOUR, W02, count, rows, runRaid, seedPlayer, type Seeded } from './raid-helpers';

const WEEK_START = eventTimes(W02.id, HELSINKI).weekStart;
/** Seen before the week began: away. */
const BEFORE = WEEK_START - HOUR;

type Placement = { creature_id: string; slot: number; user_id: string; placed_by: string | null };
const placements = (ctx: CoreContext): Placement[] =>
  rows<Placement>(
    ctx.sql,
    'SELECT creature_id, slot, user_id, placed_by FROM raid_placements ORDER BY slot',
  );

/** Two players (so guests fill the row): `me` is here, `gone` has not opened the game this week. */
function pair(ctx: CoreContext, goneCreatures = 3): { me: Seeded; gone: Seeded } {
  const me = seedPlayer(ctx, 1, { level: 10 });
  const gone = seedPlayer(ctx, 2, { level: 10, creatures: goneCreatures, lastSeenAt: BEFORE });
  ctx.core.raid.currentWeek(HELSINKI);
  return { me, gone };
}

const slotOf = (ctx: CoreContext, creatureId: string): number =>
  buildPartyBoard(ctx.sql, W02.id, 1, partyMembers(ctx.sql, W02.id, 1)).row.findIndex(
    (s) => s?.id === creatureId,
  );

/** A slot that holds a guest or nothing. */
function freeSlot(ctx: CoreContext): number {
  const board = buildPartyBoard(ctx.sql, W02.id, 1, partyMembers(ctx.sql, W02.id, 1));
  const at = board.cells.findIndex((c) => c.origin === 'guest' || c.origin === null);
  if (at < 0) throw new Error('no free slot');
  return at;
}

describe('the board view and the fight use one board', () => {
  it('draws the creatures that join by themselves in the slots the fight gives them', async () => {
    await runRaid((ctx) => {
      const a = seedPlayer(ctx, 1, { level: 12 });
      seedPlayer(ctx, 2, { level: 9 });
      seedPlayer(ctx, 3, { level: 7, creatures: 1 });
      ctx.core.raid.currentWeek(HELSINKI);
      // One real placement; everything else is topped up and auto-placed.
      expect(ctx.core.raid.place(a.id, HELSINKI, a.creatureIds[0] as string, 5).ok).toBe(true);

      const week = ctx.core.raid.week(W02.id);
      if (week === null) throw new Error('no week');
      const members = partyMembers(ctx.sql, W02.id, 1);
      const board = buildPartyBoard(ctx.sql, W02.id, 1, members);
      const built = buildPhaseInput(ctx.sql, week, 1, 'finale');
      if (built === null) throw new Error('no input');
      // The fight is exactly the board's creatures, in board order.
      expect(built.input.row.map((s) => s.id)).toEqual(compactRow(board.row).map((s) => s.id));

      const view = ctx.core.raid.view(a.id, HELSINKI);
      const row = view.party?.row ?? [];
      expect(row).toHaveLength(board.cells.length);
      board.cells.forEach((cell, slot) => {
        const tile = row[slot]?.creature ?? null;
        if (cell.slot === null) {
          expect(tile).toBeNull();
          return;
        }
        expect(tile).not.toBeNull();
        expect(tile?.species).toBe(cell.slot.speciesId);
        expect(tile?.level).toBe(cell.slot.level);
        expect(tile?.auto).toBe(cell.origin === 'auto');
      });
      // The placed one is not auto; it is the caller's, with its id.
      expect(row[5]?.creature).toMatchObject({ mine: true, auto: false });
      expect(row[5]?.creature?.creatureId).toBe(a.creatureIds[0]);
      // The caller's own auto tiles carry their ids too (so a tap can place them).
      const mineAuto = row.filter((s) => s.creature?.mine === true && s.creature.auto);
      expect(mineAuto).toHaveLength(2);
      expect(mineAuto.every((s) => s.creature?.creatureId !== undefined)).toBe(true);
    });
  });

  it('keeps the guests out of the drawn tiles but matches the fight when fewer than three play', async () => {
    await runRaid((ctx) => {
      const { me } = pair(ctx);
      const week = ctx.core.raid.week(W02.id);
      if (week === null) throw new Error('no week');
      const built = buildPhaseInput(ctx.sql, week, 1, 'finale');
      const view = ctx.core.raid.view(me.id, HELSINKI);
      const drawn = (view.party?.row ?? []).filter((s) => s.creature !== null).length;
      const guests = built?.input.row.filter((s) => s.ownerId === null).length ?? 0;
      expect(guests).toBeGreaterThan(0);
      expect(drawn).toBe((built?.input.row.length ?? 0) - guests);
      expect(view.party?.guests).toBe(true);
    });
  });

  it('a tapped auto tile becomes a real placement in the same slot', async () => {
    await runRaid((ctx) => {
      const a = seedPlayer(ctx, 1, { level: 12 });
      seedPlayer(ctx, 2);
      seedPlayer(ctx, 3);
      ctx.core.raid.currentWeek(HELSINKI);
      const tile = ctx.core.raid
        .view(a.id, HELSINKI)
        .party?.row.find((s) => s.creature?.mine === true && s.creature.auto);
      const id = tile?.creature?.creatureId as string;
      expect(ctx.core.raid.place(a.id, HELSINKI, id, tile?.slot as number).ok).toBe(true);
      expect(placements(ctx)).toEqual([
        { creature_id: id, slot: tile?.slot, user_id: a.id, placed_by: null },
      ]);
      const after = ctx.core.raid.view(a.id, HELSINKI).party?.row[tile?.slot as number];
      expect(after?.creature).toMatchObject({ mine: true, auto: false });
    });
  });
});

describe('auto tiles are soft', () => {
  /** Each member brings at most three and the board has three slots per member. */
  const reflowed = (ctx: CoreContext) => {
    const members = partyMembers(ctx.sql, W02.id, 1);
    const board = buildPartyBoard(ctx.sql, W02.id, 1, members);
    const week = ctx.core.raid.week(W02.id);
    if (week === null) throw new Error('no week');
    const built = buildPhaseInput(ctx.sql, week, 1, 'finale');
    if (built === null) throw new Error('no input');
    return { board, built };
  };

  it('a player drops their own creature on another player’s auto tile; the auto one reflows', async () => {
    await runRaid((ctx) => {
      const a = seedPlayer(ctx, 1, { level: 12 });
      const b = seedPlayer(ctx, 2, { level: 9 });
      seedPlayer(ctx, 3, { level: 7 });
      ctx.core.raid.currentWeek(HELSINKI);
      const before = buildPartyBoard(ctx.sql, W02.id, 1, partyMembers(ctx.sql, W02.id, 1));
      const bAlias = before.aliases[1] as string;
      const at = before.cells.findIndex((c) => c.origin === 'auto' && c.slot?.ownerId === bAlias);
      expect(at).toBeGreaterThanOrEqual(0);
      const displaced = before.cells[at]?.slot?.id as string;
      const mine = a.creatureIds[0] as string;
      expect(ctx.core.raid.place(a.id, HELSINKI, mine, at).ok).toBe(true);

      const { board, built } = reflowed(ctx);
      expect(board.cells[at]?.slot?.id).toBe(mine);
      expect(board.cells[at]?.origin).toBe('placed');
      // Nobody is lost: the displaced creature stands in another slot, still auto.
      const now = board.cells.findIndex((c) => c.slot?.id === displaced);
      expect(now).toBeGreaterThanOrEqual(0);
      expect(now).not.toBe(at);
      expect(board.cells[now]?.origin).toBe('auto');
      const ids = board.cells.flatMap((c) => (c.slot === null ? [] : [c.slot.id]));
      expect(new Set(ids).size).toBe(ids.length);
      for (const p of [a, b]) for (const id of p.creatureIds) expect(ids).toContain(id);
      // The fight is the board: same creatures, and each at its board slot.
      expect(built.input.row.map((s) => s.id)).toEqual(ids);
      expect(built.input.board?.slots).toEqual(
        board.cells.flatMap((c, i) => (c.slot === null ? [] : [i])),
      );
      expect(built.input.board?.length).toBe(board.cells.length);
    });
  });

  it('always leaves a free slot: three members with three creatures each fill the board exactly', async () => {
    await runRaid((ctx) => {
      const a = seedPlayer(ctx, 1, { level: 12 });
      seedPlayer(ctx, 2, { level: 9 });
      seedPlayer(ctx, 3, { level: 7 });
      ctx.core.raid.currentWeek(HELSINKI);
      // Drop each of a's three creatures on the first slots that hold others' auto creatures.
      for (const id of a.creatureIds) {
        const board = buildPartyBoard(ctx.sql, W02.id, 1, partyMembers(ctx.sql, W02.id, 1));
        const aAlias = board.aliases[0] as string;
        const at = board.cells.findIndex((c) => c.origin === 'auto' && c.slot?.ownerId !== aAlias);
        expect(ctx.core.raid.place(a.id, HELSINKI, id, at).ok).toBe(true);
      }
      const { board } = reflowed(ctx);
      expect(board.cells).toHaveLength(9);
      expect(board.cells.every((c) => c.slot !== null)).toBe(true);
      expect(board.cells.filter((c) => c.origin === 'placed')).toHaveLength(3);
      expect(board.cells.filter((c) => c.origin === 'auto')).toHaveLength(6);
    });
  });

  it('a placed creature stays hard: another player gets slot_taken', async () => {
    await runRaid((ctx) => {
      const a = seedPlayer(ctx, 1);
      const b = seedPlayer(ctx, 2);
      seedPlayer(ctx, 3);
      ctx.core.raid.currentWeek(HELSINKI);
      expect(ctx.core.raid.place(a.id, HELSINKI, a.creatureIds[0] as string, 4).ok).toBe(true);
      expect(ctx.core.raid.place(b.id, HELSINKI, b.creatureIds[0] as string, 4)).toMatchObject({
        ok: false,
        error: 'slot_taken',
      });
    });
  });

  it('a teammate moves an away player’s creature onto another member’s auto tile', async () => {
    await runRaid((ctx) => {
      const me = seedPlayer(ctx, 1, { level: 10 });
      const gone = seedPlayer(ctx, 2, { level: 10, lastSeenAt: BEFORE });
      seedPlayer(ctx, 3, { level: 8 });
      ctx.core.raid.currentWeek(HELSINKI);
      const before = buildPartyBoard(ctx.sql, W02.id, 1, partyMembers(ctx.sql, W02.id, 1));
      const meAlias = before.aliases[0] as string;
      const at = before.cells.findIndex((c) => c.origin === 'auto' && c.slot?.ownerId === meAlias);
      const displaced = before.cells[at]?.slot?.id as string;
      const moved = gone.creatureIds[0] as string;
      expect(ctx.core.raid.place(me.id, HELSINKI, moved, at).ok).toBe(true);
      const { board, built } = reflowed(ctx);
      expect(board.cells[at]?.slot?.id).toBe(moved);
      const now = board.cells.findIndex((c) => c.slot?.id === displaced);
      expect(now).toBeGreaterThanOrEqual(0);
      expect(now).not.toBe(at);
      expect(board.cells.filter((c) => c.slot !== null)).toHaveLength(9);
      expect(built.input.row.map((s) => s.id)).toEqual(
        board.cells.flatMap((c) => (c.slot === null ? [] : [c.slot.id])),
      );
    });
  });
});

describe('who is away', () => {
  it('is whoever has not been seen since the week began, at the exact boundary', async () => {
    await runRaid((ctx) => {
      const early = seedPlayer(ctx, 1, { lastSeenAt: WEEK_START - 1 });
      const exact = seedPlayer(ctx, 2, { lastSeenAt: WEEK_START });
      const late = seedPlayer(ctx, 3, { lastSeenAt: WEEK_START + 1 });
      const ids = [early.id, exact.id, late.id];
      expect([...awayMembers(ctx.sql, ids, WEEK_START)]).toEqual([early.id]);
    });
  });

  it('uses the guild timezone for the week start: the same instant is away in one zone only', async () => {
    await runRaid((ctx) => {
      const helsinki = eventTimes(W02.id, 'Europe/Helsinki').weekStart;
      const newYork = eventTimes(W02.id, 'America/New_York').weekStart;
      expect(newYork).toBeGreaterThan(helsinki);
      const p = seedPlayer(ctx, 1, { lastSeenAt: helsinki + HOUR });
      expect(awayMembers(ctx.sql, [p.id], helsinki).size).toBe(0);
      expect(awayMembers(ctx.sql, [p.id], newYork).size).toBe(1);
    });
  });

  it('a leet credit is not opening the game', async () => {
    await runRaid((ctx) => {
      const { gone } = pair(ctx);
      ctx.clock.t = WEEK_START + HOUR;
      ctx.core.credit({
        userId: gone.id,
        currency: 'bait',
        amount: 5,
        source: 'leet',
        idempotencyKey: `leet:${ctx.guildId}:2027-01-11`,
      });
      expect(awayMembers(ctx.sql, [gone.id], WEEK_START).has(gone.id)).toBe(true);
    });
  });
});

describe('the view tells what teammates may move', () => {
  it('lists the away member and marks only their tiles as movable', async () => {
    await runRaid((ctx) => {
      const { me, gone } = pair(ctx, 4);
      const view = ctx.core.raid.view(me.id, HELSINKI);
      expect(view.party?.away).toHaveLength(1);
      const away = view.party?.away[0];
      expect(away?.ownerName).toBe(gone.name);
      // Everything they own is offered for a swap; three of the four join.
      expect(away?.creatures).toHaveLength(4);
      expect(away?.creatures.filter((c) => c.joining)).toHaveLength(3);
      const tiles = (view.party?.row ?? []).flatMap((s) =>
        s.creature === null ? [] : [s.creature],
      );
      for (const t of tiles) {
        expect(t.movable).toBe(!t.mine);
        expect(t.creatureId !== undefined).toBe(true);
      }
      // The away member sees nobody away, and nothing movable (their own tiles are theirs).
      const own = ctx.core.raid.view(gone.id, HELSINKI);
      expect(own.party?.away).toEqual([]);
      expect(own.party?.row.some((s) => s.creature?.movable === true)).toBe(false);
    });
  });

  it('marks nothing movable and lists nobody once the board is locked', async () => {
    await runRaid((ctx) => {
      const { me } = pair(ctx);
      ctx.sql.exec("UPDATE raid_weeks SET status = 'finale'");
      const view = ctx.core.raid.view(me.id, HELSINKI);
      expect(view.party?.away).toEqual([]);
      expect(view.party?.row.some((s) => s.creature?.movable === true)).toBe(false);
    });
  });
});

describe('a teammate moves and swaps an away player’s creatures', () => {
  it('moves a joining creature to a free slot and pins the whole team as placements', async () => {
    await runRaid((ctx) => {
      const { me, gone } = pair(ctx);
      const before = gone.creatureIds.map((id) => slotOf(ctx, id));
      const target = freeSlot(ctx);
      const moving = gone.creatureIds[0] as string;
      expect(ctx.core.raid.place(me.id, HELSINKI, moving, target).ok).toBe(true);

      const rowsNow = placements(ctx);
      // Exactly their three creatures, all recorded as placed by the teammate.
      expect(rowsNow).toHaveLength(3);
      expect(rowsNow.every((r) => r.user_id === gone.id && r.placed_by === me.id)).toBe(true);
      expect(new Set(rowsNow.map((r) => r.creature_id))).toEqual(new Set(gone.creatureIds));
      expect(slotOf(ctx, moving)).toBe(target);
      // The other two stand where the fight would have put them.
      gone.creatureIds.slice(1).forEach((id, i) => {
        expect(slotOf(ctx, id)).toBe(before[i + 1]);
      });
      // Their team is now exactly their placements.
      const view = ctx.core.raid.view(me.id, HELSINKI);
      const tile = view.party?.row[target]?.creature;
      expect(tile).toMatchObject({ auto: false, movable: true, movedBy: me.name });
      // Moving it again is fine, and swapping two of theirs works.
      const second = gone.creatureIds[1] as string;
      const secondSlot = slotOf(ctx, second);
      expect(ctx.core.raid.place(me.id, HELSINKI, moving, secondSlot).ok).toBe(true);
      expect(slotOf(ctx, moving)).toBe(secondSlot);
      expect(slotOf(ctx, second)).toBe(target);
      expect(count(ctx.sql, 'raid_placements')).toBe(3);
    });
  });

  it('swaps a joining creature for another one they own', async () => {
    await runRaid((ctx) => {
      const { me, gone } = pair(ctx, 4);
      const board = buildPartyBoard(ctx.sql, W02.id, 1, partyMembers(ctx.sql, W02.id, 1));
      const joining = new Set(
        board.cells.flatMap((c) =>
          c.slot !== null && c.origin === 'auto' && c.slot.ownerId === board.aliases[1]
            ? [c.slot.id]
            : [],
        ),
      );
      const bench = gone.creatureIds.find((id) => !joining.has(id)) as string;
      const out = [...joining][0] as string;
      const at = slotOf(ctx, out);
      expect(ctx.core.raid.place(me.id, HELSINKI, bench, at).ok).toBe(true);
      expect(slotOf(ctx, bench)).toBe(at);
      expect(slotOf(ctx, out)).toBe(-1);
      expect(placements(ctx)).toHaveLength(3);
      expect(placements(ctx).every((r) => r.placed_by === me.id)).toBe(true);
    });
  });

  it('refuses once the owner has opened the game, and teammates’ placements stay', async () => {
    await runRaid((ctx) => {
      const { me, gone } = pair(ctx);
      const target = freeSlot(ctx);
      expect(ctx.core.raid.place(me.id, HELSINKI, gone.creatureIds[0] as string, target).ok).toBe(
        true,
      );
      // They open the game.
      ctx.sql.exec('UPDATE players SET last_seen_at = ? WHERE user_id = ?', WEEK_START, gone.id);
      const again = freeSlot(ctx);
      expect(ctx.core.raid.place(me.id, HELSINKI, gone.creatureIds[0] as string, again)).toEqual({
        ok: false,
        status: 409,
        error: 'not_away',
      });
      expect(placements(ctx)).toHaveLength(3);
      expect(slotOf(ctx, gone.creatureIds[0] as string)).toBe(target);
      const view = ctx.core.raid.view(me.id, HELSINKI);
      expect(view.party?.away).toEqual([]);
      expect(view.party?.row.some((s) => s.creature?.movable === true)).toBe(false);
      // The owner changes anything of theirs as usual, and it becomes theirs.
      expect(ctx.core.raid.place(gone.id, HELSINKI, gone.creatureIds[0] as string, again).ok).toBe(
        true,
      );
      expect(
        placements(ctx).find((r) => r.creature_id === gone.creatureIds[0])?.placed_by,
      ).toBeNull();
    });
  });

  it('never moves what the owner placed themselves, but still moves their other creatures', async () => {
    await runRaid((ctx) => {
      const { me, gone } = pair(ctx);
      const own = gone.creatureIds[0] as string;
      const ownSlot = freeSlot(ctx);
      expect(ctx.core.raid.place(gone.id, HELSINKI, own, ownSlot).ok).toBe(true);
      // Not the creature, and not a slot it stands in.
      expect(ctx.core.raid.place(me.id, HELSINKI, own, freeSlot(ctx))).toMatchObject({
        ok: false,
        error: 'not_movable',
      });
      const other = gone.creatureIds[1] as string;
      expect(ctx.core.raid.place(me.id, HELSINKI, other, ownSlot)).toMatchObject({
        ok: false,
        error: 'not_movable',
      });
      expect(placements(ctx)).toEqual([
        { creature_id: own, slot: ownSlot, user_id: gone.id, placed_by: null },
      ]);
      // A rejection pins nothing. Their other creatures can still be moved.
      const target = freeSlot(ctx);
      expect(ctx.core.raid.place(me.id, HELSINKI, other, target).ok).toBe(true);
      const mine = placements(ctx);
      expect(mine).toHaveLength(3);
      expect(mine.find((r) => r.creature_id === own)?.placed_by).toBeNull();
      expect(mine.find((r) => r.creature_id === other)?.placed_by).toBe(me.id);
      // The view says the owner's own tile is not movable.
      const tile = ctx.core.raid.view(me.id, HELSINKI).party?.row[ownSlot]?.creature;
      expect(tile).toMatchObject({ movable: false, auto: false });
      expect(tile).not.toHaveProperty('creatureId');
    });
  });

  it('refuses another party, a creature that is not theirs, someone else’s slot and bad slots', async () => {
    await runRaid((ctx) => {
      const { me, gone } = pair(ctx);
      const stranger = seedPlayer(ctx, 3, { lastSeenAt: BEFORE });
      // Reading the view takes the newcomer into the roster.
      ctx.core.raid.view(me.id, HELSINKI);
      const fine = 8;
      // Another party: move the stranger out of ours.
      ctx.sql.exec(
        'UPDATE raid_party_members SET party = 2 WHERE week_id = ? AND user_id = ?',
        W02.id,
        stranger.id,
      );
      expect(
        ctx.core.raid.place(me.id, HELSINKI, stranger.creatureIds[0] as string, fine),
      ).toMatchObject({ ok: false, error: 'not_in_party' });
      // A creature nobody has.
      expect(ctx.core.raid.place(me.id, HELSINKI, 'no-such-creature', fine)).toMatchObject({
        ok: false,
        error: 'not_your_creature',
      });
      // Slots out of range, either way.
      for (const slot of [-1, 9, 1.5]) {
        expect(
          ctx.core.raid.place(me.id, HELSINKI, gone.creatureIds[0] as string, slot),
        ).toMatchObject({ ok: false, error: 'invalid_slot' });
      }
      // A slot that holds the caller's own placed creature is taken (an auto tile would make room).
      const mineAt = slotOf(ctx, me.creatureIds[0] as string);
      expect(ctx.core.raid.place(me.id, HELSINKI, me.creatureIds[0] as string, mineAt).ok).toBe(
        true,
      );
      expect(
        ctx.core.raid.place(me.id, HELSINKI, gone.creatureIds[0] as string, mineAt),
      ).toMatchObject({ ok: false, error: 'slot_taken' });
      // Nothing changed beyond the caller's own placement, nothing was pinned.
      expect(count(ctx.sql, 'raid_placements')).toBe(1);
    });
  });

  it('refuses a fourth creature on the board, and every change after the lock', async () => {
    await runRaid((ctx) => {
      const { me, gone } = pair(ctx, 4);
      const board = buildPartyBoard(ctx.sql, W02.id, 1, partyMembers(ctx.sql, W02.id, 1));
      const joining = new Set(
        board.cells.flatMap((c) => (c.origin === 'auto' && c.slot !== null ? [c.slot.id] : [])),
      );
      const bench = gone.creatureIds.find((id) => !joining.has(id)) as string;
      // A free slot, with all three already joining: a fourth is refused.
      expect(ctx.core.raid.place(me.id, HELSINKI, bench, freeSlot(ctx))).toMatchObject({
        ok: false,
        error: 'board_full',
      });
      expect(count(ctx.sql, 'raid_placements')).toBe(0);
      ctx.sql.exec("UPDATE raid_weeks SET status = 'finale'");
      expect(
        ctx.core.raid.place(me.id, HELSINKI, gone.creatureIds[0] as string, freeSlot(ctx)),
      ).toEqual({ ok: false, status: 409, error: 'locked' });
      expect(count(ctx.sql, 'raid_placements')).toBe(0);
    });
  });

  it('records the owner as null and the teammate as placed_by', async () => {
    await runRaid((ctx) => {
      const { me, gone } = pair(ctx);
      expect(ctx.core.raid.place(me.id, HELSINKI, me.creatureIds[0] as string, 4).ok).toBe(true);
      expect(
        ctx.core.raid.place(me.id, HELSINKI, gone.creatureIds[0] as string, freeSlot(ctx)).ok,
      ).toBe(true);
      const mine = placements(ctx).filter((r) => r.user_id === me.id);
      const theirs = placements(ctx).filter((r) => r.user_id === gone.id);
      expect(mine.map((r) => r.placed_by)).toEqual([null]);
      expect(theirs.map((r) => r.placed_by)).toEqual([me.id, me.id, me.id]);
    });
  });
});

describe('migration 32 (placed_by)', () => {
  it('adds the column to a database that has placements, which stay the owners’', async () => {
    await runRaid((ctx) => {
      const { me } = pair(ctx);
      const columns = (): string[] =>
        rows<{ name: string }>(
          ctx.sql,
          "SELECT name FROM pragma_table_info('raid_placements')",
        ).map((r) => r.name);
      expect(columns()).toContain('placed_by');
      ctx.core.raid.place(me.id, HELSINKI, me.creatureIds[0] as string, 4);
      // It undoes the newer migrations first (33, the lounge; 34, the dungeon on a map).
      undoPlacedByMigration(ctx.sql);
      expect(columns()).not.toContain('placed_by');
      expect(ctx.sql.exec('SELECT MAX(version) AS v FROM schema_version').one()['v']).toBe(
        LATEST_SCHEMA_VERSION - 3,
      );
      ctx.core.migrate();
      expect(columns()).toContain('placed_by');
      expect(ctx.sql.exec('SELECT MAX(version) AS v FROM schema_version').one()['v']).toBe(
        LATEST_SCHEMA_VERSION,
      );
      // The old row is kept, and counts as the owner's.
      expect(placements(ctx)).toEqual([
        { creature_id: me.creatureIds[0], slot: 4, user_id: me.id, placed_by: null },
      ]);
    });
  });
});
