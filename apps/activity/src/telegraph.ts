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
import {
  bossWarnings,
  nearestLivingZone,
  neighbours,
  zoneIndices,
  zoneOfIndex,
  ZONES,
  type BossWarning,
  type EventNames,
  type PatternTarget,
  type Zone,
} from '@creatures/engine';
import type { BossStrike } from './stage';

/**
 * The boss with this id, or a dungeon foe as the boss it fights as: `bossWarnings` reads only the
 * gimmicks and the number of rounds, and a foe has both (its room's rounds). `added` are the
 * gimmicks the room's modifier gives the foe (Thorns' reflect), which the foe's own content does not
 * list; a gimmick the foe already has is not added twice.
 */
function bossOrFoe(
  bossId: string,
  added: readonly Gimmick[] = [],
  played?: Readonly<Record<string, string>>,
): BossDef | undefined {
  const boss = content.bosses.find((b) => b.id === bossId);
  if (boss !== undefined) {
    // A rank-gated move the fight was not played with (`played`: the moves of the stored boss, which
    // the server names in `EventNames.gimmicks`) is not forecast: it is not in this week's fight.
    if (played === undefined) return boss;
    return {
      ...boss,
      gimmicks: boss.gimmicks.filter((g) => g.fromRank === undefined || played[g.id] !== undefined),
    };
  }
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

/** "1 creature", "4 creatures". */
const countOf = (n: number, noun: string): string => `${String(n)} ${noun}${n === 1 ? '' : 's'}`;

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
      if (strike.guarded !== null) area += `, guarding ${who(strike.guarded)}`;
      // A chain: the jumps after the first hit.
      if (strike.targets.length > 1) area += `, then ${String(strike.targets.length - 1)} more`;
      break;
    }
    case 'sweep': {
      title = gimmickName(names, strike.gimmick, 'Sweep');
      const rows = strike.rows ?? (strike.zone === null ? [] : [strike.zone]);
      area =
        rows.length >= ZONES.length
          ? wording === 'row'
            ? 'the whole row'
            : 'every row'
          : rows.length === 0
            ? wording === 'row'
              ? 'a creature'
              : 'a whole row'
            : wording === 'row'
              ? rows.map(placeWord).join(' and ')
              : rows.length === 1
                ? `whole ${zoneWord(rows[0] as Zone)} row`
                : `${rows.map(zoneWord).join(' and ')} rows`;
      break;
    }
    case 'barrage':
      title = gimmickName(names, strike.gimmick, 'Barrage');
      area = countOf(strike.targets.length, 'random creature');
      break;
    case 'slam': {
      title = gimmickName(names, strike.gimmick, 'Slam');
      const target = strike.targets[0];
      area = target === undefined ? 'one creature' : who(target);
      if (strike.guarded !== null) area += `, guarding ${who(strike.guarded)}`;
      const splash = strike.splash?.length ?? 0;
      if (splash > 0) area += `, splash on ${String(splash)}`;
      break;
    }
    case 'lance': {
      title = gimmickName(names, strike.gimmick, 'Lance');
      const lane = strike.lane === undefined ? null : `lane ${String(strike.lane + 1)}`;
      area =
        wording === 'row'
          ? strike.targets[0] === undefined
            ? 'one creature'
            : who(strike.targets[0])
          : (lane ?? 'one lane');
      break;
    }
    case 'pincer':
      title = gimmickName(names, strike.gimmick, 'Pincer');
      area = wording === 'row' ? 'both ends' : 'the ends of every row';
      break;
    case 'charge': {
      title = gimmickName(names, strike.gimmick, 'Charge');
      const rows = strike.rows ?? [];
      area =
        rows.length > 0 && wording === 'zones'
          ? rows.length >= ZONES.length
            ? 'marks every row'
            : `marks the ${rows.map(zoneWord).join(' and ')} ${rows.length === 1 ? 'row' : 'rows'}`
          : strike.targets.length === 0
            ? 'gathering'
            : `marks ${countOf(strike.targets.length, 'creature')}`;
      break;
    }
    case 'enrage':
      title = 'Enraged';
      area = wording === 'row' ? 'hits everyone' : 'hits every creature';
      break;
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
  /** "Next round: Undertow hits FRONT"; two clauses are joined with "; ". */
  text: string;
  /** The same in at most two lines, one clause each ("Next round: Great Wave sweeps the MIDDLE row", "Riptide cuts a lane"). */
  lines: readonly string[];
  /** Zones a warning glyph goes on. */
  zones: readonly Zone[];
  /**
   * The creatures a warning glyph goes on: the two ends of the row that are still up (a silence or a
   * pincer will hit them), or the creature a slam is aimed at when the content says who it is.
   */
  ends: readonly string[];
}

