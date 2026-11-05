/**
 * Gear on combat v2: the gear lines that have an effect the v2 engine already reads, as the engine's effect fields
 * (`docs/design/combat/gear-plan.md`, sections 1 and 6). Plain stat lines (Attack, HP, Speed, crit, the item's own stats)
 * are not here: the worker folds them with `applyGear` and they survive silence (R12). A line with no entry here has no
 * v2 hook yet and counts for nothing in the new rules (the client marks it).
 *
 * Conditions are settled before the fight, as v1's `wornEffects` does: a role-restricted line works only for that role, a
 * Reaction line only for a wearer of its element, a Payoff's Pounce only for a Payoff. Position lines (Odd One Out and the
 * like) are not settled here: the engine reads where the creature stands.
 *
 * Every value of a line goes through its entry: the value rolled on the item (today's ladder) times the entry's `scale`.
 * The scales are the gear plan's verdicts ("scale x4", "scale to twin"); each one is listed in `for-misa.md`. A change
 * of a scale is one edit, here.
 */
import { gearLine, gearSet } from '../content/gear';
import type { GearLine } from '../content/gear-schema';
import type { Element, Role } from '../content/schema';
import { itemLines, setCounts, type GearItem } from './gear-items';

/** The effect fields gear may give (a subset of the engine's `KnackFx`). Numbers add; flags combine; `retaliateBp` takes the larger. */
export interface GearFx {
  armourBonus?: number;
  reachBonus?: number;
  dodgeBonusBp?: number;
  areaDodgeBp?: number;
  retaliateBp?: number;
  besideGuardBp?: number;
  areaCutBp?: number;
  coverBonusBp?: number;
  boostBonusBp?: number;
  mendBonusBp?: number;
  healReceivedBp?: number;
  reactionBonusBp?: number;
  firstHitBp?: number;
  perKindredBesideBp?: number;
  oddOneOutBp?: number;
  rowEndBp?: number;
  frontCutBp?: number;
  vengefulBp?: number;
  momentumBp?: number;
  ownMarkBp?: number;
  braceBp?: number;
  miredExtraBp?: number;
  ignoreSilence?: boolean;
  holdOn?: boolean;
  clinging?: boolean;
}

type GearField = keyof GearFx;

export interface GearLineFx {
  readonly field: GearField;
  /** How the rolled value becomes the field: `bp` as it is, `points` as whole points (value / 100), `flag` true, `count` the value itself. */
  readonly unit: 'bp' | 'points' | 'flag' | 'count';
  /** The gear plan's scale as [numerator, denominator] of the rolled value (default 1). */
  readonly scale?: readonly [number, number];
  /** The line works for this role only (Payoff's Pounce); the line's own `restricted` flag is checked as well. */
  readonly onlyRole?: Role;
  /** The line is an element line that helps a wearer of its own element only (Reaction Bonus, gear plan OPEN 8). */
  readonly ownElement?: boolean;
  /** The line works for every role although the data names one (Armour, Misa 2026-10-28). */
  readonly anyRole?: boolean;
  /** Added once, whatever the number of copies (Guard's Shadow keeps the Knack's armour cost). */
  readonly once?: GearFx;
}

/**
 * The reaction family's scale: the lines were priced for x2 reactions and pay for x4.95 bonuses (gear plan section 1, which
 * said x4). x2 since 2026-11-06: at x4 three top-pip lines (+308%) took any Payoff to the x3 reaction cap, so the Knack and the
 * mark stacks stopped mattering; at x2 the best case is +154%, under the cap for a plain Payoff (lab `report -- --gear`, OPEN 14).
 * Best pick, listed for Misa in docs/design/combat/for-misa.md.
 */
const REACTION_SCALE = [2, 1] as const;

/**
 * The lines with a v2 hook, by line id (an element line by its id without the element: `reaction`, not `tide-reaction`).
 * The scales are the gear plan's "top pip" over today's top value.
 */
