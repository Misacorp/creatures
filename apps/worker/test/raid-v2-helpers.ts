// Helpers of the combat v2 raid tests: players with v2 talents and Knacks, the weekend's clock and what a stage stored.
import { createSeededRng } from '@creatures/game';
import { knownKnacks } from '@creatures/game/combat-v2';
import type { StageCarry } from '@creatures/engine/v2';
import { grantFirstTalent } from '../src/talent-v2-store';
import type { CoreContext } from './helpers';
import { rows, seedPlayer, type SeedOptions, type Seeded } from './raid-helpers';

/** The calendar of week 2027-W02 under v2, in Europe/Helsinki (UTC+2): stage 1 Saturday, stage 2 and the finale Sunday. */
export const V2_WEEK = {
  id: '2027-W02',
  /** A moment after the week opened (Monday 14:00 local). */
  open: Date.parse('2027-01-11T12:00:00Z'),
  stage1: Date.parse('2027-01-16T11:37:00Z'),
  stage2: Date.parse('2027-01-17T11:37:00Z'),
  finale: Date.parse('2027-01-17T18:00:00Z'),
  /** The next week opens Monday 13:37 local. */
  next: Date.parse('2027-01-18T11:37:00Z'),
};

/** A creature of the first species of the line list gets a v2 talent and its first known Knack, as a player under the flag would have. */
export function v2Ready(ctx: Pick<CoreContext, 'sql' | 'clock'>, player: Seeded): void {
  const rng = createSeededRng(`v2-ready:${player.id}`);
  for (const id of player.creatureIds) {
    const row = ctx.sql
      .exec<{ line: string; species: string }>(
        'SELECT line, species FROM creatures WHERE id = ?',
        id,
      )
      .one();
    grantFirstTalent(ctx.sql, rng, {
      creatureId: id,
      userId: player.id,
      line: row.line,
      now: ctx.clock.t,
    });
    ctx.sql.exec(
      'UPDATE creatures SET knack = ? WHERE id = ?',
      knownKnacks(row.species)[0] ?? null,
      id,
    );
  }
}

/** Evolved forms (level cap 30) of every role, in a fixed order, so seeded players are strong enough to last a weekend. */
const EVOLVED = [
  'tidewing',
  'pyrelynx',
  'thornbuck',
  'voltaro',
  'fogwyrm',
  'magmole',
  'tempestray',
  'ancientshell',
  'sunfawn',
  'ohmouse',
  'geyserpup',
  'wickat',
  'drizzlewt',
  'kilnmole',
  'halcyray',
  'bloomback',
  'bogwarden',
  'croakmire',
];

/** A seeded player with five creatures (three to place, two spares), each with a v2 talent and a Knack. */
export function v2Player(ctx: CoreContext, n: number, o: SeedOptions = {}): Seeded {
  const player = seedPlayer(ctx, n, {
    level: 30,
    creatures: 5,
    species: Array.from({ length: 5 }, (_, k) => EVOLVED[(n * 3 + k) % EVOLVED.length] as string),
    ...o,
  });
  v2Ready(ctx, player);
  return player;
}

/** The carry stored for a party. */
export function carryOf(sql: SqlStorage, party = 1, weekId = V2_WEEK.id): StageCarry {
  const row = rows<{ carry_json: string | null }>(
    sql,
    'SELECT carry_json FROM raid_parties WHERE week_id = ? AND party = ?',
    weekId,
    party,
  )[0];
  if (row?.carry_json === null || row === undefined) throw new Error('no carry stored');
  return JSON.parse(row.carry_json) as StageCarry;
}

/** The event props of one kind, in order. */
export const eventsOfKind = (sql: SqlStorage, kind: string): Record<string, unknown>[] =>
  rows<{ props_json: string }>(
    sql,
    'SELECT props_json FROM analytics_events WHERE kind = ? ORDER BY id',
    kind,
  ).map((r) => JSON.parse(r.props_json) as Record<string, unknown>);

/** Sets the boss's HP in a party's stored carry (a test's way to a kill without a stronger world). */
export function setBossHp(sql: SqlStorage, hp: number, party = 1, weekId = V2_WEEK.id): void {
  const carry = carryOf(sql, party, weekId);
  sql.exec(
    'UPDATE raid_parties SET carry_json = ?, hp_current = ? WHERE week_id = ? AND party = ?',
    JSON.stringify({ ...carry, bossHp: hp, shadowHp: hp }),
    hp,
    weekId,
    party,
  );
}
