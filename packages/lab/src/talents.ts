/**
 * Combat talents of the combat v2 draft (docs/design/combat/proposals/001-combat-v2.md, R20). One
 * shared library; each creature line links to its own pool from it (Misa, 2026-10-27), so two lines
 * of the same role can roll different tools. A creature rolls from its line's pool when it is found
 * and through the Talent Book over time; the migration rerolls them (roadmap phase 6, a golden talent
 * rolls golden). Talents use the Knacks' effect grammar; their numbers add to the Knack's.
 *
 * Rules (panel 2, Misa 2026-10-26):
 * - One name per effect, one number per name (P-06), across Knacks, talents and gear; every species
 *   uses the shared names.
 * - A talent never repeats a Knack's effect, and Seal is never a talent: the roll must not decide
 *   the Knack choice.
 * - Talents use only fields that add up (`ADDITIVE_FIELDS`), never a Knack's multipliers.
 * - A talent that does nothing for a form's role is idle on it (shown as such, as in the game today). Triage is also
 *   idle under a Support shape Knack (`talentIdleUnder`).
 * - A talent takes the name of the shipped gear line when it is the same effect (Misa, 2026-10-28); a name a gear line
 *   has with a different effect is not used (`TALENT_IS_GEAR` in modifiers.ts maps each talent that is a line).
 * - Silence blanks talents (panel 3): triggers do not arm, rhythm counters do not count, once-per-fight effects are
 *   not spent; what was stored before the silence stays stored.
 * Exploration and crafting talents stay out of the combat rework (Misa, 2026-10-26).
 */
import { content } from '@creatures/game';
import { SUPPORT_SHAPE_KNACKS, type KnackFx } from './knacks';
import type { Role } from './types';

const ALL: readonly Role[] = ['setter', 'payoff', 'guard', 'support'];

export interface TalentDef {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  /** The roles it does something for; on any other role it is idle. */
  readonly roles: readonly Role[];
  /** Design intent for contributors (never shown to players). */
  readonly intent: string;
  readonly fx: KnackFx;
}

/**
 * Effect fields whose values add when a Knack and talents combine (a talent may use only these).
 * Numbers add, flags combine (`mergeFx`); a field whose merge is neither is never listed here.
 */
export const ADDITIVE_FIELDS: ReadonlySet<keyof KnackFx> = new Set<keyof KnackFx>([
  'atkBp',
  'dodgeBonusBp',
  'critChanceBp',
  'reactionCritBp',
  'firstHitBp',
  'ignoreSilence',
  'armourBonus',
  'coverBonusBp',
  'secondWindBp',
  'boostBonusBp',
  'mendBonusBp',
  'hpBp',
  'critDamageBp',
  'lowHpAtkBp',
  'areaCutBp',
  'holdOn',
  'reactionBonusBp',
  'areaDodgeBp',
  // The first batch of the talent library (docs/design/combat/modifiers.md).
  'perKindredBesideBp',
  'oddOneOutBp',
  'rowEndBp',
  'frontCutBp',
  'slowBurnBp',
  'slowBurnCapBp',
  'finisherBp',
  'steadyRhythm',
  'cashFullBp',
  'freshMarkBp',
  'ownMarkBp',
  'firstMarkExtra',
  'vengefulBp',
  'momentumBp',
  'flankGuard',
  'distanceCoverBp',
  'interceptHitBackBp',
  'braceBp',
  'miredExtraBp',
  'clinging',
  'brightBoost',
  'kindredBoostBp',
  'triage',
  'spillOver',
  'cullBp',
]);

const T = (def: TalentDef): TalentDef => def;
const HITTERS: readonly Role[] = ['setter', 'payoff'];

