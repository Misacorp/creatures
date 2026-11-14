// node --test: the simulated month's script (valley-month.mjs): which hosts it may call, how a day survives a CPU-limit error, and how it
// reads the compare command's lines.
/* global Response */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseOf, callTool, parseCompare, playDay, summarise } from './valley-month.mjs';

test('only staging and a loopback http address are accepted, never production or another host', () => {
  assert.equal(baseOf('staging'), 'https://creatures-staging.misacorp.dev');
  assert.equal(baseOf('http://localhost:8787'), 'http://localhost:8787');
  assert.equal(baseOf('http://127.0.0.1:8787/'), 'http://127.0.0.1:8787');
  for (const bad of [
    undefined,
    '',
    'production',
    'https://creatures.misacorp.dev',
    'https://localhost:8787',
    'http://example.com',
    'http://localhost.evil.test',
    'http://user:pw@localhost:8787',
    'ftp://localhost',
  ]) {
    assert.equal(baseOf(bad), null, String(bad));
  }
});

test('a call asks only for a tool of the month and sends the token as a header', async () => {
  const seen = [];
  const fake = (url, init) => {
    seen.push({ url, init });
    return Promise.resolve(
      new Response(JSON.stringify({ ok: true, result: { x: 1 } }), { status: 200 }),
    );
  };
  const res = await callTool('http://localhost:8787', 'tok', 'valley-report', {}, fake);
  assert.equal(res.status, 200);
  assert.equal(seen[0].url, 'http://localhost:8787/api/dev/valley-report');
  assert.equal(seen[0].init.headers.Authorization, 'Bearer tok');
  assert.equal(seen[0].init.body, '{}');
  await assert.rejects(() => callTool('http://localhost:8787', 'tok', 'set-balances', {}, fake));
});

test('a day that fails on the server is played again in parts until it is done', async () => {
  const calls = [];
  const answers = [
    { status: 500, body: null },
    {
      status: 200,
      body: { result: { day: 0, done: false, visits: 3, rows: { read: 10, written: 1 } } },
    },
    { status: 429, body: null },
    {
      status: 200,
      body: { result: { day: 0, done: true, visits: 2, rows: { read: 8, written: 1 } } },
    },
  ];
  const fake = (url, init) => {
    calls.push(JSON.parse(init.body));
    const next = answers.shift();
    return Promise.resolve(new Response(JSON.stringify(next.body), { status: next.status }));
  };
  const lines = [];
  const day = await playDay(
    'http://localhost:8787',
    'tok',
    0,
    (l) => lines.push(l),
    fake,
    () => Promise.resolve(),
  );
  assert.deepEqual(calls, [{}, { maxVisits: 3 }, { maxVisits: 3 }, { maxVisits: 3 }]);
  assert.equal(day.length, 2);
  assert.equal(day.at(-1).done, true);
  assert.equal(lines.length, 1);
});

test('the compare lines are read into agreement per profile with the misses and their margin', () => {
  const text = [
    'Mixed 8: lab over 20 seeds, 4 weeks',
    'agree    daily day 7 levelBest: live 11, lab median 11 (10th to 90th 11 to 11); within 9.9 to 12.1 (10% of the median)',
    'DISAGREE daily day 28 piecesMade: live 54, lab median 31 (10th to 90th 22 to 44.1); within 27.9 to 34.1 (10% of the median)',
    'info     daily day 7 rowsRead: live 1, lab median 2 (10th to 90th 1 to 3); shown, not judged',
    'skipped  daily day 5 levelBest: skipped, the lab records whole weeks',
    'agree    server day 28 fire: live 22, lab median 22 (10th to 90th 20 to 24); within 20 to 24 (10% of the median)',
    '',
    '2 agree, 1 disagree, 1 info, 1 skipped',
  ].join('\n');
  const judged = parseCompare(text);
  assert.equal(judged.length, 5);
  const by = summarise(judged);
  assert.deepEqual(by.get('daily'), {
    agree: 1,
    disagree: 1,
    misses: [
      'day 28 piecesMade: live 54, lab median 31 (10th to 90th 22 to 44.1); within 27.9 to 34.1 (10% of the median)',
    ],
  });
  assert.equal(by.get('server').agree, 1);
});
