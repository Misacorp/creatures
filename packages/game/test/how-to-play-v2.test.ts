import { describe, expect, it } from 'vitest';
import { combatV2 } from '../src/combat-v2';
import {
  GLOSSARY_IDS,
  GLOSSARY_SECTIONS_V2,
  RULES,
  glossary,
  glossaryEntry,
  howToPlay,
  howToPlayV2,
  loadHowToPlayV2,
} from '../src/index';
import howToPlayV2Json from '../src/content/data/how-to-play-v2.json';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Every braced word of a text, `{Mark}` gives "Mark". */
const keywordsIn = (text: string): string[] =>
  [...text.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] ?? '');

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

describe('the combat v2 How to play text', () => {
  it('has the six sections in the page order, each with 3 to 5 lines', () => {
    expect(howToPlayV2.sections.map((s) => s.id)).toEqual([...GLOSSARY_SECTIONS_V2]);
    expect(howToPlayV2.sections).toHaveLength(6);
    for (const s of howToPlayV2.sections) {
      expect(s.lines.length, s.id).toBeGreaterThanOrEqual(3);
      expect(s.lines.length, s.id).toBeLessThanOrEqual(5);
    }
  });

  it('keeps the shipped page as it was: no v2 section in it', () => {
    for (const s of howToPlay.sections) expect(s.id.startsWith('v2-')).toBe(false);
    expect(howToPlay.sections).toHaveLength(12);
  });

  it('uses only keywords the combat v2 content defines, each with a glossary entry', () => {
    const used = new Set<string>();
    for (const s of howToPlayV2.sections)
      for (const line of s.lines) for (const name of keywordsIn(line)) used.add(name);
    expect(used.size).toBeGreaterThan(0);
    for (const name of used) {
      expect(Object.hasOwn(combatV2.keywords, name), name).toBe(true);
      expect(glossaryEntry(GLOSSARY_IDS.keyword(name)), name).toBeDefined();
    }
  });

  it('keeps rule numbers, formulas, intent and any "hard boss" wording out of the text', () => {
    const all = howToPlayV2Json.sections.map((s) => [s.title, ...s.lines].join(' ')).join(' ');
    // Names, not rules: "Stage 1", "stage 2" and "Row 1".
    expect(all.replace(/\b(?:stage|row) \d\b/gi, '')).not.toMatch(/\d/);
    expect(all).not.toMatch(/\bR\d|intent|formula|%/i);
    expect(all).not.toMatch(/\bwall\b|harder|hardest|tougher|difficult/i);
  });

  it('says the weekend as the schedule has it: stage 1, stage 2 and the finale in the evening', () => {
    const { phase1, phase2, finale } = RULES.raid.scheduleV2;
    const weekend = howToPlayV2.sections.find((s) => s.id === 'v2-weekend')?.lines.join(' ') ?? '';
    expect(weekend).toContain(`Stage 1 plays on ${WEEKDAYS[phase1.weekday - 1] ?? '?'}`);
    expect(weekend).toContain(`stage 2 on ${WEEKDAYS[phase2.weekday - 1] ?? '?'}`);
    expect(weekend).toContain(`finale on ${WEEKDAYS[finale.weekday - 1] ?? '?'} evening`);
    expect(finale.hour).toBeGreaterThanOrEqual(17);
  });

  it('names the pieces the brief asks for', () => {
    const lines = (id: string): string =>
      howToPlayV2.sections.find((s) => s.id === id)?.lines.join(' ') ?? '';
    expect(lines('v2-marks')).toContain('mark strip');
    expect(lines('v2-knacks')).toMatch(/one Knack/);
    expect(lines('v2-knacks')).toMatch(/locked/);
    for (const word of [
      'Slam',
      'Lance',
      'Sweep',
      'Barrage',
      'Quake',
      'Strike',
      'Hush',
      'Pincer',
      'Leap',
    ]) {
      expect(lines('v2-board'), word).toContain(word);
    }
    for (const word of ['Front', 'Rear', 'Payoff', 'Nemesis', 'Vulture', 'Wild']) {
      expect(lines('v2-board'), word).toContain(word);
    }
    expect(lines('v2-armour')).toContain('{Blocked}');
    expect(lines('v2-weekend')).toMatch(/out for the weekend/);
    expect(lines('v2-weekend')).toMatch(/Players lock in/);
    expect(lines('v2-weekend')).toContain('Ask to swap');
    expect(lines('v2-rank')).toMatch(/did not beat/);
  });

  it('rejects a wrong order, a v1 section, a missing section and a bad shape', () => {
    const raw = (): { sections: Record<string, unknown>[] } =>
      clone<{ sections: Record<string, unknown>[] }>(howToPlayV2Json);

    const swapped = raw();
    [swapped.sections[0], swapped.sections[1]] = [
      swapped.sections[1] as Record<string, unknown>,
      swapped.sections[0] as Record<string, unknown>,
    ];
    expect(() => loadHowToPlayV2(swapped)).toThrow(/must be "v2-marks"/);

    const v1 = raw();
    v1.sections[0]!['id'] = 'combos';
    expect(() => loadHowToPlayV2(v1)).toThrow(/schema/);

    const missing = raw();
    missing.sections.pop();
    expect(() => loadHowToPlayV2(missing)).toThrow(/schema/);

    const few = raw();
    (few.sections[0] as { lines: string[] }).lines = ['one', 'two'];
    expect(() => loadHowToPlayV2(few)).toThrow(/schema/);

    const extra = raw();
    extra.sections[0]!['extra'] = true;
    expect(() => loadHowToPlayV2(extra)).toThrow(/schema/);

    const long = raw();
    (long.sections[0] as { lines: string[] }).lines[0] = 'x'.repeat(121);
    expect(() => loadHowToPlayV2(long)).toThrow(/schema/);
  });
});

