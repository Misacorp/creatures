/**
 * Reaction partners (Misa, 2026-11-26): touch a creature and see which others can cash in its marks, or set the marks it cashes. Pure.
 *
 * "Can" is decided by a creature's kit alone: its role and element, its Knack, its talents and its worn gear. Position, reach and row
 * are ignored, because any Payoff, whenever it acts, can cash a mark that stands on the boss (the engine's mark rules, R4 and R5:
 * `packages/engine/src/v2/creature.ts`). The sets are worked out from the shipped data (the element chart, the Knacks' and talents' `fx`,
 * the gear's `gearFx`), so new content is picked up without a list here.
 *
 * How a creature sets a mark (the engine's `addMark` callers):
 * - A Setter marks with its own element (`marksAs` 'own' by default); a Knack's `marksAs` makes a non-Setter do it too ('own'), or
 *   marks the element it can itself cash ('cashable', Self Prime).
 * - A Support whose Knack is Ready the Mark (`support: 'readyMark'`) marks its own element at round start.
 * - A Knack with `primeOnIntercept` (a Guard's Primed by Pain) marks its own element when it intercepts.
 * - A Payoff with Leave a Trail (`trail`) or the gear set that gives `trailSet` marks its own element after a reaction.
 *
 * How it cashes: only a Payoff, and only with a hit (`noDamage` hits cash nothing), cashes a mark whose element its own element
 * triggers (the chart's strong pairs, 150%).
 *
 * `reactionPaint` turns the result into what a tile, a tray creature or a stander is drawn with, in one of three looks.
 */
import { content, gearBase, gearFx, type Element, type GearItem, type Role } from '@creatures/game';

/**
 * The part of the combat v2 content this reads: the Knacks' and talents' effects by id. It is passed in, never imported: the combat v2
 * data is not in the shipped client yet (`combat-pack.ts` loads it in staging builds only; `dev-build.test.ts` holds the line), so a
 * build without it still lights Setters and Payoffs by role, and the Knacks, talents and gear sets that change who marks join when it is
 * there.
 */
export interface PartnerPack {
  readonly knacks: Readonly<Record<string, { readonly fx: Readonly<Record<string, unknown>> }>>;
  readonly talents: Readonly<Record<string, { readonly fx: Readonly<Record<string, unknown>> }>>;
}

/** A mark is the element id of the creature that sets it ('tide', 'ember', ...). */
export type Mark = string;

/** What a creature's kit is, as far as marks go: the parts that decide what it sets and cashes. */
export interface PartnerKit {
  /** The creature's id: a creature that stands on the board and in the tray is one creature. */
  id: string;
  role: string;
  element: string;
  /** The saved Knack id (null or absent: none). */
  knack?: string | null | undefined;
  /** The slotted talent ids. */
  talents?: readonly string[];
  /**
   * The worn gear. Only the base and the slot are read: no gear line sets or cashes a mark, so what a piece can do for marks is its
   * set's three-piece effect (`trailSet`), which needs the pieces and nothing else. (An item's rolled lines are left out on purpose:
   * the server sends them as text, not as the numbers `gearFx` folds.)
   */
  gear?: readonly {
    baseId: string;
    slot: GearItem['slot'];
    rarity?: GearItem['rarity'];
    itemLevel?: number;
  }[];
}

/** The marks a kit sets, and the marks it cashes. */
export interface KitMarks {
  sets: Set<Mark>;
  cashes: Set<Mark>;
}

/** How one other creature relates to the one touched. */
export interface Partner {
  /** `cashes`: it can cash a mark the touched one sets. `sets`: it sets a mark the touched one cashes. `both`: both. */
  as: 'cashes' | 'sets' | 'both';
  /** The marks (element ids) that link them, in the order of the content's elements. */
  marks: Mark[];
}

/** The effect names this file reads (the engine's), so a test can compare them with the data. */
export const MARK_FIELDS = [
  'marksAs',
  'trail',
  'trailSet',
  'primeOnIntercept',
  'noDamage',
] as const;

/** The fx names that touch marks in some other way than who sets or cashes them (they change how big a mark is, or what a mark does). */
export const MARK_FIELDS_UNRELATED = [
  'markStacks',
  'markOthers',
  'markingHitBp',
  'markedFoeBp',
  'ownMarkBp',
  'freshMarkBp',
  'firstMarkExtra',
  'deepTracks',
  'seal',
] as const;

