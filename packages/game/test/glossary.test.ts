import { describe, expect, it } from 'vitest';
import {
  GEAR_RARITIES,
  GEAR_STATS,
  GLOSSARY_IDS,
  JOB_KINDS,
  PART_KINDS,
  GLOSSARY_SECTIONS,
  dungeonContent,
  RULES,
  abilityView,
  content,
  glossary,
  glossaryEntry,
  gearContent,
  glossaryGaps,
  howToPlay,
  loadGlossary,
  loadHowToPlay,
  requiredGlossaryIds,
  trainingCost,
  type ContentPack,
  type GlossaryEntry,
} from '../src/index';
import glossaryJson from '../src/content/data/glossary.json';
import howToPlayJson from '../src/content/data/how-to-play.json';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const entry = (id: string): GlossaryEntry => {
  const found = glossaryEntry(id);
  if (found === undefined) throw new Error(`no glossary entry "${id}"`);
  return found;
};

/** Everything an entry says, as one string, for checking numbers and names. */
const text = (id: string): string => {
  const e = entry(id);
  return [e.title, e.short, ...e.lines].join(' ');
};

const percent = (bp: number): string => `${String(bp / 100)}%`;

describe('the glossary schema', () => {
  const raw = (): Record<string, unknown>[] => clone<Record<string, unknown>[]>(glossaryJson);
  const first = (list: Record<string, unknown>[]): Record<string, unknown> =>
    list[0] as Record<string, unknown>;

  it('accepts the shipped glossary', () => {
    expect(() => loadGlossary(raw(), content)).not.toThrow();
    expect(glossary.length).toBeGreaterThan(40);
  });

  it('rejects unknown keys, long text, too many lines and bad sections', () => {
    const cases: [string, (e: Record<string, unknown>) => void][] = [
      ['an unknown key', (e) => (e['extra'] = 1)],
      ['a title over 32 characters', (e) => (e['title'] = 'x'.repeat(33))],
      ['a short line over 80 characters', (e) => (e['short'] = 'x'.repeat(81))],
      ['more than 4 lines', (e) => (e['lines'] = ['a', 'b', 'c', 'd', 'e'])],
      ['a line over 120 characters', (e) => (e['lines'] = ['x'.repeat(121)])],
      ['an unknown section', (e) => (e['section'] = 'secrets')],
      ['an empty title', (e) => (e['title'] = '')],
      ['an id that is not kebab-case', (e) => (e['id'] = 'Not Kebab')],
      [
        'a picture with an unknown key',
        (e) => (e['visual'] = { kind: 'element', id: 'tide', x: 1 }),
      ],
      ['a picture of an unknown kind', (e) => (e['visual'] = { kind: 'photo', id: 'tide' })],
    ];
    for (const [name, change] of cases) {
      const list = raw();
      change(first(list));
      expect(() => loadGlossary(list, content), name).toThrow(/Invalid glossary schema/);
    }
  });

  it('rejects control, bidi and zero-width characters in the text', () => {
    for (const bad of ['a\nb', 'a‮b', 'a​b', 'a\u0000b']) {
      const list = raw();
      first(list)['short'] = bad;
      expect(() => loadGlossary(list, content), JSON.stringify(bad)).toThrow(/schema/);
    }
  });

  it('rejects duplicate ids and pictures of things that do not exist', () => {
    const dup = raw();
    (dup[1] as Record<string, unknown>)['id'] = first(dup)['id'];
    expect(() => loadGlossary(dup, content)).toThrow(/duplicate entry id/);

    for (const visual of [
      { kind: 'element', id: 'plasma' },
      { kind: 'mark', id: 'plasma' },
      { kind: 'species', id: 'nobody' },
      { kind: 'reaction', id: 'nothing' },
    ]) {
      const list = raw();
      first(list)['visual'] = visual;
      expect(() => loadGlossary(list, content), visual.kind).toThrow(/unknown/);
    }
  });
});

