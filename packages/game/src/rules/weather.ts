import { weatherContent, weatherDef } from '../content/weather';
import type { ExpeditionLength } from '../content/expedition-schema';
import { EXPEDITION_LENGTHS } from '../content/expedition-schema';
import type { Element, Role } from '../content/schema';
import type { WeatherDef, WeatherEffect } from '../content/weather-schema';
import { chance, int, type Rng } from '../rng';
import { RULES, type LuckConfig } from './config';
import type { WorkshopMods } from './gear';
import type { GearMods } from './gear-items';

/*
 * Boons and Omens (docs/design/gear-and-creatures-v2.md section 10). Pure functions; the Worker, the
 * client's views and the simulators call these same ones. A day's weather is stored as ids plus the
 * strength it was drawn at; everything the day does is derived from it here, into the plain numbers the
 * engine and the rules already take (a modifier sheet, a luck copy, a number of boss attacks, trip and
 * Workshop numbers). A fight, a trip or a job keeps the numbers it was started with, so a claim never
 * reads the weather again.
 */

const BP = 10_000;

/** A day's weather as it is stored: the game day (its start date), the two ids and their strengths. */
export interface WeatherDay {
  /** The game day, named by the guild-local calendar date it starts on (`gameDay`). */
  day: string;
  boon: string;
  /** Null from Boss Rank 1 to 2 and in Festival weeks. */
  omen: string | null;
  /** The Omen is a wild one (drawn a day ahead, at most one a week). */
  wild: boolean;
  /** The multiplier on the Boon's and the Omen's numbers, in basis points (10000 is x1). */
  boonBp: number;
  omenBp: number;
}

/** What `RULES.weather.tiers` makes of a Boss Rank: the strength of the Boon and of the Omen (0: no Omen). */
export function weatherStrength(rank: number): { boonBp: number; omenBp: number } {
  const r = Math.max(1, Math.trunc(rank));
  let row: { boonBp: number; omenBp: number } = RULES.weather.tiers[0];
  for (const tier of RULES.weather.tiers) if (r >= tier.fromRank) row = tier;
  return { boonBp: row.boonBp, omenBp: row.omenBp };
}

// --- Drawing ---

export interface DrawContext {
  /** The server's Boss Rank (at least 1). */
  rank: number;
  /** The day falls in a Festival week: Boons only. */
  festival: boolean;
  /** The Omen of the day before, which may not come again (null when there was none or it is unknown). */
  previousOmen: string | null;
  /**
   * A wild Omen may be drawn: none has been drawn yet this raid week, and the draw is made before the day
   * starts (a wild Omen is always known a day ahead).
   */
  wildAllowed: boolean;
}

export interface WeatherDraw {
  boon: string;
  omen: string | null;
  wild: boolean;
  boonBp: number;
  omenBp: number;
}

function liveOf(kind: 'boon' | 'omen'): WeatherDef[] {
  return weatherContent.filter((d) => d.kind === kind && d.status === 'live');
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[int(rng, items.length)];
  if (item === undefined) throw new RangeError('nothing to pick from');
  return item;
}

/**
 * Draws a day's Boon and Omen with `rng` (the server passes the live crypto source, drawn at the moment
 * it is needed and stored; never a seed a player could compute). One Boon at random; then, when the day
 * may have an Omen (Boss Rank 3 and up, not a Festival week), one Omen that is not yesterday's and does
 * not undo the Boon (`cancels`). From `RULES.weather.wildFromRank` a wild Omen replaces the day's Omen
 * with chance `wildChanceBp`, if the context allows one. The draws are always in the same order: the
 * Boon, the wild die (only when a wild Omen could come), the Omen.
 */
export function drawWeather(rng: Rng, ctx: DrawContext): WeatherDraw {
  const strength = weatherStrength(ctx.rank);
  const boon = pick(rng, liveOf('boon'));
  const draw: WeatherDraw = {
    boon: boon.id,
    omen: null,
    wild: false,
    boonBp: strength.boonBp,
    omenBp: strength.omenBp,
  };
  if (ctx.festival || strength.omenBp <= 0) return { ...draw, omenBp: 0 };
  const fits = (d: WeatherDef): boolean =>
    (d.minRank ?? 1) <= ctx.rank && d.id !== ctx.previousOmen && !boon.cancels.includes(d.id);
  const omens = liveOf('omen');
  const wilds = omens.filter((d) => d.wild === true && fits(d));
  if (
    ctx.wildAllowed &&
    ctx.rank >= RULES.weather.wildFromRank &&
    wilds.length > 0 &&
    chance(rng, RULES.weather.wildChanceBp, BP)
  ) {
    return { ...draw, omen: pick(rng, wilds).id, wild: true };
  }
  const plain = omens.filter((d) => d.wild !== true && fits(d));
  if (plain.length === 0) return { ...draw, omenBp: 0 };
  return { ...draw, omen: pick(rng, plain).id };
}

