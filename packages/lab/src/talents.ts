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
  'cashHighBp',
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
  'triageBp',
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
      text: 'Attack +10%.',
      roles: HITTERS,
      intent:
        'Plain power for hitters; the small, steady number the conditional talents are judged against.',
      fx: { atkBp: 1_000 },
    }),
    T({
      id: 'hardy',
      name: 'Hardy',
      text: 'Max HP +22%.',
      roles: ALL,
      intent: 'Plain staying power; carries through a raid weekend (R14).',
      fx: { hpBp: 2_200 },
    }),
    // Neighbours: where the creature wants its partners.
    T({
      id: 'shoulder-to-shoulder',
      name: 'Shoulder to Shoulder',
      text: '+23% on its hits for each creature {Beside} it of its element, at most 2.',
      roles: ALL,
      intent: 'Mono-element pairs and trios: a reason to talk about placement in the raid.',
      fx: { perKindredBesideBp: 2_300 },
    }),
    T({
      id: 'odd-one-out',
      name: 'Odd One Out',
      text: '+18% on its hits while no creature {Beside} it shares its element.',
      roles: ALL,
      intent:
        'The mixed row: the opposite of Shoulder to Shoulder. Like the shipped line it also holds when nothing stands beside it, so the number is small.',
      fx: { oddOneOutBp: 1_800 },
    }),
    // Position.
    T({
      id: 'edge-walker',
      name: 'Edge-walker',
      text: '+16% on its hits while it stands at a {Row end}.',
      roles: ALL,
      intent:
        'A reason to stand at an end slot of the row (column 0 or the last column), whoever stands beside it: the owner controls it. Sweeps of the row ends make ends risky.',
      fx: { rowEndBp: 1_600 },
    }),
    T({
      id: 'front-liner',
      name: 'Front-liner',
      text: 'It takes 10% less from every hit in the {Front row}.',
      roles: ALL,
      intent: 'The front row takes the plain attack: a creature that wants to stand there.',
      fx: { frontCutBp: 1_000 },
    }),
    // Fight state.
    T({
      id: 'slow-burn',
      name: 'Slow Burn',
      text: '+2.5% on its hits per round from round 2, up to +15%.',
      roles: HITTERS,
      intent: 'Strong in long raid stages, weak in short fights: a reason to own two of a species.',
      fx: { slowBurnBp: 250, slowBurnCapBp: 1_500 },
    }),
    T({
      id: 'finisher',
      name: 'Finisher',
      text: '+55% on its hits while the boss is below a third of its HP.',
      roles: HITTERS,
      intent:
        'With the boss HP shared across a raid weekend (R14), the last stage rewards it most.',
      fx: { finisherBp: 5_500 },
    }),
    T({
      id: 'first-pounce',
      name: 'First Pounce',
      text: 'Its first hit that lands each fight deals +170%.',
      roles: HITTERS,
      intent:
        'Short fights, the dungeon and each raid stage. A hit made while silenced does not use it up.',
      fx: { firstHitBp: 17_000 },
    }),
    T({
      id: 'steady-rhythm',
      name: 'Steady Rhythm',
      text: 'Every third hit it makes is a crit, and its crits deal 10% more.',
      roles: HITTERS,
      intent: 'Crits you can plan for (P-04): a rhythm instead of a chance.',
      fx: { steadyRhythm: true, critDamageBp: 1_000 },
    }),
    // Marks and reactions.
    T({
      id: 'opportunist',
      name: 'Opportunist',
      text: 'Its {Reaction} bonus +120% when it cashes a {Mark} at x2 or more.',
      roles: ['payoff'],
      intent:
        'Rewards waiting for a bigger mark (x2 or x3); pairs with Setters that leave x2, and with a second Setter. Was x3 only (2026-10-28): a mark almost never reached x3 when cashed, so the talent did nothing.',
      fx: { cashHighBp: 12_000 },
    }),
    T({
      id: 'quick-draw',
      name: 'Quick Draw',
      text: "+32% on a {Reaction} on a mark added since the boss's last turn.",
      roles: ['payoff'],
      intent:
        'The opposite timing: cash right after the Setter, before Clean Scales sheds the mark.',
      fx: { freshMarkBp: 3_200 },
    }),
    T({
      id: 'owners-mark',
      name: "Owner's Mark",
      text: '{Reaction}s on a {Mark} it left have a +15% bonus while it stands.',
      roles: ['setter'],
      intent:
        'A Setter that makes its own marks worth more, whoever cashes them, while it stands and is not silenced.',
      fx: { ownMarkBp: 1_500 },
    }),
    T({
      id: 'deep-ink',
      name: 'Deep Ink',
      text: 'Its first {Mark} each fight adds 2 more to the count.',
      roles: ['setter'],
      intent:
        'Changes the opening without adding marks from nowhere: marks still come only from Setters and Knacks.',
      fx: { firstMarkExtra: 2 },
    }),
    // Triggers.
    T({
      id: 'rally-cry',
      name: 'Rally Cry',
      text: '+40% on its hits for the rest of the fight after a creature {Beside} it is knocked out.',
      roles: ALL,
      intent: 'Turns attrition into a comeback. It does not arm while the creature is silenced.',
      fx: { vengefulBp: 4_000 },
    }),
    T({
      id: 'momentum',
      name: 'Momentum',
      text: 'After it dodges, or a Guard takes a hit aimed at it, its next hit deals +38%.',
      roles: HITTERS,
      intent:
        'Fast creatures and the creature in the front row: a hit aimed at it that is dodged, or that a Guard beside it takes, arms its next hit. Reworked (2026-10-28): a dodge alone almost never happens to a creature the boss does not aim at, so the talent did nothing.',
      fx: { momentumBp: 3_800 },
    }),
    // Guard shapes.
    T({
      id: 'flank-guard',
      name: 'Flank Guard',
      text: 'Its {Reach} covers only its longer side (more slots to the row end; both when it stands in the middle), twice the slots, and its cover is +50%.',
      roles: ['guard'],
      intent:
        'A Guard at one end protects the long stretch of the row: a placement puzzle the owner controls, with no Left/Right pair to roll. Twice the slots on one side covers no more creatures than one slot on each side, so the cover bonus is what makes it worth the placement (2026-10-28).',
      fx: { flankGuard: true, coverBonusBp: 5_000 },
    }),
    T({
      id: 'long-shadow',
      name: 'Long Shadow',
      text: 'Cover +20% per slot of distance, and the hits it takes for others are cut by 20% per slot.',
      roles: ['guard'],
      intent:
        'Protects the far creatures best; with Flank Guard a Guard at one end covers a long row.',
      fx: { distanceCoverBp: 2_000 },
    }),
    T({
      id: 'shoulder-charge',
      name: 'Shoulder Charge',
      text: 'When it {Intercept}s, it strikes back for 45% of its Attack, ignoring armour.',
      roles: ['guard'],
      intent:
        'A Guard that adds damage the more it is hit. The strike-back is a counter, not a hit: it can land the killing blow but triggers nothing that keys on its hits.',
      fx: { interceptHitBackBp: 4_500 },
    }),
    // Rule benders.
    T({
      id: 'brace',
      name: 'Brace',
      text: 'It takes 40% less from a {Charged} hit aimed at its slot.',
      roles: ALL,
      intent:
        'Answers a telegraphed hit (Great Wave, Judgement Bolt, the Charged signatures): it is shown at round start, so the owner knows who will be aimed at. Nothing against other moves or the plain attack. Back to this design (2026-10-28 panel 4): the version that also cut other moves and the plain attack decided a boss by itself.',
      fx: { braceBp: 4_000 },
    }),
    T({
      id: 'stubborn',
      name: 'Stubborn',
      text: 'Once per fight, a hit that would knock it out leaves it at two fifths of its max HP.',
      roles: ALL,
      intent:
        "Survives one Crusher; pairs with healers. Hold On under its one name. Reworked (2026-10-28): it left the creature at 1 HP, which gained about 2% of a team's result, so it now leaves it at two fifths of its max HP.",
      fx: { holdOn: true },
    }),
    T({
      id: 'catch-breath',
      name: 'Catch Breath',
      text: 'Once per fight (in a raid, once per weekend), when a hit drops it below half its max HP, it heals 40% of max HP.',
      roles: ALL,
      intent:
        'Survives one big hit (Crusher, Payoff Hunter). Not the gear line Second Wind, which is a chance each round to heal.',
      fx: { secondWindBp: 4_000 },
    }),
    T({
      id: 'unbothered',
      name: 'Unbothered',
      text: 'It cannot be {Silenced}, and has +3% Attack and +6% Max HP.',
      roles: ALL,
      intent:
        'The silence answer on the creature itself, for row ends and front rows. Reworked (2026-10-28): the immunity alone did nothing on the gauntlet, where a creature can always stand in the middle (a Guard gained nothing), so it carries a little Attack and HP as well, less than Sharp Claws or Hardy. Shrunk (2026-10-28 panel 4, from +6% and +14%): it won a boss by its stats; it should win by its ward.',
      fx: { ignoreSilence: true, atkBp: 300, hpBp: 600 },
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
      text: 'Its {Mired} has an 80% chance to add 1 extra stack.',
      roles: ['guard', 'support'],
      intent:
        'Mire only; the shipped line is a chance of an extra stack, and luck is welcome. More stacks per application keeps the debuff up.',
      fx: { miredExtraBp: 8_000 },
    }),
    T({
      id: 'clinging',
      name: 'Clinging',
      text: 'While it stands, {Mired} fades only every third round, and each stack counts for half as much again.',
      roles: ['guard', 'support'],
      intent:
        'Mire only: the v2 form of the shipped "lasts more turns"; one creature can hold a debuff for the team. Reworked (2026-10-28): slower fading alone gained under a point, so its stacks also count for half as much again (4.5% instead of 3%); it still fades, every third round, so one creature cannot hold the debuff for the whole fight (Misa).',
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
      text: 'Its {Boost} +26% on creatures of its own element.',
      roles: ['support'],
      intent: 'Mono-element rows in the raid, across players.',
      fx: { kindredBoostBp: 2_600 },
    }),
    T({
      id: 'triage',
      name: 'Triage',
      text: 'Its heal on the creatures {Beside} it goes to the most hurt one, 100% bigger.',
      roles: ['support'],
      intent:
        "Aims the Support's own base heal on the creatures beside it, bigger; only healing Supports (Tide, Grove) have a heal to aim. Idle under a Support shape Knack (Sunbeam, Drizzle, Curl Up and the rest), which replaces that verb.",
      fx: { triageBp: 10_000 },
    }),
    T({
      id: 'overheal-spill',
      name: 'Overheal Spill',
      text: 'Its healing past full HP passes to the most hurt creature in the row of the one it healed.',
      roles: ['support'],
      intent:
        'Big heals are never wasted; only healing Supports (Tide, Grove) have a heal. Goes to the most hurt creature in the row (was: beside the one healed), because overheal is rare and a short reach almost never had a target (2026-10-28).',
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
    'quick-draw',
    'hardy',
    'finisher',
    'owners-mark',
  ],
  // A pounce, a lucky crit, a steady flame.
  cindle: [
    'steady-rhythm',
    'sharp-claws',
    'rally-cry',
    'owners-mark',
    'first-pounce',
    'front-liner',
    'shoulder-to-shoulder',
  ],
  // Shy, stands close to its friends and soaks up hits for them.
  sproutle: [
    'rally-cry',
    'shoulder-to-shoulder',
    'brace',
    'triage',
    'hardy',
    'kindred-boost',
    'flank-guard',
  ],
  // Static that never sits still; the Ohmouse plants its feet.
  zipmouse: [
    'momentum',
    'first-pounce',
    'edge-walker',
    'flank-guard',
    'odd-one-out',
    'deep-ink',
    'shoulder-to-shoulder',
  ],
  // Calm newt in a cloud of mist, drizzling on friends.
  mistnewt: [
    'flank-guard',
    'unbothered',
    'overheal-spill',
    'bright-boost',
    'catch-breath',
    'shoulder-charge',
    'rally-cry',
  ],
  // Warms the burrow and cheers the team on; the Kilnmole digs in.
  ashmole: [
    'kindred-boost',
    'bright-boost',
    'shoulder-charge',
    'rally-cry',
    'brace',
    'hardy',
    'odd-one-out',
  ],
  // Rides the edge of the thundercloud, bold and showy.
  stormray: [
    'slow-burn',
    'quick-draw',
    'edge-walker',
    'bright-boost',
    'momentum',
    'unbothered',
    'catch-breath',
  ],
  // A patient turtle with a garden on its shell.
  mossback: ['owners-mark', 'opportunist', 'finisher', 'stubborn', 'hardy', 'brace', 'rally-cry'],
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
  gaiadrake: [
    'opportunist',
    'stubborn',
    'hardy',
    'catch-breath',
    'front-liner',
    'rally-cry',
    'finisher',
  ],
  // Drifts above the noise and watches over the team.
  aurorix: [
    'bright-boost',
    'unbothered',
    'hardy',
    'edge-walker',
    'odd-one-out',
    'momentum',
    'rally-cry',
  ],
  // A lantern that lights the way; a soft, warm glow.
  lanternfin: [
    'triage',
    'overheal-spill',
    'catch-breath',
    'hardy',
    'rally-cry',
    'odd-one-out',
    'front-liner',
  ],
  // A bonfire on its shell, shared with the whole team.
  hearthshell: [
    'shoulder-charge',
    'stubborn',
    'catch-breath',
    'brace',
    'hardy',
    'odd-one-out',
    'shoulder-to-shoulder',
  ],
  // Mire: a sticky wall.
  mudlump: [
    'heavy-hand',
    'clinging',
    'shoulder-charge',
    'brace',
    'hardy',
    'long-shadow',
    'flank-guard',
  ],
  // Mire: a croaking song.
  squelch: [
    'heavy-hand',
    'clinging',
    'bright-boost',
    'catch-breath',
    'hardy',
    'unbothered',
    'front-liner',
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

/** The line of a form (a form with no line is its own). */
export const lineOfForm = (form: string): string =>
  content.creatures.find((c) => c.id === form)?.line ?? form;

/**
 * The talents a creature of `form` may carry (R20): those in its line's pool that work for its role. A talent outside the
 * pool cannot be rolled or learned, and one that does nothing for the role is idle (not a choice anyone makes).
 */
export function legalTalents(form: string): string[] {
  const role = content.creatures.find((c) => c.id === form)?.role;
  return (LINE_POOLS[lineOfForm(form)] ?? []).filter(
    (t) => role !== undefined && TALENTS[t]?.roles.includes(role),
  );
}

export interface IllegalTalent {
  readonly formId: string;
  readonly talent: string;
  /** Why it is not legal on this form. */
  readonly why: string;
}

/** The talents on `picks` that their creature may not carry (see `legalTalents`); an empty list means every one is legal. */
export function illegalTalents(
  picks: readonly { readonly formId: string; readonly talents?: readonly string[] | undefined }[],
): IllegalTalent[] {
  const out: IllegalTalent[] = [];
  for (const p of picks)
    for (const t of p.talents ?? []) {
      if (!TALENTS[t]) out.push({ formId: p.formId, talent: t, why: 'no such talent' });
      else if (!(LINE_POOLS[lineOfForm(p.formId)] ?? []).includes(t))
        out.push({ formId: p.formId, talent: t, why: `not in the ${lineOfForm(p.formId)} pool` });
      else if (!legalTalents(p.formId).includes(t))
        out.push({ formId: p.formId, talent: t, why: 'idle for its role' });
    }
  return out;
}

/** Throws, naming the creature and the talent, when a line carries an illegal talent. `label` says whose line it is. */
export function assertLegalTalents(
  picks: readonly { readonly formId: string; readonly talents?: readonly string[] | undefined }[],
  label: string,
): void {
  const bad = illegalTalents(picks);
  if (bad.length)
    throw new Error(
      `${label}: illegal talents: ${bad.map((b) => `${b.formId} carries ${b.talent} (${b.why})`).join('; ')}`,
    );
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
