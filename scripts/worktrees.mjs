#!/usr/bin/env node
// `pnpm worktrees:clean [--yes]`: lists the agent worktrees under .claude/worktrees/ and, with --yes,
// removes the ones whose work is done: no uncommitted changes, not locked (a locked worktree belongs
// to an agent that is still running), and every commit on its branch already in the current branch
// (by content, so cherry-picked work counts as merged; a detached worktree is checked by its HEAD).
// Without --yes it only prints what it would do. The worktrees' branches are kept. Gitignored files in a
// removed worktree (node_modules, builds, caches) go with it. The worktree you run it from is never
// removed, and stale entries whose folder is gone are pruned first. Plain Node, no dependencies.
//
// `--unlock-finished`: agent worktrees stay locked after their agent finishes. With this flag a LOCKED worktree is unlocked
// and removed (with --yes) when all of these hold: no uncommitted or untracked changes; every commit is in the current branch,
// cherry-picked there (same patch), or on a remote branch (`git branch -r --contains`); and none of its files has changed for
// IDLE_MINUTES (a running agent touches files). Each worktree that stays prints why.
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const WORKTREES_DIR = '.claude/worktrees/';
/** How long a locked worktree's files must have been still before `--unlock-finished` may take it (a running agent touches files). */
export const IDLE_MINUTES = 30;

const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });

/** The `git worktree list --porcelain` output as records: path, HEAD, branch (or null), locked and prunable. */
export function parseWorktrees(porcelain) {
  return porcelain
    .split('\n\n')
    .map((block) => block.split('\n').filter(Boolean))
    .filter((lines) => lines.length > 0)
    .map((lines) => {
      const field = (name) => lines.find((l) => l === name || l.startsWith(`${name} `));
      const branch = field('branch');
      return {
        path: field('worktree').slice('worktree '.length),
        head: field('HEAD')?.slice('HEAD '.length) ?? null,
        branch: branch ? branch.slice('branch '.length).replace(/^refs\/heads\//, '') : null,
        locked: field('locked') !== undefined,
        prunable: field('prunable') !== undefined,
      };
    });
}

/**
 * Why a worktree must stay (`null` when it can go): locked, uncommitted changes, commits not in the current branch, and (a locked
 * one under `unlockFinished`) files changed less than `IDLE_MINUTES` ago. `unmerged` counts the commits neither in the current
 * branch nor, under `unlockFinished`, on a remote branch.
 */
export function keepReason({
  locked,
  dirty,
  unmerged,
  unlockFinished = false,
  idleMinutes = Infinity,
}) {
  if (locked && !unlockFinished) return 'locked (an agent may still be running)';
  if (dirty > 0) return `${dirty} uncommitted change${dirty === 1 ? '' : 's'}`;
  if (unmerged > 0)
    return `${unmerged} commit${unmerged === 1 ? '' : 's'} not in the current branch${locked ? ' or on any remote branch' : ''}`;
  if (locked && idleMinutes < IDLE_MINUTES)
    return `locked, and its files changed ${Math.floor(idleMinutes)} minute${Math.floor(idleMinutes) === 1 ? '' : 's'} ago (an agent may still be running; waits ${IDLE_MINUTES})`;
  return null;
}

/** The newest change among a worktree's files (tracked and untracked, not ignored), its folder, and its HEAD and HEAD log, in ms. */
export function lastTouched(worktree) {
  const gitDir = resolve(worktree, git(worktree, ['rev-parse', '--git-dir']).trim());
  const files = git(worktree, ['ls-files', '-co', '--exclude-standard', '-z'])
    .split('\0')
    .filter(Boolean);
  let newest = 0;
  for (const rel of [...files, '']) newest = Math.max(newest, mtime(join(worktree, rel)));
  for (const rel of ['HEAD', 'logs/HEAD']) newest = Math.max(newest, mtime(join(gitDir, rel)));
  return newest;
}

/** A file's modification time, 0 when it is gone. */
function mtime(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

/** The commits of `tip` whose change is not in the current branch (`git cherry`; a cherry-pick counts as merged). */
function notInBranch(main, tip) {
  return git(main, ['cherry', 'HEAD', tip])
    .split('\n')
    .filter((l) => l.startsWith('+'))
    .map((l) => l.slice(1).trim());
}

/** Whether a remote branch holds `commit`. */
function onRemote(main, commit) {
  return git(main, ['branch', '-r', '--contains', commit])
    .split('\n')
    .some((l) => l.trim() !== '' && !l.includes('->'));
}

/** Whether `dir` is `path` or inside it. */
const within = (dir, path) => dir === path || dir.startsWith(`${path}/`);

export function run(
  argv,
  root = resolve(fileURLToPath(new URL('..', import.meta.url))),
  cwd = process.cwd(),
  now = Date.now(),
) {
  const remove = argv.includes('--yes');
  const unlockFinished = argv.includes('--unlock-finished');
  // Entries whose folder is gone hold no work; prune them first so they cannot stop the rest.
  if (remove) git(root, ['worktree', 'prune']);
  const all = parseWorktrees(git(root, ['worktree', 'list', '--porcelain']));
  // The first entry is always the main checkout: compare against its HEAD and remove from there.
  const main = all[0]?.path ?? root;
  const agents = all.filter((w) => w.path.includes(`/${WORKTREES_DIR}`));
  if (agents.length === 0) {
    console.log('No agent worktrees.');
    return 0;
  }
  let removed = 0;
  for (const w of agents) {
    const name = w.path.slice(w.path.indexOf(WORKTREES_DIR) + WORKTREES_DIR.length);
    if (w.prunable) {
      console.log(`stale   ${name}: its folder is gone (pruned with --yes)`);
      continue;
    }
    if (within(resolve(cwd), w.path) || within(root, w.path)) {
      console.log(`keep    ${name}: you are running from it`);
      continue;
    }
    let reason;
    try {
      // Read the files' ages first: `git status` may refresh the index, which says nothing about an agent.
      const finishing = w.locked && unlockFinished;
      const idleMinutes = finishing ? (now - lastTouched(w.path)) / 60_000 : Infinity;
      const dirty = git(w.path, ['status', '--porcelain']).split('\n').filter(Boolean).length;
      // `git cherry HEAD <commit>` marks with + each commit up to it whose change is not in HEAD.
      const tip = w.branch ?? w.head;
      let pending = tip ? notInBranch(main, tip) : ['?'];
      // A finished agent's work may be on a remote branch instead (pushed, or merged there by a pull request).
      if (finishing && tip) pending = pending.filter((c) => !onRemote(main, c));
      reason = keepReason({
        locked: w.locked,
        dirty,
        unmerged: pending.length,
        unlockFinished,
        idleMinutes,
      });
    } catch (error) {
      reason = `could not check (${error instanceof Error ? error.message.split('\n')[0] : String(error)})`;
    }
    if (reason) {
      console.log(`keep    ${name}: ${reason}`);
    } else if (remove) {
      if (w.locked) git(main, ['worktree', 'unlock', w.path]);
      git(main, ['worktree', 'remove', w.path]);
      removed++;
      console.log(`removed ${name}${w.locked ? ' (was locked; its agent has finished)' : ''}`);
    } else {
      console.log(`done    ${name} (run with --yes to ${w.locked ? 'unlock and ' : ''}remove)`);
    }
  }
  console.log(`${agents.length} agent worktree(s), ${removed} removed.`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2));
}
