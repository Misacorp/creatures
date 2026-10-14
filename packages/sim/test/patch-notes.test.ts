import { describe, expect, it } from 'vitest';
import {
  buildDraft,
  defaultFrom,
  diffContentIds,
  diffScalars,
  logEntriesFor,
  parseBalanceLog,
  parseRange,
  percentDelta,
  pullRequestsIn,
  renderDraftMarkdown,
  showFile,
  validateRef,
  type GitRunner,
} from '../src/patch-notes';
import { main, type Deps, type Io } from '../src/patch-notes-cli';
import {
  parseContentIds,
  parseScalars,
  renderContentIds,
  renderScalars,
  type Scalar,
} from '../src/scalars';

function scalar(path: string, value: string, extra: Partial<Scalar> = {}): Scalar {
  return {
    path,
    value,
    unit: 'count',
    meaning: '',
    system: path.split('.').slice(0, 2).join('.'),
    targets: [],
    ...extra,
  };
}

const BASE_SCALARS = renderScalars([
  scalar('RULES.gear.skill.xpPerHour', '12', { meaning: 'XP per hour of a job.' }),
  scalar('RULES.fusion.cumulativeBonusBp', '[0, 600, 1100]', { unit: 'bp' }),
  scalar('RULES.dungeon.rooms', '3'),
  scalar('RULES.old.knob', '1'),
]);
const HEAD_SCALARS = renderScalars([
  scalar('RULES.gear.skill.xpPerHour', '15', {
    meaning: 'XP per hour of a job.',
    targets: ['gear-*'],
  }),
  scalar('RULES.fusion.cumulativeBonusBp', '[0, 700, 1100]', { unit: 'bp' }),
  scalar('RULES.dungeon.rooms', '3'),
  scalar('RULES.new.knob', '9'),
]);
const BASE_IDS = renderContentIds([
  {
    title: 'Creatures',
    items: [
      { id: 'splashet', name: 'Splashet' },
      { id: 'cindle', name: 'Cindle' },
      { id: 'gone', name: 'Gone' },
    ],
  },
  { title: 'Supplies', items: [{ id: 'lure-basic', name: 'Plain Lure' }] },
]);
const HEAD_IDS = renderContentIds([
  {
    title: 'Creatures',
    items: [
      { id: 'splashet', name: 'Splashet' },
      { id: 'cindle', name: 'Cindle the Bold' },
      { id: 'newbie', name: 'Newbie' },
    ],
  },
  { title: 'Supplies', items: [{ id: 'lure-basic', name: 'Plain Lure' }] },
]);
const LOG = `# Balance log

## Template

### B-000: short title (open | closed)

- **Action:** scalar path old to new, PR #.

## Entries

### B-001: Gear XP too slow (closed)

- **Opened:** 2026-10-14.
- **Finding:** Crafting level 5 took 40 days.
- **Action:** RULES.gear.skill.xpPerHour 12 to 15, PR #12.
  Continued on a second line.
- **Expected:** Level 5 in about 30 days.

### B-002: Something else (open)

- **Action:** RULES.dungeon.rooms 3 to 4, PR #120.

### B-003: Watching

- **Action:** none, watching.
`;

interface FakeRepo {
  git: GitRunner;
  calls: string[][];
}