export const TALENTS: Readonly<Record<string, TalentDef>> = Object.fromEntries(
  [
    // Plain stats: small numbers.
    T({
      id: 'sharp-claws',
      name: 'Sharp Claws',
      text: 'Attack +8%.',
      roles: HITTERS,
      intent:
        'Plain power for hitters; the small, steady number the conditional talents are judged against.',
      fx: { atkBp: 800 },
    }),
    T({
      id: 'hardy',
      name: 'Hardy',
      text: 'Max HP +10%.',
      roles: ALL,
      intent: 'Plain staying power; carries through a raid weekend (R14).',
      fx: { hpBp: 1_000 },
    }),
    // Neighbours: where the creature wants its partners.
    T({
      id: 'shoulder-to-shoulder',
      name: 'Shoulder to Shoulder',
      text: '+20% on its hits for each creature {Beside} it of its element, at most 2.',
      roles: ALL,
      intent: 'Mono-element pairs and trios: a reason to talk about placement in the raid.',
      fx: { perKindredBesideBp: 2_000 },
    }),
    T({
      id: 'odd-one-out',
      name: 'Odd One Out',
      text: '+12% on its hits while no creature {Beside} it shares its element.',
      roles: ALL,
      intent:
        'The mixed row: the opposite of Shoulder to Shoulder. Like the shipped line it also holds when nothing stands beside it, so the number is small.',
      fx: { oddOneOutBp: 1_200 },
    }),
    // Position.
    T({
      id: 'edge-walker',
      name: 'Edge-walker',
      text: '+15% on its hits while it stands at a {Row end}.',
      roles: ALL,
      intent:
        'A reason to stand at an end slot of the row (column 0 or the last column), whoever stands beside it: the owner controls it. Sweeps of the row ends make ends risky.',
      fx: { rowEndBp: 1_500 },
    }),
    T({
      id: 'front-liner',
      name: 'Front-liner',
      text: 'It takes 20% less from every hit in the {Front row}.',
      roles: ALL,
      intent: 'The front row takes the plain attack: a creature that wants to stand there.',
      fx: { frontCutBp: 2_000 },
    }),
    // Fight state.
    T({
      id: 'slow-burn',
      name: 'Slow Burn',
      text: '+4% on its hits per round from round 2, up to +24%.',
      roles: HITTERS,
      intent: 'Strong in long raid stages, weak in short fights: a reason to own two of a species.',
      fx: { slowBurnBp: 400, slowBurnCapBp: 2_400 },
    }),
    T({
      id: 'finisher',
      name: 'Finisher',
      text: '+50% on its hits while the boss is below a third of its HP.',
      roles: HITTERS,
      intent:
        'With the boss HP shared across a raid weekend (R14), the last stage rewards it most.',
      fx: { finisherBp: 5_000 },
    }),
    T({
      id: 'first-pounce',
      name: 'First Pounce',
      text: 'Its first hit that lands each fight deals +60%.',
      roles: HITTERS,
      intent:
        'Short fights, the dungeon and each raid stage. A hit made while silenced does not use it up.',
      fx: { firstHitBp: 6_000 },
    }),
    T({
      id: 'steady-rhythm',
      name: 'Steady Rhythm',
      text: 'Every third hit it makes is a crit.',
      roles: HITTERS,
      intent: 'Crits you can plan for (P-04): a rhythm instead of a chance.',
      fx: { steadyRhythm: true },
    }),
    // Marks and reactions.
    T({
      id: 'opportunist',
      name: 'Opportunist',
      text: 'Its {Reaction} bonus +40% when it cashes a {Mark} at x3.',
      roles: ['payoff'],
      intent: 'Rewards waiting for a full mark; pairs with Setters that leave x2.',
      fx: { cashFullBp: 4_000 },
    }),
    T({
      id: 'quick-draw',
      name: 'Quick Draw',
      text: "+30% on a {Reaction} on a mark added since the boss's last turn.",
      roles: ['payoff'],
      intent:
        'The opposite timing: cash right after the Setter, before Clean Scales sheds the mark.',
      fx: { freshMarkBp: 3_000 },
    }),
    T({
      id: 'owners-mark',
      name: "Owner's Mark",
      text: '{Reaction}s on a {Mark} it left have a +30% bonus while it stands.',
      roles: ['setter'],
      intent:
        'A Setter that makes its own marks worth more, whoever cashes them, while it stands and is not silenced.',
      fx: { ownMarkBp: 3_000 },
    }),
    T({
      id: 'deep-ink',
      name: 'Deep Ink',
      text: 'Its first {Mark} each fight adds 1 more to the count.',
      roles: ['setter'],
      intent:
        'Changes the opening without adding marks from nowhere: marks still come only from Setters and Knacks.',
      fx: { firstMarkExtra: 1 },
    }),
    // Triggers.
    T({
      id: 'rally-cry',
      name: 'Rally Cry',
      text: '+50% on its hits for the rest of the fight after a creature {Beside} it is knocked out.',
      roles: ALL,
      intent: 'Turns attrition into a comeback. It does not arm while the creature is silenced.',
      fx: { vengefulBp: 5_000 },
    }),
    T({
      id: 'momentum',
      name: 'Momentum',
      text: 'After it dodges, its next hit deals +40%.',
      roles: ALL,
      intent: 'Fast creatures against bosses that hit often; the front row.',
      fx: { momentumBp: 4_000 },
    }),
    // Guard shapes.
    T({
      id: 'flank-guard',
      name: 'Flank Guard',
      text: 'Its {Reach} covers only its longer side (the side with more slots to the row end, ties go left), with twice the slots.',
      roles: ['guard'],
      intent:
        'A Guard at one end protects the long stretch of the row: a placement puzzle the owner controls, with no Left/Right pair to roll.',
      fx: { flankGuard: true },
    }),
    T({
      id: 'long-shadow',
      name: 'Long Shadow',
      text: 'Cover +10% per slot of distance, and the hits it takes for others are cut by 10% per slot.',
      roles: ['guard'],
      intent:
        'Protects the far creatures best; with Flank Guard a Guard at one end covers a long row.',
      fx: { distanceCoverBp: 1_000 },
    }),
    T({
      id: 'shoulder-charge',
      name: 'Shoulder Charge',
      text: 'When it {Intercept}s, it strikes back for 40% of its Attack, ignoring armour.',
      roles: ['guard'],
      intent:
        'A Guard that adds damage the more it is hit. The strike-back is a counter, not a hit: it can land the killing blow but triggers nothing that keys on its hits.',
      fx: { interceptHitBackBp: 4_000 },
    }),
    // Rule benders.
    T({
      id: 'brace',
      name: 'Brace',
      text: 'It takes 40% less from a {Charged} hit on its slot.',
      roles: ALL,
      intent: "Reads straight off the board's Charged highlights (Great Wave).",
      fx: { braceBp: 4_000 },
    }),
    T({
      id: 'stubborn',
      name: 'Stubborn',
      text: 'Once per fight, a hit that would knock it out leaves it at 1 HP.',
      roles: ALL,
      intent: 'Survives one Crusher; pairs with healers. Hold On under its one name.',
      fx: { holdOn: true },
    }),
    T({
      id: 'catch-breath',
      name: 'Catch Breath',
      text: 'Once per fight, when a hit drops it below half its max HP, it heals 20% of max HP.',
      roles: ALL,
      intent:
        'Survives one big hit (Crusher, Payoff Hunter). Not the gear line Second Wind, which is a chance each round to heal.',
      fx: { secondWindBp: 2_000 },
    }),
    T({
      id: 'unbothered',
      name: 'Unbothered',
      text: 'It cannot be {Silenced}.',
      roles: ALL,
      intent: 'The silence answer on the creature itself, for row ends and front rows.',
      fx: { ignoreSilence: true },
    }),
    T({
      id: 'cull',
      name: 'Cull',
      text: 'A hit that leaves the boss below 5% of its full HP defeats it. The HP removed counts as the killing blow, not as damage.',
      roles: HITTERS,
      intent:
        'Weak alone; it decides who lands the killing blow, which other effects can key on. In no line pool until a killing-blow talent exists.',
      fx: { cullBp: 500 },
    }),
    // Debuffs: Mire lines only (they need a Knack that puts Mired on the boss).
    T({
      id: 'heavy-hand',
      name: 'Heavy Hand',
      text: 'Its {Mired} has a 50% chance to add 1 extra stack.',
      roles: ['guard', 'support'],
      intent:
        'Mire only; the shipped line is a chance of an extra stack, and luck is welcome. More stacks per application keeps the debuff up.',
      fx: { miredExtraBp: 5_000 },
    }),
    T({
      id: 'clinging',
      name: 'Clinging',
      text: '{Mired} fades every third round instead of every second while it stands.',
      roles: ['guard', 'support'],
      intent:
        'Mire only: the v2 form of the shipped "lasts more turns"; one creature can hold a debuff for the team.',
      fx: { clinging: true },
    }),
    // Support talents.
    T({
      id: 'bright-boost',
      name: 'Bright Boost',
      text: 'Every second {Boost} it gives is doubled.',
      roles: ['support'],
      intent: 'A Support with a visible rhythm instead of a crit chance.',
      fx: { brightBoost: true },
    }),
    T({
      id: 'kindred-boost',
      name: 'Kindred Boost',
      text: 'Its {Boost} +10% on creatures of its own element.',
      roles: ['support'],
      intent: 'Mono-element rows in the raid, across players.',
      fx: { kindredBoostBp: 1_000 },
    }),
    T({
      id: 'triage',
      name: 'Triage',
      text: 'Its heal on the creatures {Beside} it goes to the most hurt one, at double size.',
      roles: ['support'],
      intent:
        "Aims the Support's own base heal on the creatures beside it; only healing Supports (Tide, Grove) have a heal to aim. Idle under a Support shape Knack (Sunbeam, Drizzle, Curl Up and the rest), which replaces that verb.",
      fx: { triage: true },
    }),
    T({
      id: 'overheal-spill',
      name: 'Overheal Spill',
      text: 'Its healing past full HP passes to the most hurt creature {Beside} the one it healed.',
      roles: ['support'],
      intent: 'Big heals are never wasted; only healing Supports (Tide, Grove) have a heal.',
      fx: { spillOver: true },
    }),
  ].map((t) => [t.id, t]),
);

