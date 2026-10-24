import { RULES } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { sampleCreature, talentView } from './creature-card-sample';
import {
  activityBadges,
  canLounge,
  cardDomId,
  explorerFacts,
  lockedText,
  loungingText,
  ribbonsHeldText,
  speciesSubtitle,
  talentKit,
  xpWords,
} from './creature-card-view';

describe('the bar', () => {
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
    expect(kit.label).toBe('Talents: Quick to Pounce (golden), slot 2 opens at level 20');
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
    expect(
      activityBadges(creature, { loungerId: creature.id, loungeXp: { [creature.id]: 34 } }).map(
        (b) => b.text,
      ),
    ).toEqual(['Away', 'On a job', 'Lounging 34 / 60 XP']);
    expect(activityBadges(sampleCreature('growing'), { loungerId: null, loungeXp: {} })).toEqual(
      [],
    );
  });

  it('say Rested at the daily cap: on the lounger in its tag, on any other creature on its own', () => {
    const creature = sampleCreature('growing');
    const capped = { [creature.id]: RULES.experience.lounge.dailyCap };
    expect(
      activityBadges(creature, { loungerId: creature.id, loungeXp: capped }).map((b) => b.text),
    ).toEqual(['Lounging · Rested']);
    expect(activityBadges(creature, { loungerId: 'other', loungeXp: capped })).toEqual([
      { text: 'Rested', tone: 'rested', entry: 'lounging' },
    ]);
    // Some XP short of the cap shows nothing on a creature that is not lounging.
    expect(
      activityBadges(creature, { loungerId: 'other', loungeXp: { [creature.id]: 59 } }),
    ).toEqual([]);
    expect(loungingText(0)).toBe('Lounging 0 / 60 XP');
  });

  it('let only a free creature that is not lounging already go to the living room', () => {
    const creature = sampleCreature('growing');
    expect(canLounge(creature, { loungerId: null })).toBe(true);
    expect(canLounge(creature, { loungerId: creature.id })).toBe(false);
    expect(canLounge({ ...creature, busy: { kind: 'job', id: 'j' } }, { loungerId: null })).toBe(
      false,
    );
  });

  it('name the ribbons held', () => {
    expect(ribbonsHeldText(0)).toBe('None yet');
    expect(ribbonsHeldText(1)).toBe('Bronze Ribbon');
    expect(ribbonsHeldText(3)).toBe('Bronze Ribbon, Silver Ribbon, Gold Ribbon');
    expect(ribbonsHeldText(9)).toBe('Bronze Ribbon, Silver Ribbon, Gold Ribbon');
  });

  it('give the explorer rank and experience (the expedition count is in the Stats table)', () => {
    expect(explorerFacts({ rank: 3, xp: 120, nextRankXp: 400, trips: 7 })).toEqual([
      { label: 'Explorer rank', value: '3' },
      { label: 'Explorer XP', value: '120 / 400' },
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
