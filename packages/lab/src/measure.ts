/**
 * How the lab report measures a talent fairly (panel 3, finding 1): a finite boss, a score that
 * counts speed and knockouts, the best legal board with the talent against the best legal board
 * without it, and how often its condition holds on a board nobody picked for it.
 */
import { content, createSeededRng, int } from '@creatures/game';
import { labBoss, type CardDef } from './cards';
import { fight } from './fight';
import { FORM_KNACKS } from './knacks';
import { formStats, triggers } from './species';
import { CLASSIC_LINE, GAUNTLET, LEVEL, toPlacements, type Mode, type Pick } from './search';
import { TALENTS } from './talents';
import type { Placement } from './types';

/** Points of a fight's score (the weights add up to 100). */
export const SCORE_WEIGHTS = { damage: 50, win: 20, speed: 15, standing: 15 } as const;

/** What the score needs of one fight (a `FightResult` has all of it). */
export interface FightOutcome {
  readonly damage: number;
  readonly won: boolean;
  readonly knockouts: number;
  readonly killingBlow: { readonly round: number } | null;
}

/**
 * One fight's score, 0 to 100: half for the share of the boss's HP removed (capped at all of it), 20 for a win, up to 15
 * for how many rounds a win left unused (fewer rounds is better) and up to 15 for the share of creatures still
 * standing (a knockout costs 15 / creatures points).
 */
export function fightScore(
  r: FightOutcome,
  bossHp: number,
  bossRounds: number,
  creatures: number,
): number {
  const w = SCORE_WEIGHTS;
  const share = bossHp > 0 ? Math.min(1, r.damage / bossHp) : 0;
  const speed =
    r.won && r.killingBlow ? Math.max(0, bossRounds - r.killingBlow.round) / bossRounds : 0;
  const standing = creatures > 0 ? Math.max(0, creatures - r.knockouts) / creatures : 0;
  return w.damage * share + (r.won ? w.win : 0) + w.speed * speed + w.standing * standing;
}

/**
 * The boss HP at which `meanKillRound(hp)` (a mean that rises with HP) reaches `target`, by bisection on [lo, hi].
 * The report calibrates it once from the data, so the number follows the species and the rules.
 */
export function calibrateBossHp(
  meanKillRound: (hp: number) => number,
  target: number,
  lo: number,
  hi: number,
  iterations = 24,
): number {
  let a = lo,
    b = hi;
  for (let i = 0; i < iterations; i++) {
    const mid = (a + b) / 2;
    if (meanKillRound(mid) < target) a = mid;
    else b = mid;
  }
  return Math.round((a + b) / 2);
}

/** The gauntlet boss HP at which the classic line kills a plain boss in `target` rounds on average (no kill counts as rounds + 1). */
export function classicBossHp(target: number, seeds: number): number {
  const rounds = 10;
  const mean = (hp: number) => {
    const boss = labBoss({ rows: GAUNTLET.rows, cols: GAUNTLET.cols, atk: 110, hp, rounds });
    let sum = 0;
    for (let i = 0; i < seeds; i++) {
      const r = fight(boss, toPlacements(CLASSIC_LINE, GAUNTLET), {
        rng: createSeededRng(`calibrate:${i}`),
      });
      sum += r.won && r.killingBlow ? r.killingBlow.round : rounds + 1;
    }
    return sum / seeds;
  };
  return calibrateBossHp(mean, target, 1_000, 1_000_000);
}

/** The Knack the measured form carries on every board, with and without the talent. Only the Mire talents need one. */
export function knackForTalent(tid: string, form: string): string {
  if (tid !== 'heavy-hand' && tid !== 'clinging') return 'none';
  const wanted = formStats(form, LEVEL).role === 'guard' ? 'mud-wall' : 'squelch-song';
  return FORM_KNACKS[form]?.includes(wanted) ? wanted : 'none';
}

const firstKnack = (form: string) => FORM_KNACKS[form]?.[0] ?? 'none';

/**
 * A fitting gauntlet team for one form, with the form in its role's natural slot: a Setter in front of a Payoff that
 * cashes its mark, then Thornbuck; a Payoff after a Setter whose mark it cashes, then Thornbuck; a Guard in front of
 * Tidewing and Tempestray; a Support between them. The form's own pick has no Knack.
 */
