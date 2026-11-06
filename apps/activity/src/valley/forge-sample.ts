/**
 * Sample anvils for the Forge (the workbench and the tests): orders with what each needs and waits on, a piece in hand, a tinkering
 * smith, a full floor. The numbers follow `VALLEY_RULES.forge` loosely (a piece takes 36 scrap and a shard; a plain piece is 16
 * hours; a floor holds 5); they only have to look right.
 */
import type { ValleyAnvilView, ValleyOrderView, ValleyView } from '@creatures/game';

/** An order for `blueprintId` (null: "for my team"): `count` pieces, `made` done, with what the next piece needs and waits on. */
export function sampleOrder(
  id: string,
  blueprintId: string | null,
  count: number,
  extra: Partial<ValleyOrderView> = {},
): ValleyOrderView {
  const reach = extra.reach ?? 'none';
  return {
    id,
    blueprintId,
    forTeam: blueprintId === null,
    count,
    made: 0,
    reach,
    needs: {
      scrap: 36,
      shardElement: blueprintId === null ? null : 'tide',
      shard: 1,
      essence: reach === 'rare' ? 25 : reach === 'epic' ? 70 : 0,
    },
    waiting: null,
    ...extra,
  };
}

/** An anvil with `creatureId` posted; a working smith with a piece in hand unless `extra` says otherwise. */
export function sampleAnvil(
  id: string,
  creatureId: string | null,
  orders: readonly ValleyOrderView[],
  extra: Partial<ValleyAnvilView> = {},
): ValleyAnvilView {
  const working = creatureId !== null && orders.length > 0;
  const first = orders[0];
  return {
    id,
    creatureId,
    kit: null,
    paused: null,
    mastery: { hours: 40, step: 0, bonusBp: 0 },
    orders: [...orders],
    piece:
      working && first !== undefined
        ? { orderId: first.id, rarity: 0, progress: 6, need: 16, leftHours: 10 }
        : null,
    tinkering:
      creatureId !== null && orders.length === 0
        ? { reason: 'idle', shardElement: null, sinceHours: 3 }
        : null,
    floor: { count: 2, cap: 5, full: false, byRarity: [2, 0, 0] },
    perDay: { pieces: creatureId === null || orders.length === 0 ? 0 : 1.5 },
    ...extra,
  };
}

/** A smith that cannot go on for want of Tide shards: the order waits, the smith tinkers (V-FORGE-4). */
export function shardWait(
  id: string,
  creatureId: string,
  blueprintId: string,
  hours: number,
): ValleyAnvilView {
  const order = sampleOrder(`${id}-o1`, blueprintId, 3, { waiting: 'shard' });
  return sampleAnvil(id, creatureId, [order], {
    piece: null,
    tinkering: { reason: 'shard', shardElement: 'tide', sinceHours: hours },
    mastery: { hours: 90, step: 1, bonusBp: 500 },
  });
}

/** An anvil whose floor is full (it holds its finished piece and tinkers until the pieces come home). */
export function fullFloor(id: string, creatureId: string, blueprintId: string): ValleyAnvilView {
  const order = sampleOrder(`${id}-o1`, blueprintId, 5, { made: 4 });
  return sampleAnvil(id, creatureId, [order], {
    piece: { orderId: order.id, rarity: 1, progress: 16, need: 16, leftHours: 0 },
    tinkering: { reason: 'floor', shardElement: null, sinceHours: 2 },
    floor: { count: 5, cap: 5, full: true, byRarity: [3, 2, 0] },
    kit: 'tongs',
    mastery: { hours: 150, step: 2, bonusBp: 1000 },
  });
}

/** A `valley` block with these anvils: each posted creature is "smithing" at its anvil, and the price ladder follows the count. */
export function withAnvils(visit: ValleyView, anvils: readonly ValleyAnvilView[]): ValleyView {
  const at = new Map(anvils.map((a) => [a.creatureId, a.id]));
  return {
    ...visit,
    creatures: visit.creatures.map((c) => {
      const anvilId = at.get(c.id);
      return anvilId === undefined ? c : { ...c, state: 'smithing' as const, seatId: anvilId };
    }),
    anvils: [...anvils],
    anvilPrices: {
      ...visit.anvilPrices,
      owned: anvils.length,
      next:
        anvils.length >= visit.anvilPrices.max
          ? null
          : (visit.anvilPrices.ladder[anvils.length] ?? null),
    },
  };
}