describe('the glossary covers the content', () => {
  it('has an entry for everything the content defines', () => {
    expect(glossaryGaps(glossary, content)).toEqual([]);
  });

  it('has an entry for every element, role, mark, reaction, gimmick op, zone and turn order', () => {
    for (const e of content.elements)
      expect(glossaryEntry(GLOSSARY_IDS.element(e.id))).toBeDefined();
    for (const role of ['setter', 'payoff', 'guard', 'support']) {
      expect(glossaryEntry(GLOSSARY_IDS.role(role)), role).toBeDefined();
    }
    for (const r of content.reactions) {
      expect(glossaryEntry(GLOSSARY_IDS.mark(r.markId)), r.markId).toBeDefined();
      expect(glossaryEntry(GLOSSARY_IDS.reaction(r.id)), r.id).toBeDefined();
    }
    for (const boss of content.bosses) {
      for (const g of boss.gimmicks) {
        expect(glossaryEntry(GLOSSARY_IDS.gimmick(g.op)), g.op).toBeDefined();
      }
      expect(glossaryEntry(GLOSSARY_IDS.turnOrder(boss.turnOrder)), boss.turnOrder).toBeDefined();
    }
    for (const zone of ['front', 'middle', 'back']) {
      expect(glossaryEntry(GLOSSARY_IDS.zone(zone)), zone).toBeDefined();
    }
    for (const band of ['long_shot', 'even', 'likely', 'strong']) {
      expect(glossaryEntry(GLOSSARY_IDS.readiness(band)), band).toBeDefined();
    }
  });

  it('can build a popover for every basic and creature ability', () => {
    expect(content.finaleAbilities.length).toBeGreaterThan(20);
    for (const a of content.finaleAbilities) {
      const view = abilityView(a.id);
      expect(view, a.id).toBeDefined();
      // The popover explains the thing tapped: its own name and its real effect line.
      expect(view?.title).toBe(a.name);
      expect(view?.short).toBe(a.description);
      expect(view?.lines.length).toBeGreaterThanOrEqual(2);
    }
    expect(abilityView('no-such-ability')).toBeUndefined();
  });

  it('fails when content is added without an entry', () => {
    const without = (id: string): GlossaryEntry[] => glossary.filter((e) => e.id !== id);
    expect(glossaryGaps(without('element-tide'))).toEqual(['element-tide']);
    expect(glossaryGaps(without('role-guard'))).toEqual(['role-guard']);
    expect(glossaryGaps(without('reaction-steam'))).toEqual(['reaction-steam']);
    expect(glossaryGaps(without('mark-soaked'))).toEqual(['mark-soaked']);
    expect(glossaryGaps(without('gimmick-hit-zone'))).toEqual(['gimmick-hit-zone']);
    expect(glossaryGaps(without('auto-fire'))).toEqual(['auto-fire']);
    expect(glossaryGaps(without('turn-speed'))).toEqual(['turn-speed']);
    expect(glossaryGaps(without('zone-back'))).toEqual(['zone-back']);
    // Without the kind entry, every ability of the kind loses its popover as well.
    const noRally = glossaryGaps(without('ability-rally'));
    expect(noRally).toContain('ability-rally');
    expect(noRally).toContain('ability:rally');
  });

  it('notices a new reaction, gimmick op, ability effect or ability in the content', () => {
    const pack = clone<ContentPack>(content);
    pack.reactions.push({
      id: 'meltdown',
      name: 'Meltdown',
      markId: 'frozen',
      markName: 'Frozen',
      markElement: 'tide',
      triggerElement: 'ember',
      multiplierBp: 45000,
      payoffBonusBp: 11000,
    });
    pack.finaleAbilities.push({
      id: 'brand-new',
      name: 'Brand New',
      description: 'Does something new.',
      kind: 'basic',
      effects: [{ op: 'purge', rounds: 1 }],
      defaultRound: 2,
    });
    const gaps = glossaryGaps(glossary, pack);
    expect(gaps).toContain('mark-frozen');
    expect(gaps).toContain('reaction-meltdown');
    expect(gaps).not.toContain('ability:brand-new'); // a purge ability is built from existing kinds
    expect(requiredGlossaryIds(pack)).toContain('reaction-meltdown');

    const wall = clone<ContentPack>(content);
    wall.bosses[0]?.gimmicks.push({
      id: 'new-trick',
      name: 'New trick',
      trigger: { every: 2 },
      op: 'hit_zone',
      zone: 'back',
      power: 1000,
    });
    expect(glossaryGaps(glossary, wall)).toEqual([]); // hit_zone already has its entry
  });

  it('points at pictures the content has', () => {
    for (const e of glossary) {
      const v = e.visual;
      if (v === undefined) continue;
      if (v.kind === 'element' || v.kind === 'mark') {
        expect(
          content.elements.some((el) => el.id === v.id),
          e.id,
        ).toBe(true);
      }
      if (v.kind === 'species')
        expect(
          content.creatures.some((c) => c.id === v.id),
          e.id,
        ).toBe(true);
      if (v.kind === 'reaction')
        expect(
          content.reactions.some((r) => r.id === v.id),
          e.id,
        ).toBe(true);
    }
  });
});

