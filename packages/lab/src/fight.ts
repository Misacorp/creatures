/**
 * The combat v2 prototype fight (docs/design/combat/proposals/001-combat-v2.md). Pure: no I/O, an
 * injected RNG. It is separate from the shipped engine on purpose: this is where the draft rules are
 * tried, measured and argued about before any of them reach `@creatures/engine`.
 *
 * A round (R8): round start (Supports, start-of-round Knacks), then for each row from the front:
 * the row's creatures act left to right, then the boss takes a turn. A boss turn is its due moves,
 * then its plain attack, then (Clean Scales) the shedding of marks.
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
  reflectArmed: boolean;
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
const alive = (s: State) => s.fighters.filter((f) => f.hp > 0);
const roll = (s: State, bp: number) => bp > 0 && chance(s.opts.rng, Math.min(bp, 10_000), 10_000);
const log = (s: State, kind: string, text: string) => {
  if (s.opts.log) s.events.push({ round: s.round, turn: s.turn, kind, text });
};

export function placeFighters(placements: readonly Placement[]): Fighter[] {
  return placements.map((p, i) => {
    const st = formStats(p.formId, p.level);
    const k = p.knack ?? undefined;
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
      armour: st.armour + (knack(k)?.fx.armourBonus ?? 0),
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
    };
  });
}

/** Creatures beside `f` in its row, within `reach` columns, living. */
function beside(s: State, f: Fighter, reach = 1): Fighter[] {
  return alive(s).filter((o) => o !== f && o.row === f.row && Math.abs(o.col - f.col) <= reach);
}

