import * as v from 'valibot';
import {
  ContentPackSchema,
  ELEMENTS,
  type BossDef,
  type ContentPack,
  type CreatureSpecies,
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
  checkElementCycle(pack);
  checkCreatures(pack);
  checkReactions(pack);
  checkRaidContent(pack);
  return pack;
}

function fail(message: string): never {
  throw new Error(`Invalid content: ${message}`);
}

function checkElementCycle(pack: ContentPack): void {
  const strongAgainst = new Map<string, string>();
  for (const def of pack.elements) {
    if (strongAgainst.has(def.id)) fail(`duplicate element "${def.id}"`);
    strongAgainst.set(def.id, def.strongAgainst);
  }
  if (strongAgainst.size !== ELEMENTS.length) {
    fail(`expected ${ELEMENTS.length} elements, got ${strongAgainst.size}`);
  }
  // Walk the cycle from the first element: it must visit all four and return to the start.
  const start = ELEMENTS[0];
  if (start === undefined) fail('no elements defined');
  const seen = new Set<string>();
  let current: string = start;
  while (!seen.has(current)) {
    seen.add(current);
    const next = strongAgainst.get(current);
    if (next === undefined) fail(`element "${current}" is missing`);
    current = next;
  }
  if (current !== start || seen.size !== ELEMENTS.length) {
    fail('elements must form a single cycle through all four elements');
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

    if (c.evolvesTo !== undefined) {
      const target = byId.get(c.evolvesTo.species);
      if (c.stage !== 1) fail(`only stage-1 species can evolve ("${c.id}")`);
      if (target === undefined) fail(`"${c.id}" evolves into unknown species`);
      if (target.stage !== 2) fail(`"${c.id}" must evolve into a stage-2 species`);
      if (target.line !== c.line) fail(`"${c.id}" must evolve within its own line`);
      if (target.element !== c.element) fail(`"${c.id}" must evolve into the same element`);
      if (target.rarity !== c.rarity) fail(`"${c.id}" must evolve into the same rarity`);
      if (c.evolvesTo.level > c.levelCap) {
        fail(`"${c.id}" evolves at level ${c.evolvesTo.level}, above its level cap`);
      }
      evolutionTargets.set(target.id, (evolutionTargets.get(target.id) ?? 0) + 1);
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
  const markIds = new Set<string>();
  const markElements = new Set<string>();
  for (const r of pack.reactions) {
    if (markIds.has(r.markId)) fail(`duplicate mark id "${r.markId}"`);
    markIds.add(r.markId);
    if (markElements.has(r.markElement)) fail(`two marks for element "${r.markElement}"`);
    markElements.add(r.markElement);
    // The trigger is the element that is strong against the marked element.
    const trigger = pack.elements.find((e) => e.strongAgainst === r.markElement);
    if (trigger?.id !== r.triggerElement) {
      fail(`reaction "${r.id}" must be triggered by the element strong against ${r.markElement}`);
    }
  }
  if (markElements.size !== ELEMENTS.length) fail('every element needs exactly one mark');
}

function checkBoss(boss: BossDef, adaptationIds: ReadonlyMap<string, number>): void {
  if (!adaptationIds.has(boss.adaptation)) {
    fail(`boss "${boss.id}" names unknown adaptation "${boss.adaptation}"`);
  }
  const gimmickIds = new Set<string>();
  for (const g of boss.gimmicks) {
    if (gimmickIds.has(g.id)) fail(`boss "${boss.id}" has duplicate gimmick id "${g.id}"`);
    gimmickIds.add(g.id);
  }
}

function checkRaidContent(pack: ContentPack): void {
  checkUniqueIds('boss', pack.bosses);
  const adaptationIds = checkUniqueIds('adaptation', pack.adaptations);
  for (const boss of pack.bosses) checkBoss(boss, adaptationIds);

  checkUniqueIds('finale ability', pack.finaleAbilities);
  const ops = new Set<string>();
  for (const a of pack.finaleAbilities) {
    if (ops.has(a.effect.op)) fail(`two finale abilities use the effect "${a.effect.op}"`);
    ops.add(a.effect.op);
  }

  checkUniqueIds('guest', pack.guests);
  const speciesIds = new Set(pack.creatures.map((c) => c.id));
  for (const g of pack.guests) {
    if (!speciesIds.has(g.species)) fail(`guest "${g.id}" uses unknown species "${g.species}"`);
  }
}