describe('the combat v2 keyword glossary', () => {
  const keywordNames = Object.keys(combatV2.keywords);

  it('has an entry for every keyword the content defines, titled with its name', () => {
    expect(keywordNames.length).toBe(27);
    for (const name of keywordNames) {
      const entry = glossaryEntry(GLOSSARY_IDS.keyword(name));
      expect(entry, name).toBeDefined();
      expect(entry?.title).toBe(name);
    }
  });

  it('has no entry for a keyword that is gone', () => {
    const entries = glossary.filter((e) => e.id.startsWith('kw-'));
    expect(entries.map((e) => e.title).sort()).toEqual([...keywordNames].sort());
  });

  it('opens each keyword at a section of the combat v2 page', () => {
    for (const name of keywordNames) {
      const entry = glossaryEntry(GLOSSARY_IDS.keyword(name));
      expect(GLOSSARY_SECTIONS_V2.includes(entry?.section as never), name).toBe(true);
    }
  });

  it('says it in words, with no digits, rule numbers or formulas', () => {
    for (const e of glossary.filter((entry) => entry.id.startsWith('kw-'))) {
      const text = [e.title, e.short, ...e.lines].join(' ');
      expect(text, e.id).not.toMatch(/\d|%|\bR\d/);
      expect(e.short.length, e.id).toBeGreaterThan(0);
    }
  });

  it('keeps the numbers it does spell out the same as the rules', () => {
    const text = (name: string): string => {
      const e = glossaryEntry(GLOSSARY_IDS.keyword(name));
      return [e?.short, ...(e?.lines ?? [])].join(' ');
    };
    expect(combatV2.rules.maxStacks).toBe(3);
    expect(text('Mark')).toContain('up to three stacks');
    expect(combatV2.rules.areaDodgeShareBp).toBe(5000);
    expect(text('Area hit')).toContain('half as often');
    expect(combatV2.rules.critBp).toBe(20_000);
    expect(text('Crit')).toContain('double');
  });
});