/** The most clauses a forecast says: more would not fit on two lines at 360 px. */
export const MAX_FORECAST_CLAUSES = 2;

/** What the clause builders read and add to: the row as it stands now. */
interface Look {
  wording: Wording;
  row: readonly string[];
  /** The creatures still up, left to right. */
  living: readonly string[];
  up: (id: string | undefined) => id is string;
  zones: Zone[];
  ends: string[];
}

function mark(look: Look, zone: Zone): void {
  if (!look.zones.includes(zone)) look.zones.push(zone);
}

function markEnd(look: Look, id: string | undefined): void {
  if (id !== undefined && !look.ends.includes(id)) look.ends.push(id);
}

/** The zone a zone-aimed pattern really lands on: the aimed one if someone is up in it, else the nearest. */
function livingZone(look: Look, aimed: Zone): Zone | undefined {
  return nearestLivingZone(aimed, (z) =>
    zoneIndices(z, look.row.length).some((i) => look.up(look.row[i])),
  );
}

/** What an attack pattern will do, or null when nobody is left for it to hit. */
function patternClause(target: PatternTarget, op: string, name: string, look: Look): string | null {
  const { wording } = look;
  switch (target.kind) {
    case 'zone': {
      const zone = livingZone(look, target.zone);
      if (zone === undefined) return null;
      mark(look, zone);
      if (wording === 'row') return `${name} hits ${placeWord(zone)}`;
      return op === 'sweep'
        ? `${name} sweeps the ${zoneWord(zone)} row`
        : `${name} hits ${zoneWord(zone)}`;
    }
    case 'all': {
      if (look.living.length === 0) return null;
      for (const z of ZONES) if (livingZone(look, z) === z) mark(look, z);
      return wording === 'row' ? `${name} hits the whole row` : `${name} sweeps every row`;
    }
    case 'payoffs': {
      // Which row has the most Payoffs is only known when the sweep lands, so it is worded generically.
      if (look.living.length === 0) return null;
      return wording === 'row'
        ? `${name} hits the creatures of one row`
        : `${name} sweeps the row with the most Payoffs`;
    }
    case 'random': {
      // The count depends on who is still up, so it is a range; never more than there are creatures.
      const most = Math.min(target.max, look.living.length);
      const least = Math.min(target.min, most);
      if (most === 0) return null;
      if (most === 1) return `${name} hits one random creature`;
      return least === most
        ? `${name} drops shells on ${String(most)} random creatures`
        : `${name} drops shells on ${String(least)} to ${String(most)} random creatures`;
    }
    case 'slam': {
      const victim = target.aim === 'front' || target.aim === 'left' ? look.living[0] : undefined;
      // Whoever the aim is, with nobody up there is nothing to slam.
      if (look.living.length === 0) return null;
      if (target.aim === 'strongest') {
        return `${name} slams your strongest, and splashes its neighbours`;
      }
      if (target.aim === 'payoff') {
        return `${name} slams your strongest Payoff, and splashes its neighbours`;
      }
      if (target.aim === 'random') {
        return `${name} slams a random creature, and splashes its neighbours`;
      }
      if (victim === undefined) return null;
      markEnd(look, victim);
      if (wording === 'zones') {
        return `${name} slams the front-most creature, and splashes its neighbours`;
      }
      // One row of three: say who it hits and who is beside it.
      const at = look.row.indexOf(victim);
      const places = neighbours(at, look.row.length)
        .filter((i) => look.up(look.row[i]))
        .map((i) => ROW_PLACE_WORDS[zoneOfIndex(i, look.row.length)]);
      const hits = `${name} hits ${placeWord(zoneOfIndex(at, look.row.length))}`;
      return places.length === 0 ? hits : `${hits} and splashes the ${places.join(' and the ')}`;
    }
    case 'lane': {
      if (look.living.length === 0) return null;
      if (wording === 'row') {
        return target.lane === 'strongest'
          ? `${name} hits your strongest`
          : `${name} hits a random creature`;
      }
      return target.lane === 'strongest'
        ? `${name} cuts through the lane of your strongest`
        : `${name} cuts a lane through every row`;
    }
    case 'pincer': {
      if (look.living.length === 0) return null;
      if (wording === 'row' || target.scope === 'row') {
        markEnd(look, look.living[0]);
        markEnd(look, look.living[look.living.length - 1]);
        return `${name} closes on both ends`;
      }
      // The first and last creature still up in every row.
      for (const z of ZONES) {
        const inRow = zoneIndices(z, look.row.length)
          .map((i) => look.row[i])
          .filter(look.up);
        markEnd(look, inRow[0]);
        markEnd(look, inRow[inRow.length - 1]);
      }
      return `${name} closes on the ends of every row`;
    }
  }
}