/** A fake git for a repo with two commits: a root and a head, and optional tag / origin/main. */
function fakeRepo(options: {
  tag?: string;
  originMain?: string;
  baseHasFiles?: boolean;
}): FakeRepo {
  const calls: string[][] = [];
  const git: GitRunner = (args) => {
    calls.push([...args]);
    const [cmd] = args;
    if (cmd === 'describe') {
      if (options.tag === undefined) throw new Error('fatal: No names found');
      return `${options.tag}\n`;
    }
    if (cmd === 'rev-parse') {
      const spec = args[args.length - 1] ?? '';
      if (spec === 'origin/main^{commit}') {
        if (options.originMain === undefined) throw new Error('missing');
        return `${options.originMain}\n`;
      }
      return 'headsha\n';
    }
    if (cmd === 'rev-list') return 'newer-root\nrootsha\n';
    if (cmd === 'log') {
      return ['Gear XP faster (#12)', 'Fix a typo', 'Tweak things (#120)', ''].join('\n');
    }
    if (cmd === 'show') {
      const spec = args[1] ?? '';
      const [ref, path] = [spec.slice(0, spec.indexOf(':')), spec.slice(spec.indexOf(':') + 1)];
      const isBase = ref !== 'HEAD';
      if (isBase && options.baseHasFiles !== true) throw new Error('fatal: path does not exist');
      if (path === 'docs/balance/scalars.md') return isBase ? BASE_SCALARS : HEAD_SCALARS;
      if (path === 'docs/balance/content-ids.md') return isBase ? BASE_IDS : HEAD_IDS;
      if (path === 'docs/balance/log.md') return LOG;
    }
    throw new Error(`unexpected git call: ${args.join(' ')}`);
  };
  return { git, calls };
}

function capture(): { io: Io; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (t) => out.push(t), err: (t) => err.push(t) }, out, err };
}

describe('refs', () => {
  it('accepts normal refs', () => {
    for (const ref of ['HEAD', 'balance-2026-10-20', 'origin/main', 'HEAD~2', 'abc1234', 'v1.2^']) {
      expect(validateRef(ref)).toBe(ref);
    }
  });

  it('rejects anything that could be an option or a shell trick', () => {
    for (const ref of [
      '',
      '-x',
      '--upload-pack=evil',
      'a b',
      'a;b',
      '$(id)',
      'a`b`',
      'a..b',
      'a\nb',
      'a|b',
      'a:b',
      'x{y}',
      'a//b',
      'a/',
    ]) {
      expect(() => validateRef(ref)).toThrow(/Not a usable git ref/);
    }
  });

  it('parses ranges, with either side optional', () => {
    expect(parseRange('balance-1..HEAD')).toEqual({ from: 'balance-1', to: 'HEAD' });
    expect(parseRange('..main')).toEqual({ from: null, to: 'main' });
    expect(parseRange('abc..')).toEqual({ from: 'abc', to: null });
    expect(parseRange('..')).toEqual({ from: null, to: null });
    expect(() => parseRange('HEAD')).toThrow(/range/);
    expect(() => parseRange('a...b')).toThrow(/Not a usable git ref/);
    expect(() => parseRange('--oops..HEAD')).toThrow(/Not a usable git ref/);
  });
});

describe('the default start of the range', () => {
  it('prefers the latest balance tag', () => {
    const { git } = fakeRepo({ tag: 'balance-2026-10-20', originMain: 'mainsha' });
    expect(defaultFrom(git, 'HEAD')).toEqual({
      ref: 'balance-2026-10-20',
      basis: 'latest balance-* tag (balance-2026-10-20)',
    });
  });

  it('falls back to origin/main, unless that is the end of the range', () => {
    expect(defaultFrom(fakeRepo({ originMain: 'mainsha' }).git, 'HEAD').ref).toBe('origin/main');
    expect(defaultFrom(fakeRepo({ originMain: 'headsha' }).git, 'HEAD').ref).toBe('rootsha');
  });

  it('falls back to the oldest root commit', () => {
    const found = defaultFrom(fakeRepo({}).git, 'HEAD');
    expect(found.ref).toBe('rootsha');
    expect(found.basis).toMatch(/root commit/);
  });

  it('reads a file at a ref, or null when it is not there', () => {
    const { git, calls } = fakeRepo({});
    expect(showFile(git, 'HEAD', 'docs/balance/scalars.md')).toBe(HEAD_SCALARS);
    expect(showFile(git, 'old', 'docs/balance/scalars.md')).toBeNull();
    expect(calls[0]).toEqual(['show', 'HEAD:docs/balance/scalars.md']);
    expect(() => showFile(git, '--bad', 'x')).toThrow(/Not a usable git ref/);
  });
});

