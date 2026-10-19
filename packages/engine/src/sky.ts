/**
 * The fight hooks of the day's weather that are not a sheet number (Kind Rain, Morning Haze,
 * Bramble Season, Lantern Light): small helpers that turn the day's `WeatherSky` (`weatherSky` in @creatures/game)
 * into the optional fields of a fight or a dungeon run. Every field is left out on a plain day, so
 * an input built without weather is exactly what it was before these hooks existed.
 */
import type { WeatherSky } from '@creatures/game';
import { ZONES, fightRowShape, zoneIndices, type FightBoard } from './zones';
import type { DungeonRunInput } from './dungeon';
import type { FightInput } from './types';

/**
 * The creature that stands first in each row of a raid row: the leftmost slot of the Front, Middle
 * and Back zones that have anyone (a row of one or two is all Middle, so one creature). Left to right.
 * With the fight's `board` the rows are the board's own (the first creature standing in each board row,
 * whatever empty slots lie before it); without one, the dense row.
 */
export function firstOfEachRow(row: readonly { id: string }[], board?: FightBoard): string[] {
  const out: string[] = [];
  const shape = fightRowShape({ row, board });
  for (const zone of ZONES) {
    const first = zoneIndices(zone, shape)[0];
    const slot = first === undefined ? undefined : row[first];
    if (slot !== undefined) out.push(slot.id);
  }
  return out;
}

/** The fight fields of the day's sky for a raid stage with this row (nothing for a plain day). */
export function skyFightFields(
  sky: WeatherSky,
  row: readonly { id: string }[],
  board?: FightBoard,
): Pick<FightInput, 'rainHealBp' | 'skipFirstTurn' | 'brambleBp' | 'lingerAllRounds'> {
  return {
    ...(sky.rainHealBp > 0 ? { rainHealBp: sky.rainHealBp } : {}),
    ...(sky.haze && row.length > 0 ? { skipFirstTurn: firstOfEachRow(row, board) } : {}),
    ...(sky.brambleBp > 0 ? { brambleBp: sky.brambleBp } : {}),
    ...(sky.lingerAllRounds > 0 ? { lingerAllRounds: sky.lingerAllRounds } : {}),
  };
}

/** The dungeon run fields of the day's sky (nothing for a plain day). */
export function skyRunFields(
  sky: WeatherSky,
): Pick<DungeonRunInput, 'rainHealBp' | 'hazeLeft' | 'brambleBp' | 'lingerAllRounds'> {
  return {
    ...(sky.rainHealBp > 0 ? { rainHealBp: sky.rainHealBp } : {}),
    ...(sky.haze ? { hazeLeft: true } : {}),
    ...(sky.brambleBp > 0 ? { brambleBp: sky.brambleBp } : {}),
    ...(sky.lingerAllRounds > 0 ? { lingerAllRounds: sky.lingerAllRounds } : {}),
  };
}
