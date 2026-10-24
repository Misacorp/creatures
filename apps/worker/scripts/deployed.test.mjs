import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesExpected, parseConfig } from './deployed.mjs';

const SHA = 'a'.repeat(40);

test('reads only a plain branch name and a 40-character hex commit', () => {
  assert.deepEqual(parseConfig({ version: SHA, branch: 'ccr-1/x_y.z' }), {
    version: SHA,
    branch: 'ccr-1/x_y.z',
  });
  assert.deepEqual(parseConfig({ version: 'dev', branch: 'has space' }), {
    version: null,
    branch: null,
  });
  assert.deepEqual(parseConfig(null), { version: null, branch: null });
});

test('matches a commit when one was resolved, else a branch name', () => {
  const deployed = { version: SHA, branch: 'feature' };
  assert.equal(matchesExpected(deployed, undefined, null), true);
  assert.equal(matchesExpected(deployed, 'HEAD', SHA), true);
  assert.equal(matchesExpected(deployed, 'HEAD', 'b'.repeat(40)), false);
  assert.equal(matchesExpected(deployed, 'feature', null), true);
  assert.equal(matchesExpected(deployed, 'other', null), false);
  assert.equal(matchesExpected({ version: null, branch: null }, 'feature', null), false);
});