describe('the glossary text matches the rules', () => {
  it('describes the element matchups and marks from the content', () => {
    const name = (id: string): string => content.elements.find((e) => e.id === id)?.name ?? '?';
    for (const el of content.elements) {
      const e = entry(GLOSSARY_IDS.element(el.id));
      const weakTo = content.elements.find((o) => o.strongAgainst === el.id);
      const reaction = content.reactions.find((r) => r.markElement === el.id);
      expect(e.title).toBe(el.name);
      expect(e.lines[0]).toContain(name(el.strongAgainst));
      expect(e.lines[0]).toContain(percent(RULES.combat.strongBp - 10_000));
      expect(e.lines[1]).toContain(name(weakTo?.id ?? ''));
      expect(e.lines[1]).toContain(percent(10_000 - RULES.combat.weakBp));
      expect(e.lines[2]).toContain(reaction?.markName);
      expect(e.lines[2]).toContain(name(reaction?.triggerElement ?? ''));
    }
  });

  it('describes the roles with the real numbers', () => {
    expect(text('role-guard')).toContain(percent(RULES.combat.guardHpBp));
    expect(text('role-support')).toContain(percent(RULES.combat.supportBuffBp));
    for (const r of content.reactions) {
      expect(text('role-payoff')).toContain(percent(r.payoffBonusBp - 10_000));
    }
  });

  it('describes each mark and reaction with its own elements, names and multiplier', () => {
    const name = (id: string): string => content.elements.find((e) => e.id === id)?.name ?? '?';
    for (const r of content.reactions) {
      const mark = text(GLOSSARY_IDS.mark(r.markId));
      expect(mark).toContain(r.markName);
      expect(mark).toContain(r.name);
      expect(mark).toContain(name(r.markElement));
      expect(mark).toContain(name(r.triggerElement));
      const reaction = text(GLOSSARY_IDS.reaction(r.id));
      expect(reaction).toContain(r.name);
      expect(reaction).toContain(r.markName);
      expect(reaction).toContain(name(r.triggerElement));
      expect(reaction).toContain(`${String(r.multiplierBp / 10_000)} times`);
      expect(reaction).toContain(percent(r.payoffBonusBp - 10_000));
    }
  });

  it('gives crits, Boss Rank, Festival and seasons the numbers the rules have', () => {
    const luck = RULES.combat.luck;
    const crit = text('crit');
    expect(crit).toContain(percent(luck.critChanceBp));
    expect(crit).toContain(percent(luck.critBp));
    expect(luck.bossCritChanceBp).toBe(luck.critChanceBp);
    expect(luck.bossCritBp).toBe(luck.critBp);

    const p = RULES.progression;
    expect(text('boss-rank')).toContain(percent(RULES.raid.scaling.rankStepBp));
    expect(text('boss-rank')).toContain(`goes up by ${String(p.winRankUp)}`);
    const festival = text('festival');
    expect(festival).toContain(`Every ${String(p.seasonWeeks)}th`);
    expect(festival).toContain(`${String(p.festivalEaseRanks)} Ranks lower`);
    expect(festival).toContain(percent(p.festivalEssenceBp));
    expect(festival).toContain(`eases by ${String(p.seasonResetRanks)}`);
    expect(p.festivalWinRankUp).toBe(0); // "A win keeps the Rank"
    expect(text('season')).toContain(`${String(p.seasonWeeks)} raid weeks`);
    expect(text('season')).toContain(`Weeks 1 to ${String(p.seasonWeeks - 1)}`);
  });

  it('gives levels, training, fusion, shiny and abilities the numbers the rules have', () => {
    expect(text('creature-ability')).toContain(`level ${String(RULES.abilities.unlockLevel)}`);
    expect(text('level')).toContain(`level ${String(RULES.abilities.unlockLevel)}`);
    const stage1 = content.creatures.filter((c) => c.evolvesTo !== undefined);
    expect(new Set(stage1.map((c) => c.levelCap))).toEqual(new Set([15]));
    expect(text('level')).toContain('level 15');
    expect(text('level')).toContain(String(Math.max(...content.creatures.map((c) => c.levelCap))));

    const training = text('training-cost');
    expect(training).toContain(
      `${String(RULES.training.baseCost)} + ${String(RULES.training.perLevel)} x`,
    );
    expect(training).toContain(`costs ${String(trainingCost(1))} Bait`);
    expect(training).toContain(`costs ${String(trainingCost(10))}`);
    expect(training).toContain(
      `more than ${String(RULES.training.discountLevelsBelowMedian)} levels`,
    );

    const bonuses = RULES.fusion.cumulativeBonusBp;
    expect(text('fusion')).toContain(percent(bonuses[RULES.fusion.maxFusions] ?? 0));
    expect(text('fusion')).toContain(`After ${String(RULES.fusion.maxFusions)}`);
    expect(text('shiny')).toContain(`1 in ${String(RULES.catching.shiny.denominator)}`);
    expect(RULES.catching.shiny.numerator).toBe(1);

    const evolutionEssence = new Set(
      content.creatures.flatMap((c) => (c.evolvesTo === undefined ? [] : [c.evolvesTo.essence])),
    );
    expect(evolutionEssence).toEqual(new Set([20, 40]));
    expect(text('essence')).toContain('20 Essence (40 for rare');
  });

  it('describes the adaptation rules with the content numbers', () => {
    const resists = content.adaptations.map((a) => percent(a.resistBp));
    for (const r of resists) expect(text('adaptation')).toContain(r);
  });

  it('names every effect kind an ability has, in the popover', () => {
    const rally = abilityView('rally');
    expect(rally?.lines.join(' ')).toContain('Rally');
    const mossBloom = abilityView('moss-bloom');
    const lines = mossBloom?.lines.join(' ') ?? '';
    expect(lines).toContain('Strike');
    expect(lines).toContain('Re-mark');
    expect(lines).toContain('Shield Wall');
    expect(mossBloom?.section).toBe('creatures');
    expect(abilityView('purge')?.section).toBe('finale');
  });

  it('keeps the turn-order entries to the kinds the engine has', () => {
    expect(text('turn-speed')).toContain('Speed');
    expect(text('turn-left-to-right')).toContain('slot 1 first');
    expect(text('turn-right-to-left')).toContain('last slot first');
  });
});

