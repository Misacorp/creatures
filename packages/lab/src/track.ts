/**
 * The boss track: which raid boss a server meets at which Boss Rank, as data (`docs/design/combat/boss-track.md`).
 *
 * The track is an ordered list of slots, each a boss and the strength of its cards. A server starts at slot 1 (Boss Rank 1) and
 * a win moves it one slot on; after the last boss the track starts again with the next, stronger cards (the slot number is the
 * Boss Rank, and the strength follows the rank up to the cap). Failing a boss keeps the slot (`path.ts` plays that out).
 */
import { BOSS_ANSWERS, answerLine } from './bossAnswers';
import { RAID_RANKS, raidBossOf } from './bosses';
import type { Pick } from './search';
import { absoluteOf, nativeOf, type Numbers } from './tuner';
import type { BossDef } from './types';

/**
 * The order of the bosses on the track. It is one line to change: Misa may reorder it, or list a boss twice (every id must be one
 * of `RAID_BOSS_IDS`; `test/track.test.ts` checks it). Thornmother is last on purpose (Misa, 2026-10-30, "Thornmother is a
 * deliberate wall at the end of the first lap"): slots 5, 10 and 15, the first of them a wall (`SLOT_WALL`).
 */
export const TRACK_ORDER: readonly string[] = [
  'tidal-colossus',
  'cinder-wyrm',
  'storm-sovereign',
  'old-bogback',
  'thornmother',
];

/**
 * What of its rules a slot's boss has (the young-server ramp, Misa, 2026-10-30): `cards` is how many of its rule cards, the boss's
 * first ones in order (absent: all), and `buildUp` whether it has its Build-up (the Store that grows it as the weekend goes on).
 */
export interface SlotRules {
  readonly cards?: number;
  readonly buildUp: boolean;
}

export interface TrackSlot {
  /** The slot, and the Boss Rank it stands for (slot 1 is Boss Rank 1). */
  readonly slot: number;
  readonly bossId: string;
  /** The strength of every card and gate (bp of the full card). */
  readonly strengthBp: number;
  /** The rules the boss has at this slot (`SLOT_CARDS`). */
  readonly rules: SlotRules;
  /** A deliberate wall (`SLOT_WALL`): the unprepared classic party is asked to fall far short (`slotTargetsFor`). */
  readonly wall: boolean;
  /** The cards this slot adds to its boss on top of its own (`SLOT_EXTRA_CARDS`: a later lap's new card). */
  readonly extraCards: readonly string[];
}

/** The numbers a slot may set by hand (absolute, before cards), replacing the ones interpolated from the ranks. */
export type SlotNumbers = Partial<Numbers>;

/** A table of per-slot numbers (slot number to HP, Attack and armour), like `SLOT_NUMBERS`. */
export type SlotTable = Readonly<Record<number, SlotNumbers>>;

/**
 * Per-slot numbers (slot number to HP, Attack and armour, absolute before cards), data. A slot without an entry interpolates the
 * three ranks' numbers (`rankNumbers`). Tuned by `node scripts/report.mjs --tune --track` (`trackTuner.ts`) for the roster the path
 * says arrives at each slot (`SLOT_WEEKS`); slots 1 to 15 (three laps), later laps follow the high rank's numbers.
 */
export const SLOT_NUMBERS: SlotTable = {
  1: { hp: 3_800, atk: 83, armour: 19 }, // tidal-colossus
  2: { hp: 7_500, atk: 80, armour: 42 }, // cinder-wyrm
  3: { hp: 13_500, atk: 53, armour: 6 }, // storm-sovereign
  4: { hp: 28_200, atk: 82, armour: 19 }, // old-bogback
  5: { hp: 6_500, atk: 150, armour: 124 }, // thornmother
  6: { hp: 15_600, atk: 113, armour: 21 }, // tidal-colossus
  7: { hp: 10_200, atk: 185, armour: 48 }, // cinder-wyrm
  8: { hp: 7_000, atk: 100, armour: 7 }, // storm-sovereign
  9: { hp: 32_800, atk: 100, armour: 33 }, // old-bogback
  10: { hp: 8_000, atk: 102, armour: 149 }, // thornmother
  11: { hp: 13_400, atk: 137, armour: 40 }, // tidal-colossus
  12: { hp: 11_500, atk: 199, armour: 49 }, // cinder-wyrm
  13: { hp: 14_300, atk: 48, armour: 10 }, // storm-sovereign
  14: { hp: 32_700, atk: 117, armour: 31 }, // old-bogback
  15: { hp: 9_000, atk: 97, armour: 156 }, // thornmother
};