export function teamFor(form: string): { team: Pick[]; slot: number } {
  const st = formStats(form, LEVEL);
  const stage2 = (role: string, ok: (el: string) => boolean) =>
    content.creatures.find((c) => c.role === role && c.stage === 2 && ok(c.element))?.id;
  const P = (f: string): Pick => ({ formId: f, knack: firstKnack(f) });
  const me: Pick = { formId: form, knack: 'none' };
  if (st.role === 'setter') {
    const partner = stage2('payoff', (el) => triggers(el, st.element)) ?? 'tempestray';
    return { team: [me, P(partner), P('thornbuck')], slot: 0 };
  }
  if (st.role === 'payoff') {
    const partner = stage2('setter', (el) => triggers(st.element, el)) ?? 'tidewing';
    return { team: [P(partner), me, P('thornbuck')], slot: 1 };
  }
  if (st.role === 'guard') return { team: [me, P('tidewing'), P('tempestray')], slot: 0 };
  return { team: [P('tidewing'), me, P('tempestray')], slot: 1 };
}

export interface Board {
  /** The line, the measured form among it. */
  readonly team: readonly Pick[];
  /** Where the measured form stands. */
  readonly slot: number;
}

const boardKey = (b: Board) => b.team.map((p) => `${p.formId}/${p.knack}`).join('|');

/**
 * The legal gauntlet boards for one form: the form in each of the three slots, with two fixed fitting partners in
 * either order, for two partner sets (the natural team's partners, and the classic trio's two other roles with the
 * classic Knacks). The first board is the natural one. One copy per form, so a partner that is the form itself is out.
 */
export function boardsFor(form: string): Board[] {
  const nat = teamFor(form);
  const me = nat.team[nat.slot] as Pick;
  const natPartners = nat.team.filter((_, i) => i !== nat.slot);
  const role = formStats(form, LEVEL).role;
  const classic = CLASSIC_LINE.filter(
    (p) => p.formId !== form && formStats(p.formId, LEVEL).role !== role,
  ).slice(0, 2);
  const out = new Map<string, Board>();
  const add = (b: Board) => {
    if (!out.has(boardKey(b))) out.set(boardKey(b), b);
  };
  add({ team: nat.team, slot: nat.slot });
  for (const set of [natPartners, classic]) {
    const [a, b] = set;
    if (!a || !b || set.some((p) => p.formId === form)) continue;
    for (const order of [
      [a, b],
      [b, a],
    ] as const)
      for (let slot = 0; slot < 3; slot++) {
        const team = [...order];
        team.splice(slot, 0, me);
        add({ team, slot });
      }
  }
  return [...out.values()];
}

/** Twelve wide: the raid's row (mixed classic creatures in order). */
export const ROW12: Mode = { id: 'raid', rows: 1, cols: 12, maxCopies: 4 };

export interface Cell {
  /** Mean score of the best board, and its mean knockouts per fight. */
  readonly score: number;
  readonly ko: number;
}

export interface FormMeasure {
  /** Per card: the best board with the talent, and the best board without it (each chosen on its own). */
  readonly withTalent: ReadonlyMap<string, Cell>;
  readonly without: ReadonlyMap<string, Cell>;
  /** Share of fights on the natural board in which the talent's condition held or its trigger fired; undefined for a flat stat. */
  readonly holdsNatural: number | undefined;
  /** The same in a row 12 wide, the form at a random slot among mixed classic creatures. */
  readonly holdsRow: number | undefined;
}

/** Effect fields that are plain stats (always on): no condition to count. */
const FLAT_FIELDS: ReadonlySet<string> = new Set(['atkBp', 'hpBp']);

export const isFlat = (tid: string): boolean =>
  Object.keys(TALENTS[tid]?.fx ?? {}).every((k) => FLAT_FIELDS.has(k));

export interface MeasureContext {
  readonly bossHp: number;
  readonly cards: readonly CardDef[];
  readonly seeds: number;
  readonly rowSeeds: number;
}

