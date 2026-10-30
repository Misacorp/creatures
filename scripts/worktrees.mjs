#!/usr/bin/env node
// `pnpm worktrees:clean [--yes]`: lists the agent worktrees under .claude/worktrees/ and, with --yes,
// removes the ones whose work is done: no uncommitted changes, not locked (a locked worktree belongs
// to an agent that is still running), and every commit on its branch already in the current branch
// (by content, so cherry-picked work counts as merged). Without --yes it only prints what it would do.
// The worktrees' branches are kept. Plain Node, no dependencies.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const WORKTREES_DIR = '.claude/worktrees/';

const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });

/** The `git worktree list --porcelain` output as records: path, branch (or null) and whether it is locked. */
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
        branch: branch ? branch.slice('branch '.length).replace(/^refs\/heads\//, '') : null,
        locked: field('locked') !== undefined,
      };
    });
}

/** Why a worktree must stay (`null` when it can go): locked, uncommitted changes, or commits not in the current branch. */
export function keepReason({ locked, dirty, unmerged }) {
  if (locked) return 'locked (an agent may still be running)';
  if (dirty > 0) return `${dirty} uncommitted change${dirty === 1 ? '' : 's'}`;
  if (unmerged > 0)
    return `${unmerged} commit${unmerged === 1 ? '' : 's'} not in the current branch`;
  return null;
}

export function run(argv, root = resolve(fileURLToPath(new URL('..', import.meta.url)))) {
  const remove = argv.includes('--yes');
  const all = parseWorktrees(git(root, ['worktree', 'list', '--porcelain']));
  const agents = all.filter((w) => w.path.includes(`/${WORKTREES_DIR}`));
  if (agents.length === 0) {
    console.log('No agent worktrees.');
    return 0;
  }
  let removed = 0;
  for (const w of agents) {
    const dirty = git(w.path, ['status', '--porcelain']).split('\n').filter(Boolean).length;
    // `git cherry HEAD <branch>` marks with + each commit of the branch whose change is not in HEAD.
    const unmerged = w.branch
      ? git(root, ['cherry', 'HEAD', w.branch])
          .split('\n')
          .filter((l) => l.startsWith('+')).length
      : 0;
    const reason = keepReason({ locked: w.locked, dirty, unmerged });
    const name = w.path.slice(w.path.indexOf(WORKTREES_DIR) + WORKTREES_DIR.length);
    if (reason) {
      console.log(`keep    ${name}: ${reason}`);
    } else if (remove) {
      git(root, ['worktree', 'remove', w.path]);
      removed++;
      console.log(`removed ${name}`);
    } else {
      console.log(`done    ${name} (run with --yes to remove)`);
    }
  }
  if (remove) git(root, ['worktree', 'prune']);
  console.log(`${agents.length} agent worktree(s), ${removed} removed.`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2));
}
