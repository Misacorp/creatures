import { describe, expect, it } from 'vitest';
import { stateAt } from '../replay';
import { RULES } from '@creatures/game';
import {
  creatureHpAt,
  estimatedMaxHp,
  crowdedHits,
  cuesForEvents,
  enragedAt,
  pendingChargesAt,
  reticleTargets,
  retreatedAt,
  strikeRows,
  strikesOf,
} from '../stage';
import { PATTERN_SCENARIOS, patternFight, patternRow, type PatternFight } from './pattern-fight';

/** The creatures' HP when a hand-made fight starts: what the stage estimates their maximum is. */
function stubbornStart(fight: PatternFight): [string, number][] {
  return fight.row.map((r) => [
    r.id,
    estimatedMaxHp(r, {
      guardHpBp: RULES.combat.guard.hpBp,
      guardArmorBp: RULES.combat.guard.armorBp,
    }) ?? 100,
  ]);
}

/** The strike's action of a scenario, by its name. */
const EXPECTED: Readonly<Record<string, string>> = {
  'Sweep (Great Wave)': 'sweep',
  'Barrage (Cinder Fall)': 'barrage',
  'Slam (Coil Crush)': 'slam',
  'Lance (Riptide)': 'lance',
  'Pincer (Briar Pincer)': 'pincer',
  'Chain (Lightning Rod)': 'strike_highest_atk',
  'Charge: row marked': 'charge',
  'Charge: creatures marked': 'charge',
  'Cover pips (Guard beside)': 'hit_zone',
  'Crowded sweep (15 creatures)': 'sweep',
  Enraged: 'enrage',
};

describe('the hand-made boss moves of the workbench', () => {
  it('has a fight for every scenario, with events that belong to creatures of its row', () => {
    for (const scenario of PATTERN_SCENARIOS) {
      const fight = patternFight(scenario);
      const ids = new Set(fight.row.map((r) => r.id));
      expect(fight.events.length, scenario).toBeGreaterThan(1);
      for (const e of fight.events) {
        if (e.t === 'boss_hit') expect(ids.has(e.target), `${scenario} ${e.target}`).toBe(true);
      }
    }
  });

  it('shows each move as the strike it is named for, never with more than six reticles', () => {
    for (const [scenario, action] of Object.entries(EXPECTED)) {
      const fight = patternFight(scenario as (typeof PATTERN_SCENARIOS)[number]);
      const ids = fight.row.map((r) => r.id);
      const strikes = strikesOf(fight.events, 0, fight.events.length, ids, fight.boss.id);
      const found = strikes.find((s) => s.strike.action === action);
      expect(found, scenario).toBeDefined();
      if (found !== undefined) {
        expect(reticleTargets(found.strike).length, scenario).toBeLessThanOrEqual(6);
      }
    }
  });

  it('outlines the middle row for the sweep and marks the creatures of a charge', () => {
    const sweep = patternFight('Sweep (Great Wave)');
    const found = strikesOf(
      sweep.events,
      0,
      sweep.events.length,
      sweep.row.map((r) => r.id),
      sweep.boss.id,
    )[0];
    expect(found && strikeRows(found.strike)).toEqual(['middle']);
    const charge = patternFight('Charge: creatures marked');
    expect(pendingChargesAt(charge.events, charge.events.length)[0]?.marks).toEqual([
      'c1',
      'c3',
      'c5',
    ]);
    expect(pendingChargesAt(patternFight('Charge: row marked').events, 2)[0]?.rows).toEqual([
      'middle',
    ]);
  });

  it('shows the heal, the cover pip, the enrage banner and the retreat', () => {
    const kinds = (name: (typeof PATTERN_SCENARIOS)[number]) => {
      const f = patternFight(name);
      return cuesForEvents(
        f.events,
        0,
        f.events.length,
        f.row.map((r) => r.id),
        f.boss.id,
      );
    };
    expect(kinds('Support heal and cleanse').filter((c) => c.kind === 'float')).toHaveLength(3);
    expect(kinds('Cover pips (Guard beside)').some((c) => c.kind === 'cover')).toBe(true);
    expect(kinds('Armor pip (a Guard takes less)').some((c) => c.kind === 'armor')).toBe(true);
    const enraged = patternFight('Enraged');
    expect(enragedAt(enraged.events, enraged.events.length)).toBe(true);
    for (const name of ['Retreat, Phase 1', 'Retreat, Phase 2'] as const) {
      const f = patternFight(name);
      expect(retreatedAt(f.events, f.events.length), name).toBe(true);
      expect(f.boss.retreat, name).toBeDefined();
    }
    expect(patternFight('Retreat, Phase 2').phase).toBe('phase2');
  });

  it('shows the lines of gear: a Stubborn creature keeps 1 HP, and Echo, Sidestep and Payback have words and numbers', () => {
    const stubborn = patternFight('Stubborn (stays up at 1 HP)');
    const start = Object.fromEntries(stubbornStart(stubborn));
    expect(creatureHpAt(stubborn.events, stubborn.events.length, start)['c1']).toBe(1);
    const lines = patternFight('Chance and trigger lines (Echo, Sidestep, Payback)');
    const floats = cuesForEvents(
      lines.events,
      0,
      lines.events.length,
      lines.row.map((r) => r.id),
      lines.boss.id,
    )
      .filter((c) => c.kind === 'float')
      .map((c) => c.text);
    expect(floats).toEqual(expect.arrayContaining(['+10%', '36', 'SIDESTEP', 'Payback']));
    // Echo moved the boss's HP: the step after the whole log has it.
    expect(stateAt(lines.events, lines.events.length, 1_000).bossHp).toBe(844);
  });

  it('has a sweep of 15 creatures that counts as crowded', () => {
    const fight = patternFight('Crowded sweep (15 creatures)');
    expect(fight.row).toHaveLength(15);
    expect(crowdedHits(fight.events, 0, fight.events.length).size).toBe(15);
    expect(patternRow(15).map((r) => r.id)).toHaveLength(15);
  });
});
