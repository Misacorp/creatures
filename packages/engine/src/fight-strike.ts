// A creature hitting the boss (`hitBoss`): turn hits and ability strikes, reactions, marks, crits, credit.
// Part of the fight engine split from `fight.ts`; the shared state is `FightState` (`fight-state.ts`).
import { RULES, type ReactionDef } from '@creatures/game';
import { hurt } from './fight-damage';
import {
  baseContext,
  besides,
  credit,
  pick,
  receivedHeal,
  rolls,
  reactionKey,
  runHook,
  view,
  type Creature,
  type FightState,
} from './fight-state';
import { matchupBp } from './matchup';
import { CHANCE_FX, cutBp } from './mods';
import { sanitizeBp } from './mutators';

// ---- a creature hits the boss ----
/** The extra damage the rallies running now give every hit (basis points). */
export function rallyBp(state: FightState): number {
  return state.rallies.reduce((sum, r) => (r.until >= state.currentRound ? sum + r.bp : sum), 0);
}

/** True while the boss's adaptation is in force: it exists and no purge has switched it off. */
export function adaptationOn(state: FightState): boolean {
  const { rule } = state;
  return rule !== null && state.currentRound > state.purgedThrough;
}

/**
 * A creature hits the boss: its turn, or (with `strike`) an ability's strike, which hits for a
 * share of Attack, leaves the creature's support buffs for its next turn and lands even if the
 * creature is knocked out.
 */
