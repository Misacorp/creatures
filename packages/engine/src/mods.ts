import { ELEMENTS, type Element, type Role } from '@creatures/game';
import type { SlotMods } from './types';

/**
 * A creature's modifier sheet with every number filled in (0 when the slot has none), so the fight
 * reads plain numbers. Built once per creature by `resolveMods`.
 */
export interface ResolvedMods {
  vsElementBp: Readonly<Partial<Record<Element, number>>>;
  markedFoeBp: number;
  firstHitBp: number;
  markingHitBp: number;
  strikeBp: number;
  besideRoleBp: Readonly<Partial<Record<Role, number>>>;
  pierceBp: number;
  reactionBp: Readonly<Partial<Record<string, number>>>;
  pounceBp: number;
  ownerMarkBp: number;
  keenReactionBp: number;
  shareBp: number;
  takenBp: number;
  areaBp: number;
  aimedBp: number;
  reflectedBp: number;
  chargedBp: number;
  wardBp: Readonly<Partial<Record<Element, number>>>;
  healReceivedBp: number;
  armorBp: number;
  coverBp: number;
  boostBp: number;
  mendBp: number;
  lingerRounds: number;
  ignoreSilence: boolean;
  shelterBp: number;
  unreflected: boolean;
  critWindowBp: number;
  healOnReactionBp: number;
  chainMark: boolean;
  coverReach: boolean;
  boostReach: boolean;
  sealMark: boolean;
  firstReactionCrit: boolean;
  secondWindBp: number;
  echoBp: number;
  sidestepBp: number;
  steadyPawsBp: number;
  warmHeartBp: number;
  quickRemarkBp: number;
  spillOverBp: number;
  paybackBp: number;
  kindlingBp: number;
  openingMark: boolean;
  rallyCryBp: number;
  emberTailBp: number;
  stormWarningBp: number;
  stubborn: boolean;
  lastStandBp: number;
  overflowBp: number;
  secondBreathBp: number;
  patientBp: number;
  sharedWarmthBp: number;
  riposteBp: number;
  momentumBp: number;
  slipstreamBp: number;
  dodgeBp: number;
  areaDodgeBp: number;
  debuffResistBp: number;
  debuffPowerBp: number;
  debuffDurationTurns: number;
}

/**
 * What a chance line does when it fires, fixed by the line's design (`gear-and-creatures-v2.md` 6.3): the
 * line's own number is the chance, so these are not tiered. They are code, not stored in a fight: a retune
 * of one would change how a stored fight with that line replays, so a different size is a new line.
 */
export const CHANCE_FX = {
  /** Second wind heals this share of max HP. */
  secondWindHealBp: 500,
  /** Echo lands again for this share of the plain hit. */
  echoBp: 3_000,
  /** Warm heart's boost on the neighbour's next hit. */
  warmHeartBp: 1_000,
} as const;

/** The luck dice a creature gets each round when any creature of the fight has a chance line: one per kind (see `fight.ts`). */
export const LUCK_DICE = 10;

/** The chance-line fields of a sheet: any above 0 makes the fight draw luck dice. */
export const CHANCE_KEYS = [
  'secondWindBp',
  'echoBp',
  'sidestepBp',
  'steadyPawsBp',
  'warmHeartBp',
  'quickRemarkBp',
  'spillOverBp',
] as const;

/** True if the sheet carries a chance line. */
export function hasChance(mods: ResolvedMods): boolean {
  return CHANCE_KEYS.some((k) => mods[k] > 0);
}

const ROLE_IDS: readonly Role[] = ['setter', 'payoff', 'guard', 'support'];

/** A bonus: from a heavy penalty to ten times the hit. */
const BONUS = [-100_000, 100_000] as const;
/** A reduction: a negative one makes the creature take more. 10000 stops the hit. */
const CUT = [-100_000, 10_000] as const;
const SHARE = [0, 10_000] as const;

const NO_MAP: Readonly<Record<string, number>> = Object.freeze({});

