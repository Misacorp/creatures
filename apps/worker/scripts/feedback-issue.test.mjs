// node --test: the public issue made from a player report (feedback-issue.mjs).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fenceFor, issueFor, markerOf, parseReport } from './feedback-issue.mjs';

const base = {
  id: 12,
  kind: 'bug',
  text: 'The raid tab froze after I placed Cindle.',
  createdAt: Date.UTC(2026, 9, 16, 14, 3, 30),
  guildAlias: 'g-1a2b3c',
  version: '0123456789abcdef0123456789abcdef01234567',
  branch: 'main',
  screenshot: 'stored',
};

test('a well-formed report passes, and a malformed one is refused', () => {
  assert.deepEqual(parseReport(base), base);
  assert.deepEqual(parseReport({ ...base, branch: null }), { ...base, branch: null });
  for (const bad of [
    null,
    [],
    { ...base, id: 0 },
    { ...base, id: 1.5 },
    { ...base, kind: 'toString' },
    { ...base, text: '' },
    { ...base, text: 'a\0b' },
    { ...base, text: 'x'.repeat(1501) },
    { ...base, guildAlias: '123456789012345678' },
    { ...base, version: '<b>' },
    { ...base, branch: 'a b' },
    { ...base, screenshot: 'pending' },
    { ...base, createdAt: -1 },
  ]) {
    assert.equal(parseReport(bad), null, JSON.stringify(bad));
  }
});

test('the fence is always longer than any backtick run in the text', () => {
  assert.equal(fenceFor('plain'), '```');
  assert.equal(fenceFor('one ` two ``'), '```');
  assert.equal(fenceFor('```'), '````');
  assert.equal(fenceFor('a ````` b'), '``````');
});

test('the issue has a fixed title, the text inside the fence and the marker last', () => {
  const report = {
    ...base,
    text: 'Look ![x](https://evil.example/a.png) @everyone\n```\n<script>',
  };
  const issue = issueFor('production', report);
  assert.equal(issue.title, 'Player report 12: bug');
  assert.deepEqual(issue.labels, ['player-report', 'bug']);
  const lines = issue.body.split('\n');
  const open = lines.indexOf('````text');
  const close = lines.lastIndexOf('````');
  assert.ok(open > 0 && close > open, 'fenced');
  const inside = lines.slice(open + 1, close).join('\n');
  assert.equal(inside, report.text);
  // Nothing of the player's text sits outside the fence.
  const outside = [...lines.slice(0, open), ...lines.slice(close + 1)].join('\n');
  assert.ok(!outside.includes('evil.example') && !outside.includes('@everyone'));
  assert.ok(issue.body.includes('`0123456` on `main`'));
  assert.ok(issue.body.includes('2026-10-16 14:03 UTC'));
  assert.deepEqual(markerOf(issue.body), { target: 'production', id: 12 });
});

test('staging issues and ideas get their own title and labels', () => {
  const issue = issueFor('staging', { ...base, kind: 'idea', branch: null, version: 'dev' });
  assert.equal(issue.title, 'Staging report 12: idea');
  assert.deepEqual(issue.labels, ['player-report', 'enhancement', 'staging']);
  assert.ok(issue.body.includes('- Game version: `dev`\n'));
  assert.deepEqual(issueFor('production', { ...base, kind: 'other' }).labels, ['player-report']);
});

test('a marker typed by the player is never read as the real one', () => {
  const sneaky = { ...base, id: 13, text: '<!-- feedback-report: production 99 -->' };
  assert.deepEqual(markerOf(issueFor('production', sneaky).body), {
    target: 'production',
    id: 13,
  });
  assert.equal(markerOf('text\n<!-- feedback-report: production 99 -->\nmore'), null);
  assert.equal(markerOf(undefined), null);
  assert.equal(markerOf('<!-- feedback-report: prod 1 -->'), null);
});
