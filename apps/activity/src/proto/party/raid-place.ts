/**
 * Placing a creature on a chosen seat of the party's lane board. The shared `placeRaid` (`../world.ts`)
 * always takes the first empty seat; the arena here lets the player tap the seat, so this moves the
 * placed creature there afterwards. Pure.
 */
import { placeRaid, type ProtoWorld } from '../world';

/** The world with `creatureId` placed on `slot` (when that seat is empty), else on the first empty one. */
export function placeRaidAt(
  world: ProtoWorld,
  creatureId: string,
  slot: number | null,
): ProtoWorld {
  const placed = placeRaid(world, creatureId);
  const party = placed.raid.party;
  if (slot === null || party === null) return placed;
  const target = party.row.find((s) => s.slot === slot);
  const from = party.row.find((s) => s.creature?.creatureId === creatureId);
  if (target === undefined || from === undefined || target.creature !== null || from === target) {
    return placed;
  }
  const row = party.row.map((s) => {
    if (s.slot === slot) return { ...s, creature: from.creature };
    if (s.slot === from.slot) return { ...s, creature: null };
    return s;
  });
  const team = placed.raid.you.team;
  return {
    ...placed,
    raid: {
      ...placed.raid,
      you: {
        ...placed.raid.you,
        team:
          team === null
            ? null
            : {
                creatures: team.creatures.map((c) =>
                  c.creatureId === creatureId ? { ...c, slot } : c,
                ),
              },
      },
      party: { ...party, row },
    },
  };
}