describe('the How to play text', () => {
  it('has the ten sections in the page order, each with 3 to 5 lines', () => {
    expect(howToPlay.sections.map((s) => s.id)).toEqual([...GLOSSARY_SECTIONS]);
    for (const s of howToPlay.sections) {
      expect(s.lines.length).toBeGreaterThanOrEqual(3);
      expect(s.lines.length).toBeLessThanOrEqual(5);
    }
  });

  it('sends the gear, parts, enchant, job and skill entries to the Workshop section', () => {
    const gearIds = glossary.filter((e) =>
      /^(gear|workshop|blueprint|part-|enchant-|job-|skill-)/.test(e.id),
    );
    expect(gearIds.length).toBeGreaterThan(20);
    for (const e of gearIds) expect(e.section, e.id).toBe('workshop');
    expect(howToPlay.sections.at(-1)?.id).toBe('workshop');
  });

  it('gives every glossary entry a section the page has', () => {
    const ids = new Set(howToPlay.sections.map((s) => s.id));
    for (const e of glossary) expect(ids.has(e.section), e.id).toBe(true);
  });

  it('uses a real Setter and the creature that cashes its mark in', () => {
    const { setter, payoff } = howToPlay.example;
    const a = content.creatures.find((c) => c.id === setter);
    const b = content.creatures.find((c) => c.id === payoff);
    expect(a?.role).toBe('setter');
    const reaction = content.reactions.find((r) => r.markElement === a?.element);
    expect(b?.element).toBe(reaction?.triggerElement);
    expect(howToPlayJson.example.lines.join(' ')).toContain(reaction?.name ?? '?');
    expect(howToPlayJson.example.lines.join(' ')).toContain(
      String(reaction === undefined ? 0 : reaction.multiplierBp / 10_000),
    );
  });

  it('rejects a wrong order, a wrong example and a bad shape', () => {
    const raw = (): { sections: Record<string, unknown>[]; example: Record<string, unknown> } =>
      clone<{ sections: Record<string, unknown>[]; example: Record<string, unknown> }>(
        howToPlayJson,
      );

    const swapped = raw();
    [swapped.sections[0], swapped.sections[1]] = [
      swapped.sections[1] as Record<string, unknown>,
      swapped.sections[0] as Record<string, unknown>,
    ];
    expect(() => loadHowToPlay(swapped, content)).toThrow(/must be "first-week"/);

    const notSetter = raw();
    notSetter.example['setter'] = 'stormray';
    expect(() => loadHowToPlay(notSetter, content)).toThrow(/must be a Setter/);

    const wrongPayoff = raw();
    wrongPayoff.example['payoff'] = 'cindle';
    expect(() => loadHowToPlay(wrongPayoff, content)).toThrow(/element that cashes in/);

    const unknown = raw();
    unknown.example['payoff'] = 'nobody';
    expect(() => loadHowToPlay(unknown, content)).toThrow(/unknown species/);

    const few = raw();
    (few.sections[0] as { lines: string[] }).lines = ['one', 'two'];
    expect(() => loadHowToPlay(few, content)).toThrow(/schema/);

    const extra = raw();
    extra.sections[0]!['extra'] = true;
    expect(() => loadHowToPlay(extra, content)).toThrow(/schema/);

    const missing = raw();
    missing.sections.pop();
    expect(() => loadHowToPlay(missing, content)).toThrow(/schema/);
  });
});

