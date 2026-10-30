// Tests for scripts/decisions.mjs and its hooks. Every test works in a temp directory used as a fake
// repo root, so the real docs are never touched. Run: node --test 'scripts/*.test.mjs'
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { run } from './decisions.mjs';
import {
  STUB,
  SEPARATOR_COMMENT,
  makeId,
  parseLegacy,
  parseTopicFile,
  renderTopicFile,
  slugify,
} from './decisions-lib.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOPICS = [
  { id: 'gear', title: 'Gear and crafting', scope: 'Gear items and the Workshop.' },
  { id: 'ui', title: 'UI patterns', scope: 'Shared components and the frame.' },
];
const created = [];

after(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

/** A fake repo root with topics.json (and optionally a legacy file). */
function makeRoot({ legacy, topics = TOPICS } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'decisions-test-'));
  created.push(root);
  mkdirSync(join(root, 'docs/design/decisions'), { recursive: true });
  writeFileSync(join(root, 'docs/design/decisions/topics.json'), JSON.stringify(topics));
  if (legacy !== undefined) writeFileSync(join(root, 'docs/design/decisions.md'), legacy);
  return root;
}

/** Runs the CLI in-process. */
function cli(root, ...args) {
  const out = [];
  const err = [];
  const code = run([...args, '--root', root], {
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    cwd: root,
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

const read = (root, rel) => readFileSync(join(root, rel), 'utf8');
const write = (root, rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};

const LEGACY = `# Design decisions

Newest last.

## 2026-10-10: First thing

**Decision.** One.

## 2026-10-12: Second thing **[Misa]**

**Decision.** Two, with a \`gear\` mention.

### 2026-10-12: Same day, sub heading

Three.

\`\`\`md
## 2026-10-13: Not an entry (inside a fence)
\`\`\`

## 2026-10-14: Fourth thing

Four.
`;
const ASSIGN_ALL = { 1: 'gear', 2: 'ui', 3: 'gear', 4: 'ui' };

function migrateAll(root, assign = ASSIGN_ALL) {
  const file = join(root, 'assign.json');
  writeFileSync(file, JSON.stringify(assign));
  return cli(root, 'migrate', '--assign-file', file);
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

describe('ids', () => {
  test('slug strips markers and diacritics and keeps six words', () => {
    assert.equal(slugify('Armour works for every creature'), 'armour-works-for-every-creature');
    assert.equal(
      slugify('**[Misa]** Crème brûlée (Misa) `code` one two three four'),
      'creme-brulee-code-one-two-three',
    );
    assert.equal(slugify('!!!'), 'entry');
  });

  test('collisions get -2, -3', () => {
    const used = new Set();
    assert.equal(makeId('2026-10-28', 'Same title', used), '2026-10-28-same-title');
    assert.equal(makeId('2026-10-28', 'Same title', used), '2026-10-28-same-title-2');
    assert.equal(makeId('2026-10-28', 'Same title', used), '2026-10-28-same-title-3');
  });
});

describe('parsing', () => {
  test('legacy parser reads ## and ### headings, ignores fences and the preamble', () => {
    const entries = parseLegacy(LEGACY);
    assert.deepEqual(
      entries.map((e) => e.heading),
      [
        '2026-10-10: First thing',
        '2026-10-12: Second thing **[Misa]**',
        '2026-10-12: Same day, sub heading',
        '2026-10-14: Fourth thing',
      ],
    );
    assert.match(entries[2].body, /Not an entry/);
  });

  test('topic file round trip', () => {
    const entry = (date, title, id, extra = {}) => ({
      date,
      title,
      id,
      supersedes: [],
      amends: [],
      body: '**Decision.** A.\n\n### Sub heading\n\nText.',
      ...extra,
    });
    const entries = [
      entry('2026-10-12', 'B', '2026-10-12-b', {
        supersedes: ['2026-10-10-a'],
        amends: ['2026-10-01-x'],
      }),
      entry('2026-10-10', 'A', '2026-10-10-a'),
    ];
    const text = renderTopicFile(TOPICS[0], [entries[0]], [entries[1]], () => 'current');
    const parsed = parseTopicFile(text);
    assert.deepEqual(parsed.problems, []);
    assert.deepEqual(parsed.entries, entries);
  });
});

describe('fix', () => {
  function fixtureWithEntries() {
    const root = makeRoot();
    write(
      root,
      'docs/design/decisions/gear.md',
      `# whatever

## 2026-10-10: Old rule

**Decision.** Old.

## 2026-10-20: New rule

ID: \`2026-10-20-new-rule\` · Amends: \`2026-10-05-ancient\`

**Decision.** New.
`,
    );
    return root;
  }

  test('fills ids, sorts newest first, is idempotent', () => {
    const root = makeRoot();
    write(
      root,
      'docs/design/decisions/gear.md',
      '## 2026-10-10: Older\n\nBody.\n\n## 2026-10-20: Newer\n\nBody.\n\n## 2026-10-20: Newer too\n\nBody.\n',
    );
    const first = cli(root, 'fix');
    assert.equal(first.code, 0, first.err);
    assert.match(first.out, /updated docs\/design\/decisions\/gear\.md/);
    const text = read(root, 'docs/design/decisions/gear.md');
    const order = [...text.matchAll(/^## (.*)$/gm)].map((m) => m[1]);
    assert.deepEqual(order, ['2026-10-20: Newer', '2026-10-20: Newer too', '2026-10-10: Older']);
    assert.match(text, /ID: `2026-10-10-older` · Status: current/);
    const second = cli(root, 'fix');
    assert.equal(second.out, '');
    assert.equal(second.code, 0);
    assert.equal(cli(root, 'check').err.includes('out of date'), false);
  });

  test('--quiet prints one line', () => {
    const root = makeRoot();
    write(root, 'docs/design/decisions/ui.md', '## 2026-10-10: Thing\n\nBody.\n');
    const r = cli(root, 'fix', '--quiet');
    assert.match(r.out, /^updated: .*ui\.md/);
    assert.equal(r.out.includes('\n'), false);
  });

  test('derives statuses across topics and puts superseded entries below a separator', () => {
    const root = makeRoot();
    write(root, 'docs/design/decisions/gear.md', '## 2026-10-10: Old rule\n\nOld.\n');
    write(
      root,
      'docs/design/decisions/ui.md',
      '## 2026-10-20: Newer rule\n\nID: `2026-10-20-newer-rule` · Supersedes: `2026-10-10-old-rule`\n\nNew.\n\n## 2026-10-18: Note\n\nID: `2026-10-18-note` · Amends: `2026-10-20-newer-rule`\n\nN.\n',
    );
    // The old rule only gets its id on the first pass, so fix twice.
    cli(root, 'fix');
    const r = cli(root, 'fix');
    assert.equal(r.code, 0, r.err);
    const gear = read(root, 'docs/design/decisions/gear.md');
    assert.match(gear, /Status: superseded by `2026-10-20-newer-rule`/);
    assert.match(
      gear,
      new RegExp(`${SEPARATOR_COMMENT}\\n\\n# Superseded\\n\\n## 2026-10-10: Old rule`),
    );
    const ui = read(root, 'docs/design/decisions/ui.md');
    assert.match(
      ui,
      /Status: current, amended by `2026-10-18-note` · Supersedes: `2026-10-10-old-rule`/,
    );
    assert.doesNotMatch(ui, /# Superseded/);
    const readme = read(root, 'docs/design/decisions/README.md');
    assert.match(readme, /Superseded: 1 entry \(see the topic file\)\./);
    assert.match(readme, /^- 2026-10-20 Newer rule \(amended\)$/m);
    assert.doesNotMatch(readme, /Old rule/);
    // The separator is regenerated, never read as body text.
    assert.equal(cli(root, 'fix').out, '');
    assert.doesNotMatch(
      read(root, 'docs/design/decisions/gear.md'),
      /Superseded entries below[\s\S]*Superseded entries below/,
    );
    assert.equal(parseTopicFile(gear).entries[0].body, 'Old.');
  });

  test('reports unknown references and still writes', () => {
    const root = fixtureWithEntries();
    const r = cli(root, 'fix');
    assert.equal(r.code, 1);
    assert.match(r.err, /unknown id 2026-10-05-ancient/);
    assert.ok(existsSync(join(root, 'docs/design/decisions/README.md')));
  });

  test('output is Prettier-stable', (t) => {
    const prettier = join(REPO, 'node_modules/.bin/prettier');
    if (!existsSync(prettier)) return t.skip('prettier is not installed');
    const root = makeRoot();
    write(
      root,
      'docs/design/decisions/gear.md',
      '## 2026-10-10: Old [x] rule **[Misa]**\n\nOld.\n\n## 2026-10-20: New_rule with `code`\n\n**Decision.** New.\n\n### Sub\n\n- a\n- b\n',
    );
    write(root, 'docs/design/decisions/ui.md', '## 2026-10-21: Supersede\n\nID: `s`\n\nB.\n');
    cli(root, 'fix');
    cli(root, 'fix');
    // Same options as the repo's config.
    writeFileSync(join(root, '.prettierrc.json'), readFileSync(join(REPO, '.prettierrc.json')));
    const r = spawnSync(prettier, ['--check', 'docs/design/decisions/*.md'], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(read(root, 'docs/design/decisions/README.md'), /\\\[x\\\]/);
  });
});

describe('check', () => {
  /** A healthy fake repo: migrated, fixed. */
  function healthy() {
    const root = makeRoot({ legacy: LEGACY });
    assert.equal(migrateAll(root).code, 0);
    assert.equal(cli(root, 'check').code, 0);
    return root;
  }
  const failsWith = (root, pattern) => {
    const r = cli(root, 'check');
    assert.equal(r.code, 1, 'check should fail');
    assert.match(r.err, pattern);
  };

  test('passes on a healthy repo and does not write', () => {
    const root = healthy();
    const before = read(root, 'docs/design/decisions/gear.md');
    cli(root, 'check');
    assert.equal(read(root, 'docs/design/decisions/gear.md'), before);
  });

  test('catches an out-of-date file', () => {
    const root = healthy();
    write(root, 'docs/design/decisions/README.md', 'stale\n');
    failsWith(root, /pnpm decisions fix/);
  });

  test('catches unknown and self references', () => {
    const root = healthy();
    const gear = read(root, 'docs/design/decisions/gear.md');
    const id = /ID: `([^`]+)`/.exec(gear)[1];
    write(
      root,
      'docs/design/decisions/gear.md',
      gear.replace(`ID: \`${id}\``, `ID: \`${id}\` · Supersedes: \`${id}\`, \`2026-01-01-nope\``),
    );
    const r = cli(root, 'check');
    assert.match(r.err, /refers to itself/);
    assert.match(r.err, /unknown id 2026-01-01-nope/);
  });

  test('catches duplicate ids', () => {
    const root = healthy();
    const gear = read(root, 'docs/design/decisions/gear.md');
    const id = /ID: `([^`]+)`/.exec(gear)[1];
    const ui = read(root, 'docs/design/decisions/ui.md');
    write(root, 'docs/design/decisions/ui.md', ui.replace(/ID: `[^`]+`/, `ID: \`${id}\``));
    failsWith(root, /duplicate id/);
  });

  test('catches orphan and missing topic files', () => {
    const root = healthy();
    write(root, 'docs/design/decisions/extra.md', '# x\n');
    failsWith(root, /extra\.md is not a topic/);
    rmSync(join(root, 'docs/design/decisions/extra.md'));
    rmSync(join(root, 'docs/design/decisions/ui.md'));
    failsWith(root, /ui\.md is missing/);
  });

  test('catches malformed dated headings and dated ### headings', () => {
    const root = healthy();
    const gear = read(root, 'docs/design/decisions/gear.md');
    write(
      root,
      'docs/design/decisions/gear.md',
      `${gear}\n## 2026-1-5 Bad one\n\nx\n\n### 2026-10-10: Deep\n`,
    );
    const r = cli(root, 'check');
    assert.match(r.err, /malformed dated heading: ## 2026-1-5 Bad one/);
    assert.match(r.err, /dated ### heading/);
  });

  test('catches the TODO placeholder', () => {
    const root = healthy();
    const made = cli(root, 'new', '--topic', 'ui', '--title', 'A fresh call');
    assert.equal(made.code, 0, made.err);
    failsWith(root, /TODO placeholder/);
    const file = join(root, 'docs/design/decisions/ui.md');
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('<!-- TODO: decision and reasoning -->', 'Done.'),
    );
    assert.equal(cli(root, 'check').code, 0, cli(root, 'check').err);
  });

  test('catches a stub that is not the stub', () => {
    const root = healthy();
    write(root, 'docs/design/decisions.md', `${STUB}\n## 2026-10-30: Sneaky\n\nx\n`);
    failsWith(root, /still has entries in the old file .*pnpm decisions migrate/);
    write(root, 'docs/design/decisions.md', '# something else\n');
    failsWith(root, /not the stub/);
  });

  test('catches missing and broken legacy.json', () => {
    const root = healthy();
    write(root, 'docs/design/decisions/legacy.json', '{nope');
    failsWith(root, /legacy\.json is not valid JSON/);
    rmSync(join(root, 'docs/design/decisions/legacy.json'));
    failsWith(root, /legacy\.json is missing/);
  });
});

describe('migrate', () => {
  test('first split creates topic files, legacy.json and the stub; a second run is a no-op', () => {
    const root = makeRoot({ legacy: LEGACY });
    const r = migrateAll(root);
    assert.equal(r.code, 0, r.err);
    assert.equal(read(root, 'docs/design/decisions.md'), STUB);
    const legacy = JSON.parse(read(root, 'docs/design/decisions/legacy.json'));
    assert.deepEqual(
      Object.keys(legacy),
      parseLegacy(LEGACY).map((e) => e.heading),
    );
    assert.equal(legacy['2026-10-12: Same day, sub heading'].id, '2026-10-12-same-day-sub-heading');
    const gear = read(root, 'docs/design/decisions/gear.md');
    // Same date: the later entry sits above the earlier one; ### became ##.
    assert.ok(
      gear.indexOf('## 2026-10-12: Same day, sub heading') <
        gear.indexOf('## 2026-10-10: First thing'),
    );
    const ui = read(root, 'docs/design/decisions/ui.md');
    assert.match(ui, /## 2026-10-12: Second thing \*\*\[Misa\]\*\*/);
    assert.match(ui, /\[Misa\]/);
    assert.equal(cli(root, 'check').code, 0);

    const before = read(root, 'docs/design/decisions/legacy.json');
    write(root, 'old.md', LEGACY);
    const again = cli(root, 'migrate', '--from', join(root, 'old.md'));
    assert.equal(again.code, 0, again.err);
    assert.match(again.out, /0 new, 0 updated, 4 already migrated/);
    assert.equal(read(root, 'docs/design/decisions/legacy.json'), before);
  });

  test('asks for topics, changes nothing, then migrates with --assign', () => {
    const root = makeRoot({ legacy: LEGACY });
    migrateAll(root);
    const branch = `${LEGACY}\n## 2026-10-15: Branch entry\n\nFrom a branch.\n\n## 2026-10-16: Other branch entry\n\nMore.\n`;
    write(root, 'branch.md', branch);
    const gearBefore = read(root, 'docs/design/decisions/gear.md');
    const ask = cli(root, 'migrate', '--from', join(root, 'branch.md'));
    assert.equal(ask.code, 1);
    assert.match(ask.err, /1\. 2026-10-15: Branch entry/);
    assert.match(ask.err, /2\. 2026-10-16: Other branch entry/);
    assert.match(ask.err, /Topics: gear, ui/);
    assert.match(ask.err, /pnpm decisions migrate --assign 1=<topic>,2=<topic>/);
    assert.equal(read(root, 'docs/design/decisions/gear.md'), gearBefore);

    write(root, 'docs/design/decisions.md', branch);
    const done = cli(root, 'migrate', '--assign', '1=ui,2=gear');
    assert.equal(done.code, 0, done.err);
    assert.match(done.out, /2 new/);
    assert.match(read(root, 'docs/design/decisions/ui.md'), /Branch entry/);
    assert.match(read(root, 'docs/design/decisions/gear.md'), /Other branch entry/);
    assert.equal(read(root, 'docs/design/decisions.md'), STUB);
    assert.equal(cli(root, 'check').code, 0);
  });

  test('--dry-run writes nothing', () => {
    const root = makeRoot({ legacy: LEGACY });
    const file = join(root, 'a.json');
    writeFileSync(file, JSON.stringify(ASSIGN_ALL));
    const r = cli(root, 'migrate', '--assign-file', file, '--dry-run');
    assert.equal(r.code, 0, r.err);
    assert.equal(read(root, 'docs/design/decisions.md'), LEGACY);
    assert.equal(existsSync(join(root, 'docs/design/decisions/legacy.json')), false);
  });

  test('an unknown topic or entry number is an error', () => {
    const root = makeRoot({ legacy: LEGACY });
    assert.match(cli(root, 'migrate', '--assign', '1=nope').err, /Unknown topic "nope"/);
    assert.match(cli(root, 'migrate', '--assign', '9=gear').err, /no new entry number 9/);
  });

  const commit = (root, msg) =>
    git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', msg);

  /**
   * main and a branch both start from the old format. The branch commits `branchText`; main
   * optionally commits `mainText` and then does the split; main is merged into the branch.
   */
  function mergeScenario({ branchText, mainText }) {
    const root = makeRoot({ legacy: LEGACY });
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'add', 'docs/design/decisions.md');
    commit(root, 'old format');
    git(root, 'checkout', '-q', '-b', 'feature');
    write(root, 'docs/design/decisions.md', branchText);
    git(root, 'add', 'docs/design/decisions.md');
    commit(root, 'branch edits');
    git(root, 'checkout', '-q', 'main');
    if (mainText) {
      write(root, 'docs/design/decisions.md', mainText);
      git(root, 'add', 'docs/design/decisions.md');
      commit(root, 'main edits the old file');
    }
    assert.equal(migrateAll(root).code, 0);
    rmSync(join(root, 'assign.json'));
    git(root, 'add', '-A');
    commit(root, 'split');
    git(root, 'checkout', '-q', 'feature');
    spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'merge', '--no-edit', 'main'], {
      cwd: root,
    });
    return root;
  }

  test("a branch edit is applied, a new entry added, and main's own earlier edit is kept", () => {
    const root = mergeScenario({
      // The branch has the old text of "First thing", edits "Fourth thing" and appends one entry.
      branchText: `${LEGACY.replace('Four.', 'Four, branch edit.')}\n## 2026-10-25: Branch entry\n\nFrom the branch.\n`,
      mainText: LEGACY.replace('**Decision.** One.', '**Decision.** One, main edit.'),
    });
    const ask = cli(root, 'migrate');
    assert.equal(ask.code, 1, ask.out + ask.err);
    assert.match(ask.err, /1\. 2026-10-25: Branch entry/);
    assert.doesNotMatch(ask.err, /2\. /);
    const done = cli(root, 'migrate', '--assign', '1=ui');
    assert.equal(done.code, 0, done.err);
    assert.match(done.out, /1 new, 1 updated/);
    assert.match(read(root, 'docs/design/decisions/ui.md'), /Four, branch edit\./);
    assert.match(read(root, 'docs/design/decisions/ui.md'), /From the branch\./);
    const gear = read(root, 'docs/design/decisions/gear.md');
    assert.match(gear, /One, main edit\./);
    assert.doesNotMatch(gear, /\*\*Decision\.\*\* One\.\n/);
    assert.equal(read(root, 'docs/design/decisions.md'), STUB);
    const again = cli(root, 'migrate');
    assert.equal(again.code, 0, again.err);
    assert.match(again.out, /0 new, 0 updated/);
  });

  test('both sides editing the same entry is a conflict, after the rest is done', () => {
    const root = mergeScenario({
      branchText: `${LEGACY.replace('Four.', 'Four, branch edit.')}\n## 2026-10-25: Branch entry\n\nx\n`,
      mainText: LEGACY.replace('Four.', 'Four, main edit.'),
    });
    const r = cli(root, 'migrate', '--assign', '1=gear');
    assert.equal(r.code, 1);
    assert.match(r.err, /CONFLICT: "2026-10-14: Fourth thing": both sides changed it/);
    assert.match(r.err, /Four, branch edit\./);
    assert.match(read(root, 'docs/design/decisions/ui.md'), /Four, main edit\./);
    assert.match(read(root, 'docs/design/decisions/gear.md'), /## 2026-10-25: Branch entry/);
    assert.equal(read(root, 'docs/design/decisions.md'), STUB);
  });

  test('without a common base, differing entries are listed and not applied', () => {
    const root = makeRoot({ legacy: LEGACY });
    migrateAll(root);
    write(root, 'edited.md', LEGACY.replace('Four.', 'Four, edited.'));
    const r = cli(root, 'migrate', '--from', join(root, 'edited.md'));
    assert.equal(r.code, 1);
    assert.match(r.err, /Could not tell whether your branch edited these.*2026-10-14-fourth-thing/);
    assert.doesNotMatch(read(root, 'docs/design/decisions/ui.md'), /Four, edited\./);
  });

  test('merging the split into a branch that edited the old file: migrate reads the branch commit', () => {
    const root = makeRoot({ legacy: LEGACY });
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'add', 'docs/design/decisions.md');
    commit(root, 'old format');
    // The branch edits one body and appends one entry.
    git(root, 'checkout', '-q', '-b', 'feature');
    write(
      root,
      'docs/design/decisions.md',
      `${LEGACY.replace('**Decision.** One.', '**Decision.** One, edited on the branch.')}\n## 2026-10-25: Branch entry\n\nFrom the branch.\n`,
    );
    git(root, 'add', 'docs/design/decisions.md');
    commit(root, 'branch edits');
    // Main does the split.
    git(root, 'checkout', '-q', 'main');
    assert.equal(migrateAll(root).code, 0);
    rmSync(join(root, 'assign.json'));
    git(root, 'add', '-A');
    commit(root, 'split');
    // The merge may or may not conflict (git can merge the stub and old file without a conflict);
    // either way the working-tree file is unreliable and migrate must use the branch's commit.
    git(root, 'checkout', '-q', 'feature');
    spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'merge', '--no-edit', 'main'], {
      cwd: root,
    });

    const ask = cli(root, 'migrate');
    assert.equal(ask.code, 1, ask.out + ask.err);
    assert.match(ask.out, /Reading old decisions from commit [0-9a-f]+ /);
    assert.match(ask.err, /1 new entries need a topic/);
    assert.match(ask.err, /1\. 2026-10-25: Branch entry/);
    assert.doesNotMatch(ask.err, /2\. /);

    const done = cli(root, 'migrate', '--assign', '1=ui');
    assert.equal(done.code, 0, done.err);
    assert.match(done.out, /1 new, 1 updated/);
    assert.match(read(root, 'docs/design/decisions/ui.md'), /From the branch\./);
    assert.match(read(root, 'docs/design/decisions/gear.md'), /One, edited on the branch\./);
    assert.equal(read(root, 'docs/design/decisions.md'), STUB);
    assert.equal(cli(root, 'check').code, 0);

    const again = cli(root, 'migrate');
    assert.equal(again.code, 0, again.err);
    assert.match(again.out, /0 new, 0 updated/);
  });

  test('an entry appended to the stub after migrating is picked up as new', () => {
    const root = makeRoot({ legacy: LEGACY });
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'add', 'docs/design/decisions.md');
    commit(root, 'old format');
    migrateAll(root);
    assert.match(cli(root, 'migrate').out, /0 new, 0 updated, 4 already migrated/);
    write(root, 'docs/design/decisions.md', `${STUB}\n## 2026-10-26: Late entry\n\nLate.\n`);
    const ask = cli(root, 'migrate');
    assert.equal(ask.code, 1);
    assert.match(ask.err, /1\. 2026-10-26: Late entry/);
    const done = cli(root, 'migrate', '--assign', '1=gear');
    assert.equal(done.code, 0, done.err);
    assert.match(read(root, 'docs/design/decisions/gear.md'), /Late\./);
    assert.equal(read(root, 'docs/design/decisions.md'), STUB);
  });

  test('conflict marker lines in the working tree are ignored', () => {
    const root = makeRoot({ legacy: LEGACY });
    migrateAll(root);
    write(
      root,
      'docs/design/decisions.md',
      `<<<<<<< HEAD\n${STUB}=======\n## 2026-10-27: Marked\n\nBody.\n>>>>>>> branch\n`,
    );
    const r = cli(root, 'migrate', '--assign', '1=ui');
    assert.equal(r.code, 0, r.err);
    assert.match(
      read(root, 'docs/design/decisions/ui.md'),
      /## 2026-10-27: Marked\n\nID: [^\n]*\n\nBody\.\n/,
    );
  });

  test('--from can name a git ref', () => {
    const root = makeRoot({ legacy: LEGACY });
    git(root, 'init', '-q');
    git(root, 'add', 'docs/design/decisions.md');
    git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'old');
    const r = cli(
      root,
      'migrate',
      '--from',
      'HEAD',
      '--dry-run',
      '--assign',
      '1=gear,2=gear,3=gear,4=gear',
    );
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /git ref HEAD/);
    assert.match(r.out, /4 new/);
  });
});