/**
 * Each line's pool: 7 talents from the library, chosen for the line's forms and flavour (branch forms
 * share the line's pool, as in the game today). Every role in a line has at least three that fit it,
 * and two lines of one role roll different tools. Only Tide and Grove Supports have a heal to aim
 * (Triage, Overheal Spill); only Mire lines put Mired on the boss (Heavy Hand, Clinging). Cull is in no pool
 * until a killing-blow talent exists.
 */
export const LINE_POOLS: Readonly<Record<string, readonly string[]>> = {
  // Splashes first and thinks later, always first to say hello.
  splashet: [
    'first-pounce',
    'momentum',
    'edge-walker',
    'deep-ink',
    'quick-draw',
    'shoulder-to-shoulder',
    'hardy',
  ],
  // A pounce, a lucky crit, a steady flame.
  cindle: [
    'steady-rhythm',
    'sharp-claws',
    'rally-cry',
    'opportunist',
    'owners-mark',
    'odd-one-out',
    'first-pounce',
  ],
  // Shy, stands close to its friends and soaks up hits for them.
  sproutle: [
    'rally-cry',
    'shoulder-to-shoulder',
    'stubborn',
    'brace',
    'triage',
    'kindred-boost',
    'hardy',
  ],
  // Static that never sits still; the Ohmouse plants its feet.
  zipmouse: [
    'momentum',
    'first-pounce',
    'edge-walker',
    'deep-ink',
    'flank-guard',
    'unbothered',
    'brace',
  ],
  // Calm newt in a cloud of mist, drizzling on friends.
  mistnewt: [
    'long-shadow',
    'flank-guard',
    'unbothered',
    'overheal-spill',
    'bright-boost',
    'kindred-boost',
    'catch-breath',
  ],
  // Warms the burrow and cheers the team on; the Kilnmole digs in.
  ashmole: [
    'kindred-boost',
    'bright-boost',
    'shoulder-charge',
    'stubborn',
    'rally-cry',
    'brace',
    'hardy',
  ],
  // Rides the edge of the thundercloud, bold and showy.
  stormray: [
    'slow-burn',
    'quick-draw',
    'edge-walker',
    'bright-boost',
    'kindred-boost',
    'momentum',
    'unbothered',
  ],
  // A patient turtle with a garden on its shell.
  mossback: ['owners-mark', 'opportunist', 'finisher', 'front-liner', 'stubborn', 'hardy', 'brace'],
  // Elegant and proud, strikes from the shadows.
  coralynx: [
    'sharp-claws',
    'odd-one-out',
    'edge-walker',
    'finisher',
    'quick-draw',
    'first-pounce',
    'momentum',
  ],
  // A mane of sunlight that leads from the front.
  solmane: [
    'front-liner',
    'deep-ink',
    'owners-mark',
    'shoulder-to-shoulder',
    'rally-cry',
    'sharp-claws',
    'catch-breath',
  ],
  // A mountain-sized drake, very hard to stop once it roars.
  gaiadrake: ['finisher', 'opportunist', 'stubborn', 'brace', 'hardy', 'slow-burn', 'catch-breath'],
  // Drifts above the noise and watches over the team.
  aurorix: [
    'bright-boost',
    'kindred-boost',
    'unbothered',
    'hardy',
    'edge-walker',
    'odd-one-out',
    'momentum',
  ],
  // A lantern that lights the way; a soft, warm glow.
  lanternfin: [
    'triage',
    'overheal-spill',
    'kindred-boost',
    'unbothered',
    'catch-breath',
    'hardy',
    'rally-cry',
  ],
  // A bonfire on its shell, shared with the whole team.
  hearthshell: [
    'shoulder-charge',
    'flank-guard',
    'stubborn',
    'catch-breath',
    'front-liner',
    'brace',
    'hardy',
  ],
  // Mire: a sticky wall.
  mudlump: [
    'heavy-hand',
    'clinging',
    'shoulder-charge',
    'stubborn',
    'brace',
    'front-liner',
    'hardy',
  ],
  // Mire: a croaking song.
  squelch: [
    'heavy-hand',
    'clinging',
    'bright-boost',
    'kindred-boost',
    'catch-breath',
    'hardy',
    'unbothered',
  ],
};