/** Runs the measurements and keeps what does not depend on the talent (the best board without it). */
export function createMeasurer(ctx: MeasureContext) {
  const rounds = 10;
  const bossOf = (cardId: string, hp: number, mode: Mode = GAUNTLET) =>
    labBoss({
      rows: mode.rows,
      cols: mode.cols,
      cards: [cardId],
      atk: mode.id === 'raid' ? 130 : 110,
      hp,
      rounds,
    });
  const bosses = new Map(ctx.cards.map((c) => [c.id, bossOf(c.id, ctx.bossHp)]));
  const withoutCache = new Map<string, Map<string, Cell>>();

  /** One board on one card, the form carrying `talents`: mean score, knockouts, and fights where `fireKeys` fired. */
  const runBoard = (
    board: Board,
    cardId: string,
    knack: string,
    talents: readonly string[],
    fireKeys: readonly string[],
  ): { score: number; ko: number; held: number } => {
    const boss = bosses.get(cardId);
    if (!boss) throw new Error(`unknown card ${cardId}`);
    const team = board.team.map((p, i) =>
      i === board.slot ? { ...p, knack, ...(talents.length ? { talents } : {}) } : p,
    );
    let score = 0,
      ko = 0,
      held = 0;
    for (let i = 0; i < ctx.seeds; i++) {
      const r = fight(boss, toPlacements(team, GAUNTLET), {
        rng: createSeededRng(`tal:${cardId}:${i}`),
      });
      score += fightScore(r, ctx.bossHp, rounds, team.length);
      ko += r.knockouts;
      const f = r.fighters[board.slot];
      if (fireKeys.some((k) => (f?.fires[k] ?? 0) > 0)) held++;
    }
    return { score: score / ctx.seeds, ko: ko / ctx.seeds, held: held / ctx.seeds };
  };

  const best = (a: Cell | undefined, b: Cell): Cell => (!a || b.score > a.score ? b : a);

  /** The best board without any talent, per card (shared by every talent of the form). */
  const without = (form: string, knack: string): Map<string, Cell> => {
    const key = `${form}|${knack}`;
    const cached = withoutCache.get(key);
    if (cached) return cached;
    const out = new Map<string, Cell>();
    for (const board of boardsFor(form))
      for (const c of ctx.cards) {
        const r = runBoard(board, c.id, knack, [], []);
        out.set(c.id, best(out.get(c.id), r));
      }
    withoutCache.set(key, out);
    return out;
  };

  const measure = (tid: string, form: string): FormMeasure => {
    const knack = knackForTalent(tid, form);
    const keys = Object.keys(TALENTS[tid]?.fx ?? {});
    const flat = isFlat(tid);
    const boards = boardsFor(form);
    const withTalent = new Map<string, Cell>();
    let held = 0;
    boards.forEach((board, bi) => {
      for (const c of ctx.cards) {
        const r = runBoard(board, c.id, knack, [tid], keys);
        withTalent.set(c.id, best(withTalent.get(c.id), r));
        if (bi === 0) held += r.held; // the natural board, every card
      }
    });
    // A row 12 wide: the form at a random slot among mixed classic creatures, on the plain card.
    let rowHeld = 0;
    const rowBoss = bossOf('plain', ctx.bossHp * 4, ROW12);
    for (let i = 0; i < ctx.rowSeeds; i++) {
      const rng = createSeededRng(`row:${tid}:${form}:${i}`);
      const slot = int(rng, ROW12.cols);
      const picks = Array.from(
        { length: ROW12.cols },
        (_, k) => CLASSIC_LINE[k % CLASSIC_LINE.length] as Pick,
      ).map((p, k) => (k === slot ? { formId: form, knack, talents: [tid] } : p));
      const r = fight(rowBoss, toPlacements(picks, ROW12), { rng });
      const f = r.fighters[slot];
      if (keys.some((k) => (f?.fires[k] ?? 0) > 0)) rowHeld++;
    }
    return {
      withTalent,
      without: without(form, knack),
      holdsNatural: flat ? undefined : held / (ctx.cards.length || 1),
      holdsRow: flat ? undefined : rowHeld / Math.max(1, ctx.rowSeeds),
    };
  };

  return { measure };
}

/** A gain as a percentage of the baseline, or undefined ("n/a") when the baseline is too small to divide by. */
export function gainPercent(
  withScore: number,
  withoutScore: number,
  minBase = 10,
): number | undefined {
  return withoutScore < minBase ? undefined : (withScore / withoutScore - 1) * 100;
}