export function hitBoss(
  state: FightState,
  c: Creature,
  strike?: { atkBp: number; ability: string; key: string },
): void {
  const {
    pack,
    boss,
    brambleBp,
    bossFloor,
    luck,
    critOn,
    rules,
    rule,
    adaptationTarget,
    reactionByPair,
    creatures,
    events,
    reactionsByType,
    damageByElement,
  } = state;
  const matchup = matchupBp(c.element, boss.element, pack.elementChart);
  const atk = strike === undefined ? c.atk : Math.floor((c.atk * strike.atkBp) / 10_000);
  const buffs = strike === undefined ? c.buffs : [];
  if (strike === undefined) c.buffs = [];
  const supportBp = buffs.reduce((sum, b) => sum + b.bp, 0);
  const markBefore = state.mark;

  const m = c.mods;

  const reaction: ReactionDef | undefined =
    markBefore === null
      ? undefined
      : reactionByPair.get(reactionKey(markBefore.element, c.element));
  const trapped = reaction !== undefined && c.alive && state.reflectArmed && !state.reflectUsed;
  if (trapped) state.reflectUsed = true;
  // A gear set turns the trap aside for the creature's first reaction of the fight (`unreflected`).
  const proof = trapped && m.unreflected && c.cashes === 0;
  const reflected = trapped && !proof;
  // Bramble Season: the first reaction each round (by a creature still standing) sends a share of
  // its bonus back. A reaction Backdraft already reflected in full uses the round's first up.
  const brambling = reaction !== undefined && c.alive && brambleBp > 0 && !state.brambleUsed;
  if (brambling) state.brambleUsed = true;
  const brambled = brambling && !reflected;

  const dice = (strike === undefined ? state.turnDice : state.strikeDice)[c.idx];
  let luckBp = state.swingNow;
  let crit = false;
  let setCrit = false;
  let warm = false;
  if (dice !== undefined) {
    // A hit that sets off a reaction crits more often with keen reactions (under the crit cap).
    const critChanceBp =
      reaction !== undefined && m.keenReactionBp !== 0
        ? Math.max(0, Math.min(luck.critMaxChanceBp ?? 10_000, c.critChanceBp + m.keenReactionBp))
        : c.critChanceBp;
    // A gear set makes the first reaction a crit (`firstReactionCrit`); crits must be on.
    setCrit = critOn && reaction !== undefined && m.firstReactionCrit && c.cashes === 0;
    if (critOn && (dice.crit < critChanceBp || setCrit)) {
      crit = true;
      luckBp += c.critBp;
      // After a reaction, a gear set's crit window adds crit damage until the end of the next round.
      if (m.critWindowBp !== 0 && c.critWindowUntil >= state.currentRound) {
        warm = true;
        luckBp += m.critWindowBp;
      }
    }
    luckBp += dice.spread;
  }

  // The creature's sheet on its hit (`SlotMods`), added to the one combined bonus.
  let sheetBp = m.vsElementBp[boss.element] ?? 0;
  if (markBefore !== null && reaction === undefined) sheetBp += m.markedFoeBp;
  // A setter's hit of another element replaces the state.mark, unless it is sealed (`sealMark`). A creature
  // with Quick re-state.mark does it too when its die says so (any role: the die is only read where it matters).
  const replacing =
    reaction === undefined &&
    markBefore !== null &&
    markBefore.element !== c.element &&
    markBefore.sealed !== true;
  const quick = replacing && c.role !== 'setter' && rolls(state, c, 4, m.quickRemarkBp);
  const replaces =
    (c.role === 'setter' || quick) &&
    markBefore !== null &&
    markBefore.element !== c.element &&
    markBefore.sealed !== true;
  if (reaction === undefined && (markBefore === null || replaces)) {
    sheetBp += m.markingHitBp;
  }
  if (strike !== undefined) {
    sheetBp += m.strikeBp;
  } else {
    if (c.turnHits === 0) sheetBp += m.firstHitBp;
    c.turnHits += 1;
    // The trigger lines that wait for the next turn hit are spent on it (an ability's strike keeps them).
    sheetBp += c.paybackReady + c.emberTailReady + c.patientReady;
    c.paybackReady = 0;
    c.emberTailReady = 0;
    c.patientReady = 0;
  }
  // Rally cry: every hit of the creature, for the rest of the fight.
  sheetBp += c.rallyCry;
  const roleBonuses = Object.entries(m.besideRoleBp);
  if (roleBonuses.length > 0) {
    const near = besides(state, c.idx)
      .map((i) => creatures[i] as Creature)
      .filter((o) => o.alive);
    for (const [role, bp] of roleBonuses) {
      if (near.some((o) => o.role === role)) sheetBp += bp;
    }
  }

  let hookBp = 0;
  runHook(
    state,
    'onBeforeHit',
    () => ({ ...baseContext(state), creature: view(c), matchupBp: matchup }),
    (r) => {
      hookBp += sanitizeBp(pick(r, 'damageBonusBp'));
    },
  );
  let reactionHookBp = 0;
  if (reaction !== undefined) {
    const r = reaction;
    runHook(
      state,
      'onReaction',
      () => ({ ...baseContext(state), reaction: r.id, payoff: view(c), reflected }),
      (res) => {
        reactionHookBp += sanitizeBp(pick(res, 'bonusBp'));
      },
    );
  }

  const adapting = adaptationOn(state);
  const elementResist =
    adapting && rule?.kind === 'top_element' && adaptationTarget === c.element
      ? cutBp(rule.resistBp, m.pierceBp)
      : 0;
  const reactionResist =
    adapting &&
    reaction !== undefined &&
    rule?.kind === 'top_reaction' &&
    adaptationTarget === reaction.id
      ? cutBp(rule.resistBp, m.pierceBp)
      : 0;

  // Element effects of Supports beside the hitter (`rules.supportFx[...].reactionBp`, Spark's
  // Overcharge): a living, non-silenced Support adds its share of the reaction's bonus. Not on a
  // reflected reaction (that bonus comes back at the hitter).
  // A Support's sheet adds to it (`shareBp`).
  const overcharge: { s: Creature; bp: number }[] = [];
  if (reaction !== undefined && !reflected) {
    for (const i of besides(state, c.idx)) {
      const s = creatures[i] as Creature;
      const bp = (rules?.supportFx[s.element]?.reactionBp ?? 0) + s.mods.shareBp;
      if (s.role === 'support' && s.alive && s.silenced === 0 && bp > 0) overcharge.push({ s, bp });
    }
  }
  const overchargeBp = overcharge.reduce((sum, o) => sum + o.bp, 0);

  // The sheets' share of the reaction bonus: the reaction's own line, and the setter's (`ownerMarkBp`).
  const reactionSheetBp =
    reaction === undefined
      ? 0
      : (m.reactionBp[reaction.id] ?? 0) + (markBefore?.creature?.mods.ownerMarkBp ?? 0);
  const calc = (
    modBp: number,
    fxBp = overchargeBp,
  ): { damage: number; bonus: number; reflect: number } => {
    const factor = Math.max(0, 10_000 + Math.max(-10_000, modBp));
    let plain = Math.floor((atk * matchup * factor) / 100_000_000);
    if (elementResist > 0) plain = Math.floor((plain * (10_000 - elementResist)) / 10_000);
    if (reaction === undefined) return { damage: plain, bonus: 0, reflect: 0 };
    let mult = reaction.multiplierBp;
    // A Payoff's bonus, and every creature's pounce, are added together as a share of the multiplier.
    const multFactorBp = (c.role === 'payoff' ? reaction.payoffBonusBp : 10_000) + m.pounceBp;
    if (multFactorBp !== 10_000) mult = Math.floor((mult * Math.max(0, multFactorBp)) / 10_000);
    let bonus = Math.max(0, Math.floor((plain * mult) / 10_000) - plain);
    if (reactionResist > 0) bonus -= Math.floor((bonus * reactionResist) / 10_000);
    bonus = Math.max(
      0,
      Math.floor((bonus * Math.max(0, 10_000 + reactionHookBp + reactionSheetBp + fxBp)) / 10_000),
    );
    if (reflected) return { damage: plain, bonus: 0, reflect: bonus };
    if (brambled) {
      const back = Math.floor((bonus * brambleBp) / 10_000);
      return { damage: plain + bonus - back, bonus: bonus - back, reflect: back };
    }
    return { damage: plain + bonus, bonus, reflect: 0 };
  };

  const rally = rallyBp(state);
  const totalBp = supportBp + rally + state.roundBonusBp + hookBp + luckBp + sheetBp;
  const full = calc(totalBp);
  // The phase floor: a hit that reaches it counts only down to it, so nothing is overkill (the
  // damage, the reaction bonus, the credit and the element totals). The plain hit is counted
  // first, the reaction's bonus gets what is left.
  // With `rules` the killing blow is trimmed the same way: damage counts only up to the HP the
  // boss had left (no overkill), though it is a kill, not a retreat.
  const room = Math.max(0, state.bossHp - bossFloor);
  const reaches = bossFloor > 0 && full.damage >= room;
  const trimmed = reaches || (rules !== undefined && full.damage >= room);
  const hit = trimmed
    ? {
        ...full,
        damage: room,
        bonus: Math.min(full.bonus, Math.max(0, room - (full.damage - full.bonus))),
      }
    : full;
  state.bossHp = Math.max(0, state.bossHp - hit.damage);
  damageByElement[c.element] += hit.damage;

  // Setup / payoff split of the reaction bonus: the setter gets the floor of `setupShareBp` of it,
  // the payoff the rest.
  let setup = 0;
  if (reaction !== undefined && !reflected && markBefore !== null) {
    setup = Math.floor((hit.bonus * RULES.combat.setupShareBp) / 10_000);
    credit(state, markBefore.creature, markBefore.player, 'setupCredit', setup);
  }

  // Support credit (zero-sum): the extra damage the buffs made possible moves from the hitter's
  // credit to the supporters, shared between them.
  // The element effect's own gain is credited first (what the hit lost without it), so the two
  // gains never overlap: together they are at most the hit's damage. A hit cut short by the floor
  // keeps the shares within what was really dealt.
  let supportShare = 0;
  let budget = trimmed ? Math.max(0, hit.damage - setup) : Number.POSITIVE_INFINITY;
  if (overcharge.length > 0) {
    const gain = Math.min(budget, Math.max(0, hit.damage - calc(totalBp, 0).damage));
    budget -= gain;
    supportShare += gain;
    const k = overcharge.length;
    const each = Math.floor(gain / k);
    let rest = gain - each * k;
    for (const o of overcharge) {
      const extra = rest > 0 ? 1 : 0;
      rest -= extra;
      credit(state, o.s, null, 'supportCredit', each + extra);
    }
  }
  if (supportBp > 0) {
    const gain = Math.min(
      budget,
      Math.max(0, calc(totalBp, 0).damage - calc(totalBp - supportBp, 0).damage),
    );
    supportShare += gain;
    const k = buffs.length;
    const each = Math.floor(gain / k);
    let rest = gain - each * k;
    for (const b of buffs) {
      const extra = rest > 0 ? 1 : 0;
      rest -= extra;
      credit(state, creatures[b.from] as Creature, null, 'supportCredit', each + extra);
    }
  }

  credit(state, c, null, 'damage', hit.damage - setup - supportShare);

  events.push({
    t: 'hit',
    round: state.currentRound,
    creature: c.id,
    damage: hit.damage,
    matchupBp: matchup,
    bonusBp: totalBp,
    mark: markBefore?.element ?? null,
    bossHp: state.bossHp,
    ...(strike === undefined ? {} : { ability: strike.ability, key: strike.key }),
    ...(luckBp === 0 ? {} : { luckBp }),
    ...(crit ? { crit: true as const, critBp: c.critBp + (warm ? m.critWindowBp : 0) } : {}),
    ...(sheetBp === 0 ? {} : { sheetBp }),
    ...(setCrit && crit ? { setCrit: true as const } : {}),
    ...(warm ? { warm: true as const } : {}),
  });

  // Ember tail: a crit gives its next turn hit a bonus.
  if (crit && m.emberTailBp > 0) {
    c.emberTailReady = m.emberTailBp;
    events.push({
      t: 'proc',
      round: state.currentRound,
      creature: c.id,
      kind: 'ember_tail',
      amount: m.emberTailBp,
    });
  }

  if (reaction !== undefined && markBefore !== null) {
    reactionsByType[reaction.id] = (reactionsByType[reaction.id] ?? 0) + 1;
    state.reactionTotal += 1;
    events.push({
      t: 'reaction',
      round: state.currentRound,
      reaction: reaction.id,
      setupCreature: markBefore.creature?.id ?? null,
      setupPlayer: markBefore.creature !== null ? markBefore.creature.ownerId : markBefore.player,
      payoff: c.id,
      bonus: reflected ? hit.reflect : hit.bonus,
      reflected,
      ...(brambled ? { bramble: { bp: brambleBp, amount: hit.reflect } } : {}),
      ...(reactionSheetBp + m.pounceBp === 0 ? {} : { sheetBp: reactionSheetBp + m.pounceBp }),
      ...(proof ? { proof: true as const } : {}),
      ...(m.chainMark && !reflected ? { chain: true as const } : {}),
    });
    state.mark = null;
    if (reflected) hurt(state, c, hit.reflect, 'reflect', 'reflect');
    else if (brambled && hit.reflect > 0) hurt(state, c, hit.reflect, 'reflect', 'reflect');
    if (!reflected) {
      // The gear sets that act on a reaction that was really cashed.
      if (m.critWindowBp !== 0) c.critWindowUntil = state.currentRound + 1;
      if (m.healOnReactionBp > 0 && c.alive) {
        const amount = Math.min(
          receivedHeal(c, Math.floor((c.maxHp * m.healOnReactionBp) / 10_000)),
          Math.max(0, c.maxHp - c.hp),
        );
        if (amount > 0) {
          c.hp += amount;
          events.push({
            t: 'heal',
            round: state.currentRound,
            supporter: c.id,
            target: c.id,
            amount,
          });
        }
      }
      if (m.chainMark) {
        state.mark = { element: c.element, creature: c, player: c.ownerId };
        events.push({
          t: 'mark',
          round: state.currentRound,
          creature: c.id,
          player: c.ownerId,
          element: c.element,
          replaced: null,
        });
      } else if (m.spillOverBp > 0 && rolls(state, c, 5, m.spillOverBp)) {
        // Spill-over: the boss keeps the creature's own state.mark (what Ridge Copper does every time).
        state.mark = { element: c.element, creature: c, player: c.ownerId };
        events.push({
          t: 'mark',
          round: state.currentRound,
          creature: c.id,
          player: c.ownerId,
          element: c.element,
          replaced: null,
        });
        events.push({ t: 'proc', round: state.currentRound, creature: c.id, kind: 'spill_over' });
      }
      // Overflow: the next creature to act gets a boost.
      if (m.overflowBp > 0) {
        const next = nextToAct(state);
        if (next !== undefined) {
          next.buffs = next.buffs.filter((b) => !(b.from === c.idx && b.tag === 'overflow'));
          next.buffs.push({ from: c.idx, bp: m.overflowBp, tag: 'overflow' });
          events.push({
            t: 'proc',
            round: state.currentRound,
            creature: c.id,
            kind: 'overflow',
            target: next.id,
            amount: m.overflowBp,
          });
        }
      }
    }
    c.cashes += 1;
  } else if (markBefore === null) {
    const seal = m.sealMark && !c.sealed;
    if (seal) c.sealed = true;
    state.mark = {
      element: c.element,
      creature: c,
      player: c.ownerId,
      ...(seal ? { sealed: true } : {}),
    };
    events.push({
      t: 'mark',
      round: state.currentRound,
      creature: c.id,
      player: c.ownerId,
      element: c.element,
      replaced: null,
      ...(seal ? { sealed: true as const } : {}),
    });
  } else if (replaces) {
    const seal = m.sealMark && !c.sealed;
    if (seal) c.sealed = true;
    state.mark = {
      element: c.element,
      creature: c,
      player: c.ownerId,
      ...(seal ? { sealed: true } : {}),
    };
    events.push({
      t: 'mark',
      round: state.currentRound,
      creature: c.id,
      player: c.ownerId,
      element: c.element,
      replaced: markBefore.element,
      ...(seal ? { sealed: true as const } : {}),
    });
    if (quick) {
      events.push({ t: 'proc', round: state.currentRound, creature: c.id, kind: 'quick_remark' });
    }
  }

  if (reaches) {
    state.retreated = true;
    events.push({ t: 'retreat', round: state.currentRound, bossHp: state.bossHp });
  }

  // Echo: a turn hit lands again for a share of its plain damage (no state.mark, no reaction, no crit),
  // counted down to the floor like any hit on the boss.
  if (
    strike === undefined &&
    m.echoBp > 0 &&
    state.bossHp > 0 &&
    !state.retreated &&
    rolls(state, c, 1, m.echoBp)
  ) {
    const again = Math.floor(((hit.damage - hit.bonus) * CHANCE_FX.echoBp) / 10_000);
    const room2 = Math.max(0, state.bossHp - bossFloor);
    const landed = Math.min(again, room2);
    if (landed > 0) {
      state.bossHp -= landed;
      damageByElement[c.element] += landed;
      credit(state, c, null, 'damage', landed);
      events.push({
        t: 'proc',
        round: state.currentRound,
        creature: c.id,
        kind: 'echo',
        amount: landed,
        bossHp: state.bossHp,
      });
      if (bossFloor > 0 && again >= room2) {
        state.retreated = true;
        events.push({ t: 'retreat', round: state.currentRound, bossHp: state.bossHp });
      }
    }
  }
}

/**
 * The next creature that will act this round (a living one after the current place in the turn order),
 * for Overflow; none when the creature was the last to act. An ability's strike at round start has not
 * reached the order yet, so the next to act is the first living creature.
 */
export function nextToAct(state: FightState): Creature | undefined {
  const { creatures, order } = state;
  for (let j = state.orderPos + 1; j < order.length; j++) {
    const next = creatures[order[j] as number] as Creature;
    if (next.alive) return next;
  }
  return undefined;
}
