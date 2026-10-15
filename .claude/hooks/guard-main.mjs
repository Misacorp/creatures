#!/usr/bin/env node
/**
 * A Claude Code PreToolUse hook for Bash: refuses any command that would push to `main` or merge a
 * pull request. `main` deploys production, and only Misa merges into it (see CLAUDE.md). This is a
 * second lock on the agent's side; GitHub's branch rules on `main` are the first.
 *
 * It refuses:
 * - `git push` with a refspec whose destination is main (`main`, `HEAD:main`, `+main`,
 *   `refs/heads/main`, `x:main`), `HEAD` or no refspec while the current branch is main, `--all`,
 *   `--mirror`, and refspecs it cannot read (shell variables, command substitution);
 * - `gh pr merge`, and `gh api` calls that merge or write refs.
 * Nested shells (`bash -c "..."`, `sh -c`, `eval`) are checked too.
 *
 * Input is the hook JSON on stdin; exit code 2 blocks the command and shows the reason to the agent.
 * Pure parts are exported for the tests (`guard-main.test.mjs`, run by `pnpm test`).
 */
/* global console */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const PROTECTED = 'main';

/**
 * Splits a shell command into simple commands (on `;`, `&&`, `||`, `|`, `&` and newlines) and each
 * into words, honouring single and double quotes and backslashes. Rough, but enough to find a push.
 */
export function splitCommands(command) {
  const commands = [];
  let words = [];
  let word = '';
  let inWord = false;
  let quote = null;
  const endWord = () => {
    if (inWord) words.push(word);
    word = '';
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length > 0) commands.push(words);
    words = [];
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote !== null) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < command.length) word += command[++i];
      else word += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      inWord = true;
    } else if (c === '\\' && i + 1 < command.length) {
      word += command[++i];
      inWord = true;
    } else if (c === ' ' || c === '\t') {
      endWord();
    } else if (c === ';' || c === '\n' || c === '|' || c === '&' || c === '(' || c === ')') {
      endCommand();
    } else {
      word += c;
      inWord = true;
    }
  }
  endCommand();
  return commands;
}

/** Git's global options that take a separate value (`git -C dir push`). */
const GIT_OPTS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace']);

/** Push options that take a separate value. */
const PUSH_OPTS_WITH_VALUE = new Set(['--repo', '--receive-pack', '--exec', '-o', '--push-option']);

/** The branch a refspec writes to, without `+` and `refs/heads/`. */
function destination(refspec) {
  const spec = refspec.startsWith('+') ? refspec.slice(1) : refspec;
  const colon = spec.lastIndexOf(':');
  const dst = colon === -1 ? spec : spec.slice(colon + 1);
  return dst.startsWith('refs/heads/') ? dst.slice('refs/heads/'.length) : dst;
}

/**
 * Why a `git push` (its words after `push`) would reach main, or null when it would not.
 * `currentBranch` is the branch checked out where the push runs (null when unknown).
 */
export function pushProblem(args, currentBranch) {
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--all' || a === '--mirror' || a === '--branches') {
      return `\`git push ${a}\` would push ${PROTECTED} too.`;
    }
    if (PUSH_OPTS_WITH_VALUE.has(a)) {
      i++;
      continue;
    }
    if (a.startsWith('-')) continue;
    positional.push(a);
  }
  const refspecs = positional.slice(1);
  for (const spec of refspecs) {
    if (/[$`]/.test(spec)) {
      return `the refspec \`${spec}\` is not a plain branch name; push with a literal branch name.`;
    }
    const dst = destination(spec);
    if (dst === PROTECTED) return `it pushes to ${PROTECTED}.`;
    if ((dst === 'HEAD' || dst === '@') && currentBranch === PROTECTED) {
      return `HEAD is ${PROTECTED} here.`;
    }
  }
  if (refspecs.length === 0 && currentBranch === PROTECTED) {
    return `the current branch is ${PROTECTED}, so a bare push would update it.`;
  }
  return null;
}

/** Why one simple command (as words) is refused, or null. `branchAt(dir)` reads the checked-out branch. */
function commandProblem(words, branchAt, cwd) {
  let i = 0;
  // Leading `VAR=value` assignments and `env` / `command` wrappers.
  while (
    i < words.length &&
    (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]) || words[i] === 'env' || words[i] === 'command')
  ) {
    i++;
  }
  const head = words[i];
  if (head === undefined) return null;
  const rest = words.slice(i + 1);

  // Nested shells: check the script they run.
  if ((head === 'bash' || head === 'sh' || head === 'zsh') && rest.includes('-c')) {
    const script = rest[rest.indexOf('-c') + 1];
    return script === undefined ? null : scriptProblem(script, branchAt, cwd);
  }
  if (head === 'eval') return scriptProblem(rest.join(' '), branchAt, cwd);

  if (head === 'gh') {
    if (rest[0] === 'pr' && rest[1] === 'merge') return 'only Misa merges pull requests.';
    if (rest[0] === 'api' && rest.some((w) => /\/merges?\b|\/git\/refs/.test(w))) {
      return 'it merges or writes refs through the GitHub API.';
    }
    return null;
  }

  if (head !== 'git') return null;
  let dir = cwd;
  let j = 0;
  while (j < rest.length && rest[j].startsWith('-')) {
    if (rest[j] === '-C') dir = rest[j + 1] ?? dir;
    j += GIT_OPTS_WITH_VALUE.has(rest[j]) ? 2 : 1;
  }
  if (rest[j] !== 'push') return null;
  return pushProblem(rest.slice(j + 1), branchAt(dir));
}

/** Why a whole Bash command is refused, or null when it may run. */
export function scriptProblem(command, branchAt, cwd) {
  for (const words of splitCommands(command)) {
    const problem = commandProblem(words, branchAt, cwd);
    if (problem !== null) return problem;
  }
  return null;
}

/** The checked-out branch in `dir`, or null when it cannot be read. */
function currentBranchIn(dir) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return 0;
  }
  const command = input?.tool_input?.command;
  if (typeof command !== 'string') return 0;
  const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();
  const problem = scriptProblem(command, currentBranchIn, cwd);
  if (problem === null) return 0;
  console.error(
    `Blocked by .claude/hooks/guard-main.mjs: ${problem} main deploys production and only Misa ` +
      'merges into it. Push your own branch and open a pull request instead.',
  );
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main();
}
