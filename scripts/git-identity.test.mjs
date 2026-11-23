import assert from 'node:assert/strict';
import { test } from 'node:test';
import { identityFrom } from '../.claude/hooks/git-identity.mjs';

test('takes the name and email from the owner file', () => {
  assert.deepEqual(
    identityFrom({ github: 'Someone', commitEmail: '1+Someone@users.noreply.github.com' }),
    { name: 'Someone', email: '1+Someone@users.noreply.github.com' },
  );
});

test('gives nothing for a missing or malformed email', () => {
  assert.equal(identityFrom(null), null);
  assert.equal(identityFrom({ github: 'x' }), null);
  assert.equal(identityFrom({ commitEmail: 'not an email' }), null);
  assert.equal(identityFrom({ commitEmail: 42 }), null);
});