/**
 * The week each slot's numbers were tuned for (index 0 is slot 1): the median week a dedicated server first FIGHTS the slot at the
 * expected roster speed, from the path with `SLOT_NUMBERS` (`trackTuner.ts` prints it with the table). Never a Festival week: a server
 * that reaches slot 5 in week 5 fights it first in week 6 (the Festival clock is the server's age in weeks, `path.ts`). The ownability
 * check reads it (`ownability.ts`: a slot's tool line must be ownable and evolved in the week the slot arrives).
 */
export const SLOT_WEEKS: readonly number[] = [1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 16, 17, 18];

/**
 * The young-server ramp, a column of the track's data (Misa, 2026-10-30; `docs/design/decisions/raids.md`): a new server has only
 * starters and is still finding its footing, so the first week's boss is a **tutorial** and the second asks little.
 * - Slot 1: no rule cards and no Build-up. The boss keeps its plain attack and its moves (the announced attacks, which are the
 *   boss and not rules; they are not scaled by card strength, only by the slot's HP and Attack, which the tuner sets); it has no
 *   Store to grow it and nothing to answer, so no tool is asked of the team there (`slotTargetsFor`).
 * - Slot 2: one rule card, the boss's first, at the slot's low strength (about 30%), and no Build-up (it arrives with the full set).
 * - Slot 3 onward: the full set (every card and the Build-up) at the slot's strength. A slot without an entry has it.
 */
export const SLOT_CARDS: Readonly<Record<number, SlotRules>> = {
  1: { cards: 0, buildUp: false },
  2: { cards: 1, buildUp: false },
};

/**
 * The slots that are a deliberate wall (Misa, 2026-10-30; `docs/design/decisions/raids.md`, "Thornmother is a deliberate wall at the
 * end of the first lap"): slot 5 only, Thornmother's first appearance. A prepared team still reaches 125% potential there, but a team
 * without her answer is asked for a classic potential of 30% to 60% instead of 70% to 90% (`WALL_CLASSIC_POTENTIAL_*`). Her later
 * laps (slots 10 and 15) are normal slots, since a server that passed the wall has learned the answer.
 */
export const SLOT_WALL: Readonly<Record<number, true>> = { 5: true };

/**
 * A slot's own prepared line (a line spec as in `bossAnswers.ts`), used by the track tuner and the path in place of the boss's first
 * written answer (`slotPreparedOf`). Slots 1 and 2: a server there has no evolved forms (a stage 2 form evolves at level 15, and a daily
 * player's best creature is level 11 in week 1 and 14 in week 2), so each line is the line such a server really fields, the gated
 * version of the line it had (`gatedPick` in `roster.ts`: each stage 2 form is its stage 1 form, with the Knack and the talents the
 * gate keeps; an evolved line would be fielded as these anyway, and the ownability rule asks that a slot's line be evolved at its week).
 * - Slot 1 (the tutorial boss): the old line, the boss's first answer with both Tempestrays replaced by Geyserpup with Puddle Maker
 *   (Tempestray is a rare, which a server of 8 owns with a chance of 33% in week 1), gated. All common.
 * - Slot 2: the Cinder Wyrm's first answer, gated; it keeps the tool (the first card's answer, Squelch Song, on three Squelch).
 * A team search over the common stage 1 forms found lines with more raw potential at the same numbers (slot 1: 277% against 132%;
 * slot 2: 177% against 132%), but retuned they were worse where the tuner looks: slot 1 at the lower limit of the search again with a
 * prepared potential of 180% and 115% with random talents, slot 2 at 4,800 HP with 107% with random talents. These lines are kept.
 */
