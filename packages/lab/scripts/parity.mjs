// Plays the parity corpus (src/parity.ts) and checks or writes its digest (data/parity/digest.json).
//
//   node scripts/parity.mjs --check   compares with the committed digest, lists the cases that differ, exits 1 on a difference
//   node scripts/parity.mjs --write   writes the digest (a rule change on purpose: say what moved and why in the PR)
//
// The TypeScript is loaded the way report.mjs does it (see load.mjs).
/* global console */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { URL, fileURLToPath } from 'node:url';
import process from 'node:process';
import { loadModule } from './load.mjs';

const file = fileURLToPath(new URL('../data/parity/digest.json', import.meta.url));
const mode = process.argv[2];
if (mode !== '--check' && mode !== '--write') {
  console.error('usage: node scripts/parity.mjs --check | --write');
  process.exit(1);
}

const { mod, close } = await loadModule('/src/parity.ts');
let code = 0;
try {
  const t0 = Date.now();
  const digest = mod.computeDigest();
  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  const count = Object.keys(digest.cases).length;
  if (mode === '--write') {
    mkdirSync(fileURLToPath(new URL('../data/parity', import.meta.url)), { recursive: true });
    writeFileSync(file, `${JSON.stringify(digest, null, 2)}\n`);
    console.log(`wrote ${count} cases (${seconds} s), overall ${digest.overall}`);
  } else {
    const want = JSON.parse(readFileSync(file, 'utf8'));
    const diff = mod.digestDiff(want, digest);
    if (diff.length === 0)
      console.log(`parity holds: ${count} cases (${seconds} s), overall ${digest.overall}`);
    else {
      console.error(`parity broken: ${diff.length} of ${count} cases differ (${seconds} s)`);
      for (const name of diff.slice(0, 40)) console.error(`  ${name}`);
      if (diff.length > 40) console.error(`  ... and ${diff.length - 40} more`);
      code = 1;
    }
  }
} finally {
  await close();
}
process.exitCode = code;
