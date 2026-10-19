// The start of a round, besides the dice: Support buffs, Kind Rain, gear lines and finale abilities.
// Part of the fight engine split from `fight.ts`; the shared state is `FightState` (`fight-state.ts`).
import { ELEMENTS, RULES, type Element, type Zone } from '@creatures/game';
import { adaptationOn, hitBoss } from './fight-strike';
import {
  besides,
  credit,
  further,
  receivedHeal,
  rolls,
  type Creature,
  type FightState,
  type Scheduled,
} from './fight-state';
import { CHANCE_FX } from './mods';
import { zoneOfIndex } from './zones';

/**
 * Support: living, non-silenced supports buff their neighbours' next hit. With `rules`, the
 * Support's element adds an effect (`supportFx`): a stronger buff, healing (never above the
 * missing HP, never a revive), clearing silence.
 */
export function supportBuffs(state: FightState, round: number): void {
  const { rules, creatures, events } = state;
  for (const s of creatures) {
    if (s.role !== 'support' || !s.alive || s.silenced > 0) continue;
    const fx = rules?.supportFx[s.element];
    // The Support's own sheet adds to the boost and the mend (`boostBp`, `mendBp`).
    // Shared warmth: a heal from this Support on a creature that has the line made this boost bigger (once).
    const warmth = s.nextBoostBp;
    s.nextBoostBp = 0;
    const buffBp = (fx?.buffBp ?? RULES.combat.supportBuffBp) + s.mods.boostBp + warmth;
    const mendBp = (fx?.healBp ?? 0) + s.mods.mendBp;
    // A Support with a longer reach (`boostReach`) also boosts the creature two slots away: the boost only.
    const near = besides(state, s.idx);
    const far = s.mods.boostReach ? further(state, s.idx) : [];
    for (const i of [...near, ...far]) {
      const t = creatures[i] as Creature;
      if (!t.alive) continue;
      t.buffs = t.buffs.filter((b) => b.from !== s.idx || b.tag !== undefined);
      t.buffs.push({ from: s.idx, bp: Math.max(-10_000, buffBp) });
      events.push({
        t: 'support_buff',
        round,
        supporter: s.id,
        target: t.id,
        bp: Math.max(-10_000, buffBp),
      });
      if (far.includes(i)) continue;
      if (mendBp > 0) {
        // What the neighbour receives: its own sheet can make a heal bigger or smaller.
        const healed = Math.floor((t.maxHp * mendBp) / 10_000);
        const amount = Math.min(
          t.mods.healReceivedBp === 0
            ? healed
            : Math.floor((healed * Math.max(0, 10_000 + t.mods.healReceivedBp)) / 10_000),
          Math.max(0, t.maxHp - t.hp),
        );
        if (amount > 0) {
          t.hp += amount;
          credit(state, s, null, 'supportCredit', amount);
          events.push({
            t: 'heal',
            round,
            supporter: s.id,
            target: t.id,
            amount,
          });
          if (t.mods.sharedWarmthBp > 0) {
            s.nextBoostBp = Math.max(s.nextBoostBp, t.mods.sharedWarmthBp);
            events.push({
              t: 'proc',
              round,
              creature: t.id,
              kind: 'shared_warmth',
              target: s.id,
              amount: t.mods.sharedWarmthBp,
            });
          }
        }
      }
      if (fx?.cleanse === true && t.silenced > 0) {
        t.silenced = 0;
        events.push({ t: 'cleanse', round, supporter: s.id, target: t.id });
      }
    }
  }
}

/**
 * Kind Rain (`FightInput.rainHealBp`): each living creature heals that share of its max HP, rounded
 * down, changed by its own `healReceivedBp` like a Mend, and never above what it is missing. One
 * `sky_heal` event names who was really healed; nothing is written when nobody was.
 */
export function rainHeals(state: FightState): void {
  const { rainHealBp, creatures, events } = state;
  const heals: { creature: string; amount: number }[] = [];
  for (const c of creatures) {
    if (!c.alive) continue;
    const received = receivedHeal(c, Math.floor((c.maxHp * rainHealBp) / 10_000));
    const amount = Math.min(received, Math.max(0, c.maxHp - c.hp));
    if (amount <= 0) continue;
    c.hp += amount;
    heals.push({ creature: c.id, amount });
  }
  if (heals.length > 0) events.push({ t: 'sky_heal', round: state.currentRound, heals });
}

/**
 * The creature's heal from a gear line (Second wind, Second breath): `bp` of its max HP, changed by its
 * own `healReceivedBp` like a Mend, never above what is missing. One `heal` event with the creature at
 * both ends and the line as `cause`; nothing is written when nothing was missing.
 */
export function selfHeal(
  state: FightState,
  c: Creature,
  bp: number,
  cause: 'second_wind' | 'second_breath',
): void {
  const { events } = state;
  const received = receivedHeal(c, Math.floor((c.maxHp * bp) / 10_000));
  const amount = Math.min(received, Math.max(0, c.maxHp - c.hp));
  if (amount <= 0) return;
  c.hp += amount;
  events.push({
    t: 'heal',
    round: state.currentRound,
    supporter: c.id,
    target: c.id,
    amount,
    cause,
  });
}

/**
 * The gear lines that act at the start of a round, in this order: Opening state.mark and Kindling (round 1
 * only), Warm heart, Second wind, Second breath (the first enrage round only). Each creature acts in slot
 * order, only while it stands.
 */