// --- The effects of a day ---

/** One effect of the day with the strength it applies at. */
export interface ActiveEffect {
  source: 'boon' | 'omen';
  id: string;
  effect: WeatherEffect;
  /** The multiplier, in basis points. */
  strengthBp: number;
}

/** The effects of a day's Boon and Omen (only live ones, in content order, the Boon first). */
export function activeEffects(day: WeatherDay | null): ActiveEffect[] {
  if (day === null) return [];
  const out: ActiveEffect[] = [];
  const add = (id: string | null, source: 'boon' | 'omen', strengthBp: number): void => {
    const def = id === null ? undefined : weatherDef(id);
    // An id that left the content (or is planned) does nothing: a stored day never breaks a request.
    if (def === undefined || def.status !== 'live') return;
    for (const effect of def.effects) out.push({ source, id: def.id, effect, strengthBp });
  };
  add(day.boon, 'boon', day.boonBp);
  add(day.omen, 'omen', day.omenBp);
  return out;
}

/**
 * `value` times `strengthBp` over 10000, towards zero (so a penalty and a bonus scale alike), then
 * towards zero to a number a player can read: whole percent or points from 10 up, halves below (31.25%
 * is 31%, 3.75 pt is 3.5 pt). The text and the rules use this same number.
 */
export function scaleStrength(value: number, strengthBp: number): number {
  const raw = Math.trunc((value * strengthBp) / BP);
  const step = Math.abs(raw) >= 1_000 ? 100 : 50;
  return Math.trunc(raw / step) * step;
}

// --- Fights: the sheet, luck and boss attacks ---

const CLAMP: Readonly<Record<string, readonly [number, number]>> = {
  takenBp: [-100_000, 10_000],
  areaBp: [-100_000, 10_000],
  aimedBp: [-100_000, 10_000],
  reflectedBp: [-100_000, 10_000],
  chargedBp: [-100_000, 10_000],
  pierceBp: [0, 10_000],
  lingerRounds: [0, 3],
};
const MAPS: ReadonlySet<string> = new Set(['vsElementBp', 'besideRoleBp', 'reactionBp', 'wardBp']);
/** The engine's default range for a one-number field (`resolveMods`'s BONUS). */
const DEFAULT_CLAMP: readonly [number, number] = [-100_000, 100_000];
const WARD_CLAMP: readonly [number, number] = [-100_000, 10_000];

function clampTo(value: number, [min, max]: readonly [number, number]): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Adds two modifier sheets, field by field (maps key by key), and keeps every number inside the range
 * the engine accepts, so a day's numbers on top of gear can never make a fight input invalid. `undefined`
 * stands for an empty sheet; the answer is `undefined` when both are empty.
 */
export function mergeMods(
  base: GearMods | undefined,
  extra: GearMods | undefined,
): GearMods | undefined {
  if (extra === undefined || Object.keys(extra).length === 0) return base;
  if (base === undefined || Object.keys(base).length === 0) return extra;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    const had = out[key];
    if (MAPS.has(key)) {
      const sum: Record<string, number> = { ...((had ?? {}) as Record<string, number>) };
      for (const [k, v] of Object.entries(value as Record<string, number>)) {
        const range = key === 'wardBp' ? WARD_CLAMP : DEFAULT_CLAMP;
        sum[k] = clampTo((sum[k] ?? 0) + v, range);
      }
      out[key] = sum;
    } else if (key === 'ignoreSilence') {
      out[key] = had === 1 || value === 1 ? 1 : 0;
    } else {
      out[key] = clampTo(
        ((had as number | undefined) ?? 0) + (value as number),
        CLAMP[key] ?? DEFAULT_CLAMP,
      );
    }
  }
  return out;
}

/** A creature as the day's sheet sees it. */
export interface SheetWearer {
  role: Role;
  element: Element;
}

