/**
 * The combat v2 prototype fight (docs/design/combat/proposals/001-combat-v2.md). Pure: no I/O, an
 * injected RNG. It is separate from the shipped engine on purpose: this is where the draft rules are
 * tried, measured and argued about before any of them reach `@creatures/engine`.
 *
 * A round (R8): round start (in slot order: Support verbs, then round-start Knacks; charged moves of
 * the round are announced), then for each row from the front: the row's creatures act left to
 * right, then the boss takes a turn. A boss turn is its due moves, its plain attack, then (Clean
 * Scales) the shedding of the marks that were on it when the turn began.
 */
import { chance, int } from '@creatures/game';
import { knack, type KnackFx } from './knacks';
import { LAB_RULES as R } from './rules';
import { ELEMENTS, formStats, matchupBp, triggers } from './species';
import type {
  BossDef,
  BossMove,
  FightEvent,
  FightOptions,
  FightResult,
  Fighter,
  Pattern,
  Placement,
} from './types';

interface Mark {
  stacks: number;
  age: number;
  sealed: boolean;
  /** Left by Leave a Trail: a reaction on it leaves no further trail (the chain cap, R5). */
  fromTrail: boolean;
  /** With Fizzle, a mark left by a reaction cannot be cashed until this many boss turns have passed. */
  cashableAfterTurns: number;
}

interface State {
  readonly boss: BossDef;
  readonly opts: FightOptions;
  readonly fighters: Fighter[];
  bossHp: number;
  marks: Map<string, Mark>;
  markAge: number;
  mired: number;
  round: number;
  turn: number;
  bossTurnsDone: number;
  reflectArmed: boolean;
  /** Targets of this round's charged moves, rolled when announced at round start (by move id). */
  announced: Map<string, Fighter[]>;
  readonly events: FightEvent[];
  readonly count: {
    reactions: number;
    blocked: number;
    dodges: number;
    intercepts: number;
    healed: number;
    damage: number;
  };
  readonly byMark: Record<string, number>;
}

const fx = (f: Fighter): KnackFx => (f.silencedTurns > 0 ? {} : (knack(f.knack)?.fx ?? {}));
/** Silence blanks the creature: its Knack and its role's verb (Misa, 2026-10-26). Stats still work. */
const silenced = (f: Fighter) => f.silencedTurns > 0;
const armourOf = (f: Fighter) => f.baseArmour + (fx(f).armourBonus ?? 0);
const alive = (s: State) => s.fighters.filter((f) => f.hp > 0);
const bySlot = (a: Fighter, b: Fighter) => a.row - b.row || a.col - b.col;
const roll = (s: State, bp: number) => bp > 0 && chance(s.opts.rng, Math.min(bp, 10_000), 10_000);
const log = (s: State, kind: string, text: string) => {
  if (s.opts.log) s.events.push({ round: s.round, turn: s.turn, kind, text });
};

export function placeFighters(placements: readonly Placement[]): Fighter[] {
  return placements.map((p, i) => {
    const st = formStats(p.formId, p.level);
    const k = p.knack === 'none' ? undefined : p.knack;
    return {
      uid: `${p.owner}:${p.formId}:${i}`,
      owner: p.owner,
      formId: p.formId,
      name: st.name,
      element: st.element,
      role: st.role,
      maxHp: st.hp,
      hp: st.hp,
      atk: st.atk,
      spd: st.spd,
      baseArmour: st.armour,
      knack: k,
      row: p.row,
      col: p.col,
      silencedTurns: 0,
      store: 0,
      boostBp: 0,
      undodgeable: false,
      firstInterceptDone: false,
      damageDealt: 0,
      damageThisRound: 0,
      damageLastRound: 0,
      lastStoreTurn: -1,
    };
  });
}

/** Creatures beside `f` in its row, within `reach` columns, living. */
function beside(s: State, f: Fighter, reach = 1): Fighter[] {
  return alive(s).filter((o) => o !== f && o.row === f.row && Math.abs(o.col - f.col) <= reach);
}