const ELEMENTS: readonly string[] = content.elements.map((e) => e.id);

/** True when a hit of `attacker` cashes a mark of `mark` (the chart's strong pairs: the engine's `triggers`). */
function triggers(attacker: string, mark: string): boolean {
  return content.elementChart.some(
    (p) => p.attacker === attacker && p.defender === mark && p.bp === 15_000,
  );
}

/** The effects a kit has, as the few flags and values the mark rules read. */
interface KitFx {
  marksAs: 'own' | 'cashable' | undefined;
  support: string | undefined;
  trail: boolean;
  trailSet: boolean;
  primeOnIntercept: boolean;
  noDamage: boolean;
}

/** A kit's Knack, its working talents and its worn gear, merged as the engine merges them (flags combine; a Knack's `marksAs` wins). */
function fxOf(kit: PartnerKit, pack: PartnerPack | null): KitFx {
  const out: KitFx = {
    marksAs: undefined,
    support: undefined,
    trail: false,
    trailSet: false,
    primeOnIntercept: false,
    noDamage: false,
  };
  const take = (fx: Readonly<Record<string, unknown>>): void => {
    if (fx['marksAs'] === 'own' || fx['marksAs'] === 'cashable') out.marksAs ??= fx['marksAs'];
    if (typeof fx['support'] === 'string') out.support ??= fx['support'];
    if (fx['trail'] === true) out.trail = true;
    if (fx['trailSet'] === true) out.trailSet = true;
    if (fx['primeOnIntercept'] === true) out.primeOnIntercept = true;
    if (fx['noDamage'] === true) out.noDamage = true;
  };
  if (pack !== null && kit.knack != null && Object.hasOwn(pack.knacks, kit.knack)) {
    take(pack.knacks[kit.knack]?.fx ?? {});
  }
  for (const id of pack === null ? [] : (kit.talents ?? [])) {
    const talent = Object.hasOwn(pack?.talents ?? {}, id) ? pack?.talents[id] : undefined;
    // The engine merges every slotted talent into a creature's effects whatever the talent's `roles` (`createResolver` never reads them): a
    // talent that is idle for a role is idle because the fight reads its fields only on that role's paths, not because it is left out.
    if (talent !== undefined) take(talent.fx);
  }
  take(gearFxOf(kit));
  return out;
}

/** The effects the worn gear gives this wearer: its sets' effects and lines that the engine reads. Gear the content no longer has gives none. */
function gearFxOf(kit: PartnerKit): Readonly<Record<string, unknown>> {
  const worn = kit.gear ?? [];
  if (worn.length === 0) return {};
  try {
    const items: GearItem[] = worn.flatMap((g) => {
      const base = gearBase(g.baseId);
      return base === undefined
        ? []
        : [
            {
              baseId: g.baseId,
              slot: g.slot,
              tag: base.tag,
              rarity: g.rarity ?? 'common',
              itemLevel: g.itemLevel ?? 1,
              lines: [],
            },
          ];
    });
    return { ...gearFx({ role: kit.role as Role, element: kit.element as Element }, items) };
  } catch {
    // An item the content has since changed: it counts for nothing.
    return {};
  }
}

/** The marks a kit sets and cashes (see the file's header). A silenced creature is not considered: silence passes. */
export function kitMarks(kit: PartnerKit, pack: PartnerPack | null): KitMarks {
  const fx = fxOf(kit, pack);
  const sets = new Set<Mark>();
  const cashes = new Set<Mark>();
  const payoff = kit.role === 'payoff';
  const marksAs = fx.marksAs ?? (kit.role === 'setter' ? 'own' : undefined);
  if (marksAs === 'own') sets.add(kit.element);
  else if (marksAs === 'cashable') {
    sets.add(ELEMENTS.find((m) => triggers(kit.element, m)) ?? kit.element);
  }
  if (kit.role === 'support' && fx.support === 'readyMark') sets.add(kit.element);
  if (fx.primeOnIntercept) sets.add(kit.element);
  // Leave a Trail: the mark follows a reaction, so only a Payoff that can hit leaves it.
  if (payoff && !fx.noDamage && (fx.trail || fx.trailSet)) sets.add(kit.element);
  if (payoff && !fx.noDamage) {
    for (const m of ELEMENTS) if (triggers(kit.element, m)) cashes.add(m);
  }
  return { sets, cashes };
}

