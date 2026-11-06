import * as v from 'valibot';

/**
 * The welcome-back Gazette on real output (phase 5 step 4, `docs/design/valley/systems/return.md` V-RET-0 to 8, posts.md V-POST-14).
 *
 * Three parts, all pure:
 * - **The log** (`PaperLog`): what the lazy pass records, as it runs, about what happened while the player was away: the scouts' finds (new
 *   species, duplicates at the gate, gear, blueprints, pages, a pack that filled), the Forge's pieces, mastery steps reached, the allowance
 *   brought home, the resting creatures' best XP, and one resting creature's small moment. Small and capped, so a month away is no bigger
 *   than a day; two logs add (`mergeLogs`), so an unread paper and a new arrival tell one story.
 * - **The ranking** (`HIGHLIGHT_WEIGHT`, `pickHighlights`): how notable each story is and which ones the paper tells. The prototype
 *   (`apps/activity/src/proto/welcome/highlights.ts`) and the paper built from the log use these, so there is one ranking: the best story
 *   of each kind of thing (a piece, a creature, the valley), the biggest first, at most `MAX_HIGHLIGHTS` however long the absence was.
 * - **The paper** (`composePaper`): the log as at most three headlines (data, no wording: the client words them with the creatures' names)
 *   and the count of what was left untold ("...and N more things"). A longer absence groups more into a headline; it never makes the paper
 *   longer (V-RET-6). Nothing here says what was lost (V-RET-7).
 *
 * `PaperSchema` is the strict shape of `valley.paper` in `/api/state`.
 */

/** At most this many headlines on a paper (V-RET-0: two or three lively highlights). */
export const MAX_HIGHLIGHTS = 3;
/** A paper tells at least this many when it can (a quiet day is never one line). */
export const MIN_HIGHLIGHTS = 2;
/** The most finds one headline shows as themselves (the rest is "+N more"). */
export const MAX_HEADLINE_FINDS = 3;
/** The Gazette opens after this many hours away (V-RET example: 3 hours). */
export const WELCOME_AFTER_HOURS = 3;

/** What a headline is about: a piece (gear, blueprints, pages), a creature (a newcomer, a mastery step, resting XP) or the valley itself. */
export const HIGHLIGHT_GROUPS = ['piece', 'creature', 'server'] as const;
export type HighlightGroup = (typeof HIGHLIGHT_GROUPS)[number];

/** How notable each story is. Within a group the highest is the highlight. One table for the prototype's stories and the paper's. */
export const HIGHLIGHT_WEIGHT = {
  // Pieces
  epicReroll: 95,
  rareReroll: 80,
  reroll: 60,
  fitted: 50,
  found: 40,
  pages: 35,
  // Creatures
  newLine: 100,
  master: 90,
  graduation: 80,
  expert: 70,
  learning: 55,
  apprentice: 40,
  lesson: 35,
  newcomersHome: 30,
  restLevel: 45,
  restXp: 25,
  scoutsHome: 20,
  moment: 10,
  // The valley
  placeLevel: 85,
  blueprint: 60,
  visitor: 50,
  packFull: 20,
  allowance: 15,
} as const;

/**
 * The stories of each group, the biggest first, at most `MAX_HIGHLIGHTS`: the best of each group, and when fewer than
 * `MIN_HIGHLIGHTS` groups have anything the next best story of any group joins them. Equal weights keep the order given.
 */
export function pickHighlights<T extends { weight: number }>(
  stories: readonly T[],
  groupOf: (story: T) => HighlightGroup,
): T[] {
  const byWeight = (a: T, b: T): number => b.weight - a.weight;
  const best = HIGHLIGHT_GROUPS.map(
    (group) => stories.filter((s) => groupOf(s) === group).sort(byWeight)[0],
  ).filter((s): s is T => s !== undefined);
  const picked = best.sort(byWeight).slice(0, MAX_HIGHLIGHTS);
  if (picked.length < MIN_HIGHLIGHTS) {
    const next = [...stories]
      .filter((s) => !picked.includes(s))
      .sort(byWeight)
      .slice(0, MIN_HIGHLIGHTS - picked.length);
    return [...picked, ...next].sort(byWeight);
  }
  return picked;
}