function addMark(
  s: State,
  element: string,
  stacks: number,
  opts: { sealed?: boolean; fromTrail?: boolean; fizzle?: boolean } = {},
): void {
  const m = s.marks.get(element);
  const after = opts.fizzle && s.boss.mods.fizzle ? s.bossTurnsDone + 1 : 0;
  if (m) {
    m.stacks = Math.min(R.maxStacks, m.stacks + stacks);
    // A mark is sealed if any of its counts was left sealed (R8).
    m.sealed ||= opts.sealed ?? false;
    m.cashableAfterTurns = Math.max(m.cashableAfterTurns, after);
  } else {
    s.marks.set(element, {
      stacks: Math.min(R.maxStacks, stacks),
      age: s.markAge++,
      sealed: opts.sealed ?? false,
      fromTrail: opts.fromTrail ?? false,
      cashableAfterTurns: after,
    });
  }
  log(s, 'mark', `${element} x${s.marks.get(element)?.stacks ?? 0}`);
}

function heal(s: State, target: Fighter, amountBp: number, critOk = true): void {
  if (target.hp <= 0) return;
  let amt = Math.floor((target.maxHp * amountBp) / 10_000);
  if (critOk && roll(s, R.critChanceBp)) amt = Math.floor((amt * R.critBp) / 10_000);
  amt = Math.floor((amt * (s.boss.mods.healBp ?? 10_000)) / 10_000);
  const real = Math.min(amt, target.maxHp - target.hp);
  target.hp += real;
  s.count.healed += real;
}

// ---------- round start ----------

function roundStart(s: State): void {
  for (const f of [...alive(s)].sort(bySlot)) {
    const k = fx(f);
    if (f.role === 'support' && !silenced(f)) supportVerb(s, f, k);
    if (k.miresAtStart) s.mired = Math.min(R.miredMaxStacks, s.mired + 1);
  }
  // Charged moves due this round are announced now: their slots are rolled and shown (R8).
  s.announced = new Map();
  for (const m of s.boss.moves) {
    if (m.charged && s.round % m.every === 0) s.announced.set(m.id, targetsOf(s, m.pattern, false));
  }
}

function supportVerb(s: State, f: Fighter, k: KnackFx): void {
  const boost = f.element === 'ember' ? R.supportBoostEmberBp : R.supportBoostBp;
  const healBp = R.supportHealBp[f.element] ?? 0;
  switch (k.support) {
    case 'readyMark':
      addMark(s, f.element, 1);
      return;
    case 'clearSkies':
      for (const o of beside(s, f)) o.undodgeable = true;
      return;
    case 'sunbeam':
      for (const o of alive(s).filter((o) => o.col === f.col && o.row < f.row)) {
        o.boostBp += boost;
        heal(s, o, Math.max(healBp, 600));
      }
      return;
    default: {
      for (const o of beside(s, f)) {
        o.boostBp += boost;
        if (healBp) heal(s, o, k.support === 'curlUp' && o.hp * 2 < o.maxHp ? healBp * 3 : healBp);
      }
      if (k.support === 'wideWarmth')
        for (const o of beside(s, f, 2).filter((o) => Math.abs(o.col - f.col) === 2))
          o.boostBp += boost - 1_000;
      if (k.support === 'gatherCalm' && f.store >= 3) {
        for (const o of beside(s, f)) o.boostBp += 4_500;
        f.store = 0;
      }
    }
  }
}

// ---------- a creature's turn (R6) ----------