export function gearRoundStart(state: FightState, round: number, enraging: boolean): void {
  const { rounds, creatures, events } = state;
  if (round === 1) {
    for (const c of creatures) {
      if (!c.alive || !c.mods.openingMark || state.mark !== null) continue;
      state.mark = { element: c.element, creature: c, player: c.ownerId };
      events.push({
        t: 'mark',
        round,
        creature: c.id,
        player: c.ownerId,
        element: c.element,
        replaced: null,
      });
      events.push({ t: 'proc', round, creature: c.id, kind: 'opening_mark' });
    }
    for (const c of creatures) {
      if (!c.alive || c.mods.kindlingBp === 0) continue;
      for (const i of besides(state, c.idx)) {
        const next = creatures[i] as Creature;
        if (!next.alive) continue;
        next.buffs = next.buffs.filter((b) => !(b.from === c.idx && b.tag === 'kindling'));
        next.buffs.push({ from: c.idx, bp: c.mods.kindlingBp, tag: 'kindling' });
        events.push({
          t: 'proc',
          round,
          creature: c.id,
          kind: 'kindling',
          target: next.id,
          amount: c.mods.kindlingBp,
        });
      }
    }
  }
  for (const c of creatures) {
    if (!c.alive || !rolls(state, c, 3, c.mods.warmHeartBp)) continue;
    // The neighbour that hits hardest gets the boost (ties to the lower slot).
    let best: Creature | undefined;
    for (const i of besides(state, c.idx)) {
      const next = creatures[i] as Creature;
      if (next.alive && (best === undefined || next.atk > best.atk)) best = next;
    }
    if (best === undefined) continue;
    best.buffs = best.buffs.filter((b) => !(b.from === c.idx && b.tag === 'warm'));
    best.buffs.push({ from: c.idx, bp: CHANCE_FX.warmHeartBp, tag: 'warm' });
    events.push({
      t: 'proc',
      round,
      creature: c.id,
      kind: 'warm_heart',
      target: best.id,
      amount: CHANCE_FX.warmHeartBp,
    });
  }
  for (const c of creatures) {
    if (c.alive && rolls(state, c, 0, c.mods.secondWindBp)) {
      selfHeal(state, c, CHANCE_FX.secondWindHealBp, 'second_wind');
    }
  }
  if (enraging && round === rounds + 1) {
    for (const c of creatures) {
      if (c.alive && c.mods.secondBreathBp > 0)
        selfHeal(state, c, c.mods.secondBreathBp, 'second_breath');
    }
  }
}

// ---- finale ability effects ----
export function fireAbility(state: FightState, a: Scheduled): void {
  const { shape, rule, adaptationTarget, zoneHit, creatures, events } = state;
  const { choice, def, byDefault, source } = a;
  // Resolve what the effects need first, so the ability event can say it.
  let zone: Zone | undefined;
  let element: Element | undefined;
  for (const e of def.effects) {
    if (e.op === 'shield_wall') {
      zone =
        e.zone === 'own' && source !== null
          ? zoneOfIndex(source.idx, shape)
          : (choice.params?.zone ?? zoneHit?.zone ?? 'front');
    } else if (e.op === 're_mark') {
      // The player's own creature for the default element: a living one first.
      const mine = creatures.filter((c) => c.ownerId === choice.playerId);
      const own = mine.find((c) => c.alive) ?? mine[0];
      element =
        e.element === 'own' && source !== null
          ? source.element
          : (choice.params?.element ?? source?.element ?? own?.element ?? ELEMENTS[0] ?? 'tide');
    }
  }
  events.push({
    t: 'ability',
    round: state.currentRound,
    player: choice.playerId,
    ability: def.id,
    key: choice.key,
    ...(source === null ? {} : { creature: source.id }),
    ...(zone === undefined ? {} : { zone }),
    ...(element === undefined ? {} : { element }),
    byDefault,
  });
  // Lingering: the ability's creature makes its timed effects last longer (a basic ability has no creature,
  // so none of its own), and the day's Lantern Light adds the same to every ability, basic ones included.
  const linger = (source?.mods.lingerRounds ?? 0) + state.lingerAllRounds;
  for (const e of def.effects) {
    switch (e.op) {
      case 'rally':
        state.rallies.push({ bp: e.damageBp, until: state.currentRound + e.rounds + linger - 1 });
        break;
      case 'shield_wall':
        state.shields.push({
          zone: zone as Zone,
          reduceBp: e.reduceBp,
          until: state.currentRound + e.rounds + linger - 1,
        });
        break;
      case 're_mark':
        events.push({
          t: 'mark',
          round: state.currentRound,
          creature: source?.id ?? null,
          player: choice.playerId,
          element: element as Element,
          replaced: state.mark?.element ?? null,
        });
        state.mark = { element: element as Element, creature: source, player: choice.playerId };
        break;
      case 'purge':
        if (rule !== null && adaptationOn(state)) {
          events.push({
            t: 'adaptation',
            round: state.currentRound,
            rule: rule.id,
            target: adaptationTarget,
            status: 'purged',
          });
        }
        // A purge without `rounds` lasts to the end; the longest one wins.
        state.purgedThrough = Math.max(
          state.purgedThrough,
          e.rounds === undefined
            ? Number.POSITIVE_INFINITY
            : state.currentRound + e.rounds + linger - 1,
        );
        break;
      case 'strike':
        if (source !== null && state.bossHp > 0 && !state.retreated) {
          hitBoss(state, source, { atkBp: e.atkBp, ability: def.id, key: choice.key });
        }
        break;
    }
  }
}
