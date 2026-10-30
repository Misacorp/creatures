// Tests for scripts/worktrees.mjs. The end-to-end test builds a throwaway repo in a temp directory, so
// the real repo's worktrees are never touched. Run: node --test 'scripts/*.test.mjs'
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { keepReason, parseWorktrees, run } from './worktrees.mjs';

describe('parseWorktrees', () => {
  test('reads path, branch and lock from the porcelain output', () => {
    const out = [
      'worktree /repo',
      'HEAD abc',
      'branch refs/heads/main',
      '',
      'worktree /repo/.claude/worktrees/agent-1',
      'HEAD def',
      'branch refs/heads/worktree-agent-1',
      'locked',
      '',
      'worktree /repo/.claude/worktrees/agent-2',
      'HEAD 123',
      'detached',
      '',
    ].join('\n');
    assert.deepEqual(parseWorktrees(out), [
      { path: '/repo', head: 'abc', branch: 'main', locked: false, prunable: false },
      {
        path: '/repo/.claude/worktrees/agent-1',
        head: 'def',
        branch: 'worktree-agent-1',
        locked: true,
        prunable: false,
      },
      {
        path: '/repo/.claude/worktrees/agent-2',
        head: '123',
        branch: null,
        locked: false,
        prunable: false,
      },
    ]);
  });
});

describe('keepReason', () => {
  test('a clean, unlocked worktree whose commits are all in the current branch can go', () => {
    assert.equal(keepReason({ locked: false, dirty: 0, unmerged: 0 }), null);
  });
  test('locked, dirty or unmerged work stays', () => {
    assert.match(keepReason({ locked: true, dirty: 0, unmerged: 0 }), /locked/);
    assert.match(keepReason({ locked: false, dirty: 2, unmerged: 0 }), /2 uncommitted changes/);
    assert.match(keepReason({ locked: false, dirty: 0, unmerged: 1 }), /1 commit not in/);
  });
});

describe('run, on a throwaway repo', () => {
  const root = mkdtempSync(join(tmpdir(), 'worktrees-test-'));
  after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  const commit = (dir, file, text) => {
    writeFileSync(join(dir, file), text);
    execFileSync('git', ['-C', dir, 'add', file]);
    execFileSync('git', [
      '-C',
      dir,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      'commit',
      '-qm',
      file,
    ]);
  };

  test('removes only the worktree whose work is in the current branch (cherry-picked counts)', () => {
    git('init', '-q', '-b', 'main');
    commit(root, 'a.txt', 'a');
    const wt = (name) => join(root, '.claude', 'worktrees', name);
    for (const name of ['merged', 'unmerged', 'dirty', 'locked', 'here'])
      git('worktree', 'add', '-q', '-b', `wt-${name}`, wt(name));
    // A detached worktree with a commit no branch holds, and one whose folder was deleted.
    git('worktree', 'add', '-q', '--detach', wt('detached work'));
    commit(wt('detached work'), 'x.txt', 'x');
    git('worktree', 'add', '-q', '-b', 'wt-gone', wt('gone'));
    rmSync(wt('gone'), { recursive: true, force: true });
    commit(wt('merged'), 'm.txt', 'm');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'cherry-pick', 'wt-merged');
    commit(wt('unmerged'), 'u.txt', 'u');
    writeFileSync(join(wt('dirty'), 'd.txt'), 'd');
    git('worktree', 'lock', wt('locked'));

    const log = [];
    const original = console.log;
    console.log = (line) => log.push(line);
    try {
      // Run from inside the `here` worktree: it must never remove itself.
      run(['--yes'], root, wt('here'));
    } finally {
      console.log = original;
    }
    assert.equal(existsSync(wt('merged')), false);
    for (const name of ['unmerged', 'dirty', 'locked', 'here', 'detached work'])
      assert.equal(existsSync(wt(name)), true, name);
    assert.ok(log.some((l) => l.startsWith('keep    here: you are running from it')));
    assert.ok(log.some((l) => l.startsWith('keep    detached work: 1 commit not in')));
    // The stale entry was pruned and did not stop the run.
    assert.doesNotMatch(git('worktree', 'list'), /gone/);
    assert.ok(log.some((l) => l.startsWith('removed merged')));
    assert.ok(log.some((l) => l.includes('1 commit not in the current branch')));
    assert.ok(log.some((l) => l.includes('uncommitted change')));
    assert.ok(log.some((l) => l.includes('locked')));
    // The branches are kept.
    assert.match(git('branch', '--list', 'wt-merged'), /wt-merged/);
  });
});