function creatureHit(s: State, f: Fighter, shareBp: number): void {
  const k = fx(f);
  // 1. Plain damage: Attack, the element chart, boosts (capped, R15), the Knack's share, a crit.
  const bonusSum = Math.min(R.maxHitBonusBp, f.boostBp);
  const base = Math.floor((f.atk * matchupBp(f.element, s.boss.element)) / 10_000);
  let plain = k.noDamage
    ? 0
    : Math.floor((((base * (10_000 + bonusSum)) / 10_000) * shareBp * (k.plainBp ?? 10_000)) / 1e8);
  if (plain > 0 && roll(s, R.critChanceBp)) plain = Math.floor((plain * R.critBp) / 10_000);
  // 2. The boss rolls dodge (14.4). A hit that deals no damage is not rolled. Setup never misses.
  const bossDodge = f.undodgeable
    ? 0
    : Math.max(
        0,
        Math.min(R.dodgeMaxBp, s.boss.spd * R.dodgePerSpdBp - s.mired * R.miredPerStackBp),
      );
  const dodged = !k.noDamage && roll(s, bossDodge);
  if (dodged) {
    s.count.dodges++;
    log(s, 'boss-dodge', `${s.boss.name} dodges ${f.name}`);
  }
  // 3. Reaction (R5): only a Payoff cashes; of the marks this hit may cash, the oldest.
  let bonus = 0;
  let reacted = false;
  if (!dodged && !k.noDamage && f.role === 'payoff' && !silenced(f)) {
    const cand = [...s.marks.entries()]
      .filter(
        ([el, m]) =>
          triggers(f.element, el) &&
          m.stacks >= (k.minStacks ?? 1) &&
          s.bossTurnsDone >= m.cashableAfterTurns,
      )
      .sort((a, b) => a[1].age - b[1].age)[0];
    if (cand) {
      const [el, mark] = cand;
      const spent = k.spendAllBp !== undefined ? mark.stacks : 1;
      // The bonus factor (R7): the Knack's own factor, extra counts, Baked Shell; capped together.
      let factor = ((k.bonusBp ?? 10_000) * (10_000 + (spent - 1) * (k.spendAllBp ?? 0))) / 10_000;
      const shell = beside(s, f).find((o) => fx(o).bakedShell && o.store >= 3);
      if (shell) {
        factor *= 2;
        shell.store = 0;
      }
      factor = Math.min(factor, R.maxBonusFactorBp);
      bonus = Math.floor((((plain * (R.payoffMultBp - 10_000)) / 10_000) * factor) / 10_000);
      if (s.opts.resistReaction === el) bonus = Math.floor(bonus / 2);
      mark.stacks -= spent;
      if (mark.stacks <= 0) s.marks.delete(el);
      reacted = true;
      s.count.reactions++;
      s.byMark[el] = (s.byMark[el] ?? 0) + 1;
      log(s, 'reaction', `${f.name} cashes ${el} x${spent} for +${bonus}`);
      for (const o of alive(s)) {
        const ok = fx(o);
        if (ok.support === 'gatherCalm' && o.lastStoreTurn !== s.bossTurnsDone) {
          o.store = Math.min(3, o.store + 1);
          o.lastStoreTurn = s.bossTurnsDone;
        }
        if (ok.healOnReactionBp && o.element === el) heal(s, f, ok.healOnReactionBp, false);
        if (ok.support === 'clearAir' && beside(s, o).includes(f)) {
          heal(s, f, 1_000, false);
          f.silencedTurns = 0;
        }
      }
      if (s.boss.mods.reflectFirst && s.reflectArmed) {
        s.reflectArmed = false;
        log(s, 'reflect', `${s.boss.name} reflects ${bonus} at ${f.name}`);
        takeHit(s, f, bonus, 'reflected');
        bonus = 0;
      }
      // Leave a Trail: one link per chain, so a reaction on a trail mark leaves no trail.
      if (k.trail && !mark.fromTrail)
        addMark(s, f.element, 1, { sealed: k.seal ?? false, fromTrail: true, fizzle: true });
    }
  }
  // 4. Cap, then armour: at or below armour the hit is Blocked (R13). A spent mark stays spent.
  if (!dodged && !k.noDamage) {
    const pierce = Math.max(0, ...beside(s, f).map((o) => fx(o).pierceBesideBp ?? 0));
    const armour = Math.floor((s.boss.armour * (10_000 - pierce)) / 10_000);
    let dmg = plain + bonus;
    if (s.boss.mods.capPerHit !== undefined) dmg = Math.min(dmg, s.boss.mods.capPerHit);
    dmg -= armour;
    if (dmg <= 0) {
      s.count.blocked++;
      log(s, 'blocked', `${f.name}'s hit is Blocked`);
      dmg = 0;
    }
    dmg = Math.min(dmg, s.bossHp);
    s.bossHp -= dmg;
    s.count.damage += dmg;
    f.damageDealt += dmg;
    f.damageThisRound += dmg;
  }
  // 5. Mark (R4): a hit that set off a reaction leaves no mark by the base rules.
  if (!reacted) {
    const marksAs = k.marksAs ?? (f.role === 'setter' && !silenced(f) ? 'own' : undefined);
    if (marksAs) {
      const el =
        marksAs === 'own' ? f.element : (ELEMENTS.find((m) => triggers(f.element, m)) ?? f.element);
      let stacks = k.markStacks ?? 1;
      if (k.storeDodgeStacks && f.store >= 3) {
        stacks += k.storeDodgeStacks;
        f.store = 0;
      }
      if (k.markOthers)
        for (const [other, m] of s.marks)
          if (other !== el) m.stacks = Math.min(R.maxStacks, m.stacks + 1);
      addMark(s, el, stacks, { sealed: k.seal ?? false });
      if (k.leadBoostBp) {
        const next = alive(s)
          .filter((o) => o.row === f.row && o.col > f.col)
          .sort((a, b) => a.col - b.col)[0];
        if (next) next.boostBp += k.leadBoostBp;
      }
    }
  }
}