const EMPTY: ResolvedMods = Object.freeze({
  vsElementBp: NO_MAP,
  markedFoeBp: 0,
  firstHitBp: 0,
  markingHitBp: 0,
  strikeBp: 0,
  besideRoleBp: NO_MAP,
  pierceBp: 0,
  reactionBp: NO_MAP,
  pounceBp: 0,
  ownerMarkBp: 0,
  keenReactionBp: 0,
  shareBp: 0,
  takenBp: 0,
  areaBp: 0,
  aimedBp: 0,
  reflectedBp: 0,
  chargedBp: 0,
  wardBp: NO_MAP,
  healReceivedBp: 0,
  armorBp: 0,
  coverBp: 0,
  boostBp: 0,
  mendBp: 0,
  lingerRounds: 0,
  ignoreSilence: false,
  shelterBp: 0,
  unreflected: false,
  critWindowBp: 0,
  healOnReactionBp: 0,
  chainMark: false,
  coverReach: false,
  boostReach: false,
  sealMark: false,
  firstReactionCrit: false,
  secondWindBp: 0,
  echoBp: 0,
  sidestepBp: 0,
  steadyPawsBp: 0,
  warmHeartBp: 0,
  quickRemarkBp: 0,
  spillOverBp: 0,
  paybackBp: 0,
  kindlingBp: 0,
  openingMark: false,
  rallyCryBp: 0,
  emberTailBp: 0,
  stormWarningBp: 0,
  stubborn: false,
  lastStandBp: 0,
  overflowBp: 0,
  secondBreathBp: 0,
  patientBp: 0,
  sharedWarmthBp: 0,
  riposteBp: 0,
  momentumBp: 0,
  slipstreamBp: 0,
  dodgeBp: 0,
  areaDodgeBp: 0,
  debuffResistBp: 0,
  debuffPowerBp: 0,
  debuffDurationTurns: 0,
});

/** The sheet of a creature without one. */
export const NO_MODS: ResolvedMods = EMPTY;

function bad(id: string, message: string): never {
  throw new RangeError(`invalid fight input: creature "${id}" mods: ${message}`);
}

function num(
  id: string,
  name: string,
  value: unknown,
  [min, max]: readonly [number, number],
): number {
  if (value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    return bad(id, `${name} must be an integer from ${String(min)} to ${String(max)}`);
  }
  return value;
}

function table<K extends string>(
  id: string,
  name: string,
  value: unknown,
  keys: readonly K[],
  range: readonly [number, number],
): Partial<Record<K, number>> {
  if (value === undefined) return NO_MAP as Partial<Record<K, number>>;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return bad(id, `${name} must be an object`);
  }
  const out: Partial<Record<K, number>> = {};
  for (const [k, v] of Object.entries(value)) {
    if (!(keys as readonly string[]).includes(k)) bad(id, `${name} has an unknown key "${k}"`);
    const n = num(id, `${name}.${k}`, v, range);
    if (n !== 0) out[k as K] = n;
  }
  return out;
}

/**
 * Checks a slot's sheet and fills it in. Strict: unknown fields, non-integers and out-of-range
 * numbers throw (the sheet is built by the server, so a bad one is a bug, never a player's input).
 * `reactionIds` are the ids a `reactionBp` key may name.
 */
