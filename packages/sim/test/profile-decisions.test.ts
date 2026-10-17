import { describe, expect, it } from 'vitest';
import { content, createSeededRng, rowScore } from '@creatures/game';
import { byPowerDesc, pickTeam, type OwnedCreature } from '../src/data';
import { chooseDungeonTeam } from '../src/dungeon';
import { protection } from '../src/formations';
import { openRaidWeek, slotFor } from '../src/raid';
import { createPlayer, type SimPlayer } from '../src/state';

const LINES = ['splashet', 'cindle', 'sproutle', 'zipmouse', 'stormray', 'mistnewt', 'ashmole'];

function make(id: string, levels: number[], lines: string[] = LINES): SimPlayer {
  const p = createPlayer(id, id, 'daily', 1);
  p.joined = true;
  for (const [k, level] of levels.entries()) {
    const line = lines[k] as string;
    p.creatures.push({ id: `${id}/${line}`, line, speciesId: line, level, fusionCount: 0 });
  }
  return p;
}

const known = (lines: string[]): string[] =>
  lines.filter((l) => content.creatures.some((s) => s.id === l));

describe('dungeon teams', () => {
  const lines = known(LINES);
  const levels = [12, 11, 10, 9, 8, 7, 6].slice(0, lines.length);
  const rng = () => createSeededRng('dungeon-team');

  it('good is the strongest three in the game row order; reasonable stands them strongest first', () => {
    const p = make('p01', levels, lines);
    const good = chooseDungeonTeam(p, 'good', rng());
    expect(good.ordered).toBe(true);
    expect(good.creatures).toEqual(pickTeam(p.creatures));
    const reasonable = chooseDungeonTeam(p, 'reasonable', rng());
    expect(reasonable.ordered).toBe(false);
    expect(reasonable.creatures).toEqual(pickTeam(p.creatures));
  });

  it('random takes three distinct creatures, reproducibly, and varies', () => {
    const p = make('p01', levels, lines);
    const a = chooseDungeonTeam(p, 'random', rng());
    const b = chooseDungeonTeam(p, 'random', rng());
    expect(a.ordered).toBe(false);
    expect(a.creatures).toHaveLength(3);
    expect(new Set(a.creatures.map((c) => c.id)).size).toBe(3);
    expect(a.creatures.map((c) => c.id)).toEqual(b.creatures.map((c) => c.id));
    const stream = createSeededRng('vary');
    const teams = new Set(
      Array.from({ length: 30 }, () =>
        chooseDungeonTeam(p, 'random', stream)
          .creatures.map((c) => c.id)
          .join(),
      ),
    );
    expect(teams.size).toBeGreaterThan(5);
  });

  it('best takes the top six for the row that sets off the most reactions, and is never worse than good', () => {
    const p = make('p01', levels, lines);
    const rowOf = (team: readonly OwnedCreature[]) => team.map((c) => slotFor(p, c.id));
    const best = chooseDungeonTeam(p, 'best', rng());
    const good = chooseDungeonTeam(p, 'good', rng());
    expect(best.ordered).toBe(true);
    expect(best.creatures).toHaveLength(3);
    const top6 = new Set(
      byPowerDesc(p.creatures)
        .slice(0, 6)
        .map((c) => c.id),
    );
    for (const c of best.creatures) expect(top6.has(c.id)).toBe(true);
    // Compared on the best order of each team (what the dungeon will stand them in).
    const score = (team: readonly OwnedCreature[]): number =>
      Math.max(...permutations(rowOf(team)).map((row) => rowScore(row)));
    expect(score(best.creatures)).toBeGreaterThanOrEqual(score(good.creatures));
  });
});

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

describe('arranged raid rows', () => {
  const lines = known(LINES);
  const boss = content.bosses[0];
  if (boss === undefined) throw new Error('no bosses');

  function server(): SimPlayer[] {
    const sets = [
      ['splashet', 'cindle', 'sproutle'],
      ['zipmouse', 'stormray', 'splashet'],
      ['cindle', 'sproutle', 'zipmouse'],
      ['stormray', 'splashet', 'cindle'],
    ];
    return sets.map((set, k) =>
      make(`p0${String(k + 1)}`, [10, 10, 10], known(set).length === 3 ? set : lines.slice(0, 3)),
    );
  }

  it('moves only the arranging players among their own places', () => {
    const players = server();
    const plain = openRaidWeek(boss, players, { rank: 2 });
    const arranged = new Set(['p01', 'p02']);
    const week = openRaidWeek(boss, players, {
      rank: 2,
      arranged: [{ setup: 'protected', playerIds: arranged }],
    });
    expect(week.row.map((s) => s.id).sort()).toEqual(plain.row.map((s) => s.id).sort());
    for (const [i, slot] of plain.row.entries()) {
      const mine = slot.ownerId !== null && arranged.has(slot.ownerId);
      const now = week.row[i];
      if (!mine) expect(now?.id).toBe(slot.id);
      else expect(arranged.has(now?.ownerId ?? '')).toBe(true);
    }
    // Arranging never leaves fewer payoffs beside a Guard.
    expect(protection(week.row).guardedPayoffs).toBeGreaterThanOrEqual(
      protection(plain.row).guardedPayoffs,
    );
    // Deterministic, and the default row is untouched without the option.
    const again = openRaidWeek(boss, players, {
      rank: 2,
      arranged: [{ setup: 'protected', playerIds: arranged }],
    });
    expect(again.row.map((s) => s.id)).toEqual(week.row.map((s) => s.id));
    expect(openRaidWeek(boss, players, { rank: 2, arranged: [] }).row.map((s) => s.id)).toEqual(
      plain.row.map((s) => s.id),
    );
  });
});
