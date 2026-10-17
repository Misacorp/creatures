import { describe, expect, it } from 'vitest';
import { sampleCreature, talentView } from './creature-card-sample';
import {
  activityBadges,
  cardDomId,
  explorerFacts,
  lockedText,
  nextParts,
  nextText,
  ribbonsHeldText,
  speciesSubtitle,
  talentKit,
  xpWords,
} from './creature-card-view';

describe('the line under the bar', () => {
  it('says what the next level brings', () => {
    expect(nextText(sampleCreature('growing'))).toBe('Next: Scarf at 7');
  });

  it('says what a full creature waits for, and what is missing', () => {
    expect(nextText(sampleCreature('ribbon ready'))).toBe(
      'Full: earn the Bronze Ribbon to keep growing',
    );
    expect(nextText(sampleCreature('ribbon short'))).toBe(
      'Full: earn the Bronze Ribbon to keep growing. Not enough parts yet.',
    );
    expect(nextText(sampleCreature('evolve ready'))).toBe('Full: evolve to keep growing');
  });

  it('says so at the top level', () => {
    expect(nextText(sampleCreature('top level'))).toBe('Top level reached');
  });

  it('marks the thing to do or to look forward to as the strong part', () => {
    expect(nextParts(sampleCreature('growing')).filter((p) => p.strong)).toEqual([
      { text: 'Scarf at 7', strong: true },
    ]);
    expect(nextParts(sampleCreature('ribbon ready')).filter((p) => p.strong)).toEqual([
      { text: 'earn the Bronze Ribbon', strong: true },
    ]);
  });

  it('words the bar', () => {
    expect(xpWords(sampleCreature('growing'))).toBe('140 / 222');
    expect(xpWords(sampleCreature('top level'))).toBe('Top level');
  });
});

describe('the talents of a card', () => {
  it('lists the talent in its slot, and when the closed slot opens', () => {
    const kit = talentKit(sampleCreature('ribbon ready'));
    expect(kit.chips).toEqual([
      { key: 'slot-1', kind: 'talent', name: 'Quick to Pounce', golden: true },
    ]);
    expect(kit.locked).toEqual([20]);
    expect(kit.label).toBe(
      'Talents: Quick to Pounce (golden), slot 2 opens at level 20. Show details.',
    );
  });

  it('shows an open slot with nothing in it as Empty, and several closed levels as one', () => {
    const kit = talentKit(sampleCreature('talent to fill'));
    expect(kit.chips.map((c) => `${c.kind}:${c.name}`)).toEqual([
      'talent:Quick to Pounce',
      'empty:Empty',
    ]);
    expect(kit.locked).toEqual([25]);
    expect(lockedText([20, 25])).toBe('20 · 25');
    expect(kit.label).toContain('an empty slot');
  });

  it('puts the signature talent of an epic first', () => {
    const creature = sampleCreature('ribbon ready');
    const withSignature = {
      ...creature,
      talents: {
        ...creature.talents,
        signature: { ...talentView('quick-to-pounce', false), name: 'Embercrown' },
      },
    };
    const kit = talentKit(withSignature);
    expect(kit.chips[0]).toMatchObject({ kind: 'signature', name: 'Embercrown' });
    expect(kit.label).toContain('Embercrown (signature)');
  });
});

describe('badges and facts', () => {
  it('show what the creature is doing now', () => {
    const creature = {
      ...sampleCreature('nickname and badges'),
      busy: { kind: 'job' as const, id: 'job' },
    };
    expect(activityBadges(creature, { loungerId: creature.id }).map((b) => b.text)).toEqual([
      'Away',
      'On a job',
      'Lounging',
    ]);
    expect(activityBadges(sampleCreature('growing'), { loungerId: null })).toEqual([]);
  });

  it('name the ribbons held', () => {
    expect(ribbonsHeldText(0)).toBe('None yet');
    expect(ribbonsHeldText(1)).toBe('Bronze Ribbon');
    expect(ribbonsHeldText(3)).toBe('Bronze Ribbon, Silver Ribbon, Gold Ribbon');
    expect(ribbonsHeldText(9)).toBe('Bronze Ribbon, Silver Ribbon, Gold Ribbon');
  });

  it('give the explorer rank, experience and trips', () => {
    expect(explorerFacts({ rank: 3, xp: 120, nextRankXp: 400, trips: 7 })).toEqual([
      { label: 'Explorer rank', value: '3' },
      { label: 'Explorer XP', value: '120 / 400' },
      { label: 'Trips', value: '7' },
    ]);
    expect(explorerFacts({ rank: 9, xp: 5000, nextRankXp: null, trips: 90 })[1]?.value).toBe(
      '5000 (top rank)',
    );
  });

  it('show the species under a nickname only', () => {
    expect(speciesSubtitle(sampleCreature('nickname and badges'))).toBe('Cindle');
    expect(speciesSubtitle(sampleCreature('growing'))).toBeNull();
  });

  it('build a safe element id from the creature id', () => {
    expect(cardDomId('a653e00a-457f')).toBe('creature-card-a653e00a-457f');
    expect(cardDomId('x" onload="y')).toBe('creature-card-xonloady');
  });
});