function creatureTurn(s: State, f: Fighter): void {
  if (f.hp <= 0 || s.bossHp <= 0) return;
  const k = fx(f);
  const hits = k.twinStrikeBp ? [k.twinStrikeBp, k.twinStrikeBp] : [10_000];
  for (const share of hits) if (s.bossHp > 0) creatureHit(s, f, share);
  f.boostBp = 0;
  // Silence lasts until the end of the creature's Nth turn (R12).
  if (f.silencedTurns > 0) f.silencedTurns--;
}

// ---------- the boss's turn ----------

function anchorOf(s: State, p: Pattern): Fighter | undefined {
  const live = alive(s);
  if (live.length === 0) return undefined;
  // "Strongest" is the highest Attack; ties go to the front, then the left.
  const strongest = (xs: Fighter[]) => [...xs].sort((a, b) => b.atk - a.atk || bySlot(a, b))[0];
  switch (p.anchor) {
    case 'front':
      return [...live].sort(bySlot)[0];
    case 'strongest':
      return strongest(live);
    case 'payoff':
      return strongest(live.filter((f) => f.role === 'payoff')) ?? strongest(live);
    case 'random':
      return live[int(s.opts.rng, live.length)];
    case 'grudge':
      // Last round's top hitter; in round 1, the strongest.
      return s.round === 1
        ? strongest(live)
        : [...live].sort((a, b) => b.damageLastRound - a.damageLastRound || bySlot(a, b))[0];
  }
}