/**
 * The talent that gains most on each card, and the talents that are best on more than half the cards.
 * `gains[tid][cardId]` is the gain in score points.
 */
export function bestOnMostCards(
  gains: ReadonlyMap<string, ReadonlyMap<string, number>>,
  cardIds: readonly string[],
): string[] {
  const wins = new Map<string, number>();
  for (const c of cardIds) {
    let top: string | undefined;
    let topGain = 0;
    for (const [tid, byCard] of gains) {
      const g = byCard.get(c);
      if (g !== undefined && (top === undefined || g > topGain)) {
        top = tid;
        topGain = g;
      }
    }
    if (top) wins.set(top, (wins.get(top) ?? 0) + 1);
  }
  return [...wins].filter(([, n]) => n * 2 > cardIds.length).map(([t]) => t);
}

// ---------- the raid row ----------

/** Three rows of twelve: the raid's board for the raid measurement (one creature of the form among classic ones). */
export const RAID_ROW: Mode = { id: 'raid', rows: 3, cols: 12, maxCopies: 36 };

/** The cards the raid boss carries: a row sweep (Wind-up) and a slam on the strongest Payoff, so Guard shapes have something to cover. */
const RAID_CARDS: readonly string[] = ['great-wave', 'payoff-hunter'];

/**
 * Talents measured on a raid row as well, and judged on that number: neighbour conditions, row ends, the front row,
 * long fights and Guard shapes live in a raid, not on three creatures.
 */
export const RAID_SHAPED: ReadonlySet<string> = new Set([
  'shoulder-to-shoulder',
  'odd-one-out',
  'edge-walker',
  'front-liner',
  'slow-burn',
  'finisher',
  'rally-cry',
  'flank-guard',
  'long-shadow',
  'kindred-boost',
]);

/**
 * What a raid measurement scores: the creature and the creatures within this many columns of it in its row. A talent's
 * reach is its neighbours (a Flank Guard reaches two slots), and one creature of 36 is too small a share of the raid's
 * damage to read through the noise of a fight (ten of 36 are knocked out), so the neighbourhood is what is scored.
 */
export const RAID_REACH = 2;

/** The neighbourhood is 2 * RAID_REACH + 1 creatures; the raid gain is scaled by that over 3 to read on the gauntlet's scale. */
export const RAID_SCALE = (2 * RAID_REACH + 1) / 3;

/** The slots (row, column) tried for the form in a raid row, besides one random slot: ends, near the ends, and the middle, in every row. */
export const RAID_SLOTS: readonly (readonly [number, number])[] = [0, 1, 2].flatMap((r) =>
  [0, 1, 2, 7, 11].map((c) => [r, c] as const),
);

/**
 * The creature of the form's own element that stands among the classic ones (a Payoff when the element has one, else
 * the first other form of it), so neighbour talents have kin to read; none of the classic three is ember or mire.
 */
export function kinFor(form: string): string {
  const el = formStats(form, LEVEL).element;
  const others = content.creatures.filter((c) => c.element === el && c.id !== form);
  const pick = others.find((c) => c.role === 'payoff') ?? others[0];
  return pick?.id ?? form;
}

/** The raid row's filler: the classic three in order, with one slot in four a creature of the form's own element. */
const raidFiller = (k: number, kin: string): Pick =>
  k % 4 === 3 ? { formId: kin, knack: 'none' } : (CLASSIC_LINE[k % CLASSIC_LINE.length] as Pick);

/** A raid row: classic creatures in order (a quarter of them kin of the form), `form` (with its Knack and talents) in one slot. */
export function raidPlacements(row: number, col: number, form: Pick): Placement[] {
  const slot = row * RAID_ROW.cols + col;
  const kin = kinFor(form.formId);
  const picks = Array.from({ length: RAID_ROW.rows * RAID_ROW.cols }, (_, k) =>
    k === slot ? form : raidFiller(k, kin),
  );
  return toPlacements(picks, RAID_ROW);
}

/** The raid boss's Great Wave comes this often (rounds). */
export const RAID_WAVE_EVERY = 2;

/** The raid boss: four players' worth of attack, with the raid cards. */
export function raidBoss(hp: number) {
  const boss = labBoss({
    rows: RAID_ROW.rows,
    cols: RAID_ROW.cols,
    cards: RAID_CARDS,
    atk: 130,
    hp,
    rounds: 10,
  });
  return {
    ...boss,
    moves: boss.moves.map((m) => (m.id === 'great-wave' ? { ...m, every: RAID_WAVE_EVERY } : m)),
  };
}