describe('queries and new', () => {
  function migrated() {
    const root = makeRoot({ legacy: LEGACY });
    migrateAll(root);
    return root;
  }

  test('topics, list, show, search', () => {
    const root = migrated();
    assert.match(cli(root, 'topics').out, /gear {2}Gear and crafting {2}2 current, 0 superseded/);
    const list = cli(root, 'list', '--topic', 'ui').out.split('\n');
    assert.deepEqual(list, [
      '2026-10-14  2026-10-14-fourth-thing  Fourth thing',
      '2026-10-12  2026-10-12-second-thing  Second thing **[Misa]**',
    ]);
    assert.equal(cli(root, 'list', '--topic', 'zzz').code, 1);

    const byId = cli(root, 'show', '2026-10-14-fourth-thing');
    assert.match(
      byId.out,
      /^docs\/design\/decisions\/ui\.md\n\n## 2026-10-14: Fourth thing\n\nID: /,
    );
    assert.match(byId.out, /Four\./);
    assert.match(cli(root, 'show', '## 2026-10-10: First thing').out, /One\./);
    assert.match(cli(root, 'show', 'first thing').out, /One\./);
    const several = cli(root, 'show', 'thing');
    assert.equal(several.code, 1);
    assert.match(several.err, /matches 3 entries/);
    assert.equal(several.out, '');
    assert.equal(cli(root, 'show', 'nothing like it').code, 1);

    const search = cli(root, 'search', 'GEAR` mention');
    assert.match(search.out, /ui\.md {2}2026-10-12-second-thing {2}Second thing/);
    assert.match(search.out, /\n {2}\*\*Decision\.\*\* Two, with a `gear` mention\./);
    assert.equal(cli(root, 'search', 'Four', '--topic', 'gear').out, '');
    assert.equal(cli(root, 'search', '(').code, 1);
  });

  test('superseded entries need --all in list and search', () => {
    const root = migrated();
    cli(
      root,
      'new',
      '--topic',
      'gear',
      '--title',
      'Replaces first',
      '--supersedes',
      '2026-10-10-first-thing',
      '--date',
      '2026-10-30',
    );
    assert.doesNotMatch(cli(root, 'list').out, /first-thing/);
    assert.match(cli(root, 'list', '--all').out, /first-thing/);
    assert.equal(cli(root, 'search', 'One\\.').out, '');
    assert.match(cli(root, 'search', 'One\\.', '--all').out, /first-thing/);
    assert.match(cli(root, 'topics').out, /gear .* 2 current, 1 superseded/);
  });

  test('new inserts at the top of its date, validates, and check fails until the TODO is replaced', () => {
    const root = migrated();
    const made = cli(
      root,
      'new',
      '--topic',
      'ui',
      '--title',
      'Fresh call',
      '--date',
      '2026-10-12',
      '--misa',
      '--amends',
      '2026-10-14-fourth-thing',
    );
    assert.equal(made.code, 0, made.err);
    assert.match(made.out, /ui\.md\n2026-10-12-fresh-call/);
    const ui = read(root, 'docs/design/decisions/ui.md');
    assert.ok(
      ui.indexOf('## 2026-10-12: Fresh call **[Misa]**') <
        ui.indexOf('## 2026-10-12: Second thing'),
    );
    assert.ok(ui.indexOf('## 2026-10-14: Fourth') < ui.indexOf('## 2026-10-12: Fresh call'));
    assert.match(
      ui,
      /ID: `2026-10-12-fresh-call` · Status: current · Amends: `2026-10-14-fourth-thing`/,
    );
    assert.match(ui, /Status: current, amended by `2026-10-12-fresh-call`/);
    assert.equal(cli(root, 'check').code, 1);

    assert.match(cli(root, 'new', '--topic', 'nope', '--title', 'x').err, /Unknown topic/);
    assert.match(
      cli(root, 'new', '--topic', 'ui', '--title', 'x', '--supersedes', '2026-01-01-zzz').err,
      /Unknown entry id "2026-01-01-zzz"/,
    );
    assert.match(
      cli(root, 'new', '--topic', 'ui', '--title', 'x', '--date', '2026-13-45').err,
      /--date/,
    );
  });

  test('new without --date uses a YYYY-MM-DD date', () => {
    const root = migrated();
    const made = cli(root, 'new', '--topic', 'gear', '--title', 'Dated today');
    assert.match(made.out, /\n\d{4}-\d{2}-\d{2}-dated-today$/);
  });

  test('unknown command prints usage and fails', () => {
    const root = makeRoot();
    const r = cli(root, 'bogus');
    assert.equal(r.code, 1);
    assert.match(r.err, /Usage: pnpm decisions/);
    assert.equal(cli(root, 'help').code, 0);
  });
});