/** The slots a pattern covers, as the living creatures standing in them (R2: targets are slots). */
function targetsOf(s: State, p: Pattern, plain: boolean): Fighter[] {
  const live = alive(s);
  // Taunt becomes the anchor of every plain attack, whatever its anchor (R9).
  const taunter = plain ? live.filter((f) => fx(f).taunt).sort(bySlot)[0] : undefined;
  const a = taunter ?? anchorOf(s, p);
  if (!a) return [];
  switch (p.shape) {
    case 'single':
      return [a];
    case 'line3':
      // The anchor first: it takes the aimed hit, its neighbours the area hits (R2).
      return [a, ...live.filter((f) => f !== a && f.row === a.row && Math.abs(f.col - a.col) <= 1)];
    case 'row':
      return live.filter((f) => f.row === a.row);
    case 'randomRow': {
      const rows = [...new Set(live.map((f) => f.row))];
      const r = rows[int(s.opts.rng, rows.length)];
      return live.filter((f) => f.row === r);
    }
    case 'column':
      return live.filter((f) => f.col === a.col);
    case 'all':
      return live;
    case 'rowEnds': {
      const n = p.n ?? 1;
      const out = new Set<Fighter>();
      for (const r of new Set(live.map((f) => f.row))) {
        const row = live.filter((f) => f.row === r).sort((x, y) => x.col - y.col);
        row.slice(0, n).forEach((f) => out.add(f));
        row.slice(-n).forEach((f) => out.add(f));
      }
      return [...out];
    }
  }
}

function dodgeOf(f: Fighter, area: boolean): number {
  const base = Math.min(R.dodgeMaxBp, f.spd * R.dodgePerSpdBp + (fx(f).dodgeBonusBp ?? 0));
  return area ? Math.floor((base * R.areaDodgeShareBp) / 10_000) : base;
}

const reachOf = (g: Fighter) => R.guardReach + (fx(g).reachBonus ?? 0);

/** Damage lands on a creature: reductions, armour, then Blocked or HP (R13), then hit-taken effects. */
function takeHit(
  s: State,
  taker: Fighter,
  proposed: number,
  how: 'aimed' | 'area' | 'charged' | 'reflected',
): void {
  let dmg = proposed;
  if (how === 'area' || how === 'charged') {
    const ward = Math.max(
      0,
      ...alive(s)
        .filter((o) => o.row === taker.row)
        .map((o) => fx(o).rowAreaCutBp ?? 0),
    );
    dmg = Math.floor((dmg * (10_000 - ward)) / 10_000);
    const covered =
      taker.role !== 'guard' &&
      alive(s).some(
        (g) =>
          g.role === 'guard' &&
          !silenced(g) &&
          g !== taker &&
          g.row === taker.row &&
          Math.abs(g.col - taker.col) <= reachOf(g),
      );
    if (covered) dmg = Math.floor((dmg * (10_000 - R.coverBp)) / 10_000);
  }
  dmg -= armourOf(taker);
  // Mud Wall counts every hit it takes, Blocked or not.
  if (fx(taker).miresOnHit) s.mired = Math.min(R.miredMaxStacks, s.mired + 1);
  if (dmg <= 0) {
    s.count.blocked++;
    log(s, 'blocked', `${taker.name} blocks the hit`);
    return;
  }
  taker.hp = Math.max(0, taker.hp - dmg);
  log(s, 'hit', `${taker.name} takes ${dmg}${taker.hp === 0 ? ' and is knocked out' : ''}`);
  for (const g of alive(s)) {
    if (fx(g).bakedShell && g.row === taker.row && Math.abs(g.col - taker.col) <= reachOf(g))
      g.store = Math.min(3, g.store + 1);
  }
}