/**
 * The damage of the creatures in the neighbourhood of a slot, weighted like the search's score by how many of them still
 * stand. The neighbourhood is always `2 * RAID_REACH + 1` slots of the row: at a row end it is the nearest five, so the
 * creature is a fifth of it wherever it stands and the slots compare fairly.
 */
export function neighbourhoodScore(
  r: { readonly fighters: readonly { readonly damageDealt: number; readonly hp: number }[] },
  row: number,
  col: number,
): number {
  const width = 2 * RAID_REACH + 1;
  const start = Math.max(0, Math.min(col - RAID_REACH, RAID_ROW.cols - width));
  const near: { damageDealt: number; hp: number }[] = [];
  for (let c = start; c < start + width; c++) {
    const f = r.fighters[row * RAID_ROW.cols + c];
    if (f) near.push(f);
  }
  const damage = near.reduce((a, f) => a + f.damageDealt, 0);
  const standing = near.filter((f) => f.hp > 0).length / Math.max(1, near.length);
  return damage * (0.5 + 0.5 * standing);
}

/**
 * The raid boss's HP: the classic row removes `share` of it in ten rounds on average (never all, so a Finisher has its
 * last rounds and the fight is not decided by a win).
 */
export function raidBossHp(seeds: number, share = 0.9): number {
  const boss = raidBoss(1_000_000_000);
  const classic = Array.from(
    { length: RAID_ROW.rows * RAID_ROW.cols },
    (_, k) => CLASSIC_LINE[k % CLASSIC_LINE.length] as Pick,
  );
  let sum = 0;
  for (let i = 0; i < seeds; i++) {
    const r = fight(boss, toPlacements(classic, RAID_ROW), { rng: createSeededRng(`raidhp:${i}`) });
    sum += r.damage;
  }
  return Math.round(sum / seeds / share);
}

export interface RaidMeasure {
  /** The gain in percent at the best slot for the talent (the slot where it gains most, with and without on the same seeds). */
  readonly bestPct: number;
  /** The gain in percent at one random slot. */
  readonly randomPct: number;
}

/**
 * The raid measurement of a talent on a raid row: the form among classic creatures in a set of slots, with and without
 * the talent on the same seeds (so a slot is compared with itself, and the neighbours stay the same). The best slot is
 * the one where the talent gains most; one more slot is drawn at random. The score is the neighbourhood's damage.
 */
export function createRaidMeasurer(ctx: { readonly hp: number; readonly seeds: number }) {
  const boss = raidBoss(ctx.hp);
  const run = (row: number, col: number, pick: Pick, salt: string): number => {
    const placements = raidPlacements(row, col, pick);
    let score = 0;
    for (let i = 0; i < ctx.seeds; i++) {
      const r = fight(boss, placements, { rng: createSeededRng(`${salt}:${i}`) });
      score += neighbourhoodScore(r, row, col);
    }
    return score / ctx.seeds;
  };
  const withoutCache = new Map<string, number>();
  const withoutAt = (form: string, knack: string, r: number, c: number): number => {
    const key = `${form}|${knack}|${r}|${c}`;
    let v = withoutCache.get(key);
    if (v === undefined) {
      v = run(r, c, { formId: form, knack }, `raid:${form}:${r}:${c}`);
      withoutCache.set(key, v);
    }
    return v;
  };
  const measure = (tid: string, form: string): RaidMeasure => {
    const knack = knackForTalent(tid, form);
    const gainAt = (r: number, c: number): number => {
      const w = run(r, c, { formId: form, knack, talents: [tid] }, `raid:${form}:${r}:${c}`);
      return (w / withoutAt(form, knack, r, c) - 1) * 100;
    };
    const rng = createSeededRng(`raid-slot:${tid}:${form}`);
    const random = gainAt(int(rng, RAID_ROW.rows), int(rng, RAID_ROW.cols));
    let best = -Infinity;
    for (const [r, c] of RAID_SLOTS) best = Math.max(best, gainAt(r, c));
    return { bestPct: Math.max(best, random), randomPct: random };
  };
  return { measure };
}
