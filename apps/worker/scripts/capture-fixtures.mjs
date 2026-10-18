#!/usr/bin/env node
// Re-captures the contract fixtures of `apps/activity/src/fixtures` from real server output.
//
//   pnpm fixtures:capture                  every set
//   pnpm fixtures:capture --set gear       one set (see test/fixture-sets.ts for the names)
//   pnpm fixtures:capture --check          write nothing; exit 1 if a file would change
//
// It runs `test/capture/capture-all.test.ts` with `vitest.capture.config.ts`, reads the `FIXTURE <json>`
// lines it prints (one per set), gives every UUID a stable id (in order of first appearance within a
// set), writes each file whole, formats it with Prettier and says which files changed. Node only; no
// dependency of its own (vitest and Prettier come from the workspace). Details: docs/design/testing.md.
import { spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(workerDir, '../..');
const fixturesDir = path.join(repoRoot, 'apps/activity/src/fixtures');

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/** `--check`, `--set <name>`; anything else is a usage error. */
export function parseArgs(argv) {
  const options = { check: false, set: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check') options.check = true;
    else if (arg === '--set') {
      const name = argv[++i];
      if (name === undefined || !/^[a-z][a-z-]*$/.test(name)) {
        throw new Error('--set needs a set name such as gear');
      }
      options.set = name;
    } else throw new Error(`unknown argument ${arg} (use --set <name> and --check)`);
  }
  return options;
}

/**
 * Gives every UUID in `value` (in keys and values, so a map keyed by creature id and a path such as
 * `/api/gear/<id>/equip` too) a stable id: `00000000-0000-4000-8<nibble>00-<12 digit counter>`, counted in
 * order of first appearance. The same scenario therefore gives the same ids on every run.
 */
export function stabiliseIds(value, nibble) {
  const ids = new Map();
  const text = JSON.stringify(value).replace(UUID, (id) => {
    let stable = ids.get(id);
    if (stable === undefined) {
      const n = String(ids.size + 1).padStart(12, '0');
      stable = `00000000-0000-4000-8${nibble}00-${n}`;
      ids.set(id, stable);
    }
    return stable;
  });
  return JSON.parse(text);
}

/**
 * The files of one set: `{ file name: value }`. Responses are written under their file name; the error
 * rows and the request bodies each in one file. Ids are made stable over what is written, in the order
 * responses, errors, requests.
 */
export function filesOfSet({ nibble, files, captured }) {
  const responses = {};
  for (const [key, file] of Object.entries(files.responses)) {
    if (!(key in captured.responses)) throw new Error(`the capture has no response ${key}`);
    responses[file] = captured.responses[key];
  }
  const requests = {};
  if (files.requests !== undefined) {
    for (const [key, request] of Object.entries(captured.requests)) {
      if (files.requestKeys === undefined) requests[key] = request;
      else if (key in files.requestKeys) requests[files.requestKeys[key]] = request;
    }
  }
  const stable = stabiliseIds({ responses, errors: captured.errors, requests }, nibble);
  const out = { ...stable.responses };
  out[files.errors] = stable.errors;
  if (files.requests !== undefined) out[files.requests] = stable.requests;
  return out;
}

/** Runs the capture test; resolves with the parsed `FIXTURE` lines (one per set). */
function runCapture(set) {
  const vitest = path.join(
    path.dirname(createRequire(import.meta.url).resolve('vitest/package.json')),
    'vitest.mjs',
  );
  const args = [
    vitest,
    'run',
    '--config',
    'vitest.capture.config.ts',
    '--disable-console-intercept',
    ...(set === null ? [] : ['-t', `capture ${set}$`]),
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: workerDir,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const sets = [];
    const rest = [];
    let pending = '';
    const onLine = (line) => {
      const at = line.indexOf('FIXTURE {');
      if (at === -1) rest.push(line);
      else sets.push(JSON.parse(line.slice(at + 'FIXTURE '.length)));
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      lines.forEach(onLine);
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => rest.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (pending !== '') onLine(pending);
      if (code === 0) resolve(sets);
      else reject(new Error(`vitest failed (exit ${String(code)}):\n${rest.join('\n')}`));
    });
  });
}

/** Formats `files` (paths) with the repo's Prettier config. */
function prettier(files) {
  const bin = createRequire(path.join(repoRoot, 'package.json')).resolve(
    'prettier/bin/prettier.cjs',
  );
  const config = path.join(repoRoot, '.prettierrc.json');
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [bin, '--write', '--log-level', 'warn', '--config', config, ...files],
      { cwd: repoRoot, stdio: ['ignore', 'inherit', 'inherit'] },
    );
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`prettier failed (exit ${String(code)})`)),
    );
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sets = await runCapture(options.set);
  if (sets.length === 0)
    throw new Error(`no fixture set was captured (set: ${options.set ?? 'all'})`);
  if (options.set !== null && !sets.some((s) => s.set === options.set)) {
    throw new Error(`no fixture set called ${options.set}`);
  }

  // Stage every file in a temp dir, format it there, then compare with the real one.
  const staging = mkdtempSync(path.join(tmpdir(), 'fixtures-'));
  try {
    const staged = new Map();
    for (const set of sets) {
      for (const [file, value] of Object.entries(filesOfSet(set))) {
        if (staged.has(file)) throw new Error(`${file} is written by two sets`);
        const target = path.join(staging, file);
        writeFileSync(target, JSON.stringify(value, null, 2) + '\n');
        staged.set(file, target);
      }
    }
    await prettier([...staged.values()]);

    const changed = [];
    for (const [file, target] of staged) {
      const real = path.join(fixturesDir, file);
      const next = readFileSync(target, 'utf8');
      const before = existsSync(real) ? readFileSync(real, 'utf8') : null;
      if (before === next) continue;
      changed.push(file);
      if (!options.check) copyFileSync(target, real);
    }
    changed.sort();
    const total = String(staged.size);
    if (options.check) {
      if (changed.length === 0) console.log(`fixtures are up to date (${total} files checked)`);
      else {
        console.error(
          `${String(changed.length)} of ${total} fixture files differ from a fresh capture:`,
        );
        for (const file of changed) console.error(`  ${file}`);
        console.error('run `pnpm fixtures:capture` and review the diff');
        process.exitCode = 1;
      }
    } else {
      console.log(`captured ${total} files, ${String(changed.length)} changed:`);
      for (const file of changed) console.log(`  ${file}`);
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

// Only run when started as a script, so the tests of the pure helpers can import this file.
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
