// node --test: the pure parts of the fixture capture script (capture-fixtures.mjs).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filesOfSet, parseArgs, stabiliseIds } from './capture-fixtures.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

test('ids become stable in order of first appearance, in values, keys and paths', () => {
  const live = {
    first: { id: B, hp: { [A]: 10, [B]: 20 } },
    second: { path: `/api/gear/${A}/equip`, other: C, again: B },
  };
  assert.deepEqual(stabiliseIds(live, '5'), {
    first: {
      id: '00000000-0000-4000-8500-000000000001',
      hp: {
        '00000000-0000-4000-8500-000000000002': 10,
        '00000000-0000-4000-8500-000000000001': 20,
      },
    },
    second: {
      path: '/api/gear/00000000-0000-4000-8500-000000000002/equip',
      other: '00000000-0000-4000-8500-000000000003',
      again: '00000000-0000-4000-8500-000000000001',
    },
  });
});

test('the same scenario with other random ids gives the same output', () => {
  const run = (x, y) => ({ a: { id: x }, b: [y, x], c: `/r/${y}` });
  const one = stabiliseIds(run(A, B), '3');
  const two = stabiliseIds(run(C, A), '3');
  assert.deepEqual(one, two);
  assert.notDeepEqual(stabiliseIds(run(A, B), '4'), one);
});

test('text that is not a UUID is left alone', () => {
  const value = { key: 'fixture-00000001-key', route: 'POST /api/x/:id', n: 3, no: null };
  assert.deepEqual(stabiliseIds(value, '1'), value);
});

const set = {
  nibble: '5',
  files: {
    responses: { 'gear-final': 'gear-state.json', welcome: 'welcome.json' },
    skipped: ['loose'],
    errors: 'errors.json',
    requests: 'requests.json',
    requestKeys: { 'job-start': 'job-craft', 'gear-equip-again': 'dropped-by-name' },
  },
  captured: {
    responses: { 'gear-final': { id: A }, welcome: { id: B }, loose: { id: C } },
    errors: [{ route: 'POST /x', status: 400, body: { error: 'nope' } }],
    requests: {
      'job-start': { path: `/api/jobs/${B}`, method: 'POST', body: {} },
      other: { path: '/api/other', method: 'POST', body: {} },
    },
  },
};

test('a set is written as whole files: renamed responses, one errors file, the named requests', () => {
  const files = filesOfSet(set);
  assert.deepEqual(Object.keys(files).sort(), [
    'errors.json',
    'gear-state.json',
    'requests.json',
    'welcome.json',
  ]);
  // Skipped responses are not written, and take no id: the ids count over what is written.
  assert.deepEqual(files['gear-state.json'], { id: '00000000-0000-4000-8500-000000000001' });
  assert.deepEqual(files['welcome.json'], { id: '00000000-0000-4000-8500-000000000002' });
  assert.deepEqual(files['errors.json'], set.captured.errors);
  assert.deepEqual(Object.keys(files['requests.json']), ['job-craft']);
  assert.equal(
    files['requests.json']['job-craft'].path,
    '/api/jobs/00000000-0000-4000-8500-000000000002',
  );
});

test('without requestKeys every request keeps its key; a missing response is an error', () => {
  const noKeys = { ...set, files: { ...set.files, requestKeys: undefined } };
  assert.deepEqual(Object.keys(filesOfSet(noKeys)['requests.json']), ['job-start', 'other']);
  const noRequests = { ...set, files: { ...set.files, requests: undefined } };
  assert.equal('requests.json' in filesOfSet(noRequests), false);
  const missing = { ...set, captured: { ...set.captured, responses: { welcome: {} } } };
  assert.throws(() => filesOfSet(missing), /no response gear-final/);
});

test('the arguments are --check and --set <name>', () => {
  assert.deepEqual(parseArgs([]), { check: false, set: null });
  assert.deepEqual(parseArgs(['--check']), { check: true, set: null });
  assert.deepEqual(parseArgs(['--set', 'gear', '--check']), { check: true, set: 'gear' });
  assert.throws(() => parseArgs(['--set']), /set name/);
  assert.throws(() => parseArgs(['--set', 'a$']), /set name/);
  assert.throws(() => parseArgs(['--write']), /unknown argument/);
});
