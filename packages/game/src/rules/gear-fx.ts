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
import { content } from '../content';
import { strongAgainst, strongOver } from '../content/element-chart';
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
  // Slice 3 (cuts and conditions). The two element tables and the role table are by id.
  takenCutBp?: number;
  aimedCutBp?: number;
  reflectedCutBp?: number;
  lastStandCutBp?: number;
  vsElementBp?: Record<string, number>;
  fromElementCutBp?: Record<string, number>;
  markingHitBp?: number;
  markedFoeBp?: number;
  besideRoleBp?: Record<string, number>;
  reachLeftBonus?: number;
  reachRightBonus?: number;
  shelterBp?: number;
  keenReactionBp?: number;
  backRowCritBp?: number;
  heartHpBp?: number;
  fourWindsBp?: number;
  adaptPierceBp?: number;
  // Slice 4 (triggers, auras, three-piece set effects).
  paybackBp?: number;
  emberTailBp?: number;
  overflowBp?: number;
  slipstreamBp?: number;
  echoChanceBp?: number;
  windChanceBp?: number;
  kindlingBp?: number;
  sharedWarmthBp?: number;
  sparkShareBp?: number;
  lanternBp?: number;
  unreflectedFirst?: boolean;
  critWindowBp?: number;
  firstReactionCrit?: boolean;
  // The five set effects written for combat v2 (`SET_THREE_V2`).
  healOnCashBp?: number;
  trailSet?: boolean;
  boostReachSet?: boolean;
  deepTracks?: boolean;
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
  /**
   * The field is a table by element: the number goes to every element the line's own element beats (`beats`, Hunter) or that beats
   * it (`beatenBy`, Ward). The piece's element decides, whoever wears it (gear plan OPEN 8, the recommended reading).
   */
  readonly foes?: 'beats' | 'beatenBy';
  /** The field is a table by role: the number goes to this role (Beside the mark-maker). */
  readonly beside?: Role;
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
  // Top pip 5% against today's 17%. x0.6 and no armour price since 2026-11-06: the Knack's armour -10 was not paid back at x0.3
  // (-3.0 points of boss HP in the lab's power table); now +1.1.
  'guards-shadow': {
    field: 'besideGuardBp',
    unit: 'bp',
    scale: [6, 10],
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
  // Slice 3, batch A: the cuts and conditions. Scales are 1 unless said (the plan's "keep").
  'all-damage-taken': { field: 'takenCutBp', unit: 'bp' },
  'aimed-ward': { field: 'aimedCutBp', unit: 'bp' },
  'backdraft-ward': { field: 'reflectedCutBp', unit: 'bp' },
  'last-stand': { field: 'lastStandCutBp', unit: 'bp' },
  // OPEN 8: the piece's element, any wearer.
  hunter: { field: 'vsElementBp', unit: 'bp', foes: 'beats' },
  ward: { field: 'fromElementCutBp', unit: 'bp', foes: 'beatenBy' },
  'marking-hit': { field: 'markingHitBp', unit: 'bp' },
  'marked-foe': { field: 'markedFoeBp', unit: 'bp' },
  'beside-the-mark-maker': { field: 'besideRoleBp', unit: 'bp', beside: 'setter' },
  // One side's reach: +2 for a Long Arm; a Flank Guard is +1 on its side and -1 on the other (once, whatever the copies).
  'long-arm-left': { field: 'reachLeftBonus', unit: 'count', scale: [2, 1] },
  'long-arm-right': { field: 'reachRightBonus', unit: 'count', scale: [2, 1] },
  'flank-guard-left': { field: 'reachLeftBonus', unit: 'count', once: { reachRightBonus: -1 } },
  'flank-guard-right': { field: 'reachRightBonus', unit: 'count', once: { reachLeftBonus: -1 } },
  sheltered: { field: 'shelterBp', unit: 'bp' },
  // Top pip 10 points against today's 8, and 5 against 4: with the crit chance lines (gear plan section 1).
  'keen-reaction': { field: 'keenReactionBp', unit: 'bp', scale: [5, 4] },
  'back-row-patience': { field: 'backRowCritBp', unit: 'bp', scale: [5, 4] },
  'heart-of-the-row': { field: 'heartHpBp', unit: 'bp' },
  // The reaction family's scale (x2 for the cap, OPEN 14), not the plan's x4.
  'four-winds': { field: 'fourWindsBp', unit: 'bp', scale: REACTION_SCALE },
  'adaptation-pierce': { field: 'adaptPierceBp', unit: 'bp' },
  // Slice 4, batch B: triggers and auras. Scales are 1 unless said; the engine limits each trigger that fires off its wearer's turn.
  // Payback, Echo, Overflow, Slipstream and Shared Warmth lifted the boss HP by 0.3 points or less at scale 1; buffed 2026-11-06 (Misa)
  // to about +1.3 to +1.5 points each (Payback +0.3: it fires only when a creature takes a hit for a neighbour, so even x25 gives
  // +0.5; x6 is kept, a top boost of +180%). Best picks, listed in docs/design/combat/for-misa.md.
  payback: { field: 'paybackBp', unit: 'bp', scale: [6, 1] },
  'ember-tail': { field: 'emberTailBp', unit: 'bp' },
  overflow: { field: 'overflowBp', unit: 'bp', scale: [8, 1] },
  slipstream: { field: 'slipstreamBp', unit: 'bp', scale: [6, 1] },
  echo: { field: 'echoChanceBp', unit: 'bp', scale: [4, 1] },
  // The gear line's own field: `secondWindBp` is Catch Breath's.
  'second-wind': { field: 'windChanceBp', unit: 'bp' },
  // Round 1 only, so one boost of the Support's own size (x0.5: top pip 20% against today's 40%).
  kindling: { field: 'kindlingBp', unit: 'bp', scale: [1, 2] },
  'shared-warmth': { field: 'sharedWarmthBp', unit: 'bp', scale: [8, 1] },
  // The reaction family's scale (x2), an aura on the neighbours.
  'spark-share': { field: 'sparkShareBp', unit: 'bp', scale: REACTION_SCALE },
  'lantern-bearer': { field: 'lanternBp', unit: 'bp' },
};

