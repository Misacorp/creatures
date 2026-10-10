import * as v from 'valibot';
import { ContentPackSchema, ELEMENTS, type ContentPack, type CreatureSpecies } from './schema';

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
