#!/usr/bin/env node
// `pnpm worktrees:clean [--yes]`: lists the agent worktrees under .claude/worktrees/ and, with --yes,
// removes the ones whose work is done: no uncommitted changes, not locked (a locked worktree belongs
// to an agent that is still running), and every commit on its branch already in the current branch
// (by content, so cherry-picked work counts as merged; a detached worktree is checked by its HEAD).
// Without --yes it only prints what it would do. The worktrees' branches are kept. Gitignored files in a
// removed worktree (node_modules, builds, caches) go with it. The worktree you run it from is never
// removed, and stale entries whose folder is gone are pruned first. Plain Node, no dependencies.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const WORKTREES_DIR = '.claude/worktrees/';

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

/** Why a worktree must stay (`null` when it can go): locked, uncommitted changes, or commits not in the current branch. */
export function keepReason({ locked, dirty, unmerged }) {
  if (locked) return 'locked (an agent may still be running)';
  if (dirty > 0) return `${dirty} uncommitted change${dirty === 1 ? '' : 's'}`;
  if (unmerged > 0)
    return `${unmerged} commit${unmerged === 1 ? '' : 's'} not in the current branch`;
  return null;
}

/** Whether `dir` is `path` or inside it. */
const within = (dir, path) => dir === path || dir.startsWith(`${path}/`);

export function run(
  argv,
  root = resolve(fileURLToPath(new URL('..', import.meta.url))),
  cwd = process.cwd(),
) {
  const remove = argv.includes('--yes');
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
      const dirty = git(w.path, ['status', '--porcelain']).split('\n').filter(Boolean).length;
      // `git cherry HEAD <commit>` marks with + each commit up to it whose change is not in HEAD.
      const tip = w.branch ?? w.head;
      const unmerged = tip
        ? git(main, ['cherry', 'HEAD', tip])
            .split('\n')
            .filter((l) => l.startsWith('+')).length
        : 1;
      reason = keepReason({ locked: w.locked, dirty, unmerged });
    } catch (error) {
      reason = `could not check (${error instanceof Error ? error.message.split('\n')[0] : String(error)})`;
    }
    if (reason) {
      console.log(`keep    ${name}: ${reason}`);
    } else if (remove) {
      git(main, ['worktree', 'remove', w.path]);
      removed++;
      console.log(`removed ${name}`);
    } else {
      console.log(`done    ${name} (run with --yes to remove)`);
    }
  }
  console.log(`${agents.length} agent worktree(s), ${removed} removed.`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2));
}
