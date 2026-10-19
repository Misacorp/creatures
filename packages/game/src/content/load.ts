import * as v from 'valibot';
import { chartBp } from './element-chart';
import {
  CHART_STRONG_BP,
  ContentPackSchema,
  ELEMENTS,
  type BossDef,
  type ContentPack,
  type CreatureSpecies,
  type Effect,
  type Gimmick,
  type FinaleAbilityDef,
} from './schema';

export const STARTER_COUNT = 3;

/**
 * Validates raw content (schema first, then cross-references) and returns it typed.
 * Throws an Error listing the first problem found; shipped content is checked by tests and at
 * module load, so a bad content edit fails fast instead of corrupting a game.
 */
export function loadContent(raw: unknown): ContentPack {
  const parsed = v.safeParse(ContentPackSchema, raw);
  if (!parsed.success) {
    const first = parsed.issues[0];
    const path = first?.path?.map((p) => String(p.key)).join('.') ?? '';
    throw new Error(`Invalid content schema at "${path}": ${first?.message ?? 'unknown error'}`);
  }
  const pack = parsed.output;
  checkElements(pack);
  checkElementChart(pack);
  checkCreatures(pack);
  checkReactions(pack);
  checkRaidContent(pack);
  checkAbilities(pack);
  return pack;
}

function fail(message: string): never {
  throw new Error(`Invalid content: ${message}`);
}

function checkElements(pack: ContentPack): void {
  const ids = new Set<string>();
  for (const def of pack.elements) {
    if (ids.has(def.id)) fail(`duplicate element "${def.id}"`);
    ids.add(def.id);
  }
  if (ids.size !== ELEMENTS.length) {
    fail(`expected ${ELEMENTS.length} elements, got ${ids.size}`);
  }
}

function checkElementChart(pack: ContentPack): void {
  const seen = new Set<string>();
  for (const p of pack.elementChart) {
    const key = `${p.attacker}>${p.defender}`;
    if (p.attacker === p.defender) fail(`element chart pairs "${p.attacker}" with itself`);
    if (seen.has(key)) fail(`element chart lists ${p.attacker} against ${p.defender} twice`);
    seen.add(key);
    if (p.bp === 10_000) fail(`element chart lists ${key} at 100%; leave neutral pairs out`);
  }
}