describe('command line entry', () => {
  test('runs as a script with --root', () => {
    const root = makeRoot({ legacy: LEGACY });
    migrateAll(root);
    const r = spawnSync('node', [join(REPO, 'scripts/decisions.mjs'), 'check', '--root', root], {
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /decisions ok: 4 entries in 2 topics/);
  });
});

describe('hooks', () => {
  /** A temp git repo with an origin/main, the CLI and an initial commit, to drive the hooks in. */
  function hookRepo() {
    const root = makeRoot({ legacy: LEGACY });
    mkdirSync(join(root, 'scripts'), { recursive: true });
    for (const f of ['decisions.mjs', 'decisions-lib.mjs']) {
      writeFileSync(join(root, 'scripts', f), readFileSync(join(REPO, 'scripts', f)));
    }
    migrateAll(root);
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'add', '.');
    git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base');
    git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    git(root, 'checkout', '-q', '-b', 'feature');
    return root;
  }
  const hook = (name, root, input) => {
    const r = spawnSync('node', [join(REPO, '.claude/hooks', name)], {
      input: JSON.stringify({ cwd: root, ...input }),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    });
    return r.stdout.trim() ? JSON.parse(r.stdout) : null;
  };

  test('nudge blocks once for new code files, then stays quiet', () => {
    const root = hookRepo();
    write(root, 'apps/x/thing.ts', 'export {};\n');
    const first = hook('decisions-nudge.mjs', root, {});
    assert.equal(first.decision, 'block');
    assert.match(first.reason, /pnpm decisions new --topic/);
    assert.equal(hook('decisions-nudge.mjs', root, {}), null);
    // A new code file nudges again; a stop that is already a hook continuation does not.
    write(root, 'apps/x/other.ts', 'export {};\n');
    assert.equal(hook('decisions-nudge.mjs', root, { stop_hook_active: true }), null);
    assert.equal(hook('decisions-nudge.mjs', root, {}).decision, 'block');
  });

  test('nudge is quiet when a decision was recorded, or origin/main is unknown', () => {
    const root = hookRepo();
    write(root, 'apps/x/thing.ts', 'export {};\n');
    cli(root, 'new', '--topic', 'ui', '--title', 'Recorded', '--date', '2026-10-30');
    const file = join(root, 'docs/design/decisions/ui.md');
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('<!-- TODO: decision and reasoning -->', 'Done.'),
    );
    assert.equal(hook('decisions-nudge.mjs', root, {}), null);
    git(root, 'update-ref', '-d', 'refs/remotes/origin/main');
    write(root, 'apps/x/more.ts', 'export {};\n');
    assert.equal(hook('decisions-nudge.mjs', root, {}), null);
  });

  test('nudge blocks once when the decisions folder fails check', () => {
    const root = hookRepo();
    write(
      root,
      'docs/design/decisions/ui.md',
      `${read(root, 'docs/design/decisions/ui.md')}\n## 2026-10-30: Hand written\n\nx\n`,
    );
    const first = hook('decisions-nudge.mjs', root, {});
    assert.equal(first.decision, 'block');
    assert.match(first.reason, /pnpm decisions fix/);
    assert.equal(hook('decisions-nudge.mjs', root, {}), null);
  });

  test('fix hook runs fix after an edit in the decisions folder', () => {
    const root = hookRepo();
    const file = join(root, 'docs/design/decisions/gear.md');
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n## 2026-10-30: Hand written\n\nx\n`);
    const out = hook('decisions-fix.mjs', root, { tool_input: { file_path: file } });
    assert.match(out.hookSpecificOutput.additionalContext, /decisions fix updated: .*gear\.md/);
    assert.match(read(root, 'docs/design/decisions/gear.md'), /ID: `2026-10-30-hand-written`/);
    // Other files are left alone, and the generated README is protected.
    assert.equal(
      hook('decisions-fix.mjs', root, { tool_input: { file_path: join(root, 'apps/a.ts') } }),
      null,
    );
    const readme = hook('decisions-fix.mjs', root, {
      tool_input: { file_path: join(root, 'docs/design/decisions/README.md') },
    });
    assert.equal(readme.decision, 'block');
    assert.match(readme.reason, /generated/);
  });

  test('fix hook blocks with fix problems', () => {
    const root = hookRepo();
    const file = join(root, 'docs/design/decisions/gear.md');
    writeFileSync(
      file,
      `${readFileSync(file, 'utf8')}\n## 2026-10-30: Bad ref\n\nID: \`2026-10-30-bad-ref\` · Supersedes: \`2026-01-01-ghost\`\n\nx\n`,
    );
    const out = hook('decisions-fix.mjs', root, { tool_input: { file_path: file } });
    assert.equal(out.decision, 'block');
    assert.match(out.reason, /unknown id 2026-01-01-ghost/);
  });
});