// --- The log: what the pass records ---

const int = v.pipe(v.number(), v.integer(), v.minValue(0));
const id = v.pipe(v.string(), v.minLength(1), v.maxLength(64));
const RARITIES = ['common', 'rare', 'epic'] as const;
export type PaperRarity = (typeof RARITIES)[number];

/** A piece as the paper shows it: the same four things a find shows (its card opens from them). */
export const PaperItemSchema = v.strictObject({
  id,
  baseId: id,
  rarity: v.picklist(RARITIES),
  level: int,
});
export type PaperItem = v.InferOutput<typeof PaperItemSchema>;

/** The most of each list a log keeps: a month away is no bigger than a day. */
export const LOG_CAPS = {
  newcomers: 8,
  items: 6,
  blueprints: 6,
  mastery: 8,
  xp: 3,
  packs: 6,
} as const;

const by = v.nullable(id);

export const PaperLogSchema = v.strictObject({
  /** New species that joined the roster (V-SCOUT-3), the first few; `newcomerCount` counts them all. `by` is the scout that found it. */
  newcomers: v.pipe(
    v.array(v.strictObject({ creatureId: id, species: id, by })),
    v.maxLength(LOG_CAPS.newcomers),
  ),
  newcomerCount: int,
  /** Duplicates left at the Paddock gate. */
  duplicates: int,
  /** Gear scouts found (rolled when the pack came home), the best first; `gearCount` counts them all. */
  gear: v.pipe(v.array(v.strictObject({ item: PaperItemSchema, by })), v.maxLength(LOG_CAPS.items)),
  gearCount: int,
  /** Blueprints scouts found (a repeat find is scrap, not a story). */
  blueprints: v.pipe(v.array(v.strictObject({ baseId: id, by })), v.maxLength(LOG_CAPS.blueprints)),
  blueprintCount: int,
  /** Journal pages found. */
  pages: int,
  /** Scouts whose pack filled (V-SCOUT-4): who, the first few. */
  packsFull: v.pipe(v.array(by), v.maxLength(LOG_CAPS.packs)),
  /** The Forge's pieces that came home: how many, by rarity, and the best of them. */
  forge: v.strictObject({
    count: int,
    byRarity: v.tuple([int, int, int]),
    best: v.pipe(v.array(PaperItemSchema), v.maxLength(LOG_CAPS.items)),
    by,
  }),
  /** Mastery steps reached (1 Skilled, 2 Expert, 3 Master), the highest first. */
  mastery: v.pipe(
    v.array(
      v.strictObject({
        post: v.picklist(['scout', 'anvil']),
        creatureId: id,
        step: v.picklist([1, 2, 3]),
      }),
    ),
    v.maxLength(LOG_CAPS.mastery),
  ),
  /** The resting creatures that gained the most XP (and how many levels), the biggest first. */
  xp: v.pipe(
    v.array(v.strictObject({ creatureId: id, gained: int, levels: int })),
    v.maxLength(LOG_CAPS.xp),
  ),
  /** One resting creature's small moment (V-BON-9): who, and which of the moments (the client has the lines). */
  moment: v.nullable(v.strictObject({ creatureId: id, turn: int })),
  /** What came home: Acorns (the allowance), scrap and shards (the scouts' packs). */
  brought: v.strictObject({ acorns: int, scrap: int, shards: int }),
});
export type PaperLog = v.InferOutput<typeof PaperLogSchema>;

export const emptyLog = (): PaperLog => ({
  newcomers: [],
  newcomerCount: 0,
  duplicates: 0,
  gear: [],
  gearCount: 0,
  blueprints: [],
  blueprintCount: 0,
  pages: 0,
  packsFull: [],
  forge: { count: 0, byRarity: [0, 0, 0], best: [], by: null },
  mastery: [],
  xp: [],
  moment: null,
  brought: { acorns: 0, scrap: 0, shards: 0 },
});

