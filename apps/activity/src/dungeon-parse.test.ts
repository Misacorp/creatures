import { describe, expect, it, vi } from 'vitest';
import runCleared from './fixtures/dungeon-run-cleared.json';
import today from './fixtures/dungeon-today.json';
const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  apiFetch,
}));

import { saveDungeonTeam } from './dungeon-api';
import { parseDungeonRun, parseDungeonTeamSaved, parseDungeonToday } from './dungeon-parse';

const withoutDraft: Record<string, unknown> = { ...today };
delete withoutDraft['draftTeam'];

describe('the supplies in a run answer', () => {
  it('reads the supplies the run dropped, and an older answer with none', () => {
    const run = parseDungeonRun(runCleared).run;
    expect(run.rewards.supplies?.length).toBeGreaterThan(0);
    const older: Record<string, unknown> = { ...runCleared.run.rewards };
    delete older['supplies'];
    const parsed = parseDungeonRun({ ...runCleared, run: { ...runCleared.run, rewards: older } });
    expect(parsed.run.rewards.supplies).toBeUndefined();
  });

  it('refuses supplies that are not a list of ids', () => {
    for (const supplies of ['lure-basic', [1], [null], { id: 'lure-basic' }]) {
      expect(() =>
        parseDungeonRun({
          ...runCleared,
          run: { ...runCleared.run, rewards: { ...runCleared.run.rewards, supplies } },
        }),
      ).toThrow();
    }
  });
});

describe('the saved team draft in the dungeon answers', () => {
  it('is null when the server does not send it, or sends null', () => {
    expect(parseDungeonToday(withoutDraft).draftTeam).toBeNull();
    expect(parseDungeonToday({ ...withoutDraft, draftTeam: null }).draftTeam).toBeNull();
  });

  it('is the row with its empty places, left to right', () => {
    expect(parseDungeonToday({ ...withoutDraft, draftTeam: ['a', null, 'c'] }).draftTeam).toEqual([
      'a',
      null,
      'c',
    ]);
    expect(parseDungeonToday({ ...withoutDraft, draftTeam: [null, null, null] }).draftTeam).toEqual(
      [null, null, null],
    );
  });

  it('refuses a draft that is not a list of ids and nulls', () => {
    expect(() => parseDungeonToday({ ...withoutDraft, draftTeam: 'a' })).toThrow();
    expect(() => parseDungeonToday({ ...withoutDraft, draftTeam: [1, null, null] })).toThrow();
    expect(() => parseDungeonToday({ ...withoutDraft, draftTeam: ['a', undefined] })).toThrow();
  });

  it('is read from the today inside a run answer too', () => {
    const answer = parseDungeonRun(runCleared);
    expect(answer.today.draftTeam).toBeNull();
    const withDraft = parseDungeonRun({
      ...runCleared,
      today: { ...runCleared.today, draftTeam: ['a', 'b', null] },
    });
    expect(withDraft.today.draftTeam).toEqual(['a', 'b', null]);
    expect(() =>
      parseDungeonRun({ ...runCleared, today: { ...runCleared.today, draftTeam: [3] } }),
    ).toThrow();
  });

  it('reads the answer of the save', () => {
    expect(parseDungeonTeamSaved({ draftTeam: ['a', null, null] }).draftTeam).toEqual([
      'a',
      null,
      null,
    ]);
    expect(() => parseDungeonTeamSaved({})).toThrow();
    expect(() => parseDungeonTeamSaved({ draftTeam: [1] })).toThrow();
    expect(() => parseDungeonTeamSaved(null)).toThrow();
  });
});

describe('saveDungeonTeam', () => {
  it('sends a PUT with the three places and parses the stored draft', async () => {
    apiFetch.mockResolvedValue({ draftTeam: ['a', null, 'c'] });
    const done = await saveDungeonTeam({ team: ['a', null, 'c'] });
    expect(done.draftTeam).toEqual(['a', null, 'c']);
    const [path, init] = apiFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/dungeon/team');
    expect(init.method).toBe('PUT');
    expect(init.body).toBe('{"team":["a",null,"c"]}');
  });

  it('refuses an answer that is not a draft', async () => {
    apiFetch.mockResolvedValue({ nope: true });
    await expect(saveDungeonTeam({ team: [null, null, null] })).rejects.toThrow();
  });
});