describe('the glossary covers gear and crafting', () => {
  it('has an entry for every gear stat, rarity, part, enchant, job kind and the Crafting skill', () => {
    for (const stat of GEAR_STATS)
      expect(glossaryEntry(GLOSSARY_IDS.gearStat(stat)), stat).toBeDefined();
    for (const rarity of GEAR_RARITIES) {
      expect(glossaryEntry(GLOSSARY_IDS.gearRarity(rarity)), rarity).toBeDefined();
    }
    for (const kind of PART_KINDS)
      expect(glossaryEntry(GLOSSARY_IDS.part(kind)), kind).toBeDefined();
    for (const e of gearContent.enchants) {
      expect(glossaryEntry(GLOSSARY_IDS.enchant(e.id)), e.id).toBeDefined();
    }
    for (const kind of JOB_KINDS) expect(glossaryEntry(GLOSSARY_IDS.job(kind)), kind).toBeDefined();
    for (const id of [GLOSSARY_IDS.skill('crafting'), 'gear', 'workshop', 'blueprint']) {
      expect(glossaryEntry(id), id).toBeDefined();
    }
  });

  it('fails when a new gear stat, part, enchant or job kind has no entry', () => {
    const without = (id: string): GlossaryEntry[] => glossary.filter((e) => e.id !== id);
    for (const id of [
      'gear-stat-crit-chance',
      'gear-rarity-festival',
      'part-glimmer',
      'part-tide-shard',
      'enchant-spark-luck',
      'job-enchant',
      'skill-crafting',
      'workshop',
    ]) {
      expect(glossaryGaps(without(id)), id).toEqual([id]);
    }
    expect(requiredGlossaryIds(content)).toContain('gear-stat-crit-damage');
  });

  it('gives gear the numbers the rules have', () => {
    const caps = RULES.gear.caps;
    expect(text('gear-stat-atk')).toContain(`${percent(caps.atk)} Attack`);
    expect(text('gear-stat-hp')).toContain(`${percent(caps.hp)} HP`);
    expect(text('gear-stat-spd')).toContain(percent(caps.spd));
    expect(text('gear-stat-crit-chance')).toContain(`${String(caps.critChance / 100)} points`);
    expect(text('gear-stat-crit-chance')).toContain(percent(RULES.combat.luck.critChanceBp));
    expect(text('gear-stat-crit-chance')).toContain(percent(RULES.combat.luck.critMaxChanceBp));
    expect(text('gear-stat-crit-damage')).toContain(`${String(caps.critDamage / 100)} points`);
    expect(text('gear-stat-crit-damage')).toContain(percent(RULES.combat.luck.critBp));
    expect(text('gear-stat-crit-damage')).toContain(percent(RULES.combat.luck.critMaxBp));
    expect(text('gear-rarity-rare')).toContain(percent(RULES.gear.rarity.rare.primaryBp - 10_000));
    expect(text('gear-rarity-epic')).toContain(percent(RULES.gear.rarity.epic.primaryBp - 10_000));
    expect(RULES.gear.rarity.festival).toEqual(RULES.gear.rarity.epic);
    expect(text('workshop')).toContain(`${String(RULES.gear.workshopSlots)} jobs`);
    expect(text('blueprint')).toContain(
      `${String(RULES.gear.drops.duplicateBlueprintScrap)} scrap`,
    );
    const hours = RULES.gear.jobHours;
    expect(text('job-craft')).toContain(
      `${String(hours.craft.common)} hours for Common, ${String(hours.craft.rare)} for Rare and ${String(hours.craft.epic)}`,
    );
    expect(text('job-improve')).toContain(`${String(hours.improve)} hours`);
    expect(text('job-enchant')).toContain(`${String(hours.enchant)} hours`);
    expect(text('skill-crafting')).toContain(
      `${percent(RULES.gear.skill.timeReductionBpPerLevel)} shorter`,
    );
    expect(text('skill-crafting')).toContain(
      `${percent(RULES.gear.skill.rarityUpBpPerLevel)} chance`,
    );
  });

  it('describes each enchant with its own amount, who it works for and its cost', () => {
    const statName = {
      atk: 'Attack',
      hp: 'HP',
      spd: 'speed',
      critChance: 'crit',
      critDamage: 'crit',
    };
    for (const e of gearContent.enchants) {
      const entry = glossaryEntry(GLOSSARY_IDS.enchant(e.id));
      expect(entry?.title).toBe(e.name);
      const all = text(GLOSSARY_IDS.enchant(e.id));
      expect(all).toContain(statName[e.stat]);
      const amount =
        e.stat === 'critChance' || e.stat === 'critDamage'
          ? `${String(e.bp / 100)} points`
          : percent(e.bp);
      expect(all).toContain(amount);
      expect(all).toContain(`${String(RULES.gear.enchant.glimmer)} glimmer`);
      expect(all).toContain(
        `${String(RULES.gear.enchant.shard)} ${e.shard[0]?.toUpperCase() ?? ''}${e.shard.slice(1)} shards`,
      );
      if (e.when === undefined) expect(all).toContain('every creature');
      else if ('role' in e.when) expect(all.toLowerCase()).toContain(e.when.role);
      else expect(all.toLowerCase()).toContain(e.when.element);
    }
  });

  it('shows an element picture on each shard entry', () => {
    for (const el of ['tide', 'ember', 'grove', 'spark']) {
      expect(entry(GLOSSARY_IDS.part(`${el}-shard`)).visual).toEqual({ kind: 'element', id: el });
    }
  });
});