export const SLOT_LINE: Readonly<Record<number, string>> = {
  1: 'ashmole/wide-warmth+brace mudlump/wide-reach+long-shadow mistnewt/wide-reach splashet/steady-mark+edge-walker | splashet/lead-the-way+owners-mark mistnewt/wide-reach+catch-breath zipmouse/none+odd-one-out mistnewt/wide-reach | mistnewt/wide-reach+unbothered sproutle/wide-reach+brace splashet/steady-mark splashet/steady-mark+owners-mark',
  2: 'ashmole/none mistnewt/wide-reach zipmouse/none splashet/none+finisher | splashet/steady-mark+finisher ashmole/wide-warmth+bright-boost mistnewt/wide-reach+flank-guard mistnewt/none+catch-breath | squelch/squelch-song+clinging mudlump/mud-wall+brace mistnewt/none squelch/squelch-song | splashet/none+hardy cindle/detonate mudlump/mud-wall squelch/squelch-song',
};

/**
 * A later lap's new card, a column of the track's data (Misa, 2026-10-31, "Lucky Strike and Slippery both go on raid bosses" in
 * `docs/design/decisions/raids.md`): slot to the rule cards the boss gains from that slot on, on top of its own. An entry holds for
 * its slot and every later slot of the same boss (slot 7 and 12 for the Cinder Wyrm), at the slot's card strength, so a known boss's
 * second lap is stronger by one new card. Each card must be one the lab has (`cards.ts`) and have an answer a server can own at the
 * slot's week (`ownability.ts`, tested). An absent slot adds nothing.
 */
export const SLOT_EXTRA_CARDS: Readonly<Record<number, readonly string[]>> = {
  6: ['slippery', 'breakwater'], // tidal-colossus
  8: ['lucky-strike'], // storm-sovereign, from its second lap (slots 8 and 13)
};

/**
 * The extra cards of a slot: the entries of `SLOT_EXTRA_CARDS` at this slot or at an earlier slot of the same boss (every `order.length`
 * slots), in slot order.
 */
export function slotExtraCards(
  slot: number,
  order: readonly string[] = TRACK_ORDER,
  table: Readonly<Record<number, readonly string[]>> = SLOT_EXTRA_CARDS,
): string[] {
  return Object.entries(table)
    .map(([from, cards]) => [Number(from), cards] as const)
    .filter(([from]) => from <= slot && (slot - from) % order.length === 0)
    .sort((a, b) => a[0] - b[0])
    .flatMap(([, cards]) => cards);
}

/** Whether a slot is a wall (`SLOT_WALL`). */
export const isWallSlot = (slot: number): boolean => SLOT_WALL[slot] === true;

/** The rules of a slot's boss: its `SLOT_CARDS` entry, else the full set. */
export const slotRules = (slot: number): SlotRules => SLOT_CARDS[slot] ?? { buildUp: true };

/**
 * A slot's prepared line and its tool (`core`): its `SLOT_LINE` when it has one, else the first written answer of its boss. What the
 * track tuner measures as "prepared" and what a dedicated server fields on the path.
 */
export function slotPreparedOf(
  slot: number,
  order: readonly string[] = TRACK_ORDER,
): { line: Pick[]; core: readonly string[] } {
  const bossId = trackSlot(slot, order).bossId;
  const first = BOSS_ANSWERS[bossId]?.[0];
  if (!first) throw new Error(`${bossId} has no written answer`);
  const spec = SLOT_LINE[slot] ?? first.line;
  return { line: answerLine(spec), core: first.core ?? [] };
}

