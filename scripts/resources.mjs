#!/usr/bin/env node
// `pnpm resources rename <id> <Name> [<plural>] [--dry-run]`: rename a resource in the resource
// library (packages/game/src/content/data/resources.json) and rewrite that word in the content text
// (glossary, how-to-play, dungeon events, journal, stall ...). Prints every file and line it changes,
// so a rename is one command plus a review. `--dry-run` prints without writing. Code needs no edit:
// screens read names from the library. The id (the storage key) never changes.
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { renameResource } from './resources-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(resolve(HERE, '..'), 'packages/game/src/content/data');

const USAGE = 'Usage: pnpm resources rename <id> <Name> [<plural>] [--dry-run]';

export function run(argv, dataDir = DATA_DIR) {
  const dry = argv.includes('--dry-run');
  const args = argv.filter((a) => a !== '--dry-run');
  const [command, id, name, plural] = args;
  if (command !== 'rename' || id === undefined || name === undefined || args.length > 4) {
    console.error(USAGE);
    return 1;
  }
  let changes;
  try {
    changes = renameResource({ dataDir, id, name, plural, write: !dry });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  for (const c of changes) {
    console.log(`${c.file}:${String(c.line)}\n  - ${c.before}\n  + ${c.after}`);
  }
  console.log(
    `${dry ? 'Would change' : 'Changed'} ${String(changes.length)} line${changes.length === 1 ? '' : 's'}.`,
  );
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2));
}