function bossHits(
  s: State,
  move: Pick<BossMove, 'id' | 'pattern' | 'powerBp' | 'silenceTurns' | 'charged'>,
  plain: boolean,
): void {
  const targets =
    (move.charged ? s.announced.get(move.id) : undefined) ?? targetsOf(s, move.pattern, plain);
  const shape = move.pattern.shape;
  const proposed = Math.floor(
    (((s.boss.atk * move.powerBp) / 10_000) * (10_000 - s.mired * R.miredPerStackBp)) / 10_000,
  );
  for (const t of targets) {
    if (t.hp <= 0) continue;
    const area = !(shape === 'single' || (shape === 'line3' && t === targets[0]));
    // A move that deals no damage is not dodged or intercepted (R1).
    if (move.silenceTurns) {
      t.silencedTurns = Math.max(t.silencedTurns, move.silenceTurns);
      log(s, 'silence', `${t.name} is silenced`);
      continue;
    }
    // R1: the target rolls dodge first; a charged landing rolls at full chance.
    if (roll(s, dodgeOf(t, area && !move.charged))) {
      s.count.dodges++;
      log(s, 'dodge', `${t.name} dodges`);
      const k = fx(t);
      if (k.retaliateBp) {
        const back = Math.max(0, Math.floor((t.atk * k.retaliateBp) / 10_000) - s.boss.armour);
        s.bossHp = Math.max(0, s.bossHp - back);
        s.count.damage += back;
        t.damageDealt += back;
        t.damageThisRound += back;
      }
      if (k.storeDodgeStacks) t.store = Math.min(3, t.store + 1);
      continue;
    }
    // Only if the dodge failed: a Guard in reach intercepts (aimed hits; area or charged with a Knack).
    let taker = t;
    if (t.role !== 'guard') {
      const guard = alive(s)
        .filter(
          (g) =>
            g.role === 'guard' &&
            !silenced(g) &&
            !fx(g).noIntercept &&
            g !== t &&
            g.row === t.row &&
            Math.abs(g.col - t.col) <= reachOf(g),
        )
        .filter((g) => !area || fx(g).interceptArea || (move.charged && fx(g).interceptCharged))
        .sort((a, b) => Math.abs(a.col - t.col) - Math.abs(b.col - t.col) || a.col - b.col)[0];
      const watch = move.charged
        ? alive(s).find((g) => g.row === t.row && g !== t && fx(g).interceptCharged)
        : undefined;
      const by = guard ?? watch;
      if (by) {
        taker = by;
        s.count.intercepts++;
        log(s, 'intercept', `${by.name} intercepts for ${t.name}`);
        if (fx(by).primeOnFirstIntercept && !by.firstInterceptDone) {
          by.firstInterceptDone = true;
          addMark(s, by.element, 1);
        }
      }
    }
    takeHit(s, taker, proposed, move.charged ? 'charged' : area ? 'area' : 'aimed');
  }
}

function bossTurn(s: State, turn: number): void {
  if (s.bossHp <= 0) return;
  s.turn = turn;
  const ageAtStart = s.markAge;
  const last = s.boss.rows - 1;
  for (const m of s.boss.moves) {
    if (s.round % m.every === 0 && (m.turn ?? last) === turn) {
      log(s, 'move', m.name);
      bossHits(s, m, false);
    }
  }
  for (let i = 0; i < (s.boss.plain.hits ?? 1); i++)
    bossHits(
      s,
      { id: 'plain', pattern: s.boss.plain.pattern, powerBp: s.boss.plain.powerBp },
      true,
    );
  // Clean Scales sheds the marks that were on the boss when this turn began, unless sealed (R8).
  if (s.boss.mods.shedMarks)
    for (const [el, m] of s.marks) if (!m.sealed && m.age < ageAtStart) s.marks.delete(el);
  s.bossTurnsDone++;
  s.reflectArmed = true;
}