/** One written answer of a slot's boss as the track fields it: its label, its raid line and its tool (`core`). */
export interface SlotAnswer {
  readonly label: string;
  readonly line: Pick[];
  readonly core: readonly string[];
}

/**
 * Every written answer of a slot's boss (`BOSS_ANSWERS`), in order, as the track fields them: the first answer's line is the slot's own
 * line where `SLOT_LINE` names one (the same line `slotPreparedOf` gives), the others are as written. A creature under its form's
 * evolution level fights as its stage 1 form wherever the line is levelled (`gatedPick` in `roster.ts`).
 */
export function slotAnswersOf(slot: number, order: readonly string[] = TRACK_ORDER): SlotAnswer[] {
  const written = BOSS_ANSWERS[trackSlot(slot, order).bossId] ?? [];
  if (!written.length) throw new Error(`${trackSlot(slot, order).bossId} has no written answer`);
  return written.map((a, i) => ({
    label: a.label,
    line: answerLine(i === 0 ? (SLOT_LINE[slot] ?? a.line) : a.line),
    core: a.core ?? [],
  }));
}

/**
 * Which written answer the mixed server's min-maxers and builders field at a slot (an index into `slotAnswersOf`; absent: 0, the
 * first answer, the slot's prepared line), a column of the track's data (design panel 6, the lead, 2026-10-30). The first answer wants
 * a Wide Reach Guard in every column, and every casual column of a mixed server leaves a gap; an answer that covers whole rows (Row
 * Ward) lets one builder per row carry the casual players. The tuner measures each answer's mixed kill rate at the slot's numbers and
 * week in the full measurement and proposes the best (`trackSummary` prints the lines to paste). The dedicated server always keeps the
 * slot's prepared line.
 */
export const SLOT_MIXED_ANSWER: Readonly<Record<number, number>> = {
  6: 1, // tidal-colossus
  11: 1, // tidal-colossus
};

/** The answer the mixed server fields at a slot: `index` (default `SLOT_MIXED_ANSWER`'s entry, else the first answer). */
export function slotMixedOf(
  slot: number,
  index?: number,
  order: readonly string[] = TRACK_ORDER,
): SlotAnswer {
  const answers = slotAnswersOf(slot, order);
  const at = index ?? SLOT_MIXED_ANSWER[slot] ?? 0;
  const answer = answers[at];
  if (!answer) throw new Error(`slot ${slot} has no written answer number ${at}`);
  return answer;
}

/** The strength of a slot's cards, by slot, when set by hand (bp). Empty: the rank ladder (`rankStrengthBp`). */
export const SLOT_STRENGTH: Readonly<Record<number, number>> = {};

/** Linear interpolation of `value` over the ranks `[rank, v]`: flat outside them, unless `extend` carries the first segment below. */
function across(
  points: readonly (readonly [rank: number, value: number])[],
  rank: number,
  extend: boolean,
): number {
  const first = points[0] as readonly [number, number];
  const last = points[points.length - 1] as readonly [number, number];
  if (rank >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [r0, v0] = points[i - 1] as readonly [number, number];
    const [r1, v1] = points[i] as readonly [number, number];
    if (rank <= r1 && (rank >= r0 || (i === 1 && extend)))
      return v0 + ((v1 - v0) * (rank - r0)) / (r1 - r0);
  }
  return first[1];
}

/**
 * The strength of the cards at a Boss Rank: the ladder's three settings (30%, 65% and 100% at ranks 2, 5 and 10), straight lines
 * between them, the 2-to-5 line carried down to rank 1 (about 18%), and 100% from rank 10 up.
 */
export function rankStrengthBp(rank: number): number {
  return Math.round(
    Math.max(
      0,
      across(
        RAID_RANKS.map((r) => [r.rank, r.strengthBp] as const),
        rank,
        true,
      ),
    ),
  );
}