/**
 * What the day adds to one creature's modifier sheet (`FightSlot.mods`): its Boon and Omen's sheet
 * and reaction effects (not the day's linger, which goes to every ability: `weatherSky`), and the foes' stronger attacks as what the creature takes (an
 * `elements` override becomes the part on top of the general rise, so the element's foes hit exactly as
 * hard as the data says). Undefined when the day adds nothing for this creature. The wearer's element
 * is not used today (every sheet effect of the starter list is for everyone or for a role) but is
 * part of the signature so an effect that needs it adds no new call sites.
 */
export function weatherSheet(day: WeatherDay | null, wearer: SheetWearer): GearMods | undefined {
  const sheet: Record<string, unknown> = {};
  const addNumber = (key: string, value: number): void => {
    if (value !== 0) sheet[key] = ((sheet[key] as number | undefined) ?? 0) + value;
  };
  const addMap = (key: string, name: string, value: number): void => {
    if (value === 0) return;
    const map = (sheet[key] ?? {}) as Record<string, number>;
    map[name] = (map[name] ?? 0) + value;
    sheet[key] = map;
  };
  for (const { effect: e, strengthBp } of activeEffects(day)) {
    switch (e.op) {
      case 'sheet':
        if (e.roles === undefined || e.roles.includes(wearer.role)) {
          addNumber(e.field, scaleStrength(e.bp, strengthBp));
        }
        break;
      case 'linger':
        // Not on the sheet: the day's linger goes to every ability through `weatherSky` (`lingerAllRounds`).
        break;
      case 'reaction':
        for (const r of e.reactions) addMap('reactionBp', r, scaleStrength(e.bp, strengthBp));
        break;
      case 'foeAttack': {
        const base = scaleStrength(e.bp, strengthBp);
        addNumber('takenBp', -base);
        for (const [element, bp] of Object.entries(e.elements ?? {})) {
          const own = scaleStrength(bp ?? 0, strengthBp);
          // Both cuts multiply, so the element's part is the ratio of the two rises.
          const factor = Math.floor(((BP + own) * BP) / (BP + base));
          addMap('wardBp', element, -(factor - BP));
        }
        break;
      }
      default:
        break;
    }
  }
  return Object.keys(sheet).length === 0 ? undefined : sheet;
}

/** The luck rules of a day: the team's crit chance and the foes' crit chance raised. The same object back when it changes nothing. */
export function weatherLuck(day: WeatherDay | null, luck: LuckConfig): LuckConfig {
  let crit = 0;
  let foeCrit = 0;
  for (const { effect: e, strengthBp } of activeEffects(day)) {
    if (e.op === 'crit') crit += scaleStrength(e.bp, strengthBp);
    if (e.op === 'foeCrit') foeCrit += scaleStrength(e.bp, strengthBp);
  }
  if (crit === 0 && foeCrit === 0) return luck;
  return {
    ...luck,
    critChanceBp: luck.critChanceBp + crit,
    ...(foeCrit === 0 ? {} : { bossCritChanceBp: (luck.bossCritChanceBp ?? 0) + foeCrit }),
  };
}

/** How many plain attacks the boss makes each round on the day: `base` plus the day's extra, at most 3. */
export function weatherBossAttacks(day: WeatherDay | null, base: number): number {
  let extra = 0;
  for (const { effect: e } of activeEffects(day)) if (e.op === 'foeAttacks') extra += e.extra;
  return Math.min(3, base + extra);
}

/** What the day adds to a fight beyond the sheet, the luck rules and the boss's attacks (all off on a plain day). */
export interface WeatherSky {
  /** Kind Rain: the share of max HP every living creature heals at round start, in basis points (0: none). */
  rainHealBp: number;
  /** Morning Haze: the first creature of each row (the dungeon's left one) skips its first turn. */
  haze: boolean;
  /** Bramble Season: the share of the first reaction's bonus each round that goes back at its setter-off (0: none). */
  brambleBp: number;
  /**
   * Lantern Light: rounds added to the timed effects of every ability in the fight, basic ones too (0: none).
   * It lives here and not on a creature's sheet, so a creature's own ability is not lengthened twice.
   */
  lingerAllRounds: number;
}