/** The clause of one warning, or null when it has nothing left to aim at. */
function clauseOf(w: BossWarning, name: string, look: Look): string | null {
  const t = w.target;
  switch (t.kind) {
    case 'ends':
      markEnd(look, look.living[0]);
      markEnd(look, look.living[look.living.length - 1]);
      return `${name} silences both ends`;
    case 'strongest':
      return t.jumps === 0
        ? `${name} strikes your strongest`
        : `${name} strikes your strongest, then jumps ${t.jumps === 1 ? 'once' : t.jumps === 2 ? 'twice' : `${String(t.jumps)} times`}`;
    case 'reaction':
      return `${name} reflects the first reaction`;
    case 'charge': {
      if (t.stage === 'gathering') return `${name} is gathering`;
      // Landing: its victims were marked a round ago; the row outline comes from the content.
      if (t.inner.kind === 'zone') {
        const zone = livingZone(look, t.inner.zone);
        if (zone !== undefined) mark(look, zone);
      } else if (t.inner.kind === 'all') {
        for (const z of ZONES) if (livingZone(look, z) === z) mark(look, z);
      }
      return `${name} lands on the marked ${
        look.wording === 'zones' &&
        (t.inner.kind === 'zone' || t.inner.kind === 'all' || t.inner.kind === 'payoffs')
          ? 'row'
          : 'creatures'
      }`;
    }
    default:
      return patternClause(t, w.op, name, look);
  }
}

/** What is said first when there is not room for everything: a charge, then a pattern, then the rest. */
function priority(w: BossWarning): number {
  if (w.target.kind === 'charge') return 0;
  switch (w.target.kind) {
    case 'ends':
    case 'reaction':
    case 'strongest':
      return 2;
    default:
      return w.op === 'hit_zone' ? 2 : 1;
  }
}

/**
 * The forecast for the round after `round` (the round the stage is showing), or null when the boss
 * does nothing special then, the fight is over, or the boss is unknown. `row` is the row's creature
 * ids left to right and `knockedOut` those that are down now: everything the forecast aims at (a
 * zone, the ends of a row, a number of random creatures) is worded for who is still up. A strike on
 * the strongest depends on the creatures' Attack, which the stage does not know, so it is worded
 * generically. At most two clauses are said (`MAX_FORECAST_CLAUSES`): a charge first, then patterns,
 * then the older tricks. `addedGimmicks` are what a dungeon room's modifier gives its foe (see
 * `bossOrFoe`).
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
  const boss = bossOrFoe(bossId, addedGimmicks, names.gimmicks);
  if (boss === undefined) return null;
  const warnings = bossWarnings(boss, round + 1);
  if (warnings.length === 0) return null;
  // The engine aims at the living: a zone hit falls to the nearest zone with someone standing, and
  // "both ends" are the leftmost and rightmost creatures still up (see `fireGimmick` in the engine).
  const up = (id: string | undefined): id is string => id !== undefined && !knockedOut.includes(id);
  const look: Look = { wording, row, living: row.filter(up), up, zones: [], ends: [] };
  const ordered = warnings
    .map((w, k) => ({ w, k }))
    .sort((a, b) => priority(a.w) - priority(b.w) || a.k - b.k);
  const parts: string[] = [];
  for (const { w } of ordered) {
    if (parts.length >= MAX_FORECAST_CLAUSES) break;
    const part = clauseOf(w, gimmickName(names, w.gimmick, w.name), look);
    if (part !== null) parts.push(part);
  }
  if (parts.length === 0) return null;
  const lines = parts.map((part, k) => (k === 0 ? `Next round: ${part}` : part));
  return { text: `Next round: ${parts.join('; ')}`, lines, zones: look.zones, ends: look.ends };
}
