// node --test: every change to `gear_items` that adds, removes or (un)equips an item goes through the helpers in
// src/gear-store.ts (`insertItem`, `deleteItem`, `setEquipped`), which keep the valley's bag counter (V-GEAR-6,
// `valley_bag`) in step. A raw statement anywhere else would let the counter drift with the valley's systems on.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const ALLOWED = new Set(['gear-store.ts']);
// The statements that change what is in the bag: a new item, a removed one, wearing or taking one off, and an item changing
// hands. `SET` clauses are read up to their `WHERE`, so a filter on `equipped_on` is not a write to it.
const TABLE = String.raw`gear_items(?:\s+(?:AS\s+)?\w+)?`;
const RAW = [
  new RegExp(String.raw`\b(?:INSERT(?:\s+OR\s+\w+)?|REPLACE)\s+INTO\s+gear_items\b`, 'i'),
  new RegExp(String.raw`\bDELETE\s+FROM\s+gear_items\b`, 'i'),
  new RegExp(
    String.raw`\bUPDATE(?:\s+OR\s+\w+)?\s+${TABLE}\s+SET\b(?:(?!\bWHERE\b)[\s\S])*?\b(?:equipped_on|user_id)\b`,
    'i',
  ),
];

/** The source without comments, so a comment that names a statement does not count as one. */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const MIGRATIONS = new Set([
  'migrations.ts',
  ...[...readFileSync(join(SRC, 'migrations.ts'), 'utf8').matchAll(/from '\.\/([\w-]+)'/g)].map(
    (m) => `${m[1]}.ts`,
  ),
]);

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

test('only gear-store.ts adds, removes or (un)equips gear items with raw SQL', () => {
  const offenders = [];
  for (const path of sources(SRC)) {
    const name = path.slice(SRC.length + 1);
    if (ALLOWED.has(name)) continue;
    // Migrations may reshape the table as a whole; they run before any counter exists. Only files `migrations.ts` imports.
    if (MIGRATIONS.has(name)) continue;
    const text = code(readFileSync(path, 'utf8'));
    for (const pattern of RAW) if (pattern.test(text)) offenders.push(`${name}: ${pattern.source}`);
  }
  assert.deepEqual(offenders, [], 'use insertItem, deleteItem or setEquipped from gear-store.ts');
});

test('the guard sees the helpers it protects', () => {
  const store = code(readFileSync(join(SRC, 'gear-store.ts'), 'utf8'));
  for (const pattern of RAW)
    assert.ok(pattern.test(store), `gear-store.ts no longer matches ${pattern.source}`);
});

test('the patterns catch the forms a raw write could take, and not a filter or a comment', () => {
  const caught = (sql) => RAW.some((pattern) => pattern.test(code(sql)));
  for (const sql of [
    'INSERT INTO gear_items (id) VALUES (?)',
    'insert or replace into gear_items (id) values (?)',
    'REPLACE INTO gear_items (id) VALUES (?)',
    'DELETE FROM gear_items WHERE id = ?',
    "UPDATE gear_items SET rarity = 'epic', equipped_on = ? WHERE id = ?",
    'UPDATE gear_items AS g SET\n  equipped_on = NULL WHERE g.id = ?',
    'UPDATE OR IGNORE gear_items SET user_id = ? WHERE id = ?',
  ])
    assert.ok(caught(sql), sql);
  for (const sql of [
    'SELECT * FROM gear_items WHERE equipped_on IS NULL',
    'UPDATE gear_items SET rarity = ? WHERE equipped_on = ?',
    '// DELETE FROM gear_items is done by the helpers',
    '/* INSERT INTO gear_items */ SELECT 1',
  ])
    assert.ok(!caught(sql), sql);
});