/** The day's Kind Rain, Morning Haze, Bramble Season and Lantern Light numbers at the day's strength. */
export function weatherSky(day: WeatherDay | null): WeatherSky {
  const out: WeatherSky = { rainHealBp: 0, haze: false, brambleBp: 0, lingerAllRounds: 0 };
  for (const { effect: e, strengthBp } of activeEffects(day)) {
    if (e.op === 'roundHeal') out.rainHealBp += scaleStrength(e.bp, strengthBp);
    if (e.op === 'skipFirstTurn') out.haze = true;
    if (e.op === 'bramble') out.brambleBp += scaleStrength(e.bp, strengthBp);
    if (e.op === 'linger') out.lingerAllRounds += e.rounds;
  }
  out.lingerAllRounds = Math.min(3, out.lingerAllRounds);
  out.rainHealBp = Math.min(BP, out.rainHealBp);
  out.brambleBp = Math.min(BP, out.brambleBp);
  return out;
}

/** Scrap added to every room cleared in the dungeon on the day (Market Day). */
export function dungeonScrapPerRoom(day: WeatherDay | null): number {
  let scrap = 0;
  for (const { effect: e } of activeEffects(day)) if (e.op === 'dungeonScrap') scrap += e.perRoom;
  return scrap;
}

// --- Trips ---

/**
 * What the day does to one trip, fixed when it is sent and stored with it (so the claim reads these and
 * never the weather): the time, the parts, the shard and supply chances, the extra catch rolls, the
 * rarity bump, the journal chance, whether a night place is open, and the experience.
 */
export interface TripWeather {
  /** The trip's time, in basis points on top (negative: shorter). */
  timeBp: number;
  partsBp: number;
  shardsBp: number;
  supplyBp: number;
  extraRolls: number;
  /** Basis points of chance moved up a rarity on every roll. */
  rarityBp: number;
  journalBp: number;
  reefOpen: boolean;
  xpBp: number;
  treatMultiplier: number | null;
}

export const NO_TRIP_WEATHER: TripWeather = Object.freeze({
  timeBp: 0,
  partsBp: 0,
  shardsBp: 0,
  supplyBp: 0,
  extraRolls: 0,
  rarityBp: 0,
  journalBp: 0,
  reefOpen: false,
  xpBp: 0,
  treatMultiplier: null,
});

/** True when `length` is at least `min` (the lengths run shortest first). */
function lengthAtLeast(length: ExpeditionLength, min: ExpeditionLength): boolean {
  return EXPEDITION_LENGTHS.indexOf(length) >= EXPEDITION_LENGTHS.indexOf(min);
}

/** The day's effect on a trip to `destination` of `length` (what `tripWeather` would store). */
export function tripWeather(
  day: WeatherDay | null,
  trip: { destination: string; length: ExpeditionLength },
): TripWeather {
  const out = { ...NO_TRIP_WEATHER };
  for (const { effect: e, strengthBp } of activeEffects(day)) {
    switch (e.op) {
      case 'tripTime':
        out.timeBp += scaleStrength(e.bp, strengthBp);
        break;
      case 'tripParts':
        if (e.places === undefined || e.places.includes(trip.destination)) {
          out.partsBp += scaleStrength(e.bp, strengthBp);
        }
        break;
      case 'tripShards':
        out.shardsBp += scaleStrength(e.bp, strengthBp);
        break;
      case 'tripSupply':
        out.supplyBp += scaleStrength(e.bp, strengthBp);
        break;
      case 'tripRoll':
        if (e.places.includes(trip.destination) && lengthAtLeast(trip.length, e.minLength)) {
          out.extraRolls += e.extra;
        }
        break;
      case 'tripRarity':
        out.rarityBp += scaleStrength(e.bp, strengthBp);
        break;
      case 'tripJournal':
        out.journalBp += scaleStrength(e.bp, strengthBp);
        break;
      case 'reefOpen':
        out.reefOpen = true;
        break;
      case 'xp':
        out.xpBp += scaleStrength(e.bp, strengthBp);
        if (e.treatMultiplier !== undefined) out.treatMultiplier = e.treatMultiplier;
        break;
      default:
        break;
    }
  }
  return out;
}

/** A time (a trip, a Workshop job) after the day's effect (`timeBp`: negative is shorter), at least a minute. */
export function weatherTimeMs(ms: number, timeBp: number): number {
  if (timeBp === 0) return ms;
  return Math.max(60_000, Math.floor((ms * Math.max(0, BP + timeBp)) / BP));
}

