import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  CONTENT_IDS_PATH,
  LOG_PATH,
  SCALARS_PATH,
  buildDraft,
  defaultFrom,
  parseRange,
  renderDraftMarkdown,
  showFile,
  validateRef,
  type GitRunner,
  type ResolvedFrom,
} from './patch-notes';
import { repoRoot } from './scalars-cli';

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

export interface Deps {
  git: GitRunner;
  /** Writes a text file, creating its folder. */
  writeText(path: string, text: string): void;
}

/** Real git (argument arrays, no shell), run in the repo root. */
export function realDeps(root: string = repoRoot()): Deps {
  return {
    git: (args) =>
      execFileSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    writeText: (path, text) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    },
  };
}

const USAGE = `Usage: pnpm patch-notes [from..to] [--json] [--out <folder>]
Drafts patch notes from what changed between two git refs: pull requests, balance log entries, content added or removed, and changed numbers (docs/balance/scalars.md at both refs).
Default range: the latest balance-* tag to HEAD. With no such tag yet: origin/main to HEAD, or the root commit when origin/main is missing or is HEAD. The output says which was used.
Prints Markdown (or JSON with --json). With --out <folder> it writes draft.md and draft.json there instead (docs/patch-notes is fine; do not commit drafts).`;

/** Builds and prints (or writes) the draft; returns the exit code. */
export function main(argv: readonly string[], io: Io = defaultIo, deps: Deps = realDeps()): number {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: {
        json: { type: 'boolean' },
        out: { type: 'string' },
        help: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: true,
    });
    if (values['help'] === true) {
      io.out(USAGE);
      return 0;
    }
    if (positionals.length > 1) throw new Error(USAGE);
    const range = parseRange(positionals[0] ?? '..');
    const to = range.to ?? 'HEAD';
    validateRef(to);
    const from: ResolvedFrom =
      range.from === null
        ? defaultFrom(deps.git, to)
        : { ref: range.from, basis: 'the range you gave' };

    const subjects = deps
      .git(['log', '--format=%s', `${from.ref}..${to}`, '--'])
      .split('\n')
      .filter((s) => s !== '');
    const draft = buildDraft({
      from,
      to,
      subjects,
      baseScalars: showFile(deps.git, from.ref, SCALARS_PATH),
      headScalars: showFile(deps.git, to, SCALARS_PATH),
      baseIds: showFile(deps.git, from.ref, CONTENT_IDS_PATH),
      headIds: showFile(deps.git, to, CONTENT_IDS_PATH),
      headLog: showFile(deps.git, to, LOG_PATH),
    });
    const markdown = renderDraftMarkdown(draft);
    const json = `${JSON.stringify(draft, null, 2)}\n`;

    const out = values['out'];
    if (typeof out === 'string') {
      const folder = resolve(out);
      deps.writeText(join(folder, 'draft.md'), markdown);
      deps.writeText(join(folder, 'draft.json'), json);
      io.out(`wrote ${join(out, 'draft.md')} and ${join(out, 'draft.json')} (${from.basis})`);
    } else {
      io.out(values['json'] === true ? json : markdown);
    }
    return 0;
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
