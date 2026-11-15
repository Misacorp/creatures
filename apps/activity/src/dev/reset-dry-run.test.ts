import { describe, expect, it } from 'vitest';
import { featRows, parseDryRun, summaryRows, tableRows } from './reset-dry-run';

const answer = {
  settlers: 2,
  creatures: 5,
  feats: [
    { feat: 'Deepest dungeon depth', holders: [{ name: 'Ann', detail: 'Cleared depth 18' }] },
    { feat: 'Best crafter', holders: [] },
    {
      feat: 'First on the server',
      holders: [
        { name: 'Ann', detail: 'Cindle' },
        { name: 'Bob', detail: 'Zipmouse' },
      ],
    },
  ],
  tables: [
    { table: 'balances', rows: 2 },
    { table: 'creatures', rows: 5 },
    { table: 'journal', rows: 0 },
  ],
  rowsToDelete: 7,
  dms: {
    count: 2,
    longest: 410,
    limit: 2000,
    over: 0,
    previews: [{ name: 'Ann', length: 410, content: '**hello**' }],
  },
  recordChars: 1234,
  leet: 'Leet note.',
};

describe('the reset dry run view', () => {
  it('reads the server answer and refuses another shape', () => {
    expect(parseDryRun(answer)).toMatchObject({ settlers: 2, dms: { longest: 410 } });
    expect(parseDryRun(null)).toBeNull();
    expect(parseDryRun({ ...answer, settlers: '2' })).toBeNull();
    expect(parseDryRun({ ...answer, tables: [{ table: 1, rows: 2 }] })).toBeNull();
    expect(parseDryRun({ ...answer, dms: { ...answer.dms, previews: [{}] } })).toBeNull();
  });

  it('turns it into table rows: the totals, a row per holder, full tables first', () => {
    const view = parseDryRun(answer);
    if (view === null) throw new Error('not parsed');
    expect(summaryRows(view).map((r) => [r.label, r.value])).toContainEqual([
      'Longest DM',
      '410 / 2000',
    ]);
    expect(featRows(view)).toEqual([
      { label: 'Deepest dungeon depth', value: 'Ann: Cleared depth 18' },
      { label: 'Best crafter', value: 'nobody' },
      { label: 'First on the server', value: 'Ann: Cindle' },
      { label: '', value: 'Bob: Zipmouse' },
    ]);
    expect(tableRows(view)).toEqual([
      { label: 'creatures', value: '5' },
      { label: 'balances', value: '2' },
      { label: '1 empty tables', value: '0' },
    ]);
  });
});