/**
 * The three-piece set effects with a v2 hook (`SET_EFFECTS`, by id). The rest of the three-piece effects are retired for combat v2
 * (gear plan OPEN 5: four equal a Knack, Hollow Weave's is Returning Tide's); Lantern Night has none (Misa 2026-11-06).
 */
export const SET_THREE_FX: Readonly<Record<string, GearLineFx>> = {
  unreflected: { field: 'unreflectedFirst', unit: 'flag' },
  // +30 points of crit damage against today's 20 (the plan's x1.4 with Amplified Crits, rounded).
  critWindow: { field: 'critWindowBp', unit: 'bp', scale: [3, 2] },
  firstReactionCrit: { field: 'firstReactionCrit', unit: 'flag' },
};

/** A three-piece effect written for combat v2: its words and the effect fields it gives. */
export interface SetThreeV2 {
  readonly text: string;
  readonly fx: GearFx;
}

/**
 * The five three-piece effects combat v2 has of its own (gear plan OPEN 5, Misa 2026-11-06), by set id. They replace the v1 effect of
 * the same set in the new rules only: the set data (`gear-sets.json`) and v1 keep their effects and texts as they are. The wearer's
 * element (Hollow Weave: grove, Ridge Copper: spark) is the data's `wearerElement`, as for every set. The "with the Knack" parts are
 * the engine's: it tells the set's field from the Knack's own (`trailSet` against `trail`, `boostReachSet` against `wideWarmth`).
 */
export const SET_THREE_V2: Readonly<Record<string, SetThreeV2>> = {
  'wardens-watch': {
    text: 'Protects one more creature on each side of it, on top of Wide Reach.',
    fx: { reachBonus: 1 },
  },
  'hollow-weave': {
    text: 'Heals 3% of max HP whenever it cashes Grounding, on top of any heal a Knack gives.',
    fx: { healOnCashBp: 300 },
  },
  'ridge-copper': {
    text: 'Its Overload also leaves Charged afterwards. With Leave a Trail, that mark has 2 stacks.',
    fx: { trailSet: true },
  },
  'hearth-helpers': {
    text: 'Its boost also lands on the creature two slots away. With Wide Embrace, it reaches three slots out.',
    fx: { boostReachSet: true },
  },
  'first-footprints': {
    text: 'Deep Tracks: its marks can stack past x3, one more for each creature on the team wearing this set. A reaction that spends those extra stacks goes past the x3 cap too.',
    fx: { deepTracks: true },
  },
};

/** What a set's three pieces say under combat v2: its v2 text where it has one, else the set's own. */
export function setThreeText(set: {
  id: string;
  three?: { text: string } | undefined;
}): string | undefined {
  return Object.hasOwn(SET_THREE_V2, set.id) ? SET_THREE_V2[set.id]?.text : set.three?.text;
}

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
  const out: Record<string, number | boolean | Record<string, number>> = {};
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
    if (entry.foes !== undefined || entry.beside !== undefined) {
      const table = { ...(out[entry.field] as Record<string, number> | undefined) };
      const keys =
        entry.beside !== undefined
          ? [entry.beside]
          : (entry.foes === 'beats' ? strongAgainst : strongOver)(
              content.elementChart,
              line.element as Element,
            );
      for (const key of keys) table[key] = (table[key] ?? 0) + Number(got);
      out[entry.field] = table;
    } else if (got === true) out[entry.field] = true;
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
    // Three pieces: the set's one effect, for a wearer it works for (its element), when it has a v2 hook.
    const effect = set.three;
    const v2 = Object.hasOwn(SET_THREE_V2, id) ? SET_THREE_V2[id] : undefined;
    if (v2 !== undefined && effect !== undefined && count >= 3) {
      if (effect.wearerElement !== undefined && effect.wearerElement !== wearer.element) continue;
      for (const [field, value] of Object.entries(v2.fx)) {
        if (typeof value === 'number') addTo(field, value);
        else out[field] = true;
      }
      continue;
    }
    const three =
      effect !== undefined && Object.hasOwn(SET_THREE_FX, effect.effect)
        ? SET_THREE_FX[effect.effect]
        : undefined;
    if (effect !== undefined && count >= 3 && three !== undefined) {
      if (effect.wearerElement !== undefined && effect.wearerElement !== wearer.element) continue;
      if (three.unit === 'flag') out[three.field] = true;
      else {
        const [num, den] = three.scale ?? [1, 1];
        addTo(three.field, Math.floor(((effect.value ?? 0) * num) / den));
      }
    }
  }
  return out;
}
