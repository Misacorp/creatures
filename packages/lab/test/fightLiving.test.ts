/**
 * The fight keeps a cache of who is still standing (it is dropped when a creature is knocked out). A stale cache would let a
 * knocked-out creature be aimed at, hit or sent past again, so this reads the log of seeded raid weekends against every raid
 * boss: after a creature's "is knocked out" line, no later line of that fight is about it. Creatures are all different forms,
 * so a name is one creature.
 */
import { createSeededRng, int } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  FORM_KNACKS,
  RAID_BOSS_IDS,
  legalTalents,
  raidBench,
  raidBossOf,
  raidMode,
  toPlacements,
  weekend,
  type Pick as LinePick,
} from '../src';

/** Event kinds that are about one named creature being aimed at, dodging, or taking a hit. */
const ABOUT_A_CREATURE = new Set(['target', 'hit', 'blocked', 'dodge', 'intercept', 'reaction']);

function lineOf(rng: ReturnType<typeof createSeededRng>, size: number): LinePick[] {
  const forms = Object.keys(FORM_KNACKS).filter((f) => f !== 'kilnmole');
  const picks: LinePick[] = [];
  while (picks.length < size) {
    const [form] = forms.splice(int(rng, forms.length), 1);
    if (form === undefined) break;
    const knacks = [...(FORM_KNACKS[form] ?? []), 'none'];
    const talents = legalTalents(form);
    const talent = talents[int(rng, talents.length + 1)];
    picks.push({
      formId: form,
      knack: knacks[int(rng, knacks.length)] as string,
      ...(talent ? { talents: [talent] } : {}),
    });
  }
  return picks;
}

describe('the living-fighters cache', () => {
  it('never lets a knocked-out creature appear in a later line of its fight', () => {
    let knockouts = 0;
    for (const id of RAID_BOSS_IDS) {
      const boss = raidBossOf(id);
      const mode = raidMode(boss);
      for (let i = 0; i < 4; i++) {
        const rng = createSeededRng(`living:${id}:${i}`);
        const line = lineOf(rng, mode.rows * mode.cols);
        const placements = toPlacements(line, mode);
        const run = weekend(boss, placements, raidBench(boss.cols, boss.rosterLevel), {
          rng,
          log: true,
        });
        for (const stage of run.stages) {
          // A name is one creature only if no other fighter of the stage shares it (a bench replacement may).
          const count = new Map<string, number>();
          for (const f of stage.fighters) count.set(f.name, (count.get(f.name) ?? 0) + 1);
          const down = new Set<string>();
          for (const e of stage.events) {
            if (ABOUT_A_CREATURE.has(e.kind))
              for (const name of down)
                expect(e.text.startsWith(`${name} `) || e.text.startsWith(`${name}'s`)).toBe(false);
            const m = /^(.+) takes \d+ and is knocked out$/.exec(e.text);
            if (e.kind === 'hit' && m?.[1] && count.get(m[1]) === 1) {
              down.add(m[1]);
              knockouts++;
            }
          }
        }
      }
    }
    // Not vacuous: the weekends did knock creatures out.
    expect(knockouts).toBeGreaterThan(20);
  });
});