export function resolveMods(
  id: string,
  mods: SlotMods | undefined,
  reactionIds: readonly string[],
): ResolvedMods {
  if (mods === undefined) return EMPTY;
  if (typeof mods !== 'object' || mods === null || Array.isArray(mods)) {
    return bad(id, 'must be an object');
  }
  const known = new Set<string>(Object.keys(EMPTY));
  for (const k of Object.keys(mods)) if (!known.has(k)) bad(id, `unknown field "${k}"`);
  const m = mods as Record<string, unknown>;
  const n = (name: string, range: readonly [number, number] = BONUS): number =>
    num(id, name, m[name], range);
  const flag = (name: string): boolean => {
    const value = m[name];
    if (value !== undefined && value !== 0 && value !== 1) bad(id, `${name} must be 0 or 1`);
    return value === 1;
  };
  const ignore = flag('ignoreSilence');
  return {
    vsElementBp: table(id, 'vsElementBp', m['vsElementBp'], ELEMENTS, BONUS),
    markedFoeBp: n('markedFoeBp'),
    firstHitBp: n('firstHitBp'),
    markingHitBp: n('markingHitBp'),
    strikeBp: n('strikeBp'),
    besideRoleBp: table(id, 'besideRoleBp', m['besideRoleBp'], ROLE_IDS, BONUS),
    pierceBp: n('pierceBp', SHARE),
    reactionBp: table(id, 'reactionBp', m['reactionBp'], reactionIds, BONUS),
    pounceBp: n('pounceBp'),
    ownerMarkBp: n('ownerMarkBp'),
    keenReactionBp: n('keenReactionBp'),
    shareBp: n('shareBp'),
    takenBp: n('takenBp', CUT),
    areaBp: n('areaBp', CUT),
    aimedBp: n('aimedBp', CUT),
    reflectedBp: n('reflectedBp', CUT),
    chargedBp: n('chargedBp', CUT),
    wardBp: table(id, 'wardBp', m['wardBp'], ELEMENTS, CUT),
    healReceivedBp: n('healReceivedBp'),
    armorBp: n('armorBp'),
    coverBp: n('coverBp'),
    boostBp: n('boostBp'),
    mendBp: n('mendBp'),
    lingerRounds: n('lingerRounds', [0, 3]),
    ignoreSilence: ignore,
    shelterBp: n('shelterBp'),
    unreflected: flag('unreflected'),
    critWindowBp: n('critWindowBp'),
    healOnReactionBp: n('healOnReactionBp', SHARE),
    chainMark: flag('chainMark'),
    coverReach: flag('coverReach'),
    boostReach: flag('boostReach'),
    sealMark: flag('sealMark'),
    firstReactionCrit: flag('firstReactionCrit'),
    secondWindBp: n('secondWindBp', SHARE),
    echoBp: n('echoBp', SHARE),
    sidestepBp: n('sidestepBp', SHARE),
    steadyPawsBp: n('steadyPawsBp', SHARE),
    warmHeartBp: n('warmHeartBp', SHARE),
    quickRemarkBp: n('quickRemarkBp', SHARE),
    spillOverBp: n('spillOverBp', SHARE),
    paybackBp: n('paybackBp'),
    kindlingBp: n('kindlingBp'),
    openingMark: flag('openingMark'),
    rallyCryBp: n('rallyCryBp'),
    emberTailBp: n('emberTailBp'),
    stormWarningBp: n('stormWarningBp', SHARE),
    stubborn: flag('stubborn'),
    lastStandBp: n('lastStandBp', SHARE),
    overflowBp: n('overflowBp'),
    secondBreathBp: n('secondBreathBp', SHARE),
    patientBp: n('patientBp'),
    sharedWarmthBp: n('sharedWarmthBp'),
    riposteBp: n('riposteBp', [0, 100_000]),
    momentumBp: n('momentumBp'),
    slipstreamBp: n('slipstreamBp'),
    dodgeBp: n('dodgeBp', SHARE),
    areaDodgeBp: n('areaDodgeBp', SHARE),
    debuffResistBp: n('debuffResistBp', SHARE),
    debuffPowerBp: n('debuffPowerBp', [0, 100_000]),
    debuffDurationTurns: n('debuffDurationTurns', [0, 10]),
  };
}

/** `amount` less `bp` of itself, rounded down (`bp` negative: more). 0 leaves it alone. */
export function cutBp(amount: number, bp: number): number {
  if (bp === 0) return amount;
  return Math.floor((amount * Math.max(0, 10_000 - bp)) / 10_000);
}