describe('diffs', () => {
  it('diffs scalars by path', () => {
    const diff = diffScalars(parseScalars(BASE_SCALARS), parseScalars(HEAD_SCALARS));
    expect(diff.changed.map((c) => [c.path, c.from, c.to, c.delta])).toEqual([
      ['RULES.gear.skill.xpPerHour', '12', '15', '+25%'],
      ['RULES.fusion.cumulativeBonusBp', '[0, 600, 1100]', '[0, 700, 1100]', null],
    ]);
    expect(diff.changed[0]).toMatchObject({
      unit: 'count',
      targets: ['gear-*'],
      meaning: 'XP per hour of a job.',
    });
    expect(diff.added.map((s) => s.path)).toEqual(['RULES.new.knob']);
    expect(diff.removed.map((s) => s.path)).toEqual(['RULES.old.knob']);
  });

  it('computes percent changes', () => {
    expect(percentDelta('10000', '9000')).toBe('-10%');
    expect(percentDelta('3', '4')).toBe('+33.3%');
    expect(percentDelta('0', '4')).toBeNull();
    expect(percentDelta('[1]', '[2]')).toBeNull();
  });

  it('diffs content ids: added, removed, renamed, and leaves quiet sections out', () => {
    const diff = diffContentIds(parseContentIds(BASE_IDS), parseContentIds(HEAD_IDS));
    expect(diff).toEqual([
      {
        title: 'Creatures',
        added: [{ id: 'newbie', name: 'Newbie' }],
        removed: [{ id: 'gone', name: 'Gone' }],
        renamed: [{ id: 'cindle', from: 'Cindle', to: 'Cindle the Bold' }],
      },
    ]);
  });
});

describe('the balance log and pull requests', () => {
  it('parses entries, skips the template, and joins continued lines', () => {
    const entries = parseBalanceLog(LOG);
    expect(entries.map((e) => [e.id, e.status])).toEqual([
      ['B-001', 'closed'],
      ['B-002', 'open'],
      ['B-003', ''],
    ]);
    expect(entries[0]?.title).toBe('Gear XP too slow');
    expect(entries[0]?.fields['Action']).toBe(
      'RULES.gear.skill.xpPerHour 12 to 15, PR #12. Continued on a second line.',
    );
  });

  it('finds pull requests in squash merge subjects', () => {
    expect(
      pullRequestsIn(['A (#12)', 'B', 'C (#120) and (#7)', 'D (#12)']).map((p) => p.number),
    ).toEqual([12, 120, 7]);
  });

  it('picks the entries whose Action names a pull request of the range, exactly', () => {
    const entries = parseBalanceLog(LOG);
    const only12 = logEntriesFor(entries, [{ number: 12, subject: 'x (#12)' }]);
    expect(only12.map((e) => e.id)).toEqual(['B-001']);
    const both = logEntriesFor(entries, [
      { number: 12, subject: '' },
      { number: 120, subject: '' },
    ]);
    expect(both.map((e) => e.id)).toEqual(['B-001', 'B-002']);
    expect(logEntriesFor(entries, [])).toEqual([]);
  });
});