export interface PoolEntry {
  readonly talent: string;
  /** The roles of the line's forms this talent does something for. */
  readonly roles: readonly Role[];
}

/** The roles of a line's forms. */
export function lineRoles(line: string): Role[] {
  return [...new Set(content.creatures.filter((c) => c.line === line).map((c) => c.role))];
}

/** A line's pool, each talent with the line's roles it fits. */
export function talentPool(line: string): PoolEntry[] {
  const roles = lineRoles(line);
  return (LINE_POOLS[line] ?? []).map((t) => ({
    talent: t,
    roles: roles.filter((r) => TALENTS[t]?.roles.includes(r)),
  }));
}

/**
 * Whether a talent does nothing under a Knack, whatever the role: Triage aims the Support's own base verb, so a
 * Support shape Knack (Sunbeam, Drizzle, Starlight, Wide Warmth, Curl Up and the rest) leaves it idle.
 */
export function talentIdleUnder(talentId: string, knackId: string | undefined): boolean {
  return talentId === 'triage' && knackId !== undefined && SUPPORT_SHAPE_KNACKS.has(knackId);
}

/** The lines with a talent pool. */
export const TALENT_LINES: readonly string[] = Object.keys(LINE_POOLS);

export function talent(id: string): TalentDef | undefined {
  return TALENTS[id];
}

/** Knack and talent effects together: numbers add, flags combine, a Support shape comes from the Knack. */
export function mergeFx(parts: readonly KnackFx[]): KnackFx {
  const out: Record<string, unknown> = {};
  for (const p of parts) {
    for (const [key, value] of Object.entries(p)) {
      const prev = out[key];
      if (typeof value === 'number') out[key] = (typeof prev === 'number' ? prev : 0) + value;
      else if (typeof value === 'boolean') out[key] = prev === true || value;
      else if (prev === undefined) out[key] = value;
    }
  }
  return out;
}