describe('hardening', () => {
  const GEAR = '## 2026-10-10: Old rule\n\nID: `2026-10-10-old-rule` · Status: current\n\nBody.\n';
  const gearRoot = (text) => {
    const root = makeRoot();
    write(root, 'docs/design/decisions/gear.md', text);
    return root;
  };

  test('merge conflict markers in a topic file stop fix and fail check', () => {
    const marked = `<<<<<<< HEAD\n${GEAR}=======\n${GEAR}>>>>>>> main\n`;
    const root = gearRoot(marked);
    const fix = cli(root, 'fix');
    assert.equal(fix.code, 1);
    assert.match(fix.err, /unresolved merge conflict in docs\/design\/decisions\/gear\.md:1/);
    assert.equal(read(root, 'docs/design/decisions/gear.md'), marked);
    assert.equal(existsSync(join(root, 'docs/design/decisions/README.md')), false);
    assert.match(cli(root, 'check').err, /unresolved merge conflict in .*gear\.md:1/);
    // Inside a body, and inside a code fence (which is fine).
    const inBody = gearRoot(`${GEAR}\n=======\n`);
    assert.match(cli(inBody, 'check').err, /unresolved merge conflict in .*gear\.md:\d+/);
    const fenced = gearRoot(`${GEAR}\n\`\`\`\n=======\n\`\`\`\n`);
    assert.doesNotMatch(cli(fenced, 'check').err, /merge conflict/);
  });

  test('bare ids in Supersedes and Amends are accepted; other values are reported', () => {
    const root = makeRoot();
    write(
      root,
      'docs/design/decisions/gear.md',
      '## 2026-10-10: A\n\nBody.\n\n## 2026-10-12: B\n\nID: `2026-10-12-b` · Supersedes: 2026-10-10-a, 2026-10-09-gone\n\nBody.\n',
    );
    assert.equal(cli(root, 'fix').code, 1); // 2026-10-09-gone is unknown, the rest is fine
    const gear = read(root, 'docs/design/decisions/gear.md');
    assert.match(gear, /Status: superseded by `2026-10-12-b`/);
    assert.match(gear, /Supersedes: `2026-10-10-a`, `2026-10-09-gone`/);

    const bad = gearRoot(
      '## 2026-10-10: A\n\nID: `2026-10-10-a` · Amends: not an id, `Foo`\n\nBody.\n',
    );
    const r = cli(bad, 'fix');
    assert.equal(r.code, 1);
    assert.match(r.err, /gear\.md:1: "not" is not an entry id/);
    assert.match(r.err, /"Foo" is not an entry id/);
    assert.match(read(bad, 'docs/design/decisions/gear.md'), /not an id, `Foo`/);
  });

  test('an unclosed code fence is reported and fix does not write', () => {
    const text = `${GEAR}\nText.\n\n\`\`\`js\nnever closed\n`;
    const root = gearRoot(text);
    const r = cli(root, 'fix');
    assert.equal(r.code, 1);
    assert.match(r.err, /unclosed code fence starting at docs\/design\/decisions\/gear\.md:9/);
    assert.equal(read(root, 'docs/design/decisions/gear.md'), text);
    assert.match(cli(root, 'check').err, /unclosed code fence/);
  });

  test('an unclosed code fence in the old file stops migrate', () => {
    const root = makeRoot({ legacy: `${LEGACY}\n\`\`\`\nopen\n` });
    const r = migrateAll(root);
    assert.equal(r.code, 1);
    assert.match(r.err, /unclosed code fence starting at docs\/design\/decisions\.md:\d+/);
    assert.equal(existsSync(join(root, 'docs/design/decisions/legacy.json')), false);
  });

  test('only the generated separator pair is dropped, a lone "# Superseded" in a body stays', () => {
    const root = gearRoot(`${GEAR}\nIntro.\n\n# Superseded\n\nMore.\n`);
    assert.equal(cli(root, 'fix').code, 0);
    const gear = read(root, 'docs/design/decisions/gear.md');
    assert.match(gear, /Intro\.\n\n# Superseded\n\nMore\./);
    // A lone separator comment stays too; the real pair is still regenerated and removed.
    const withComment = gearRoot(`${GEAR}\n${SEPARATOR_COMMENT}\n\ntext\n`);
    cli(withComment, 'fix');
    assert.match(read(withComment, 'docs/design/decisions/gear.md'), /Superseded entries below/);
    assert.equal(cli(withComment, 'fix').out, '');
  });

  test('new rejects dates that are not on the calendar', () => {
    const root = gearRoot(GEAR);
    assert.match(
      cli(root, 'new', '--topic', 'gear', '--title', 'x', '--date', '2026-02-31').err,
      /--date/,
    );
    assert.equal(
      cli(root, 'new', '--topic', 'gear', '--title', 'x', '--date', '2028-02-29').code,
      0,
    );
  });

  test('options may come first, and -- ends them', () => {
    const root = gearRoot(GEAR);
    const first = run(['--root', root, 'fix'], { out: () => {}, err: () => {}, cwd: root });
    assert.equal(first, 0);
    assert.ok(existsSync(join(root, 'docs/design/decisions/README.md')));
    const out = [];
    run(['search', '--root', root, '--', '--foo'], {
      out: (s) => out.push(s),
      err: () => {},
      cwd: root,
    });
    assert.deepEqual(out, []);
    write(root, 'docs/design/decisions/gear.md', GEAR.replace('Body.', 'Use --foo here.'));
    const found = [];
    run(['search', '--root', root, '--', '--foo'], {
      out: (s) => found.push(s),
      err: () => {},
      cwd: root,
    });
    assert.match(found.join('\n'), /Use --foo here\./);
  });
});

describe('hooks (hardening)', () => {
  test('editing README.md runs fix as well as blocking', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'scripts'), { recursive: true });
    for (const f of ['decisions.mjs', 'decisions-lib.mjs']) {
      writeFileSync(join(root, 'scripts', f), readFileSync(join(REPO, 'scripts', f)));
    }
    write(root, 'docs/design/decisions/gear.md', '## 2026-10-10: A\n\nBody.\n');
    git(root, 'init', '-q');
    cli(root, 'fix');
    const readme = join(root, 'docs/design/decisions/README.md');
    const good = readFileSync(readme, 'utf8');
    writeFileSync(readme, 'hand edit\n');
    const r = spawnSync('node', [join(REPO, '.claude/hooks/decisions-fix.mjs')], {
      input: JSON.stringify({ cwd: root, tool_input: { file_path: readme } }),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    });
    assert.equal(JSON.parse(r.stdout).decision, 'block');
    assert.equal(readFileSync(readme, 'utf8'), good);
  });
});