/** One fight: the boss, the placed creatures, and the rounds of R8. */
export function fight(
  boss: BossDef,
  placements: readonly Placement[],
  opts: FightOptions,
): FightResult {
  const fighters = placeFighters(placements);
  if (opts.carryHp) for (const f of fighters) f.hp = opts.carryHp.get(f.uid) ?? f.hp;
  const s: State = {
    boss,
    opts,
    fighters,
    bossHp: opts.bossHp ?? boss.hp,
    marks: new Map(),
    markAge: 0,
    mired: 0,
    round: 0,
    turn: 0,
    bossTurnsDone: 0,
    // Reflective Hide arms after each boss turn, so not before the first one.
    reflectArmed: false,
    announced: new Map(),
    events: [],
    count: { reactions: 0, blocked: 0, dodges: 0, intercepts: 0, healed: 0, damage: 0 },
    byMark: {},
  };
  const startAlive = alive(s).length;
  for (s.round = 1; s.round <= boss.rounds && s.bossHp > 0 && alive(s).length > 0; s.round++) {
    for (const f of fighters) {
      f.undodgeable = false;
      f.damageLastRound = f.damageThisRound;
      f.damageThisRound = 0;
    }
    s.turn = 0;
    roundStart(s);
    // The boss takes a turn after every row of the arena, empty or not.
    for (let r = 0; r < boss.rows && s.bossHp > 0 && alive(s).length > 0; r++) {
      for (const f of alive(s)
        .filter((x) => x.row === r)
        .sort((a, b) => a.col - b.col))
        creatureTurn(s, f);
      bossTurn(s, r);
    }
  }
  return {
    damage: s.count.damage,
    bossHpLeft: s.bossHp,
    won: s.bossHp <= 0,
    wiped: alive(s).length === 0,
    knockouts: startAlive - alive(s).length,
    reactions: s.count.reactions,
    reactionsByMark: s.byMark,
    blocked: s.count.blocked,
    dodges: s.count.dodges,
    intercepts: s.count.intercepts,
    healed: s.count.healed,
    hpLeft: new Map(fighters.map((f) => [f.uid, f.hp])),
    fighters,
    events: s.events,
  };
}

/**
 * A raid weekend with attrition (R14): stages share the boss's HP; creatures keep their HP between
 * stages, nobody heals between them, and a knocked-out creature stays out (its owner may bring a
 * replacement from `bench`, which takes the empty slot). Only HP carries: marks, Stores, Mired and
 * "each fight" effects start fresh each stage. From stage 2 an adapting boss resists the reaction
 * used most so far.
 */
export function weekend(
  boss: BossDef,
  placements: readonly Placement[],
  bench: readonly Placement[],
  opts: FightOptions & { readonly stages?: number },
): { readonly stages: FightResult[]; readonly won: boolean; readonly replacements: number } {
  const stages: FightResult[] = [];
  let current = [...placements];
  const benchLeft = [...bench];
  // Carried HP is keyed by the uids of the next stage's fighters (see below).
  let hp = new Map<string, number>();
  let bossHp = boss.hp;
  let replacements = 0;
  const used: Record<string, number> = {};
  for (let i = 0; i < (opts.stages ?? 3) && bossHp > 0; i++) {
    const top = Object.entries(used).sort((a, b) => b[1] - a[1])[0]?.[0];
    const resist = boss.mods.adapts && i > 0 ? top : undefined;
    const res = fight(boss, current, {
      ...opts,
      carryHp: hp,
      bossHp,
      ...(resist ? { resistReaction: resist } : {}),
    });
    stages.push(res);
    bossHp = res.bossHpLeft;
    for (const [el, n] of Object.entries(res.reactionsByMark)) used[el] = (used[el] ?? 0) + n;
    const next: Placement[] = [];
    res.fighters.forEach((f, idx) => {
      const p = current[idx];
      if (!p) return;
      if (f.hp > 0) next.push(p);
      else {
        const j = benchLeft.findIndex((b) => b.owner === p.owner);
        if (j >= 0) {
          const [rep] = benchLeft.splice(j, 1);
          if (rep) {
            next.push({ ...rep, row: p.row, col: p.col });
            replacements++;
          }
        }
      }
    });
    const nextFighters = placeFighters(next);
    const carried = new Map<string, number>();
    nextFighters.forEach((nf) => {
      const prev = res.fighters.find(
        (f) =>
          f.owner === nf.owner &&
          f.formId === nf.formId &&
          f.row === nf.row &&
          f.col === nf.col &&
          f.hp > 0,
      );
      carried.set(nf.uid, prev ? prev.hp : nf.maxHp);
    });
    hp = carried;
    current = next;
  }
  return { stages, won: bossHp <= 0, replacements };
}
