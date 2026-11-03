// Tests for scripts/resources.mjs, on a temp copy of the content data. Run: node --test 'scripts/*.test.mjs'
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { DATA_DIR, run } from './resources.mjs';
import { replacements, rewriteJsonText, rewriteText } from './resources-lib.mjs';

const temps = [];
function tempData() {
  const dir = mkdtempSync(join(tmpdir(), 'resources-'));
  temps.push(dir);
  cpSync(DATA_DIR, dir, { recursive: true });
  return dir;
}
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe('rewriteText', () => {
  const pairs = replacements({ name: 'Bait', plural: 'Bait' }, 'Acorns', 'Acorns');
  test('rewrites whole words in both cases only', () => {
    assert.equal(
      rewriteText('Bait and bait, not Baited.', pairs),
      'Acorns and acorns, not Baited.',
    );
  });
  test('plural goes before singular', () => {
    const p = replacements(
      { name: 'Tide Shard', plural: 'Tide Shards' },
      'Wave Chip',
      'Wave Chips',
    );
    assert.equal(rewriteText('3 Tide Shards, 1 Tide Shard', p), '3 Wave Chips, 1 Wave Chip');
  });
});

describe('rewriteJsonText', () => {
  test('leaves keys and plain ids alone', () => {
    const pairs = replacements({ name: 'Bait', plural: 'Bait' }, 'Acorns', 'Acorns');
    const src = '{\n  "id": "bait",\n  "bait": 6,\n  "title": "Bait",\n  "t": "Costs 6 Bait"\n}';
    const { text, changes } = rewriteJsonText(src, pairs);
    assert.equal(
      text,
      '{\n  "id": "bait",\n  "bait": 6,\n  "title": "Acorns",\n  "t": "Costs 6 Acorns"\n}',
    );
    assert.deepEqual(
      changes.map((c) => c.line),
      [4, 5],
    );
  });
});

describe('pnpm resources rename', () => {
  test('a dry run changes nothing', () => {
    const dir = tempData();
    const before = readFileSync(join(dir, 'glossary.json'), 'utf8');
    const log = console.log;
    console.log = () => {};
    try {
      assert.equal(run(['rename', 'bait', 'Acorns', '--dry-run'], dir), 0);
    } finally {
      console.log = log;
    }
    assert.equal(readFileSync(join(dir, 'glossary.json'), 'utf8'), before);
  });

  test('renames the library entry and the glossary title and prose', () => {
    const dir = tempData();
    const log = console.log;
    console.log = () => {};
    try {
      assert.equal(run(['rename', 'bait', 'Acorns'], dir), 0);
    } finally {
      console.log = log;
    }
    const library = JSON.parse(readFileSync(join(dir, 'resources.json'), 'utf8'));
    const bait = library.find((r) => r.id === 'bait');
    assert.equal(bait.name, 'Acorns');
    assert.equal(bait.plural, 'Acorns');
    const glossary = JSON.parse(readFileSync(join(dir, 'glossary.json'), 'utf8'));
    const entry = glossary.find((e) => e.id === 'bait');
    assert.equal(entry.title, 'Acorns');
    assert.doesNotMatch(JSON.stringify(entry), /\bBait\b/);
    assert.equal(entry.id, 'bait');
  });

  test('an unknown id is an error', () => {
    const err = console.error;
    console.error = () => {};
    try {
      assert.equal(run(['rename', 'nope', 'X'], tempData()), 1);
    } finally {
      console.error = err;
    }
  });
});
