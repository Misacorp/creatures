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
// The statements that change what is in the bag: a new item, a removed one, and wearing or taking one off.
const RAW = [
  /INSERT\s+(OR\s+\w+\s+)?INTO\s+gear_items\b/i,
  /DELETE\s+FROM\s+gear_items\b/i,
  /UPDATE\s+gear_items\s+SET[^;`'"]*\bequipped_on\b/i,
];

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
    // Migrations may reshape the table as a whole; they run before any counter exists.
    if (name.endsWith('-migration.ts') || name === 'migrations.ts') continue;
    const text = readFileSync(path, 'utf8');
    for (const pattern of RAW) if (pattern.test(text)) offenders.push(`${name}: ${pattern.source}`);
  }
  assert.deepEqual(offenders, [], 'use insertItem, deleteItem or setEquipped from gear-store.ts');
});

test('the guard sees the helpers it protects', () => {
  const store = readFileSync(join(SRC, 'gear-store.ts'), 'utf8');
  for (const pattern of RAW)
    assert.ok(pattern.test(store), `gear-store.ts no longer matches ${pattern.source}`);
});