/** The level of the lab roster the ladder pairs with a Boss Rank (12, 18 and 25 at ranks 2, 5 and 10, flat outside). */
export function rankLevel(rank: number): number {
  return Math.round(
    across(
      RAID_RANKS.map((r) => [r.rank, r.level] as const),
      rank,
      false,
    ),
  );
}

/**
 * A boss's HP, Attack and armour at a Boss Rank between the three the lab sets up: the ranks' own absolute numbers
 * (`raidBossOf` at low, mid and high), straight lines between them and flat outside (rank 1 has the low rank's, rank 10 and up
 * the high's). The armour is the number before the card's own share is added, as `raidBossOf` takes it.
 */
export function rankNumbers(bossId: string, rank: number): Numbers {
  const at = RAID_RANKS.map(
    (r) => [r.rank, absoluteOf(bossId, r.id, nativeOf(bossId, r.id))] as const,
  );
  const line = (pick: (n: Numbers) => number) =>
    Math.round(
      across(
        at.map(([r, n]) => [r, pick(n)] as const),
        rank,
        false,
      ),
    );
  return { hp: line((n) => n.hp), atk: line((n) => n.atk), armour: line((n) => n.armour) };
}

/** Slot `slot` (1 and up) of the track: the boss in order, repeating after the last, and the strength of its cards. */
export function trackSlot(slot: number, order: readonly string[] = TRACK_ORDER): TrackSlot {
  if (!Number.isInteger(slot) || slot < 1)
    throw new Error(`a track slot is a whole number from 1, not ${slot}`);
  return {
    slot,
    bossId: order[(slot - 1) % order.length] as string,
    strengthBp: SLOT_STRENGTH[slot] ?? rankStrengthBp(slot),
    rules: slotRules(slot),
    wall: isWallSlot(slot),
    extraCards: slotExtraCards(slot, order),
  };
}

/** The first `length` slots as a list. */
export const buildTrack = (length: number, order: readonly string[] = TRACK_ORDER): TrackSlot[] =>
  Array.from({ length }, (_, i) => trackSlot(i + 1, order));

/** The track as the lab plans with it: thirty slots (six laps of five bosses, far more than 24 weeks reach). */
export const TRACK: readonly TrackSlot[] = buildTrack(30);

/**
 * A slot's HP, Attack and armour: its `table` entry, and for any number the entry leaves out the ranks' line (`rankNumbers`). There
 * is no floor from the lap before: a later lap's cards are never weaker (`rankStrengthBp`), so its numbers may be lower when its cards
 * make up for it (Misa, 2026-10-30); the rule is on the kill rate (`lapKillViolations` in `trackTuner.ts`).
 */
export function slotNumbers(
  slot: number,
  table: SlotTable = SLOT_NUMBERS,
  order: readonly string[] = TRACK_ORDER,
): Numbers {
  return { ...rankNumbers(trackSlot(slot, order).bossId, slot), ...table[slot] };
}

/**
 * The boss of a slot, built with `raidBossOf`: its numbers (`slotNumbers`: the table, else interpolated from the ranks), its cards at
 * the slot's strength, and only the rules the ramp column gives it (`SLOT_CARDS`). `level` is the roster level the boss names for its picks (the lab's creatures at that rank by default); the
 * path gives every creature its own level and does not read it. `table` replaces `SLOT_NUMBERS` (the tuner tries numbers this way).
 */
export function slotBoss(
  slot: number,
  roster: {
    readonly level?: number;
    readonly order?: readonly string[];
    readonly table?: SlotTable;
  } = {},
): BossDef {
  const s = trackSlot(slot, roster.order);
  return raidBossOf(s.bossId, {
    ...slotNumbers(slot, roster.table, roster.order),
    strengthBp: s.strengthBp,
    level: roster.level ?? rankLevel(slot),
    ...(s.rules.cards === undefined ? {} : { cards: s.rules.cards }),
    buildUp: s.rules.buildUp,
    ...(s.extraCards.length ? { extraCards: s.extraCards } : {}),
  });
}
