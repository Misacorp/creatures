#!/usr/bin/env node
// Stop hook: when a branch changes code but records no decision, asks once (per set of changed files)
// whether a decision is worth keeping. Also blocks, once per distinct output, when the decisions folder
// is out of date (`pnpm decisions check` fails). It never blocks twice for the same thing, and it
// stays quiet when origin/main is unknown.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const CODE_PREFIXES = ['apps/', 'packages/', 'scripts/', '.github/', '.claude/'];

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

const lines = (text) => text.split('\n').filter(Boolean);
const isDecisionFile = (f) =>
  f.startsWith('docs/design/decisions/') && f !== 'docs/design/decisions/README.md';

function block(reason) {
  console.log(JSON.stringify({ decision: 'block', reason }));
}

function topics(cwd) {
  try {
    const list = JSON.parse(
      readFileSync(resolve(cwd, 'docs/design/decisions/topics.json'), 'utf8'),
    );
    return list.map((t) => t.id).join(', ');
  } catch {
    return 'see `pnpm decisions topics`';
  }
}

function nudgeText(cwd) {
  return [
    'Decisions reminder (from the decisions-nudge hook, not from Misa):',
    'this branch changes code but records no decision.',
    'Before you finish, decide whether it made a decision worth keeping (a rule, a trade-off, a reason, an answer from Misa).',
    `If yes, record it with \`pnpm decisions new --topic <t> --title "..."\` (topics: ${topics(cwd)}), write the body, and update docs/progress.md if a roadmap step landed.`,
    'If no, just finish. This reminder will not repeat for these files.',
  ].join(' ');
}

try {
  let raw = '';
  for await (const chunk of process.stdin) raw += String(chunk);
  const input = JSON.parse(raw);
  const cwd = resolve(input.cwd || process.env.CLAUDE_PROJECT_DIR || '.');
  if (input.stop_hook_active !== true) {
    const base = git(cwd, ['merge-base', 'HEAD', 'origin/main']).trim();
    const changed = new Set([
      ...lines(git(cwd, ['diff', '--name-only', base])),
      ...lines(git(cwd, ['ls-files', '--others', '--exclude-standard'])),
    ]);
    const files = [...changed].sort();
    const gitDir = resolve(cwd, git(cwd, ['rev-parse', '--git-dir']).trim());
    const stateFile = resolve(gitDir, 'decisions-nudge.json');
    let state = {};
    try {
      state = JSON.parse(readFileSync(stateFile, 'utf8'));
    } catch {
      // No state yet.
    }
    const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    const mine = (state[branch] ??= { files: [], checks: [] });
    const save = () => {
      mkdirSync(dirname(stateFile), { recursive: true });
      writeFileSync(stateFile, JSON.stringify(state));
    };

    const code = files.filter((f) => CODE_PREFIXES.some((p) => f.startsWith(p)));
    const recorded = files.some(isDecisionFile) || changed.has('docs/progress.md');
    if (code.length && !recorded) {
      const seen = new Set(mine.files);
      if (code.some((f) => !seen.has(f))) {
        mine.files = code;
        save();
        block(nudgeText(cwd));
      }
    } else if (files.some(isDecisionFile) && existsSync(resolve(cwd, 'scripts/decisions.mjs'))) {
      const result = spawnSync('node', ['scripts/decisions.mjs', 'check'], {
        cwd,
        encoding: 'utf8',
        timeout: 15_000,
      });
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
      if (result.status !== 0 && !mine.checks.includes(output)) {
        mine.checks.push(output);
        save();
        block(
          `pnpm decisions check fails. Run \`pnpm decisions fix\` and fix what it lists:\n${output}`,
        );
      }
    }
  }
} catch {
  // A hook must never break the session (no origin/main, no git, and so on).
}