// --- Creature experience and the Workshop ---

/** What the day does to creature experience: basis points on top, and the treat's multiplier when it changes. */
export interface XpWeather {
  bp: number;
  treatMultiplier: number | null;
}

/** The day's effect on creature experience (for the dungeon, a raid stage and a job: a trip stores its own). */
export function xpWeather(day: WeatherDay | null): XpWeather {
  const out: XpWeather = { bp: 0, treatMultiplier: null };
  for (const { effect: e, strengthBp } of activeEffects(day)) {
    if (e.op !== 'xp') continue;
    out.bp += scaleStrength(e.bp, strengthBp);
    if (e.treatMultiplier !== undefined) out.treatMultiplier = e.treatMultiplier;
  }
  return out;
}

/** What the day does to a Workshop job when it is started and stored with it. */
export interface JobWeather {
  /** The job's time, in basis points on top (negative: faster). */
  timeBp: number;
  xpBp: number;
  treatMultiplier: number | null;
}

export function jobWeather(day: WeatherDay | null): JobWeather {
  let timeBp = 0;
  for (const { effect: e, strengthBp } of activeEffects(day)) {
    if (e.op === 'workshopTime') timeBp += scaleStrength(e.bp, strengthBp);
  }
  const xp = xpWeather(day);
  return { timeBp, xpBp: xp.bp, treatMultiplier: xp.treatMultiplier };
}

/**
 * The Workshop's day modifiers for a craft or a dismantle job that is about to start, with `before`
 * the player's jobs of that kind already started this game day (every one counts, boosted or not). Market
 * Day boosts only the day's first `crafts` crafts and first `dismantles` dismantle jobs, never every one,
 * so saving items for it pays nothing (`decisions.md`, 2026-10-16).
 */
export function workshopMods(
  day: WeatherDay | null,
  job: 'craft' | 'dismantle',
  before: number,
): WorkshopMods {
  const out: WorkshopMods = {};
  for (const { effect: e, strengthBp } of activeEffects(day)) {
    if (e.op !== 'market') continue;
    if (job === 'craft' && before < e.crafts) {
      const bp = scaleStrength(e.stepUpBp, strengthBp);
      if (bp > 0) out.stepUpBonusBp = (out.stepUpBonusBp ?? 0) + bp;
    }
    if (job === 'dismantle' && before < e.dismantles) out.dismantleTopOfRange = true;
  }
  return out;
}

// --- Words ---

/** A number of basis points as a percent or points figure: `1250` is "12.5", `1500` is "15". */
export function figure(bp: number): string {
  const abs = Math.abs(bp);
  const whole = Math.floor(abs / 100);
  const tenth = Math.floor((abs % 100) / 10);
  return tenth === 0 ? String(whole) : `${String(whole)}.${String(tenth)}`;
}

/** The fight effects live in the raid and the dungeon column, the rest in the trips and Workshop column. */
const FIGHT_OPS: ReadonlySet<string> = new Set([
  'sheet',
  'linger',
  'reaction',
  'crit',
  'foeCrit',
  'foeAttack',
  'foeAttacks',
  'roundHeal',
  'skipFirstTurn',
  'bramble',
  'dungeonScrap',
]);

export interface WeatherLines {
  /** The lines for the raid and the dungeon, with the day's strength in them. */
  fight: string[];
  /** The lines for trips, the Workshop and creature experience. */
  trips: string[];
}

/** The player-facing lines of one Boon or Omen at a strength (the numbers are the real ones). Empty for a planned one. */
export function weatherLines(id: string, strengthBp: number): WeatherLines {
  const out: WeatherLines = { fight: [], trips: [] };
  const def = weatherDef(id);
  if (def === undefined || def.status !== 'live') return out;
  for (const e of def.effects) {
    const bp = e.op === 'market' ? e.stepUpBp : 'bp' in e ? e.bp : 0;
    let text = e.text.replaceAll('{n}', figure(scaleStrength(bp, strengthBp)));
    if (e.op === 'foeAttack') {
      const ember = Math.max(0, ...Object.values(e.elements ?? {}).map((n) => n ?? 0));
      text = text.replaceAll('{e}', figure(scaleStrength(ember, strengthBp)));
    }
    (FIGHT_OPS.has(e.op) ? out.fight : out.trips).push(text);
  }
  return out;
}