function addMark(s: State, element: string, stacks: number, sealed: boolean): void {
  const m = s.marks.get(element);
  if (m) {
    m.stacks = Math.min(R.maxStacks, m.stacks + stacks);
    m.sealed ||= sealed;
  } else {
    s.marks.set(element, { stacks: Math.min(R.maxStacks, stacks), age: s.markAge++, sealed });
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

function supportsAct(s: State): void {
  for (const f of alive(s)) {
    const k = fx(f);
    if (k.miresAtStart) s.mired = Math.min(R.miredMaxStacks, s.mired + 1);
    if (f.role !== 'support') continue;
    const boost = f.element === 'ember' ? R.supportBoostEmberBp : R.supportBoostBp;
    const healBp = R.supportHealBp[f.element] ?? 0;
    switch (k.support) {
      case 'readyMark':
        addMark(s, f.element, 1, false);
        continue;
      case 'clearSkies':
        for (const o of beside(s, f)) o.undodgeable = true;
        continue;
      case 'sunbeam':
        for (const o of alive(s).filter((o) => o.col === f.col && o.row < f.row)) {
          o.boostBp += boost;
          heal(s, o, Math.max(healBp, 600));
        }
        continue;
      default: {
        for (const o of beside(s, f)) {
          o.boostBp += boost;
          if (healBp)
            heal(s, o, k.support === 'curlUp' && o.hp * 2 < o.maxHp ? healBp * 3 : healBp);
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
}

// ---------- a creature's turn ----------

function creatureHit(s: State, f: Fighter, shareBp: number): void {
  const k = fx(f);
  const bonusSum = Math.min(R.maxHitBonusBp, f.boostBp);
  const base = Math.floor((f.atk * matchupBp(f.element, s.boss.element)) / 10_000);
  let plain = k.noDamage
    ? 0
    : Math.floor((((base * (10_000 + bonusSum)) / 10_000) * shareBp * (k.plainBp ?? 10_000)) / 1e8);
  if (plain > 0 && roll(s, R.critChanceBp)) plain = Math.floor((plain * R.critBp) / 10_000);
  // The boss rolls dodge against the hit (14.4). Setup never misses: a Setter still marks.
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
  // Reaction step (R5): only a Payoff cashes marks; one reaction per hit, the oldest mark first.
  let bonus = 0;
  let reacted = false;
  if (!dodged && !k.noDamage && f.role === 'payoff') {
    const cand = [...s.marks.entries()]
      .filter(([el]) => triggers(f.element, el))
      .sort((a, b) => a[1].age - b[1].age)[0];
    if (cand && cand[1].stacks >= (k.minStacks ?? 1)) {
      const [el, mark] = cand;
      const spent = k.spendAllBp !== undefined ? mark.stacks : 1;
      const extra = (spent - 1) * (k.spendAllBp ?? R.extraStackBp);
      bonus = Math.floor(
        (((((plain * (R.payoffMultBp - 10_000)) / 10_000) * (k.bonusBp ?? 10_000)) / 10_000) *
          (10_000 + extra)) /
          10_000,
      );
      if (s.opts.resistReaction === el) bonus = Math.floor(bonus / 2);
      for (const o of beside(s, f)) {
        if (fx(o).bakedShell && o.store >= 3) {
          bonus *= 2;
          o.store = 0;
        }
      }
      mark.stacks -= spent;
      if (mark.stacks <= 0) s.marks.delete(el);
      reacted = true;
      s.count.reactions++;
      s.byMark[el] = (s.byMark[el] ?? 0) + 1;
      log(s, 'reaction', `${f.name} cashes ${el} x${spent} for +${bonus}`);
      for (const o of alive(s)) {
        const ok = fx(o);
        if (ok.support === 'gatherCalm') o.store = Math.min(3, o.store + 1);
        if (ok.healOnReactionBp && o.element === el) heal(s, f, ok.healOnReactionBp, false);
        if (ok.support === 'clearAir' && beside(s, o).includes(f)) {
          heal(s, f, 1_000, false);
          f.silencedTurns = 0;
        }
      }
      if (s.boss.mods.reflectFirst && s.reflectArmed) {
        s.reflectArmed = false;
        takeHit(s, f, bonus, 'reflected');
        log(s, 'reflect', `${s.boss.name} reflects ${bonus} at ${f.name}`);
        bonus = 0;
      }
      if (k.trail) addMark(s, f.element, 1, k.seal ?? false);
    }
  }
  // Damage: one hit, minus the boss's armour; at or below armour it is Blocked (R13).
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
  // Mark step (R4): a hit that set off a reaction leaves no mark by the base rules.
  if (!reacted) {
    const marksAs = k.marksAs ?? (f.role === 'setter' ? 'own' : undefined);
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
      addMark(s, el, stacks, k.seal ?? false);
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
  if (f.silencedTurns > 0) f.silencedTurns--;
}

// ---------- the boss's turn ----------

function anchorOf(s: State, p: Pattern): Fighter | undefined {
  const live = alive(s);
  if (live.length === 0) return undefined;
  const front = () => [...live].sort((a, b) => a.row - b.row || a.col - b.col)[0];
  const strongest = (xs: Fighter[]) =>
    [...xs].sort((a, b) => b.atk - a.atk || a.row - b.row || a.col - b.col)[0];
  switch (p.anchor) {
    case 'front':
      return front();
    case 'strongest':
      return strongest(live);
    case 'payoff':
      return strongest(live.filter((f) => f.role === 'payoff')) ?? strongest(live);
    case 'random':
      return live[int(s.opts.rng, live.length)];
    case 'grudge':
      return [...live].sort((a, b) => b.damageThisRound - a.damageThisRound || b.atk - a.atk)[0];
  }
}

/** The slots a pattern covers, as the living creatures standing in them (R2: targets are slots). */
function targetsOf(s: State, p: Pattern, plain: boolean): Fighter[] {
  const live = alive(s);
  let anchor = anchorOf(s, p);
  if (plain && p.anchor === 'front') {
    const taunter = live
      .filter((f) => fx(f).taunt)
      .sort((a, b) => a.row - b.row || a.col - b.col)[0];
    if (taunter) anchor = taunter;
  }
  if (!anchor) return [];
  const a = anchor;
  switch (p.shape) {
    case 'single':
      return [a];
    case 'line3':
      return live.filter((f) => f.row === a.row && Math.abs(f.col - a.col) <= 1);
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

/** Damage lands on a creature: armour, then Blocked or HP (R13), then hit-taken effects. */
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
    const coveringGuard =
      taker.role !== 'guard' &&
      alive(s).some(
        (g) =>
          g.role === 'guard' &&
          g !== taker &&
          g.row === taker.row &&
          Math.abs(g.col - taker.col) <= R.guardReach + (fx(g).reachBonus ?? 0),
      );
    if (coveringGuard) dmg = Math.floor((dmg * (10_000 - R.coverBp)) / 10_000);
  }
  dmg -= taker.armour;
  if (dmg <= 0) {
    s.count.blocked++;
    log(s, 'blocked', `${taker.name} blocks the hit`);
    return;
  }
  taker.hp = Math.max(0, taker.hp - dmg);
  log(s, 'hit', `${taker.name} takes ${dmg}${taker.hp === 0 ? ' and is knocked out' : ''}`);
  if (fx(taker).miresOnHit) s.mired = Math.min(R.miredMaxStacks, s.mired + 1);
  for (const g of alive(s)) {
    if (
      fx(g).bakedShell &&
      g.row === taker.row &&
      Math.abs(g.col - taker.col) <= R.guardReach + (fx(g).reachBonus ?? 0)
    )
      g.store = Math.min(3, g.store + 1);
  }
}

function bossHits(
  s: State,
  move: Pick<BossMove, 'pattern' | 'powerBp' | 'silenceTurns' | 'charged'>,
  plain: boolean,
): void {
  const targets = targetsOf(s, move.pattern, plain);
  const area = move.pattern.shape !== 'single';
  const proposed = Math.floor(
    (((s.boss.atk * move.powerBp) / 10_000) * (10_000 - s.mired * R.miredPerStackBp)) / 10_000,
  );
  for (const t of targets) {
    if (t.hp <= 0) continue;
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
            g !== t &&
            g.row === t.row &&
            Math.abs(g.col - t.col) <= R.guardReach + (fx(g).reachBonus ?? 0),
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
          addMark(s, by.element, 1, false);
        }
      }
    }
    takeHit(s, taker, proposed, move.charged ? 'charged' : area ? 'area' : 'aimed');
  }
}

function bossTurn(s: State, turn: number): void {
  if (s.bossHp <= 0) return;
  s.turn = turn;
  const last = s.boss.rows - 1;
  for (const m of s.boss.moves) {
    if (s.round % m.every === 0 && (m.turn ?? last) === turn) {
      log(s, 'move', m.name);
      bossHits(s, m, false);
    }
  }
  for (let i = 0; i < (s.boss.plain.hits ?? 1); i++)
    bossHits(s, { pattern: s.boss.plain.pattern, powerBp: s.boss.plain.powerBp }, true);
  if (s.boss.mods.shedMarks) for (const [el, m] of s.marks) if (!m.sealed) s.marks.delete(el);
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
    reflectArmed: true,
    events: [],
    count: { reactions: 0, blocked: 0, dodges: 0, intercepts: 0, healed: 0, damage: 0 },
    byMark: {},
  };
  const startAlive = alive(s).length;
  for (s.round = 1; s.round <= boss.rounds && s.bossHp > 0 && alive(s).length > 0; s.round++) {
    for (const f of fighters) {
      f.undodgeable = false;
      f.damageThisRound = 0;
    }
    s.turn = 0;
    supportsAct(s);
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
 * replacement from `bench`, which takes the empty slot). From stage 2 an adapting boss resists the
 * reaction used most so far.
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
  let hp = new Map<string, number>();
  // Carried HP is keyed by the uids of the next stage's fighters (see below).
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
    // Re-key carried HP to the new list's uids (same order rule as placeFighters).
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