function checkCreatures(pack: ContentPack): void {
  const byId = new Map<string, CreatureSpecies>();
  for (const c of pack.creatures) {
    if (byId.has(c.id)) fail(`duplicate creature id "${c.id}"`);
    byId.set(c.id, c);
  }

  const stage1PerLine = new Map<string, number>();
  const evolutionTargets = new Map<string, number>();
  for (const c of pack.creatures) {
    if (c.stage === 1) stage1PerLine.set(c.line, (stage1PerLine.get(c.line) ?? 0) + 1);
    else stage1PerLine.set(c.line, stage1PerLine.get(c.line) ?? 0);

    if (c.stage === 2) {
      if (c.catchable) fail(`stage-2 species "${c.id}" must not be catchable`);
      if (c.starter) fail(`stage-2 species "${c.id}" must not be a starter`);
      if (c.evolvesTo !== undefined) fail(`stage-2 species "${c.id}" must not evolve`);
    }

    if (c.festival === true) {
      if (c.catchable) fail(`festival species "${c.id}" must not be catchable`);
      if (c.starter) fail(`festival species "${c.id}" must not be a starter`);
      if (c.stage !== 1 || c.evolvesTo !== undefined) {
        fail(`festival species "${c.id}" must be a single-stage species`);
      }
    }

    if (c.altEvolvesTo !== undefined && c.evolvesTo === undefined) {
      fail(`"${c.id}" has a second branch but no first evolution`);
    }
    for (const evolution of [c.evolvesTo, c.altEvolvesTo]) {
      if (evolution === undefined) continue;
      const target = byId.get(evolution.species);
      if (c.stage !== 1) fail(`only stage-1 species can evolve ("${c.id}")`);
      if (target === undefined) fail(`"${c.id}" evolves into unknown species`);
      if (target.stage !== 2) fail(`"${c.id}" must evolve into a stage-2 species`);
      if (target.line !== c.line) fail(`"${c.id}" must evolve within its own line`);
      if (target.element !== c.element) fail(`"${c.id}" must evolve into the same element`);
      if (target.rarity !== c.rarity) fail(`"${c.id}" must evolve into the same rarity`);
      if (evolution.level > c.levelCap) {
        fail(`"${c.id}" evolves at level ${evolution.level}, above its level cap`);
      }
      evolutionTargets.set(target.id, (evolutionTargets.get(target.id) ?? 0) + 1);
    }
    if (c.altEvolvesTo !== undefined && c.altEvolvesTo.species === c.evolvesTo?.species) {
      fail(`"${c.id}" has the same species for both branches`);
    }
    // One price for the choice: the evolve screen and the server show and charge a single level and cost.
    if (
      c.altEvolvesTo !== undefined &&
      c.evolvesTo !== undefined &&
      (c.altEvolvesTo.level !== c.evolvesTo.level || c.altEvolvesTo.essence !== c.evolvesTo.essence)
    ) {
      fail(`"${c.id}" must have the same level and Essence for both branches`);
    }
  }

  for (const c of pack.creatures) {
    if (c.stage === 2 && evolutionTargets.get(c.id) !== 1) {
      fail(`stage-2 species "${c.id}" must be the evolution target of exactly one species`);
    }
  }

  for (const [line, count] of stage1PerLine) {
    if (count !== 1) fail(`line "${line}" must have exactly one stage-1 species, has ${count}`);
  }

  const starters = pack.creatures.filter((c) => c.starter);
  if (starters.length !== STARTER_COUNT) {
    fail(`expected exactly ${STARTER_COUNT} starters, got ${starters.length}`);
  }
  for (const s of starters) {
    if (s.rarity !== 'common' || !s.catchable || s.stage !== 1) {
      fail(`starter "${s.id}" must be a common, catchable, stage-1 species`);
    }
  }
  if (new Set(starters.map((s) => s.element)).size !== STARTER_COUNT) {
    fail('starters must have different elements');
  }
}

function checkUniqueIds(kind: string, items: readonly { id: string }[]): Map<string, number> {
  const seen = new Map<string, number>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) fail(`duplicate ${kind} id "${item.id}"`);
    seen.set(item.id, index);
  });
  return seen;
}

function checkReactions(pack: ContentPack): void {
  checkUniqueIds('reaction', pack.reactions);
  const markByElement = new Map<string, { id: string; name: string }>();
  const markIds = new Set<string>();
  const pairs = new Set<string>();
  for (const r of pack.reactions) {
    // Every reaction of one mark repeats the mark's id and name; two elements never share a mark id.
    const mark = markByElement.get(r.markElement);
    if (mark === undefined) {
      if (markIds.has(r.markId)) fail(`duplicate mark id "${r.markId}"`);
      markIds.add(r.markId);
      markByElement.set(r.markElement, { id: r.markId, name: r.markName });
    } else if (mark.id !== r.markId || mark.name !== r.markName) {
      fail(`reaction "${r.id}" names a different mark than the other marks of ${r.markElement}`);
    }
    const key = `${r.markElement}<${r.triggerElement}`;
    if (pairs.has(key))
      fail(`two reactions for mark "${r.markElement}" set off by "${r.triggerElement}"`);
    pairs.add(key);
    // A reaction's trigger must deal 150% to the marked element on the chart.
    if (chartBp(pack.elementChart, r.triggerElement, r.markElement) !== CHART_STRONG_BP) {
      fail(`reaction "${r.id}" must be triggered by an element strong against ${r.markElement}`);
    }
  }
  if (markByElement.size !== ELEMENTS.length) fail('every element needs exactly one mark');
  // Every strong pair has its reaction.
  for (const p of pack.elementChart) {
    if (p.bp === CHART_STRONG_BP && !pairs.has(`${p.defender}<${p.attacker}`)) {
      fail(`no reaction for mark "${p.defender}" set off by "${p.attacker}"`);
    }
  }
}