describe('the draft', () => {
  const from = { ref: 'balance-2026-10-20', basis: 'latest balance-* tag (balance-2026-10-20)' };

  it('combines everything when there is a baseline', () => {
    const draft = buildDraft({
      from,
      to: 'HEAD',
      subjects: ['Gear XP faster (#12)', 'Fix a typo'],
      baseScalars: BASE_SCALARS,
      headScalars: HEAD_SCALARS,
      baseIds: BASE_IDS,
      headIds: HEAD_IDS,
      headLog: LOG,
    });
    expect(draft.numbers.baseline).toBe(true);
    expect(draft.numbers.changed).toHaveLength(2);
    expect(draft.numbers.current).toEqual([]);
    expect(draft.balanceLog.map((e) => e.id)).toEqual(['B-001']);
    expect(draft.content.sections).toHaveLength(1);
    const md = renderDraftMarkdown(draft);
    expect(md).toContain('Range: `balance-2026-10-20..HEAD`');
    expect(md).toContain('- #12: Gear XP faster (#12)');
    expect(md).toContain('### B-001: Gear XP too slow (closed)');
    expect(md).toContain('- Added: Newbie (`newbie`)');
    expect(md).toContain('- Renamed: Cindle to Cindle the Bold (`cindle`)');
    expect(md).toContain('2 values changed, 1 added, 1 removed.');
    expect(md).toMatch(/\| `RULES.gear.skill.xpPerHour`\s+\| `12`/);
    expect(md).not.toContain('B-002');
  });

  it('says there is no baseline and lists the current values', () => {
    const draft = buildDraft({
      from: { ref: 'rootsha', basis: 'the root commit' },
      to: 'HEAD',
      subjects: [],
      baseScalars: null,
      headScalars: HEAD_SCALARS,
      baseIds: null,
      headIds: HEAD_IDS,
      headLog: null,
    });
    expect(draft.numbers.baseline).toBe(false);
    expect(draft.numbers.current.map((s) => s.path)).toContain('RULES.new.knob');
    expect(draft.content.baseline).toBe(false);
    const md = renderDraftMarkdown(draft);
    expect(md).toContain('No baseline: `docs/balance/scalars.md` does not exist at `rootsha`');
    expect(md).toContain('| `RULES.new.knob`');
    expect(md).toContain('None found in the commit subjects');
    expect(md).toContain('No log entry names one of these pull requests');
  });
});

describe('pnpm patch-notes', () => {
  function deps(repo: FakeRepo, written: Map<string, string>): Deps {
    return { git: repo.git, writeText: (path, text) => void written.set(path, text) };
  }

  it('prints a Markdown draft for the default range and says where it started', () => {
    const repo = fakeRepo({ tag: 'balance-2026-10-20', baseHasFiles: true });
    const run = capture();
    expect(main([], run.io, deps(repo, new Map()))).toBe(0);
    const text = run.out.join('\n');
    expect(text).toContain('Start chosen as latest balance-* tag (balance-2026-10-20).');
    expect(text).toContain('2 values changed');
    expect(repo.calls).toContainEqual(['log', '--format=%s', 'balance-2026-10-20..HEAD', '--']);
  });

  it('prints JSON with --json', () => {
    const repo = fakeRepo({ baseHasFiles: true });
    const run = capture();
    expect(main(['--json', 'old..HEAD'], run.io, deps(repo, new Map()))).toBe(0);
    const draft = JSON.parse(run.out.join('\n')) as { range: { from: string; fromBasis: string } };
    expect(draft.range.from).toBe('old');
    expect(draft.range.fromBasis).toBe('the range you gave');
  });

  it('writes draft.md and draft.json with --out', () => {
    const repo = fakeRepo({ baseHasFiles: false });
    const run = capture();
    const written = new Map<string, string>();
    expect(main(['--out', 'docs/patch-notes'], run.io, deps(repo, written))).toBe(0);
    expect([...written.keys()].map((k) => k.slice(k.indexOf('docs/patch-notes')))).toEqual([
      'docs/patch-notes/draft.md',
      'docs/patch-notes/draft.json',
    ]);
    expect(run.out[0]).toContain('wrote docs/patch-notes/draft.md');
    expect(run.out[0]).toContain('the root commit');
    expect([...written.values()][0]).toContain('No baseline');
  });

  it('refuses an unsafe ref before running git', () => {
    const repo = fakeRepo({});
    const run = capture();
    expect(main(['--upload-pack=x..HEAD'], run.io, deps(repo, new Map()))).toBe(1);
    expect(main(['a b..HEAD'], run.io, deps(repo, new Map()))).toBe(1);
    expect(main(['one', 'two'], run.io, deps(repo, new Map()))).toBe(1);
    expect(repo.calls).toEqual([]);
    expect(run.err.length).toBe(3);
  });
});
