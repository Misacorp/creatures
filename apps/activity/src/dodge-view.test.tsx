import { RULES } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { Creature } from './api';
import { statRows } from './CreaturePage';
import { creatureDodgeText, dodgeChanceBp, dodgeText, foeDodgeText } from './dodge-view';
import { foeDodge, foeInfoOf } from './foe-info';
import { gimmickText } from './raid-text';
import { content } from '@creatures/game';
import { SAMPLE_STATE } from './creature-card-sample';

const ON = { enabled: true, perSpeedBp: 10, maxBp: 5_000 };
const OFF = { ...ON, enabled: false };

describe('dodge numbers', () => {
  it('is Speed times the rate, plus flat dodge, capped', () => {
    expect(dodgeChanceBp(120, 0, ON)).toBe(1_200);
    expect(dodgeChanceBp(120, 300, ON)).toBe(1_500);
    expect(dodgeChanceBp(900, 0, ON)).toBe(5_000);
    expect(dodgeChanceBp(0, 0, ON)).toBe(0);
  });

  it('prints percentages with at most one decimal', () => {
    expect(dodgeText(1_200)).toBe('12%');
    expect(dodgeText(1_170)).toBe('11.7%');
    expect(dodgeText(0)).toBe('0%');
  });

  it('shows nothing while dodge is off, and the number once it is on', () => {
    const c = { statsWithGear: { spd: 117 }, dodgeBp: 200 };
    expect(creatureDodgeText(c, OFF)).toBeNull();
    expect(creatureDodgeText(c, ON)).toBe('13.7%');
    expect(foeDodgeText(20, OFF)).toBeNull();
    expect(foeDodgeText(20, ON)).toBe('2%');
    expect(foeDodgeText(undefined, ON)).toBeNull();
  });
});

describe('the creature page’s stats', () => {
  const creature = SAMPLE_STATE.creatures[0] as unknown as Creature;
  const labels = (rows: ReturnType<typeof statRows>) =>
    rows.map((r) => (typeof r.label === 'string' ? r.label : 'Dodge'));

  it('has no Dodge row while dodge is off', () => {
    expect(labels(statRows(creature, OFF))).toEqual(['HP', 'Attack', 'Speed']);
  });

  it('has the Dodge row under today’s rules (dodge is on)', () => {
    expect(RULES.combat.dodge.enabled).toBe(true);
    expect(labels(statRows(creature))).toEqual(['HP', 'Attack', 'Speed', 'Dodge']);
  });

  it('adds Dodge under Speed when the flag is on', () => {
    const rows = statRows(creature, ON);
    expect(labels(rows)).toEqual(['HP', 'Attack', 'Speed', 'Dodge']);
    expect(rows[3]?.value).toBe(
      dodgeText(dodgeChanceBp(creature.statsWithGear.spd, creature.dodgeBp, ON)),
    );
  });
});

describe('the foe’s dodge and riders', () => {
  it('shows a foe’s dodge from its base Speed while dodge is on (today)', () => {
    const spd = content.bosses.find((b) => b.id === 'old-bogback')?.baseSpd;
    const text = foeDodgeText(spd);
    expect(text).not.toBeNull();
    expect(foeDodge('old-bogback')).toBe(`Dodge ${String(text)}`);
    expect(
      foeInfoOf({ id: 'old-bogback', name: 'Old Bogback', hp: 100, wording: 'zones' }).dodge,
    ).toBe(`Dodge ${String(text)}`);
    expect(foeDodgeText(spd, OFF)).toBeNull();
  });

  it('lists Old Bogback’s moves, Shake Off with them, and what Sinking Mud applies', () => {
    const info = foeInfoOf({ id: 'old-bogback', name: 'Old Bogback', hp: 100, wording: 'zones' });
    const text = info.moves.join('\n');
    expect(text).toContain('Shake Off');
    expect(text).toContain('shakes every debuff off itself');
    expect(text).toMatch(/Sinking Mud\..*puts Mired ×1 on each creature it hits/);
    const mud = content.bosses
      .find((b) => b.id === 'old-bogback')
      ?.gimmicks.find((g) => g.id === 'sinking-mud');
    expect(mud && gimmickText(mud)).toMatch(/, and puts Mired ×1 on each creature it hits\.$/);
  });
});