const byElementOrder = (marks: Iterable<Mark>): Mark[] =>
  [...new Set(marks)].sort((a, b) => ELEMENTS.indexOf(a) - ELEMENTS.indexOf(b));

/**
 * The other creatures that are reaction partners of `touched`, by id. A creature that can cash a mark the touched one sets is `cashes`;
 * one that sets a mark the touched one cashes is `sets`; both is `both`. Never the touched creature itself (the same id), and a creature
 * with no marks to set or cash has no partners at all.
 */
export function partnersOf(
  touched: PartnerKit,
  others: readonly PartnerKit[],
  pack: PartnerPack | null,
): Map<string, Partner> {
  const mine = kitMarks(touched, pack);
  const result = new Map<string, Partner>();
  if (mine.sets.size === 0 && mine.cashes.size === 0) return result;
  for (const other of others) {
    if (other.id === touched.id || result.has(other.id)) continue;
    const theirs = kitMarks(other, pack);
    // It cashes what the touched one sets: the marks both name.
    const cashing = [...mine.sets].filter((m) => theirs.cashes.has(m));
    // It sets what the touched one cashes.
    const setting = [...theirs.sets].filter((m) => mine.cashes.has(m));
    if (cashing.length === 0 && setting.length === 0) continue;
    result.set(other.id, {
      as:
        cashing.length > 0 && setting.length > 0 ? 'both' : cashing.length > 0 ? 'cashes' : 'sets',
      marks: byElementOrder([...cashing, ...setting]),
    });
  }
  return result;
}

// --- How a partner is drawn ---

/** The three looks (a Misa comparison): the others dimmed (the pick), a badge of the mark's icon, or a glow in the mark's colour. */
export type PartnerLook = 'badge' | 'glow' | 'dim';
export const PARTNER_LOOKS: readonly PartnerLook[] = ['badge', 'glow', 'dim'];
export const isPartnerLook = (value: unknown): value is PartnerLook =>
  value === 'badge' || value === 'glow' || value === 'dim';

/** What a partner (or the touched creature) wears: the marks' elements, and how it is drawn. */
export interface PartnerCue {
  /** `touched`: the creature in hand. `partner`: one of its partners. */
  who: 'touched' | 'partner';
  /** The element ids of the marks that link them. */
  marks: readonly Mark[];
  look: PartnerLook;
  /** What the partner does with them: for the spoken name. */
  as?: Partner['as'];
}

/** What a seat, a tray creature or a stander is drawn with besides itself. */
export interface PartnerPaint {
  partner?: PartnerCue;
  /** The look `dim`: this one is no partner, and recedes. */
  dim?: true;
}

/**
 * The paint of each creature while `touchedId` is touched, in one look; `undefined` for a creature that gets none. Nothing at all when
 * the touched creature has no partners (so `dim` never greys the whole board for a Guard that marks nothing).
 */
export function reactionPaint(
  look: PartnerLook,
  touchedId: string | null,
  partners: ReadonlyMap<string, Partner>,
): (id: string) => PartnerPaint | undefined {
  if (touchedId === null || partners.size === 0) return () => undefined;
  const all = byElementOrder([...partners.values()].flatMap((p) => p.marks));
  return (id) => {
    if (id === touchedId) {
      return look === 'badge' ? { partner: { who: 'touched', marks: all, look } } : undefined;
    }
    const partner = partners.get(id);
    if (partner !== undefined) {
      return look === 'dim'
        ? undefined
        : { partner: { who: 'partner', marks: partner.marks, look, as: partner.as } };
    }
    return look === 'dim' ? { dim: true } : undefined;
  };
}

/** The words a screen reader adds to a creature that is a partner: "Reaction partner: cashes Ember." */
export function partnerWords(cue: PartnerCue, elementName: (id: string) => string): string {
  const names = cue.marks.map(elementName).join(' and ');
  if (cue.who === 'touched') return `Reaction partners are lit, for ${names}.`;
  const does = cue.as === 'cashes' ? 'cashes' : cue.as === 'sets' ? 'sets' : 'sets and cashes';
  return `Reaction partner: ${does} the ${names} mark.`;
}
