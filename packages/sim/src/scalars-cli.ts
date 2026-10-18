import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as v from 'valibot';
import {
  RULES,
  content,
  dungeonContent,
  expeditionContent,
  gearContent,
  talentContent,
} from '@creatures/game';
import targetMapJson from '../scalar-targets.json';
import {
  collectScalars,
  renderContentIds,
  renderScalars,
  type ContentCollection,
  type IdSection,
  type Scalar,
  type ScalarInputs,
} from './scalars';
import { TARGETS } from './targets';

// The test tsconfig has no Node types; this global exists in Node.
declare const console: { log(text: string): void; error(text: string): void };

export interface Io {
  out(text: string): void;
  err(text: string): void;
}

const defaultIo: Io = {
  out: (text) => {
    console.log(text);
  },
  err: (text) => {
    console.error(text);
  },
};

/** The generated files, relative to the repo root. */
export const SCALARS_FILE = 'docs/balance/scalars.md';
export const CONTENT_IDS_FILE = 'docs/balance/content-ids.md';

const RULES_SOURCE = 'packages/game/src/rules/config.ts';
const SCHEMA_SOURCES = [
  'packages/game/src/content/schema.ts',
  'packages/game/src/content/expedition-schema.ts',
  'packages/game/src/content/dungeon-schema.ts',
  'packages/game/src/content/gear-schema.ts',
];

/** The repo root (this file is `packages/sim/src/scalars-cli.ts`). */
export function repoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

const TargetMapSchema = v.record(v.string(), v.array(v.pipe(v.string(), v.minLength(1))));

/** The hand-maintained path prefix to sim target map, validated. */
export function loadTargetMap(raw: unknown = targetMapJson): Record<string, string[]> {
  return v.parse(TargetMapSchema, raw);
}

/** Does a target id or `prefix-*` pattern match a real sim target? */
export function targetPatternMatches(pattern: string): boolean {
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return TARGETS.some((t) => t.id.startsWith(prefix));
  }
  return TARGETS.some((t) => t.id === pattern);
}

/** The content groups whose numeric fields are knobs. */
export function contentCollections(): ContentCollection[] {
  return [
    {
      name: 'creatures',
      system: 'content/creatures.json',
      items: content.creatures,
      ignoreKeys: ['stage'],
    },
    { name: 'reactions', system: 'content/reactions.json', items: content.reactions },
    { name: 'bosses', system: 'content/bosses.json', items: content.bosses },
    { name: 'adaptations', system: 'content/adaptations.json', items: content.adaptations },
    {
      name: 'finaleAbilities',
      system: 'content/finale-abilities.json',
      items: content.finaleAbilities,
    },
    { name: 'dungeonFoes', system: 'content/dungeon-foes.json', items: dungeonContent.foes },
    {
      name: 'roomModifiers',
      system: 'content/room-modifiers.json',
      items: dungeonContent.modifiers,
    },
    { name: 'gearLines', system: 'content/gear-lines.json', items: gearContent.lines },
    { name: 'talents', system: 'content/talents.json', items: [...talentContent.byId.values()] },
    {
      name: 'destinations',
      system: 'content/destinations.json',
      items: expeditionContent.destinations,
    },
    { name: 'supplies', system: 'content/supplies.json', items: expeditionContent.supplies },
    { name: 'pushOnGoals', system: 'content/push-on-goals.json', items: expeditionContent.goals },
    {
      name: 'weeklySpecials',
      system: 'content/weekly-specials.json',
      items: expeditionContent.specials,
    },
  ];
}

/** The player-visible content by id, for the "what is new" diff. */
export function idSections(): IdSection[] {
  return [
    { title: 'Creatures', items: content.creatures },
    { title: 'Raid bosses', items: content.bosses },
    { title: 'Dungeon foes', items: dungeonContent.foes },
    { title: 'Room modifiers', items: dungeonContent.modifiers },
    { title: 'Gear bases', items: gearContent.bases },
    { title: 'Gear lines', items: gearContent.lines },
    { title: 'Gear sets', items: gearContent.sets },
    { title: 'Talents', items: [...talentContent.byId.values()] },
    { title: 'Supplies', items: expeditionContent.supplies },
    { title: 'Destinations', items: expeditionContent.destinations },
    { title: 'Push-on goals', items: expeditionContent.goals },
    { title: 'Finale abilities', items: content.finaleAbilities },
    { title: 'Journal sets', items: expeditionContent.journal.sets },
    { title: 'Weekly twists', items: expeditionContent.specials.twists },
  ];
}

/** Everything `collectScalars` needs, from the real game data and source files under `root`. */
export function realInputs(root: string): ScalarInputs {
  return {
    rules: RULES,
    rulesSource: readFileSync(resolve(root, RULES_SOURCE), 'utf8'),
    collections: contentCollections(),
    schemaSources: SCHEMA_SOURCES.map((f) => readFileSync(resolve(root, f), 'utf8')),
    targetMap: loadTargetMap(),
  };
}

/** Every scalar of the real game. */
export function realScalars(root: string): Scalar[] {
  return collectScalars(realInputs(root));
}

/** The generated files as text, keyed by path relative to the repo root. */
export function generate(root: string): Record<string, string> {
  return {
    [SCALARS_FILE]: renderScalars(realScalars(root)),
    [CONTENT_IDS_FILE]: renderContentIds(idSections()),
  };
}

const USAGE = `Usage: pnpm scalars [--check]
Writes docs/balance/scalars.md (every tuning knob of RULES and the content data) and docs/balance/content-ids.md (the player-visible content ids). With --check it writes nothing and exits 1 when either file is stale.`;

/** Writes (or with --check, verifies) the generated files; returns the exit code. */
export function main(
  argv: readonly string[],
  io: Io = defaultIo,
  outRoot: string = repoRoot(),
): number {
  try {
    const { values } = parseArgs({
      args: argv,
      options: { check: { type: 'boolean' }, help: { type: 'boolean' } },
      strict: true,
      allowPositionals: false,
    });
    if (values['help'] === true) {
      io.out(USAGE);
      return 0;
    }
    const files = generate(repoRoot());
    let stale = 0;
    for (const [rel, text] of Object.entries(files)) {
      const path = resolve(outRoot, rel);
      if (values['check'] === true) {
        if (!existsSync(path) || readFileSync(path, 'utf8') !== text) {
          io.err(`${rel} is stale: run pnpm scalars`);
          stale += 1;
        }
        continue;
      }
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
      io.out(`wrote ${rel}`);
    }
    return stale === 0 ? 0 : 1;
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
