import { describe, expect, it } from 'vitest';
import {
  RULES,
  dungeonContent,
  dungeonEvent,
  dungeonEvents,
  dungeonKeepsake,
  dungeonKeepsakes,
  eventOptionCosts,
  loadDungeonRun,
  type EventEffect,
} from '../src/index';
import keepsakesJson from '../src/content/data/dungeon-keepsakes.json';
import eventsJson from '../src/content/data/dungeon-events.json';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const keepsakes = (): Record<string, unknown>[] => clone(keepsakesJson);
const events = (): Record<string, unknown>[] => clone(eventsJson);
const load = (k: unknown, e: unknown) => loadDungeonRun(k, e, dungeonContent);

/** The two options of the first event, as plain objects to break. */
const options = (list: Record<string, unknown>[], at = 0): Record<string, unknown>[] =>
  (list[at] as { options: Record<string, unknown>[] }).options;

describe('the shipped keepsakes and events', () => {
  it('load, with about eight of each', () => {
    expect(() => load(keepsakesJson, eventsJson)).not.toThrow();
    expect(dungeonKeepsakes).toHaveLength(8);
    expect(dungeonEvents).toHaveLength(8);
  });

  it('have unique ids that do not clash with foes, modifiers or each other', () => {
    const ids = [
      ...dungeonContent.foes.map((f) => f.id),
      ...dungeonContent.modifiers.map((m) => m.id),
      ...dungeonKeepsakes.map((k) => k.id),
      ...dungeonEvents.map((e) => e.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('can be looked up by id', () => {
    for (const k of dungeonKeepsakes) expect(dungeonKeepsake(k.id)).toEqual(k);
    for (const e of dungeonEvents) expect(dungeonEvent(e.id)).toEqual(e);
    expect(dungeonKeepsake('nope')).toBeUndefined();
    expect(dungeonEvent('nope')).toBeUndefined();
  });

  it('has the keepsakes of the design', () => {
    const find = (id: string) => dungeonKeepsake(id)?.effects;
    expect(find('wayfarer-charm')).toEqual([
      { op: 'team_stat', stat: 'atk', bp: 1200 },
      { op: 'team_stat', stat: 'hp', bp: 1200 },
    ]);
    expect(find('lantern-moth')).toEqual([{ op: 'team_crit', chanceBp: 500, damageBp: 0 }]);
    const elements = dungeonKeepsakes
      .flatMap((k) => k.effects)
      .filter((e) => e.op === 'team_stat' && e.element !== undefined && e.bp === 2500)
      .map((e) => (e.op === 'team_stat' ? e.element : ''));
    expect(elements.sort()).toEqual(['ember', 'grove', 'spark', 'tide']);
    expect(find('lullaby-bell')).toEqual([{ op: 'foe_stat', stat: 'atk', bp: -1000 }]);
    expect(find('chalk-mark')).toEqual([{ op: 'foe_stat', stat: 'hp', bp: -1000 }]);
  });

  it('never gives a keepsake a foe gimmick', () => {
    for (const k of dungeonKeepsakes) {
      for (const e of k.effects) expect(e.op).not.toBe('foe_gimmick');
    }
  });

  it('says in each description what the effect does, with its numbers', () => {
    for (const k of dungeonKeepsakes) {
      for (const e of k.effects) {
        if (e.op === 'team_stat')
          expect(k.description, k.id).toContain(`${String(Math.abs(e.bp) / 100)}%`);
        if (e.op === 'foe_stat')
          expect(k.description, k.id).toContain(`${String(Math.abs(e.bp) / 100)}%`);
        if (e.op === 'team_crit')
          expect(k.description, k.id).toContain(`${String(e.chanceBp / 100)} points`);
      }
    }
  });

  it('gives every event two options and at least one that costs nothing', () => {
    for (const e of dungeonEvents) {
      expect(e.options, e.id).toHaveLength(2);
      expect(
        e.options.some((o) => !eventOptionCosts(o)),
        e.id,
      ).toBe(true);
    }
  });

  it('states every option exactly: the odds and the amounts in the words', () => {
    const pct = (bp: number): string => `${String(bp / 100)}%`;
    const words = (e: EventEffect): string[] => {
      switch (e.op) {
        case 'heal':
        case 'hurt':
          return [pct(e.bp)];
        case 'pack':
          return [e.bait, e.essence, e.scrap].filter((n) => n !== undefined).map(String);
        case 'gamble':
          return [
            pct(e.chanceBp),
            pct(10_000 - e.chanceBp),
            ...[...e.win, ...e.lose].flatMap(words),
          ];
        default:
          return [];
      }
    };
    for (const event of dungeonEvents) {
      for (const o of event.options) {
        for (const w of o.effects.flatMap(words)) {
          expect(o.description, `${event.id}: ${o.label}`).toContain(w);
        }
        if (
          o.effects.some(
            (e) =>
              e.op === 'keepsake' ||
              (e.op === 'gamble' && [...e.win, ...e.lose].some((x) => x.op === 'keepsake')),
          )
        ) {
          expect(o.description, event.id).toContain('keepsake');
        }
      }
    }
  });

  it('keeps risky options and safe ones about even (the average pack and HP they give)', () => {
    // A rough value: 1 Bait = 1, scrap = 1.5, Essence = 4, a keepsake = 2.5, 10% HP = 1 (for three creatures).
    const value = (e: EventEffect): number => {
      switch (e.op) {
        case 'pack':
          return (e.bait ?? 0) + 1.5 * (e.scrap ?? 0) + 4 * (e.essence ?? 0);
        case 'heal':
          return e.bp / 1000;
        case 'hurt':
          return -e.bp / 1000;
        case 'keepsake':
          return 2.5;
        case 'gamble': {
          const p = e.chanceBp / 10_000;
          return (
            p * e.win.reduce((a, x) => a + value(x), 0) +
            (1 - p) * e.lose.reduce((a, x) => a + value(x), 0)
          );
        }
        default:
          return 0;
      }
    };
    for (const event of dungeonEvents) {
      const [a, b] = event.options.map((o) => o.effects.reduce((sum, e) => sum + value(e), 0));
      expect(
        Math.abs((a ?? 0) - (b ?? 0)),
        `${event.id}: ${String(a)} vs ${String(b)}`,
      ).toBeLessThanOrEqual(2);
    }
  });

  it('fits the lengths of the design, and the glossary id of each fits too', () => {
    for (const k of dungeonKeepsakes) {
      expect(k.name.length).toBeLessThanOrEqual(32);
      expect(k.description.length).toBeLessThanOrEqual(90);
      expect(`keepsake-${k.id}`.length).toBeLessThanOrEqual(32);
    }
    for (const e of dungeonEvents) {
      expect(e.text.length).toBeLessThanOrEqual(160);
      expect(`event-${e.id}`.length).toBeLessThanOrEqual(32);
      for (const o of e.options) {
        expect(o.label.length).toBeLessThanOrEqual(24);
        expect(o.description.length).toBeLessThanOrEqual(90);
      }
    }
  });

  it('has enough events and keepsakes for a map and for a run', () => {
    expect(dungeonEvents.length).toBeGreaterThanOrEqual(RULES.dungeon.map.maxMysteries);
    expect(dungeonKeepsakes.length).toBeGreaterThan(RULES.dungeon.camp.offers + 3);
  });
});

describe('the keepsake and event schemas refuse bad data', () => {
  const refused = (k: unknown, e: unknown): void => expect(() => load(k, e)).toThrow(/Invalid/);

  it('a keepsake with a foe gimmick', () => {
    const k = keepsakes();
    (k[0] as Record<string, unknown>)['effects'] = [
      {
        op: 'foe_gimmick',
        gimmick: { id: 'x', name: 'X', trigger: { every: 2 }, op: 'silence_ends', turns: 1 },
      },
    ];
    refused(k, eventsJson);
  });

  it('a keepsake with no effects, four effects, an unknown key, a long name or a long line', () => {
    const edit = (change: (k: Record<string, unknown>) => void): Record<string, unknown>[] => {
      const k = keepsakes();
      change(k[0] as Record<string, unknown>);
      return k;
    };
    refused(
      edit((k) => (k['effects'] = [])),
      eventsJson,
    );
    refused(
      edit(
        (k) =>
          (k['effects'] = [1, 2, 3, 4].map((i) => ({
            op: 'team_stat',
            stat: 'atk',
            bp: 100,
            role: ['guard', 'setter', 'support', 'payoff'][i - 1],
          }))),
      ),
      eventsJson,
    );
    refused(
      edit((k) => (k['extra'] = 1)),
      eventsJson,
    );
    refused(
      edit((k) => (k['name'] = 'x'.repeat(33))),
      eventsJson,
    );
    refused(
      edit((k) => (k['description'] = 'x'.repeat(91))),
      eventsJson,
    );
    refused(
      edit((k) => (k['id'] = 'x'.repeat(24))),
      eventsJson,
    );
  });

  it('a duplicate id, or an id of a foe, a modifier or an event', () => {
    const dup = keepsakes();
    (dup[1] as Record<string, unknown>)['id'] = (dup[0] as { id: string }).id;
    refused(dup, eventsJson);
    const foeClash = keepsakes();
    (foeClash[0] as Record<string, unknown>)['id'] = 'puddle-imp';
    refused(foeClash, eventsJson);
    const modClash = keepsakes();
    (modClash[0] as Record<string, unknown>)['id'] = 'flooded';
    refused(modClash, eventsJson);
    const eventClash = events();
    (eventClash[0] as Record<string, unknown>)['id'] = (keepsakes()[0] as { id: string }).id;
    refused(keepsakesJson, eventClash);
  });

  it('an event with three options, or one', () => {
    const three = events();
    options(three).push(clone(options(three)[0] as Record<string, unknown>));
    refused(keepsakesJson, three);
    const one = events();
    options(one).pop();
    refused(keepsakesJson, one);
  });

  it('an event with over-long text, a long label or a long description', () => {
    const text = events();
    (text[0] as Record<string, unknown>)['text'] = 'x'.repeat(161);
    refused(keepsakesJson, text);
    const label = events();
    (options(label)[0] as Record<string, unknown>)['label'] = 'x'.repeat(25);
    refused(keepsakesJson, label);
    const description = events();
    (options(description)[0] as Record<string, unknown>)['description'] = 'x'.repeat(91);
    refused(keepsakesJson, description);
  });

  it('an event with no free option', () => {
    const hurt = { op: 'hurt', bp: 1000 };
    const risky = {
      op: 'gamble',
      chanceBp: 5000,
      win: [{ op: 'pack', bait: 1 }],
      lose: [hurt],
    };
    const costly = (a: unknown, b: unknown): Record<string, unknown>[] => {
      const e = events();
      (options(e)[0] as Record<string, unknown>)['effects'] = [a];
      (options(e)[1] as Record<string, unknown>)['effects'] = [b];
      return e;
    };
    refused(keepsakesJson, costly(hurt, hurt));
    refused(keepsakesJson, costly(risky, hurt));
    refused(keepsakesJson, costly(risky, risky));
    expect(() => load(keepsakesJson, costly(risky, { op: 'nothing' }))).not.toThrow();
  });

  it('a bad effect: nested gamble, empty pack, big numbers, bad chance, unknown op or key', () => {
    const withEffect = (effect: unknown): Record<string, unknown>[] => {
      const e = events();
      (options(e)[1] as Record<string, unknown>)['effects'] = [effect];
      return e;
    };
    const inner = {
      op: 'gamble',
      chanceBp: 5000,
      win: [{ op: 'nothing' }],
      lose: [{ op: 'nothing' }],
    };
    refused(
      keepsakesJson,
      withEffect({ op: 'gamble', chanceBp: 5000, win: [inner], lose: [{ op: 'nothing' }] }),
    );
    refused(keepsakesJson, withEffect({ op: 'pack' }));
    refused(keepsakesJson, withEffect({ op: 'pack', bait: 0 }));
    refused(keepsakesJson, withEffect({ op: 'pack', bait: 4 }));
    refused(keepsakesJson, withEffect({ op: 'pack', gold: 1 }));
    refused(keepsakesJson, withEffect({ op: 'heal', bp: 0 }));
    refused(keepsakesJson, withEffect({ op: 'heal', bp: 10_001 }));
    refused(keepsakesJson, withEffect({ op: 'hurt', bp: 5_001 }));
    refused(
      keepsakesJson,
      withEffect({
        op: 'gamble',
        chanceBp: 0,
        win: [{ op: 'nothing' }],
        lose: [{ op: 'nothing' }],
      }),
    );
    refused(
      keepsakesJson,
      withEffect({
        op: 'gamble',
        chanceBp: 10_000,
        win: [{ op: 'nothing' }],
        lose: [{ op: 'nothing' }],
      }),
    );
    refused(
      keepsakesJson,
      withEffect({ op: 'gamble', chanceBp: 5000, win: [], lose: [{ op: 'nothing' }] }),
    );
    refused(keepsakesJson, withEffect({ op: 'steal' }));
    refused(keepsakesJson, withEffect({ op: 'keepsake', extra: 1 }));
    refused(keepsakesJson, withEffect({ op: 'pack', bait: 1.5 }));
  });

  it('an option with two gambles', () => {
    const g = {
      op: 'gamble',
      chanceBp: 5000,
      win: [{ op: 'pack', bait: 1 }],
      lose: [{ op: 'nothing' }],
    };
    const e = events();
    (options(e)[1] as Record<string, unknown>)['effects'] = [g, g];
    refused(keepsakesJson, e);
  });

  it('not an array, or empty lists', () => {
    refused({}, eventsJson);
    refused(keepsakesJson, {});
    refused([], eventsJson);
    refused(keepsakesJson, []);
  });
});
