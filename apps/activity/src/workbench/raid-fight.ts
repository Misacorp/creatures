/**
 * A whole raid fight for a big party, for the workbench's stage page: `players` players, each with
 * one creature in every row, so the row is `3 × players` slots and lane k belongs to player k. The
 * engine plays it with a seeded RNG, so it is the same every time. Fixture data only; nothing here
 * calls the API.
 */
import { RULES, content, createSeededRng } from '@creatures/game';
import {
  buildNames,
  makeSlot,
  scaleBoss,
  simulateFight,
  zoneIndices,
  ZONES,
  type EventNames,
  type FightEvent,
  type FightInput,
  type FightSlot,
} from '@creatures/engine';
import type { ReplayRowEntry } from '../raid-api';

export interface BigRaidFight {
  boss: { id: string; name: string };
  hpMax: number;
  rounds: number;
  row: ReplayRowEntry[];
  /** The creatures of the viewer: the player in lane `yourLane`. */
  mineIds: ReadonlySet<string>;
  names: EventNames;
  events: FightEvent[];
}

const cache = new Map<string, BigRaidFight>();

/** The fight of `players` players (1 to 15), the viewer standing in lane `yourLane` (from 0). */
export function bigRaidFight(players: number, yourLane: number): BigRaidFight {
  const count = Math.max(1, Math.min(RULES.raid.maxPartySize, Math.trunc(players)));
  const you = Math.max(0, Math.min(count - 1, Math.trunc(yourLane)));
  const key = `${String(count)}:${String(you)}`;
  const known = cache.get(key);
  if (known !== undefined) return known;

  const species = content.creatures.filter((c) => c.stage === 1);
  const boss = content.bosses[0];
  if (boss === undefined || species.length === 0) throw new Error('the shipped content is empty');
  const length = count * 3;
  const slots: (FightSlot | null)[] = Array.from({ length }, () => null);
  ZONES.forEach((zone, z) => {
    zoneIndices(zone, length).forEach((slot, lane) => {
      const sp = species[(lane * 3 + z) % species.length];
      if (sp === undefined) return;
      slots[slot] = makeSlot(sp, {
        id: `c-${String(lane)}-${String(z)}`,
        ownerId: `p${String(lane)}`,
        level: RULES.abilities.unlockLevel,
        fusionCount: 0,
      });
    });
  });
  const row = slots.flatMap((s) => s ?? []);
  const scaled = scaleBoss(boss, count, 3);
  const input: FightInput = {
    boss,
    bossAtk: scaled.atk,
    phase: 'finale',
    bossHpPool: { max: scaled.maxHp, current: scaled.maxHp },
    adaptation: null,
    row,
    players: Array.from({ length: count }, (_, k) => `p${String(k)}`),
    finaleAbilities: [],
    luck: RULES.combat.luck,
  };
  const events = simulateFight(input, createSeededRng(`workbench-raid-${key}`)).events;
  const fight: BigRaidFight = {
    boss: { id: boss.id, name: boss.name },
    hpMax: scaled.maxHp,
    rounds: boss.finaleRounds,
    row: row.map((s, position) => ({
      position,
      id: s.id,
      name: s.name,
      species: s.speciesId,
      element: s.element,
      role: s.role,
      level: s.level,
      owner: s.ownerId,
    })),
    mineIds: new Set(row.filter((s) => s.ownerId === `p${String(you)}`).map((s) => s.id)),
    names: buildNames(input),
    events,
  };
  cache.set(key, fight);
  return fight;
}
