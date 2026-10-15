import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { URL, fileURLToPath } from 'node:url';
import { scriptProblem, splitCommands } from './guard-main.mjs';

const onBranch = (branch) => () => branch;

describe('guard-main: pushes that reach main are refused', () => {
  const refused = [
    'git push origin main',
    'git push -u origin main',
    'git push origin HEAD:main',
    'git push origin +main',
    'git push origin feature:refs/heads/main',
    'git push origin x:main --force-with-lease',
    'git push --all origin',
    'git push --mirror origin',
    'git -C /repo push origin main',
    'cd /repo && git push origin main',
    'git status; git push origin main',
    'FOO=1 git push origin main',
    'bash -c "git push origin main"',
    "sh -c 'cd x && git push origin HEAD:main'",
    'eval git push origin main',
    'git push origin "$BRANCH"',
    'git push origin $(git branch --show-current)',
    'gh pr merge 23 --squash',
    'gh api -X PUT repos/Misacorp/creatures/pulls/23/merge',
  ];
  for (const command of refused) {
    it(command, () => {
      assert.notEqual(scriptProblem(command, onBranch('feature'), '/repo'), null);
    });
  }

  it('a bare push or HEAD while on main', () => {
    assert.notEqual(scriptProblem('git push', onBranch('main'), '/repo'), null);
    assert.notEqual(scriptProblem('git push -u origin', onBranch('main'), '/repo'), null);
    assert.notEqual(scriptProblem('git push origin HEAD', onBranch('main'), '/repo'), null);
  });
});

describe('guard-main: ordinary work is allowed', () => {
  const allowed = [
    'git push -u origin ccr-9c099cd6-3t86xs',
    'git push origin feature/main-menu',
    'git push origin main-fix',
    'git push origin HEAD',
    'git push',
    'git fetch origin main',
    'git checkout -B work origin/main',
    'git log origin/main --oneline',
    'git pull origin main',
    'echo "git push origin main"',
    'pnpm test',
    'gh pr view 23',
  ];
  for (const command of allowed) {
    it(command, () => {
      assert.equal(scriptProblem(command, onBranch('feature'), '/repo'), null);
    });
  }
});

describe('guard-main: splitting', () => {
  it('splits on operators and keeps quoted words whole', () => {
    assert.deepEqual(splitCommands('a "b c" && d \'e;f\' | g'), [
      ['a', 'b c'],
      ['d', 'e;f'],
      ['g'],
    ]);
  });
});

describe('guard-main: as a hook', () => {
  const hook = fileURLToPath(new URL('./guard-main.mjs', import.meta.url));
  const run = (command) => {
    try {
      execFileSync('node', [hook], {
        input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: '/' }),
        stdio: ['pipe', 'ignore', 'pipe'],
      });
      return 0;
    } catch (err) {
      return err.status;
    }
  };

  it('exits 2 for a push to main and 0 otherwise', () => {
    assert.equal(run('git push origin main'), 2);
    assert.equal(run('git push origin feature'), 0);
  });

  it('lets anything through that is not a Bash command it can read', () => {
    assert.equal(run(''), 0);
  });
});