/** The status effect a move applies, if any (a rider on a damaging move or a charge). */
export function appliedEffect(g: Gimmick): string | undefined {
  return 'applies' in g ? g.applies?.effect : undefined;
}

function checkBoss(
  boss: BossDef,
  adaptationIds: ReadonlyMap<string, number>,
  effectIds: ReadonlyMap<string, number>,
): void {
  if (!adaptationIds.has(boss.adaptation)) {
    fail(`boss "${boss.id}" names unknown adaptation "${boss.adaptation}"`);
  }
  if (boss.hpExponent !== undefined) {
    const e = boss.hpExponent.num / boss.hpExponent.den;
    if (e < 0.5 || e > 2) fail(`boss "${boss.id}" has an HP exponent outside 0.5 to 2`);
  }
  const gimmickIds = new Set<string>();
  for (const g of boss.gimmicks) {
    if (gimmickIds.has(g.id)) fail(`boss "${boss.id}" has duplicate gimmick id "${g.id}"`);
    gimmickIds.add(g.id);
    const effect = appliedEffect(g);
    if (effect !== undefined && !effectIds.has(effect)) {
      fail(`boss "${boss.id}" gimmick "${g.id}" applies unknown status effect "${effect}"`);
    }
  }
}

function checkRaidContent(pack: ContentPack): void {
  checkUniqueIds('boss', pack.bosses);
  const adaptationIds = checkUniqueIds('adaptation', pack.adaptations);
  const effectIds = checkUniqueIds('status effect', pack.statusEffects);
  for (const boss of pack.bosses) checkBoss(boss, adaptationIds, effectIds);

  checkUniqueIds('finale ability', pack.finaleAbilities);

  checkUniqueIds('guest', pack.guests);
  const speciesIds = new Set(pack.creatures.map((c) => c.id));
  for (const g of pack.guests) {
    if (!speciesIds.has(g.species)) fail(`guest "${g.id}" uses unknown species "${g.species}"`);
  }
}

/** Rounds an effect lasts; a purge without `rounds` lasts the rest of the fight. */
function effectRounds(e: Effect): number {
  if (e.op === 'purge') return e.rounds ?? Number.POSITIVE_INFINITY;
  return 'rounds' in e ? e.rounds : 1;
}

/**
 * Strength of an effect on one number: how much, in the unit of its main parameter. Used only to
 * compare an effect with the same op of the stage-1 form.
 */
function effectAmount(e: Effect): number {
  switch (e.op) {
    case 'rally':
      return e.damageBp;
    case 'shield_wall':
      return e.reduceBp;
    case 'strike':
      return e.atkBp;
    case 're_mark':
    case 'purge':
      return 0;
  }
}

/**
 * "Stage 2 is at least as strong as stage 1", our simple measure: stage 2 has every op that
 * stage 1 has, with the same `zone` / `element` choice, and for each shared op neither the amount
 * (damage, reduction or strike power) nor the duration (`rounds`) is lower. Extra effects only make
 * it stronger. It must also be stronger somewhere: a higher amount, a longer duration or an extra
 * effect. Returns a problem description, or null if stage 2 qualifies.
 */