describe('the glossary covers the daily dungeon', () => {
  const fixed = [
    'dungeon',
    'dungeon-row',
    'depth',
    'room-modifiers',
    'room-boss',
    'landmark',
    'streak',
  ];

  it('has an entry for every room modifier and every dungeon term', () => {
    for (const m of dungeonContent.modifiers) {
      expect(glossaryEntry(GLOSSARY_IDS.modifier(m.id)), m.id).toBeDefined();
    }
    for (const id of fixed) expect(glossaryEntry(id), id).toBeDefined();
    expect(glossaryGaps(glossary, content)).toEqual([]);
  });

  it('fails when a modifier or a dungeon term has no entry', () => {
    const without = (id: string): GlossaryEntry[] => glossary.filter((e) => e.id !== id);
    for (const id of [
      'modifier-flooded',
      'modifier-fog',
      'dungeon',
      'depth',
      'landmark',
      'streak',
    ]) {
      expect(glossaryGaps(without(id)), id).toEqual([id]);
    }
    expect(requiredGlossaryIds(content)).toContain('modifier-brittle');
  });

  it('describes each modifier with its own name and text, and the element ones with a picture', () => {
    for (const m of dungeonContent.modifiers) {
      const e = entry(GLOSSARY_IDS.modifier(m.id));
      expect(e.title).toBe(m.name);
      expect(e.short).toBe(m.description);
      const first = m.effects[0];
      if (m.effects.length === 1 && first?.op === 'team_stat' && first.element !== undefined) {
        expect(e.visual).toEqual({ kind: 'element', id: first.element });
        expect(m.description).toContain(percent(first.bp));
      }
    }
  });

  it('gives depth, landmarks and streaks the numbers the rules have', () => {
    const d = RULES.dungeon;
    expect(text('depth')).toContain(`${percent(d.hpStepBp)} foe HP`);
    expect(text('depth')).toContain(`${percent(d.atkStepBp)} foe Attack`);
    expect(text('depth')).toContain(`${String(d.landmarkEvery)}th depth`);
    expect(text('landmark')).toContain(
      `${String(d.landmarkEvery)}, ${String(2 * d.landmarkEvery)}, ${String(3 * d.landmarkEvery)}`,
    );
    expect(text('landmark')).toContain('for certain');
    expect(d.streak.bonuses.map((b) => b.day)).toEqual([3, 7]);
    expect(d.streak.cycleDays).toBe(7);
    expect(text('streak')).toContain('3rd and 7th day of every 7');
    expect(d.rooms).toBe(3);
    expect(text('dungeon')).toContain('Three rooms');
    expect(d.teamSize).toBe(3);
  });

  it('sends the dungeon entries to the Daily dungeon section of the page', () => {
    const ids = new Set(howToPlay.sections.map((s) => s.id));
    const entries = glossary.filter((g) => g.id.startsWith('modifier-') || fixed.includes(g.id));
    expect(entries.length).toBe(fixed.length + dungeonContent.modifiers.length);
    for (const e of entries) {
      expect(ids.has(e.section), e.id).toBe(true);
      expect(e.section, e.id).toBe('dungeon');
    }
  });

  it('has a Daily dungeon section that says what the rules say', () => {
    const section = howToPlay.sections.find((s) => s.id === 'dungeon');
    expect(section?.title).toBe('Daily dungeon');
    expect(section?.lines.length).toBeGreaterThanOrEqual(3);
    expect(section?.lines.length).toBeLessThanOrEqual(5);
    const words = (section?.lines ?? []).join(' ');
    const d = RULES.dungeon;
    expect(words).toContain('One run a day');
    expect(words).toContain('retried once');
    // The reset time in the text is the rule's (13:37), and the glossary entry says the same.
    const reset = `${String(RULES.daily.reset.hour)}:${String(RULES.daily.reset.minute).padStart(2, '0')}`;
    expect(words).toContain(`resets at ${reset}`);
    expect(JSON.stringify(entry('dungeon'))).toContain(`resets at ${reset}`);
    expect(words).toContain('team of three');
    expect(d.teamSize).toBe(3);
    expect(words).toContain('three rooms: two foes, then a room boss');
    expect(d.rooms).toBe(3);
    expect(words).toContain('HP carries over');
    expect(words).toContain('one depth deeper');
    expect(words).toContain(`${String(d.landmarkEvery)}th depth is a landmark`);
    expect(words).toContain('gear for sure');
    expect(d.streak.bonuses.map((b) => b.day)).toEqual([3, 7]);
    expect(d.streak.cycleDays).toBe(7);
    expect(words).toContain('3rd and 7th day of every 7');
  });
});
