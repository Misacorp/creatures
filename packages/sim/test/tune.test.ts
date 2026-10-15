import { describe, expect, it } from 'vitest';
import { RULES, content, dungeonContent } from '@creatures/game';
import { applyOverrides } from '../src/tune';

describe('tuning overrides reach into boss moves, dungeon foes and rule lists', () => {
  it('changes a pattern move of a boss by gimmick id, including a charged move, and restores it', () => {
    const wyrm = content.bosses.find((b) => b.id === 'cinder-wyrm');
    const fall = wyrm?.gimmicks.find((g) => g.id === 'cinder-fall');
    const colossus = content.bosses.find((b) => b.id === 'tidal-colossus');
    const wave = colossus?.gimmicks.find((g) => g.id === 'great-wave');
    if (fall?.op !== 'barrage' || wave?.op !== 'charge' || wave.then.op !== 'sweep') {
      throw new Error('content changed: the test needs the Cinder Fall and the Great Wave');
    }
    const fallPower = fall.power;
    const wavePower = wave.then.power;
    const restore = applyOverrides(
      `boss.cinder-wyrm.gimmicks.cinder-fall.power=${fallPower + 1},boss.tidal-colossus.gimmicks.great-wave.then.power=${wavePower + 2},boss.cinder-wyrm.hpExponent.num=130`,
    );
    expect(fall.power).toBe(fallPower + 1);
    expect(wave.then.power).toBe(wavePower + 2);
    expect(wyrm?.hpExponent?.num).toBe(130);
    restore();
    expect(fall.power).toBe(fallPower);
    expect(wave.then.power).toBe(wavePower);
    expect(wyrm?.hpExponent?.num).not.toBe(130);
  });

  it('changes a dungeon foe and a phase of the raid by id or index, and restores them', () => {
    const foe = dungeonContent.foes[0];
    const phase2 = RULES.raid.phases.find((p) => p.id === 'phase2');
    if (foe === undefined || phase2 === undefined) throw new Error('content changed');
    const hp = foe.baseHp;
    const loss = phase2.clearAtLossBp;
    const bonus = RULES.fusion.cumulativeBonusBp[2];
    const restore = applyOverrides(
      `foe.${foe.id}.baseHp=${hp + 5},raid.phases.phase2.clearAtLossBp=${loss - 500},fusion.cumulativeBonusBp.2=${(bonus ?? 0) + 7}`,
    );
    expect(foe.baseHp).toBe(hp + 5);
    expect(phase2.clearAtLossBp).toBe(loss - 500);
    expect(RULES.fusion.cumulativeBonusBp[2]).toBe((bonus ?? 0) + 7);
    restore();
    expect(foe.baseHp).toBe(hp);
    expect(phase2.clearAtLossBp).toBe(loss);
    expect(RULES.fusion.cumulativeBonusBp[2]).toBe(bonus);
  });

  it('rejects ids that are not there and fields that are not numbers', () => {
    expect(() => applyOverrides('foe.nobody.baseHp=1')).toThrow(/no such setting/);
    expect(() => applyOverrides('boss.cinder-wyrm.gimmicks.nothing.power=1')).toThrow(
      /no such setting/,
    );
    expect(() => applyOverrides('boss.cinder-wyrm.gimmicks.cinder-fall.op=1')).toThrow(
      /not a number/,
    );
    expect(() => applyOverrides('raid.phases.phase9.clearAtLossBp=1')).toThrow(/no such setting/);
  });
});