export function upgradeProblem(stage1: FinaleAbilityDef, stage2: FinaleAbilityDef): string | null {
  let stronger = stage2.effects.length > stage1.effects.length;
  for (const e1 of stage1.effects) {
    const e2 = stage2.effects.find((e) => e.op === e1.op);
    if (e2 === undefined) return `lacks the "${e1.op}" effect of the stage-1 ability`;
    if ('zone' in e1 && 'zone' in e2 && e1.zone !== e2.zone)
      return `changes the zone of "${e1.op}"`;
    if ('element' in e1 && 'element' in e2 && e1.element !== e2.element) {
      return `changes the element of "${e1.op}"`;
    }
    if (effectAmount(e2) < effectAmount(e1)) return `has a weaker "${e1.op}" amount`;
    if (effectRounds(e2) < effectRounds(e1)) return `has a shorter "${e1.op}" duration`;
    if (effectAmount(e2) > effectAmount(e1) || effectRounds(e2) > effectRounds(e1)) {
      stronger = true;
    }
  }
  return stronger ? null : 'is not stronger than the stage-1 ability';
}

function checkAbilities(pack: ContentPack): void {
  const byId = new Map<string, FinaleAbilityDef>();
  for (const a of pack.finaleAbilities) {
    byId.set(a.id, a);
    const ops = a.effects.map((e) => e.op);
    if (new Set(ops).size !== ops.length) fail(`ability "${a.id}" repeats an effect`);
    if (a.kind === 'basic') {
      // Basic abilities are the four plain ops, with the player's pick: no creature is involved.
      const [only] = a.effects;
      if (a.effects.length !== 1 || only === undefined) {
        fail(`basic ability "${a.id}" must have exactly one effect`);
      }
      if (only.op === 'strike') fail(`basic ability "${a.id}" cannot strike`);
      if (
        (only.op === 'shield_wall' && only.zone !== 'choose') ||
        (only.op === 're_mark' && only.element !== 'choose')
      ) {
        fail(`basic ability "${a.id}" must let the player choose`);
      }
    }
  }
  const basicOps = new Set<string>();
  for (const a of pack.finaleAbilities) {
    if (a.kind !== 'basic') continue;
    const op = (a.effects[0] as Effect).op;
    if (basicOps.has(op)) fail(`two basic abilities use the effect "${op}"`);
    basicOps.add(op);
  }

  const referenced = new Set<string>();
  for (const c of pack.creatures) {
    if (c.ability === undefined) {
      if (c.festival === true) fail(`festival species "${c.id}" needs an ability`);
      continue;
    }
    const def = byId.get(c.ability.id);
    if (def === undefined) fail(`species "${c.id}" has unknown ability "${c.ability.id}"`);
    if (def.kind !== 'creature') {
      fail(`species "${c.id}" must use a creature ability, "${def.id}" is basic`);
    }
    if (referenced.has(def.id)) fail(`ability "${def.id}" belongs to more than one species`);
    referenced.add(def.id);
  }
  for (const a of pack.finaleAbilities) {
    if (a.kind === 'creature' && !referenced.has(a.id)) {
      fail(`creature ability "${a.id}" belongs to no species`);
    }
  }

  // Evolution lines: both forms have an ability. The first branch's is stronger than the stage-1 one;
  // the second branch (`altEvolvesTo`) is a different role, so its ability is a sidegrade and only
  // has to exist (a Support's Sunny Patch is not "more" than a Guard's Bark Guard).
  for (const c of pack.creatures) {
    for (const [branch, evolution] of [c.evolvesTo, c.altEvolvesTo].entries()) {
      if (evolution === undefined) continue;
      const target = pack.creatures.find((s) => s.id === evolution.species);
      if (target === undefined) continue; // checkCreatures reports this
      const a1 = c.ability === undefined ? undefined : byId.get(c.ability.id);
      const a2 = target.ability === undefined ? undefined : byId.get(target.ability.id);
      if ((a1 === undefined) !== (a2 === undefined)) {
        fail(`"${c.id}" and "${target.id}" must both have an ability or neither`);
      }
      if (branch === 0 && a1 !== undefined && a2 !== undefined) {
        const problem = upgradeProblem(a1, a2);
        if (problem !== null) fail(`ability "${a2.id}" of "${target.id}" ${problem}`);
      }
    }
  }
}