export const GEAR_LINE_FX: Readonly<Record<string, GearLineFx>> = {
  'well-fed': { field: 'healReceivedBp', unit: 'bp' },
  cover: { field: 'coverBonusBp', unit: 'bp' },
  boost: { field: 'boostBonusBp', unit: 'bp' },
  // The unit stays a share of max HP in bp: the engine adds it to the base heal's share.
  mend: { field: 'mendBonusBp', unit: 'bp' },
  'area-ward': { field: 'areaCutBp', unit: 'bp' },
  'light-footed': { field: 'dodgeBonusBp', unit: 'bp' },
  sidestep: { field: 'areaDodgeBp', unit: 'bp' },
  'odd-one-out': { field: 'oddOneOutBp', unit: 'bp' },
  'edge-walker': { field: 'rowEndBp', unit: 'bp' },
  unbothered: { field: 'ignoreSilence', unit: 'flag' },
  // Top pip 20% against today's 25%.
  brace: { field: 'braceBp', unit: 'bp', scale: [4, 5] },
  clinging: { field: 'clinging', unit: 'flag' },
  // Top pip 5% against today's 17%, and the Knack's price: armour -10.
  'guards-shadow': {
    field: 'besideGuardBp',
    unit: 'bp',
    scale: [3, 10],
    once: { armourBonus: -10 },
  },
  // Top pip 40% against today's 30%.
  'heavy-hand': { field: 'miredExtraBp', unit: 'bp', scale: [4, 3] },
  // Top pip 85% against today's 35%.
  'first-pounce': { field: 'firstHitBp', unit: 'bp', scale: [17, 7] },
  // Top pip 7.5% against today's 17%.
  'owners-mark': { field: 'ownMarkBp', unit: 'bp', scale: [15, 34] },
  // Top pip 11.5% against today's 5%.
  'shoulder-to-shoulder': { field: 'perKindredBesideBp', unit: 'bp', scale: [23, 10] },
  // Top pip 5% against today's 10%.
  'front-liner': { field: 'frontCutBp', unit: 'bp', scale: [1, 2] },
  // Top pip 20% against today's 15%.
  'rally-cry': { field: 'vengefulBp', unit: 'bp', scale: [4, 3] },
  // Top pip 19% against today's 25%.
  momentum: { field: 'momentumBp', unit: 'bp', scale: [3, 4] },
  'payoffs-pounce': {
    field: 'reactionBonusBp',
    unit: 'bp',
    scale: REACTION_SCALE,
    onlyRole: 'payoff',
  },
  reaction: { field: 'reactionBonusBp', unit: 'bp', scale: REACTION_SCALE, ownElement: true },
  // Armour points (2 to 9), for every role.
  armor: { field: 'armourBonus', unit: 'points', anyRole: true },
  'wide-stance': { field: 'reachBonus', unit: 'count' },
  stubborn: { field: 'holdOn', unit: 'flag' },
  // A Retaliate Knack and this line make one counter with the larger chance, not two (OPEN 3).
  riposte: { field: 'retaliateBp', unit: 'bp' },
};

/** The id a line has in `GEAR_LINE_FX`: an element line without its element. */
function entryId(line: GearLine): string {
  return line.element === null ? line.id : line.id.slice(line.element.length + 1);
}

/** The entry of a line, or undefined when the line has no v2 hook. */
function entryOf(line: GearLine): GearLineFx | undefined {
  const id = entryId(line);
  return Object.hasOwn(GEAR_LINE_FX, id) ? GEAR_LINE_FX[id] : undefined;
}

/** Whether a gear line (by its line id) has an effect the v2 engine reads. Plain stat lines are not counted here. */
export function gearLineHasV2Hook(lineId: string): boolean {
  const line = gearLine(lineId);
  return line !== undefined && entryOf(line) !== undefined;
}

/** What one line is worth for this wearer: a number, `true` for a flag, or undefined when it does nothing for them. */
function valueOf(
  entry: GearLineFx,
  line: GearLine,
  value: number,
  wearer: { role: Role; element: Element },
): number | true | undefined {
  if (entry.anyRole !== true && line.restricted && !line.roles.includes(wearer.role)) {
    return undefined;
  }
  if (entry.onlyRole !== undefined && wearer.role !== entry.onlyRole) return undefined;
  if (entry.ownElement === true && line.element !== wearer.element) return undefined;
  if (entry.unit === 'flag') return true;
  const [num, den] = entry.scale ?? [1, 1];
  const scaled = Math.floor((value * num) / den);
  return entry.unit === 'points' ? Math.floor(scaled / 100) : scaled;
}

/**
 * The effect fields a creature's worn gear gives under combat v2: its item lines and its sets' two-piece bonuses that have a
 * v2 hook, for a wearer of this role and element. Empty (`{}`) when nothing applies. Pure; the creature's place in a row is not
 * read (the engine settles position lines).
 */
export function gearFx(
  wearer: { role: Role; element: Element },
  items: readonly GearItem[],
): GearFx {
  const out: Record<string, number | boolean> = {};
  const once = new Set<string>();
  const addTo = (field: string, amount: number): void => {
    const prev = out[field];
    out[field] = (typeof prev === 'number' ? prev : 0) + amount;
  };
  const add = (line: GearLine | undefined, value: number): void => {
    if (line === undefined) return;
    const entry = entryOf(line);
    if (entry === undefined) return;
    const got = valueOf(entry, line, value, wearer);
    if (got === undefined) return;
    if (got === true) out[entry.field] = true;
    else if (entry.field === 'retaliateBp') {
      const prev = out[entry.field];
      out[entry.field] = Math.max(typeof prev === 'number' ? prev : 0, got);
    } else addTo(entry.field, got);
    if (entry.once !== undefined && !once.has(line.id)) {
      once.add(line.id);
      for (const [field, extra] of Object.entries(entry.once)) addTo(field, Number(extra));
    }
  };
  for (const item of items) for (const r of itemLines(item)) add(gearLine(r.id), r.value);
  for (const [id, count] of setCounts(items)) {
    const set = gearSet(id);
    if (set === undefined || count < 2) continue;
    for (const entry of set.two.lines) add(gearLine(entry.line), entry.value);
  }
  return out;
}