const rank = (rarity: PaperRarity): number => RARITIES.indexOf(rarity);
const bestFirst = (a: PaperItem, b: PaperItem): number =>
  rank(b.rarity) - rank(a.rarity) || b.level - a.level || a.id.localeCompare(b.id, 'en');

/** Adds `more` to `base`: counts add, lists are joined and cut to their caps (best first where it matters). Neither is changed. */
export function mergeLogs(base: PaperLog, more: PaperLog): PaperLog {
  const gear = [...base.gear, ...more.gear]
    .sort((a, b) => bestFirst(a.item, b.item))
    .slice(0, LOG_CAPS.items);
  const best = [...base.forge.best, ...more.forge.best].sort(bestFirst).slice(0, LOG_CAPS.items);
  const xp = new Map<string, { creatureId: string; gained: number; levels: number }>();
  for (const e of [...base.xp, ...more.xp]) {
    const have = xp.get(e.creatureId);
    xp.set(
      e.creatureId,
      have === undefined
        ? { ...e }
        : {
            creatureId: e.creatureId,
            gained: have.gained + e.gained,
            levels: have.levels + e.levels,
          },
    );
  }
  return {
    newcomers: [...base.newcomers, ...more.newcomers].slice(0, LOG_CAPS.newcomers),
    newcomerCount: base.newcomerCount + more.newcomerCount,
    duplicates: base.duplicates + more.duplicates,
    gear,
    gearCount: base.gearCount + more.gearCount,
    blueprints: [...base.blueprints, ...more.blueprints].slice(0, LOG_CAPS.blueprints),
    blueprintCount: base.blueprintCount + more.blueprintCount,
    pages: base.pages + more.pages,
    packsFull: [...base.packsFull, ...more.packsFull].slice(0, LOG_CAPS.packs),
    forge: {
      count: base.forge.count + more.forge.count,
      byRarity: [
        base.forge.byRarity[0] + more.forge.byRarity[0],
        base.forge.byRarity[1] + more.forge.byRarity[1],
        base.forge.byRarity[2] + more.forge.byRarity[2],
      ],
      best,
      by: more.forge.by ?? base.forge.by,
    },
    mastery: [...base.mastery, ...more.mastery]
      .sort((a, b) => b.step - a.step)
      .slice(0, LOG_CAPS.mastery),
    xp: [...xp.values()].sort((a, b) => b.gained - a.gained).slice(0, LOG_CAPS.xp),
    moment: more.moment ?? base.moment,
    brought: {
      acorns: base.brought.acorns + more.brought.acorns,
      scrap: base.brought.scrap + more.brought.scrap,
      shards: base.brought.shards + more.brought.shards,
    },
  };
}

// --- The paper: headlines ---

/** The kinds of headline a paper tells (what the lab's journeys also produce are `new-species`, `mastery-*`, `found-gear`, `forge-pieces`). */
export const HEADLINE_KINDS = [
  'new-species',
  'mastery-scout',
  'mastery-anvil',
  'found-gear',
  'found-blueprint',
  'found-pages',
  'forge-pieces',
  'duplicates',
  'resting-xp',
  'pack-full',
  'allowance',
  'moment',
] as const;
export type HeadlineKind = (typeof HEADLINE_KINDS)[number];

const GROUP_OF: Record<HeadlineKind, HighlightGroup> = {
  'new-species': 'creature',
  'mastery-scout': 'creature',
  'mastery-anvil': 'creature',
  'found-gear': 'piece',
  'found-blueprint': 'piece',
  'found-pages': 'piece',
  'forge-pieces': 'piece',
  duplicates: 'creature',
  'resting-xp': 'creature',
  'pack-full': 'server',
  allowance: 'server',
  moment: 'creature',
};

