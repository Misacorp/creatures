/**
 * The words of the boss telegraph, and the one-round-ahead forecast. Pure (no DOM, no timers): the
 * stage draws what these say. All text it returns is plain text and can contain creature names from
 * players, so callers must render it as text only.
 *
 * - A **strike label** says what the boss is doing and whom it hits, for example "Undertow · whole
 *   FRONT row", "Lightning Rod · Cindle" or "Bramble Bind · both ends".
 * - The **forecast** says what the boss will do next round ("Next round: Undertow hits FRONT"),
 *   from the boss's content and the round number alone. A strike on the strongest creature depends
 *   on the creatures' Attack, which the stage does not know, so it is worded generically.
 */
import { content, dungeonContent, type BossDef, type Gimmick } from '@creatures/game';
import { bossWarnings, type EventNames, type Zone } from '@creatures/engine';
import type { BossStrike } from './stage';

/**
 * The boss with this id, or a dungeon foe as the boss it fights as: `bossWarnings` reads only the
 * gimmicks and the number of rounds, and a foe has both (its room's rounds). `added` are the
 * gimmicks the room's modifier gives the foe (Thorns' reflect), which the foe's own content does not
 * list; a gimmick the foe already has is not added twice.
 */
function bossOrFoe(bossId: string, added: readonly Gimmick[] = []): BossDef | undefined {
  const boss = content.bosses.find((b) => b.id === bossId);
  if (boss !== undefined) return boss;
  const foe = dungeonContent.foes.find((f) => f.id === bossId);
  if (foe === undefined) return undefined;
  const gimmicks = [
    ...foe.gimmicks,
    ...added.filter((g) => !foe.gimmicks.some((o) => o.id === g.id)),
  ];
  return { gimmicks, finaleRounds: foe.rounds } as BossDef;
}

const creatureName = (names: Pick<EventNames, 'creatures'>, id: string): string =>
  names.creatures[id] ?? id;

const gimmickName = (names: Pick<EventNames, 'gimmicks'>, id: string | null, fallback: string) =>
  id === null ? fallback : (names.gimmicks?.[id] ?? fallback);

const zoneWord = (zone: Zone): string => zone.toUpperCase();

/**
 * How zones are worded. `zones` (the raid) says "whole FRONT row"; `row` (the dungeon, where the
 * team is one row of three and each zone is the one creature at that place) says "the left
 * creature".
 */
export type Wording = 'zones' | 'row';

/** The places of a row of three, by the zone that is one creature there. */
const ROW_PLACE_WORDS: Readonly<Record<Zone, string>> = {
  front: 'left',
  middle: 'middle',
  back: 'right',
};
const placeWord = (zone: Zone): string => `the ${ROW_PLACE_WORDS[zone]} creature`;

interface StrikeLabel {
  /** What it is: the gimmick's name, or "Attack". */
  title: string;
  /** Whom it hits, in plain words. */
  area: string;
  /** "title · area". */
  text: string;
}

/** The label of a boss action. */
export function strikeLabel(
  strike: BossStrike,
  names: Pick<EventNames, 'creatures' | 'gimmicks'>,
  wording: Wording = 'zones',
): StrikeLabel {
  const who = (id: string): string => creatureName(names, id);
  let title: string;
  let area: string;
  switch (strike.action) {
    case 'attack': {
      title = 'Attack';
      const target = strike.targets[0];
      area = target === undefined ? 'nobody' : who(target);
      if (strike.guarded !== null) area += `, guarding ${who(strike.guarded)}`;
      break;
    }
    case 'hit_zone':
      title = gimmickName(names, strike.gimmick, 'Zone hit');
      area =
        strike.zone === null
          ? wording === 'row'
            ? 'a creature'
            : 'a whole row'
          : wording === 'row'
            ? placeWord(strike.zone)
            : `whole ${zoneWord(strike.zone)} row`;
      break;
    case 'strike_highest_atk': {
      title = gimmickName(names, strike.gimmick, 'Strike');
      const target = strike.targets[0];
      area = target === undefined ? 'your strongest' : who(target);
      break;
    }
    case 'silence_ends':
      title = gimmickName(names, strike.gimmick, 'Silence');
      area =
        strike.targets.length >= 2
          ? 'both ends'
          : strike.targets[0] === undefined
            ? 'both ends'
            : who(strike.targets[0]);
      break;
    case 'reflect': {
      title = gimmickName(names, strike.gimmick, 'Reflect');
      const target = strike.targets[0];
      area = target === undefined ? 'reflected' : `reflected onto ${who(target)}`;
      break;
    }
    case 'reflect_armed':
      title = gimmickName(names, strike.gimmick, 'Reflect');
      area = 'reflects the first reaction';
      break;
    case 'other':
      title = gimmickName(names, strike.gimmick, 'Boss move');
      area = strike.targets.map(who).join(', ');
      break;
  }
  return { title, area, text: area === '' ? title : `${title} · ${area}` };
}

/** What the stage shows one round ahead. */
export interface Forecast {
  /** "Next round: Undertow hits FRONT". */
  text: string;
  /** Zones a warning glyph goes on. */
  zones: readonly Zone[];
  /** The creatures at the two ends of the row that are still up (a silence will hit them). */
  ends: readonly string[];
}

/**
 * The forecast for the round after `round` (the round the stage is showing), or null when the boss
 * does nothing special then, the fight is over, or the boss is unknown. `row` is the row's creature
 * ids left to right and `knockedOut` those that are down now: a silence only shows on creatures that
 * are still up. `addedGimmicks` are what a dungeon room's modifier gives its foe (see `bossOrFoe`).
 */
export function forecastNextRound(
  bossId: string,
  round: number,
  rounds: number | null,
  row: readonly string[],
  knockedOut: readonly string[],
  names: Pick<EventNames, 'gimmicks'>,
  wording: Wording = 'zones',
  addedGimmicks: readonly Gimmick[] = [],
): Forecast | null {
  if (round < 1 || (rounds !== null && round >= rounds)) return null;
  const boss = bossOrFoe(bossId, addedGimmicks);
  if (boss === undefined) return null;
  const warnings = bossWarnings(boss, round + 1);
  if (warnings.length === 0) return null;
  const parts: string[] = [];
  const zones: Zone[] = [];
  const ends: string[] = [];
  for (const w of warnings) {
    const name = gimmickName(names, w.gimmick, w.name);
    switch (w.target.kind) {
      case 'zone':
        parts.push(
          `${name} hits ${wording === 'row' ? placeWord(w.target.zone) : zoneWord(w.target.zone)}`,
        );
        if (!zones.includes(w.target.zone)) zones.push(w.target.zone);
        break;
      case 'ends': {
        parts.push(`${name} silences both ends`);
        for (const id of [row[0], row[row.length - 1]]) {
          if (id !== undefined && !knockedOut.includes(id) && !ends.includes(id)) ends.push(id);
        }
        break;
      }
      case 'strongest':
        parts.push(`${name} strikes your strongest`);
        break;
      case 'reaction':
        parts.push(`${name} reflects the first reaction`);
        break;
    }
  }
  return { text: `Next round: ${parts.join('; ')}`, zones, ends };
}