/** One of a paper's headlines, as data: the client words it (names, places) and draws its scene from the creatures. */
export const PaperHeadlineSchema = v.strictObject({
  kind: v.picklist(HEADLINE_KINDS),
  /** How notable it was (the shared ranking). */
  weight: int,
  /** How many things it stands for (the newcomers, the pieces); 0 for a flourish. */
  count: int,
  /** The creatures it is about (the scouts, the smiths, the one that rested), the first few. */
  creatureIds: v.pipe(v.array(id), v.maxLength(3)),
  /** The species of a newcomer (for its face), else null. */
  species: v.nullable(id),
  /** The mastery step reached (1 Skilled, 2 Expert, 3 Master), else null. */
  step: v.nullable(v.picklist([1, 2, 3])),
  /** The best rarity among its pieces, else null. */
  rarity: v.nullable(v.picklist(RARITIES)),
  /** The turn of a small moment (the client's lines), else null. */
  turn: v.nullable(int),
  /** The pieces it found, shown as themselves, best first. */
  items: v.pipe(v.array(PaperItemSchema), v.maxLength(MAX_HEADLINE_FINDS)),
  blueprints: v.pipe(v.array(id), v.maxLength(MAX_HEADLINE_FINDS)),
  /** Newcomers it found, shown as faces: the creatures' ids. */
  newcomers: v.pipe(v.array(id), v.maxLength(MAX_HEADLINE_FINDS)),
});
export type PaperHeadline = v.InferOutput<typeof PaperHeadlineSchema>;

/** V-RET-3 with V-SCOUT-6: a scout found a way into its destination's deeper area; the paper offers it. */
export const PaperDecisionSchema = v.strictObject({
  kind: v.literal('push-on'),
  seatId: id,
  creatureId: id,
  destination: id,
});
export type PaperDecision = v.InferOutput<typeof PaperDecisionSchema>;

/** `valley.paper` of `/api/state`: the last paper, while it is unread (closing it marks it read). */
export const PaperSchema = v.strictObject({
  /** The paper's key: the pass that wrote it (UTC epoch ms, as text). */
  id,
  at: int,
  /** The whole hours away that the arrival settled. */
  awayHours: int,
  headlines: v.pipe(v.array(PaperHeadlineSchema), v.maxLength(MAX_HIGHLIGHTS)),
  /** What the paper left untold: "...and N more things". */
  more: int,
  brought: PaperLogSchema.entries.brought,
  /** At most one decision (V-RET-3). */
  decision: v.nullable(PaperDecisionSchema),
});
export type Paper = v.InferOutput<typeof PaperSchema>;

const blank = (kind: HeadlineKind, weight: number, count: number): PaperHeadline => ({
  kind,
  weight,
  count,
  creatureIds: [],
  species: null,
  step: null,
  rarity: null,
  turn: null,
  items: [],
  blueprints: [],
  newcomers: [],
});

const rarityWeight = (rarity: PaperRarity, common: number): number =>
  rarity === 'epic'
    ? HIGHLIGHT_WEIGHT.epicReroll
    : rarity === 'rare'
      ? HIGHLIGHT_WEIGHT.rareReroll
      : common;

const crew = (...ids: (string | null)[]): string[] =>
  ids.filter((x, i, all): x is string => x !== null && all.indexOf(x) === i).slice(0, 3);

/** Every story the log has, unranked. */
export function headlinesOf(log: PaperLog): PaperHeadline[] {
  const out: PaperHeadline[] = [];
  const first = log.newcomers[0];
  if (log.newcomerCount > 0 && first !== undefined) {
    out.push({
      ...blank(
        'new-species',
        log.newcomerCount === 1 ? HIGHLIGHT_WEIGHT.newLine : HIGHLIGHT_WEIGHT.newLine - 5,
        log.newcomerCount,
      ),
      creatureIds: crew(...log.newcomers.map((n) => n.by)),
      species: first.species,
      newcomers: log.newcomers.slice(0, MAX_HEADLINE_FINDS).map((n) => n.creatureId),
    });
  }
  for (const post of ['scout', 'anvil'] as const) {
    const steps = log.mastery.filter((m) => m.post === post);
    const top = Math.max(0, ...steps.map((m) => m.step));
    if (top === 0) continue;
    const who = steps.filter((m) => m.step === top);
    out.push({
      ...blank(
        post === 'scout' ? 'mastery-scout' : 'mastery-anvil',
        top === 3
          ? HIGHLIGHT_WEIGHT.master
          : top === 2
            ? HIGHLIGHT_WEIGHT.expert
            : HIGHLIGHT_WEIGHT.apprentice,
        steps.length,
      ),
      creatureIds: crew(...who.map((m) => m.creatureId)),
      step: top as 1 | 2 | 3,
    });
  }
  if (log.gearCount > 0) {
    const best = log.gear[0]?.item.rarity ?? 'common';
    out.push({
      ...blank('found-gear', rarityWeight(best, HIGHLIGHT_WEIGHT.found), log.gearCount),
      creatureIds: crew(...log.gear.map((g) => g.by)),
      rarity: best,
      items: log.gear.slice(0, MAX_HEADLINE_FINDS).map((g) => g.item),
    });
  }
  if (log.blueprintCount > 0) {
    out.push({
      ...blank('found-blueprint', HIGHLIGHT_WEIGHT.blueprint, log.blueprintCount),
      creatureIds: crew(...log.blueprints.map((b) => b.by)),
      blueprints: log.blueprints.slice(0, MAX_HEADLINE_FINDS).map((b) => b.baseId),
    });
  }
  if (log.pages > 0) {
    out.push(blank('found-pages', HIGHLIGHT_WEIGHT.pages, log.pages));
  }
  if (log.forge.count > 0) {
    const best = log.forge.best[0]?.rarity ?? 'common';
    out.push({
      ...blank('forge-pieces', rarityWeight(best, HIGHLIGHT_WEIGHT.fitted), log.forge.count),
      creatureIds: crew(log.forge.by),
      rarity: best,
      items: log.forge.best.slice(0, MAX_HEADLINE_FINDS),
    });
  }
  if (log.duplicates > 0) {
    out.push(blank('duplicates', HIGHLIGHT_WEIGHT.newcomersHome, log.duplicates));
  }
  if (log.xp[0] !== undefined) {
    out.push({
      ...blank(
        'resting-xp',
        log.xp.some((e) => e.levels > 0) ? HIGHLIGHT_WEIGHT.restLevel : HIGHLIGHT_WEIGHT.restXp,
        1,
      ),
      creatureIds: crew(...log.xp.map((e) => e.creatureId)),
    });
  }
  if (log.packsFull.length > 0) {
    out.push({
      ...blank('pack-full', HIGHLIGHT_WEIGHT.packFull, log.packsFull.length),
      creatureIds: crew(...log.packsFull),
    });
  }
  if (log.brought.acorns > 0) {
    out.push(blank('allowance', HIGHLIGHT_WEIGHT.allowance, 1));
  }
  if (log.moment !== null) {
    out.push({
      ...blank('moment', HIGHLIGHT_WEIGHT.moment, 0),
      creatureIds: [log.moment.creatureId],
      turn: log.moment.turn,
    });
  }
  return out;
}

/** The log as a paper's headlines (at most `MAX_HIGHLIGHTS`, the biggest first) and what was left untold. */
export function composePaper(log: PaperLog): { headlines: PaperHeadline[]; more: number } {
  const all = headlinesOf(log);
  const headlines = pickHighlights(all, (h) => GROUP_OF[h.kind]);
  const more = all.filter((h) => !headlines.includes(h)).reduce((sum, h) => sum + h.count, 0);
  return { headlines, more };
}

/** Whether a log has anything to tell (a paper with no headline is not written). */
export const logHasNews = (log: PaperLog): boolean => headlinesOf(log).length > 0;
